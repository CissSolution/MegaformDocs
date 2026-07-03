using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Web;
using System.Web.Http;
using DotNetNuke.Entities.Host;
using DotNetNuke.Entities.Controllers;
using DotNetNuke.Entities.Portals;
using DotNetNuke.Security;
using DotNetNuke.Services.Mail;
using DotNetNuke.Web.Api;
using MegaForm.DNN.Controllers;
using MegaForm.DNN.Data;
using MegaForm.Core.Models;
using MegaForm.Core.Rendering;
using MegaForm.Core.Services;
using MegaForm.Core.Interfaces;
using MegaForm.Core.ViewModes;
using MegaForm.DNN.Services;
using MegaForm.Core.Utilities;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    /// <summary>
    /// DNN WebAPI route mapper for MegaForm.
    /// Base route: /DesktopModules/MegaForm/API/{controller}/{action}
    /// </summary>
    public class MegaFormRouteMapper : IServiceRouteMapper
    {
        public void RegisterRoutes(IMapRoute mapRouteManager)
        {
            // Explicit routes for Upload/File (form submission uploads — AllowAnonymous)
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormUploadFile",
                url: "Upload/File",
                defaults: new { controller = "UploadFile", action = "File" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            // Specific routes for settings sub-paths (must come before generic route)
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormDatabaseSettingsTest",
                url: "ModuleConfig/DatabaseSettings/Test",
                defaults: new { controller = "ModuleConfig", action = "DatabaseSettingsTest" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormEmailSettingsTest",
                url: "ModuleConfig/EmailSettings/Test",
                defaults: new { controller = "ModuleConfig", action = "EmailSettingsTest" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            // BUG FIX v20260405-16: Workflow Database sub-routes.
            // Default route {controller}/{action}/{id} resolves Workflow/Database/Connections as
            // controller=Workflow, action=Database, id=Connections — no such action exists → 404.
            // Register explicit routes mapping Workflow/Database/{action} → WorkflowDatabase controller.
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormWorkflowDatabaseConnections",
                url: "Workflow/Database/Connections",
                defaults: new { controller = "WorkflowDatabase", action = "Connections" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormWorkflowDatabaseConnectionStringSample",
                url: "Workflow/Database/ConnectionStringSample",
                defaults: new { controller = "WorkflowDatabase", action = "ConnectionStringSample" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormWorkflowDatabaseTestConnection",
                url: "Workflow/Database/TestConnection",
                defaults: new { controller = "WorkflowDatabase", action = "TestConnection" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormWorkflowDatabaseTables",
                url: "Workflow/Database/Tables",
                defaults: new { controller = "WorkflowDatabase", action = "Tables" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormWorkflowDatabaseColumns",
                url: "Workflow/Database/Columns",
                defaults: new { controller = "WorkflowDatabase", action = "Columns" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormWorkflowDatabaseProcedures",
                url: "Workflow/Database/Procedures",
                defaults: new { controller = "WorkflowDatabase", action = "Procedures" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormWorkflowDatabaseProcedureParameters",
                url: "Workflow/Database/ProcedureParameters",
                defaults: new { controller = "WorkflowDatabase", action = "ProcedureParameters" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormWorkflowInbox",
                url: "Workflow/Inbox",
                defaults: new { controller = "Workflow", action = "Inbox" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormWorkflowTasksGet",
                url: "Workflow/Tasks/Get",
                defaults: new { controller = "Workflow", action = "TasksGet" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            // Public ListView runtime uses the Oqtane-style /Submissions endpoint.
            // Keep DNN compatible without exposing the mutable submissions actions.
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormSubmissionsListAlias",
                url: "Submissions",
                defaults: new { controller = "Submissions", action = "List" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            // DNN compatibility alias for shared listview/modal runtime.
            // The JS host asks for /DesktopModules/MegaForm/API/Schema/{formId};
            // DNN's canonical public schema action lives under Submit/Schema?formId=N.
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormSchemaAlias",
                url: "Schema/{formId}",
                defaults: new { controller = "Submit", action = "Schema" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormWorkflowTasksClaim",
                url: "Workflow/Tasks/Claim",
                defaults: new { controller = "Workflow", action = "TasksClaim" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormWorkflowTasksApprove",
                url: "Workflow/Tasks/Approve",
                defaults: new { controller = "Workflow", action = "TasksApprove" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormWorkflowTasksReject",
                url: "Workflow/Tasks/Reject",
                defaults: new { controller = "Workflow", action = "TasksReject" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormWorkflowTasksForward",
                url: "Workflow/Tasks/Forward",
                defaults: new { controller = "Workflow", action = "TasksForward" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormPermissionsGet",
                url: "Permissions/Get",
                defaults: new { controller = "Permissions", action = "Get" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            // [v20260528-14] Pinned-pages discovery for dashboard "Open App"
            // URL rewriting. Maps each MegaForm module instance whose
            // ModuleSettings contain a formId / viewKey / surface / inbox
            // scope back to the DNN Tab it lives on, so the dashboard can
            // prefer the clean `/megaf/Blog/Editorial` URL over the legacy
            // `?mfFormId=…&vk=…` querystring. Route is explicit (camelCase)
            // because the default `{controller}/{action}` route would treat
            // "PinnedPages" as an action name only, missing the namespace
            // lookup we need.
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormPhase2PinnedPages",
                url: "Phase2/PinnedPages",
                defaults: new { controller = "Phase2Api", action = "PinnedPages" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormPhase2PinToNewPage",
                url: "Phase2/PinToNewPage",
                defaults: new { controller = "Phase2Api", action = "PinToNewPage" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormPermissionsCatalog",
                url: "Permissions/Catalog",
                defaults: new { controller = "Permissions", action = "Catalog" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormPermissionsSave",
                url: "Permissions/Save",
                defaults: new { controller = "Permissions", action = "Save" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            // ── DataRepeater widget routes (v20260428-01) ──
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormDataRepeaterQuery",
                url: "DataRepeater/Query",
                defaults: new { controller = "DataRepeaterApi", action = "Query" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormDataRepeaterFilterOptions",
                url: "DataRepeater/FilterOptions",
                defaults: new { controller = "DataRepeaterApi", action = "FilterOptions" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormDataRepeaterColumnOptions",
                url: "DataRepeater/ColumnOptions",
                defaults: new { controller = "DataRepeaterApi", action = "ColumnOptions" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormDataRepeaterExport",
                url: "DataRepeater/Export",
                defaults: new { controller = "DataRepeaterApi", action = "Export" },
                namespaces: new[] { "MegaForm.WebApi" }
            );
            // Generic catch-all route
            mapRouteManager.MapHttpRoute(
                moduleFolderName: "MegaForm",
                routeName: "MegaFormApi",
                url: "{controller}/{action}/{id}",
                defaults: new { id = RouteParameter.Optional },
                namespaces: new[] { "MegaForm.WebApi" }
            );
        }
    }

    /// <summary>
    /// Registers CORS handler at application startup for crosssite embed support.
    /// Add to web.config: <httpModules> or register via DNN event.
    /// For simplicity, CORS headers are added directly in controllers.
    /// </summary>


    [DnnAuthorize(StaticRoles = "Administrators")]
    public class I18nController : DnnApiController
    {
        private IEnumerable<string> ResolveI18nFolders()
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var yieldReturn = new List<string>();
            void add(string candidate)
            {
                if (string.IsNullOrWhiteSpace(candidate)) return;
                try
                {
                    var full = Path.GetFullPath(candidate);
                    if (!Directory.Exists(full)) return;
                    if (seen.Add(full)) yieldReturn.Add(full);
                }
                catch { }
            }
            try
            {
                var ctx = HttpContext.Current;
                if (ctx != null)
                {
                    add(ctx.Server.MapPath("~/DesktopModules/MegaForm/Assets/js/i18n"));
                    add(ctx.Server.MapPath("~/DesktopModules/MegaForm/Assets/i18n"));
                    add(ctx.Server.MapPath("~/DesktopModules/MegaForm/Assets/js/builder/i18n"));
                    add(ctx.Server.MapPath("~/DesktopModules/MegaForm/Assets/js/bundles/i18n"));
                    add(ctx.Server.MapPath("~/megaform/i18n"));
                }
            }
            catch { }

            try
            {
                var baseDir = AppDomain.CurrentDomain.BaseDirectory ?? string.Empty;
                add(Path.Combine(baseDir, "DesktopModules", "MegaForm", "Assets", "js", "i18n"));
                add(Path.Combine(baseDir, "DesktopModules", "MegaForm", "Assets", "i18n"));
                add(Path.Combine(baseDir, "DesktopModules", "MegaForm", "Assets", "js", "builder", "i18n"));
                add(Path.Combine(baseDir, "DesktopModules", "MegaForm", "Assets", "js", "bundles", "i18n"));
                add(Path.Combine(baseDir, "megaform", "i18n"));
            }
            catch { }

            return yieldReturn;
        }

        private string ResolveI18nFile(string locale)
        {
            foreach (var bad in Path.GetInvalidFileNameChars()) locale = locale.Replace(bad.ToString(), string.Empty);
            foreach (var folder in ResolveI18nFolders())
            {
                try
                {
                    var file = Path.Combine(folder, locale + ".json");
                    if (File.Exists(file)) return file;
                }
                catch { }
            }
            return null;
        }

        [HttpGet]
        [ActionName("List")]
        public HttpResponseMessage List()
        {
            var locales = ResolveI18nFolders()
                .SelectMany(folder =>
                {
                    try { return Directory.GetFiles(folder, "*.json"); }
                    catch { return new string[0]; }
                })
                .Select(Path.GetFileNameWithoutExtension)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(x => x)
                .ToList();

            if (!locales.Contains("en-US", StringComparer.OrdinalIgnoreCase)) locales.Insert(0, "en-US");
            return Request.CreateResponse(HttpStatusCode.OK, locales.ToArray());
        }

        [HttpGet]
        public HttpResponseMessage Get(string id)
        {
            var locale = string.IsNullOrWhiteSpace(id) ? "en-US" : id.Trim();
            var file = ResolveI18nFile(locale);
            if (string.IsNullOrWhiteSpace(file))
            {
                if (!locale.Equals("en-US", StringComparison.OrdinalIgnoreCase))
                {
                    file = ResolveI18nFile("en-US");
                }
                if (string.IsNullOrWhiteSpace(file))
                {
                    return Request.CreateResponse(HttpStatusCode.OK, new Dictionary<string, string>());
                }
            }

            var json = File.ReadAllText(file);
            var response = Request.CreateResponse(HttpStatusCode.OK);
            response.Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            return response;
        }
    }

    // ================================================================
    // FORM BUILDER API (Admin / Edit permission)
    // ================================================================
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class FormController : DnnApiController
    {
        /// <summary>
        /// [v20260527-04] Resolve the portalId the caller wants to target.
        /// Priority: explicit ?portalId=N query &gt; ?portalid=N &gt;
        /// PortalSettings.PortalId (URL-alias resolved). Required for
        /// multi-portal DNN sites with child-portal subpath aliases where
        /// the AJAX URL doesn't carry the alias path.
        /// Only SuperUsers or Portal Administrators may target a portal
        /// they're not currently rendered in.
        /// </summary>
        private int ResolveTargetPortalId()
        {
            var fallback = PortalSettings != null ? PortalSettings.PortalId : 0;
            try
            {
                var query = Request != null && Request.RequestUri != null
                    ? Request.RequestUri.ParseQueryString()
                    : null;
                if (query == null) return fallback;
                var raw = query["portalId"] ?? query["portalid"] ?? query["PortalId"];
                int explicitPid;
                if (string.IsNullOrEmpty(raw) || !int.TryParse(raw, out explicitPid)) return fallback;
                if (explicitPid < 0) return fallback;
                if (explicitPid == fallback) return fallback;
                // Cross-portal: only SuperUser / Administrator may target.
                var caller = UserInfo;
                var allowed = caller != null && (caller.IsSuperUser || caller.IsInRole("Administrators"));
                return allowed ? explicitPid : fallback;
            }
            catch { return fallback; }
        }

        [HttpGet]
        public HttpResponseMessage Get(int formId)
        {
            var form = FormRepository.GetForm(formId);
            if (form == null) return Request.CreateResponse(HttpStatusCode.NotFound);
            var resolved = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson, form.SubmitButtonText, form.SuccessMessage, form.RedirectUrl);
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                form.FormId,
                form.ModuleId,
                form.PortalId,
                form.Title,
                form.Description,
                SchemaJson = resolved.SchemaJson,
                SettingsJson = resolved.SettingsJson,
                ResolvedSchemaJson = resolved.SchemaJson,
                ResolvedSettingsJson = resolved.SettingsJson,
                ResolvedRenderModel = resolved,
                form.ThemeJson,
                form.Status,
                SubmitButtonText = resolved.SubmitButtonText,
                SuccessMessage = resolved.SuccessMessage,
                RedirectUrl = resolved.RedirectUrl,
                ResolverBadge = resolved.Badge,
                form.EnableCaptcha,
                form.RequireAuth,
                form.EnableSaveResume,
                form.RulesJson,
                form.WorkflowJson,
                form.NotifyEmails,
                form.WebhookUrl
            });
        }

        [HttpGet]
        [ActionName("ListAll")]
        public HttpResponseMessage ListAll()
        {
            // [v20260527-04] Honor ?portalId=N (multi-portal sites)
            var portalId = ResolveTargetPortalId();
            var forms = FormRepository.GetFormsByPortal(portalId);
            // Attach stats for each form
            var result = new List<object>();
            foreach (var f in forms)
            {
                var stats = FormRepository.GetFormStats(f.FormId);
                result.Add(new {
                    f.FormId, f.Title, f.Description, f.Status, f.ModuleId,
                    f.SubmitButtonText, f.CreatedOnUtc, f.UpdatedOnUtc,
                    // [v20260528-12] AppScope carried for the Submission Inbox
                    // per-app instance filter (?mfAppScope=blog). Without this
                    // the inbox can't tell which forms belong to which app.
                    f.AppScope,
                    FieldCount = 0, // will be counted client-side from schema
                    f.SchemaJson,
                    TotalSubmissions = stats?.TotalSubmissions ?? 0,
                    LastSubmission = stats?.LastSubmission
                });
            }
            return Request.CreateResponse(HttpStatusCode.OK, result);
        }

        [HttpGet]
        public HttpResponseMessage List(int portalId, string status = null, string search = null, int pageIndex = 0, int pageSize = 20)
        {
            var forms = FormRepository.ListForms(portalId, status, search, pageIndex, pageSize);
            return Request.CreateResponse(HttpStatusCode.OK, forms);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Save([FromBody] JObject body)
        {
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, "Invalid form data.");

            var form = body.ToObject<FormInfo>();
            if (form == null) return Request.CreateResponse(HttpStatusCode.BadRequest, "Invalid form data.");

            var preserveModuleBindingOnSave = body.Value<bool?>("PreserveModuleBindingOnSave") ?? false;
            if (preserveModuleBindingOnSave) form.FormId = 0;

            // [v20260527-04] Honor explicit ?portalId=N from JS (multi-portal sites
            // where the AJAX URL is root-relative but the caller is rendered in a
            // child-portal subpath alias like /megaf). See ResolveTargetPortalId.
            form.PortalId = ResolveTargetPortalId();
            form.CreatedByUserId = UserInfo.UserID;
            form.UpdatedByUserId = UserInfo.UserID;

            if (string.IsNullOrWhiteSpace(form.RulesJson) || form.RulesJson == "[]")
            {
                form.RulesJson = ExtractRulesJson(form.SchemaJson, form.SettingsJson);
            }

            // Validate JSON schema
            if (!string.IsNullOrWhiteSpace(form.SchemaJson))
            {
                try { JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson); }
                catch { return Request.CreateResponse(HttpStatusCode.BadRequest, "Invalid form schema JSON."); }

                // [SqlConnDefault v20260519-04] Server-side mirror of the builder's
                // auto-fill. Covers non-builder save paths (template import, direct API,
                // CLI tools) so every persisted SchemaJson has a connection key when
                // optionsSource=sql. Mirrors MegaForm.UI/src/builder/core.ts.
                form.SchemaJson = NormalizeSchemaSqlConnDefault(form.SchemaJson);
            }

            int formId = FormRepository.SaveForm(form);
            form.FormId = formId;
            return Request.CreateResponse(HttpStatusCode.OK, new { formId, message = "Form saved successfully." });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Delete(int formId)
        {
            FormRepository.DeleteForm(formId);
            return Request.CreateResponse(HttpStatusCode.OK, new { message = "Form deleted." });
        }

        private string ResolveLockedFormsPath()
        {
            try
            {
                var portalHome = PortalSettings?.HomeDirectoryMapPath;
                if (!string.IsNullOrWhiteSpace(portalHome))
                    return Path.Combine(portalHome, "MegaForm", "locked-forms.json");
            }
            catch { }

            try
            {
                var appPath = HttpContext.Current?.Server?.MapPath("~/");
                if (!string.IsNullOrWhiteSpace(appPath))
                    return Path.Combine(appPath, "App_Data", "MegaForm", "locked-forms.json");
            }
            catch { }

            return null;
        }

        private HashSet<int> ReadLockedIds()
        {
            try
            {
                var path = ResolveLockedFormsPath();
                if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) return new HashSet<int>();
                var json = File.ReadAllText(path);
                var arr = JsonConvert.DeserializeObject<List<int>>(json) ?? new List<int>();
                return new HashSet<int>(arr);
            }
            catch
            {
                return new HashSet<int>();
            }
        }

        private void WriteLockedIds(HashSet<int> ids)
        {
            try
            {
                var path = ResolveLockedFormsPath();
                if (string.IsNullOrWhiteSpace(path)) return;
                var dir = Path.GetDirectoryName(path);
                if (!string.IsNullOrWhiteSpace(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                File.WriteAllText(path, JsonConvert.SerializeObject(ids.OrderBy(x => x).ToList()));
            }
            catch { }
        }

        [HttpGet]
        [DnnAuthorize(StaticRoles = "Administrators")]
        [ActionName("LockedIds")]
        public HttpResponseMessage LockedIds()
        {
            var ids = ReadLockedIds();
            return Request.CreateResponse(HttpStatusCode.OK, new { lockedIds = ids.OrderBy(x => x).ToList() });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [DnnAuthorize(StaticRoles = "Administrators")]
        [ActionName("Lock")]
        public HttpResponseMessage Lock([FromBody] JObject body)
        {
            int formId = body?.Value<int>("formId") ?? 0;
            if (formId == 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId required" });
            var ids = ReadLockedIds();
            ids.Add(formId);
            WriteLockedIds(ids);
            return Request.CreateResponse(HttpStatusCode.OK, new { success = true, lockedIds = ids.OrderBy(x => x).ToList() });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [DnnAuthorize(StaticRoles = "Administrators")]
        [ActionName("Unlock")]
        public HttpResponseMessage Unlock([FromBody] JObject body)
        {
            int formId = body?.Value<int>("formId") ?? 0;
            if (formId == 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId required" });
            var ids = ReadLockedIds();
            ids.Remove(formId);
            WriteLockedIds(ids);
            return Request.CreateResponse(HttpStatusCode.OK, new { success = true, lockedIds = ids.OrderBy(x => x).ToList() });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("SaveTheme")]
        public HttpResponseMessage SaveTheme([FromBody] JObject body)
        {
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });
            int formId = body.Value<int>("FormId");
            string themeJson = body["ThemeJson"]?.ToString() ?? "{}";
            string schemaCustomCss = body["SchemaCustomCss"]?.ToString();
            string themeId = body["ThemeId"]?.ToString();
            var cssOverrides = body["CssOverrides"] as JObject;
            if (formId == 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "FormId required" });

            var form = FormRepository.GetForm(formId);
            if (form == null) return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Form not found" });

            form.ThemeJson = themeJson;
            if (!string.IsNullOrWhiteSpace(form.SchemaJson))
            {
                try
                {
                    var schema = JObject.Parse(form.SchemaJson);
                    var settings = schema["settings"] as JObject ?? new JObject();
                    schema["settings"] = settings;
                    if (!string.IsNullOrWhiteSpace(themeId))
                    {
                        settings["theme"] = themeId;
                        settings["Theme"] = themeId;
                        schema["theme"] = themeId;
                        schema["Theme"] = themeId;
                    }
                    if (schemaCustomCss != null)
                    {
                        settings["customCss"] = schemaCustomCss;
                        settings["CustomCss"] = schemaCustomCss;
                        schema["customCss"] = schemaCustomCss;
                        schema["CustomCss"] = schemaCustomCss;
                    }
                    if (cssOverrides != null) settings["themeCssOverrides"] = cssOverrides;
                    form.SchemaJson = schema.ToString(Newtonsoft.Json.Formatting.None);
                }
                catch { }
            }
            try
            {
                var settingsJson = !string.IsNullOrWhiteSpace(form.SettingsJson) ? JObject.Parse(form.SettingsJson) : new JObject();
                if (!string.IsNullOrWhiteSpace(themeId))
                {
                    settingsJson["theme"] = themeId;
                    settingsJson["Theme"] = themeId;
                }
                if (schemaCustomCss != null)
                {
                    settingsJson["customCss"] = schemaCustomCss;
                    settingsJson["CustomCss"] = schemaCustomCss;
                }
                if (cssOverrides != null) settingsJson["themeCssOverrides"] = cssOverrides;
                form.SettingsJson = settingsJson.ToString(Newtonsoft.Json.Formatting.None);
            }
            catch { }

            form.UpdatedByUserId = UserInfo.UserID;
            FormRepository.SaveForm(form);
            return Request.CreateResponse(HttpStatusCode.OK, new { formId, saved = true });
        }

        [HttpGet]
        public HttpResponseMessage Stats(int formId)
        {
            var stats = FormRepository.GetFormStats(formId);
            return Request.CreateResponse(HttpStatusCode.OK, stats);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Duplicate(int formId)
        {
            var original = FormRepository.GetForm(formId);
            if (original == null) return Request.CreateResponse(HttpStatusCode.NotFound);

            original.FormId = 0;
            original.Title = original.Title + " (Copy)";
            original.Status = "Draft";
            original.CreatedByUserId = UserInfo.UserID;
            int newId = FormRepository.SaveForm(original);
            return Request.CreateResponse(HttpStatusCode.OK, new { formId = newId, message = "Form duplicated." });
        }

        /// <summary>POST api/Form/SaveStyle — Save admin live style overrides</summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage SaveStyle([FromBody] SaveStyleRequest req)
        {
            if (req == null || req.FormId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId required" });

            var mc = new DotNetNuke.Entities.Modules.ModuleController();
            if (req.ModuleId > 0)
            {
                mc.UpdateModuleSetting(req.ModuleId, "MegaForm_ThemeClass",  req.ThemeClass  ?? "");
                mc.UpdateModuleSetting(req.ModuleId, "MegaForm_CssOverride", req.CssOverride ?? "");
                mc.UpdateModuleSetting(req.ModuleId, "MegaForm_ExtraClass",  req.ExtraClass  ?? "");
            }

            return Request.CreateResponse(HttpStatusCode.OK, new { success = true });
        }

        /// <summary>
        /// POST api/Form/SaveSettings — Merge arbitrary settings keys into a form's settingsJson.
        /// FEATURE v20260405-18: Used by the dashboard "Set View URL" button (DNN/Oqtane).
        /// Accepts { formId, viewUrl } — stores viewUrl into settingsJson so the dashboard
        /// "View Live" button opens the correct DNN/Oqtane page instead of Default.aspx?formid=N.
        /// Designed for future extension: any key in the body is merged into settingsJson.
        /// </summary>
        [HttpPost]
        [ActionName("SaveSettings")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage SaveSettings([FromBody] JObject body)
        {
            if (body == null)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });

            int formId = body.Value<int>("formId");
            if (formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId required" });

            var form = FormRepository.GetForm(formId);
            if (form == null)
                return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Form not found" });

            // Merge submitted keys into existing settingsJson
            JObject settings;
            try { settings = string.IsNullOrWhiteSpace(form.SettingsJson) ? new JObject() : JObject.Parse(form.SettingsJson); }
            catch { settings = new JObject(); }

            // viewUrl — custom public view URL for DNN/Oqtane pages
            if (body["viewUrl"] != null)
            {
                var viewUrl = body.Value<string>("viewUrl") ?? "";
                if (string.IsNullOrWhiteSpace(viewUrl))
                    settings.Remove("viewUrl");
                else
                    settings["viewUrl"] = viewUrl.Trim();
            }

            // Future settings keys can be merged here

            form.SettingsJson = settings.ToString(Newtonsoft.Json.Formatting.None);
            form.UpdatedByUserId = UserInfo.UserID;
            FormRepository.SaveForm(form);

            return Request.CreateResponse(HttpStatusCode.OK, new { success = true, formId });
        }

        private static string ExtractRulesJson(string schemaJson, string settingsJson = null)
        {
            try
            {
                if (!string.IsNullOrWhiteSpace(schemaJson))
                {
                    var schema = JObject.Parse(schemaJson);
                    var topRules = schema["rules"];
                    if (topRules != null && topRules.Type == JTokenType.Array) return topRules.ToString(Formatting.None);
                    var settingsRules = schema["settings"]?["rules"];
                    if (settingsRules != null && settingsRules.Type == JTokenType.Array) return settingsRules.ToString(Formatting.None);
                }
                if (!string.IsNullOrWhiteSpace(settingsJson))
                {
                    var settings = JObject.Parse(settingsJson);
                    var rules = settings["rules"];
                    if (rules != null && rules.Type == JTokenType.Array) return rules.ToString(Formatting.None);
                }
            }
            catch { }
            return "[]";
        }

        // [SqlConnDefault v20260519-04] Walk schema.fields[] (incl. nested row columns) and
        // when a field has optionsSource=sql but a blank optionsConnectionKey, fill the
        // platform default ("DashboardDatabase"). Mirrors MegaForm.UI/src/builder/core.ts
        // normalizeFieldShape — kept here so non-builder save paths (template import,
        // direct API tooling) also end up with a valid key.
        private static string NormalizeSchemaSqlConnDefault(string schemaJson)
        {
            try
            {
                var schema = JObject.Parse(schemaJson);
                var fields = schema["fields"] as JArray ?? schema["Fields"] as JArray;
                if (fields == null) return schemaJson;
                bool changed = NormalizeFieldsSqlConnDefault(fields);
                return changed ? schema.ToString(Formatting.None) : schemaJson;
            }
            catch { return schemaJson; }
        }

        private static bool NormalizeFieldsSqlConnDefault(JArray fields)
        {
            bool changed = false;
            foreach (var f in fields.OfType<JObject>())
            {
                var props = f["properties"] as JObject ?? f["Properties"] as JObject;
                if (props != null)
                {
                    var src = (props["optionsSource"] ?? props["OptionsSource"])?.Value<string>();
                    if (string.Equals(src, "sql", StringComparison.OrdinalIgnoreCase))
                    {
                        var key = (props["optionsConnectionKey"] ?? props["OptionsConnectionKey"])?.Value<string>();
                        if (string.IsNullOrWhiteSpace(key))
                        {
                            props["optionsConnectionKey"] = "DashboardDatabase";
                            changed = true;
                        }
                    }
                }
                var cols = f["columns"] as JArray ?? f["Columns"] as JArray;
                if (cols != null)
                {
                    foreach (var col in cols.OfType<JObject>())
                    {
                        var nested = col["fields"] as JArray ?? col["Fields"] as JArray;
                        if (nested != null) changed |= NormalizeFieldsSqlConnDefault(nested);
                    }
                }
            }
            return changed;
        }
    }

    // ================================================================
    // SUBMISSION API (Public endpoint for form submissions)
    // ================================================================
    [AllowAnonymous]
    public class SubmitController : DnnApiController
    {
        private HttpResponseMessage WithCors(HttpResponseMessage response)
        {
            response.Headers.Add("Access-Control-Allow-Origin", "*");
            response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Accept");
            return response;
        }

        [HttpOptions]
        [ActionName("Post")]
        public HttpResponseMessage PostOptions() { return WithCors(Request.CreateResponse(HttpStatusCode.OK)); }

        [HttpOptions]
        [ActionName("Schema")]
        public HttpResponseMessage SchemaOptions() { return WithCors(Request.CreateResponse(HttpStatusCode.OK)); }

        /// <summary>
        /// POST api/Submit/Post — Public endpoint for submitting form data.
        /// Expects JSON body: { "formId": 1, "data": { "field_key": "value" }, "submissionTime": 12.5 }
        /// </summary>
        [HttpPost]
        public async Task<HttpResponseMessage> Post([FromBody] JObject body)
        {
            if (body == null)
                return WithCors(Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Empty request body." }));

            int formId = body.Value<int>("formId");
            double submissionTime = body.Value<double?>("submissionTime") ?? 0;
            var dataToken = body["data"];

            if (formId <= 0 || dataToken == null)
                return WithCors(Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId and data are required." }));

            var formData = dataToken.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
            var captchaCheck = await VerifyCaptchaSubmissionAsync(formId, formData);
            if (!captchaCheck.Success)
            {
                var validationErrors = new Dictionary<string, string>();
                if (!string.IsNullOrWhiteSpace(captchaCheck.FieldKey))
                    validationErrors[captchaCheck.FieldKey] = captchaCheck.ErrorMessage ?? "CAPTCHA verification failed. Please try again.";

                return WithCors(Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    error = captchaCheck.ErrorMessage ?? "CAPTCHA verification failed. Please try again.",
                    validationErrors
                }));
            }

            string ipAddress = GetClientIpAddress();
            string userAgent = HttpContext.Current?.Request?.UserAgent ?? "";
            int? userId = UserInfo?.UserID > 0 ? UserInfo.UserID : (int?)null;

            // [R2 LifecycleHooks v20260531-01] Load schema once — used by both
            // the lifecycle runner and the existing DatabaseInsert path.
            MegaForm.Core.Models.FormSchema preLoadedSchema = null;
            try
            {
                var formForLifecycle = FormRepository.GetForm(formId);
                if (formForLifecycle != null)
                {
                    var resolved = MegaForm.Core.Rendering.RenderModelResolver.Resolve(formForLifecycle.SchemaJson, formForLifecycle.SettingsJson);
                    preLoadedSchema = resolved?.Schema;
                }
            }
            catch (Exception preEx)
            {
                DotNetNuke.Instrumentation.LoggerSource.Instance.GetLogger(typeof(SubmitController))
                    .Warn($"MegaForm lifecycle schema-load failed for form {formId}: {preEx.Message}");
            }

            // [R2] preInsert hook — abort the submit if onFailure=abort.
            Func<string, string, string> _hostLookup = (key, def) =>
            {
                try { var v = DotNetNuke.Entities.Controllers.HostController.Instance.GetString("MegaForm_" + key, null); return string.IsNullOrWhiteSpace(v) ? def : v; }
                catch { return def; }
            };
            var lifecycleRegistry = new DnnConnectionRegistry(_hostLookup);

            var preLifecycle = preLoadedSchema?.Settings?.Lifecycle?.PreInsert;
            if (preLifecycle != null && preLifecycle.Enabled && !string.IsNullOrWhiteSpace(preLifecycle.Sql))
            {
                var preCtx = new MegaForm.Core.Services.LifecycleContext
                {
                    FormId = formId,
                    SubmissionId = 0,
                    PortalId = PortalSettings?.PortalId ?? 0,
                    UserId = userId ?? -1,
                    ModifiedByUserId = userId ?? -1,
                    UtcNow = DateTime.UtcNow,
                    IpAddress = ipAddress,
                    FormData = new Dictionary<string, object>(formData, StringComparer.OrdinalIgnoreCase),
                };
                try
                {
                    using (var conn = lifecycleRegistry.GetConnection(string.IsNullOrWhiteSpace(preLifecycle.ConnectionKey) ? "DashboardDatabase" : preLifecycle.ConnectionKey, null, null))
                    {
                        conn.Open();
                        using (var tx = conn.BeginTransaction())
                        {
                            var runner = new MegaForm.Core.Services.LifecycleRunner(lifecycleRegistry, (r, c, h) => LogHookFailure(r, c, h));
                            var slotResult = runner.RunFormSlot(MegaForm.Core.Models.LifecycleHookSlots.PreInsert, preLifecycle, preCtx, conn, tx);
                            if (slotResult.ShouldAbort)
                            {
                                try { tx.Rollback(); } catch { }
                                var errorMsg = slotResult.Hooks.FirstOrDefault()?.ErrorMessage ?? "Pre-insert hook aborted the submission.";
                                return WithCors(Request.CreateResponse(HttpStatusCode.BadRequest, new
                                {
                                    success = false,
                                    error = "Pre-insert hook aborted: " + errorMsg,
                                    aborted = true,
                                }));
                            }
                            tx.Commit();
                        }
                    }
                }
                catch (Exception preHookEx)
                {
                    DotNetNuke.Instrumentation.LoggerSource.Instance.GetLogger(typeof(SubmitController))
                        .Warn($"MegaForm preInsert hook crashed for form {formId}: {preHookEx.Message}");
                    if (string.Equals(preLifecycle.OnFailure, "abort", StringComparison.OrdinalIgnoreCase))
                    {
                        return WithCors(Request.CreateResponse(HttpStatusCode.BadRequest, new
                        {
                            success = false,
                            error = "Pre-insert hook crashed: " + preHookEx.Message,
                            aborted = true,
                        }));
                    }
                }
            }

            var result = await SubmissionController.ProcessSubmissionAsync(
                formId, formData, ipAddress, userAgent, userId, submissionTime);

            if (result.Success)
            {
                // Optional: also INSERT into a custom database if FormSettings.DatabaseInsert is enabled.
                // Fail-soft. Badge: FormDatabaseInsert v20260430-01
                try
                {
                    var settings = preLoadedSchema?.Settings;
                    if (settings?.DatabaseInsert != null && settings.DatabaseInsert.Enabled)
                    {
                        var insertSvc = new MegaForm.Core.Services.FormDatabaseInsertService(lifecycleRegistry);
                        insertSvc.Execute(settings, formData);
                    }
                }
                catch (Exception dbEx)
                {
                    DotNetNuke.Instrumentation.LoggerSource.Instance.GetLogger(typeof(SubmitController))
                        .Warn($"MegaForm DatabaseInsert failed for form {formId}: {dbEx.Message}");
                }

                // [R2] postInsert hook — submissionId now available.
                var postLifecycle = preLoadedSchema?.Settings?.Lifecycle?.PostInsert;
                if (postLifecycle != null && postLifecycle.Enabled && !string.IsNullOrWhiteSpace(postLifecycle.Sql))
                {
                    var postCtx = new MegaForm.Core.Services.LifecycleContext
                    {
                        FormId = formId,
                        SubmissionId = result.SubmissionId,
                        PortalId = PortalSettings?.PortalId ?? 0,
                        UserId = userId ?? -1,
                        ModifiedByUserId = userId ?? -1,
                        UtcNow = DateTime.UtcNow,
                        IpAddress = ipAddress,
                        FormData = new Dictionary<string, object>(formData, StringComparer.OrdinalIgnoreCase),
                    };
                    try
                    {
                        using (var conn = lifecycleRegistry.GetConnection(string.IsNullOrWhiteSpace(postLifecycle.ConnectionKey) ? "DashboardDatabase" : postLifecycle.ConnectionKey, null, null))
                        {
                            conn.Open();
                            using (var tx = conn.BeginTransaction())
                            {
                                var runner = new MegaForm.Core.Services.LifecycleRunner(lifecycleRegistry, (r, c, h) => LogHookFailure(r, c, h));
                                var slotResult = runner.RunFormSlot(MegaForm.Core.Models.LifecycleHookSlots.PostInsert, postLifecycle, postCtx, conn, tx);
                                if (slotResult.ShouldAbort)
                                {
                                    try { tx.Rollback(); } catch { }
                                    // Submission is already persisted; we can't roll back ProcessSubmissionAsync
                                    // from this point — surface a warning to the caller instead.
                                    return WithCors(Request.CreateResponse(HttpStatusCode.OK, new
                                    {
                                        success = true,
                                        submissionId = result.SubmissionId,
                                        message = result.SuccessMessage,
                                        redirectUrl = result.RedirectUrl,
                                        postHookWarning = slotResult.Hooks.FirstOrDefault()?.ErrorMessage ?? "Post-insert hook aborted (submission already saved).",
                                    }));
                                }
                                tx.Commit();
                            }
                        }
                    }
                    catch (Exception postHookEx)
                    {
                        DotNetNuke.Instrumentation.LoggerSource.Instance.GetLogger(typeof(SubmitController))
                            .Warn($"MegaForm postInsert hook crashed for form {formId}: {postHookEx.Message}");
                    }
                }

                return WithCors(Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    submissionId = result.SubmissionId,
                    message = result.SuccessMessage,
                    redirectUrl = result.RedirectUrl
                }));
            }
            else
            {
                return WithCors(Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    error = result.ErrorMessage,
                    validationErrors = result.ValidationErrors
                }));
            }
        }

        // [R2 LifecycleHooks] Failure logger — persists every hook failure into
        // MF_SubmissionHookErrors using a dedicated short-lived connection so the
        // main submit transaction stays clean.
        private static void LogHookFailure(MegaForm.Core.Models.LifecycleHookResult r, MegaForm.Core.Services.LifecycleContext c, MegaForm.Core.Models.LifecycleHook h)
        {
            try
            {
                Func<string, string, string> hostLookup = (key, def) =>
                {
                    try { var v = DotNetNuke.Entities.Controllers.HostController.Instance.GetString("MegaForm_" + key, null); return string.IsNullOrWhiteSpace(v) ? def : v; }
                    catch { return def; }
                };
                var reg = new DnnConnectionRegistry(hostLookup);
                using (var conn = reg.GetConnection("DashboardDatabase", null, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = @"
INSERT INTO dbo.MF_SubmissionHookErrors
    (SubmissionId, FormId, HookSlot, Scope, ConnectionKey, SqlText, Parameters, SqlNumber, ErrorMessage, OnFailure)
VALUES
    (@sid, @fid, @slot, @scope, @ck, @sql, @params, @num, @msg, @onfail);";
                        cmd.CommandTimeout = 8;
                        // DbCommand doesn't expose AddWithValue — use CreateParameter pattern.
                        void Add(string name, object val)
                        {
                            var p = cmd.CreateParameter();
                            p.ParameterName = name;
                            p.Value = val ?? DBNull.Value;
                            cmd.Parameters.Add(p);
                        }
                        Add("@sid",   c?.SubmissionId ?? 0);
                        Add("@fid",   c?.FormId ?? 0);
                        Add("@slot",  r?.HookSlot ?? string.Empty);
                        Add("@scope", r?.Scope ?? string.Empty);
                        Add("@ck",    (object)(h?.ConnectionKey) ?? DBNull.Value);
                        Add("@sql",   (object)((h?.Sql ?? string.Empty).Length > 4000 ? h.Sql.Substring(0, 4000) : (h?.Sql ?? string.Empty)));
                        Add("@params", (object)Newtonsoft.Json.JsonConvert.SerializeObject(h?.ParameterMapping ?? new Dictionary<string, string>()));
                        Add("@num",   (object)(r?.SqlNumber) ?? DBNull.Value);
                        Add("@msg",   r?.ErrorMessage ?? string.Empty);
                        Add("@onfail", h?.OnFailure ?? "continue");
                        cmd.ExecuteNonQuery();
                    }
                }
            }
            catch
            {
                // Never let logging shadow the original error.
            }
        }

        /// <summary>POST api/Submit/TestInsert — admin dry-run INSERT (transaction rollback).
        /// Body: { connectionKey, databaseType, insertSql, sampleData{...}, parameterMapping{...} }
        /// Badge: FormDatabaseInsertTest v20260430-01</summary>
        [HttpPost]
        [ActionName("TestInsert")]
        [DnnAuthorize(StaticRoles = "Administrators")]
        public HttpResponseMessage TestInsert([FromBody] JObject body)
        {
            if (body == null) return WithCors(Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" }));
            try
            {
                var settings = new MegaForm.Core.Models.FormSettings
                {
                    DatabaseInsert = new MegaForm.Core.Models.FormDatabaseInsertSettings
                    {
                        Enabled       = true,
                        ConnectionKey = (string)body["connectionKey"] ?? string.Empty,
                        DatabaseType  = (string)body["databaseType"]  ?? string.Empty,
                        InsertSql     = (string)body["insertSql"]     ?? string.Empty,
                        ParameterMapping = body["parameterMapping"] is JObject pm
                            ? pm.ToObject<Dictionary<string, string>>() ?? new Dictionary<string, string>()
                            : new Dictionary<string, string>()
                    }
                };
                var sample = body["sampleData"] is JObject sd
                    ? sd.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>()
                    : new Dictionary<string, object>();
                Func<string, string, string> hostLookup = (key, def) =>
                {
                    try
                    {
                        var v = DotNetNuke.Entities.Controllers.HostController.Instance.GetString("MegaForm_" + key, null);
                        return string.IsNullOrWhiteSpace(v) ? def : v;
                    }
                    catch { return def; }
                };
                var registry = new DnnConnectionRegistry(hostLookup);
                var svc = new MegaForm.Core.Services.FormDatabaseInsertService(registry);
                var result = svc.TestExecute(settings, sample);
                return WithCors(Request.CreateResponse(HttpStatusCode.OK, result));
            }
            catch (Exception ex)
            {
                return WithCors(Request.CreateResponse(HttpStatusCode.OK, new MegaForm.Core.Services.FormDatabaseInsertTestResult { Success = false, Error = ex.Message }));
            }
        }

        [HttpOptions]
        [ActionName("TestInsert")]
        public HttpResponseMessage TestInsertOptions() { return WithCors(Request.CreateResponse(HttpStatusCode.OK)); }

        /// <summary>GET api/Submit/FieldOptions?formId=1&amp;fieldKey=events&amp;__p__year=2024
        /// Public field options from SQL. Any query-string parameter starting with "__p__" is
        /// stripped of that prefix and passed to the SQL/stored proc as a named parameter
        /// (cascading dropdowns: child fetches re-fire when parent changes).
        /// Badge: FieldOptionsService v20260516-02 (cascading)</summary>
        [HttpGet]
        [ActionName("FieldOptions")]
        public HttpResponseMessage FieldOptions(int formId, string fieldKey)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(fieldKey))
                return WithCors(Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId and fieldKey required" }));
            try
            {
                var parameters = new System.Collections.Generic.Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                foreach (var kv in Request.GetQueryNameValuePairs())
                {
                    if (string.IsNullOrEmpty(kv.Key)) continue;
                    if (!kv.Key.StartsWith("__p__", StringComparison.OrdinalIgnoreCase)) continue;
                    var name = kv.Key.Substring(5);
                    if (string.IsNullOrWhiteSpace(name)) continue;
                    parameters[name] = kv.Value;
                }

                // DnnConnectionRegistry expects host-level MegaForm-prefixed settings
                // (same pattern as DataRepeaterApiController/WorkflowDatabaseController).
                // SubmitController.GetPortalSetting does NOT prefix, so wrap it here.
                Func<string, string, string> hostLookup = (key, def) =>
                {
                    try
                    {
                        var val = DotNetNuke.Entities.Controllers.HostController.Instance.GetString("MegaForm_" + key, null);
                        return string.IsNullOrWhiteSpace(val) ? def : val;
                    }
                    catch { return def; }
                };
                var registry = new DnnConnectionRegistry(hostLookup);
                var formRepo = DnnServiceLocator.Instance.FormRepo;
                // [FormLookup v20260519-03] Pass SubmissionRepo so form-lookup branch
                // can populate options from another form's submissions.
                var submissionRepo = DnnServiceLocator.Instance.SubmissionRepo;
                // [DefaultConnFallback v20260519-04] Pass the platform's default connection
                // alias so legacy fields with empty optionsConnectionKey still work.
                var defaultConn = hostLookup("Database_ConnectionAlias", "DashboardDatabase");
                var svc = new MegaForm.Core.Services.FieldOptionsService(registry, formRepo, submissionRepo, defaultConn);
                var options = svc.GetOptions(formId, fieldKey, parameters);
                return WithCors(Request.CreateResponse(HttpStatusCode.OK, options));
            }
            catch (Exception ex)
            {
                return WithCors(Request.CreateResponse(HttpStatusCode.OK, new System.Collections.Generic.List<MegaForm.Core.Services.FieldOption>()));
            }
        }

        [HttpOptions]
        [ActionName("FieldOptions")]
        public HttpResponseMessage FieldOptionsOptions() { return WithCors(Request.CreateResponse(HttpStatusCode.OK)); }

        /// <summary>GET api/Submit/Schema?formId=1 — Get form schema for rendering (public)</summary>
        [HttpGet]
        public HttpResponseMessage Schema(int formId)
        {
            var form = FormRepository.GetForm(formId);
            if (form == null || !string.Equals(form.Status, "Published", StringComparison.OrdinalIgnoreCase))
                return WithCors(Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Form not found or not published." }));

            var resolvedRenderModel = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson, form.SubmitButtonText, form.SuccessMessage, form.RedirectUrl);

            // [R3 v20260531-i18n-01] Apply MF_FieldTranslations overrides when
            // ?locale=XX is present and any rows are configured.
            var schemaJsonOut = resolvedRenderModel.SchemaJson;
            string appliedLocale = null;
            string i18nTrace = "no-locale";
            try
            {
                var locale = Request.RequestUri != null
                    ? System.Web.HttpUtility.ParseQueryString(Request.RequestUri.Query)["locale"]
                    : null;
                if (string.IsNullOrWhiteSpace(locale)) i18nTrace = "no-locale-in-qs";
                else i18nTrace = "locale=" + locale;
                if (!string.IsNullOrWhiteSpace(locale))
                {
                    // [R3] DnnConnectionRegistry expects HostSettings keys
                    // prefixed with "MegaForm_" (see FormDatabaseInsertService
                    // notes); GetPortalSetting doesn't add that prefix on its
                    // own so we have to wrap it.
                    Func<string, string, string> i18nHostLookup = (key, def) =>
                    {
                        try {
                            var v = DotNetNuke.Entities.Controllers.HostController.Instance.GetString("MegaForm_" + key, null);
                            return string.IsNullOrWhiteSpace(v) ? def : v;
                        } catch { return def; }
                    };
                    var registry = new DnnConnectionRegistry(i18nHostLookup);
                    using (var conn = registry.GetConnection("DashboardDatabase", null, null))
                    {
                        conn.Open();
                        using (var cmd = conn.CreateCommand())
                        {
                            cmd.CommandText = "SELECT FieldKey, Property, Value FROM dbo.MF_FieldTranslations WHERE FormId = @fid AND Locale = @loc";
                            cmd.CommandTimeout = 6;
                            var p1 = cmd.CreateParameter(); p1.ParameterName = "@fid"; p1.Value = formId; cmd.Parameters.Add(p1);
                            var p2 = cmd.CreateParameter(); p2.ParameterName = "@loc"; p2.Value = locale; cmd.Parameters.Add(p2);
                            var overrides = new System.Collections.Generic.Dictionary<string, System.Collections.Generic.Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
                            using (var r = cmd.ExecuteReader())
                            {
                                while (r.Read())
                                {
                                    var fk = r.GetString(0);
                                    var prop = r.GetString(1);
                                    var val = r.GetString(2);
                                    if (!overrides.TryGetValue(fk, out var bag)) { bag = new System.Collections.Generic.Dictionary<string, string>(StringComparer.OrdinalIgnoreCase); overrides[fk] = bag; }
                                    bag[prop] = val;
                                }
                            }
                            i18nTrace = "locale=" + locale + " overrides=" + overrides.Count;
                            if (overrides.Count > 0 && !string.IsNullOrWhiteSpace(schemaJsonOut))
                            {
                                try
                                {
                                    var parsed = Newtonsoft.Json.Linq.JObject.Parse(schemaJsonOut);
                                    ApplyTranslationsRecursive(parsed["fields"] as Newtonsoft.Json.Linq.JArray, overrides);
                                    schemaJsonOut = parsed.ToString(Newtonsoft.Json.Formatting.None);
                                    appliedLocale = locale;
                                    i18nTrace += " applied";
                                }
                                catch (Exception applyEx) { i18nTrace += " parseErr:" + applyEx.Message.Substring(0, Math.Min(40, applyEx.Message.Length)); }
                            }
                        }
                    }
                }
            }
            catch (Exception i18nEx) { i18nTrace = "outer:" + i18nEx.Message.Substring(0, Math.Min(40, i18nEx.Message.Length)); }

            return WithCors(Request.CreateResponse(HttpStatusCode.OK, new
            {
                formId = form.FormId,
                title = form.Title,
                description = form.Description,
                schema = schemaJsonOut,
                submitButtonText = resolvedRenderModel.SubmitButtonText,
                enableCaptcha = form.EnableCaptcha,
                enableSaveResume = form.EnableSaveResume,
                theme = form.ThemeJson,
                settingsJson = resolvedRenderModel.SettingsJson,
                requireAuth = form.RequireAuth,
                resolverBadge = resolvedRenderModel.Badge,
                appliedLocale,
                i18nTrace,
            }));
        }

        // [R3] Walk fields[] (and any nested Row.columns[].fields[]) and apply
        // {FieldKey: {Property: Value}} overrides to label / placeholder /
        // helpText. options[].label is replaced when an override key like
        // 'optionLabel:<value>' matches.
        private static void ApplyTranslationsRecursive(Newtonsoft.Json.Linq.JArray fields, System.Collections.Generic.Dictionary<string, System.Collections.Generic.Dictionary<string, string>> overrides)
        {
            if (fields == null) return;
            foreach (var f in fields)
            {
                if (!(f is Newtonsoft.Json.Linq.JObject fo)) continue;
                var key = (string)fo["key"];
                if (!string.IsNullOrEmpty(key) && overrides.TryGetValue(key, out var bag))
                {
                    foreach (var kv in bag)
                    {
                        if (string.Equals(kv.Key, "label",       StringComparison.OrdinalIgnoreCase)) fo["label"]       = kv.Value;
                        else if (string.Equals(kv.Key, "placeholder", StringComparison.OrdinalIgnoreCase)) fo["placeholder"] = kv.Value;
                        else if (string.Equals(kv.Key, "helpText",   StringComparison.OrdinalIgnoreCase)) fo["helpText"]    = kv.Value;
                        else if (kv.Key.StartsWith("optionLabel:", StringComparison.OrdinalIgnoreCase))
                        {
                            var optValue = kv.Key.Substring("optionLabel:".Length);
                            var opts = fo["options"] as Newtonsoft.Json.Linq.JArray;
                            if (opts != null)
                            {
                                foreach (var o in opts)
                                {
                                    if (o is Newtonsoft.Json.Linq.JObject oo && string.Equals((string)oo["value"], optValue, StringComparison.OrdinalIgnoreCase))
                                        oo["label"] = kv.Value;
                                }
                            }
                        }
                    }
                }
                // Row containers — recurse into columns[].fields[]
                if (fo["columns"] is Newtonsoft.Json.Linq.JArray rowCols)
                {
                    foreach (var col in rowCols)
                    {
                        if (col is Newtonsoft.Json.Linq.JObject co && co["fields"] is Newtonsoft.Json.Linq.JArray nested)
                            ApplyTranslationsRecursive(nested, overrides);
                    }
                }
            }
        }


        private sealed class CaptchaVerificationResult
        {
            public bool Success { get; set; }
            public string ErrorMessage { get; set; }
            public string FieldKey { get; set; }
        }

        // Helper used by DnnConnectionRegistry — same signature as DataRepeaterApiController.GetPortalSetting
        private string GetPortalSetting(string key, string defaultValue = "")
        {
            try
            {
                int portalId = PortalSettings != null ? PortalSettings.PortalId : -1;
                return PortalController.GetPortalSetting(key, portalId, defaultValue) ?? defaultValue;
            }
            catch { return defaultValue; }
        }

        private string ReadSharedSetting(string key, string defaultValue = "")
        {
            var fullKey = "MegaForm_" + key;
            try
            {
                var hostValue = HostController.Instance.GetString(fullKey, null);
                if (!string.IsNullOrWhiteSpace(hostValue)) return hostValue;
            }
            catch { }

            try
            {
                return PortalController.GetPortalSetting(fullKey, PortalSettings != null ? PortalSettings.PortalId : -1, defaultValue) ?? defaultValue;
            }
            catch
            {
                return defaultValue;
            }
        }

        private static string ReadWidgetProp(FormField field, params string[] keys)
        {
            if (field == null || field.WidgetProps == null || keys == null) return string.Empty;
            foreach (var key in keys)
            {
                if (string.IsNullOrWhiteSpace(key)) continue;
                object raw;
                if (field.WidgetProps.TryGetValue(key, out raw) && raw != null)
                    return Convert.ToString(raw, CultureInfo.InvariantCulture) ?? string.Empty;

                var found = field.WidgetProps.FirstOrDefault(kvp => string.Equals(kvp.Key, key, StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrWhiteSpace(found.Key) && found.Value != null)
                    return Convert.ToString(found.Value, CultureInfo.InvariantCulture) ?? string.Empty;
            }
            return string.Empty;
        }

        private static string NormalizeCaptchaMode(FormField field)
        {
            var raw = ReadWidgetProp(field, "mode", "captchaMode");
            if (string.Equals(raw, "recaptcha_v3", StringComparison.OrdinalIgnoreCase)) return "recaptcha_v3";
            if (string.Equals(raw, "hcaptcha", StringComparison.OrdinalIgnoreCase)) return "hcaptcha";
            return "recaptcha_v2";
        }

        private static double NormalizeMinScore(string value)
        {
            double parsed;
            if (double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out parsed))
            {
                if (parsed < 0d) return 0d;
                if (parsed > 1d) return 1d;
                return parsed;
            }
            return 0.5d;
        }

        private static string SanitizeCaptchaAction(string value)
        {
            var raw = (value ?? string.Empty).Trim();
            var filtered = new string(raw.Where(ch => char.IsLetterOrDigit(ch) || ch == '_' || ch == '/' || ch == '-').ToArray());
            return string.IsNullOrWhiteSpace(filtered) ? "submit" : filtered;
        }

        private async Task<CaptchaVerificationResult> VerifyCaptchaSubmissionAsync(int formId, IDictionary<string, object> formData)
        {
            var success = new CaptchaVerificationResult { Success = true };
            if (formId <= 0 || formData == null) return success;

            var form = FormRepository.GetForm(formId);
            if (form == null || !form.EnableCaptcha) return success;

            FormSchema schema = null;
            try { schema = RenderModelResolver.ResolveSchema(form.SchemaJson, form.SettingsJson); }
            catch { }

            var captchaField = schema?.Fields == null
                ? null
                : MegaFormUtils.FlattenFields(schema.Fields).FirstOrDefault(f =>
                    f != null &&
                    string.Equals(f.Type, "Captcha", StringComparison.OrdinalIgnoreCase) &&
                    !string.IsNullOrWhiteSpace(f.Key));

            if (captchaField == null) return success;

            object rawToken;
            formData.TryGetValue(captchaField.Key, out rawToken);
            var token = Convert.ToString(rawToken, CultureInfo.InvariantCulture) ?? string.Empty;
            if (string.Equals(token, "__captcha_verified__", StringComparison.Ordinal))
                return success;
            if (string.IsNullOrWhiteSpace(token))
            {
                return new CaptchaVerificationResult
                {
                    Success = false,
                    FieldKey = captchaField.Key,
                    ErrorMessage = "Please complete the CAPTCHA verification."
                };
            }

            var mode = NormalizeCaptchaMode(captchaField);
            var isHcaptcha = string.Equals(mode, "hcaptcha", StringComparison.OrdinalIgnoreCase);
            var secret = isHcaptcha
                ? ReadSharedSetting("Captcha_HCaptcha_SecretKey", "")
                : ReadSharedSetting("Captcha_ReCaptcha_SecretKey", "");
            if (string.IsNullOrWhiteSpace(secret))
            {
                return new CaptchaVerificationResult
                {
                    Success = false,
                    FieldKey = captchaField.Key,
                    ErrorMessage = "Captcha secret key is not configured in Dashboard settings."
                };
            }

            var verifyEndpoint = isHcaptcha
                ? "https://hcaptcha.com/siteverify"
                : "https://www.google.com/recaptcha/api/siteverify";

            JObject verifyJson = null;
            try
            {
                using (var client = new HttpClient())
                using (var payload = new FormUrlEncodedContent(new[]
                {
                    new KeyValuePair<string, string>("secret", secret),
                    new KeyValuePair<string, string>("response", token),
                    new KeyValuePair<string, string>("remoteip", GetClientIpAddress())
                }))
                {
                    var response = await client.PostAsync(verifyEndpoint, payload);
                    var json = await response.Content.ReadAsStringAsync();
                    verifyJson = !string.IsNullOrWhiteSpace(json) ? JObject.Parse(json) : new JObject();
                }
            }
            catch
            {
                return new CaptchaVerificationResult
                {
                    Success = false,
                    FieldKey = captchaField.Key,
                    ErrorMessage = "Could not verify CAPTCHA right now. Please try again."
                };
            }

            var apiSuccess = verifyJson != null && (verifyJson.Value<bool?>("success") ?? false);
            if (!apiSuccess)
            {
                return new CaptchaVerificationResult
                {
                    Success = false,
                    FieldKey = captchaField.Key,
                    ErrorMessage = "CAPTCHA verification failed. Please try again."
                };
            }

            if (string.Equals(mode, "recaptcha_v3", StringComparison.OrdinalIgnoreCase))
            {
                var expectedAction = SanitizeCaptchaAction(ReadWidgetProp(captchaField, "rcAction", "action"));
                var actualAction = (verifyJson.Value<string>("action") ?? string.Empty).Trim();
                var actualScore = verifyJson.Value<double?>("score") ?? 0d;
                var minScore = NormalizeMinScore(ReadWidgetProp(captchaField, "rcMinScore", "minScore"));
                if (!string.Equals(actualAction, expectedAction, StringComparison.Ordinal))
                {
                    return new CaptchaVerificationResult
                    {
                        Success = false,
                        FieldKey = captchaField.Key,
                        ErrorMessage = "CAPTCHA action mismatch. Please try again."
                    };
                }
                if (actualScore < minScore)
                {
                    return new CaptchaVerificationResult
                    {
                        Success = false,
                        FieldKey = captchaField.Key,
                        ErrorMessage = "CAPTCHA score was too low. Please try again."
                    };
                }
            }

            formData[captchaField.Key] = "__captcha_verified__";
            return success;
        }

        private static string MergeSchemaAndSettings(string schemaJson, string settingsJson)
        {
            return RenderModelResolver.ResolveSchemaJson(schemaJson, settingsJson);
        }

        private string GetClientIpAddress()
        {
            var request = HttpContext.Current?.Request;
            if (request == null) return "unknown";

            string ip = request.ServerVariables["HTTP_X_FORWARDED_FOR"];
            if (!string.IsNullOrEmpty(ip))
            {
                // Take first IP if multiple (proxy chain)
                ip = ip.Split(',')[0].Trim();
            }
            else
            {
                ip = request.ServerVariables["REMOTE_ADDR"];
            }
            return ip ?? "unknown";
        }
    }

    // ================================================================
    // SUBMISSIONS MANAGEMENT API (Admin)
    // ================================================================
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class SubmissionsController : DnnApiController
    {
        private UserContext CurrentSubmissionUser
        {
            get
            {
                string ip = string.Empty;
                try
                {
                    if (Request.Properties.ContainsKey("MS_HttpContext"))
                    {
                        var ctx = Request.Properties["MS_HttpContext"] as System.Web.HttpContextWrapper;
                        ip = ctx != null && ctx.Request != null ? (ctx.Request.UserHostAddress ?? string.Empty) : string.Empty;
                    }
                }
                catch { }

                return new UserContext
                {
                    UserId = UserInfo != null ? UserInfo.UserID : 0,
                    UserName = UserInfo != null ? (UserInfo.Username ?? string.Empty) : string.Empty,
                    DisplayName = UserInfo != null ? (UserInfo.DisplayName ?? string.Empty) : string.Empty,
                    Email = UserInfo != null ? (UserInfo.Email ?? string.Empty) : string.Empty,
                    IsAuthenticated = UserInfo != null && UserInfo.UserID > 0,
                    IsAdmin = UserInfo != null && UserInfo.IsInRole("Administrators"),
                    IsSuperUser = UserInfo != null && UserInfo.IsSuperUser,
                    Roles = UserInfo != null && UserInfo.Roles != null ? UserInfo.Roles.ToList() : new List<string>(),
                    IpAddress = ip
                };
            }
        }

        private static bool IsAdminUser(UserContext user)
        {
            return user != null && (user.IsAdmin || user.IsSuperUser);
        }

        private static bool IsPublicSubmissionQueryKey(string queryKey)
        {
            switch ((queryKey ?? string.Empty).Trim().ToLowerInvariant())
            {
                case "public-posts":
                case "recent-posts":
                case "featured-posts":
                case "blog-archive":
                case "popular-posts":
                case "popular-home-posts":
                case "recent-timeline-posts":
                case "rss-feed":
                    return true;
                default:
                    return false;
            }
        }

        private static bool HasExplicitSubmissionViewRule(int formId)
        {
            var rules = PermissionCatalogService.NormalizeRules(formId, FormRepository.GetFormPermissions(formId));
            return rules.Any(p =>
            {
                var t = PermissionCatalogService.NormalizePermissionType(p.PermissionType);
                return string.Equals(t, "view", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(t, "manage", StringComparison.OrdinalIgnoreCase);
            });
        }

        private static bool CanUseSubmissionManagement(int formId, UserContext actor)
        {
            if (IsAdminUser(actor)) return true;
            if (actor == null || !actor.IsAuthenticated) return false;
            if (!HasExplicitSubmissionViewRule(formId)) return false;
            return new PermissionService(new DnnPhase2RepositoryAdapter()).CanView(formId, actor);
        }

        private static bool CanViewSubmissionRow(int formId, SubmissionInfo submission, UserContext actor)
        {
            if (IsAdminUser(actor)) return true;
            if (actor == null || !actor.IsAuthenticated) return false;
            if (!HasExplicitSubmissionViewRule(formId)) return false;
            var permissions = new PermissionService(new DnnPhase2RepositoryAdapter());
            return permissions.CanView(formId, actor) && permissions.CanViewSubmission(formId, submission, actor);
        }

        [HttpGet]
        [AllowAnonymous]
        public HttpResponseMessage List(int formId = 0, string status = null, string search = null,
            string dateFrom = null, string dateTo = null, int pageIndex = 0, int pageSize = 50, string queryKey = null)
        {
            var actor = CurrentSubmissionUser;
            var isAdmin = IsAdminUser(actor);
            var requestedForm = formId > 0 ? FormRepository.GetForm(formId) : null;
            var isPublicListView = requestedForm != null
                && string.Equals(requestedForm.Status, "Published", StringComparison.OrdinalIgnoreCase)
                && IsPublicSubmissionQueryKey(queryKey);

            if (!isAdmin)
            {
                if (formId <= 0)
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId is required." });

                // [MultiPortalAnon v20260528-15] Anon viewing a Renderer Host page on a
                // child-portal alias (e.g. /megaf, PortalId=1) loads JS from the default
                // alias root which maps to PortalSettings.PortalId=0. The form lives on
                // PortalId=1, so the original `form.PortalId != PortalSettings.PortalId`
                // check 404'd every public listview render on child portals. Relax to
                // "form must exist + be Published" — JS-side runtime already knows the
                // formId from the server-rendered mount, so cross-portal access via raw
                // formId is not a new privilege escalation vector for Published forms.
                if (requestedForm == null)
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound);
                }

                if (!isPublicListView && !CanUseSubmissionManagement(formId, actor))
                {
                    return Request.CreateResponse(HttpStatusCode.Forbidden, new { error = "You do not have permission to view submissions for this form." });
                }

                if (pageSize <= 0 || pageSize > 100)
                    pageSize = 100;
            }

            DateTime? from = string.IsNullOrEmpty(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom);
            DateTime? to = string.IsNullOrEmpty(dateTo) ? (DateTime?)null : DateTime.Parse(dateTo);

            var formsRepo = new DnnFormRepository();
            var service = new SubmissionQueryService(new DnnSubmissionRepository(), formsRepo, new DnnFileRepository());
            var hasBoundQuery = !string.IsNullOrWhiteSpace(queryKey);
            var result = service.List(new SubmissionListQuery
            {
                FormId = formId,
                Status = status,
                Search = search,
                DateFrom = from,
                DateTo = to,
                PageIndex = hasBoundQuery ? 0 : pageIndex,
                PageSize = hasBoundQuery ? Math.Max(pageSize, 1000) : pageSize
            });
            result = ApplyDnnListViewQuery(result, queryKey, pageIndex, pageSize);

            if (!isAdmin && !isPublicListView && result.Items != null)
            {
                var visible = result.Items.Where(item => CanViewSubmissionRow(formId, new SubmissionInfo
                {
                    SubmissionId = item.SubmissionId,
                    FormId = item.FormId,
                    UserId = item.UserId,
                    Status = item.Status
                }, actor)).ToList();
                result = new SubmissionPagedResult<SubmissionListItem>
                {
                    Items = visible,
                    TotalCount = visible.Count,
                    PageIndex = result.PageIndex,
                    PageSize = result.PageSize
                };
            }

            if (formId <= 0 && result.Items != null && result.Items.Count > 0)
            {
                var portalForms = FormRepository.GetFormsByPortal(PortalSettings.PortalId) ?? new List<FormInfo>();
                var titles = portalForms.ToDictionary(f => f.FormId, f => f.Title ?? string.Empty);
                var schemas = new Dictionary<int, FormSchema>();
                foreach (var form in portalForms)
                {
                    try
                    {
                        if (!string.IsNullOrWhiteSpace(form.SchemaJson))
                            schemas[form.FormId] = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson);
                    }
                    catch { }
                }

                foreach (var item in result.Items)
                {
                    if (item == null) continue;
                    if (string.IsNullOrWhiteSpace(item.FormTitle))
                    {
                        if (titles.TryGetValue(item.FormId, out var title) && !string.IsNullOrWhiteSpace(title))
                            item.FormTitle = title;
                        else
                            item.FormTitle = $"Deleted form #{item.FormId}";
                    }
                    if (schemas.TryGetValue(item.FormId, out var schema))
                    {
                        var summary = MegaFormUtils.BuildSubmissionSummary(schema, item.DataJson ?? "{}", 200);
                        if (!string.IsNullOrWhiteSpace(summary))
                            item.SummaryText = summary;
                    }
                }
            }

            return Request.CreateResponse(HttpStatusCode.OK, new { items = result.Items, totalCount = result.TotalCount, pageIndex = result.PageIndex, pageSize = result.PageSize });
        }

        private static SubmissionPagedResult<SubmissionListItem> ApplyDnnListViewQuery(
            SubmissionPagedResult<SubmissionListItem> result,
            string queryKey,
            int pageIndex,
            int pageSize)
        {
            if (result == null)
                return result;

            var key = (queryKey ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(key))
                return result;

            var rows = (result.Items ?? new List<SubmissionListItem>()).ToList();
            Func<SubmissionListItem, bool> predicate = item => true;
            IOrderedEnumerable<SubmissionListItem> ordered = null;

            switch (key)
            {
                case "public-posts":
                case "recent-posts":
                    predicate = item => JsonEquals(item, "status", "published");
                    ordered = rows.Where(predicate)
                        .OrderByDescending(item => JsonDate(item, "publish_date") ?? item.SubmittedOnUtc)
                        .ThenByDescending(item => JsonNumber(item, "view_count"));
                    break;
                case "all-posts":
                    ordered = rows
                        .OrderByDescending(item => JsonDate(item, "publish_date") ?? item.SubmittedOnUtc)
                        .ThenByDescending(item => item.SubmittedOnUtc);
                    break;
                case "featured-posts":
                    predicate = item => JsonEquals(item, "status", "published") && JsonBool(item, "is_featured");
                    ordered = rows.Where(predicate)
                        .OrderByDescending(item => JsonNumber(item, "view_count"))
                        .ThenByDescending(item => JsonDate(item, "publish_date") ?? item.SubmittedOnUtc);
                    break;
                case "blog-archive":
                    predicate = item => JsonEquals(item, "status", "published");
                    ordered = rows.Where(predicate)
                        .OrderByDescending(item => JsonDate(item, "publish_date") ?? item.SubmittedOnUtc);
                    break;
                case "archive-posts":
                case "archived-posts":
                    predicate = item => JsonEquals(item, "status", "archived");
                    ordered = rows.Where(predicate)
                        .OrderByDescending(item => JsonDate(item, "publish_date") ?? item.SubmittedOnUtc);
                    break;
                case "rss-feed":
                case "newsletter-candidates":
                    predicate = item => JsonEquals(item, "status", "published") && JsonBool(item, "rss_enabled");
                    if (key == "newsletter-candidates")
                        predicate = item => JsonIn(item, "status", "published", "scheduled") && JsonBool(item, "newsletter_featured");
                    ordered = rows.Where(predicate)
                        .OrderByDescending(item => JsonDate(item, "publish_date") ?? item.SubmittedOnUtc);
                    break;
                case "editorial-review":
                    predicate = item => JsonEquals(item, "status", "in_review");
                    ordered = rows.Where(predicate).OrderByDescending(item => item.SubmittedOnUtc);
                    break;
                case "seo-review":
                    predicate = item => JsonEquals(item, "status", "seo_review");
                    ordered = rows.Where(predicate).OrderByDescending(item => item.SubmittedOnUtc);
                    break;
                case "legal-review":
                    predicate = item => JsonEquals(item, "status", "legal_review");
                    ordered = rows.Where(predicate).OrderByDescending(item => item.SubmittedOnUtc);
                    break;
                case "ready-to-publish":
                    predicate = item => JsonEquals(item, "status", "ready_to_publish");
                    ordered = rows.Where(predicate)
                        .OrderBy(item => JsonDate(item, "publish_date") ?? DateTime.MaxValue);
                    break;
                case "scheduled-posts":
                    predicate = item => JsonEquals(item, "status", "scheduled");
                    ordered = rows.Where(predicate)
                        .OrderBy(item => JsonDate(item, "publish_date") ?? DateTime.MaxValue);
                    break;
                case "publish-calendar":
                case "content-calendar":
                    if (key == "content-calendar")
                        predicate = item => JsonIn(item, "status", "draft", "in_review", "seo_review", "legal_review", "ready_to_publish", "scheduled");
                    else
                        predicate = item => JsonIn(item, "status", "published", "scheduled", "ready_to_publish");
                    ordered = rows.Where(predicate)
                        .OrderBy(item => JsonDate(item, "publish_date") ?? DateTime.MaxValue);
                    break;
                case "seo-gaps":
                    predicate = item =>
                        JsonIn(item, "status", "published", "scheduled", "ready_to_publish", "seo_review") &&
                        (string.IsNullOrWhiteSpace(JsonString(item, "seo_title")) ||
                         string.IsNullOrWhiteSpace(JsonString(item, "seo_description")) ||
                         string.IsNullOrWhiteSpace(JsonString(item, "canonical_url")));
                    ordered = rows.Where(predicate).OrderByDescending(item => item.SubmittedOnUtc);
                    break;
                case "popular-posts":
                    predicate = item => JsonEquals(item, "status", "published");
                    ordered = rows.Where(predicate)
                        .OrderByDescending(item => JsonNumber(item, "view_count"))
                        .ThenByDescending(item => JsonNumber(item, "comment_count"))
                        .ThenByDescending(item => JsonNumber(item, "unique_readers"));
                    break;
                case "popular-home-posts":
                    predicate = item => JsonEquals(item, "status", "published") && !JsonBool(item, "is_featured");
                    ordered = rows.Where(predicate)
                        .OrderByDescending(item => JsonNumber(item, "view_count"))
                        .ThenByDescending(item => JsonNumber(item, "comment_count"))
                        .ThenByDescending(item => JsonNumber(item, "unique_readers"));
                    break;
                case "recent-timeline-posts":
                    predicate = item => RecentTimelineOrder(JsonString(item, "slug")) > 0;
                    ordered = rows.Where(predicate)
                        .OrderBy(item => RecentTimelineOrder(JsonString(item, "slug")));
                    break;
                case "draft-posts":
                case "my-drafts":
                    predicate = item => JsonEquals(item, "status", "draft");
                    ordered = rows.Where(predicate).OrderByDescending(item => item.SubmittedOnUtc);
                    break;
                case "comment-moderation":
                    predicate = item =>
                        JsonIn(item, "status", "published", "scheduled") &&
                        (JsonNumber(item, "comment_count") > 0 ||
                         JsonIn(item, "comment_moderation_state", "review", "open", "locked"));
                    ordered = rows.Where(predicate)
                        .OrderByDescending(item => JsonNumber(item, "comment_count"))
                        .ThenByDescending(item => JsonDate(item, "last_commented_on") ?? DateTime.MinValue)
                        .ThenByDescending(item => JsonNumber(item, "view_count"));
                    break;
                default:
                    ordered = rows.OrderByDescending(item => item.SubmittedOnUtc);
                    break;
            }

            var filtered = (ordered ?? rows.Where(predicate).OrderByDescending(item => item.SubmittedOnUtc)).ToList();
            if (pageSize <= 0) pageSize = result.PageSize > 0 ? result.PageSize : 50;
            if (pageIndex < 0) pageIndex = 0;
            var paged = filtered.Skip(pageIndex * pageSize).Take(pageSize).ToList();

            return new SubmissionPagedResult<SubmissionListItem>
            {
                Items = paged,
                TotalCount = filtered.Count,
                PageIndex = pageIndex,
                PageSize = pageSize
            };
        }

        private static int RecentTimelineOrder(string slug)
        {
            switch ((slug ?? string.Empty).Trim().ToLowerInvariant())
            {
                case "future-design-systems-scale-consistency": return 1;
                case "understanding-react-server-components": return 2;
                case "ai-powered-ux-designing-for-intelligence": return 3;
                case "psychology-of-color-digital-products": return 4;
                case "building-accessible-components-from-scratch": return 5;
                case "typescript-best-practices-large-codebases": return 6;
                case "micro-interactions-that-delight-users": return 7;
                case "state-management-2024-comparison": return 8;
                case "performance-optimization-nextjs": return 9;
                case "art-of-code-review": return 10;
                default: return 0;
            }
        }

        private static JObject SubmissionData(SubmissionListItem item)
        {
            if (item == null || string.IsNullOrWhiteSpace(item.DataJson))
                return new JObject();
            try { return JObject.Parse(item.DataJson); }
            catch { return new JObject(); }
        }

        private static string JsonString(SubmissionListItem item, string field)
        {
            var token = SubmissionData(item)[field];
            return token == null ? string.Empty : token.ToString();
        }

        private static bool JsonEquals(SubmissionListItem item, string field, string value)
        {
            return string.Equals(JsonString(item, field), value, StringComparison.OrdinalIgnoreCase);
        }

        private static bool JsonIn(SubmissionListItem item, string field, params string[] values)
        {
            var actual = JsonString(item, field);
            return values != null && values.Any(v => string.Equals(actual, v, StringComparison.OrdinalIgnoreCase));
        }

        private static bool JsonBool(SubmissionListItem item, string field)
        {
            var value = JsonString(item, field);
            return value == "1" || value.Equals("true", StringComparison.OrdinalIgnoreCase) || value.Equals("yes", StringComparison.OrdinalIgnoreCase);
        }

        private static decimal JsonNumber(SubmissionListItem item, string field)
        {
            var value = JsonString(item, field);
            return decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0m;
        }

        private static DateTime? JsonDate(SubmissionListItem item, string field)
        {
            var value = JsonString(item, field);
            return DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed) ? parsed : (DateTime?)null;
        }

        [HttpGet]
        [AllowAnonymous]
        public HttpResponseMessage Get(int submissionId)
        {
            var service = new SubmissionQueryService(new DnnSubmissionRepository(), new DnnFormRepository(), new DnnFileRepository());
            var detail = service.GetDetail(submissionId);
            if (detail == null) return Request.CreateResponse(HttpStatusCode.NotFound);
            var actor = CurrentSubmissionUser;
            var formId = detail.Form != null ? detail.Form.FormId : (detail.Submission != null ? detail.Submission.FormId : 0);
            if (formId <= 0 || !CanViewSubmissionRow(formId, detail.Submission, actor))
                return Request.CreateResponse(HttpStatusCode.Forbidden, new { error = "You do not have permission to view this submission." });

            detail.WorkflowDetail = new SubmissionWorkflowDetailService(
                new DnnWorkflowRepository(),
                new WorkflowTransparencyService()).GetDetail(detail);

            // [SubmissionDetailData v20260518-10] `values` is FlattenedValues —
            // a List<KVP<label, displayValue>> for the activity timeline.
            // The detail-shell Data tab reads values keyed by field KEY (not
            // label), so also return `data` = parsed DataJson dictionary so the
            // shell can populate the editable inputs.
            Dictionary<string, object> parsedData = null;
            try
            {
                if (!string.IsNullOrWhiteSpace(detail.Submission?.DataJson))
                    parsedData = JsonConvert.DeserializeObject<Dictionary<string, object>>(detail.Submission.DataJson);
            }
            catch { /* leave null on parse failure */ }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                submission = detail.Submission,
                form = detail.Form,
                schema = detail.Schema,
                files = detail.Files,
                values = detail.FlattenedValues,
                data = parsedData ?? new Dictionary<string, object>(),
                fieldSnapshots = detail.FieldSnapshots,
                hasSnapshot = detail.HasSnapshot,
                workflowDetail = detail.WorkflowDetail
            });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage UpdateStatus(int submissionId, string status)
        {
            FormRepository.UpdateSubmissionStatus(submissionId, status);
            return Request.CreateResponse(HttpStatusCode.OK, new { message = "Status updated." });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage UpdateData(int submissionId, [FromBody] Dictionary<string, object> data)
        {
            if (data == null) return Request.CreateResponse(HttpStatusCode.BadRequest, "No data provided.");
            var dataJson = JsonConvert.SerializeObject(data);
            FormRepository.UpdateSubmissionData(submissionId, dataJson);
            return Request.CreateResponse(HttpStatusCode.OK, new { message = "Submission updated." });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Delete(int submissionId)
        {
            try
            {
                FormRepository.DeleteSubmission(submissionId);
                return Request.CreateResponse(HttpStatusCode.OK, new { message = "Submission deleted." });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { message = ex.Message });
            }
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage BulkDelete([FromBody] BulkDeleteRequest req)
        {
            if (req?.Ids == null || req.Ids.Count == 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { message = "No IDs provided." });
            int deleted = 0;
            int failed = 0;
            int notFound = 0;
            var failures = new List<object>();
            foreach (var id in req.Ids)
            {
                try
                {
                    var rows = FormRepository.DeleteSubmissionWithCount(id);
                    if (rows > 0) deleted++;
                    else notFound++; // sproc ran but ID didn't exist
                }
                catch (Exception ex)
                {
                    failed++;
                    if (failures.Count < 10) failures.Add(new { id, error = ex.Message });
                }
            }
            // [B33] Client now reads `deleted` + `failed` + `notFound` instead of trusting r.ok.
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                deleted,
                failed,
                notFound,
                requested = req.Ids.Count,
                failures,
                message = $"{deleted} of {req.Ids.Count} submission(s) deleted"
                          + (failed > 0 ? $" ({failed} failed)" : "")
                          + (notFound > 0 ? $" ({notFound} not found)" : "")
                          + "."
            });
        }

        public class BulkDeleteRequest
        {
            public List<int> Ids { get; set; }
        }

        [HttpGet]
        public HttpResponseMessage Export(int formId, string dateFrom = null, string dateTo = null, string format = "json")
        {
            DateTime? from = string.IsNullOrEmpty(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom);
            DateTime? to = string.IsNullOrEmpty(dateTo) ? (DateTime?)null : DateTime.Parse(dateTo);

            var submissions = FormRepository.ExportSubmissions(formId, from, to);

            if (format == "csv")
            {
                var csv = ExportToCsv(formId, submissions);
                var response = new HttpResponseMessage(HttpStatusCode.OK);
                response.Content = new StringContent(csv, System.Text.Encoding.UTF8, "text/csv");
                response.Content.Headers.ContentDisposition = new System.Net.Http.Headers.ContentDispositionHeaderValue("attachment")
                {
                    FileName = $"submissions_{formId}_{DateTime.UtcNow:yyyyMMdd}.csv"
                };
                return response;
            }

            return Request.CreateResponse(HttpStatusCode.OK, submissions);
        }

        private string ExportToCsv(int formId, List<SubmissionInfo> submissions)
        {
            if (submissions.Count == 0) return "No data";

            var form = FormRepository.GetForm(formId);
            FormSchema schema = null;
            try { schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson); } catch { }

            var headers = new List<string> { "SubmissionId", "SubmittedOnUtc", "IpAddress", "Status" };
            var fieldKeys = new List<string>();

            if (schema?.Fields != null)
            {
                foreach (var f in MegaFormUtils.FlattenFields(schema.Fields).Where(f => f.Type != "Html" && f.Type != "Section"))
                {
                    headers.Add(f.Label ?? f.Key);
                    fieldKeys.Add(f.Key);
                }
            }

            var sb = new System.Text.StringBuilder();
            sb.AppendLine(string.Join(",", headers.Select(EscapeCsv)));

            foreach (var sub in submissions)
            {
                var row = new List<string>
                {
                    sub.SubmissionId.ToString(),
                    sub.SubmittedOnUtc.ToString("yyyy-MM-dd HH:mm:ss"),
                    sub.IpAddress ?? "",
                    sub.Status
                };

                var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(sub.DataJson)
                           ?? new Dictionary<string, object>();

                foreach (var key in fieldKeys)
                {
                    row.Add(data.ContainsKey(key) ? data[key]?.ToString() ?? "" : "");
                }

                sb.AppendLine(string.Join(",", row.Select(EscapeCsv)));
            }

            return sb.ToString();
        }

        private static string EscapeCsv(string field)
        {
            if (field.Contains(",") || field.Contains("\"") || field.Contains("\n"))
                return "\"" + field.Replace("\"", "\"\"") + "\"";
            return field;
        }
    }

    // ================================================================
    // THEME API (Public — serves theme list for builder)
    // ================================================================
    [AllowAnonymous]
    public class ThemeController : DnnApiController
    {
        /// <summary>GET api/Theme/List — Returns all built-in themes</summary>
        [HttpGet]
        public HttpResponseMessage List()
        {
            var themes = MegaForm.DNN.Providers.ThemeProvider.GetBuiltInThemes();
            return Request.CreateResponse(HttpStatusCode.OK, themes);
        }

        /// <summary>GET api/Theme/Get?themeId=modern-blue — Returns single theme definition</summary>
        [HttpGet]
        public HttpResponseMessage Get(string themeId)
        {
            var themes = MegaForm.DNN.Providers.ThemeProvider.GetBuiltInThemes();
            var theme = themes.Find(t => t.Id == themeId);
            if (theme == null) return Request.CreateResponse(HttpStatusCode.NotFound);
            return Request.CreateResponse(HttpStatusCode.OK, theme);
        }
    }

    // ================================================================
    // SAVE & CONTINUE API (Public)
    // ================================================================
    [AllowAnonymous]
    public class DraftController : DnnApiController
    {
        /// <summary>POST api/Draft/Save — Save form progress for later</summary>
        [HttpPost]
        public HttpResponseMessage Save([FromBody] JObject body)
        {
            int formId = body.Value<int>("formId");
            string resumeToken = body.Value<string>("resumeToken") ?? Guid.NewGuid().ToString("N");
            string dataJson = body["data"]?.ToString() ?? "{}";
            string email = body.Value<string>("email");
            string ip = HttpContext.Current?.Request?.ServerVariables["REMOTE_ADDR"] ?? "";

            var form = FormRepository.GetForm(formId);
            if (form == null || !form.EnableSaveResume)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Save & Continue is not enabled." });

            FormSchema schema = null;
            try { schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson); } catch { }
            int days = schema?.Settings?.SaveAndContinueDays ?? 30;

            var draft = new SavedDraftInfo
            {
                FormId = formId,
                ResumeToken = resumeToken,
                DataJson = dataJson,
                Email = email,
                IpAddress = ip,
                ExpiresOnUtc = DateTime.UtcNow.AddDays(days)
            };

            FormRepository.SaveDraft(draft);
            return Request.CreateResponse(HttpStatusCode.OK, new { resumeToken, expiresOn = draft.ExpiresOnUtc });
        }

        /// <summary>GET api/Draft/Load?token=abc123 — Load saved draft</summary>
        [HttpGet]
        public HttpResponseMessage Load(string token)
        {
            var draft = FormRepository.GetDraft(token);
            if (draft == null)
                return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Draft not found or expired." });

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                formId = draft.FormId,
                data = draft.DataJson,
                savedOn = draft.CreatedOnUtc,
                expiresOn = draft.ExpiresOnUtc
            });
        }
    }

    // =========================================================
    //  TEMPLATE IMPORT CONTROLLER
    //  POST api/Templates/Import — Import template JSON as new form
    //  POST api/Templates/Validate — Validate template without saving
    // =========================================================
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class TemplatesController : DnnApiController
    {
        /// <summary>POST api/Templates/Import — Create form from template JSON</summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Import([FromBody] JObject body)
        {
            try
            {
                var template = TemplateSchemaCanonicalizer.Canonicalize(body);
                if (template == null)
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Empty template" });

                // Extract meta
                var meta = template["meta"];
                var form = template["form"];
                var fields = template["fields"];
                var theme = template["theme"];
                var translations = template["translations"];

                if (fields == null || !fields.HasValues)
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Template has no fields" });

                string title = form?["title"]?.ToString() ?? meta?["name"]?.ToString() ?? "Imported Form";
                string description = form?["description"]?.ToString() ?? "";
                string submitText = form?["submitButtonText"]?.ToString() ?? "Submit";
                string successMsg = form?["successMessage"]?.ToString() ?? "Thank you!";

                // Build schema
                var schema = new JObject();
                schema["version"] = "2.0";
                schema["fields"] = fields;

                // Settings from form object
                var settings = new JObject();
                var formSettings = form?["settings"] as JObject;
                if (formSettings != null)
                {
                    settings = formSettings.DeepClone() as JObject;
                }
                schema["settings"] = settings;

                // Add translations if present
                if (translations != null && translations.HasValues)
                {
                    schema["translations"] = translations;
                }

                // Auto-assign order if missing
                int order = 0;
                foreach (var field in fields)
                {
                    if (field["order"] == null) field["order"] = order;
                    order++;
                }

                // Validate field keys unique
                var keys = fields.Select(f => f["key"]?.ToString()).Where(k => !string.IsNullOrEmpty(k)).ToList();
                if (keys.Count != keys.Distinct().Count())
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Duplicate field keys found" });

                // Create FormInfo
                var formInfo = new FormInfo
                {
                    ModuleId = ActiveModule.ModuleID,
                    PortalId = PortalSettings.PortalId,
                    Title = title,
                    Description = description,
                    SchemaJson = schema.ToString(Newtonsoft.Json.Formatting.None),
                    Status = "Draft",
                    SubmitButtonText = submitText,
                    SuccessMessage = successMsg,
                    CreatedByUserId = UserInfo.UserID,
                    CreatedOnUtc = DateTime.UtcNow
                };

                // Theme
                if (theme != null && theme.HasValues)
                {
                    formInfo.ThemeJson = theme.ToString(Newtonsoft.Json.Formatting.None);
                }

                int formId = FormRepository.SaveForm(formInfo);

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    formId = formId,
                    title = title,
                    fieldCount = fields.Count()
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = ex.Message });
            }
        }

        /// <summary>POST api/Templates/Validate — Validate template JSON without saving</summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Validate([FromBody] JObject body)
        {
            var errors = new List<string>();
            var template = TemplateSchemaCanonicalizer.Canonicalize(body);

            if (template == null) { errors.Add("Empty template"); goto done; }

            var fields = template["fields"];
            if (fields == null || !fields.HasValues) { errors.Add("No fields"); goto done; }

            int idx = 0;
            var keys = new HashSet<string>();
            foreach (var field in fields)
            {
                string key = field["key"]?.ToString();
                string type = field["type"]?.ToString();
                string label = field["label"]?.ToString();

                if (string.IsNullOrEmpty(key)) errors.Add($"Field [{idx}]: missing 'key'");
                if (string.IsNullOrEmpty(type)) errors.Add($"Field [{idx}]: missing 'type'");
                if (string.IsNullOrEmpty(label) && type != "Hidden") errors.Add($"Field [{idx}]: missing 'label'");

                if (!string.IsNullOrEmpty(key))
                {
                    if (!keys.Add(key)) errors.Add($"Field [{idx}]: duplicate key '{key}'");
                    if (!System.Text.RegularExpressions.Regex.IsMatch(key, @"^[a-zA-Z][a-zA-Z0-9_]{0,49}$"))
                        errors.Add($"Field [{idx}]: invalid key format '{key}'");
                }

                // Check options for choice types
                if (type == "Select" || type == "Radio" || type == "Checkbox")
                {
                    var options = field["options"];
                    if (options == null || !options.HasValues)
                        errors.Add($"Field [{idx}] ({key}): {type} requires 'options' array");
                }

                idx++;
            }

            done:
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                valid = errors.Count == 0,
                errors = errors,
                fieldCount = template?["fields"]?.Count() ?? 0
            });
        }
    }

    // ================================================================
    // PHASE 2 — Multi-view configuration per module
    // GET  api/Phase2/GetViewConfigs?formId=N
    // POST api/Phase2/SaveViewConfig
    // POST api/Phase2/DeleteViewConfig?viewId=N
    // ================================================================
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class Phase2Controller : DnnApiController
    {
        [HttpGet]
        [ActionName("GetViewConfigs")]
        public HttpResponseMessage GetViewConfigs(int formId)
        {
            try
            {
                var views = MegaForm.DNN.Data.FormRepository.GetFormViews(formId);
                return Request.CreateResponse(HttpStatusCode.OK, new { views });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = ex.Message });
            }
        }

        [HttpPost]
        [ActionName("SaveViewConfig")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage SaveViewConfig([FromBody] JObject body)
        {
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });
            try
            {
                var view = new MegaForm.Core.Models.FormViewInfo
                {
                    ViewId          = body.Value<int>("viewId"),
                    FormId          = body.Value<int>("formId"),
                    ViewKey         = body.Value<string>("viewKey") ?? "default",
                    ViewType        = body.Value<string>("viewType") ?? "submit",
                    ViewName        = body.Value<string>("viewName") ?? "",
                    IsDefault       = body.Value<bool?>("isDefault") ?? false,
                    SortOrder       = body.Value<int?>("sortOrder") ?? 0,
                    ConfigJson      = body["viewConfig"]?.ToString() ?? body["configJson"]?.ToString(),
                    CustomCss       = body.Value<string>("cssClass"),
                    PermissionsJson = body["permissions"]?.ToString(),
                };
                int viewId = MegaForm.DNN.Data.FormRepository.SaveFormView(view);
                return Request.CreateResponse(HttpStatusCode.OK, new { viewId });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = ex.Message });
            }
        }

        [HttpPost]
        [ActionName("DeleteViewConfig")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage DeleteViewConfig(int? viewId, [FromBody] JObject body = null)
        {
            int id = viewId ?? body?.Value<int>("viewId") ?? 0;
            if (id == 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "viewId required" });
            try
            {
                MegaForm.DNN.Data.FormRepository.DeleteFormView(id);
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = ex.Message });
            }
        }

        // ============================================================
        //  APP BUILDER CRUD — [AppBuilderCRUD v20260519-04]
        //  GET   /Phase2/AppDefinitionList
        //  GET   /Phase2/AppDefinitionGet?appKey=X
        //  POST  /Phase2/AppDefinitionSave    (body=app metadata)
        //  POST  /Phase2/AppDefinitionDelete  (body={ appId })
        //  POST  /Phase2/AppDefinitionAssignForm (body={ formId, appScope, assign })
        // ============================================================

        private MegaForm.Core.Services.AppDefinitionService BuildAppDefinitionService()
        {
            return new MegaForm.Core.Services.AppDefinitionService(
                MegaForm.DNN.Services.DnnServiceLocator.Instance.Phase2Repo,
                MegaForm.DNN.Services.DnnServiceLocator.Instance.FormRepo,
                new MegaForm.Core.Services.AppProfileService());
        }

        [HttpGet]
        [ActionName("AppDefinitionDiag")]
        public HttpResponseMessage AppDefinitionDiag(string scope)
        {
            // Diagnostic: dump what ListForms returns + which form rows match the scope filter
            try
            {
                var portalId = PortalSettings.PortalId;
                var allForms = MegaForm.DNN.Services.DnnServiceLocator.Instance.FormRepo.ListForms(portalId, null, null, 0, 1000);
                var matches = allForms.Where(f => string.Equals(f.AppScope ?? "", scope ?? "", StringComparison.OrdinalIgnoreCase)).ToList();
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    portalId,
                    requestedScope = scope,
                    totalForms = allForms.Count,
                    matchedForms = matches.Select(f => new { f.FormId, f.Title, f.AppScope }).ToList(),
                    allScopes = allForms.Select(f => f.AppScope).Distinct().ToList()
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message, stack = ex.StackTrace });
            }
        }

        [HttpGet]
        [ActionName("AppDefinitionList")]
        public HttpResponseMessage AppDefinitionList()
        {
            try
            {
                var svc = BuildAppDefinitionService();
                var portalId = PortalSettings.PortalId;
                var apps = svc.List(portalId);
                var items = apps.Select(a =>
                {
                    var bundle = svc.GetByScope(portalId, a.AppScope, hydrateManifest: false);
                    return new
                    {
                        appId = a.AppId,
                        appKey = a.AppKey,
                        appName = a.AppName,
                        appScope = a.AppScope,
                        description = a.Description,
                        icon = a.Icon,
                        accentColor = a.AccentColor,
                        isEnabled = a.IsEnabled,
                        sortOrder = a.SortOrder,
                        formCount = bundle != null && bundle.Forms != null ? bundle.Forms.Count : 0,
                        createdOnUtc = a.CreatedOnUtc,
                        modifiedOnUtc = a.ModifiedOnUtc
                    };
                }).ToList();
                return Request.CreateResponse(HttpStatusCode.OK, new { items });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        [HttpGet]
        [ActionName("AppDefinitionGet")]
        public HttpResponseMessage AppDefinitionGet(string appKey)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(appKey))
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "appKey required" });
                var bundle = BuildAppDefinitionService().Get(PortalSettings.PortalId, appKey, hydrateManifest: true);
                if (bundle == null) return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Not found" });
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    app = bundle.App,
                    forms = bundle.Forms.Select(f => new { formId = f.FormId, title = f.Title, status = f.Status, appScope = f.AppScope }).ToList(),
                    views = bundle.Views,
                    queries = bundle.Queries,
                    manifest = bundle.Manifest
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("AppDefinitionSave")]
        public HttpResponseMessage AppDefinitionSave([FromBody] JObject body)
        {
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });
            try
            {
                var portalId = PortalSettings.PortalId;
                var existingKey = body.Value<string>("appKey");
                MegaForm.Core.Models.AppDefinitionInfo app;
                if (!string.IsNullOrWhiteSpace(existingKey))
                {
                    var existing = MegaForm.DNN.Services.DnnServiceLocator.Instance.Phase2Repo.GetAppDefinition(portalId, existingKey);
                    app = existing ?? new MegaForm.Core.Models.AppDefinitionInfo { AppId = body.Value<int?>("appId") ?? 0 };
                }
                else
                {
                    app = new MegaForm.Core.Models.AppDefinitionInfo { AppId = body.Value<int?>("appId") ?? 0 };
                }
                app.PortalId    = portalId;
                app.AppKey      = body.Value<string>("appKey")      ?? app.AppKey;
                app.AppName     = body.Value<string>("appName")     ?? app.AppName;
                app.AppScope    = body.Value<string>("appScope")    ?? app.AppScope;
                app.Description = body.Value<string>("description") ?? app.Description;
                app.Icon        = body.Value<string>("icon")        ?? app.Icon;
                app.AccentColor = body.Value<string>("accentColor") ?? app.AccentColor;
                app.IsEnabled   = body.Value<bool?>("isEnabled") ?? app.IsEnabled;
                app.SortOrder   = body.Value<int?>("sortOrder") ?? app.SortOrder;
                if (app.AppId == 0) app.CreatedByUserId = UserInfo?.UserID ?? 0;
                app.ModifiedByUserId = UserInfo?.UserID ?? 0;
                var savedId = BuildAppDefinitionService().Save(app, null);
                return Request.CreateResponse(HttpStatusCode.OK, new { appId = savedId, appKey = app.AppKey, appScope = app.AppScope });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("AppDefinitionDelete")]
        public HttpResponseMessage AppDefinitionDelete([FromBody] JObject body)
        {
            try
            {
                int appId = (body != null ? body.Value<int?>("appId") : null) ?? 0;
                if (appId <= 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "appId required" });
                BuildAppDefinitionService().Delete(appId);
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("AppDefinitionAssignForm")]
        public HttpResponseMessage AppDefinitionAssignForm([FromBody] JObject body)
        {
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });
            try
            {
                int formId = body.Value<int?>("formId") ?? 0;
                var appScope = body.Value<string>("appScope") ?? string.Empty;
                bool assign = body.Value<bool?>("assign") ?? true;
                if (formId <= 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId required" });
                var form = MegaForm.DNN.Services.DnnServiceLocator.Instance.FormRepo.GetForm(formId);
                if (form == null) return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Form not found" });
                form.AppScope = assign ? appScope : string.Empty;
                MegaForm.DNN.Services.DnnServiceLocator.Instance.FormRepo.SaveForm(form);
                return Request.CreateResponse(HttpStatusCode.OK, new { formId, appScope = form.AppScope, assign });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }
    }


    // ================================================================
    // UPLOAD FILE — Form submission file uploads (AllowAnonymous)
    // POST api/Upload/File  — multipart: file + formId + fieldKey
    // ================================================================
    [AllowAnonymous]
    public class UploadFileController : DnnApiController
    {
        // [PdfFormUploadDnn v20260506-11] Anonymous-allowed by default; the action body
        // still enforces form.RequireAuth + field-type whitelist + size policy.
        // Without [AllowAnonymous] DNN's default ApiAuthorizationFilter rejects POSTs
        // from non-admin users with 401 → end-user PDF submissions silently lost the
        // filled-PDF attachment with the "Authorization has been denied" error.
        private const string PdfFormUploadDnnBadge = "PdfFormUploadDnn v20260506-11";

        [HttpPost]
        [ActionName("File")]
        [AllowAnonymous]
        public async System.Threading.Tasks.Task<HttpResponseMessage> UploadFile()
        {
            _ = PdfFormUploadDnnBadge;
            string tempFolder = null;
            try
            {
                if (!Request.Content.IsMimeMultipartContent())
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Multipart content expected" });

                tempFolder = Path.Combine(Path.GetTempPath(), "MegaFormUploads", Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(tempFolder);

                var provider = new MultipartFormDataStreamProvider(tempFolder);
                await Request.Content.ReadAsMultipartAsync(provider);

                int formId = 0;
                if (provider.FormData["formId"] != null)
                    int.TryParse(provider.FormData["formId"], out formId);
                var fieldKey = provider.FormData["fieldKey"];

                if (formId <= 0 || string.IsNullOrWhiteSpace(fieldKey))
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId and fieldKey required" });

                var form = MegaForm.DNN.Data.FormRepository.GetForm(formId);
                if (form == null || !string.Equals(form.Status, "Published", StringComparison.OrdinalIgnoreCase))
                    return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Published form not found" });
                if (form.RequireAuth && (UserInfo == null || UserInfo.UserID <= 0))
                    return Request.CreateResponse(HttpStatusCode.Unauthorized, new { error = "Authentication required for uploads" });

                MegaForm.Core.Models.FormSchema schema = null;
                try { schema = Newtonsoft.Json.JsonConvert.DeserializeObject<MegaForm.Core.Models.FormSchema>(form.SchemaJson ?? "{}"); } catch { }
                var fileField = MegaForm.Core.Utilities.MegaFormUtils
                    .FlattenFields(schema?.Fields ?? new System.Collections.Generic.List<MegaForm.Core.Models.FormField>())
                    .FirstOrDefault(f => string.Equals(f.Key, fieldKey, StringComparison.OrdinalIgnoreCase)
                                      && (string.Equals(f.Type, "File", StringComparison.OrdinalIgnoreCase)
                                       || string.Equals(f.Type, "PdfForm", StringComparison.OrdinalIgnoreCase)));
                if (fileField == null)
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Invalid file field" });
                var isPdfFormField = string.Equals(fileField.Type, "PdfForm", StringComparison.OrdinalIgnoreCase);

                if (provider.FileData == null || provider.FileData.Count == 0)
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "No file uploaded" });

                var uploadPolicy = GetUploadPolicy();
                var fileData = provider.FileData[0];
                var originalName = Path.GetFileName(fileData.Headers.ContentDisposition?.FileName?.Trim('"') ?? string.Empty);
                var ext = (Path.GetExtension(originalName) ?? string.Empty).Trim().ToLowerInvariant();
                if (string.IsNullOrWhiteSpace(ext))
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "File type is required" });

                var fieldAllowed = isPdfFormField
                    ? FileUploadSecurityService.ParseExtensions(new[] { ".pdf" })
                    : FileUploadSecurityService.ParseExtensions(fileField.FileSettings != null ? fileField.FileSettings.AllowedExtensions : null);
                var globalAllowed = FileUploadSecurityService.ParseExtensions(uploadPolicy.AllowedExtensionsCsv);
                var globalBlocked = FileUploadSecurityService.ParseExtensions(uploadPolicy.BlockedExtensionsCsv);
                if (globalBlocked.Contains(ext))
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "This file type is blocked by system policy" });

                var effectiveAllowed = fieldAllowed.Count > 0
                    ? new HashSet<string>(fieldAllowed.Where(x => globalAllowed.Count == 0 || globalAllowed.Contains(x)), StringComparer.OrdinalIgnoreCase)
                    : new HashSet<string>(globalAllowed, StringComparer.OrdinalIgnoreCase);
                if (effectiveAllowed.Count > 0 && !effectiveAllowed.Contains(ext))
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "File type not allowed. Accepted: " + string.Join(", ", effectiveAllowed.OrderBy(x => x)) });

                var tempFilePath = fileData.LocalFileName;
                var tempInfo = new System.IO.FileInfo(tempFilePath);
                var fileSize = tempInfo.Exists ? tempInfo.Length : 0L;
                var fieldMaxMb = isPdfFormField
                    ? uploadPolicy.MaxSizeMb
                    : (fileField.FileSettings != null ? fileField.FileSettings.MaxSizeMB : uploadPolicy.MaxSizeMb);
                var maxSizeMb = Math.Max(1, Math.Min(uploadPolicy.MaxSizeMb, fieldMaxMb));
                var maxBytes = (long)maxSizeMb * 1024L * 1024L;
                if (fileSize <= 0)
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "No file uploaded" });
                if (fileSize > maxBytes)
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = string.Format("File too large (max {0}MB)", maxSizeMb) });

                using (var validationStream = File.OpenRead(tempFilePath))
                {
                    if (!FileUploadSecurityService.ValidateContentByExtension(validationStream, ext))
                        return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "File content does not match its type. Possible security risk." });
                }

                var appDataRoot = System.Web.Hosting.HostingEnvironment.MapPath("~/App_Data/MegaForm/PrivateUploads")
                    ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "App_Data", "MegaForm", "PrivateUploads");
                var safeFieldKey = FileUploadSecurityService.SanitizePathSegment(fileField.Key ?? fieldKey, "file");
                var folder = Path.Combine(appDataRoot, "form-" + formId, "field-" + safeFieldKey);
                if (!Directory.Exists(folder)) Directory.CreateDirectory(folder);

                var safeName = Guid.NewGuid().ToString("N").Substring(0, 16) + ext;
                var filePath = Path.Combine(folder, safeName);
                using (var source = new FileStream(tempFilePath, FileMode.Open, FileAccess.Read, FileShare.Read))
                using (var target = new FileStream(filePath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    await source.CopyToAsync(target);
                }

                var relativePath = "form-" + formId + "/field-" + safeFieldKey + "/" + safeName;
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    fileId      = 0,
                    fileName    = originalName,
                    fileSize,
                    contentType = fileData.Headers.ContentType != null ? fileData.Headers.ContentType.MediaType : "application/octet-stream",
                    fileUrl     = "/DesktopModules/MegaForm/API/Files/Download?path=" + Uri.EscapeDataString(relativePath),
                    tempPath    = relativePath,
                    storedIn    = "private"
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = "Upload failed: " + ex.Message });
            }
            finally
            {
                TryDeleteDirectory(tempFolder);
            }
        }

        private (int MaxSizeMb, string AllowedExtensionsCsv, string BlockedExtensionsCsv) GetUploadPolicy()
        {
            var maxSize = 10;
            int.TryParse(PortalController.GetPortalSetting("MegaForm_Upload_MaxSizeMB", PortalSettings != null ? PortalSettings.PortalId : -1, "10"), out maxSize);
            if (maxSize <= 0) maxSize = 10;
            return (
                maxSize,
                FileUploadSecurityService.NormalizeExtensionsCsv(
                    PortalController.GetPortalSetting("MegaForm_Upload_AllowedExtensions", PortalSettings != null ? PortalSettings.PortalId : -1, FileUploadSecurityService.GetDefaultAllowedExtensionsCsv()),
                    FileUploadSecurityService.GetDefaultAllowedExtensionsCsv()),
                FileUploadSecurityService.NormalizeExtensionsCsv(
                    PortalController.GetPortalSetting("MegaForm_Upload_BlockedExtensions", PortalSettings != null ? PortalSettings.PortalId : -1, FileUploadSecurityService.GetDefaultBlockedExtensionsCsv()),
                    FileUploadSecurityService.GetDefaultBlockedExtensionsCsv())
            );
        }

        private static void TryDeleteDirectory(string path)
        {
            try
            {
                if (!string.IsNullOrWhiteSpace(path) && Directory.Exists(path))
                    Directory.Delete(path, true);
            }
            catch { }
        }
    }

    // ================================================================
    // PDF FORM TEMPLATES — Admin uploads a PDF used as the background of a
    // PdfForm widget. Stored in the portal's public folder so PDF.js can
    // fetch it client-side. Returns the public URL for the Builder to save
    // into widgetProps.pdfUrl.
    //
    // POST api/PdfForm/UploadTemplate  (multipart: file)
    // Auth: Administrators (Host falls under Administrators role check too)
    // ================================================================
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class PdfFormController : DnnApiController
    {
        private const string PdfFormAdminUploadDnnBadge = "PdfFormAdminUploadDnn v20260506-01";

        [HttpPost]
        [ActionName("UploadTemplate")]
        public async System.Threading.Tasks.Task<HttpResponseMessage> UploadTemplate()
        {
            _ = PdfFormAdminUploadDnnBadge;
            string tempFolder = null;
            try
            {
                if (!Request.Content.IsMimeMultipartContent())
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Multipart content expected" });

                tempFolder = Path.Combine(Path.GetTempPath(), "MegaFormPdfTemplates", Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(tempFolder);

                var provider = new MultipartFormDataStreamProvider(tempFolder);
                await Request.Content.ReadAsMultipartAsync(provider);

                if (provider.FileData == null || provider.FileData.Count == 0)
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "No file uploaded" });

                var fileData = provider.FileData[0];
                var originalName = Path.GetFileName(fileData.Headers.ContentDisposition?.FileName?.Trim('"') ?? string.Empty);
                var ext = (Path.GetExtension(originalName) ?? string.Empty).Trim().ToLowerInvariant();
                if (!string.Equals(ext, ".pdf", StringComparison.OrdinalIgnoreCase))
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Only .pdf files are accepted" });

                var tempFilePath = fileData.LocalFileName;
                var tempInfo = new System.IO.FileInfo(tempFilePath);
                var fileSize = tempInfo.Exists ? tempInfo.Length : 0L;
                if (fileSize <= 0)
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Empty file" });

                // Cap admin uploads to a reasonable size (50 MB)
                const long MaxBytes = 50L * 1024L * 1024L;
                if (fileSize > MaxBytes)
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "PDF too large (max 50 MB)" });

                // Validate magic bytes (PDF starts with %PDF-)
                using (var validationStream = File.OpenRead(tempFilePath))
                {
                    var head = new byte[5];
                    var read = validationStream.Read(head, 0, 5);
                    if (read < 5 || head[0] != 0x25 || head[1] != 0x50 || head[2] != 0x44 || head[3] != 0x46 || head[4] != 0x2D)
                        return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "File is not a valid PDF (missing %PDF- header)" });
                }

                var portalId = PortalSettings != null ? PortalSettings.PortalId : 0;
                var publicRoot = System.Web.Hosting.HostingEnvironment.MapPath("~/Portals/" + portalId + "/MegaForm/PdfTemplates");
                if (string.IsNullOrEmpty(publicRoot))
                    return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = "Could not resolve portal folder" });
                if (!Directory.Exists(publicRoot)) Directory.CreateDirectory(publicRoot);

                // Filename: <slugified-original>-<short-guid>.pdf
                var slug = SlugifyName(Path.GetFileNameWithoutExtension(originalName));
                if (slug.Length > 60) slug = slug.Substring(0, 60);
                var shortId = Guid.NewGuid().ToString("N").Substring(0, 8);
                var safeName = (string.IsNullOrEmpty(slug) ? "pdf" : slug) + "-" + shortId + ".pdf";
                var filePath = Path.Combine(publicRoot, safeName);

                using (var source = new FileStream(tempFilePath, FileMode.Open, FileAccess.Read, FileShare.Read))
                using (var target = new FileStream(filePath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    await source.CopyToAsync(target);
                }

                var publicUrl = "/Portals/" + portalId + "/MegaForm/PdfTemplates/" + safeName;
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    fileName = originalName,
                    fileSize,
                    fileUrl  = publicUrl,
                    storedIn = "portal-public"
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = "Upload failed: " + ex.Message });
            }
            finally
            {
                try { if (!string.IsNullOrWhiteSpace(tempFolder) && Directory.Exists(tempFolder)) Directory.Delete(tempFolder, true); } catch { }
            }
        }

        private static string SlugifyName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return "pdf";
            var sb = new StringBuilder(name.Length);
            foreach (var ch in name.ToLowerInvariant())
            {
                if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) sb.Append(ch);
                else if (ch == ' ' || ch == '-' || ch == '_' || ch == '.') sb.Append('-');
            }
            var s = sb.ToString().Trim('-');
            while (s.Contains("--")) s = s.Replace("--", "-");
            return s;
        }
    }

    // ================================================================
    // FILES DOWNLOAD — Private uploaded files for form submissions
    // GET api/Files/Download?path=...  (requires auth)
    // ================================================================
    [DnnAuthorize]
    public class FilesController : DnnApiController
    {
        [HttpGet]
        [ActionName("Download")]
        public HttpResponseMessage Download(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return Request.CreateResponse(HttpStatusCode.NotFound);

            // [SecFix P1-8] Canonical-path containment (GetFullPath resolves any `..`); the old
            // `path.Replace("..","")` sanitiser is bypassable.
            var appDataRoot = System.Web.Hosting.HostingEnvironment.MapPath("~/App_Data/MegaForm/PrivateUploads")
                ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "App_Data", "MegaForm", "PrivateUploads");
            appDataRoot = Path.GetFullPath(appDataRoot);
            var rel = path.TrimStart('/', '\\').Replace('/', Path.DirectorySeparatorChar);
            var fullPath = Path.GetFullPath(Path.Combine(appDataRoot, rel));
            var rootWithSep = appDataRoot.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;

            if (!fullPath.StartsWith(rootWithSep, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
                return Request.CreateResponse(HttpStatusCode.NotFound);

            var bytes = File.ReadAllBytes(fullPath);
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new System.Net.Http.ByteArrayContent(bytes)
            };
            var ext = (Path.GetExtension(fullPath) ?? "").ToLowerInvariant();
            string mime;
            switch (ext)
            {
                case ".pdf":  mime = "application/pdf"; break;
                case ".jpg":
                case ".jpeg": mime = "image/jpeg"; break;
                case ".png":  mime = "image/png"; break;
                case ".gif":  mime = "image/gif"; break;
                case ".doc":  mime = "application/msword"; break;
                case ".docx": mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; break;
                case ".xls":  mime = "application/vnd.ms-excel"; break;
                case ".xlsx": mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; break;
                case ".zip":  mime = "application/zip"; break;
                default:      mime = "application/octet-stream"; break;
            }
            response.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(mime);
            response.Content.Headers.ContentDisposition =
                new System.Net.Http.Headers.ContentDispositionHeaderValue("attachment")
                { FileName = Path.GetFileName(fullPath) };
            // [SecFix P2-4] Prevent MIME-sniffing a private upload into executable content.
            response.Headers.TryAddWithoutValidation("X-Content-Type-Options", "nosniff");
            return response;
        }
    }

    // ================================================================
    // UPLOAD API — Secure file upload for widgets (RichText images, etc.)
    // ================================================================
    [DnnAuthorize]
    public class UploadController : DnnApiController
    {
        // Maximum allowed image size (5 MB)
        private const long MaxImageSize = 5 * 1024 * 1024;

        // Allowed MIME types for images
        private static readonly HashSet<string> AllowedImageTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/bmp"
        };

        // Allowed extensions
        private static readonly HashSet<string> AllowedImageExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"
        };

        /// <summary>
        /// POST api/Upload/Image
        /// Accepts a single image file via multipart form data.
        /// Stores it under /Portals/{PortalId}/MegaForm/Images/ and returns the URL.
        /// </summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Image()
        {
            try
            {
                var httpRequest = HttpContext.Current.Request;
                if (httpRequest.Files.Count == 0)
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest,
                        new { error = "No file uploaded" });
                }

                var file = httpRequest.Files[0];

                // ── Validate MIME type ──
                if (!AllowedImageTypes.Contains(file.ContentType))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest,
                        new { error = "File type not allowed. Accepted: JPEG, PNG, GIF, WebP, SVG." });
                }

                // ── Validate extension ──
                var ext = Path.GetExtension(file.FileName ?? "").ToLowerInvariant();
                if (!AllowedImageExtensions.Contains(ext))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest,
                        new { error = "File extension not allowed." });
                }

                // ── Validate size ──
                if (file.ContentLength > MaxImageSize)
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest,
                        new { error = "Image must be under 5 MB." });
                }

                // ── Validate content (magic bytes) ──
                if (!ValidateImageContent(file.InputStream, file.ContentType))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest,
                        new { error = "File content does not match its type. Possible security risk." });
                }

                // ── Store the file ──
                var portalId = PortalSettings.PortalId;
                var uploadDir = Path.Combine(
                    PortalSettings.HomeDirectoryMapPath,
                    "MegaForm", "Images",
                    DateTime.UtcNow.ToString("yyyy-MM")
                );

                if (!Directory.Exists(uploadDir))
                    Directory.CreateDirectory(uploadDir);

                // Generate unique filename (prevent overwrites + path traversal)
                var safeName = Guid.NewGuid().ToString("N").Substring(0, 12) + ext;
                var filePath = Path.Combine(uploadDir, safeName);

                using (var fs = new FileStream(filePath, FileMode.Create))
                {
                    file.InputStream.Position = 0;
                    file.InputStream.CopyTo(fs);
                }

                // ── Build public URL ──
                var relPath = "MegaForm/Images/" + DateTime.UtcNow.ToString("yyyy-MM") + "/" + safeName;
                var url = "/Portals/" + portalId + "/" + relPath;

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    url = url,
                    fileName = safeName,
                    size = file.ContentLength,
                    type = file.ContentType
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = "Upload failed: " + ex.Message });
            }
        }

        /// <summary>
        /// Validate that the file content matches the declared MIME type
        /// by checking magic bytes. Prevents disguised malicious files.
        /// </summary>
        private bool ValidateImageContent(Stream stream, string contentType)
        {
            if (stream == null || !stream.CanRead) return false;

            stream.Position = 0;
            var header = new byte[12];
            int read = stream.Read(header, 0, header.Length);
            stream.Position = 0;  // reset for later use

            if (read < 4) return false;

            // JPEG: FF D8 FF
            if (contentType.Contains("jpeg") || contentType.Contains("jpg"))
                return header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF;

            // PNG: 89 50 4E 47
            if (contentType.Contains("png"))
                return header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47;

            // GIF: 47 49 46 38
            if (contentType.Contains("gif"))
                return header[0] == 0x47 && header[1] == 0x49 && header[2] == 0x46 && header[3] == 0x38;

            // WebP: 52 49 46 46 ... 57 45 42 50 (RIFF....WEBP)
            if (contentType.Contains("webp"))
                return read >= 12 && header[0] == 0x52 && header[1] == 0x49 &&
                       header[2] == 0x46 && header[3] == 0x46 &&
                       header[8] == 0x57 && header[9] == 0x45 &&
                       header[10] == 0x42 && header[11] == 0x50;

            // BMP: 42 4D
            if (contentType.Contains("bmp"))
                return header[0] == 0x42 && header[1] == 0x4D;

            // SVG: text-based, check for <svg or <?xml
            if (contentType.Contains("svg"))
            {
                stream.Position = 0;
                using (var reader = new StreamReader(stream, System.Text.Encoding.UTF8, true, 512, true))
                {
                    var start = reader.ReadLine()?.Trim() ?? "";
                    stream.Position = 0;
                    return start.StartsWith("<svg", StringComparison.OrdinalIgnoreCase) ||
                           start.StartsWith("<?xml", StringComparison.OrdinalIgnoreCase);
                }
            }

            return false;
        }

        // ──────────────────────────────────────────────────────────
        // GET api/Upload/List  — flat listing of every MegaForm image
        // already uploaded for the current portal. Used by the Token
        // Designer image-gallery picker so authors can re-use existing
        // assets across forms (sliders, banners, logos).
        // ──────────────────────────────────────────────────────────
        [HttpGet]
        [AllowAnonymous]
        public HttpResponseMessage List()
        {
            try
            {
                var portalId = PortalSettings.PortalId;
                var root = Path.Combine(PortalSettings.HomeDirectoryMapPath, "MegaForm", "Images");
                var rows = new List<System.IO.FileInfo>();
                if (Directory.Exists(root))
                {
                    foreach (var path in Directory.EnumerateFiles(root, "*.*", SearchOption.AllDirectories))
                    {
                        var ext = Path.GetExtension(path);
                        if (ext != null && AllowedImageExtensions.Contains(ext))
                            rows.Add(new System.IO.FileInfo(path));
                    }
                }
                var items = rows
                    .OrderByDescending(fi => fi.LastWriteTimeUtc)
                    .Take(500)
                    .Select(fi => {
                        var rel = fi.FullName.Substring(PortalSettings.HomeDirectoryMapPath.Length)
                                            .Replace('\\', '/').TrimStart('/');
                        return new {
                            url = "/Portals/" + portalId + "/" + rel,
                            fileName = fi.Name,
                            size = fi.Length,
                            modified = fi.LastWriteTimeUtc.ToString("o")
                        };
                    })
                    .ToList();
                return Request.CreateResponse(HttpStatusCode.OK, new { items = items });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = "Gallery list failed: " + ex.Message });
            }
        }
    }

    // ============================================================
    // MODULE VIEW CONFIGURATION API
    // ============================================================
    [DnnAuthorize]
    public class ModuleConfigController : DnnApiController
    {
        /// <summary>
        /// [v20260527-04] Mirrors FormController.ResolveTargetPortalId — honor
        /// explicit ?portalId=N (used by the DNN host bundle on multi-portal
        /// sites where the AJAX URL is root-relative but the caller is
        /// rendered in a child-portal subpath alias).
        /// </summary>
        private int ResolveTargetPortalId()
        {
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

        private string GetRendererHostPortalSetting(string key, string defaultValue = "")
        {
            try
            {
                return PortalController.GetPortalSetting("MegaForm_" + key, ResolveTargetPortalId(), defaultValue) ?? defaultValue;
            }
            catch
            {
                return defaultValue;
            }
        }

        private void SetRendererHostPortalSetting(string key, string value)
        {
            try
            {
                PortalController.UpdatePortalSetting(ResolveTargetPortalId(), "MegaForm_" + key, value ?? string.Empty, true);
            }
            catch { }
        }

        private int GetRendererHostPortalSettingInt(string key)
        {
            int value;
            return int.TryParse(GetRendererHostPortalSetting(key, "0"), out value) && value > 0 ? value : 0;
        }

        private static string NormalizeRendererHostUrl(string urlLike)
        {
            var raw = (urlLike ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
            // [RendererHostSanitize v20260518-09] Auto-heal the two real-world
            // bugs we've observed in stored RendererHostUrl values:
            //   1. Path typo `RederHost` → `RendererHost` (silent until 404)
            //   2. Hostname that doesn't match THIS site (admin pasted a URL
            //      from a different DNN install). Blanks the URL so the View
            //      Live button falls back to current page path.
            raw = System.Text.RegularExpressions.Regex.Replace(raw, @"\bRederHost\b", "RendererHost", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            try
            {
                Uri absolute;
                var hasAbsolute = Uri.TryCreate(raw, UriKind.Absolute, out absolute);
                var uri = hasAbsolute ? absolute : new Uri(new Uri("http://localhost"), raw);
                var query = HttpUtility.ParseQueryString(uri.Query ?? string.Empty);
                query.Remove("formId");
                query.Remove("formid");
                query.Remove("embed");
                query.Remove("configure");
                query.Remove("new");
                var path = uri.AbsolutePath;
                var nextQuery = query.ToString();
                var hash = string.Empty;
                if (!string.IsNullOrWhiteSpace(uri.Fragment) && !uri.Fragment.StartsWith("#mf-", StringComparison.OrdinalIgnoreCase)) hash = uri.Fragment;
                var result = path + (string.IsNullOrWhiteSpace(nextQuery) ? string.Empty : "?" + nextQuery) + hash;
                if (hasAbsolute && !string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase))
                {
                    // Reject hostnames that don't match any alias of the current portal.
                    // PortalSettings.Current.PortalAlias.HTTPAlias is the canonical alias
                    // for the user's current request. Aliases come without scheme; compare
                    // case-insensitive on the host portion only.
                    var current = string.Empty;
                    try { current = (PortalSettings.Current?.PortalAlias?.HTTPAlias ?? string.Empty).Split('/')[0]; } catch { }
                    if (!string.IsNullOrWhiteSpace(current) &&
                        !string.Equals(uri.Host, current.Split(':')[0], StringComparison.OrdinalIgnoreCase))
                    {
                        return string.Empty;
                    }
                    result = uri.GetLeftPart(UriPartial.Authority) + result;
                }
                return result;
            }
            catch
            {
                return raw;
            }
        }

        [HttpGet]
        [ActionName("RendererHost")]
        public HttpResponseMessage GetRendererHost(int moduleId = 0)
        {
            var rendererHostUrl = NormalizeRendererHostUrl(GetRendererHostPortalSetting("RendererHostUrl", string.Empty));
            var rendererHostTabId = GetRendererHostPortalSettingInt("RendererHostTabId");
            var rendererHostModuleId = GetRendererHostPortalSettingInt("RendererHostModuleId");
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                configured = !string.IsNullOrWhiteSpace(rendererHostUrl),
                rendererHostUrl,
                rendererHostTabId,
                rendererHostModuleId,
                moduleId
            });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("RendererHost")]
        public HttpResponseMessage SaveRendererHost([FromBody] JObject body)
        {
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });
            var rendererHostUrl = NormalizeRendererHostUrl(body.Value<string>("url"));
            var rendererHostTabId = body.Value<int?>("tabId") ?? 0;
            var rendererHostModuleId = body.Value<int?>("moduleId") ?? 0;
            SetRendererHostPortalSetting("RendererHostUrl", rendererHostUrl);
            SetRendererHostPortalSetting("RendererHostTabId", rendererHostTabId > 0 ? rendererHostTabId.ToString() : string.Empty);
            SetRendererHostPortalSetting("RendererHostModuleId", rendererHostModuleId > 0 ? rendererHostModuleId.ToString() : string.Empty);
            return GetRendererHost(rendererHostModuleId);
        }

        /// <summary>GET api/ModuleConfig/Get?moduleId=123</summary>
        [HttpGet]
        public HttpResponseMessage Get(int moduleId)
        {
            var cfg = FormRepository.GetModuleViewConfig(moduleId);
            var portalId = PortalSettings.PortalId;
            if (cfg == null)
            {
                // Return empty config — means first-time setup
                // Show ALL portal forms so admin can pick one
                var forms = FormRepository.GetFormsByPortal(portalId);
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    configured = false,
                    moduleId,
                    forms = forms.Select(f => new { formId = f.FormId, title = f.Title, status = f.Status, fieldCount = 0 }),
                    config = (object)null,
                    rendererHostUrl = NormalizeRendererHostUrl(GetRendererHostPortalSetting("RendererHostUrl", string.Empty)),
                    rendererHostTabId = GetRendererHostPortalSettingInt("RendererHostTabId"),
                    rendererHostModuleId = GetRendererHostPortalSettingInt("RendererHostModuleId")
                });
            }

            var form = FormRepository.GetForm(cfg.FormId);
            FormSchema schema = null;
            if (form != null && !string.IsNullOrEmpty(form.SchemaJson))
                try { schema = Newtonsoft.Json.JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson); } catch { }

            var flatFields = new List<object>();
            if (schema != null)
            {
                flatFields = MegaForm.Core.Utilities.MegaFormUtils.FlattenFields(schema.Fields)
                    .Where(f => f.Type != "Html" && f.Type != "Section" && f.Type != "Hidden" && f.Type != "Row")
                    .Select(f => new { f.Key, f.Label, f.Type })
                    .Cast<object>().ToList();
            }

            var popupConfig = ParsePopupDisplayConfig(cfg.ViewConfigJson);
            var configuredViews = cfg.FormId > 0 ? (FormRepository.GetFormViews(cfg.FormId) ?? new List<FormViewInfo>()) : new List<FormViewInfo>();
            popupConfig.SelectedViewKey = FormViewSelector.SanitizeSelectedViewKey(popupConfig.SelectedViewKey, configuredViews);
            var forms2 = FormRepository.GetFormsByPortal(portalId);
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                configured = true,
                moduleId,
                forms = forms2.Select(f => new { formId = f.FormId, title = f.Title, status = f.Status }),
                config = new
                {
                    configId = cfg.ConfigId,
                    moduleId = cfg.ModuleId,
                    formId = cfg.FormId,
                    viewType = cfg.ViewType,
                    viewConfig = cfg.ViewConfigJson ?? "{}",
                    selectedViewKey = popupConfig.SelectedViewKey,
                    cssClass = cfg.CssClass,
                    cacheMinutes = cfg.CacheMinutes,
                    permissions = cfg.PermissionsJson,
                    moduleConfigured = cfg.FormId > 0,
                    displayMode = popupConfig.DisplayMode,
                    triggerType = popupConfig.TriggerType,
                    delaySeconds = popupConfig.DelaySeconds,
                    scrollPercent = popupConfig.ScrollPercent,
                    clickSelector = popupConfig.ClickSelector,
                    viewMode = popupConfig.ViewMode,
                    listFields = popupConfig.ListFields,
                    listTemplate = popupConfig.ListTemplate,
                    cardFields = popupConfig.CardFields,
                    cardTemplate = popupConfig.CardTemplate,
                    listViewSettingsJson = popupConfig.ListViewSettingsJson,
                    showOncePerSession = popupConfig.ShowOncePerSession,
                    closeOnOverlay = popupConfig.CloseOnOverlay,
                    startAt = popupConfig.StartAt,
                    endAt = popupConfig.EndAt,
                    formTitle = form?.Title
                },
                fields = flatFields,
                rendererHostUrl = NormalizeRendererHostUrl(GetRendererHostPortalSetting("RendererHostUrl", string.Empty)),
                rendererHostTabId = GetRendererHostPortalSettingInt("RendererHostTabId"),
                rendererHostModuleId = GetRendererHostPortalSettingInt("RendererHostModuleId")
            });
        }

        /// <summary>POST api/ModuleConfig/Save</summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Save([FromBody] JObject body)
        {
            int moduleId = body.Value<int>("moduleId");
            int formId = body.Value<int>("formId");
            // [ListViewRouting v20260507-24] Accept BOTH viewType and viewMode
            // (settings popup writes viewMode; legacy callers wrote viewType).
            // Normalise: viewMode='form' maps to viewType='submit'; everything
            // else passes through (e.g. 'listview', 'list', 'card', 'detail').
            string viewType = body.Value<string>("viewType");
            string viewModeRaw = body.Value<string>("viewMode");
            if (string.IsNullOrEmpty(viewType) && !string.IsNullOrEmpty(viewModeRaw))
            {
                viewType = string.Equals(viewModeRaw, "form", System.StringComparison.OrdinalIgnoreCase) ? "submit" : viewModeRaw;
            }
            if (string.IsNullOrEmpty(viewType)) viewType = "submit";

            var existingCfg = FormRepository.GetModuleViewConfig(moduleId);
            var popupConfig = new PopupDisplayConfig
            {
                DisplayMode = string.Equals(body.Value<string>("displayMode"), "popup", StringComparison.OrdinalIgnoreCase) ? "popup" : "fixed",
                TriggerType = NormalizeTriggerType(body.Value<string>("triggerType")),
                DelaySeconds = ClampPositive(body.Value<int?>("delaySeconds") ?? 5, 0, 600, 5),
                ScrollPercent = ClampPositive(body.Value<int?>("scrollPercent") ?? 50, 5, 95, 50),
                ClickSelector = (body.Value<string>("clickSelector") ?? string.Empty).Trim(),
                ViewMode = NormalizeViewMode(body.Value<string>("viewMode")),
                ListFields = (body.Value<string>("listFields") ?? string.Empty).Trim(),
                ListTemplate = body.Value<string>("listTemplate") ?? string.Empty,
                CardFields = (body.Value<string>("cardFields") ?? string.Empty).Trim(),
                CardTemplate = body.Value<string>("cardTemplate") ?? string.Empty,
                ListViewSettingsJson = body.Value<string>("listViewSettingsJson") ?? "{}",
                SelectedViewKey = (body.Value<string>("selectedViewKey") ?? string.Empty).Trim(),
                ShowOncePerSession = ReadBodyBool(body, "showOncePerSession", true),
                CloseOnOverlay = ReadBodyBool(body, "closeOnOverlay", true),
                StartAt = (body.Value<string>("startAt") ?? string.Empty).Trim(),
                EndAt = (body.Value<string>("endAt") ?? string.Empty).Trim()
            };
            var formViews = formId > 0 ? (FormRepository.GetFormViews(formId) ?? new List<FormViewInfo>()) : new List<FormViewInfo>();
            popupConfig.SelectedViewKey = FormViewSelector.SanitizeSelectedViewKey(popupConfig.SelectedViewKey, formViews);
            string viewConfigJson = BuildViewConfigForSave(existingCfg != null ? existingCfg.ViewConfigJson : body["viewConfig"]?.ToString(), popupConfig);
            viewConfigJson = FormViewSelector.AttachSelectionMetadata(viewConfigJson, popupConfig.SelectedViewKey, formViews);
            string cssClass = body.Value<string>("cssClass");
            int cacheMinutes = body.Value<int?>("cacheMinutes") ?? 0;
            string permissionsJson = body["permissions"]?.ToString();
            // Live Style Editor fields (optional — only present when called from SaveStyle)
            string themeClass  = body.Value<string>("themeClass");
            string cssOverride = body.Value<string>("cssOverride");
            string extraClass  = body.Value<string>("extraClass");

            if (moduleId <= 0 || formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "moduleId and formId required" });

            var mc = new DotNetNuke.Entities.Modules.ModuleController();

            // If this is a style-only save, skip view config update
            bool isStyleSave = body["themeClass"] != null || body["cssOverride"] != null;
            if (!isStyleSave)
            {
                var cfg = new ModuleViewConfigInfo
                {
                    ModuleId = moduleId,
                    FormId = formId,
                    ViewType = viewType,
                    ViewConfigJson = viewConfigJson,
                    CssClass = cssClass,
                    CacheMinutes = cacheMinutes,
                    PermissionsJson = permissionsJson
                };
                FormRepository.SaveModuleViewConfig(cfg);
                mc.UpdateModuleSetting(moduleId, "MegaForm_FormId", formId.ToString());
                mc.UpdateModuleSetting(moduleId, "MegaForm_DefaultView", viewType == "submit" ? "" : viewType);
                mc.UpdateModuleSetting(moduleId, "MegaForm_CustomViewKey", popupConfig.SelectedViewKey ?? string.Empty);

                // [v20260528-13] Page-per-instance: persist Inbox scope + page
                // surface from the same Save payload so an admin can pin a
                // module to "Blog inbox only" or "Blog Comments only" without
                // having to fall back to URL ?mfFormId / ?mfAppScope. The
                // shell render (RegisterClientBootstrapFlags) picks them up
                // on the next page load.
                var inboxAppScope = (body.Value<string>("inboxAppScope") ?? string.Empty).Trim();
                var inboxFormId   = body.Value<int?>("inboxFormId") ?? 0;
                var pageSurface   = (body.Value<string>("pageSurface") ?? string.Empty).Trim().ToLowerInvariant();
                // Reject obviously broken combos: can't pin BOTH appScope and a specific formId in inbox.
                if (!string.IsNullOrEmpty(inboxAppScope) && inboxFormId > 0) inboxFormId = 0;
                mc.UpdateModuleSetting(moduleId, "MegaForm_InboxAppScope", inboxAppScope);
                mc.UpdateModuleSetting(moduleId, "MegaForm_InboxFormId",   inboxFormId > 0 ? inboxFormId.ToString() : string.Empty);
                // Allowed surfaces match the SPA hash routes the dnn-host bundle understands.
                var allowedSurfaces = new System.Collections.Generic.HashSet<string>(System.StringComparer.OrdinalIgnoreCase)
                {
                    string.Empty, "render", "builder", "dashboard", "submissions", "theme", "languages"
                };
                if (!allowedSurfaces.Contains(pageSurface)) pageSurface = string.Empty;
                mc.UpdateModuleSetting(moduleId, "MegaForm_PageSurface", pageSurface);
            }

            // Save Live Style Editor overrides if provided
            if (themeClass  != null) mc.UpdateModuleSetting(moduleId, "MegaForm_ThemeClass",  themeClass);
            if (cssOverride != null) mc.UpdateModuleSetting(moduleId, "MegaForm_CssOverride", cssOverride);
            if (extraClass  != null) mc.UpdateModuleSetting(moduleId, "MegaForm_ExtraClass",  extraClass);

            return Request.CreateResponse(HttpStatusCode.OK, new { success = true });
        }

        /// <summary>POST api/ModuleConfig/SaveStyle — Save Live Style Editor overrides</summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage SaveStyle([FromBody] Newtonsoft.Json.Linq.JObject body)
        {
            int moduleId = body.Value<int>("moduleId");
            int formId   = body.Value<int>("formId");
            if (moduleId <= 0 || formId <= 0)
                return Request.CreateResponse(System.Net.HttpStatusCode.BadRequest, new { error = "moduleId and formId required" });

            // Dùng IModuleSettingsService — không phụ thuộc DNN trực tiếp
            // Khi chuyển nền tảng: chỉ swap implementation, không sửa logic này
            IModuleSettingsService settings = new DnnModuleSettingsService();
            string themeClass  = body.Value<string>("themeClass");
            string cssOverride = body.Value<string>("cssOverride");
            string extraClass  = body.Value<string>("extraClass");
            string selectedPresetThemeKey = body.Value<string>("selectedPresetThemeKey");

            if (themeClass  != null) settings.SetSetting(moduleId, "MegaForm_ThemeClass",  themeClass);
            if (cssOverride != null) settings.SetSetting(moduleId, "MegaForm_CssOverride", cssOverride);
            if (extraClass  != null) settings.SetSetting(moduleId, "MegaForm_ExtraClass",  extraClass);
            if (selectedPresetThemeKey != null) settings.SetSetting(moduleId, "MegaForm_SelectedThemePresetKey", selectedPresetThemeKey);
            if (selectedPresetThemeKey != null) settings.SetSetting(moduleId, "SelectedThemePresetKey", selectedPresetThemeKey);

            return Request.CreateResponse(System.Net.HttpStatusCode.OK, new { success = true, selectedPresetThemeKey = selectedPresetThemeKey ?? string.Empty });
        }

        /// <summary>GET api/ModuleConfig/Fields?formId=1 — Get flat field list for view config</summary>
        [HttpGet]
        public HttpResponseMessage Fields(int formId)
        {
            var form = FormRepository.GetForm(formId);
            if (form == null) return Request.CreateResponse(HttpStatusCode.NotFound);

            FormSchema schema = null;
            try { schema = Newtonsoft.Json.JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson); } catch { }

            var fields = new List<object>();
            if (schema != null)
            {
                fields = MegaForm.Core.Utilities.MegaFormUtils.FlattenFields(schema.Fields)
                    .Where(f => f.Type != "Html" && f.Type != "Section" && f.Type != "Hidden" && f.Type != "Row")
                    .Select(f => new { f.Key, f.Label, f.Type })
                    .Cast<object>().ToList();
            }

            return Request.CreateResponse(HttpStatusCode.OK, new { fields });
        }

        private sealed class PopupDisplayConfig
        {
            public string DisplayMode { get; set; } = "fixed";
            public string TriggerType { get; set; } = "time_delay";
            public int DelaySeconds { get; set; } = 5;
            public int ScrollPercent { get; set; } = 50;
            public string ClickSelector { get; set; } = string.Empty;
            public string ViewMode { get; set; } = "form";
            public string ListFields { get; set; } = string.Empty;
            public string ListTemplate { get; set; } = string.Empty;
            public string CardFields { get; set; } = string.Empty;
            public string CardTemplate { get; set; } = string.Empty;
            public string ListViewSettingsJson { get; set; } = "{}";
            public string SelectedViewKey { get; set; } = string.Empty;
            public bool ShowOncePerSession { get; set; } = true;
            public bool CloseOnOverlay { get; set; } = true;
            public string StartAt { get; set; } = string.Empty;
            public string EndAt { get; set; } = string.Empty;
        }

        private static PopupDisplayConfig ParsePopupDisplayConfig(string raw)
        {
            var cfg = new PopupDisplayConfig();
            if (string.IsNullOrWhiteSpace(raw)) return cfg;
            try
            {
                var obj = JObject.Parse(raw);
                cfg.DisplayMode = string.Equals((string)obj["displayMode"] ?? (string)obj["DisplayMode"], "popup", StringComparison.OrdinalIgnoreCase) ? "popup" : "fixed";
                var popup = obj["popup"] as JObject ?? obj["Popup"] as JObject ?? new JObject();
                cfg.TriggerType = NormalizeTriggerType((string)popup["triggerType"] ?? (string)popup["TriggerType"]);
                cfg.DelaySeconds = ClampPositive(ParseOptionalInt((string)popup["delaySeconds"] ?? (string)popup["DelaySeconds"]), 0, 600, 5);
                cfg.ScrollPercent = ClampPositive(ParseOptionalInt((string)popup["scrollPercent"] ?? (string)popup["ScrollPercent"]), 5, 95, 50);
                cfg.ClickSelector = ((string)popup["clickSelector"] ?? (string)popup["ClickSelector"] ?? string.Empty).Trim();
                cfg.ViewMode = NormalizeViewMode((string)obj["viewMode"] ?? (string)obj["ViewMode"]);
                cfg.ListFields = ((string)obj["listFields"] ?? (string)obj["ListFields"] ?? string.Empty).Trim();
                cfg.ListTemplate = (string)obj["listTemplate"] ?? (string)obj["ListTemplate"] ?? string.Empty;
                cfg.CardFields = ((string)obj["cardFields"] ?? (string)obj["CardFields"] ?? string.Empty).Trim();
                cfg.CardTemplate = (string)obj["cardTemplate"] ?? (string)obj["CardTemplate"] ?? string.Empty;
                var lvToken = obj["listViewSettingsJson"] ?? obj["ListViewSettingsJson"];
                if (lvToken != null) cfg.ListViewSettingsJson = lvToken.Type == JTokenType.Object ? lvToken.ToString(Newtonsoft.Json.Formatting.None) : ((string)lvToken ?? "{}");
                cfg.SelectedViewKey = ((string)obj["selectedViewKey"] ?? (string)obj["SelectedViewKey"] ?? string.Empty).Trim();
                cfg.ShowOncePerSession = ReadBooleanToken(popup, "showOncePerSession", "ShowOncePerSession", true);
                cfg.CloseOnOverlay = ReadBooleanToken(popup, "closeOnOverlay", "CloseOnOverlay", true);
                cfg.StartAt = ((string)popup["startAt"] ?? (string)popup["StartAt"] ?? string.Empty).Trim();
                cfg.EndAt = ((string)popup["endAt"] ?? (string)popup["EndAt"] ?? string.Empty).Trim();
            }
            catch
            {
                return cfg;
            }
            return cfg;
        }

        private static string BuildViewConfigForSave(string existingRaw, PopupDisplayConfig nextCfg)
        {
            var baseObj = ParseObject(existingRaw);
            baseObj["displayMode"] = string.Equals(nextCfg.DisplayMode, "popup", StringComparison.OrdinalIgnoreCase) ? "popup" : "fixed";
            baseObj["popup"] = new JObject
            {
                ["triggerType"] = NormalizeTriggerType(nextCfg.TriggerType),
                ["delaySeconds"] = nextCfg.DelaySeconds,
                ["scrollPercent"] = nextCfg.ScrollPercent,
                ["clickSelector"] = nextCfg.ClickSelector ?? string.Empty,
                ["borderMode"] = "transparent_popup",
                ["showOncePerSession"] = nextCfg.ShowOncePerSession,
                ["closeOnOverlay"] = nextCfg.CloseOnOverlay,
                ["startAt"] = nextCfg.StartAt ?? string.Empty,
                ["endAt"] = nextCfg.EndAt ?? string.Empty
            };
            baseObj["viewMode"] = NormalizeViewMode(nextCfg.ViewMode);
            baseObj["listFields"] = nextCfg.ListFields ?? string.Empty;
            baseObj["listTemplate"] = nextCfg.ListTemplate ?? string.Empty;
            baseObj["cardFields"] = nextCfg.CardFields ?? string.Empty;
            baseObj["cardTemplate"] = nextCfg.CardTemplate ?? string.Empty;
            baseObj["listViewSettingsJson"] = nextCfg.ListViewSettingsJson ?? "{}";
            baseObj["selectedViewKey"] = nextCfg.SelectedViewKey ?? string.Empty;
            return baseObj.ToString(Newtonsoft.Json.Formatting.None);
        }

        private static JObject ParseObject(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return new JObject();
            try { return JObject.Parse(raw); } catch { return new JObject(); }
        }

        private static int ParseOptionalInt(string raw)
        {
            int parsed;
            return int.TryParse((raw ?? string.Empty).Trim(), out parsed) ? parsed : 0;
        }

        private static bool ReadBooleanToken(JObject obj, string camelKey, string pascalKey, bool defaultValue)
        {
            var token = obj[camelKey] ?? obj[pascalKey];
            if (token == null) return defaultValue;
            var text = token.ToString();
            bool parsed;
            return bool.TryParse(text, out parsed) ? parsed : defaultValue;
        }

        private static bool ReadBodyBool(JObject body, string key, bool defaultValue)
        {
            var token = body[key];
            if (token == null) return defaultValue;
            if (token.Type == JTokenType.Boolean) return token.Value<bool>();
            bool parsed;
            return bool.TryParse(token.ToString(), out parsed) ? parsed : defaultValue;
        }

        private static string NormalizeViewMode(string value)
        {
            var v = (value ?? string.Empty).Trim().ToLowerInvariant();
            return (v == "list" || v == "card" || v == "listview") ? v : "form";
        }

        private static string NormalizeTriggerType(string value)
        {
            var v = (value ?? string.Empty).Trim().ToLowerInvariant();
            return v == "scroll_depth" || v == "click_trigger" ? v : "time_delay";
        }

        private static int ClampPositive(int value, int min, int max, int fallback)
        {
            if (value <= 0) return fallback;
            if (value < min) return min;
            if (value > max) return max;
            return value;
        }

        // ── Global settings helpers via DNN HostController ──────────────
        // Uses HostController (host-level key-value store) so settings are
        // shared across portals — appropriate for DB, SMTP, and payment keys.
        // Key format: "MegaForm_{key}" e.g. "MegaForm_Database_Provider"
        private string GetPortalSetting(string key, string defaultValue = "")
        {
            var fullKey = "MegaForm_" + key;
            try
            {
                var hostValue = DotNetNuke.Entities.Controllers.HostController.Instance.GetString(fullKey, null);
                if (!string.IsNullOrWhiteSpace(hostValue)) return hostValue;
            }
            catch { }

            try
            {
                return PortalController.GetPortalSetting(fullKey, PortalSettings != null ? PortalSettings.PortalId : -1, defaultValue) ?? defaultValue;
            }
            catch
            {
                return defaultValue;
            }
        }

        private void SetPortalSetting(string key, string value)
        {
            try
            {
                var fullKey = "MegaForm_" + key;
                DotNetNuke.Entities.Controllers.HostController.Instance.Update(fullKey, value ?? "", true);
            }
            catch { /* non-critical */ }
        }

        private static string InferDatabaseType(string connStr)
        {
            var lower = (connStr ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(lower)) return string.Empty;
            var looksSqlite = (lower.Contains("data source=") || lower.Contains("datasource=") || lower.Contains("filename=") || lower.Contains("mode=memory") || lower.Contains("cache=shared") || lower.Contains(".db") || lower.Contains(".sqlite"))
                && !lower.Contains("initial catalog=") && !lower.Contains("trusted_connection=") && !lower.Contains("integrated security=") && !lower.Contains("network library=");
            if (looksSqlite) return "Sqlite";
            if (lower.Contains("host=") && (lower.Contains("username=") || lower.Contains("search path=") || lower.Contains("port=5432"))) return "PostgreSql";
            if ((lower.Contains("server=") || lower.Contains("host=")) && (lower.Contains("uid=") || lower.Contains("user id=") || lower.Contains("port=3306"))) return "MySql";
            return "SqlServer";
        }

        // ══════════════════════════════════════════════════════════════════
        //  DATABASE SETTINGS
        //  GET  /DesktopModules/MegaForm/API/ModuleConfig/DatabaseSettings
        //  POST /DesktopModules/MegaForm/API/ModuleConfig/DatabaseSettings
        //  POST /DesktopModules/MegaForm/API/ModuleConfig/DatabaseSettings/Test
        // ══════════════════════════════════════════════════════════════════

        [HttpGet]
        [ActionName("DatabaseSettings")]
        [DnnAuthorize(StaticRoles = "Administrators")]
        public HttpResponseMessage GetDatabaseSettings()
        {
            var provider = GetPortalSetting("Database_Provider");
            var connectionString = GetPortalSetting("Database_ConnectionString");
            var dashboardAlias = GetPortalSetting("Database_ConnectionAlias", "DashboardDatabase");

            if (string.IsNullOrWhiteSpace(provider))
                provider = InferDatabaseType(connectionString);
            if (string.IsNullOrWhiteSpace(provider)) provider = "Sqlite";

            var dbMeta = new DatabaseWorkflowMetadataService(new DnnConnectionRegistry(GetPortalSetting));
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                provider,
                connectionString = MaskConnectionSecrets(connectionString),
                dashboardConnectionName = dashboardAlias,
                samples = new
                {
                    sqlite    = dbMeta.GetConnectionStringSample("Sqlite"),
                    sqlServer = dbMeta.GetConnectionStringSample("SqlServer"),
                    mySql     = dbMeta.GetConnectionStringSample("MySql"),
                    postgreSql = dbMeta.GetConnectionStringSample("PostgreSql")
                }
            });
        }

        // ══════════════════════════════════════════════════════════════════
        //  GET /DesktopModules/MegaForm/API/ModuleConfig/DefaultConnectionString
        //  [DNN parity 2026-06-23] Oqtane (B51) exposed this so the Database
        //  Settings popup can prefill the Connection String from the platform
        //  default; on DNN the "default" is the SiteSqlServer connection
        //  (DataProvider.Instance().ConnectionString). Password-masked — never
        //  echo the raw secret back to the browser. Same payload shape as the
        //  Oqtane endpoint so dashboard/index.ts reuses one code path.
        // ══════════════════════════════════════════════════════════════════
        [HttpGet]
        [ActionName("DefaultConnectionString")]
        public HttpResponseMessage GetDefaultConnectionString()
        {
            string raw = string.Empty;
            try { raw = DotNetNuke.Data.DataProvider.Instance().ConnectionString ?? string.Empty; }
            catch { raw = string.Empty; }

            var hasDefault = !string.IsNullOrWhiteSpace(raw);
            var provider = InferDatabaseType(raw);
            if (string.IsNullOrWhiteSpace(provider)) provider = "SqlServer";
            var safe = MaskConnectionSecrets(raw);

            var dbMeta = new DatabaseWorkflowMetadataService(new DnnConnectionRegistry(GetPortalSetting));
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                connectionString = safe,
                provider,
                hasDefault,
                dashboardConnectionName = GetPortalSetting("Database_ConnectionAlias", "DashboardDatabase"),
                source = "SiteSqlServer",
                samples = new
                {
                    sqlite     = dbMeta.GetConnectionStringSample("Sqlite"),
                    sqlServer  = dbMeta.GetConnectionStringSample("SqlServer"),
                    mySql      = dbMeta.GetConnectionStringSample("MySql"),
                    postgreSql = dbMeta.GetConnectionStringSample("PostgreSql")
                }
            });
        }

        // Mask password=... / pwd=... fragments so the raw secret never flows
        // back to the browser (structure preserved for the UI's prefill toggles).
        private static string MaskConnectionSecrets(string cs)
        {
            if (string.IsNullOrWhiteSpace(cs)) return string.Empty;
            return System.Text.RegularExpressions.Regex.Replace(
                cs, @"(?i)(password|pwd)\s*=\s*[^;]*", "$1=***");
        }

        [HttpPost]
        [ActionName("DatabaseSettings")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage SaveDatabaseSettings([FromBody] JObject body)
        {
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });
            var provider          = body.Value<string>("provider");
            var connectionString  = body.Value<string>("connectionString");
            var alias             = body.Value<string>("alias");
            if (!string.IsNullOrWhiteSpace(provider))          SetPortalSetting("Database_Provider", provider);
            if (connectionString != null)                       SetPortalSetting("Database_ConnectionString", connectionString);
            if (!string.IsNullOrWhiteSpace(alias))             SetPortalSetting("Database_ConnectionAlias", alias.Trim());
            var savedAlias = string.IsNullOrWhiteSpace(alias) ? GetPortalSetting("Database_ConnectionAlias", "DashboardDatabase") : alias.Trim();
            return Request.CreateResponse(HttpStatusCode.OK, new { success = true, message = "Database settings saved.", dashboardConnectionName = savedAlias });
        }

        [HttpPost]
        [ActionName("DatabaseSettingsTest")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage TestDatabaseSettings([FromBody] JObject body)
        {
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });
            var provider         = body.Value<string>("provider");
            var connectionString = body.Value<string>("connectionString");
            if (string.IsNullOrWhiteSpace(provider))          return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Database provider is required." });
            if (string.IsNullOrWhiteSpace(connectionString))  return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Connection string is required." });
            var dbMeta = new DatabaseWorkflowMetadataService(new DnnConnectionRegistry(GetPortalSetting));
            var result = dbMeta.TestConnection(null, provider, connectionString);
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success                  = result != null && result.Success,
                provider                 = result?.Provider ?? provider,
                databaseName             = result?.DatabaseName ?? string.Empty,
                serverVersion            = result?.ServerVersion ?? string.Empty,
                supportsStoredProcedures = result?.SupportsStoredProcedures ?? false,
                message                  = result?.Message ?? "Connection test failed."
            });
        }

        // ══════════════════════════════════════════════════════════════════
        //  PAYMENT SETTINGS
        //  GET  /DesktopModules/MegaForm/API/ModuleConfig/PaymentSettings
        //  POST /DesktopModules/MegaForm/API/ModuleConfig/PaymentSettings
        // ══════════════════════════════════════════════════════════════════

        [HttpGet]
        [ActionName("PaymentSettings")]
        public HttpResponseMessage GetPaymentSettings()
        {
            string Mask(string v) => string.IsNullOrWhiteSpace(v) ? "" : (v.Length > 8 ? v.Substring(0, 8) + "…" : "****");
            var sk  = GetPortalSetting("Payment_Stripe_SecretKey");
            var ppC = GetPortalSetting("Payment_PayPal_ClientId");
            var ppS = GetPortalSetting("Payment_PayPal_ClientSecret");
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                stripeEnabled            = GetPortalSetting("Payment_Stripe_Enabled") == "1",
                stripePublishableKey     = GetPortalSetting("Payment_Stripe_PublishableKey"),
                stripeSecretKeyMasked    = Mask(sk),
                stripeSecretKeySaved     = !string.IsNullOrWhiteSpace(sk),
                paypalEnabled            = GetPortalSetting("Payment_PayPal_Enabled") == "1",
                paypalMode               = GetPortalSetting("Payment_PayPal_Mode", "sandbox"),
                paypalClientId           = ppC,
                paypalClientSecretMasked = Mask(ppS),
                paypalClientSecretSaved  = !string.IsNullOrWhiteSpace(ppS),
            });
        }

        [HttpPost]
        [ActionName("PaymentSettings")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage SavePaymentSettings([FromBody] JObject body)
        {
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });

            void SaveIfSet(string settingKey, string jsonKey) { var v = body.Value<string>(jsonKey); if (v != null) SetPortalSetting(settingKey, v); }
            void SaveBool(string settingKey, string jsonKey)  { var v = body[jsonKey]; if (v != null) SetPortalSetting(settingKey, v.Value<bool>() ? "1" : "0"); }

            SaveBool("Payment_Stripe_Enabled",       "stripeEnabled");
            SaveIfSet("Payment_Stripe_PublishableKey","stripePublishableKey");
            var sk = body.Value<string>("stripeSecretKey");
            if (!string.IsNullOrWhiteSpace(sk) && !sk.Contains("…")) SetPortalSetting("Payment_Stripe_SecretKey", sk);

            SaveBool("Payment_PayPal_Enabled",       "paypalEnabled");
            SaveIfSet("Payment_PayPal_Mode",         "paypalMode");
            SaveIfSet("Payment_PayPal_ClientId",     "paypalClientId");
            var ppS = body.Value<string>("paypalClientSecret");
            if (!string.IsNullOrWhiteSpace(ppS) && !ppS.Contains("…")) SetPortalSetting("Payment_PayPal_ClientSecret", ppS);

            return Request.CreateResponse(HttpStatusCode.OK, new { success = true, message = "Payment settings saved." });
        }

        // ══════════════════════════════════════════════════════════════════
        //  CAPTCHA SETTINGS
        //  GET  /DesktopModules/MegaForm/API/ModuleConfig/CaptchaSettings
        //  POST /DesktopModules/MegaForm/API/ModuleConfig/CaptchaSettings
        // ══════════════════════════════════════════════════════════════════

        [HttpGet]
        [ActionName("CaptchaSettings")]
        public HttpResponseMessage GetCaptchaSettings()
        {
            Func<string, string> mask = delegate (string v)
            {
                if (string.IsNullOrWhiteSpace(v)) return "";
                return v.Length > 8 ? v.Substring(0, 8) + "…" : "****";
            };

            var rcSite = GetPortalSetting("Captcha_ReCaptcha_SiteKey", "");
            var rcSecret = GetPortalSetting("Captcha_ReCaptcha_SecretKey", "");
            var hcSite = GetPortalSetting("Captcha_HCaptcha_SiteKey", "");
            var hcSecret = GetPortalSetting("Captcha_HCaptcha_SecretKey", "");

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                badgeVersion = "CaptchaSettingsFix v20260407-05",
                reCaptchaSiteKey = rcSite,
                reCaptchaSecretKeyMasked = mask(rcSecret),
                reCaptchaSecretKeySaved = !string.IsNullOrWhiteSpace(rcSecret),
                hCaptchaSiteKey = hcSite,
                hCaptchaSecretKeyMasked = mask(hcSecret),
                hCaptchaSecretKeySaved = !string.IsNullOrWhiteSpace(hcSecret)
            });
        }

        [HttpPost]
        [ActionName("CaptchaSettings")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage SaveCaptchaSettings([FromBody] JObject body)
        {
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });

            void SaveIfSet(string settingKey, string jsonKey)
            {
                var value = body.Value<string>(jsonKey);
                if (value != null) SetPortalSetting(settingKey, value.Trim());
            }

            SaveIfSet("Captcha_ReCaptcha_SiteKey", "reCaptchaSiteKey");
            SaveIfSet("Captcha_HCaptcha_SiteKey", "hCaptchaSiteKey");

            var rcSecret = body.Value<string>("reCaptchaSecretKey");
            if (!string.IsNullOrWhiteSpace(rcSecret) && !rcSecret.Contains("…"))
                SetPortalSetting("Captcha_ReCaptcha_SecretKey", rcSecret.Trim());

            var hcSecret = body.Value<string>("hCaptchaSecretKey");
            if (!string.IsNullOrWhiteSpace(hcSecret) && !hcSecret.Contains("…"))
                SetPortalSetting("Captcha_HCaptcha_SecretKey", hcSecret.Trim());

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                message = "Captcha settings saved.",
                badgeVersion = "CaptchaSettingsFix v20260407-05"
            });
        }

        // ══════════════════════════════════════════════════════════════════
        //  EMAIL SETTINGS  — reads from DNN Host as defaults, overrides via portal settings
        //  GET  /DesktopModules/MegaForm/API/ModuleConfig/EmailSettings
        //  POST /DesktopModules/MegaForm/API/ModuleConfig/EmailSettings
        //  POST /DesktopModules/MegaForm/API/ModuleConfig/EmailSettings/Test
        // ══════════════════════════════════════════════════════════════════

        [HttpGet]
        [ActionName("EmailSettings")]
        public HttpResponseMessage GetEmailSettings()
        {
            // DNN stores SMTP as "host" or "host:port" in Host.SMTPServer
            var smtpRaw = Host.SMTPServer ?? "";
            var smtpParts = smtpRaw.Split(new[] { ':' }, 2);
            var hostDefault = smtpParts[0].Trim();
            var portDefault = smtpParts.Length > 1 ? smtpParts[1].Trim() : "25";
            if (string.IsNullOrWhiteSpace(hostDefault)) hostDefault = "localhost";
            if (string.IsNullOrWhiteSpace(portDefault)) portDefault = "25";

            string provider = GetPortalSetting("Email_Provider", "generic");
            string host     = GetPortalSetting("Email_Host",     hostDefault);
            string port     = GetPortalSetting("Email_Port",     portDefault);
            string from     = GetPortalSetting("Email_From",     Host.HostEmail ?? "noreply@site.com");
            string fromName = GetPortalSetting("Email_FromName", PortalSettings.PortalName ?? "MegaForm");
            string user     = GetPortalSetting("Email_User",     Host.SMTPUsername ?? "");
            string ssl      = GetPortalSetting("Email_EnableSsl", Host.EnableSMTPSSL ? "1" : "0");
            string replyTo  = GetPortalSetting("Email_ReplyTo",  "");
            string timeout  = GetPortalSetting("Email_TimeoutMs","20000");
            string pass     = GetPortalSetting("Email_Password", "");
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                provider, host, port, from, fromName, username = user, replyTo, timeoutMs = timeout,
                passwordSaved = !string.IsNullOrWhiteSpace(pass),
                enableSsl = ssl == "1"
            });
        }

        [HttpPost]
        [ActionName("EmailSettings")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage SaveEmailSettings([FromBody] JObject body)
        {
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });
            void SaveIfSet(string k, string j) { var v = body.Value<string>(j); if (v != null) SetPortalSetting(k, v); }
            SaveIfSet("Email_Provider", "provider");
            SaveIfSet("Email_Host",     "host");
            SaveIfSet("Email_Port",     "port");
            SaveIfSet("Email_From",     "from");
            SaveIfSet("Email_FromName", "fromName");
            SaveIfSet("Email_User",     "username");
            SaveIfSet("Email_ReplyTo",  "replyTo");
            SaveIfSet("Email_TimeoutMs","timeoutMs");
            var pw = body.Value<string>("password");
            if (!string.IsNullOrWhiteSpace(pw) && !pw.Contains("•")) SetPortalSetting("Email_Password", pw);
            if (body["enableSsl"] != null) SetPortalSetting("Email_EnableSsl", body.Value<bool>("enableSsl") ? "1" : "0");
            return Request.CreateResponse(HttpStatusCode.OK, new { success = true, message = "Email settings saved." });
        }

        [HttpPost]
        [ActionName("EmailSettingsTest")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage TestEmailSettings([FromBody] JObject body)
        {
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });
            var to = body.Value<string>("to");
            if (string.IsNullOrWhiteSpace(to)) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Recipient email required" });

            try
            {
                var sender = new global::MegaForm.DNN.Services.DnnEmailSender();
                var options = sender.ResolveOptions(
                    body.Value<string>("host"),
                    body.Value<string>("port"),
                    body.Value<string>("from"),
                    body.Value<string>("fromName"),
                    body.Value<string>("username"),
                    body.Value<string>("password"),
                    body["enableSsl"] != null ? (bool?)body.Value<bool>("enableSsl") : null,
                    body.Value<string>("timeoutMs"),
                    body.Value<string>("replyTo"));

                sender.SendUsingOptions(
                    options,
                    to.Trim(),
                    "MegaForm test email",
                    "<p>MegaForm SMTP test successful.</p><p>If you received this email, your email settings are working.</p>");

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    message = string.Format("Test email sent to {0}. Check inbox and spam folder.", to.Trim()),
                    from = options.FromEmail,
                    fromName = options.FromName
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = false,
                    message = "Send failed: " + (ex.Message ?? "Unknown error")
                });
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  UPLOAD SETTINGS
        //  GET  /DesktopModules/MegaForm/API/ModuleConfig/UploadSettings
        //  POST /DesktopModules/MegaForm/API/ModuleConfig/UploadSettings
        // ══════════════════════════════════════════════════════════════════

        [HttpGet]
        [ActionName("UploadSettings")]
        public HttpResponseMessage GetUploadSettings()
        {
            var maxSizeMb     = GetPortalSetting("Upload_MaxSizeMB", "10");
            var allowedExt    = GetPortalSetting("Upload_AllowedExtensions", FileUploadSecurityService.GetDefaultAllowedExtensionsCsv());
            var blockedExt    = GetPortalSetting("Upload_BlockedExtensions", FileUploadSecurityService.GetDefaultBlockedExtensionsCsv());
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                maxSizeMb         = int.TryParse(maxSizeMb, out var sz) ? sz : 10,
                allowedExtensions = allowedExt,
                blockedExtensions = blockedExt,
                storageMode       = "private",
                notes = new[]
                {
                    "Uploads are stored in App_Data/MegaForm/PrivateUploads, not under public wwwroot.",
                    "Upload requests must target a published form and a real File widget key.",
                    "If the form requires login, uploads require login too."
                }
            });
        }

        [HttpPost]
        [ActionName("UploadSettings")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage SaveUploadSettings([FromBody] JObject body)
        {
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });
            var maxSizeMb = body.Value<int?>("maxSizeMb") ?? 10;
            if (maxSizeMb < 1) maxSizeMb = 1;
            if (maxSizeMb > 250) maxSizeMb = 250;
            var allowed = FileUploadSecurityService.NormalizeExtensionsCsv(
                body.Value<string>("allowedExtensions") ?? GetPortalSetting("Upload_AllowedExtensions", FileUploadSecurityService.GetDefaultAllowedExtensionsCsv()),
                FileUploadSecurityService.GetDefaultAllowedExtensionsCsv());
            var blocked = FileUploadSecurityService.NormalizeExtensionsCsv(
                body.Value<string>("blockedExtensions") ?? GetPortalSetting("Upload_BlockedExtensions", FileUploadSecurityService.GetDefaultBlockedExtensionsCsv()),
                FileUploadSecurityService.GetDefaultBlockedExtensionsCsv());
            SetPortalSetting("Upload_MaxSizeMB",          maxSizeMb.ToString());
            SetPortalSetting("Upload_AllowedExtensions",  allowed ?? "");
            SetPortalSetting("Upload_BlockedExtensions",  blocked ?? "");
            return Request.CreateResponse(HttpStatusCode.OK, new { success = true, message = "Upload settings saved.", storageMode = "private" });
        }
    }

    // ================================================================
    //  DnnConnectionRegistry
    //  IConnectionRegistry implementation for DNN.
    //  Reads connection strings from portal settings (stored via PortalController).
    //  Uses only System.Data drivers available in net472 / DNN bin folder.
    //  No extra NuGet packages required.
    // ================================================================
    internal sealed class DnnConnectionRegistry : MegaForm.Core.Interfaces.IConnectionRegistry
    {
        private readonly Func<string, string, string> _getSetting; // (key, default) -> value

        public DnnConnectionRegistry(Func<string, string, string> getPortalSetting)
        {
            _getSetting = getPortalSetting ?? throw new ArgumentNullException("getPortalSetting");
        }

        public System.Data.Common.DbConnection GetConnection(
            string connectionName,
            string databaseType = null,
            string connectionString = null)
        {
            // When connectionString is supplied directly (e.g. TestConnection call), use it
            if (!string.IsNullOrWhiteSpace(connectionString))
                return CreateConnection(databaseType, connectionString);

            // Named lookup: read stored connstr from portal settings
            var storedAlias = _getSetting("Database_ConnectionAlias", "DashboardDatabase");
            if (string.Equals(connectionName, storedAlias, StringComparison.OrdinalIgnoreCase)
                || string.Equals(connectionName, "DashboardDatabase", StringComparison.OrdinalIgnoreCase)
                || string.IsNullOrWhiteSpace(connectionName))
            {
                var storedProvider = _getSetting("Database_Provider", "SqlServer");
                var storedConnStr  = _getSetting("Database_ConnectionString", "");
                if (string.IsNullOrWhiteSpace(storedConnStr))
                    throw new InvalidOperationException(
                        "MegaForm: Dashboard database connection is not configured. " +
                        "Please set it via Dashboard → Database Settings.");
                return CreateConnection(
                    string.IsNullOrWhiteSpace(databaseType) ? storedProvider : databaseType,
                    storedConnStr);
            }

            throw new InvalidOperationException(
                "MegaForm DnnConnectionRegistry: unknown connection name '" + connectionName + "'. " +
                "Only the portal-stored dashboard connection is supported in DNN.");
        }

        private static System.Data.Common.DbConnection CreateConnection(string databaseType, string connStr)
        {
            var type = NormalizeDatabaseType(databaseType, connStr);
            // [DnnConnstrSanitize v20260518-01] DNN admins routinely copy the conn
            // string straight from web.config — sometimes the whole <add ...> XML
            // line, sometimes the inner attribute with providerName tacked on.
            // SqlConnection rejects both with cryptic errors ("Format of the
            // initialization string does not conform..." / "Keyword not supported:
            // 'providername'."). Strip these before constructing so the common
            // copy-paste case Just Works.
            var sanitized = SanitizeConnectionString(connStr);

            // SQL Server — available in net472 via System.Data.SqlClient (GAC)
            if (type == "sqlserver")
                return new System.Data.SqlClient.SqlConnection(sanitized);

            // SQLite — DNN ships System.Data.SQLite.dll in bin\
            // Loaded via reflection so it compiles even if the DLL is absent at build time
            if (type == "sqlite")
                return CreateViaDynamic("System.Data.SQLite.SQLiteConnection", sanitized);

            // MySQL — DNN may ship MySql.Data.dll in bin\
            if (type == "mysql")
                return CreateViaDynamic("MySql.Data.MySqlClient.MySqlConnection", sanitized);

            // PostgreSQL — DNN may ship Npgsql.dll in bin\
            if (type == "postgres")
                return CreateViaDynamic("Npgsql.NpgsqlConnection", sanitized);

            // Fallback: SQL Server
            return new System.Data.SqlClient.SqlConnection(sanitized);
        }

        /// <summary>
        /// [DnnConnstrSanitize v20260518-01] Forgive the three most common ways a
        /// DNN admin breaks a copy-pasted connection string from web.config:
        ///   1) Pastes the whole <add name="SiteSqlServer" connectionString="..."
        ///      providerName="System.Data.SqlClient" /> XML line — extract just
        ///      the connectionString attribute value.
        ///   2) Leaves `providerName=System.Data.SqlClient` tacked on as if it
        ///      were a key/value pair — SqlConnection rejects unknown keywords.
        ///   3) HTML-encoded entities (&amp; &quot;) carried over from XML.
        /// Always returns a string safe to hand to SqlConnection / equivalents.
        /// </summary>
        internal static string SanitizeConnectionString(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return raw ?? string.Empty;
            var text = raw.Trim();

            // Case 1: whole <add ... /> XML element. Pull the connectionString attr.
            // Regex tolerates single or double quoted attribute values + any attr ordering.
            var xmlMatch = System.Text.RegularExpressions.Regex.Match(
                text,
                @"<\s*add\b[^>]*?\bconnectionString\s*=\s*(""([^""]*)""|'([^']*)')",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (xmlMatch.Success)
            {
                text = xmlMatch.Groups[2].Success ? xmlMatch.Groups[2].Value : xmlMatch.Groups[3].Value;
            }

            // Case 3: HTML entity decode in case the XML carried &amp; etc.
            text = text
                .Replace("&amp;", "&")
                .Replace("&quot;", "\"")
                .Replace("&apos;", "'")
                .Replace("&lt;",  "<")
                .Replace("&gt;",  ">");

            // Case 2: strip stray providerName=... (case-insensitive). Handles it
            // appearing anywhere: at the start, middle, or end. Also collapses any
            // resulting `;;` runs and leading/trailing semicolons.
            text = System.Text.RegularExpressions.Regex.Replace(
                text,
                @"(^|;)\s*providerName\s*=\s*[^;]*",
                "",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            text = System.Text.RegularExpressions.Regex.Replace(text, @";{2,}", ";");
            text = text.Trim().TrimStart(';').TrimEnd(';').Trim();
            return text;
        }

        private static System.Data.Common.DbConnection CreateViaDynamic(string typeName, string connStr)
        {
            var type = Type.GetType(typeName)
                ?? AppDomain.CurrentDomain.GetAssemblies()
                       .Select(a => { try { return a.GetType(typeName); } catch { return null; } })
                       .FirstOrDefault(t => t != null);

            if (type == null)
                throw new InvalidOperationException(
                    "MegaForm: Database driver not available: " + typeName + ". " +
                    "Ensure the provider DLL is present in the DNN bin folder.");

            return (System.Data.Common.DbConnection)Activator.CreateInstance(type, connStr);
        }

        private static string NormalizeDatabaseType(string databaseType, string connStr)
        {
            var forced = string.IsNullOrWhiteSpace(databaseType) ? "" : databaseType.Trim().ToLowerInvariant();
            if (forced == "sqlite")                             return "sqlite";
            if (forced == "postgresql" || forced == "postgres") return "postgres";
            if (forced == "mysql")                              return "mysql";
            if (forced == "sqlserver" || forced == "mssql")    return "sqlserver";

            // Infer from connection string
            var lower = (connStr ?? "").Trim().ToLowerInvariant();
            var looksSqlite =
                (lower.Contains("data source=") || lower.Contains("datasource=") ||
                 lower.Contains("filename=") || lower.Contains(".db") || lower.Contains(".sqlite"))
                && !lower.Contains("initial catalog=") && !lower.Contains("trusted_connection=");
            if (looksSqlite) return "sqlite";
            if (lower.Contains("host=") && (lower.Contains("username=") || lower.Contains("port=5432")))
                return "postgres";
            if ((lower.Contains("server=") || lower.Contains("host=")) &&
                (lower.Contains("uid=") || lower.Contains("user id=") || lower.Contains("port=3306")))
                return "mysql";
            return "sqlserver";
        }
        private static string ExtractRulesJson(string schemaJson, string settingsJson = null)
        {
            try
            {
                if (!string.IsNullOrWhiteSpace(schemaJson))
                {
                    var schema = JObject.Parse(schemaJson);
                    var topRules = schema["rules"];
                    if (topRules != null && topRules.Type == JTokenType.Array) return topRules.ToString(Formatting.None);
                    var settingsRules = schema["settings"]?["rules"];
                    if (settingsRules != null && settingsRules.Type == JTokenType.Array) return settingsRules.ToString(Formatting.None);
                }
                if (!string.IsNullOrWhiteSpace(settingsJson))
                {
                    var settings = JObject.Parse(settingsJson);
                    var rules = settings["rules"];
                    if (rules != null && rules.Type == JTokenType.Array) return rules.ToString(Formatting.None);
                }
            }
            catch { }
            return "[]";
        }

    }

    public class SaveStyleRequest
    {
        public int    FormId      { get; set; }
        public int    ModuleId    { get; set; }
        public string ThemeClass  { get; set; }
        public string CssOverride { get; set; }
        public string ExtraClass  { get; set; }


    }

    // ================================================================
    //  STARTER — Business App Builder
    //  POST /DesktopModules/MegaForm/API/Starter/SetupLeaveRequest
    //  POST /DesktopModules/MegaForm/API/Starter/Launch
    //
    //  [DnnBusinessStarters v20260518-01] DNN-side endpoints that mirror
    //  the Oqtane Starter/* shape so the shared MFStarter.launch JS shim
    //  works on both platforms. The seeded form/workflow/views/samples
    //  are built by MegaForm.Core.Services.Starters.LeaveRequestStarterService —
    //  same code that Oqtane runs — wired with DnnStarterPlatformAdapter for
    //  user lookup + runtime cleanup + attachment row inserts.
    // ================================================================
    [DotNetNuke.Web.Api.DnnAuthorize(StaticRoles = "Administrators")]
    public class StarterController : DotNetNuke.Web.Api.DnnApiController
    {
        public const string Badge = "DnnBusinessStarters v20260518-01";

        [System.Web.Http.HttpGet]
        [System.Web.Http.ActionName("Status")]
        public System.Net.Http.HttpResponseMessage Status()
        {
            // [StarterStatus v20260519-01] Returns install-state per starter for
            // the current portal so the Dashboard Business Starters modal can
            // show "Open Board" / "Reseed" instead of "Launch" when a starter
            // is already provisioned.
            try
            {
                var loc = MegaForm.DNN.Services.DnnServiceLocator.Instance;
                var svc = new MegaForm.Core.Services.Starters.StarterStatusService(loc.FormRepo, loc.SubmissionRepo);
                var items = svc.GetAll(PortalSettings.PortalId);
                return Request.CreateResponse(System.Net.HttpStatusCode.OK, new { items });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(System.Net.HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        [System.Web.Http.HttpPost]
        [DotNetNuke.Web.Api.ValidateAntiForgeryToken]
        [System.Web.Http.ActionName("SetupLeaveRequest")]
        public System.Net.Http.HttpResponseMessage SetupLeaveRequest([System.Web.Http.FromBody] Newtonsoft.Json.Linq.JObject body)
        {
            try
            {
                var ctx = ResolveSetupContext(body);
                var result = MegaForm.DNN.Services.DnnServiceLocator.Instance.LeaveRequestStarter
                    .EnsureStarter(ctx.PortalId, ctx.ModuleId, ctx.HomeUrl, ctx.Actor);
                return Request.CreateResponse(System.Net.HttpStatusCode.OK, result);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(System.Net.HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        [System.Web.Http.HttpPost]
        [DotNetNuke.Web.Api.ValidateAntiForgeryToken]
        [System.Web.Http.ActionName("SetupProposal")]
        public System.Net.Http.HttpResponseMessage SetupProposal([System.Web.Http.FromBody] Newtonsoft.Json.Linq.JObject body)
        {
            try
            {
                var ctx = ResolveSetupContext(body);
                var result = MegaForm.DNN.Services.DnnServiceLocator.Instance.ProposalStarter
                    .EnsureStarter(ctx.PortalId, ctx.ModuleId, ctx.HomeUrl, ctx.Actor);
                return Request.CreateResponse(System.Net.HttpStatusCode.OK, result);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(System.Net.HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        [System.Web.Http.HttpPost]
        [DotNetNuke.Web.Api.ValidateAntiForgeryToken]
        [System.Web.Http.ActionName("SetupDocumentExchange")]
        public System.Net.Http.HttpResponseMessage SetupDocumentExchange([System.Web.Http.FromBody] Newtonsoft.Json.Linq.JObject body)
        {
            try
            {
                var ctx = ResolveSetupContext(body);
                var result = MegaForm.DNN.Services.DnnServiceLocator.Instance.DocumentExchangeStarter
                    .EnsureStarter(ctx.PortalId, ctx.ModuleId, ctx.HomeUrl, ctx.Actor);
                return Request.CreateResponse(System.Net.HttpStatusCode.OK, result);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(System.Net.HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        [System.Web.Http.HttpPost]
        [DotNetNuke.Web.Api.ValidateAntiForgeryToken]
        [System.Web.Http.ActionName("SetupPurchaseOrder")]
        public System.Net.Http.HttpResponseMessage SetupPurchaseOrder([System.Web.Http.FromBody] Newtonsoft.Json.Linq.JObject body)
        {
            try
            {
                var ctx = ResolveSetupContext(body);
                var result = MegaForm.DNN.Services.DnnServiceLocator.Instance.PurchaseOrderStarter
                    .EnsureStarter(ctx.PortalId, ctx.ModuleId, ctx.Actor?.UserId ?? 0);
                return Request.CreateResponse(System.Net.HttpStatusCode.OK, result);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(System.Net.HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        [System.Web.Http.HttpPost]
        [DotNetNuke.Web.Api.ValidateAntiForgeryToken]
        [System.Web.Http.ActionName("SetupRecruitment")]
        public System.Net.Http.HttpResponseMessage SetupRecruitment([System.Web.Http.FromBody] Newtonsoft.Json.Linq.JObject body)
        {
            try
            {
                var ctx = ResolveSetupContext(body);
                var result = MegaForm.DNN.Services.DnnServiceLocator.Instance.RecruitmentStarter
                    .EnsureStarter(ctx.PortalId, ctx.ModuleId, ctx.HomeUrl, ctx.Actor);
                return Request.CreateResponse(System.Net.HttpStatusCode.OK, result);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(System.Net.HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        [System.Web.Http.HttpPost]
        [DotNetNuke.Web.Api.ValidateAntiForgeryToken]
        [System.Web.Http.ActionName("SetupBlog")]
        public System.Net.Http.HttpResponseMessage SetupBlog([System.Web.Http.FromBody] Newtonsoft.Json.Linq.JObject body)
        {
            try
            {
                var ctx = ResolveSetupContext(body);
                var result = MegaForm.DNN.Services.DnnServiceLocator.Instance.ConfiguredAppStarter
                    .EnsureStarter("blog", ctx.PortalId, ctx.ModuleId, ctx.HomeUrl, ctx.Actor);
                return Request.CreateResponse(System.Net.HttpStatusCode.OK, result);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(System.Net.HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        private sealed class StarterSetupContext
        {
            public int PortalId;
            public int ModuleId;
            public string HomeUrl;
            public MegaForm.Core.Services.UserContext Actor;
        }

        private StarterSetupContext ResolveSetupContext(Newtonsoft.Json.Linq.JObject body)
        {
            body = body ?? new Newtonsoft.Json.Linq.JObject();
            int moduleId = body.Value<int?>("moduleId") ?? body.Value<int?>("ModuleId") ?? ActiveModule?.ModuleID ?? 0;
            string homeUrl = (body.Value<string>("homeUrl") ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(homeUrl)) homeUrl = ResolveCurrentPageUrl();
            return new StarterSetupContext
            {
                PortalId = PortalSettings.PortalId,
                ModuleId = moduleId,
                HomeUrl = homeUrl,
                Actor = ResolveActor()
            };
        }

        [System.Web.Http.HttpPost]
        [DotNetNuke.Web.Api.ValidateAntiForgeryToken]
        [System.Web.Http.ActionName("Launch")]
        public System.Net.Http.HttpResponseMessage Launch([System.Web.Http.FromBody] Newtonsoft.Json.Linq.JObject body)
        {
            try
            {
                body = body ?? new Newtonsoft.Json.Linq.JObject();
                string starterKey = (body.Value<string>("starterKey") ?? string.Empty).Trim().ToLowerInvariant();
                int portalId = PortalSettings.PortalId;
                int moduleId = body.Value<int?>("moduleId") ?? body.Value<int?>("ModuleId") ?? ActiveModule?.ModuleID ?? 0;
                string homeUrl = (body.Value<string>("homeUrl") ?? string.Empty).Trim();
                string currentPageUrl = (body.Value<string>("currentPageUrl") ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(homeUrl))
                    homeUrl = !string.IsNullOrWhiteSpace(currentPageUrl) ? currentPageUrl : ResolveCurrentPageUrl();
                if (string.IsNullOrWhiteSpace(currentPageUrl))
                    currentPageUrl = homeUrl;
                if (moduleId <= 0)
                    return Request.CreateResponse(System.Net.HttpStatusCode.BadRequest, new { error = "Missing moduleId context for starter launch." });
                if (string.IsNullOrWhiteSpace(starterKey))
                    return Request.CreateResponse(System.Net.HttpStatusCode.BadRequest, new { error = "starterKey is required." });

                var actor = ResolveActor();
                var locator = MegaForm.DNN.Services.DnnServiceLocator.Instance;
                object starter; int formId; string defaultViewKey;
                switch (starterKey)
                {
                    case "leave":
                    case "leave-request":
                    {
                        var res = locator.LeaveRequestStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                        starter = res; formId = res.FormId; defaultViewKey = res.DefaultViewKey;
                        break;
                    }
                    case "proposal":
                    {
                        var res = locator.ProposalStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                        starter = res; formId = res.FormId; defaultViewKey = res.DefaultViewKey;
                        break;
                    }
                    case "document":
                    case "documents":
                    case "document-exchange":
                    {
                        var res = locator.DocumentExchangeStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                        starter = res; formId = res.FormId; defaultViewKey = res.DefaultViewKey;
                        break;
                    }
                    case "po":
                    case "purchase-order":
                    {
                        var res = locator.PurchaseOrderStarter.EnsureStarter(portalId, moduleId, actor?.UserId ?? 0);
                        starter = res; formId = res.FormId; defaultViewKey = string.Empty;
                        break;
                    }
                    case "recruitment":
                    case "recruitment-pipeline":
                    {
                        var res = locator.RecruitmentStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                        starter = res; formId = res.JobPostingFormId; defaultViewKey = res.DefaultViewKey;
                        break;
                    }
                    case "blog":
                    case "blogs":
                    case "blog-publishing":
                    {
                        var res = locator.ConfiguredAppStarter.EnsureStarter("blog", portalId, moduleId, homeUrl, actor);
                        starter = res; formId = res.FormId; defaultViewKey = res.DefaultViewKey;
                        break;
                    }
                    default:
                        return Request.CreateResponse(System.Net.HttpStatusCode.BadRequest, new { error = "Unknown starterKey: " + starterKey });
                }

                if (formId <= 0)
                    return Request.CreateResponse(System.Net.HttpStatusCode.BadRequest, new { error = "Starter app setup did not return a valid form." });

                BindStarterModule(moduleId, formId, defaultViewKey);
                var redirectUrl = BuildStarterRedirectUrl(currentPageUrl, defaultViewKey);

                return Request.CreateResponse(System.Net.HttpStatusCode.OK, new
                {
                    success = true,
                    starter,
                    formId,
                    defaultViewKey,
                    redirectUrl
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(System.Net.HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        private static void BindStarterModule(int moduleId, int formId, string defaultViewKey)
        {
            // Mirror the Oqtane WorkflowStarter.BindStarterToModule shape:
            // tell the DNN module which form to render + which view to open
            // first. Uses ModuleController.Instance settings keyed with the
            // standard MegaForm_* prefix the rest of the DNN module already
            // reads (see ManageModule.ascx.cs + Phase2/ModuleConfig writers).
            var mc = DotNetNuke.Entities.Modules.ModuleController.Instance;
            mc.UpdateModuleSetting(moduleId, "MegaForm_FormId", formId.ToString());
            mc.UpdateModuleSetting(moduleId, "MegaForm_DefaultView", string.Empty);
            mc.UpdateModuleSetting(moduleId, "MegaForm_CustomViewKey", defaultViewKey ?? string.Empty);
            mc.UpdateModuleSetting(moduleId, "MegaForm_ModuleConfigured", "true");

            // DNN render selection prefers MF_ModuleViewConfig over ModuleSettings.
            // Keep it in sync so starter apps do not render an older form selected
            // through the module manage UI.
            try
            {
                var views = FormRepository.GetFormViews(formId) ?? new List<FormViewInfo>();
                var viewConfigJson = FormViewSelector.AttachSelectionMetadata("{}", defaultViewKey ?? string.Empty, views);
                FormRepository.SaveModuleViewConfig(new ModuleViewConfigInfo
                {
                    ModuleId = moduleId,
                    FormId = formId,
                    ViewType = "submit",
                    ViewConfigJson = viewConfigJson,
                    CssClass = string.Empty,
                    CacheMinutes = 0,
                    PermissionsJson = string.Empty
                });
            }
            catch
            {
                // Older installs may not have MF_ModuleViewConfig yet; ModuleSettings
                // binding above remains the compatibility path.
            }
        }

        private string BuildStarterRedirectUrl(string currentPageUrl, string defaultViewKey)
        {
            var baseUrl = !string.IsNullOrWhiteSpace(currentPageUrl) ? currentPageUrl : ResolveCurrentPageUrl();
            if (string.IsNullOrWhiteSpace(baseUrl)) baseUrl = "/";

            Uri absolute;
            if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out absolute))
            {
                Uri.TryCreate(new Uri(ResolveCurrentOrigin()), baseUrl, out absolute);
            }
            if (absolute == null) return baseUrl;

            var builder = new UriBuilder(absolute);
            var query = System.Web.HttpUtility.ParseQueryString(builder.Query ?? string.Empty);
            query.Remove("view");
            query.Remove("formid");
            query.Remove("mfpanel");
            query.Remove("edit");
            if (!string.IsNullOrWhiteSpace(defaultViewKey))
                query["vk"] = defaultViewKey;
            else
                query.Remove("vk");
            builder.Query = query.ToString();
            return builder.Uri.PathAndQuery + builder.Fragment;
        }

        private string ResolveCurrentPageUrl()
        {
            try
            {
                var req = HttpContext.Current?.Request;
                if (req == null) return string.Empty;
                var origin = ResolveCurrentOrigin();
                return origin + req.Url.AbsolutePath;
            }
            catch { return string.Empty; }
        }

        private string ResolveCurrentOrigin()
        {
            try
            {
                var req = HttpContext.Current?.Request;
                if (req == null) return string.Empty;
                return req.Url.GetLeftPart(UriPartial.Authority);
            }
            catch { return string.Empty; }
        }

        private MegaForm.Core.Services.UserContext ResolveActor()
        {
            var user = UserInfo;
            var roles = new System.Collections.Generic.List<string>();
            if (user != null && user.Roles != null) roles.AddRange(user.Roles);
            return new MegaForm.Core.Services.UserContext
            {
                UserId = user?.UserID ?? 0,
                UserName = user?.Username ?? string.Empty,
                DisplayName = user?.DisplayName ?? user?.Username ?? string.Empty,
                Email = user?.Email ?? string.Empty,
                IsAuthenticated = (user?.UserID ?? 0) > 0,
                IsAdmin = (user?.IsInRole("Administrators") ?? false) || (user?.IsSuperUser ?? false),
                IsSuperUser = user?.IsSuperUser ?? false,
                Roles = roles,
                IpAddress = HttpContext.Current?.Request?.UserHostAddress ?? string.Empty
            };
        }
    }
}
