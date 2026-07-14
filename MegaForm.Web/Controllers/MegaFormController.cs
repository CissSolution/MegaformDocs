using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Rendering;
using MegaForm.Core.Services;  // RuleEvaluator + ConditionNodeConverter
using MegaForm.Web.Services;
using Newtonsoft.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.StaticFiles;

namespace MegaForm.Web.Controllers
{
    // =========================================================
    //  MegaForm ASP.NET Core Web API Controller
    //  Route: /api/MegaForm/...
    //
    //  Parity với DNN MegaFormApiController — cùng endpoint path,
    //  cùng request/response shape → JS frontend không thay đổi.
    //
    //  Khác biệt DNN vs Web:
    //    DNN : UserInfo.UserID, ModuleController, DnnApiController
    //    Web : IPlatformContext (JWT claims), IModuleSettingsService (DB), ControllerBase
    // =========================================================

    [ApiController]
    [Route("api/MegaForm")]
    public partial class MegaFormController : ControllerBase
    {
        private const string PdfFormUploadWebBadge = "PdfFormUploadWeb v20260505-01";
        private readonly IFormRepository         _formRepo;
        private readonly ISubmissionRepository   _subRepo;
        private readonly IDraftRepository        _draftRepo;
        private readonly IPhase2Repository       _phase2Repo;
        private readonly IModuleSettingsService  _moduleSettings;
        private readonly IPlatformContext        _ctx;
        private readonly SubmissionProcessor     _processor;
        private readonly IStorageService         _storage;
        private readonly IConfiguration          _cfg;
        private readonly IWebHostEnvironment     _env;
        private readonly SubmissionQueryService   _submissionQueries;
        private readonly SubmissionWorkflowDetailService _submissionWorkflowDetails;
        private readonly IDatabaseWorkflowMetadataService _dbMetadata;
        private readonly BuilderTemplateCatalogService _templateCatalog;
        private readonly PermissionCatalogService _permissionCatalog;
        private readonly IConnectionRegistry _connectionRegistry;
        private readonly IFileRepository _fileRepo;

        public MegaFormController(
            IFormRepository        formRepo,
            ISubmissionRepository  subRepo,
            IDraftRepository       draftRepo,
            IPhase2Repository      phase2Repo,
            IModuleSettingsService moduleSettings,
            IPlatformContext       ctx,
            SubmissionProcessor    processor,
            IStorageService        storage,
            IConfiguration         cfg,
            IWebHostEnvironment    env,
            SubmissionWorkflowDetailService submissionWorkflowDetails,
            IDatabaseWorkflowMetadataService dbMetadata,
            BuilderTemplateCatalogService templateCatalog,
            PermissionCatalogService permissionCatalog,
            IConnectionRegistry    connectionRegistry,
            IFileRepository        fileRepo)
        {
            _formRepo       = formRepo;
            _subRepo        = subRepo;
            _draftRepo      = draftRepo;
            _phase2Repo     = phase2Repo;
            _moduleSettings = moduleSettings;
            // [SubmissionFilesFix v20260713] fileRepo was already injected but not
            // handed to the query service → GET Submissions/{id} returned files:[]
            // and attachments never showed in the detail views (DNN parity fix).
            _submissionQueries = new SubmissionQueryService(subRepo, formRepo, fileRepo);
            _ctx            = ctx;
            _processor      = processor;
            _connectionRegistry = connectionRegistry;
            _storage        = storage;
            _cfg            = cfg;
            _env            = env;
            _submissionWorkflowDetails = submissionWorkflowDetails;
            _dbMetadata     = dbMetadata;
            _templateCatalog = templateCatalog;
            _permissionCatalog = permissionCatalog;
            _fileRepo       = fileRepo;
        }

        private string GetSelectedThemePresetKey(int moduleId)
        {
            if (_moduleSettings == null || moduleId <= 0) return string.Empty;
            var preferred = _moduleSettings.GetSetting(moduleId, "MegaForm_SelectedThemePresetKey", string.Empty);
            if (!string.IsNullOrWhiteSpace(preferred)) return preferred;
            return _moduleSettings.GetSetting(moduleId, "SelectedThemePresetKey", string.Empty) ?? string.Empty;
        }

        private UserContext GetCurrentUserContext()
        {
            var user = User;
            return new UserContext
            {
                UserId = ParseUserId(user),
                UserName = user != null ? (user.FindFirstValue(ClaimTypes.Name) ?? "anonymous") : "anonymous",
                DisplayName = user != null
                    ? (user.FindFirstValue("display_name")
                        ?? user.FindFirstValue("name")
                        ?? user.FindFirstValue(ClaimTypes.Name)
                        ?? "anonymous")
                    : "anonymous",
                Email = user != null ? (user.FindFirstValue(ClaimTypes.Email) ?? string.Empty) : string.Empty,
                IsAuthenticated = user != null && user.Identity != null && user.Identity.IsAuthenticated,
                IsAdmin = user != null && user.IsInRole("Administrator"),
                IsSuperUser = false,
                Roles = user != null
                    ? user.Claims
                        .Where(c => c.Type == ClaimTypes.Role || c.Type == "role" || c.Type == "roles")
                        .Select(c => c.Value)
                        .Where(v => !string.IsNullOrWhiteSpace(v))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList()
                    : new List<string>(),
                IpAddress = HttpContext != null && HttpContext.Connection != null && HttpContext.Connection.RemoteIpAddress != null
                    ? HttpContext.Connection.RemoteIpAddress.ToString()
                    : string.Empty
            };
        }

        private int ResolvePortalId(int formId)
        {
            var form = formId > 0 ? _formRepo.GetForm(formId) : null;
            if (form != null && form.PortalId > 0) return form.PortalId;
            return _ctx != null ? _ctx.PortalId : 0;
        }

        private static int ParseUserId(ClaimsPrincipal user)
        {
            if (user == null) return -1;

            int userId;
            return int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub"), out userId)
                ? userId
                : -1;
        }

        private static bool IsAdmin(UserContext actor)
        {
            return actor != null && (actor.IsAdmin || actor.IsSuperUser);
        }

        // ── FORM ──────────────────────────────────────────────

        [HttpGet("Form/Get")]
        [Authorize]
        public IActionResult GetForm(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound();
            var resolved = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson, form.SubmitButtonText, form.SuccessMessage, form.RedirectUrl);
            var selectedPresetThemeKey = GetSelectedThemePresetKey(form.ModuleId);
            return Ok(new
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
                InitialInlineCss = ThemePresetInlineCssService.Build(resolved.SettingsJson, selectedPresetThemeKey, "#mf-form-wrapper-" + form.FormId),
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

        [HttpGet("Form/ListAll")]
        [Authorize]
        public IActionResult ListAll(int moduleId = 0, int portalId = 0)
        {
            var forms = moduleId > 0
                ? _formRepo.GetFormsByModule(moduleId)
                : _formRepo.ListForms(portalId > 0 ? portalId : _ctx.PortalId);
            return Ok(forms);
        }

        [HttpPost("Form/Save")]
        [Authorize]
        public IActionResult SaveForm([FromBody] FormInfo form)
        {
            if (form == null) return BadRequest(new { error = "form required" });
            if (string.IsNullOrWhiteSpace(form.RulesJson) || form.RulesJson == "[]")
            {
                form.RulesJson = ExtractRulesJson(form.SchemaJson, form.SettingsJson);
            }
            form.CreatedByUserId = _ctx.UserId;
            form.UpdatedByUserId = _ctx.UserId;
            int id = _formRepo.SaveForm(form);
            return Ok(new { formId = id });
        }

        // REST-style aliases used by the modern admin UI (builder toolbar, etc.)
        [HttpGet("Form/{formId}")]
        [Authorize]
        public IActionResult GetFormById(int formId) => GetForm(formId);

        [HttpPost("Form")]
        [Authorize]
        public IActionResult CreateOrUpdateForm([FromBody] FormInfo form) => SaveForm(form);

        /// <summary>
        /// POST api/MegaForm/Form/SaveTheme
        /// Only updates ThemeJson — does NOT touch SchemaJson or other fields.
        /// Called by Theme Designer to avoid overwriting the form schema.
        /// Body: { FormId, ThemeJson }
        /// </summary>
        [HttpPost("Form/SaveTheme")]
        [Authorize]
        public IActionResult SaveTheme([FromBody] JObject body)
        {
            if (body == null) return BadRequest(new { error = "body required" });
            int formId = body.Value<int>("FormId");
            string themeJson = body["ThemeJson"]?.ToString() ?? "{}";
            string schemaCustomCss = body["SchemaCustomCss"]?.ToString();
            string themeId = body["ThemeId"]?.ToString();
            var cssOverrides = body["CssOverrides"] as JObject;
            // [HideHeader v20260705] Optional form-header toggle (Settings popup). Partial patch: null = untouched.
            bool? hideHeader = (body["HideHeader"] is JToken hh && hh.Type == JTokenType.Boolean) ? hh.Value<bool>() : (bool?)null;
            if (formId == 0) return BadRequest(new { error = "FormId required" });

            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound(new { error = "Form not found" });

            form.ThemeJson = themeJson;
            JObject settingsForSave = null;
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
                    if (hideHeader.HasValue) { settings["hideHeader"] = hideHeader.Value; settings["HideHeader"] = hideHeader.Value; }
                    settingsForSave = settings;
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
                if (hideHeader.HasValue) { settingsJson["hideHeader"] = hideHeader.Value; settingsJson["HideHeader"] = hideHeader.Value; }
                form.SettingsJson = settingsJson.ToString(Newtonsoft.Json.Formatting.None);
            }
            catch { }
            form.UpdatedByUserId = _ctx.UserId;
            _formRepo.SaveForm(form);
            return Ok(new { formId, saved = true });
        }

        [HttpPost("Form/Delete")]
        [Authorize]
        public IActionResult DeleteForm([FromQuery] int? formId, [FromBody] JObject body = null)
        {
            // Accept formId from query string (aspcore adapter) OR request body (legacy)
            int id = formId ?? body?.Value<int>("formId") ?? 0;
            if (id == 0) return BadRequest(new { error = "formId required" });
            _formRepo.DeleteForm(id);
            return Ok(new { success = true });
        }

        // ── FORM LOCK (server-side, cross-device) ─────────────────
        // Locked form IDs are stored in App_Data/MegaForm/locked-forms.json
        // so they persist across all browsers/devices/sessions.

        private string LockedFormsPath =>
            Path.Combine(_env.ContentRootPath, "App_Data", "MegaForm", "locked-forms.json");

        private HashSet<int> ReadLockedIds()
        {
            try
            {
                if (!System.IO.File.Exists(LockedFormsPath)) return new HashSet<int>();
                var json = System.IO.File.ReadAllText(LockedFormsPath);
                var arr = JsonConvert.DeserializeObject<List<int>>(json) ?? new List<int>();
                return new HashSet<int>(arr);
            }
            catch { return new HashSet<int>(); }
        }

        private void WriteLockedIds(HashSet<int> ids)
        {
            try
            {
                var dir = Path.GetDirectoryName(LockedFormsPath);
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                System.IO.File.WriteAllText(LockedFormsPath,
                    JsonConvert.SerializeObject(ids.OrderBy(x => x).ToList()));
            }
            catch { }
        }

        [HttpGet("Form/LockedIds")]
        [Authorize]
        public IActionResult GetLockedIds()
        {
            var ids = ReadLockedIds();
            return Ok(new { lockedIds = ids.OrderBy(x => x).ToList() });
        }

        [HttpPost("Form/Lock")]
        [Authorize]
        public IActionResult LockForm([FromBody] JObject body)
        {
            int id = body?.Value<int>("formId") ?? 0;
            if (id == 0) return BadRequest(new { error = "formId required" });
            var ids = ReadLockedIds();
            ids.Add(id);
            WriteLockedIds(ids);
            return Ok(new { success = true, lockedIds = ids.OrderBy(x => x).ToList() });
        }

        [HttpPost("Form/Unlock")]
        [Authorize]
        public IActionResult UnlockForm([FromBody] JObject body)
        {
            int id = body?.Value<int>("formId") ?? 0;
            if (id == 0) return BadRequest(new { error = "formId required" });
            var ids = ReadLockedIds();
            ids.Remove(id);
            WriteLockedIds(ids);
            return Ok(new { success = true, lockedIds = ids.OrderBy(x => x).ToList() });
        }

        /// <summary>
        /// POST api/MegaForm/Form/EvaluateRules
        /// Body: { rulesJson: "[...]", formData: { fieldKey: value, ... } }
        /// Evaluates rules server-side — same logic as megaform-rule-engine.js.
        /// Returns list of EvaluationEffect objects.
        /// </summary>
        [HttpPost("Form/EvaluateRules")]
        [AllowAnonymous]
        public IActionResult EvaluateRules([FromBody] JObject body)
        {
            try
            {
                var rulesJson = body.Value<string>("rulesJson") ?? "[]";
                var formDataToken = body["formData"] as JObject;

                // Build formData dictionary
                var formData = new Dictionary<string, object>();
                if (formDataToken != null)
                {
                    foreach (var prop in formDataToken.Properties())
                    {
                        formData[prop.Name] = prop.Value is JValue jv ? jv.Value : (object)prop.Value;
                    }
                }

                // Deserialize rules with polymorphic ConditionNode converter
                var settings = new JsonSerializerSettings();
                settings.Converters.Add(new ConditionNodeConverter());
                var rules = JsonConvert.DeserializeObject<List<RuleDefinition>>(rulesJson, settings)
                            ?? new List<RuleDefinition>();

                var effects = RuleEvaluator.EvaluateRules(rules, formData);
                return Ok(effects);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Form/Duplicate")]
        [Authorize]
        public IActionResult DuplicateForm([FromQuery] int? formId, [FromBody] JObject body = null)
        {
            // Accept formId from query string (aspcore adapter) OR request body (legacy)
            int id = formId ?? body?.Value<int>("formId") ?? 0;
            if (id == 0) return BadRequest(new { error = "formId required" });
            int newId = _formRepo.DuplicateForm(id, _ctx.UserId);
            return Ok(new { formId = newId });
        }

        [HttpGet("Form/Stats")]
        [Authorize]
        public IActionResult Stats(int formId) => Ok(_formRepo.GetFormStats(formId));

        [HttpGet("BuilderTemplates/List")]
        [Authorize]
        public IActionResult ListBuilderTemplates()
        {
            return Ok(_templateCatalog.List());
        }

        [HttpPost("BuilderTemplates/UploadJson")]
        [Authorize]
        [RequestSizeLimit(10 * 1024 * 1024)]
        [Consumes("multipart/form-data")]
        public IActionResult UploadBuilderTemplateJson([FromForm] UploadBuilderTemplateRequest req)
        {
            try
            {
                req ??= new UploadBuilderTemplateRequest();
                if (req.File == null && string.IsNullOrWhiteSpace(req.TemplateJson))
                    return BadRequest(new { error = "Template file or JSON payload is required" });

                var originalName = req.File?.FileName ?? "uploaded-template.json";
                using (var stream = req.File?.OpenReadStream())
                {
                    var result = _templateCatalog.SaveUploadedTemplate(originalName, stream, req.TemplateJson);
                    if (!result.Success && result.ImportedTemplateCount <= 0)
                    {
                        return BadRequest(new { error = result.Message, warnings = result.Warnings, skippedTemplateCount = result.SkippedTemplateCount });
                    }
                    return Ok(result);
                }
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        public class UploadBuilderTemplateRequest
        {
            public IFormFile File { get; set; }
            public string TemplateJson { get; set; }
        }

        [HttpPost("BuilderTemplates/DevBulkCreateForms")]
        [Authorize]
        public IActionResult DevBulkCreateForms([FromBody] JObject body = null)
        {
            try
            {
                if (!HasDevLock())
                    return StatusCode(StatusCodes.Status403Forbidden, new { error = "dev.lock is required" });

                int moduleId = body?.Value<int?>("moduleId") ?? 0;
                int portalId = _ctx?.PortalId ?? 0;
                int userId = _ctx?.UserId ?? 0;
                var templates = _templateCatalog.List() ?? Array.Empty<BuilderTemplateCatalogService.BuilderTemplateRecord>();
                var existingForms = _formRepo.ListForms(portalId, pageSize: 0) ?? new List<FormInfo>();

                int created = 0;
                int updated = 0;
                var formIds = new List<int>();
                var items = new List<object>();

                foreach (var template in templates)
                {
                    var sourceFile = string.IsNullOrWhiteSpace(template?.FileName)
                        ? ((template?.Slug ?? "template") + ".json")
                        : template.FileName;

                    var form = FindExistingDevBulkForm(existingForms, sourceFile) ?? new FormInfo();
                    bool isNew = form.FormId == 0;

                    ApplyDevBulkTemplateToForm(form, template, sourceFile, moduleId, portalId, userId);
                    int formId = _formRepo.SaveForm(form);

                    if (isNew)
                    {
                        created++;
                        existingForms.Add(form);
                    }
                    else
                    {
                        updated++;
                    }

                    formIds.Add(formId);
                    items.Add(new
                    {
                        formId = formId,
                        sourceFile = sourceFile,
                        title = form.Title,
                        status = isNew ? "created" : "updated"
                    });
                }

                return Ok(new
                {
                    success = true,
                    marker = "Dev bulk publish seed v20260402-05",
                    totalTemplates = templates.Count,
                    created,
                    updated,
                    formIds = formIds.Distinct().ToArray(),
                    items
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        private bool HasDevLock()
        {
            try
            {
                var webRoot = _env?.WebRootPath ?? string.Empty;
                var contentRoot = _env?.ContentRootPath ?? string.Empty;
                var candidates = new[]
                {
                    string.IsNullOrWhiteSpace(webRoot) ? null : Path.Combine(webRoot, "dev.lock"),
                    string.IsNullOrWhiteSpace(contentRoot) ? null : Path.Combine(contentRoot, "dev.lock")
                };
                return candidates.Any(path => !string.IsNullOrWhiteSpace(path) && System.IO.File.Exists(path));
            }
            catch
            {
                return false;
            }
        }
        private bool HasDemoLock()
        {
            try
            {
                var webRoot = _env?.WebRootPath ?? string.Empty;
                if (string.IsNullOrWhiteSpace(webRoot)) return false;
                return System.IO.File.Exists(Path.Combine(webRoot, "demo.lock"));
            }
            catch
            {
                return false;
            }
        }

        private IActionResult DemoLockedResponse(string area)
        {
            return StatusCode(StatusCodes.Status423Locked, new
            {
                success = false,
                error = $"{area} is disabled while demo.lock is present.",
                locked = true,
                marker = "DemoLockGuard v20260404-07"
            });
        }

        private static FormInfo FindExistingDevBulkForm(IEnumerable<FormInfo> forms, string sourceFile)
        {
            foreach (var form in forms ?? Enumerable.Empty<FormInfo>())
            {
                if (form == null) continue;

                try
                {
                    if (!string.IsNullOrWhiteSpace(form.SettingsJson))
                    {
                        var settings = JObject.Parse(form.SettingsJson);
                        var seed = settings["devBulkSeed"] as JObject;
                        var existingSource = (string)seed?["sourceFile"];
                        if (!string.IsNullOrWhiteSpace(existingSource) && string.Equals(existingSource, sourceFile, StringComparison.OrdinalIgnoreCase))
                            return form;
                    }
                }
                catch
                {
                }

                if (string.Equals(form.Title, sourceFile, StringComparison.OrdinalIgnoreCase))
                    return form;
            }

            return null;
        }

        private static void ApplyDevBulkTemplateToForm(FormInfo form, BuilderTemplateCatalogService.BuilderTemplateRecord template, string sourceFile, int moduleId, int portalId, int userId)
        {
            if (form == null) return;
            template = template ?? new BuilderTemplateCatalogService.BuilderTemplateRecord();

            var settings = template.Settings != null ? new JObject(template.Settings) : new JObject();
            settings["submitButtonText"] = template.SubmitButtonText ?? "Submit";
            settings["successMessage"] = template.SuccessMessage ?? string.Empty;
            settings["customHtml"] = template.CustomHtml ?? string.Empty;
            settings["customCss"] = template.CustomCss ?? string.Empty;
            settings["rules"] = template.Rules != null ? template.Rules.DeepClone() : new JArray();
            settings["workflowTemplate"] = template.Workflow != null ? template.Workflow.DeepClone() : null;
            settings["devBulkSeed"] = new JObject
            {
                ["sourceFile"] = sourceFile,
                ["templateId"] = template.Id ?? string.Empty,
                ["templateSlug"] = template.Slug ?? string.Empty,
                ["locked"] = false,
                ["createdBy"] = "Dev bulk publish seed v20260402-05",
                ["updatedUtc"] = DateTime.UtcNow.ToString("O")
            };

            var schema = new JObject
            {
                ["version"] = "1.0",
                ["fields"] = template.Fields != null ? new JArray(template.Fields.Select(f => f.DeepClone())) : new JArray(),
                ["settings"] = new JObject(settings)
            };

            form.ModuleId = moduleId;
            form.PortalId = portalId;
            form.Title = sourceFile;
            form.Description = string.IsNullOrWhiteSpace(template.Description) ? ("DEV bulk form seeded from " + sourceFile) : template.Description;
            form.SchemaJson = schema.ToString(Formatting.None);
            form.SettingsJson = settings.ToString(Formatting.None);
            form.ThemeJson = string.IsNullOrWhiteSpace(form.ThemeJson) ? "{}" : form.ThemeJson;
            form.Status = "Published";
            form.SubmitButtonText = template.SubmitButtonText ?? "Submit";
            form.SuccessMessage = template.SuccessMessage ?? string.Empty;
            form.RulesJson = template.Rules != null ? template.Rules.ToString(Formatting.None) : "[]";
            form.WorkflowJson = template.Workflow != null ? template.Workflow.ToString(Formatting.None) : string.Empty;
            form.CreatedByUserId = form.CreatedByUserId > 0 ? form.CreatedByUserId : userId;
            form.UpdatedByUserId = userId;
        }

        // ── PUBLIC SUBMIT ─────────────────────────────────────

        /// <summary>
        /// Removes fields the caller may not see before a schema leaves the server.
        /// [AllowAnonymous-reachable] — resolves the actor itself rather than trusting the request, and
        /// projects as anonymous when it cannot, which withholds more rather than less. Mirrors the
        /// Oqtane and DNN twins; keep the three in step.
        /// </summary>
        private string ProjectSchemaForCurrentActor(int formId, string schemaJson)
        {
            if (string.IsNullOrWhiteSpace(schemaJson)) return schemaJson;

            UserContext actor;
            try { actor = GetCurrentUserContext(); }
            catch { actor = new UserContext(); }

            var permissions = SafeGetFormPermissions(formId);
            var query = Request?.Query != null
                ? Request.Query.ToDictionary(kvp => kvp.Key, kvp => kvp.Value.ToString(), StringComparer.OrdinalIgnoreCase)
                : null;
            return MegaForm.Core.Services.FormAccessProjection
                .ProjectForActor(formId, schemaJson, actor, permissions, query).SchemaJson;
        }

        /// <summary>
        /// Strips server-only settings (databaseInsert / lifecycle SQL) from the SettingsJson shipped
        /// alongside the schema — that blob bypasses the schema projection and otherwise leaks the INSERT
        /// statement + connection alias to anonymous callers. Same manage gate as the schema. Mirrors the
        /// Oqtane and DNN twins; keep the three in step.
        /// </summary>
        private string ProjectSettingsForCurrentActor(int formId, string settingsJson)
        {
            if (string.IsNullOrWhiteSpace(settingsJson)) return settingsJson;

            UserContext actor;
            try { actor = GetCurrentUserContext(); }
            catch { actor = new UserContext(); }

            var permissions = SafeGetFormPermissions(formId);
            var query = Request?.Query != null
                ? Request.Query.ToDictionary(kvp => kvp.Key, kvp => kvp.Value.ToString(), StringComparer.OrdinalIgnoreCase)
                : null;
            return MegaForm.Core.Services.FormAccessProjection
                .ProjectSettingsForActor(formId, settingsJson, actor, permissions, query);
        }

        private List<FormPermissionInfo> SafeGetFormPermissions(int formId)
        {
            try { return (_phase2Repo.GetFormPermissions(formId) ?? Enumerable.Empty<FormPermissionInfo>()).ToList(); }
            catch { return new List<FormPermissionInfo>(); }
        }

        [HttpGet("Submit/Schema")]
        [AllowAnonymous]
        public IActionResult Schema(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null || !string.Equals(form.Status, "Published", StringComparison.OrdinalIgnoreCase)) return NotFound();
            var resolvedRenderModel = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson, form.SubmitButtonText, form.SuccessMessage, form.RedirectUrl);
            var selectedPresetThemeKey = GetSelectedThemePresetKey(form.ModuleId);
            var visibleSchemaJson = ProjectSchemaForCurrentActor(form.FormId, resolvedRenderModel.SchemaJson);
            // Strip the client-facing settings too; the CSS build stays on raw settings (server-side).
            var visibleSettingsJson = ProjectSettingsForCurrentActor(form.FormId, resolvedRenderModel.SettingsJson);
            return Ok(new
            {
                formId           = form.FormId,
                title            = form.Title,
                description      = form.Description,
                schema           = visibleSchemaJson,
                submitButtonText = resolvedRenderModel.SubmitButtonText,
                enableCaptcha    = form.EnableCaptcha,
                enableSaveResume = form.EnableSaveResume,
                theme            = form.ThemeJson,
                themeJson        = form.ThemeJson,
                settingsJson     = visibleSettingsJson,
                initialInlineCss = ThemePresetInlineCssService.Build(resolvedRenderModel.SettingsJson, selectedPresetThemeKey, "#mf-form-wrapper-" + form.FormId),
                requireAuth      = form.RequireAuth,
            });
        }

        [HttpPost("Submit/Post")]
        [AllowAnonymous]
        public async Task<IActionResult> Submit([FromBody] JObject body)
        {
            int formId = body.Value<int>("formId");
            double time = body.Value<double?>("submissionTime") ?? 0;
            var data = body["data"]?.ToObject<Dictionary<string, object>>();
            if (formId <= 0 || data == null)
                return BadRequest(new { error = "formId and data required" });

            string ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            string ua = Request.Headers["User-Agent"].ToString();

            var form = _formRepo.GetForm(formId);
            if (form == null)
                return NotFound(new { success = false, error = "Form not found." });

            var captchaCheck = await VerifyCaptchaSubmissionAsync(form, data, ip);
            if (!captchaCheck.Success)
                return Ok(new { success = false, error = captchaCheck.ErrorMessage, validationErrors = captchaCheck.ValidationErrors });

            // Pass the real actor so submit-time enforcement evaluates role/permission rules against this
            // visitor's roles. Without it EnforceSubmit sees empty roles and strips role-gated fields for
            // everyone, including the roles that are allowed to submit them.
            UserContext actor = null;
            try { actor = GetCurrentUserContext(); } catch { actor = null; }
            var query = Request?.Query != null
                ? Request.Query.ToDictionary(kvp => kvp.Key, kvp => kvp.Value.ToString(), StringComparer.OrdinalIgnoreCase)
                : null;
            int? actorUserId = actor != null && actor.UserId > 0 ? actor.UserId : (int?)null;

            var result = await _processor.ProcessAsync(formId, data, ip, ua, actorUserId, time, actor, query);
            if (result.Success)
                return Ok(new { success = true, submissionId = result.SubmissionId, successMessage = result.SuccessMessage, message = result.SuccessMessage, redirectUrl = result.RedirectUrl });
            return Ok(new { success = false, error = result.ErrorMessage, validationErrors = result.ValidationErrors });
        }

        // ── SUBMISSIONS ───────────────────────────────────────

        [HttpGet("Submissions/List")]
        [Authorize]
        public IActionResult ListSubmissions(int formId = 0, string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null, int pageIndex = 0, int page = -1, int pageSize = 50)
        {
            if (page >= 0 && pageIndex == 0) pageIndex = page;
            // [WebRLS v20260712] Plain [Authorize] let ANY logged-in user list every
            // submission. Gate mirrors Oqtane: admin, or explicit view/manage rules.
            var actor = GetSubmissionActorWithRoles();
            var permissions = new PermissionService(_phase2Repo);
            if (formId > 0)
            {
                if (!CanUseSubmissionManagement(formId, actor, permissions))
                    return StatusCode(403, new { error = "You do not have permission to view submissions for this form." });
            }
            else if (!IsSubmissionAdmin(actor))
            {
                return StatusCode(403, new { error = "You do not have permission to view submissions." });
            }
            var result = _submissionQueries.List(new SubmissionListQuery
            {
                FormId = formId,
                Status = status,
                Search = search,
                DateFrom = dateFrom,
                DateTo = dateTo,
                PageIndex = pageIndex,
                PageSize = pageSize
            });

            if (formId <= 0 && result.Items != null && result.Items.Count > 0)
            {
                var titles = (_formRepo.ListForms(_ctx.PortalId, pageSize: 2000) ?? new System.Collections.Generic.List<FormInfo>())
                    .ToDictionary(f => f.FormId, f => f.Title ?? string.Empty);

                foreach (var item in result.Items)
                {
                    if (item != null && string.IsNullOrWhiteSpace(item.FormTitle) && titles.TryGetValue(item.FormId, out var title))
                        item.FormTitle = title;
                }
            }

            return Ok(new { items = result.Items, totalCount = result.TotalCount, pageIndex = result.PageIndex, pageSize = result.PageSize });
        }

        [HttpGet("Submissions/Get")]
        [Authorize]
        public IActionResult GetSubmission(int submissionId)
        {
            // [WebRLS v20260712] Row-level gate (admin -> task holder -> explicit
            // permission rules). The row is resolved server-side by id — the gate
            // never trusts anything from the request beyond the id itself.
            var actorRls = GetSubmissionActorWithRoles();
            var permissionsRls = new PermissionService(_phase2Repo);
            var rowRls = _subRepo.Get(submissionId);
            if (rowRls == null) return NotFound();
            if (!CanViewSubmissionRow(rowRls.FormId, rowRls, actorRls, permissionsRls))
                return StatusCode(403, new { error = "You do not have permission to view this submission." });

            var detail = _submissionQueries.GetDetail(submissionId);
            if (detail == null) return NotFound();

            detail.WorkflowDetail = _submissionWorkflowDetails.GetDetail(detail);
            return Ok(new
            {
                submission = detail.Submission,
                form = detail.Form,
                schema = detail.Schema,
                files = detail.Files,
                values = detail.FlattenedValues,
                fieldSnapshots = detail.FieldSnapshots,
                hasSnapshot = detail.HasSnapshot,
                workflowDetail = detail.WorkflowDetail
            });
        }

        [HttpPost("Submissions/UpdateStatus")]
        [Authorize]
        public IActionResult UpdateSubmissionStatus([FromBody] JObject body)
        {
            int id    = body.Value<int>("submissionId");
            string st = body.Value<string>("status");
            // [WebRLS v20260712] formId comes from the ROW, not the request.
            var row = _subRepo.Get(id);
            if (row == null) return NotFound();
            if (!CanMutateSubmissions(row.FormId, GetSubmissionActorWithRoles(), new PermissionService(_phase2Repo)))
                return StatusCode(403, new { error = "You do not have permission to modify this submission." });
            _subRepo.UpdateStatus(id, st);
            return Ok(new { success = true });
        }

        [HttpPost("Submissions/UpdateData")]
        [Authorize]
        public IActionResult UpdateSubmissionData(int submissionId, [FromBody] JObject body)
        {
            if (submissionId <= 0) return BadRequest(new { error = "submissionId required" });
            var row = _subRepo.Get(submissionId);
            if (row == null) return NotFound();
            if (!CanMutateSubmissions(row.FormId, GetSubmissionActorWithRoles(), new PermissionService(_phase2Repo)))
                return StatusCode(403, new { error = "You do not have permission to modify this submission." });
            _subRepo.UpdateData(submissionId, body != null ? body.ToString() : "{}");
            return Ok(new { success = true });
        }

        [HttpPost("Submissions/Delete")]
        [Authorize]
        public IActionResult DeleteSubmission([FromBody] JObject body)
        {
            int id = body.Value<int>("submissionId");
            var row = _subRepo.Get(id);
            if (row == null) return NotFound();
            if (!CanMutateSubmissions(row.FormId, GetSubmissionActorWithRoles(), new PermissionService(_phase2Repo), delete: true))
                return StatusCode(403, new { error = "You do not have permission to delete this submission." });
            _subRepo.Delete(id);
            return Ok(new { success = true });
        }

        [HttpPost("Submissions/BulkDelete")]
        [Authorize]
        public IActionResult BulkDelete([FromBody] JObject body)
        {
            int formId  = body.Value<int>("formId");
            var ids     = body["ids"]?.ToObject<int[]>() ?? Array.Empty<int>();
            if (!CanMutateSubmissions(formId, GetSubmissionActorWithRoles(), new PermissionService(_phase2Repo), delete: true))
                return StatusCode(403, new { error = "You do not have permission to delete submissions for this form." });
            _subRepo.BulkDelete(formId, ids);
            return Ok(new { success = true, deleted = ids.Length });
        }

        // REST-style submission aliases used by the modern admin UI
        [HttpGet("Submissions")]
        [Authorize]
        public IActionResult ListSubmissionsRest(int formId = 0, string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null, int pageIndex = 0, int page = -1, int pageSize = 50)
            => ListSubmissions(formId, status, search, dateFrom, dateTo, pageIndex, page, pageSize);

        [HttpGet("Submissions/{submissionId}")]
        [Authorize]
        public IActionResult GetSubmissionById(int submissionId) => GetSubmission(submissionId);

        // [SubmissionPrint v20260713] Print-ready document for ONE submission (values
        // merged into the form's Print layout). Twin of the Oqtane endpoint; same
        // row-level gate as GetSubmission ([WebRLS v20260712]) — submission data is PII.
        [HttpGet("Submissions/{submissionId}/Print")]
        [Authorize]
        public IActionResult PrintSubmissionById(int submissionId)
        {
            var actor = GetSubmissionActorWithRoles();
            var permissions = new PermissionService(_phase2Repo);
            var row = _subRepo.Get(submissionId);
            if (row == null) return NotFound();
            if (!CanViewSubmissionRow(row.FormId, row, actor, permissions))
                return StatusCode(403, new { error = "You do not have permission to view this submission." });

            var detail = _submissionQueries.GetDetail(submissionId);
            if (detail == null) return NotFound();

            var data = MegaForm.Core.Services.PrintSubmissionData.FromDetail(detail);
            string baseUrl = $"{Request.Scheme}://{Request.Host}";
            string html = new MegaForm.Core.Services.PrintFormRenderer().RenderHtml(detail.Form, detail.Schema, baseUrl, data);

            string title = System.Web.HttpUtility.HtmlEncode(detail.Form?.Title ?? "Submission");
            string toolbar = "<div class=\"mf-print-toolbar\">"
                + $"<span>🖨️ <b style=\"color:#e2e8f0\">{title}</b> · SUB-{detail.Submission.SubmissionId}</span>"
                + "<div style=\"flex:1\"></div>"
                + "<button class=\"mf-print-tb-btn ghost\" onclick=\"window.close()\">✕ Close</button>"
                + "<button class=\"mf-print-tb-btn primary\" onclick=\"window.print()\">🖨️ Print / Save PDF</button>"
                + "</div><div style=\"height:44px\"></div>";
            html = html.Replace("<body>", "<body>" + toolbar);

            return Content(html, "text/html");
        }

        [HttpPost("Submissions/{submissionId}/Status")]
        [Authorize]
        public IActionResult UpdateSubmissionStatusRest(int submissionId, [FromBody] JObject body)
        {
            string st = body?.Value<string>("status") ?? body?.Value<string>("Status");
            var row = _subRepo.Get(submissionId);
            if (row == null) return NotFound();
            if (!CanMutateSubmissions(row.FormId, GetSubmissionActorWithRoles(), new PermissionService(_phase2Repo)))
                return StatusCode(403, new { error = "You do not have permission to modify this submission." });
            _subRepo.UpdateStatus(submissionId, st);
            return Ok(new { success = true });
        }

        [HttpDelete("Submissions/{submissionId}")]
        [Authorize]
        public IActionResult DeleteSubmissionById(int submissionId)
        {
            _subRepo.Delete(submissionId);
            return Ok(new { success = true });
        }

        // ── FIELD OPTIONS / TEST INSERT ───────────────────────

        [HttpGet("Field/Options")]
        [Authorize]
        public IActionResult GetFieldOptions(int formId, string fieldKey)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(fieldKey))
                return BadRequest(new { error = "formId and fieldKey required" });

            var parameters = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            foreach (var kv in Request.Query)
            {
                if (string.IsNullOrEmpty(kv.Key)) continue;
                if (!kv.Key.StartsWith("__p__", StringComparison.OrdinalIgnoreCase)) continue;
                var name = kv.Key.Substring(5);
                if (string.IsNullOrWhiteSpace(name)) continue;
                parameters[name] = kv.Value.ToString();
            }

            var svc = new FieldOptionsService(_connectionRegistry, _formRepo);
            var options = svc.GetOptions(formId, fieldKey, parameters);
            return Ok(options);
        }

        [HttpPost("Field/TestInsert")]
        [Authorize(Roles = "Administrator")]
        public IActionResult TestFieldInsert([FromBody] JObject body)
        {
            if (body == null) return BadRequest(new { error = "body required" });
            try
            {
                var settings = new FormSettings
                {
                    DatabaseInsert = new FormDatabaseInsertSettings
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
                var svc = new FormDatabaseInsertService(_connectionRegistry);
                var result = svc.TestExecute(settings, sample);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return Ok(new FormDatabaseInsertTestResult { Success = false, Error = ex.Message });
            }
        }

        // ── DRAFT ─────────────────────────────────────────────

        [HttpPost("Draft/Save")]
        [AllowAnonymous]
        public IActionResult SaveDraft([FromBody] JObject body)
        {
            int formId      = body.Value<int>("formId");
            string dataJson = body["data"]?.ToString() ?? "{}";
            string token    = body.Value<string>("resumeToken") ?? Guid.NewGuid().ToString("N");

            var draft = _draftRepo.GetDraft(token);
            if (draft == null)
            {
                draft = new SavedDraftInfo
                {
                    FormId      = formId,
                    ResumeToken = token,
                    DataJson    = dataJson,
                    CreatedOnUtc = DateTime.UtcNow,
                    ExpiresOnUtc = DateTime.UtcNow.AddDays(30),
                };
            }
            else
            {
                draft.DataJson = dataJson;
                draft.ExpiresOnUtc = DateTime.UtcNow.AddDays(30);
            }
            _draftRepo.SaveDraft(draft);
            return Ok(new { resumeToken = token });
        }

        [HttpGet("Draft/Get")]
        [AllowAnonymous]
        public IActionResult GetDraft(string resumeToken)
        {
            var draft = _draftRepo.GetDraft(resumeToken);
            if (draft == null || draft.ExpiresOnUtc < DateTime.UtcNow) return NotFound();
            return Ok(new { data = draft.DataJson });
        }

        // ── FILE UPLOAD ───────────────────────────────────────

        [HttpPost("Upload/File")]
        [AllowAnonymous]
        public async Task<IActionResult> UploadFile(IFormFile file, [FromForm] int formId, [FromForm] string fieldKey)
        {
            _ = PdfFormUploadWebBadge;
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "No file provided" });
            if (formId <= 0 || string.IsNullOrWhiteSpace(fieldKey))
                return BadRequest(new { error = "formId and fieldKey are required" });

            var form = _formRepo.GetForm(formId);
            if (form == null || !string.Equals(form.Status, "Published", StringComparison.OrdinalIgnoreCase))
                return NotFound(new { error = "Published form not found" });
            if (form.RequireAuth && !(User?.Identity?.IsAuthenticated ?? false))
                return Unauthorized(new { error = "Authentication required for uploads" });

            FormSchema schema = null;
            try { schema = string.IsNullOrWhiteSpace(form.SchemaJson) ? null : JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson); }
            catch { }
            var fileField = MegaForm.Core.Utilities.MegaFormUtils.FlattenFields(schema?.Fields ?? new List<FormField>())
                .FirstOrDefault(f => f != null
                    && string.Equals(f.Key, fieldKey, StringComparison.OrdinalIgnoreCase)
                    && (string.Equals(f.Type, "File", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(f.Type, "PdfForm", StringComparison.OrdinalIgnoreCase)));
            if (fileField == null)
                return BadRequest(new { error = "Invalid file field" });
            var isPdfFormField = string.Equals(fileField.Type, "PdfForm", StringComparison.OrdinalIgnoreCase);

            var uploadPolicy = GetUploadPolicy();
            var originalName = Path.GetFileName(file.FileName ?? string.Empty);
            var ext = (Path.GetExtension(originalName) ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(ext))
                return BadRequest(new { error = "File type is required" });

            var fieldAllowed = isPdfFormField
                ? ParseExtensions(new[] { ".pdf" })
                : ParseExtensions(fileField.FileSettings?.AllowedExtensions);
            var globalAllowed = ParseExtensions(uploadPolicy.AllowedExtensionsCsv);
            var globalBlocked = ParseExtensions(uploadPolicy.BlockedExtensionsCsv);
            if (globalBlocked.Contains(ext))
                return BadRequest(new { error = "This file type is blocked by system policy" });

            var effectiveAllowed = fieldAllowed.Count > 0
                ? fieldAllowed.Where(x => globalAllowed.Count == 0 || globalAllowed.Contains(x)).ToHashSet(StringComparer.OrdinalIgnoreCase)
                : new HashSet<string>(globalAllowed, StringComparer.OrdinalIgnoreCase);
            if (effectiveAllowed.Count > 0 && !effectiveAllowed.Contains(ext))
                return BadRequest(new { error = "File type not allowed. Accepted: " + string.Join(", ", effectiveAllowed.OrderBy(x => x)) });

            var fieldMaxMb = isPdfFormField
                ? uploadPolicy.MaxSizeMb
                : (fileField.FileSettings?.MaxSizeMB ?? uploadPolicy.MaxSizeMb);
            var maxSizeMb = Math.Max(1, Math.Min(uploadPolicy.MaxSizeMb, fieldMaxMb));
            var maxBytes = (long)maxSizeMb * 1024L * 1024L;
            if (file.Length > maxBytes)
                return BadRequest(new { error = $"File too large (max {maxSizeMb}MB)" });

            var folder = $"form-{formId}/field-{fieldKey}";
            string filePath;
            using (var stream = file.OpenReadStream())
            {
                filePath = await _storage.SaveFileAsync(stream, originalName, folder);
            }

            return Ok(new
            {
                fileId = 0,
                fileName = originalName,
                fileSize = file.Length,
                contentType = file.ContentType ?? "application/octet-stream",
                fileUrl = _storage.GetFileUrl(filePath),
                tempPath = filePath,
                storedIn = "private",
            });
        }

        [HttpGet("Files/Download")]
        [Authorize]
        public IActionResult DownloadFile(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return NotFound();
            var stream = _storage.GetFile(path);
            if (stream == null) return NotFound();
            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(path, out var contentType)) contentType = "application/octet-stream";
            var fileName = Path.GetFileName(path);
            return File(stream, contentType, fileName);
        }

        // ── MODULE CONFIG / STYLE ─────────────────────────────

        [HttpGet("ModuleConfig/Get")]
        [Authorize]
        public IActionResult GetModuleConfig(int moduleId)
        {
            // Thêm system info cho dashboard
            var adminUsername = _moduleSettings.GetSetting(0, "Admin_Username") ?? "Admin";
            var dbProvider    = _cfg["Database:Provider"] ?? "SQLite";
            var environment   = _env.EnvironmentName;

            return Ok(new
            {
                moduleId,
                themeClass       = _moduleSettings.GetSetting(moduleId, "MegaForm_ThemeClass"),
                cssOverride      = _moduleSettings.GetSetting(moduleId, "MegaForm_CssOverride"),
                extraClass       = _moduleSettings.GetSetting(moduleId, "MegaForm_ExtraClass"),
                formId           = _moduleSettings.GetSetting(moduleId, "MegaForm_FormId"),
                selectedPresetThemeKey = _moduleSettings.GetSetting(moduleId, "MegaForm_SelectedThemePresetKey"),
                // Dashboard info
                adminUsername,
                databaseProvider = dbProvider,
                environment,
            });
        }

        /// <summary>
        /// POST api/MegaForm/ModuleConfig/SaveStyle
        /// Cùng endpoint với DNN — JS Live Style Editor gọi không đổi.
        /// </summary>
        [HttpPost("ModuleConfig/SaveStyle")]
        // [SecFix 2026-07-04 P1-2] Was [Authorize] (any authenticated user) → any logged-in user could
        // overwrite MegaForm_CssOverride (persisted + rendered = stored-CSS injection) on ANY moduleId.
        // Gate to Administrator (only role primitive available in this Web host; no module-ownership svc).
        [Authorize(Roles = "Administrator")]
        public IActionResult SaveStyle([FromBody] JObject body)
        {
            int moduleId = body.Value<int>("moduleId");
            int formId   = body.Value<int>("formId");
            if (moduleId <= 0 || formId <= 0)
                return BadRequest(new { error = "moduleId and formId required" });

            string themeClass  = body.Value<string>("themeClass");
            string cssOverride = body.Value<string>("cssOverride");
            string extraClass  = body.Value<string>("extraClass");
            string selectedPresetThemeKey = body.Value<string>("selectedPresetThemeKey");

            if (themeClass  != null) _moduleSettings.SetSetting(moduleId, "MegaForm_ThemeClass",  themeClass);
            if (cssOverride != null) _moduleSettings.SetSetting(moduleId, "MegaForm_CssOverride", cssOverride);
            if (extraClass  != null) _moduleSettings.SetSetting(moduleId, "MegaForm_ExtraClass",  extraClass);
            if (selectedPresetThemeKey != null) _moduleSettings.SetSetting(moduleId, "MegaForm_SelectedThemePresetKey", selectedPresetThemeKey);

            return Ok(new { success = true, selectedPresetThemeKey = selectedPresetThemeKey ?? string.Empty });
        }


        // ══════════════════════════════════════════════════════════════════
        //  DATABASE SETTINGS — Global (moduleId=0), reusable in workflow
        //  GET  /api/MegaForm/ModuleConfig/DatabaseSettings
        //  POST /api/MegaForm/ModuleConfig/DatabaseSettings
        //  POST /api/MegaForm/ModuleConfig/DatabaseSettings/Test
        // ══════════════════════════════════════════════════════════════════

        [HttpGet("ModuleConfig/DatabaseSettings")]
        [Authorize]
        public IActionResult GetDatabaseSettings()
        {
            var provider = _moduleSettings.GetSetting(0, "Database_Provider", "");
            var connectionString = _moduleSettings.GetSetting(0, "Database_ConnectionString", "");
            if (string.IsNullOrWhiteSpace(provider))
                provider = InferDatabaseType(_cfg.GetConnectionString("DefaultConnection") ?? _cfg["ConnectionStrings:DefaultConnection"] ?? string.Empty);
            if (string.IsNullOrWhiteSpace(provider)) provider = "Sqlite";
            if (string.IsNullOrWhiteSpace(connectionString))
                connectionString = _cfg.GetConnectionString("DefaultConnection") ?? _cfg["ConnectionStrings:DefaultConnection"] ?? string.Empty;

            var dashboardAlias = _moduleSettings.GetSetting(0, "Database_ConnectionAlias", "DashboardDatabase");
            return Ok(new {
                provider,
                connectionString,
                dashboardConnectionName = dashboardAlias,
                samples = new {
                    sqlite = _dbMetadata.GetConnectionStringSample("Sqlite"),
                    sqlServer = _dbMetadata.GetConnectionStringSample("SqlServer"),
                    mySql = _dbMetadata.GetConnectionStringSample("MySql"),
                    postgreSql = _dbMetadata.GetConnectionStringSample("PostgreSql")
                }
            });
        }

        [HttpPost("ModuleConfig/DatabaseSettings")]
        [Authorize]
        public IActionResult SaveDatabaseSettings([FromBody] JObject body)
        {
            if (HasDemoLock()) return DemoLockedResponse("Database Settings");
            var provider = body.Value<string>("provider");
            var connectionString = body.Value<string>("connectionString");
            var alias = body.Value<string>("alias");
            if (!string.IsNullOrWhiteSpace(provider)) _moduleSettings.SetSetting(0, "Database_Provider", provider);
            if (connectionString != null) _moduleSettings.SetSetting(0, "Database_ConnectionString", connectionString);
            if (!string.IsNullOrWhiteSpace(alias)) _moduleSettings.SetSetting(0, "Database_ConnectionAlias", alias.Trim());
            return Ok(new { success = true, message = "Database settings saved.", dashboardConnectionName = string.IsNullOrWhiteSpace(alias) ? "DashboardDatabase" : alias.Trim() });
        }

        [HttpPost("ModuleConfig/DatabaseSettings/Test")]
        [Authorize]
        public IActionResult TestDatabaseSettings([FromBody] JObject body)
        {
            if (HasDemoLock()) return DemoLockedResponse("Database Settings");
            var provider = body.Value<string>("provider");
            var connectionString = body.Value<string>("connectionString");
            if (string.IsNullOrWhiteSpace(provider)) return BadRequest(new { error = "Database provider is required." });
            if (string.IsNullOrWhiteSpace(connectionString)) return BadRequest(new { error = "Connection string is required." });
            var result = _dbMetadata.TestConnection(null, provider, connectionString);
            return Ok(new {
                success = result != null && result.Success,
                provider = result == null ? provider : result.Provider,
                databaseName = result == null ? string.Empty : result.DatabaseName,
                serverVersion = result == null ? string.Empty : result.ServerVersion,
                supportsStoredProcedures = result != null && result.SupportsStoredProcedures,
                message = result == null ? "Connection test failed." : result.Message
            });
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
        //  PAYMENT SETTINGS — Global (moduleId=0), shared across all forms
        //  GET  /api/MegaForm/ModuleConfig/PaymentSettings
        //  POST /api/MegaForm/ModuleConfig/PaymentSettings
        // ══════════════════════════════════════════════════════════════════

        [HttpGet("ModuleConfig/PaymentSettings")]
        [Authorize]
        public IActionResult GetPaymentSettings()
        {
            // Mask secret keys — return only first 8 chars + "..." for display
            string Mask(string v) => string.IsNullOrWhiteSpace(v) ? "" : (v.Length > 8 ? v.Substring(0, 8) + "…" : "****");
            var sk  = _moduleSettings.GetSetting(0, "Payment_Stripe_SecretKey");
            var ppC = _moduleSettings.GetSetting(0, "Payment_PayPal_ClientId");
            var ppS = _moduleSettings.GetSetting(0, "Payment_PayPal_ClientSecret");
            return Ok(new {
                stripeEnabled          = _moduleSettings.GetSetting(0, "Payment_Stripe_Enabled") == "1",
                stripePublishableKey   = _moduleSettings.GetSetting(0, "Payment_Stripe_PublishableKey"),
                stripeSecretKeyMasked  = Mask(sk),
                stripeSecretKeySaved   = !string.IsNullOrWhiteSpace(sk),
                paypalEnabled          = _moduleSettings.GetSetting(0, "Payment_PayPal_Enabled") == "1",
                paypalMode             = _moduleSettings.GetSetting(0, "Payment_PayPal_Mode", "sandbox"),
                paypalClientId         = ppC,
                paypalClientSecretMasked = Mask(ppS),
                paypalClientSecretSaved  = !string.IsNullOrWhiteSpace(ppS),
            });
        }

        [HttpPost("ModuleConfig/PaymentSettings")]
        [Authorize]
        public IActionResult SavePaymentSettings([FromBody] JObject body)
        {
            if (HasDemoLock()) return DemoLockedResponse("Payment Settings");
            void SaveIfSet(string key, string jsonKey)
            {
                var v = body.Value<string>(jsonKey);
                if (v != null) _moduleSettings.SetSetting(0, key, v);
            }
            void SaveBool(string key, string jsonKey)
            {
                var v = body[jsonKey];
                if (v != null) _moduleSettings.SetSetting(0, key, v.Value<bool>() ? "1" : "0");
            }

            SaveBool("Payment_Stripe_Enabled",        "stripeEnabled");
            SaveIfSet("Payment_Stripe_PublishableKey","stripePublishableKey");
            // Only save secret key if not a masked value
            var sk = body.Value<string>("stripeSecretKey");
            if (!string.IsNullOrWhiteSpace(sk) && !sk.Contains("…"))
                _moduleSettings.SetSetting(0, "Payment_Stripe_SecretKey", sk);

            SaveBool("Payment_PayPal_Enabled",        "paypalEnabled");
            SaveIfSet("Payment_PayPal_Mode",          "paypalMode");
            SaveIfSet("Payment_PayPal_ClientId",      "paypalClientId");
            var ppS = body.Value<string>("paypalClientSecret");
            if (!string.IsNullOrWhiteSpace(ppS) && !ppS.Contains("…"))
                _moduleSettings.SetSetting(0, "Payment_PayPal_ClientSecret", ppS);

            return Ok(new { success = true, message = "Payment settings saved." });
        }

        [HttpGet("ModuleConfig/CaptchaSettings")]
        [Authorize]
        public IActionResult GetCaptchaSettings()
        {
            string Mask(string v) => string.IsNullOrWhiteSpace(v) ? "" : (v.Length > 8 ? v.Substring(0, 8) + "…" : "****");
            var rcSecret = _moduleSettings.GetSetting(0, "Captcha_ReCaptcha_SecretKey", _cfg["Captcha:ReCaptcha:SecretKey"] ?? "");
            var hcSecret = _moduleSettings.GetSetting(0, "Captcha_HCaptcha_SecretKey", _cfg["Captcha:HCaptcha:SecretKey"] ?? "");
            return Ok(new {
                badgeVersion = "CaptchaSettingsFix v20260404-04",
                reCaptchaSiteKey = _moduleSettings.GetSetting(0, "Captcha_ReCaptcha_SiteKey", _cfg["Captcha:ReCaptcha:SiteKey"] ?? ""),
                reCaptchaSecretKeyMasked = Mask(rcSecret),
                reCaptchaSecretKeySaved = !string.IsNullOrWhiteSpace(rcSecret),
                hCaptchaSiteKey = _moduleSettings.GetSetting(0, "Captcha_HCaptcha_SiteKey", _cfg["Captcha:HCaptcha:SiteKey"] ?? ""),
                hCaptchaSecretKeyMasked = Mask(hcSecret),
                hCaptchaSecretKeySaved = !string.IsNullOrWhiteSpace(hcSecret)
            });
        }

        [HttpPost("ModuleConfig/CaptchaSettings")]
        [Authorize]
        public IActionResult SaveCaptchaSettings([FromBody] JObject body)
        {
            if (HasDemoLock()) return DemoLockedResponse("Captcha Settings");
            void SaveIfSet(string key, string jsonKey)
            {
                var v = body.Value<string>(jsonKey);
                if (v != null) _moduleSettings.SetSetting(0, key, v.Trim());
            }

            SaveIfSet("Captcha_ReCaptcha_SiteKey", "reCaptchaSiteKey");
            SaveIfSet("Captcha_HCaptcha_SiteKey", "hCaptchaSiteKey");

            var rcSecret = body.Value<string>("reCaptchaSecretKey");
            if (!string.IsNullOrWhiteSpace(rcSecret) && !rcSecret.Contains("…"))
                _moduleSettings.SetSetting(0, "Captcha_ReCaptcha_SecretKey", rcSecret.Trim());

            var hcSecret = body.Value<string>("hCaptchaSecretKey");
            if (!string.IsNullOrWhiteSpace(hcSecret) && !hcSecret.Contains("…"))
                _moduleSettings.SetSetting(0, "Captcha_HCaptcha_SecretKey", hcSecret.Trim());

            return Ok(new { success = true, message = "Captcha settings saved.", badgeVersion = "CaptchaSettingsFix v20260404-04" });
        }

        [HttpGet("ModuleConfig/EmailSettings")]
        [Authorize]
        public IActionResult GetEmailSettings()
        {
            string provider = _moduleSettings.GetSetting(0, "Email_Provider", _cfg["Email:Provider"] ?? "generic");
            string host = _moduleSettings.GetSetting(0, "Email_Host", _cfg["Email:Host"] ?? "localhost");
            string port = _moduleSettings.GetSetting(0, "Email_Port", _cfg["Email:Port"] ?? "25");
            string from = _moduleSettings.GetSetting(0, "Email_From", _cfg["Email:From"] ?? "noreply@megaform.local");
            string fromName = _moduleSettings.GetSetting(0, "Email_FromName", _cfg["Email:FromName"] ?? "MegaForm");
            string user = _moduleSettings.GetSetting(0, "Email_User", _cfg["Email:Username"] ?? _cfg["Email:User"] ?? "");
            string pass = _moduleSettings.GetSetting(0, "Email_Password", _cfg["Email:Password"] ?? "");
            string ssl  = _moduleSettings.GetSetting(0, "Email_EnableSsl", _cfg["Email:EnableSsl"] ?? "0");
            string replyTo = _moduleSettings.GetSetting(0, "Email_ReplyTo", _cfg["Email:ReplyTo"] ?? "");
            string timeoutMs = _moduleSettings.GetSetting(0, "Email_TimeoutMs", _cfg["Email:TimeoutMs"] ?? "20000");
            return Ok(new {
                provider,
                host,
                port,
                from,
                fromName,
                username = user,
                replyTo,
                timeoutMs,
                passwordSaved = !string.IsNullOrWhiteSpace(pass),
                enableSsl = ssl == "1" || ssl.Equals("true", StringComparison.OrdinalIgnoreCase)
            });
        }

        [HttpPost("ModuleConfig/EmailSettings")]
        [Authorize]
        public IActionResult SaveEmailSettings([FromBody] JObject body)
        {
            if (HasDemoLock()) return DemoLockedResponse("Email Settings");
            void SaveIfSet(string key, string jsonKey)
            {
                var v = body.Value<string>(jsonKey);
                if (v != null) _moduleSettings.SetSetting(0, key, v);
            }

            SaveIfSet("Email_Provider", "provider");
            SaveIfSet("Email_Host", "host");
            SaveIfSet("Email_Port", "port");
            SaveIfSet("Email_From", "from");
            SaveIfSet("Email_FromName", "fromName");
            SaveIfSet("Email_User", "username");
            SaveIfSet("Email_ReplyTo", "replyTo");
            SaveIfSet("Email_TimeoutMs", "timeoutMs");
            var pw = body.Value<string>("password");
            if (pw != null && !string.IsNullOrWhiteSpace(pw) && !pw.Contains("•"))
                _moduleSettings.SetSetting(0, "Email_Password", pw);
            if (body["enableSsl"] != null)
                _moduleSettings.SetSetting(0, "Email_EnableSsl", body.Value<bool>("enableSsl") ? "1" : "0");

            return Ok(new { success = true, message = "Email settings saved." });
        }

        [HttpPost("ModuleConfig/EmailSettings/Test")]
        [Authorize]
        public IActionResult TestEmailSettings([FromBody] JObject body, [FromServices] SmtpEmailSender emailSender)
        {
            if (HasDemoLock()) return DemoLockedResponse("Email Settings");
            var to = body.Value<string>("to");
            if (string.IsNullOrWhiteSpace(to)) return BadRequest(new { error = "Recipient email required" });

            var options = new SmtpEmailOptions
            {
                Host = body.Value<string>("host") ?? _moduleSettings.GetSetting(0, "Email_Host", _cfg["Email:Host"] ?? "localhost"),
                Port = int.TryParse(body.Value<string>("port"), out var port) ? port : int.TryParse(_moduleSettings.GetSetting(0, "Email_Port", _cfg["Email:Port"] ?? "25"), out var savedPort) ? savedPort : 25,
                FromEmail = body.Value<string>("from") ?? _moduleSettings.GetSetting(0, "Email_From", _cfg["Email:From"] ?? "noreply@megaform.local"),
                FromName = body.Value<string>("fromName") ?? _moduleSettings.GetSetting(0, "Email_FromName", _cfg["Email:FromName"] ?? "MegaForm"),
                Username = body.Value<string>("username") ?? _moduleSettings.GetSetting(0, "Email_User", _cfg["Email:Username"] ?? _cfg["Email:User"] ?? ""),
                Password = !string.IsNullOrWhiteSpace(body.Value<string>("password")) && !(body.Value<string>("password") ?? string.Empty).Contains("•")
                    ? body.Value<string>("password")
                    : _moduleSettings.GetSetting(0, "Email_Password", _cfg["Email:Password"] ?? ""),
                ReplyTo = body.Value<string>("replyTo") ?? _moduleSettings.GetSetting(0, "Email_ReplyTo", _cfg["Email:ReplyTo"] ?? ""),
                TimeoutMs = int.TryParse(body.Value<string>("timeoutMs"), out var timeoutMs) ? timeoutMs : int.TryParse(_moduleSettings.GetSetting(0, "Email_TimeoutMs", _cfg["Email:TimeoutMs"] ?? "20000"), out var savedTimeout) ? savedTimeout : 20000,
                EnableSsl = body["enableSsl"] != null ? body.Value<bool>("enableSsl") : ((_moduleSettings.GetSetting(0, "Email_EnableSsl", _cfg["Email:EnableSsl"] ?? "0") ?? "0") is string s && (s == "1" || s.Equals("true", StringComparison.OrdinalIgnoreCase)))
            };

            emailSender.SendUsingOptions(options, to.Trim(), "MegaForm test email", "<p>MegaForm SMTP test successful.</p><p>If you received this email, your email settings are working.</p>");
            return Ok(new { success = true, message = $"Test email sent using {options.FromEmail}. Check inbox and spam folder.", from = options.FromEmail, fromName = options.FromName });
        }

        private async Task<(bool Success, string ErrorMessage, Dictionary<string, string> ValidationErrors)> VerifyCaptchaSubmissionAsync(FormInfo form, Dictionary<string, object> data, string remoteIp)
        {
            if (form == null || data == null) return (true, null, null);

            FormSchema schema;
            try { schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson ?? "{}"); }
            catch { return (true, null, null); }
            if (schema?.Fields == null || schema.Fields.Count == 0) return (true, null, null);

            foreach (var field in MegaForm.Core.Utilities.MegaFormUtils.FlattenFields(schema.Fields))
            {
                if (field == null || !string.Equals(field.Type, "Captcha", StringComparison.OrdinalIgnoreCase)) continue;
                if (!data.TryGetValue(field.Key, out var rawToken) || rawToken == null) continue;

                var mode = GetWidgetProp(field, "mode", "math").Trim().ToLowerInvariant();
                if (mode != "recaptcha_v2" && mode != "recaptcha_v3" && mode != "hcaptcha") continue;

                var token = rawToken.ToString()?.Trim() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(token))
                    return (false, "Please complete the CAPTCHA verification.", new Dictionary<string, string> { [field.Key] = "Please complete the CAPTCHA verification." });

                if (string.Equals(token, "__captcha_verified__", StringComparison.Ordinal))
                    continue;

                if (mode == "hcaptcha")
                {
                    var secret = ReadModuleOrConfigSetting("Captcha_HCaptcha_SecretKey", "Captcha:HCaptcha:SecretKey");
                    if (string.IsNullOrWhiteSpace(secret))
                        return (false, "hCaptcha secret key is not configured on the server.", new Dictionary<string, string> { [field.Key] = "hCaptcha secret key is not configured on the server." });

                    var verify = await VerifyCaptchaTokenAsync("https://api.hcaptcha.com/siteverify", secret, token, remoteIp);
                    if (!verify.success)
                        return (false, "hCaptcha verification failed. Please try again.", new Dictionary<string, string> { [field.Key] = "hCaptcha verification failed. Please try again." });

                    data[field.Key] = "__captcha_verified__";
                    continue;
                }

                var reSecret = ReadModuleOrConfigSetting("Captcha_ReCaptcha_SecretKey", "Captcha:ReCaptcha:SecretKey");
                if (string.IsNullOrWhiteSpace(reSecret))
                    return (false, "reCAPTCHA secret key is not configured on the server.", new Dictionary<string, string> { [field.Key] = "reCAPTCHA secret key is not configured on the server." });

                var reVerify = await VerifyCaptchaTokenAsync("https://www.google.com/recaptcha/api/siteverify", reSecret, token, remoteIp);
                if (!reVerify.success)
                    return (false, "reCAPTCHA verification failed. Please try again.", new Dictionary<string, string> { [field.Key] = "reCAPTCHA verification failed. Please try again." });

                if (mode == "recaptcha_v3")
                {
                    var expectedAction = GetWidgetProp(field, "rcAction", "submit").Trim();
                    var returnedAction = reVerify.payload?.Value<string>("action") ?? string.Empty;
                    var returnedScore = reVerify.payload?.Value<double?>("score") ?? 0d;
                    var minScore = 0.5d;
                    double parsedScore;
                    if (double.TryParse(GetWidgetProp(field, "rcMinScore", "0.5"), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out parsedScore))
                        minScore = parsedScore;

                    if (!string.IsNullOrWhiteSpace(expectedAction) && !string.Equals(expectedAction, returnedAction, StringComparison.OrdinalIgnoreCase))
                        return (false, "reCAPTCHA action mismatch. Please try again.", new Dictionary<string, string> { [field.Key] = "reCAPTCHA action mismatch. Please try again." });

                    if (returnedScore < minScore)
                        return (false, "reCAPTCHA score was too low. Please try again.", new Dictionary<string, string> { [field.Key] = "reCAPTCHA score was too low. Please try again." });
                }

                data[field.Key] = "__captcha_verified__";
            }

            return (true, null, null);
        }

        // [PerfFix 2026-07-05 PERF-C2] Single shared client (was `new HttpClient()` per submission →
        // socket/port exhaustion under load) with a hard 10s timeout (was default 100s → a slow captcha
        // endpoint pinned a request thread for up to 100s → thread-pool starvation on the public submit path).
        private static readonly HttpClient _captchaHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

        private async Task<(bool success, JObject payload)> VerifyCaptchaTokenAsync(string url, string secret, string token, string remoteIp)
        {
            try
            {
                using (var content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["secret"] = secret ?? string.Empty,
                    ["response"] = token ?? string.Empty,
                    ["remoteip"] = remoteIp ?? string.Empty
                }))
                {
                    var response = await _captchaHttp.PostAsync(url, content);
                    var json = await response.Content.ReadAsStringAsync();
                    JObject payload = null;
                    try { payload = string.IsNullOrWhiteSpace(json) ? new JObject() : JObject.Parse(json); }
                    catch { payload = new JObject(); }
                    return (response.IsSuccessStatusCode && payload.Value<bool?>("success") == true, payload);
                }
            }
            catch
            {
                return (false, new JObject());
            }
        }

        private string ReadModuleOrConfigSetting(string moduleKey, string configKey)
        {
            var value = _moduleSettings.GetSetting(0, moduleKey, "");
            if (!string.IsNullOrWhiteSpace(value)) return value;
            return _cfg[configKey] ?? string.Empty;
        }

        private static string GetWidgetProp(FormField field, string key, string fallback)
        {
            if (field?.WidgetProps == null || string.IsNullOrWhiteSpace(key)) return fallback ?? string.Empty;
            object value;
            if (field.WidgetProps.TryGetValue(key, out value) && value != null) return value.ToString() ?? (fallback ?? string.Empty);
            var altKey = char.ToUpperInvariant(key[0]) + (key.Length > 1 ? key.Substring(1) : string.Empty);
            if (field.WidgetProps.TryGetValue(altKey, out value) && value != null) return value.ToString() ?? (fallback ?? string.Empty);
            return fallback ?? string.Empty;
        }

        [HttpGet("ModuleConfig/UploadSettings")]
        [Authorize]
        public IActionResult GetUploadSettings()
        {
            var policy = GetUploadPolicy();
            return Ok(new
            {
                maxSizeMb = policy.MaxSizeMb,
                allowedExtensions = policy.AllowedExtensionsCsv,
                blockedExtensions = policy.BlockedExtensionsCsv,
                storageMode = "private",
                notes = new[]
                {
                    "Uploads are stored in App_Data/MegaForm/PrivateUploads, not under public wwwroot.",
                    "Upload requests must target a published form and a real File widget key.",
                    "If the form requires login, uploads require login too."
                }
            });
        }

        [HttpPost("ModuleConfig/UploadSettings")]
        [Authorize]
        public IActionResult SaveUploadSettings([FromBody] JObject body)
        {
            if (HasDemoLock()) return DemoLockedResponse("Upload Settings");
            if (body == null) return BadRequest(new { error = "body required" });
            var maxSizeMb = body.Value<int?>("maxSizeMb") ?? GetUploadPolicy().MaxSizeMb;
            if (maxSizeMb < 1) maxSizeMb = 1;
            if (maxSizeMb > 250) maxSizeMb = 250;
            var allowed = NormalizeExtensionsCsv(body.Value<string>("allowedExtensions"), GetDefaultAllowedExtensionsCsv());
            var blocked = NormalizeExtensionsCsv(body.Value<string>("blockedExtensions"), GetDefaultBlockedExtensionsCsv());
            _moduleSettings.SetSetting(0, "Upload_MaxSizeMB", maxSizeMb.ToString());
            _moduleSettings.SetSetting(0, "Upload_AllowedExtensions", allowed);
            _moduleSettings.SetSetting(0, "Upload_BlockedExtensions", blocked);
            return Ok(new { success = true, message = "Upload settings saved.", storageMode = "private" });
        }

        [HttpPost("ModuleConfig/Save")]
        [Authorize]
        public IActionResult SaveModuleConfig([FromBody] JObject body)
        {
            int moduleId = body.Value<int>("moduleId");
            int formId   = body.Value<int>("formId");
            if (moduleId <= 0) return BadRequest(new { error = "moduleId required" });

            _moduleSettings.SetSetting(moduleId, "MegaForm_FormId",   formId.ToString());
            _moduleSettings.SetSetting(moduleId, "MegaForm_ViewType", body.Value<string>("viewType") ?? "submit");
            return Ok(new { success = true });
        }

        // ── PHASE 2 — Form View Configs ───────────────────────

        /// <summary>GET api/MegaForm/Phase2/GetViewConfigs?formId=X</summary>
        [HttpGet("Phase2/GetViewConfigs")]
        [Authorize]
        public IActionResult GetViewConfigs(int formId)
        {
            var views = _phase2Repo.GetFormViews(formId);
            return Ok(new { views });
        }

        /// <summary>POST api/MegaForm/Phase2/SaveViewConfig — body: FormViewInfo JSON</summary>
        [HttpPost("Phase2/SaveViewConfig")]
        [Authorize]
        public IActionResult SaveViewConfig([FromBody] FormViewInfo view)
        {
            if (view == null) return BadRequest(new { error = "view required" });
            int viewId = _phase2Repo.SaveFormView(view);
            return Ok(new { viewId });
        }

        /// <summary>POST api/MegaForm/Phase2/DeleteViewConfig?viewId=X</summary>
        [HttpPost("Phase2/DeleteViewConfig")]
        [Authorize]
        public IActionResult DeleteViewConfig([FromQuery] int? viewId, [FromBody] JObject body = null)
        {
            int id = viewId ?? body?.Value<int>("viewId") ?? 0;
            if (id == 0) return BadRequest(new { error = "viewId required" });
            _phase2Repo.DeleteFormView(id);
            return Ok(new { success = true });
        }

        [HttpGet("Permissions/Get")]
        [Authorize]
        public IActionResult GetPermissions(int formId)
        {
            if (formId <= 0) return BadRequest(new { error = "formId required" });

            var permissions = PermissionCatalogService.NormalizeRules(formId, _phase2Repo.GetFormPermissions(formId));
            return Ok(new { permissions });
        }

        [HttpGet("Permissions/Catalog")]
        [Authorize]
        public IActionResult GetPermissionsCatalog(int formId)
        {
            // formId <= 0 → SITE-LEVEL catalog (Form Creation Wizard has no formId yet).
            // Principals come from the portal, not the form, so the list is fully populated;
            // only form-specific permission rules are skipped.
            if (formId < 0) formId = 0;

            var permissions = formId > 0
                ? PermissionCatalogService.NormalizeRules(formId, _phase2Repo.GetFormPermissions(formId))
                : new List<FormPermissionInfo>();
            var catalog = _permissionCatalog.GetCatalog(formId, ResolvePortalId(formId), GetCurrentUserContext());
            return Ok(new { permissions, catalog });
        }

        [HttpPost("Permissions/Save")]
        [Authorize]
        public IActionResult SavePermissions([FromBody] JObject body)
        {
            int formId = body?.Value<int>("formId") ?? 0;
            if (formId <= 0) return BadRequest(new { error = "formId required" });

            var permissions = body?["permissions"]?.ToObject<List<FormPermissionInfo>>() ?? new List<FormPermissionInfo>();
            var normalized = PermissionCatalogService.NormalizeRules(formId, permissions);
            _phase2Repo.SaveFormPermissions(formId, normalized);
            return Ok(new { success = true, permissions = normalized });
        }

        // ── MODULE CONFIG — Field Metadata ────────────────────

        /// <summary>GET api/MegaForm/ModuleConfig/Fields?formId=X</summary>
        [HttpGet("ModuleConfig/Fields")]
        [Authorize]
        public IActionResult GetFields(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound(new { error = "form not found" });

            var fields = new List<object>();
            if (!string.IsNullOrWhiteSpace(form.SchemaJson))
            {
                try
                {
                    var schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson);
                    if (schema?.Fields != null)
                    {
                        fields = schema.Fields
                            .Where(f => f.Type != "Hidden" && f.Type != "Section")
                            .Select(f => (object)new { f.Key, f.Label, f.Type })
                            .ToList();
                    }
                }
                catch { /* return empty list on parse error */ }
            }
            return Ok(new { fields });
        }

        // ── SUBMISSIONS — CSV/JSON Export ─────────────────────

        /// <summary>GET api/MegaForm/Submissions/Export?formId=X&amp;format=csv|json</summary>
        [HttpGet("Submissions/Export")]
        [Authorize]
        public IActionResult ExportSubmissions(int formId, string format = "csv")
        {
            // [WebRLS v20260712] Export dumps every row — same gate as the list.
            if (!CanUseSubmissionManagement(formId, GetSubmissionActorWithRoles(), new PermissionService(_phase2Repo)))
                return StatusCode(403, new { error = "You do not have permission to export submissions for this form." });
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound(new { error = "form not found" });

            // Load all submissions (no paging for export)
            var (items, _) = _subRepo.List(formId, pageSize: 10000);

            if (format == "json")
            {
                var jsonData = items.Select(s => new
                {
                    s.SubmissionId,
                    s.SubmittedOnUtc,
                    s.Status,
                    s.IpAddress,
                    data = TryParseJson(s.DataJson),
                }).ToList();
                var json = JsonConvert.SerializeObject(jsonData, Formatting.Indented);
                return File(
                    System.Text.Encoding.UTF8.GetBytes(json),
                    "application/json",
                    $"submissions-form{formId}-{DateTime.UtcNow:yyyyMMdd}.json");
            }

            // Default: CSV
            var sb = new System.Text.StringBuilder();

            // Parse schema to get column headers
            var headers = new List<string> { "SubmissionId", "SubmittedOn", "Status", "IpAddress" };
            var fieldKeys = new List<string>();
            if (!string.IsNullOrWhiteSpace(form.SchemaJson))
            {
                try
                {
                    var schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson);
                    if (schema?.Fields != null)
                    {
                        foreach (var f in schema.Fields.Where(f => f.Type != "Section" && f.Type != "Html"))
                        {
                            fieldKeys.Add(f.Key);
                            headers.Add(string.IsNullOrWhiteSpace(f.Label) ? f.Key : f.Label);
                        }
                    }
                }
                catch { /* use empty fieldKeys */ }
            }

            sb.AppendLine(string.Join(",", headers.Select(CsvEscape)));

            foreach (var sub in items)
            {
                var data = TryParseJObject(sub.DataJson);
                var row = new List<string>
                {
                    sub.SubmissionId.ToString(),
                    sub.SubmittedOnUtc.ToString("yyyy-MM-dd HH:mm:ss"),
                    sub.Status ?? "",
                    sub.IpAddress ?? "",
                };
                foreach (var key in fieldKeys)
                {
                    var val = data?[key]?.ToString() ?? "";
                    row.Add(CsvEscape(val));
                }
                sb.AppendLine(string.Join(",", row));
            }

            return File(
                System.Text.Encoding.UTF8.GetBytes(sb.ToString()),
                "text/csv",
                $"submissions-form{formId}-{DateTime.UtcNow:yyyyMMdd}.csv");
        }

        private (int MaxSizeMb, string AllowedExtensionsCsv, string BlockedExtensionsCsv) GetUploadPolicy()
        {
            var maxSize = 10;
            int.TryParse(_moduleSettings.GetSetting(0, "Upload_MaxSizeMB", "10"), out maxSize);
            if (maxSize <= 0) maxSize = 10;
            return (
                maxSize,
                NormalizeExtensionsCsv(_moduleSettings.GetSetting(0, "Upload_AllowedExtensions", GetDefaultAllowedExtensionsCsv()), GetDefaultAllowedExtensionsCsv()),
                NormalizeExtensionsCsv(_moduleSettings.GetSetting(0, "Upload_BlockedExtensions", GetDefaultBlockedExtensionsCsv()), GetDefaultBlockedExtensionsCsv())
            );
        }

        private static string GetDefaultAllowedExtensionsCsv()
            => ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.txt,.csv";

        private static string GetDefaultBlockedExtensionsCsv()
            => ".exe,.bat,.cmd,.com,.dll,.msi,.ps1,.sh,.php,.phtml,.aspx,.asp,.jsp,.js";

        private static HashSet<string> ParseExtensions(IEnumerable<string> values)
        {
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (values == null) return set;
            foreach (var raw in values)
            {
                var value = (raw ?? string.Empty).Trim().ToLowerInvariant();
                if (string.IsNullOrWhiteSpace(value)) continue;
                if (!value.StartsWith(".")) value = "." + value;
                set.Add(value);
            }
            return set;
        }

        private static HashSet<string> ParseExtensions(string csv)
            => ParseExtensions((csv ?? string.Empty).Split(new[] { ',', '\n', '\r', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries));

        private static string NormalizeExtensionsCsv(string csv, string fallback)
        {
            var set = ParseExtensions(string.IsNullOrWhiteSpace(csv) ? fallback : csv);
            return string.Join(",", set.OrderBy(x => x));
        }

        // ── Private helpers ───────────────────────────────────

        private static object TryParseJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            try { return JsonConvert.DeserializeObject(json); } catch { return null; }
        }

        private static JObject TryParseJObject(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            try { return JObject.Parse(json); } catch { return null; }
        }

        private static string CsvEscape(string value)
        {
            if (value == null) return "";
            if (value.Contains(',') || value.Contains('"') || value.Contains('\n'))
                return "\"" + value.Replace("\"", "\"\"") + "\"";
            return value;
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
}
