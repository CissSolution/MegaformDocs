// [PersonaBar v20260731-01] MegaForm inside the DNN Persona Bar.
//
// Route: /API/PersonaBar/MegaForm/{action} — Dnn.PersonaBar.UI discovers every
// PersonaBarApiController at startup, so this needs no IServiceRouteMapper of its own.
//
// SECURITY (Docs/SECURITY_CODING_RULES.md):
//  * Every action is gated by [MenuPermission] with Scope = Admin: DNN checks the caller
//    against the MegaForm menu's permission grid before the action runs. A plain
//    [DnnAuthorize] would let any authenticated user read every form in the portal.
//  * PortalId comes from PersonaBarApiController.PortalId (server-resolved from the
//    request's portal alias), never from the request body — a client-supplied portalId
//    here would be a cross-portal read.
//  * Reads are bounded: the page size is clamped server-side and pushed into SQL.
//  * Failures return a generic message; the exception text goes to the DNN event log only.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using Dnn.PersonaBar.Library;
using Dnn.PersonaBar.Library.Attributes;
using DotNetNuke.Common;
using DotNetNuke.Entities.Modules;
using DotNetNuke.Entities.Modules.Definitions;
using DotNetNuke.Entities.Tabs;
using DotNetNuke.Instrumentation;
using DotNetNuke.Web.Api;
using MegaForm.Core.Models;
using MegaForm.DNN.Data;
using MegaForm.PersonaBar.Components;

namespace MegaForm.PersonaBar.Services
{
    [MenuPermission(MenuName = "MegaForm", Scope = ServiceScope.Admin)]
    public class MegaFormController : PersonaBarApiController
    {
        private static readonly ILog Logger = LoggerSource.Instance.GetLogger(typeof(MegaFormController));

        /// <summary>Hard ceiling on rows per request — a client-supplied page size is never trusted.</summary>
        private const int MaxPageSize = 50;
        private const int DefaultPageSize = 20;

        /// <summary>Ceiling on the page picker; a large portal must not return every tab at once.</summary>
        private const int MaxPageCount = 200;

        private const string ModuleName = "MegaForm";

        /// <summary>
        /// Panes a form may be dropped into. Skins define their own names, but these four are the
        /// DNN conventions every stock skin ships; anything else would land the module in a pane
        /// that never renders.
        /// </summary>
        private static readonly HashSet<string> AllowedPanes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "ContentPane", "LeftPane", "RightPane", "BottomPane"
        };

        /// <summary>
        /// Stat tiles + whether the portal has a page the panel can hand off to.
        /// </summary>
        [HttpGet]
        public HttpResponseMessage GetDashboard()
        {
            try
            {
                var summary = MegaFormDashboardRepository.GetPortalSummary(PortalId);
                var host = MegaFormHostPageResolver.Resolve(PortalId);

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    forms = summary.Forms,
                    publishedForms = summary.PublishedForms,
                    submissions = summary.Submissions,
                    lastSubmissionUtc = summary.LastSubmissionUtc,
                    hasHostPage = host != null,
                    dashboardUrl = MegaFormHostPageResolver.BuildDashboardUrl(host),
                    newFormUrl = MegaFormHostPageResolver.BuildControlUrl(host, "Edit", 0),
                    maxPageSize = MaxPageSize
                });
            }
            catch (Exception ex)
            {
                Logger.Error("MegaForm Persona Bar: GetDashboard failed", ex);
                return Request.CreateErrorResponse(HttpStatusCode.InternalServerError,
                    "MegaForm could not read the portal summary.");
            }
        }

        /// <summary>
        /// One bounded page of forms. searchTerm/status narrow the query in SQL, so a portal
        /// with thousands of forms still answers in one indexed page read.
        /// </summary>
        [HttpGet]
        public HttpResponseMessage GetForms(string searchTerm = null, string status = null,
            int pageIndex = 0, int pageSize = DefaultPageSize)
        {
            try
            {
                if (pageIndex < 0) pageIndex = 0;
                if (pageSize <= 0) pageSize = DefaultPageSize;
                if (pageSize > MaxPageSize) pageSize = MaxPageSize;

                var search = string.IsNullOrWhiteSpace(searchTerm) ? null : searchTerm.Trim();
                var statusFilter = string.IsNullOrWhiteSpace(status) ? null : status.Trim();

                // Asks for one row more than the page so the panel knows whether a "next"
                // page exists without a second COUNT(*) over the filtered set.
                var forms = FormRepository.ListForms(PortalId, statusFilter, search, pageIndex, pageSize + 1)
                            ?? new List<FormInfo>();

                var hasMore = forms.Count > pageSize;
                if (hasMore) forms = forms.Take(pageSize).ToList();

                var counts = MegaFormDashboardRepository.GetSubmissionCounts(forms.Select(f => f.FormId).ToList());
                var host = MegaFormHostPageResolver.Resolve(PortalId);

                var items = forms.Select(f => new
                {
                    formId = f.FormId,
                    title = string.IsNullOrWhiteSpace(f.Title) ? ("Form #" + f.FormId) : f.Title,
                    status = string.IsNullOrWhiteSpace(f.Status) ? "Draft" : f.Status,
                    fields = MegaFormSchemaSummary.CountFields(f.SchemaJson),
                    submissions = counts.ContainsKey(f.FormId) ? counts[f.FormId] : 0,
                    modifiedUtc = f.UpdatedOnUtc ?? f.CreatedOnUtc,
                    builderUrl = MegaFormHostPageResolver.BuildControlUrl(host, "Edit", f.FormId),
                    submissionsUrl = MegaFormHostPageResolver.BuildSubmissionsUrl(host, f.FormId)
                }).ToArray();

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    items,
                    pageIndex,
                    pageSize,
                    hasMore
                });
            }
            catch (Exception ex)
            {
                Logger.Error("MegaForm Persona Bar: GetForms failed", ex);
                return Request.CreateErrorResponse(HttpStatusCode.InternalServerError,
                    "MegaForm could not read the form list.");
            }
        }

        /// <summary>
        /// Pages of THIS portal a form can be dropped onto.
        /// </summary>
        /// <remarks>
        /// The Persona Bar cannot drag a form onto the page: its panel is an iframe overlay that
        /// covers the page while it is open, and DNN's drag-a-module-onto-a-pane lives in the Edit
        /// Bar, not here. Picking a page and letting the server place the module reaches the same
        /// end state in one click.
        /// </remarks>
        [HttpGet]
        public HttpResponseMessage GetPages(string searchTerm = null, int pageSize = 100)
        {
            try
            {
                if (pageSize <= 0 || pageSize > MaxPageCount) pageSize = MaxPageCount;
                var search = (searchTerm ?? string.Empty).Trim();

                var pages = TabController.Instance.GetTabsByPortal(PortalId).Values
                    .Where(t => IsAllowedPlacementTab(t))
                    .Where(t => search.Length == 0 ||
                                (t.TabName ?? string.Empty).IndexOf(search, StringComparison.OrdinalIgnoreCase) >= 0 ||
                                (t.TabPath ?? string.Empty).IndexOf(search, StringComparison.OrdinalIgnoreCase) >= 0)
                    .OrderBy(t => t.TabPath, StringComparer.OrdinalIgnoreCase)
                    .Take(pageSize)
                    .Select(t => new
                    {
                        tabId = t.TabID,
                        name = t.TabName,
                        path = (t.TabPath ?? string.Empty).Replace("//", " / ").Trim(' ', '/')
                    })
                    .ToArray();

                return Request.CreateResponse(HttpStatusCode.OK, new { pages, pageSize });
            }
            catch (Exception ex)
            {
                Logger.Error("MegaForm Persona Bar: GetPages failed", ex);
                return Request.CreateErrorResponse(HttpStatusCode.InternalServerError,
                    "MegaForm could not read the page list.");
            }
        }

        /// <summary>Drops a MegaForm module onto a page and binds it to the chosen form.</summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage AddToPage(AddToPageRequest request)
        {
            try
            {
                if (request == null || request.FormId <= 0 || request.TabId <= 0)
                    return Request.CreateErrorResponse(HttpStatusCode.BadRequest, "A form and a page are required.");

                // IDOR guards. Both ids arrive from the client, so both are re-checked against
                // the portal this request resolved to — never trusted as given.
                var tab = TabController.Instance.GetTab(request.TabId, PortalId, false);
                if (tab == null || tab.IsDeleted)
                    return Request.CreateErrorResponse(HttpStatusCode.NotFound, "That page is not in this site.");
                if (!IsAllowedPlacementTab(tab))
                    return Request.CreateErrorResponse(HttpStatusCode.BadRequest,
                        "MegaForm cannot place forms on system, login, registration, or error pages.");

                var form = FormRepository.GetForm(request.FormId);
                if (form == null || form.PortalId != PortalId)
                    return Request.CreateErrorResponse(HttpStatusCode.NotFound, "That form is not in this site.");

                var desktopModule = DesktopModuleController.GetDesktopModuleByModuleName(ModuleName, PortalId);
                if (desktopModule == null)
                    return Request.CreateErrorResponse(HttpStatusCode.InternalServerError,
                        "The MegaForm module is not installed on this site.");

                var definition = ModuleDefinitionController
                    .GetModuleDefinitionsByDesktopModuleID(desktopModule.DesktopModuleID)
                    .Values.FirstOrDefault();
                if (definition == null)
                    return Request.CreateErrorResponse(HttpStatusCode.InternalServerError,
                        "The MegaForm module has no module definition.");

                // Pane names are skin-defined; anything outside the known set would place the
                // module into a pane the skin never renders.
                var pane = (request.Pane ?? string.Empty).Trim();
                if (pane.Length == 0 || !AllowedPanes.Contains(pane)) pane = "ContentPane";

                var module = new ModuleInfo();
                module.Initialize(PortalId);
                module.PortalID = PortalId;
                module.TabID = tab.TabID;
                module.ModuleOrder = -1;          // append to the bottom of the pane
                module.PaneName = pane;
                module.ModuleTitle = string.IsNullOrWhiteSpace(form.Title) ? "MegaForm" : form.Title;
                module.DesktopModuleID = desktopModule.DesktopModuleID;
                module.ModuleDefID = definition.ModuleDefID;
                module.InheritViewPermissions = true;
                module.AllTabs = false;
                module.Alignment = string.Empty;

                var moduleId = ModuleController.Instance.AddModule(module);
                if (moduleId <= 0)
                    return Request.CreateErrorResponse(HttpStatusCode.InternalServerError,
                        "MegaForm could not add the module to that page.");

                // Same three settings the module's own "Manage module" screen writes, so the
                // instance is fully configured and renders the form on first view.
                ModuleController.Instance.UpdateModuleSetting(moduleId, "MegaForm_FormId", form.FormId.ToString());
                ModuleController.Instance.UpdateModuleSetting(moduleId, "MegaForm_ModuleMode", "render");
                ModuleController.Instance.UpdateModuleSetting(moduleId, "MegaForm_ModuleConfigured", "true");

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    moduleId,
                    tabId = tab.TabID,
                    pane,
                    pageName = tab.TabName,
                    pageUrl = Globals.NavigateURL(tab.TabID)
                });
            }
            catch (Exception ex)
            {
                Logger.Error("MegaForm Persona Bar: AddToPage failed", ex);
                return Request.CreateErrorResponse(HttpStatusCode.InternalServerError,
                    "MegaForm could not add the form to that page.");
            }
        }

        /// <summary>Body of <see cref="AddToPage"/>.</summary>
        public class AddToPageRequest
        {
            public int FormId { get; set; }
            public int TabId { get; set; }
            public string Pane { get; set; }
        }

        private static bool IsAllowedPlacementTab(TabInfo tab)
        {
            if (tab == null || tab.IsDeleted || tab.DisableLink || tab.IsSystem) return false;

            var label = ((tab.TabName ?? string.Empty) + " " + (tab.TabPath ?? string.Empty)).ToLowerInvariant();
            if (label.Contains("404") || label.Contains("500") || label.Contains("error page")) return false;
            if (label.Contains("login") || label.Contains("register") || label.Contains("registration")) return false;

            return true;
        }
    }
}
