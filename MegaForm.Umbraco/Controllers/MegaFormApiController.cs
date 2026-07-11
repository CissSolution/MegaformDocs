using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Web.Common.Controllers;
using Umbraco.Cms.Web.Common.Attributes;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Core.Utilities;
using MegaForm.Umbraco.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Core;
using Umbraco.Cms.Web.Common.Authorization;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// MegaForm API for Umbraco — maps to same contract as DNN/Oqtane.
    /// Route: /umbraco/api/megaform/...
    /// </summary>
    [PluginController("MegaForm")]
    public partial class MegaFormApiController : UmbracoApiController
    {
        private readonly IFormRepository _formRepo;
        private readonly ISubmissionRepository _subRepo;
        private readonly IPhase2Repository _phase2Repo;
        private readonly SubmissionProcessor _processor;
        private readonly IPlatformContext _platform;
        private readonly IUmbracoModuleConfigService _moduleConfigService;
        private readonly ILogger<MegaFormApiController> _logger;
        private readonly IWebHostEnvironment _env;
        private readonly Services.UmbracoBuilderTemplateCatalogService _templateCatalog;
        private readonly PermissionCatalogService _permissionCatalog;
        private readonly IWorkflowLibraryRepository _workflowLibrary;
        private readonly IWorkflowNodeUiSchemaProvider _nodeSchemaProvider;

        public MegaFormApiController(
            IFormRepository formRepo,
            ISubmissionRepository subRepo,
            IPhase2Repository phase2Repo,
            SubmissionProcessor processor,
            IPlatformContext platform,
            IUmbracoModuleConfigService moduleConfigService,
            ILogger<MegaFormApiController> logger,
            IWebHostEnvironment env,
            Services.UmbracoBuilderTemplateCatalogService templateCatalog,
            PermissionCatalogService permissionCatalog,
            IWorkflowLibraryRepository workflowLibrary,
            IWorkflowNodeUiSchemaProvider nodeSchemaProvider)
        {
            _formRepo = formRepo;
            _subRepo = subRepo;
            _phase2Repo = phase2Repo;
            _processor = processor;
            _platform = platform;
            _moduleConfigService = moduleConfigService;
            _logger = logger;
            _env = env;
            _templateCatalog = templateCatalog;
            _permissionCatalog = permissionCatalog;
            _workflowLibrary = workflowLibrary;
            _nodeSchemaProvider = nodeSchemaProvider;
        }

        // ── Form CRUD ──

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        public IActionResult GetForm(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound();
            return Ok(form);
        }

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        public IActionResult ListForms(int siteId = 0)
        {
            // Umbraco currently runs as a single-site host; forms are stored with PortalId -1.
            // Returning the full list keeps the shared dashboard/submissions UI working.
            var forms = _formRepo.ListForms(-1);
            return Ok(forms);
        }

        // Cross-platform route aliases used by the shared Vite/TS admin UI.
        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/List")]
        public IActionResult FormList(int siteId = 0) => ListForms(siteId);

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/ListAll")]
        public IActionResult FormListAll() => ListForms(0);

        [HttpPost]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Delete")]
        public IActionResult FormDelete(int formId) => DeleteForm(formId);

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Stats")]
        public IActionResult FormStats(int formId)
        {
            var stats = _formRepo.GetFormStats(formId);
            return Ok(stats ?? new FormStatsInfo());
        }

        [HttpPost]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Duplicate")]
        public IActionResult DuplicateForm(int formId)
        {
            int newFormId = _formRepo.DuplicateForm(formId, _platform.UserId > 0 ? _platform.UserId : -1);
            return Ok(new { formId = newFormId });
        }

        [HttpPost]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/Workflow/Save")]
        public IActionResult SaveWorkflow([FromBody] JObject body)
        {
            if (body == null) return BadRequest(new { error = "Payload required" });
            int formId = body.Value<int?>("formId") ?? 0;
            var workflow = body["workflow"]?.ToString() ?? body["Workflow"]?.ToString() ?? "{}";
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound(new { error = "Form not found" });
            form.WorkflowJson = workflow;
            form.UpdatedOnUtc = DateTime.UtcNow;
            form.UpdatedByUserId = _platform.UserId > 0 ? _platform.UserId : form.UpdatedByUserId;
            _formRepo.SaveForm(form);
            return Ok(new { success = true, formId });
        }

        // Builder-compatible aliases for the shared Vite/TS admin UI.
        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Get")]
        public IActionResult FormGet(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound();
            return Ok(form);
        }

        [HttpPost]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Save")]
        public IActionResult FormSave([FromBody] FormInfo form) => SaveForm(form);

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/BuilderTemplates/List")]
        public IActionResult ListBuilderTemplates()
        {
            var templates = _templateCatalog?.List() ?? new System.Collections.Generic.List<Services.UmbracoBuilderTemplateCatalogService.BuilderTemplateRecord>();
            return Ok(templates);
        }

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/i18n/list")]
        public IActionResult ListI18nLocales()
        {
            // Merge built-in locales shipped with the package (read-only) and user overrides
            // stored under App_Data/MegaForm/i18n.
            var codes = new System.Collections.Generic.List<string>();
            var provider = _env.WebRootFileProvider;

            // Built-in index manifest (if present)
            var indexFile = provider.GetFileInfo("App_Plugins/MegaForm/js/i18n/index.json");
            if (indexFile.Exists)
            {
                try
                {
                    using var stream = indexFile.CreateReadStream();
                    using var reader = new StreamReader(stream, Encoding.UTF8);
                    var indexJson = JObject.Parse(reader.ReadToEnd());
                    var idxCodes = indexJson["locales"]?
                        .Select(l => l.Value<string>())
                        .Where(c => !string.IsNullOrWhiteSpace(c));
                    if (idxCodes != null) codes.AddRange(idxCodes);
                }
                catch { /* fall through */ }
            }

            // Built-in disk packs
            var builtInDir = provider.GetDirectoryContents("App_Plugins/MegaForm/js/i18n");
            if (builtInDir.Exists)
            {
                foreach (var c in builtInDir
                    .Where(f => !f.IsDirectory && f.Name.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                    .Select(f => Path.GetFileNameWithoutExtension(f.Name))
                    .Where(f => !string.Equals(f, "index", StringComparison.OrdinalIgnoreCase))
                    .OrderBy(f => f, StringComparer.OrdinalIgnoreCase))
                {
                    if (!codes.Contains(c, StringComparer.OrdinalIgnoreCase))
                        codes.Add(c);
                }
            }

            // User override packs (App_Data/MegaForm/i18n)
            var userI18nDir = MegaFormUmbracoPaths.GetI18nPath(_env);
            if (Directory.Exists(userI18nDir))
            {
                foreach (var c in Directory.GetFiles(userI18nDir, "*.json")
                    .Select(f => Path.GetFileNameWithoutExtension(f))
                    .Where(f => !string.Equals(f, "index", StringComparison.OrdinalIgnoreCase))
                    .OrderBy(f => f, StringComparer.OrdinalIgnoreCase))
                {
                    if (!codes.Contains(c, StringComparer.OrdinalIgnoreCase))
                        codes.Add(c);
                }
            }

            if (codes.Count == 0) codes.Add("en-US");
            return Ok(codes.ToArray());
        }

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/i18n/index.json")]
        public IActionResult I18nIndexJson() => ListI18nLocales();

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/i18n/{locale}.json")]
        public IActionResult GetI18nLocaleJson(string locale)
        {
            if (string.IsNullOrWhiteSpace(locale)) return BadRequest(new { error = "locale required" });
            var safeLocale = SanitizeLocale(locale);
            if (string.IsNullOrEmpty(safeLocale)) return BadRequest(new { error = "invalid locale" });

            // User override wins over built-in pack.
            var userPath = Path.Combine(MegaFormUmbracoPaths.GetI18nPath(_env), safeLocale + ".json");
            if (System.IO.File.Exists(userPath))
                return PhysicalFile(userPath, "application/json; charset=utf-8");

            var fileInfo = _env.WebRootFileProvider.GetFileInfo($"App_Plugins/MegaForm/js/i18n/{safeLocale}.json");
            if (fileInfo.Exists)
                return File(fileInfo.CreateReadStream(), "application/json; charset=utf-8");

            if (string.Equals(safeLocale, "en-US", StringComparison.OrdinalIgnoreCase))
                return Ok(new { });

            return NotFound(new { error = $"Locale '{safeLocale}' not found" });
        }

        public class I18nUpsertRequest
        {
            public string locale { get; set; }
            public string copyFrom { get; set; }
            public Dictionary<string, string> entries { get; set; }
            public string jsonText { get; set; }
        }

        // The shared Languages UI posts to the legacy /api/MegaForm/i18n/* paths.
        // These absolute routes let the same bundle work on Umbraco without a JS fork.
        [HttpPost]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/api/MegaForm/i18n/create")]
        [Route("/api/MegaForm/i18n/save")]
        [Route("/api/MegaForm/i18n/import")]
        public IActionResult UpsertI18nLocale([FromBody] I18nUpsertRequest body)
        {
            try
            {
                if (body == null || string.IsNullOrWhiteSpace(body.locale))
                    return BadRequest(new { error = "locale required" });

                var safeLocale = SanitizeLocale(body.locale);
                if (string.IsNullOrEmpty(safeLocale)) return BadRequest(new { error = "invalid locale" });
                if (string.Equals(safeLocale, "en-US", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { error = "en-US is the built-in source locale and cannot be overwritten." });
                if (string.Equals(safeLocale, "index", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { error = "'index' is the locale manifest and cannot be overwritten." });

                // User locales are persisted under App_Data so package assets stay read-only.
                var i18nDir = MegaFormUmbracoPaths.GetI18nPath(_env);
                Directory.CreateDirectory(i18nDir);
                var path = Path.Combine(i18nDir, safeLocale + ".json");

                JObject result;
                // import: replace the whole pack with the supplied JSON text
                if (!string.IsNullOrWhiteSpace(body.jsonText))
                {
                    try { result = JObject.Parse(body.jsonText); }
                    catch { return BadRequest(new { error = "jsonText is not valid JSON" }); }
                }
                // save: MERGE the posted entries into the existing pack (user override first,
                // then built-in dependency-shipped pack as the base).
                else if (body.entries != null && body.entries.Count > 0)
                {
                    result = LoadI18nPack(safeLocale) ?? new JObject();
                    foreach (var p in body.entries)
                        result[p.Key] = p.Value;
                }
                // create: seed a new pack from copyFrom (defaults to en-US -> empty)
                else
                {
                    if (System.IO.File.Exists(path))
                        return Ok(new { ok = true, locale = safeLocale, existed = true });
                    var copyFrom = string.IsNullOrWhiteSpace(body.copyFrom) ? "en-US" : body.copyFrom;
                    result = LoadI18nPack(copyFrom) ?? new JObject();
                }

                System.IO.File.WriteAllText(path, result.ToString(Formatting.Indented), new UTF8Encoding(false));
                return Ok(new { ok = true, locale = safeLocale, count = result.Count });
            }
            catch (UnauthorizedAccessException)
            {
                return StatusCode(500, new { error = "Locale write failed: App_Data/MegaForm/i18n is not writable on this host." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Locale write failed: " + ex.Message });
            }
        }

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/api/MegaForm/i18n/export/{locale}")]
        public IActionResult ExportI18nLocale(string locale)
        {
            if (string.IsNullOrWhiteSpace(locale)) return BadRequest(new { error = "locale required" });
            var safeLocale = SanitizeLocale(locale);
            if (string.IsNullOrEmpty(safeLocale)) return BadRequest(new { error = "invalid locale" });

            var userPath = Path.Combine(MegaFormUmbracoPaths.GetI18nPath(_env), safeLocale + ".json");
            if (System.IO.File.Exists(userPath))
                return File(System.IO.File.ReadAllBytes(userPath), "application/json", safeLocale + ".json");

            var builtIn = _env.WebRootFileProvider.GetFileInfo($"App_Plugins/MegaForm/js/i18n/{safeLocale}.json");
            if (builtIn.Exists)
                return File(builtIn.CreateReadStream(), "application/json", safeLocale + ".json");

            return NotFound(new { error = $"Locale '{safeLocale}' not found" });
        }

        private static string SanitizeLocale(string locale)
        {
            return new string((locale ?? "").Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_').ToArray());
        }

        private static JObject SafeParseI18n(string s)
        {
            try { return JObject.Parse(s); } catch { return new JObject(); }
        }

        private JObject LoadI18nPack(string locale)
        {
            var safe = SanitizeLocale(locale);
            if (string.IsNullOrEmpty(safe) ||
                string.Equals(safe, "en-US", StringComparison.OrdinalIgnoreCase))
                return null;

            // User override wins.
            var userPath = Path.Combine(MegaFormUmbracoPaths.GetI18nPath(_env), safe + ".json");
            if (System.IO.File.Exists(userPath))
            {
                try { return JObject.Parse(System.IO.File.ReadAllText(userPath, Encoding.UTF8)); }
                catch { return new JObject(); }
            }

            // Fall back to built-in dependency-shipped pack.
            var fileInfo = _env.WebRootFileProvider.GetFileInfo($"App_Plugins/MegaForm/js/i18n/{safe}.json");
            if (fileInfo.Exists)
            {
                try
                {
                    using var stream = fileInfo.CreateReadStream();
                    using var reader = new StreamReader(stream, Encoding.UTF8);
                    return JObject.Parse(reader.ReadToEnd());
                }
                catch { return new JObject(); }
            }
            return null;
        }

        [HttpPost]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        public IActionResult SaveForm([FromBody] FormInfo form)
        {
            if (form == null) return BadRequest(new { error = "Form payload is required" });

            if (form.PortalId <= 0) form.PortalId = _platform.PortalId;
            if (form.ModuleId <= 0) form.ModuleId = _platform.ModuleId;
            if (form.CreatedByUserId <= 0) form.CreatedByUserId = _platform.UserId;
            form.UpdatedByUserId = _platform.UserId > 0 ? _platform.UserId : form.UpdatedByUserId;
            form.UpdatedOnUtc = DateTime.UtcNow;

            _logger.LogInformation("[MegaForm.Umbraco] SaveForm formId={FormId} moduleId={ModuleId} portalId={PortalId} title={Title}", form.FormId, form.ModuleId, form.PortalId, form.Title);
            int formId = _formRepo.SaveForm(form);
            return Ok(new { formId, moduleId = form.ModuleId, siteId = form.PortalId });
        }

        [HttpDelete]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        public IActionResult DeleteForm(int formId)
        {
            _formRepo.DeleteForm(formId);
            return Ok(new { success = true });
        }

        // ── Submissions ──

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        public IActionResult GetSubmissions(int formId, string status = null,
            string search = null, int pageIndex = 0, int pageSize = 50)
        {
            var result = _subRepo.List(formId, status, search, null, null, pageIndex, pageSize);
            return Ok(new { items = result.Items, totalCount = result.TotalCount });
        }

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/Submissions/List")]
        public IActionResult SubmissionsList(int formId = 0, string status = null,
            string search = null, int pageIndex = 0, int pageSize = 50)
            => GetSubmissions(formId, status, search, pageIndex, pageSize);

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/Reports/FormsOverview")]
        public IActionResult ReportsFormsOverview(int days = 30, int siteId = 0)
        {
            var forms = _formRepo.ListForms(-1);
            var rows = new List<object>();
            var utcNow = DateTime.UtcNow;
            var startDate = utcNow.Date.AddDays(-days);
            foreach (var form in forms)
            {
                var all = _subRepo.List(form.FormId, pageSize: int.MaxValue);
                var items = all.Items ?? new List<SubmissionInfo>();
                var series = new int[days];
                foreach (var s in items)
                {
                    var d = s.SubmittedOnUtc.Date;
                    var idx = (int)(d - startDate).TotalDays;
                    if (idx >= 0 && idx < days) series[idx]++;
                }
                rows.Add(new
                {
                    formId = form.FormId,
                    title = form.Title,
                    status = form.Status,
                    createdOnUtc = form.CreatedOnUtc,
                    allTime = items.Count,
                    last7 = series.Skip(Math.Max(0, days - 7)).Take(7).Sum(),
                    last30 = series.Sum(),
                    series = series,
                    completion = (int?)null
                });
            }
            return Ok(new { generatedAtUtc = utcNow, forms = rows });
        }

        [HttpPost]
        [AllowAnonymous]
        public async Task<IActionResult> Submit()
        {
            var body = await ReadSubmitBodyAsync();
            return await DoSubmitAsync(body);
        }

        // [RendererSubmitTarget v20260406-03] The canonical renderer posts to
        // {apiBaseUrl}Submit/Post (legacy DNN convention). This alias keeps the
        // front-end contract intact on Umbraco without forking the renderer.
        [HttpPost]
        [AllowAnonymous]
        [Route("Submit/Post")]
        public async Task<IActionResult> Post()
        {
            var body = await ReadSubmitBodyAsync();
            return await DoSubmitAsync(body);
        }

        private async Task<JObject> ReadSubmitBodyAsync()
        {
            Request.EnableBuffering();
            using var reader = new System.IO.StreamReader(Request.Body, System.Text.Encoding.UTF8, leaveOpen: true);
            var json = await reader.ReadToEndAsync();
            Request.Body.Position = 0;
            return JsonConvert.DeserializeObject<JObject>(json) ?? new JObject();
        }

        private async Task<IActionResult> DoSubmitAsync(JObject body)
        {
            int formId = body?.Value<int>("formId") ?? 0;
            _logger.LogInformation("[MegaForm.Umbraco] Submit received formId={FormId}", formId);

            var form = formId > 0 ? _formRepo.GetForm(formId) : null;
            if (form == null) return NotFound(new { error = "Form not found" });

            string dataJson = body["data"]?.ToString() ?? "{}";
            var formData = JsonConvert.DeserializeObject<Dictionary<string, object>>(dataJson) ?? new Dictionary<string, object>();

            string ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
            string ua = Request.Headers["User-Agent"].FirstOrDefault() ?? "";
            int? userId = _platform.IsAuthenticated ? _platform.UserId : null;

            var result = await _processor.ProcessAsync(formId, formData, ip, ua, userId);
            _logger.LogInformation("[MegaForm.Umbraco] ProcessAsync result Success={Success} SubmissionId={SubmissionId} Error={Error}", result.Success, result.SubmissionId, result.ErrorMessage);
            if (result.Success)
                return Ok(new { submissionId = result.SubmissionId, success = true });
            return BadRequest(new { error = result.ErrorMessage, validationErrors = result.ValidationErrors });
        }

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        public IActionResult GetSubmission(int submissionId)
        {
            var sub = _subRepo.Get(submissionId);
            if (sub == null) return NotFound();
            return Ok(sub);
        }

        [HttpPost]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        public IActionResult UpdateSubmissionStatus(int submissionId, string status)
        {
            _subRepo.UpdateStatus(submissionId, status);
            return Ok(new { success = true });
        }

        // ── Schema (public, for form rendering) ──

        [HttpGet]
        [AllowAnonymous]
        public IActionResult Schema(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null || form.Status != "Published") return NotFound();
            return Ok(new
            {
                formId = form.FormId,
                title = form.Title,
                description = form.Description,
                schema = form.SchemaJson,
                submitButtonText = form.SubmitButtonText ?? "Submit",
                enableCaptcha = form.EnableCaptcha,
                themeJson = form.ThemeJson
            });
        }

        // ── Module/Content Config ──

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        public IActionResult GetModuleConfig(int contentId)
        {
            if (contentId <= 0) contentId = _platform.ModuleId;
            var portalId = _platform.PortalId;
            var cfg = _moduleConfigService.GetConfig(contentId);
            var forms = _formRepo.ListForms(portalId);
            return Ok(new
            {
                contentId,
                portalId,
                moduleConfigured = cfg != null,
                formId = cfg?.FormId ?? 0,
                viewType = cfg?.ViewType ?? "submit",
                viewConfigJson = cfg?.ViewConfigJson ?? "{}",
                cssClass = cfg?.CssClass,
                cacheMinutes = cfg?.CacheMinutes ?? 0,
                permissionsJson = cfg?.PermissionsJson,
                forms = forms.Select(f => new { f.FormId, f.Title, f.Status })
            });
        }

        [HttpPost]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        public IActionResult SaveModuleConfig([FromBody] JObject body)
        {
            if (body == null) return BadRequest(new { error = "Payload is required" });

            int contentId = body.Value<int?>("contentId") ?? body.Value<int?>("moduleId") ?? _platform.ModuleId;
            int formId = body.Value<int?>("formId") ?? 0;
            string viewType = body.Value<string>("viewType") ?? "submit";
            string viewConfigJson = body["viewConfigJson"]?.ToString()
                ?? body["configJson"]?.ToString()
                ?? body["viewConfig"]?.ToString()
                ?? "{}";
            string cssClass = body.Value<string>("cssClass");
            int cacheMinutes = body.Value<int?>("cacheMinutes") ?? 0;
            string permissionsJson = body["permissionsJson"]?.ToString() ?? body["permissions"]?.ToString();

            if (contentId <= 0) return BadRequest(new { error = "contentId is required" });
            if (formId <= 0) return BadRequest(new { error = "formId is required" });

            var cfg = new ModuleViewConfigInfo
            {
                ModuleId = contentId,
                FormId = formId,
                ViewType = string.IsNullOrWhiteSpace(viewType) ? "submit" : viewType,
                ViewConfigJson = string.IsNullOrWhiteSpace(viewConfigJson) ? "{}" : viewConfigJson,
                CssClass = cssClass,
                CacheMinutes = cacheMinutes,
                PermissionsJson = permissionsJson
            };

            var saved = _moduleConfigService.SaveConfig(cfg);
            _logger.LogInformation("[MegaForm.Umbraco] SaveModuleConfig contentId={ContentId} formId={FormId} viewType={ViewType}", contentId, formId, saved.ViewType);

            return Ok(new
            {
                success = true,
                contentId = saved.ModuleId,
                formId = saved.FormId,
                viewType = saved.ViewType,
                viewConfigJson = saved.ViewConfigJson ?? "{}",
                cssClass = saved.CssClass,
                cacheMinutes = saved.CacheMinutes,
                permissionsJson = saved.PermissionsJson
            });
        }

        // ── Permissions ──

        [HttpGet("Permissions/Get")]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/Permissions/Get")]
        public IActionResult GetPermissions(int formId)
        {
            if (formId <= 0) return BadRequest(new { error = "formId required" });
            var permissions = PermissionCatalogService.NormalizeRules(formId, _phase2Repo.GetFormPermissions(formId));
            return Ok(new { permissions });
        }

        [HttpGet("Permissions/Catalog")]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/Permissions/Catalog")]
        public IActionResult GetPermissionsCatalog(int formId)
        {
            if (formId < 0) formId = 0;
            var permissions = formId > 0
                ? PermissionCatalogService.NormalizeRules(formId, _phase2Repo.GetFormPermissions(formId))
                : new List<FormPermissionInfo>();
            var catalog = _permissionCatalog.GetCatalog(formId, _platform.PortalId, BuildUserContext());
            return Ok(new { permissions, catalog });
        }

        [HttpPost("Permissions/Save")]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/Permissions/Save")]
        public IActionResult SavePermissions([FromBody] JObject body)
        {
            int formId = body?.Value<int>("formId") ?? 0;
            if (formId <= 0) return BadRequest(new { error = "formId required" });

            var permissions = body?["permissions"]?.ToObject<List<FormPermissionInfo>>() ?? new List<FormPermissionInfo>();
            var normalized = PermissionCatalogService.NormalizeRules(formId, permissions);
            _phase2Repo.SaveFormPermissions(formId, normalized);
            return Ok(new { success = true, permissions = normalized });
        }

        private UserContext BuildUserContext()
        {
            var user = User;
            return new UserContext
            {
                UserId = _platform.UserId,
                UserName = user?.Identity?.Name ?? string.Empty,
                Email = user?.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value ?? string.Empty,
                IsAuthenticated = user?.Identity?.IsAuthenticated ?? false,
                IsAdmin = _platform.IsAdmin,
                Roles = user?.Claims
                    .Where(c => c.Type == System.Security.Claims.ClaimTypes.Role)
                    .Select(c => c.Value)
                    .Where(v => !string.IsNullOrWhiteSpace(v))
                    .ToList() ?? new List<string>()
            };
        }

        // ── Content App (Bellissima) ──

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        [Route("/umbraco/MegaForm/MegaFormApi/ContentApp/Info")]
        public IActionResult ContentAppInfo(int contentId)
        {
            if (contentId <= 0)
                return BadRequest(new { error = "contentId is required" });

            var cfg = _moduleConfigService.GetConfig(contentId);
            if (cfg == null || cfg.FormId <= 0)
                return Ok(new { configured = false, contentId });

            var form = _formRepo.GetForm(cfg.FormId);
            var submissions = _subRepo.List(cfg.FormId, pageSize: 5);

            return Ok(new
            {
                configured = true,
                contentId,
                formId = cfg.FormId,
                formTitle = form?.Title,
                viewType = cfg.ViewType ?? "submit",
                submissionsTotal = submissions.TotalCount,
                recentSubmissions = submissions.Items.Select(s => new
                {
                    s.SubmissionId,
                    s.Status,
                    s.SubmittedOnUtc
                }).ToList()
            });
        }

        // ── Test / seed (development only) ──

#if DEBUG
        [HttpPost]
        [AllowAnonymous]
        [Route("seed-test-form")]
        public IActionResult SeedTestForm()
        {
            var schema = new
            {
                fields = new[]
                {
                    new { key = "name", type = "Text", label = "Name", required = true },
                    new { key = "email", type = "Email", label = "Email", required = true }
                },
                settings = new { multiPage = false, defaultLanguage = "en-US" }
            };

            var form = new FormInfo
            {
                Title = "Contact Us",
                Description = "Umbraco render/submit test form",
                Status = "Published",
                SchemaJson = JsonConvert.SerializeObject(schema),
                SettingsJson = "{}",
                ThemeJson = "{}",
                SubmitButtonText = "Submit",
                SuccessMessage = "Thank you!",
                PortalId = -1,
                ModuleId = -1,
                CreatedByUserId = -1,
                UpdatedByUserId = -1,
                CreatedOnUtc = DateTime.UtcNow,
                UpdatedOnUtc = DateTime.UtcNow
            };

            int formId = _formRepo.SaveForm(form);
            _logger.LogInformation("[MegaForm.Umbraco] Seeded test form {FormId}", formId);
            return Ok(new { formId, title = form.Title });
        }
#endif

        // ── Fields (for view config) ──

        [HttpGet]
        [Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
        public IActionResult GetFields(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound();

            FormSchema schema = null;
            try { schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson); } catch { }

            var fields = new List<object>();
            if (schema != null)
            {
                fields = MegaFormUtils.FlattenFields(schema.Fields)
                    .Where(f => f.Type != "Html" && f.Type != "Section" && f.Type != "Hidden" && f.Type != "Row")
                    .Select(f => (object)new { f.Key, f.Label, f.Type })
                    .ToList();
            }
            return Ok(new { fields });
        }

        // ── File Upload ──

        [HttpPost]
        [AllowAnonymous]
        [Route("/umbraco/MegaForm/MegaFormApi/Upload/File")]
        public async Task<IActionResult> UploadFile([FromForm] IFormFile file, [FromForm] int formId = 0, [FromForm] string fieldKey = "")
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "No file uploaded" });

            var allowed = new[] { ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".doc", ".docx", ".txt", ".xls", ".xlsx" };
            var ext = Path.GetExtension(file.FileName)?.ToLowerInvariant() ?? "";
            if (!allowed.Contains(ext))
                return BadRequest(new { error = $"File type {ext} is not allowed" });

            if (file.Length > 10 * 1024 * 1024)
                return BadRequest(new { error = "File exceeds 10MB limit" });

            try
            {
                var uploadsRoot = MegaFormUmbracoPaths.GetTempUploadsPath(_env);
                Directory.CreateDirectory(uploadsRoot);

                var safeName = $"{Guid.NewGuid():N}{ext}";
                var relativePath = $"{MegaFormUmbracoPaths.TempUploadsRelative}/{safeName}";
                var fullPath = Path.Combine(uploadsRoot, safeName);

                using (var stream = new FileStream(fullPath, FileMode.Create))
                    await file.CopyToAsync(stream);

                _logger.LogInformation("[MegaForm.Umbraco] Uploaded file {FileName} to {Path} for formId={FormId} fieldKey={FieldKey}", file.FileName, relativePath, formId, fieldKey);

                return Ok(new
                {
                    fileName = file.FileName,
                    tempPath = relativePath,
                    contentType = file.ContentType,
                    fileSize = file.Length
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm.Umbraco] UploadFile failed");
                return StatusCode(500, new { error = "Upload failed: " + ex.Message });
            }
        }
    }
}
