using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Web.Api;
using MegaForm.DNN.Data;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Core.ViewModes;
using MegaForm.DNN.Services;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    /// <summary>
    /// Phase 2 API: Views, Templates, Permissions, Workflows.
    /// </summary>
    // [v20260527-10] Class-level [DnnAuthorize(Administrators)] replaces the
    // per-action [DnnModuleAuthorize(Edit)] guards. DnnModuleAuthorize
    // resolves the active module via TabId/ModuleId headers; those headers
    // are now dropped client-side because DNN's framework cross-checks them
    // against the alias-resolved portal and 400s "Specified page is not in
    // this site" whenever the page is in a child-portal subpath alias
    // (e.g. /megaf). Server reads explicit portalId from ?portalId=N
    // via ResolveTargetPortalId().
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class Phase2ApiController : DnnApiController
    {
        /// <summary>
        /// Mirrors FormController.ResolveTargetPortalId — honor explicit
        /// ?portalId=N from JS on multi-portal sites where the AJAX URL is
        /// root-relative but the caller is rendered in a child-portal
        /// subpath alias. Cross-portal only allowed for SuperUser / Admin.
        /// </summary>
        private int ResolveTargetPortalId()
        {
            // [StackOverflowFix v20260529-02] Was: `PortalSettings != null ? ResolveTargetPortalId() : 0`.
            // The fallback called the SAME method recursively with no base case,
            // so any /Phase2/PinnedPages request (Dashboard polls it on load)
            // unwound the stack until w3wp crashed with 0xc00000fd. The pool got
            // stuck in Stopping for ~1h after each hit because the worker held
            // locks while the OS waited on the unhandled SO. Use PortalId directly.
            var fallback = PortalSettings != null ? PortalSettings.PortalId : 0;
            try
            {
                var query = Request != null && Request.RequestUri != null
                    ? Request.RequestUri.ParseQueryString()
                    : null;
                if (query == null) return fallback;
                var raw = query["portalId"] ?? query["portalid"] ?? query["PortalId"];
                int pid;
                if (string.IsNullOrEmpty(raw) || !int.TryParse(raw, out pid) || pid < 0) return fallback;
                if (pid == fallback) return fallback;
                var caller = UserInfo;
                var allowed = caller != null && (caller.IsSuperUser || caller.IsInRole("Administrators"));
                return allowed ? pid : fallback;
            }
            catch { return fallback; }
        }

        private UserContext CurrentUser
        {
            get
            {
                string ip = "";
                if (Request.Properties.ContainsKey("MS_HttpContext"))
                {
                    var ctx = Request.Properties["MS_HttpContext"] as System.Web.HttpContextWrapper;
                    ip = ctx?.Request?.UserHostAddress ?? "";
                }
                return new UserContext
                {
                    UserId = UserInfo.UserID,
                    UserName = UserInfo.Username,
                    DisplayName = UserInfo.DisplayName,
                    Email = UserInfo.Email,
                    IsAuthenticated = UserInfo.UserID > 0,
                    IsAdmin = UserInfo.IsInRole("Administrators"),
                    IsSuperUser = UserInfo.IsSuperUser,
                    Roles = UserInfo.Roles?.ToList() ?? new List<string>(),
                    IpAddress = ip
                };
            }
        }

        /// <summary>Helper to create audit log entries.</summary>
        private static AuditLogInfo CreateAudit(UserContext user, string action, string entityType,
            int? entityId = null, int? formId = null, string details = null)
        {
            return new AuditLogInfo
            {
                Timestamp = DateTime.UtcNow,
                UserId = user.UserId,
                UserName = user.UserName,
                IpAddress = user.IpAddress,
                Action = action,
                EntityType = entityType,
                EntityId = entityId,
                FormId = formId,
                Details = details
            };
        }

        private string Request_GetIPAddress()
        {
            if (Request.Properties.ContainsKey("MS_HttpContext"))
            {
                var ctx = Request.Properties["MS_HttpContext"] as System.Web.HttpContextWrapper;
                return ctx?.Request?.UserHostAddress ?? "";
            }
            return "";
        }

        /// <summary>
        /// [v20260528-14] POST /api/MegaForm/Phase2/PinToNewPage
        /// Body: { portalId, parentTabId?, tabName, formId?, viewKey?, surface?, inboxAppScope?, inboxFormId? }
        /// Creates a new DNN page (Tab) under <c>parentTabId</c> (or root if 0),
        /// adds a MegaForm module to its ContentPane, and pins
        /// MegaForm_FormId / MegaForm_CustomViewKey / MegaForm_ModuleMode='render' /
        /// MegaForm_InboxAppScope / MegaForm_InboxFormId / MegaForm_PageSurface
        /// in one shot. Returns the new tab URL so the dashboard wizard
        /// can redirect the admin to the clean canonical URL.
        /// </summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("PinToNewPage")]
        public HttpResponseMessage PinToNewPage([FromBody] JObject body)
        {
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });
            var portalId = ResolveTargetPortalId();
            var tabName = (body.Value<string>("tabName") ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(tabName)) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "tabName required" });
            var parentTabId = body.Value<int?>("parentTabId") ?? 0;
            var formId      = body.Value<int?>("formId") ?? 0;
            var viewKey     = (body.Value<string>("viewKey") ?? string.Empty).Trim();
            var surface     = (body.Value<string>("surface") ?? string.Empty).Trim().ToLowerInvariant();
            var inboxApp    = (body.Value<string>("inboxAppScope") ?? string.Empty).Trim();
            var inboxFid    = body.Value<int?>("inboxFormId") ?? 0;
            if (!string.IsNullOrEmpty(inboxApp) && inboxFid > 0) inboxFid = 0; // mutex
            var allowed = new System.Collections.Generic.HashSet<string>(System.StringComparer.OrdinalIgnoreCase)
            {
                string.Empty, "render", "builder", "dashboard", "submissions", "theme", "languages"
            };
            if (!allowed.Contains(surface)) surface = string.Empty;

            try
            {
                var tabCtrl = DotNetNuke.Entities.Tabs.TabController.Instance;
                var newTab = new DotNetNuke.Entities.Tabs.TabInfo
                {
                    PortalID = portalId,
                    TabName = tabName,
                    Title = tabName,
                    Description = string.Empty,
                    ParentId = parentTabId > 0 ? parentTabId : DotNetNuke.Common.Utilities.Null.NullInteger,
                    IsVisible = true,
                    DisableLink = false,
                    StartDate = DotNetNuke.Common.Utilities.Null.NullDate,
                    EndDate = DotNetNuke.Common.Utilities.Null.NullDate,
                    SkinSrc = string.Empty,
                    ContainerSrc = string.Empty,
                    Url = string.Empty,
                };
                var newTabId = tabCtrl.AddTab(newTab);
                if (newTabId <= 0) return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = "Failed to create tab" });

                // Look up the MegaForm module definition + ContentPane.
                var mdc = DotNetNuke.Entities.Modules.Definitions.ModuleDefinitionController.GetModuleDefinitionByFriendlyName("MegaForm");
                if (mdc == null) return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = "MegaForm module definition not found" });

                var newModule = new DotNetNuke.Entities.Modules.ModuleInfo
                {
                    PortalID = portalId,
                    TabID = newTabId,
                    ModuleDefID = mdc.ModuleDefID,
                    ModuleTitle = tabName,
                    PaneName = "ContentPane",
                    InheritViewPermissions = true,
                    DisplayTitle = false,
                };
                var newModuleId = DotNetNuke.Entities.Modules.ModuleController.Instance.AddModule(newModule);
                if (newModuleId <= 0) return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = "Failed to add module" });

                var mc = new DotNetNuke.Entities.Modules.ModuleController();
                mc.UpdateModuleSetting(newModuleId, "MegaForm_ModuleMode",      "render");
                mc.UpdateModuleSetting(newModuleId, "MegaForm_ModuleConfigured", "true");
                if (formId > 0)             mc.UpdateModuleSetting(newModuleId, "MegaForm_FormId",          formId.ToString());
                if (!string.IsNullOrEmpty(viewKey))  mc.UpdateModuleSetting(newModuleId, "MegaForm_CustomViewKey",  viewKey);
                if (!string.IsNullOrEmpty(surface))  mc.UpdateModuleSetting(newModuleId, "MegaForm_PageSurface",    surface);
                if (!string.IsNullOrEmpty(inboxApp)) mc.UpdateModuleSetting(newModuleId, "MegaForm_InboxAppScope",  inboxApp);
                if (inboxFid > 0)           mc.UpdateModuleSetting(newModuleId, "MegaForm_InboxFormId",     inboxFid.ToString());

                var freshTab = tabCtrl.GetTab(newTabId, portalId);
                var slug = (freshTab != null ? (freshTab.TabPath ?? string.Empty) : string.Empty).Replace("//", "/");
                if (string.IsNullOrEmpty(slug)) slug = "/" + tabName;
                return Request.CreateResponse(HttpStatusCode.OK, new { tabId = newTabId, moduleId = newModuleId, tabUrl = slug });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = "Pin-to-new-page failed", detail = ex.Message });
            }
        }

        /// <summary>
        /// [v20260528-14] GET /api/MegaForm/Phase2/PinnedPages?portalId=N
        /// Returns every DNN page (Tab) in the current portal that hosts a
        /// MegaForm module pinned to a specific formId / viewKey / inbox
        /// scope / page surface. Dashboard uses this to rewrite the per-app
        /// and per-form "Open App / Data" buttons to land on the clean
        /// pinned URL (e.g. /megaf/Blog/Editorial) instead of falling back
        /// to the legacy `?mfFormId=…&vk=…` query string.
        /// </summary>
        [HttpGet]
        [ActionName("PinnedPages")]
        public HttpResponseMessage PinnedPages()
        {
            var portalId = ResolveTargetPortalId();
            var mc = new DotNetNuke.Entities.Modules.ModuleController();
            var tc = new DotNetNuke.Entities.Tabs.TabController();
            var modules = mc.GetModules(portalId);
            var result = new List<object>();
            foreach (DotNetNuke.Entities.Modules.ModuleInfo m in modules)
            {
                try
                {
                    if (m == null || m.IsDeleted) continue;
                    var defName = m.DesktopModule != null ? m.DesktopModule.ModuleName : null;
                    if (!string.Equals(defName, "MegaForm", StringComparison.OrdinalIgnoreCase)) continue;
                    var s = m.ModuleSettings;
                    if (s == null) continue;
                    int formId = 0;
                    if (s.ContainsKey("MegaForm_FormId")) int.TryParse(Convert.ToString(s["MegaForm_FormId"]), out formId);
                    var viewKey  = s.ContainsKey("MegaForm_CustomViewKey") ? Convert.ToString(s["MegaForm_CustomViewKey"]) : string.Empty;
                    var surface  = s.ContainsKey("MegaForm_PageSurface")    ? Convert.ToString(s["MegaForm_PageSurface"])    : string.Empty;
                    var inboxApp = s.ContainsKey("MegaForm_InboxAppScope")  ? Convert.ToString(s["MegaForm_InboxAppScope"])  : string.Empty;
                    int inboxFid = 0;
                    if (s.ContainsKey("MegaForm_InboxFormId")) int.TryParse(Convert.ToString(s["MegaForm_InboxFormId"]), out inboxFid);
                    // A "pinned" page is one whose module instance has at least one of these set.
                    if (formId <= 0 && string.IsNullOrEmpty(surface) && string.IsNullOrEmpty(inboxApp) && inboxFid <= 0) continue;
                    var tab = tc.GetTab(m.TabID, portalId);
                    if (tab == null || tab.IsDeleted || tab.DisableLink) continue;
                    // TabPath is like "//Blog/Editorial" — strip the leading "//" and replace inner "//" with "/".
                    var slug = (tab.TabPath ?? string.Empty).Replace("//", "/");
                    if (string.IsNullOrEmpty(slug)) slug = "/";
                    result.Add(new
                    {
                        moduleId = m.ModuleID,
                        tabId    = m.TabID,
                        tabName  = tab.TabName,
                        tabUrl   = slug,
                        formId,
                        viewKey,
                        surface,
                        inboxAppScope = inboxApp,
                        inboxFormId   = inboxFid,
                    });
                }
                catch { /* skip module on any read error */ }
            }
            return Request.CreateResponse(HttpStatusCode.OK, result);
        }

        private static object BuildAppSummary(AppDefinitionBundle bundle)
        {
            if (bundle?.App == null) return null;
            return new
            {
                appId = bundle.App.AppId,
                appKey = bundle.App.AppKey,
                appName = bundle.App.AppName,
                appScope = bundle.App.AppScope
            };
        }

        // ============================================================
        // VIEWS API
        // ============================================================

        [HttpGet]
        [ActionName("View/List")]
        public HttpResponseMessage ViewList()
        {
            int formId = int.Parse(Request.GetQueryNameValuePairs().FirstOrDefault(p => p.Key == "formId").Value ?? "0");
            int page = int.Parse(Request.GetQueryNameValuePairs().FirstOrDefault(p => p.Key == "page").Value ?? "1");
            int pageSize = int.Parse(Request.GetQueryNameValuePairs().FirstOrDefault(p => p.Key == "pageSize").Value ?? "20");
            string sort = Request.GetQueryNameValuePairs().FirstOrDefault(p => p.Key == "sort").Value ?? "SubmittedOnUtc";
            string dir = Request.GetQueryNameValuePairs().FirstOrDefault(p => p.Key == "dir").Value ?? "desc";
            string search = Request.GetQueryNameValuePairs().FirstOrDefault(p => p.Key == "search").Value;

            if (formId == 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId required" });

            var result = FormRepository.ListSubmissions(formId, null, search, null, null, page - 1, pageSize);

            var items = result.Items.Select(s => new
            {
                id = s.SubmissionId,
                data = s.DataJson,
                status = s.Status,
                submittedOn = s.SubmittedOnUtc.ToString("o"),
                userId = s.UserId
            });

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                items = items,
                total = result.TotalCount,
                page = page,
                pageSize = pageSize
            });
        }

        [HttpGet]
        [ActionName("View/Detail")]
        public HttpResponseMessage ViewDetail()
        {
            int id = int.Parse(Request.GetQueryNameValuePairs().FirstOrDefault(p => p.Key == "id").Value ?? "0");
            if (id == 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "id required" });

            var sub = FormRepository.GetSubmission(id);
            if (sub == null) return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Not found" });

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                id = sub.SubmissionId,
                formId = sub.FormId,
                data = sub.DataJson,
                status = sub.Status,
                submittedOn = sub.SubmittedOnUtc.ToString("o")
            });
        }

        [HttpGet]
        [ActionName("GetViewConfigs")]
        public HttpResponseMessage GetViewConfigs()
        {
            int formId = int.Parse(Request.GetQueryNameValuePairs().FirstOrDefault(p => p.Key == "formId").Value ?? "0");
            if (formId == 0) return Request.CreateResponse(HttpStatusCode.BadRequest);

            var views = FormRepository.GetFormViews(formId);
            var form = FormRepository.GetForm(formId);
            var appDefinitions = new AppDefinitionService(DnnServiceLocator.Instance.Phase2Repo, DnnServiceLocator.Instance.FormRepo, new AppProfileService());
            var appQueries = new AppQueryRegistryService(DnnServiceLocator.Instance.Phase2Repo, DnnServiceLocator.Instance.FormRepo, appDefinitions);
            var bundle = form == null ? null : appDefinitions.GetByScope(form.PortalId, form.AppScope, hydrateManifest: false);
            var queries = form == null ? new List<AppQueryDefinitionInfo>() : appQueries.ListForForm(form.PortalId, form.FormId);

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                views = views,
                app = BuildAppSummary(bundle),
                queries = queries
            });
        }

        [HttpPost]
        [ActionName("SaveViewConfig")]
        public HttpResponseMessage SaveView([FromBody] FormViewInfo view)
        {
            if (view == null || view.FormId == 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Invalid view data" });

            var existingViews = FormRepository.GetFormViews(view.FormId) ?? new List<FormViewInfo>();
            var validation = FormViewSelector.ValidateAndNormalizeForSave(view, existingViews);
            if (!validation.IsValid || validation.View == null)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = validation.Error ?? "Invalid view data" });

            var form = FormRepository.GetForm(validation.View.FormId);
            var appDefinitions = new AppDefinitionService(DnnServiceLocator.Instance.Phase2Repo, DnnServiceLocator.Instance.FormRepo, new AppProfileService());
            var appQueries = new AppQueryRegistryService(DnnServiceLocator.Instance.Phase2Repo, DnnServiceLocator.Instance.FormRepo, appDefinitions);
            var queryValidation = appQueries.ValidateBinding(form != null ? form.PortalId : 0, form, validation.View.QueryKey);
            if (!queryValidation.IsValid)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = queryValidation.Error ?? "Invalid query binding" });

            validation.View.QueryKey = queryValidation.NormalizedQueryKey ?? string.Empty;

            int viewId = FormRepository.SaveFormView(validation.View);

            FormRepository.InsertAuditLog(CreateAudit(
                CurrentUser, "save_view", "view", viewId, validation.View.FormId));

            return Request.CreateResponse(HttpStatusCode.OK, new { viewId = viewId });
        }

        [HttpPost]
        [ActionName("DeleteViewConfig")]
        public HttpResponseMessage DeleteView([FromUri] int? viewId = null, [FromBody] FormViewDeleteRequest body = null)
        {
            int id = viewId.GetValueOrDefault();
            if (id == 0) id = body?.ViewId ?? 0;
            if (id == 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "viewId required" });

            FormRepository.DeleteFormView(id);
            return Request.CreateResponse(HttpStatusCode.OK, new { success = true });
        }

        // ============================================================
        // TEMPLATES API
        // ============================================================

        [HttpGet]
        [ActionName("Templates/List")]
        public HttpResponseMessage ListTemplates()
        {
            string category = Request.GetQueryNameValuePairs().FirstOrDefault(p => p.Key == "category").Value;
            var templates = FormRepository.ListTemplates(ResolveTargetPortalId(), category);
            return Request.CreateResponse(HttpStatusCode.OK, new { templates = templates });
        }

        [HttpPost]
        [ActionName("Templates/Install")]
        public HttpResponseMessage InstallTemplate()
        {
            var httpRequest = System.Web.HttpContext.Current.Request;
            if (httpRequest.Files.Count == 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "No file uploaded" });

            var file = httpRequest.Files[0];
            if (!file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "ZIP file required" });

            string modulePath = System.Web.Hosting.HostingEnvironment.MapPath("~/DesktopModules/MegaForm");
            var service = new TemplatePackageService(modulePath);

            var result = service.InstallFromZip(file.InputStream, ResolveTargetPortalId(), UserInfo.UserID);

            if (!result.Success)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    error = result.Error,
                    scanResult = result.JsScanResult
                });

            // Save to DB
            int tplId = FormRepository.SaveTemplate(result.Template);

            FormRepository.InsertAuditLog(CreateAudit(
                CurrentUser, "install_template", "template", tplId, details: result.Slug));

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                slug = result.Slug,
                templateId = tplId,
                scanResult = result.JsScanResult
            });
        }

        [HttpPost]
        [ActionName("Templates/Export")]
        public HttpResponseMessage ExportTemplate([FromBody] JObject body)
        {
            int formId = body?["formId"]?.ToObject<int>() ?? 0;
            if (formId == 0) return Request.CreateResponse(HttpStatusCode.BadRequest);

            var form = FormRepository.GetForm(formId);
            if (form == null) return Request.CreateResponse(HttpStatusCode.NotFound);

            FormSchema schema = null;
            try { schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson); }
            catch { return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = "Invalid schema" }); }

            string modulePath = System.Web.Hosting.HostingEnvironment.MapPath("~/DesktopModules/MegaForm");
            var service = new TemplatePackageService(modulePath);
            byte[] zipBytes = service.ExportToZip(form, schema, modulePath);

            string slug = System.Text.RegularExpressions.Regex.Replace(form.Title.ToLower(), @"[^a-z0-9]+", "-").Trim('-');

            var response = new HttpResponseMessage(HttpStatusCode.OK);
            response.Content = new ByteArrayContent(zipBytes);
            response.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/zip");
            response.Content.Headers.ContentDisposition = new System.Net.Http.Headers.ContentDispositionHeaderValue("attachment")
            {
                FileName = $"megaform-{slug}.zip"
            };
            return response;
        }

        [HttpPost]
        [ActionName("Templates/Delete")]
        public HttpResponseMessage DeleteTemplate([FromBody] JObject body)
        {
            string slug = body?["slug"]?.ToString();
            if (string.IsNullOrEmpty(slug))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "slug required" });

            // Delete files
            string modulePath = System.Web.Hosting.HostingEnvironment.MapPath("~/DesktopModules/MegaForm");
            string tplDir = Path.Combine(modulePath, "Templates", slug);
            if (Directory.Exists(tplDir))
                Directory.Delete(tplDir, true);

            // Delete DB record
            FormRepository.DeleteTemplate(ResolveTargetPortalId(), slug);

            FormRepository.InsertAuditLog(CreateAudit(
                CurrentUser, "delete_template", "template", details: slug));

            return Request.CreateResponse(HttpStatusCode.OK, new { success = true });
        }

        [HttpPost]
        [ActionName("Templates/Validate")]
        public HttpResponseMessage ValidateTemplate()
        {
            var httpRequest = System.Web.HttpContext.Current.Request;
            if (httpRequest.Files.Count == 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "No file" });

            string modulePath = System.Web.Hosting.HostingEnvironment.MapPath("~/DesktopModules/MegaForm");
            var service = new TemplatePackageService(modulePath);

            // Just scan, don't install
            var jsContent = "";
            var file = httpRequest.Files[0];
            // Read JS from zip if present
            using (var archive = new System.IO.Compression.ZipArchive(file.InputStream, System.IO.Compression.ZipArchiveMode.Read))
            {
                var jsEntry = archive.Entries.FirstOrDefault(e => e.Name == "template.js");
                if (jsEntry != null)
                {
                    using (var reader = new StreamReader(jsEntry.Open()))
                        jsContent = reader.ReadToEnd();
                }
            }

            var scanResult = service.ScanJavaScript(jsContent);
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                valid = scanResult.Passed,
                violations = scanResult.Violations
            });
        }

        // ============================================================
        // PERMISSIONS API
        // ============================================================

        [HttpGet]
        [ActionName("Permissions/Get")]
        public HttpResponseMessage GetPermissions()
        {
            int formId = int.Parse(Request.GetQueryNameValuePairs().FirstOrDefault(p => p.Key == "formId").Value ?? "0");
            if (formId == 0) return Request.CreateResponse(HttpStatusCode.BadRequest);

            var perms = PermissionCatalogService.NormalizeRules(formId, FormRepository.GetFormPermissions(formId));
            return Request.CreateResponse(HttpStatusCode.OK, new { permissions = perms });
        }

        [HttpGet]
        [ActionName("Permissions/Catalog")]
        public HttpResponseMessage GetPermissionsCatalog()
        {
            int formId = int.Parse(Request.GetQueryNameValuePairs().FirstOrDefault(p => p.Key == "formId").Value ?? "0");
            if (formId == 0) return Request.CreateResponse(HttpStatusCode.BadRequest);

            var perms = PermissionCatalogService.NormalizeRules(formId, FormRepository.GetFormPermissions(formId));
            var provider = new DnnPermissionPrincipalCatalogProvider(ResolveTargetPortalId());
            var service = new PermissionCatalogService(provider);
            var catalog = service.GetCatalog(formId, ResolveTargetPortalId(), CurrentUser);
            return Request.CreateResponse(HttpStatusCode.OK, new { permissions = perms, catalog = catalog });
        }

        [HttpPost]
        [ActionName("Permissions/Save")]
        public HttpResponseMessage SavePermissions([FromBody] JObject body)
        {
            int formId = body?["formId"]?.ToObject<int>() ?? 0;
            var perms = body?["permissions"]?.ToObject<List<FormPermissionInfo>>() ?? new List<FormPermissionInfo>();

            if (formId == 0) return Request.CreateResponse(HttpStatusCode.BadRequest);

            var normalized = PermissionCatalogService.NormalizeRules(formId, perms);
            FormRepository.SaveFormPermissions(formId, normalized);

            FormRepository.InsertAuditLog(CreateAudit(
                CurrentUser, "update_permissions", "form", formId, formId,
                $"{normalized.Count} permission rules"));

            return Request.CreateResponse(HttpStatusCode.OK, new { success = true, permissions = normalized });
        }

        // ============================================================
        // WORKFLOWS API
        // ============================================================

        [HttpGet]
        [ActionName("Workflows/List")]
        public HttpResponseMessage ListWorkflows()
        {
            int formId = int.Parse(Request.GetQueryNameValuePairs().FirstOrDefault(p => p.Key == "formId").Value ?? "0");
            if (formId == 0) return Request.CreateResponse(HttpStatusCode.BadRequest);

            var workflows = FormRepository.GetWorkflows(formId);
            return Request.CreateResponse(HttpStatusCode.OK, new { workflows = workflows });
        }

        [HttpPost]
        [ActionName("Workflows/Save")]
        public HttpResponseMessage SaveWorkflow([FromBody] WorkflowInfo wf)
        {
            if (wf == null || wf.FormId == 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Invalid workflow" });

            wf.CreatedByUserId = UserInfo.UserID;
            int wfId = FormRepository.SaveWorkflow(wf);

            FormRepository.InsertAuditLog(CreateAudit(
                CurrentUser, "save_workflow", "workflow", wfId, wf.FormId, wf.WorkflowName));

            return Request.CreateResponse(HttpStatusCode.OK, new { workflowId = wfId });
        }

        [HttpPost]
        [ActionName("Workflows/Delete")]
        public HttpResponseMessage DeleteWorkflow([FromBody] JObject body)
        {
            int wfId = body?["workflowId"]?.ToObject<int>() ?? 0;
            if (wfId == 0) return Request.CreateResponse(HttpStatusCode.BadRequest);

            FormRepository.DeleteWorkflow(wfId);

            FormRepository.InsertAuditLog(CreateAudit(
                CurrentUser, "delete_workflow", "workflow", wfId));

            return Request.CreateResponse(HttpStatusCode.OK, new { success = true });
        }

        [HttpPost]
        [ActionName("Workflows/Test")]
        public HttpResponseMessage TestWorkflow([FromBody] JObject body)
        {
            int wfId = body?["workflowId"]?.ToObject<int>() ?? 0;
            var testData = body?["testData"]?.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();

            if (wfId == 0) return Request.CreateResponse(HttpStatusCode.BadRequest);

            var workflows = FormRepository.GetWorkflows(0); // need formId
            // For test, directly load the workflow
            WorkflowInfo wf = null;
            using (var conn = new System.Data.SqlClient.SqlConnection(DotNetNuke.Common.Utilities.Config.GetConnectionString()))
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT * FROM MF_Workflows WHERE WorkflowId=@Id";
                    cmd.Parameters.AddWithValue("@Id", wfId);
                    using (var r = cmd.ExecuteReader())
                    {
                        if (r.Read())
                        {
                            wf = new WorkflowInfo
                            {
                                WorkflowId = (int)r["WorkflowId"],
                                FormId = (int)r["FormId"],
                                WorkflowName = r["WorkflowName"].ToString(),
                                StepsJson = r["StepsJson"].ToString(),
                                TriggerType = r["TriggerType"].ToString()
                            };
                        }
                    }
                }
            }

            if (wf == null) return Request.CreateResponse(HttpStatusCode.NotFound);

            var result = DnnServiceLocator.Instance.Workflow.ExecuteWorkflowAsync(wf, 0, testData).Result;

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                status = result.Status,
                error = result.Error,
                steps = result.StepResults
            });
        }

        // ── Workflow/Get — reads WorkflowJson from MF_Forms ─────────────────
        [HttpGet]
        [ActionName("Workflow/Get")]
        public HttpResponseMessage WorkflowGet()
        {
            int formId = 0;
            foreach (var kv in Request.GetQueryNameValuePairs())
                if (string.Equals(kv.Key, "formId", StringComparison.OrdinalIgnoreCase))
                { int.TryParse(kv.Value, out formId); break; }

            if (formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId required" });

            string workflowJson = null;
            using (var conn = new System.Data.SqlClient.SqlConnection(
                       DotNetNuke.Common.Utilities.Config.GetConnectionString()))
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT WorkflowJson FROM MF_Forms WHERE FormId=@Id";
                    cmd.Parameters.AddWithValue("@Id", formId);
                    var val = cmd.ExecuteScalar();
                    if (val != null && val != DBNull.Value)
                        workflowJson = val.ToString();
                }
            }

            object workflow = null;
            if (!string.IsNullOrWhiteSpace(workflowJson))
                try { workflow = JsonConvert.DeserializeObject(workflowJson); } catch { }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                formId,
                hasWorkflow = workflow != null,
                workflow
            });
        }

        // ── Workflow/Save — writes WorkflowJson to MF_Forms ──────────────────
        [HttpPost]
        [ActionName("Workflow/Save")]
        public HttpResponseMessage WorkflowSave([FromBody] JObject body)
        {
            int formId = body?["formId"]?.ToObject<int>() ?? 0;
            var workflowToken = body?["workflow"];

            if (formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId required" });
            if (workflowToken == null)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "workflow required" });

            string workflowJson = workflowToken.ToString(Formatting.None);

            using (var conn = new System.Data.SqlClient.SqlConnection(
                       DotNetNuke.Common.Utilities.Config.GetConnectionString()))
            {
                conn.Open();
                // Add WorkflowJson column if it does not exist yet
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"IF NOT EXISTS (
                        SELECT 1 FROM sys.columns
                        WHERE object_id=OBJECT_ID('MF_Forms') AND name='WorkflowJson')
                        ALTER TABLE MF_Forms ADD WorkflowJson NVARCHAR(MAX) NULL";
                    cmd.ExecuteNonQuery();
                }
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "UPDATE MF_Forms SET WorkflowJson=@Json WHERE FormId=@Id";
                    cmd.Parameters.AddWithValue("@Json", workflowJson);
                    cmd.Parameters.AddWithValue("@Id", formId);
                    if (cmd.ExecuteNonQuery() == 0)
                        return Request.CreateResponse(HttpStatusCode.NotFound,
                            new { error = "Form not found: " + formId });
                }
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                formId,
                workflowVersion = workflowToken["version"]?.ToString() ?? "1.0"
            });
        }

        // ── Workflow/TestRun — stub dry-run ───────────────────────────────────
        [HttpPost]
        [ActionName("Workflow/TestRun")]
        public HttpResponseMessage WorkflowTestRun([FromBody] JObject body)
        {
            int formId = body?["formId"]?.ToObject<int>() ?? 0;
            if (formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId required" });

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                executionId  = Guid.NewGuid().ToString("N"),
                status       = "completed",
                log          = new object[0],
                variables    = new object[0],
                errorMessage = (string)null,
                durationMs   = 0
            });
        }

        // ============================================================
        //  APP BUILDER CRUD — MOVED to Phase2Controller in
        //  MegaFormApiController.cs because that's the class DNN's URL
        //  routing actually resolves "/Phase2/*" to. Don't add new
        //  Phase2 actions here; this class is unreachable.
        // ============================================================

    }

    // Route mapper for Phase 2
    // Phase2RouteMapper removed — MegaFormRouteMapper handles all routes
}
