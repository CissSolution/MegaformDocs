using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Net;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.Configuration;
using Oqtane.Controllers;
using Oqtane.Enums;
using Oqtane.Infrastructure;
using Oqtane.Models;
using Oqtane.Repository;
using Oqtane.Shared;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Rendering;
using MegaForm.Core.Utilities;
using MegaForm.Core.Workflow;
using MegaForm.Core.Services;
using MegaForm.Core.Services.Starters;
using MegaForm.Core.ViewModes;
using MegaForm.Oqtane.Shared.Models;
using MegaForm.Oqtane.Server.Services;
using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore;

namespace MegaForm.Oqtane.Server.Controllers
{
    // [IgnoreAntiforgeryToken]: MegaForm's builder, gallery, and submissions are called
    // from JavaScript XHR/fetch directly (not Blazor ServiceBase), so they do not carry
    // the RequestVerificationToken that Oqtane's global AutoValidateAntiforgeryToken filter
    // requires for POST/DELETE mutations.
    // Security is enforced via [Authorize(Policy = "EditModule"/"ViewModule")] on each
    // action (same as Oqtane.Blogs uses [IgnoreAntiforgeryToken] for its views-count endpoint).
    [Route(ControllerRoutes.ApiRoute)]
    [IgnoreAntiforgeryToken]
    public partial class MegaFormController : ModuleControllerBase
    {
        private const string PdfFormUploadOqtaneBadge = "PdfFormUploadOqtane v20260505-01";
        private readonly IFormRepository _formRepo;
        private readonly ISubmissionRepository _subRepo;
        private readonly IPhase2Repository _phase2Repo;
        private readonly SubmissionProcessor _processor;
        private readonly ISettingRepository _settings;
        private readonly SubmissionQueryService _submissionQueries;
        private readonly BuilderTemplateCatalogService _templateCatalog;
        private readonly PermissionCatalogService _permissionCatalog;
        private readonly IWebHostEnvironment _env;  // needed for i18n static file serving
        private readonly MegaForm.Core.Interfaces.IConnectionRegistry _connectionRegistry;  // FieldOptions + DatabaseInsert
        private readonly WorkflowTaskService _workflowTasks;
        private readonly IWorkflowRepository _workflowRepo;
        private readonly LeaveRequestStarterService _leaveRequestStarter;
        private readonly ProposalStarterService _proposalStarter;
        private readonly DocumentExchangeStarterService _documentExchangeStarter;
        private readonly PurchaseOrderStarterService _purchaseOrderStarter;
        private readonly RecruitmentStarterService _recruitmentStarter;
        private readonly ConfiguredAppStarterService _configuredAppStarter;
        private readonly IUserRepository _users;
        private readonly IDbContextFactory<MegaFormDbContext> _dbContextFactory;
        // [B51 DefaultConnectionString v20260602] — exposes Oqtane appsettings
        // ConnectionStrings to the Database Settings popup so the UI can prefill
        // the connection string field with whatever Oqtane itself is using.
        private readonly IConfiguration _configuration;
        // [B214 settings-cache invalidate] Writing module settings via ISettingRepository does
        // NOT invalidate Oqtane's cached site state (ModuleState.Settings is built from the
        // IMemoryCache site entry). Without a sync event, a DIFFERENT browser/circuit keeps
        // reading the OLD MegaForm:FormId until an app restart — e.g. picking a Standard form
        // but other tabs still render the previous form. Fire a Site Refresh after saving.
        private readonly ISyncManager _syncManager;
        private readonly ITenantManager _tenantManager;

        public MegaFormController(
            IFormRepository formRepo,
            ISubmissionRepository subRepo,
            IPhase2Repository phase2Repo,
            SubmissionProcessor processor,
            ISettingRepository settings,
            IWebHostEnvironment env,
            PermissionCatalogService permissionCatalog,
            MegaForm.Core.Interfaces.IConnectionRegistry connectionRegistry,
            WorkflowTaskService workflowTasks,
            IWorkflowRepository workflowRepo,
            LeaveRequestStarterService leaveRequestStarter,
            ProposalStarterService proposalStarter,
            DocumentExchangeStarterService documentExchangeStarter,
            PurchaseOrderStarterService purchaseOrderStarter,
            RecruitmentStarterService recruitmentStarter,
            ConfiguredAppStarterService configuredAppStarter,
            IUserRepository users,
            IDbContextFactory<MegaFormDbContext> dbContextFactory,
            IConfiguration configuration,
            ISyncManager syncManager,
            ITenantManager tenantManager,
            ILogManager logger,
            IHttpContextAccessor accessor) : base(logger, accessor)
        {
            _formRepo = formRepo;
            _subRepo = subRepo;
            _phase2Repo = phase2Repo;
            _processor = processor;
            _settings = settings;
            _env = env;  // store for i18n endpoints
            _permissionCatalog = permissionCatalog;
            _connectionRegistry = connectionRegistry;
            _workflowTasks = workflowTasks;
            _workflowRepo = workflowRepo;
            _leaveRequestStarter = leaveRequestStarter;
            _proposalStarter = proposalStarter;
            _documentExchangeStarter = documentExchangeStarter;
            _purchaseOrderStarter = purchaseOrderStarter;
            _recruitmentStarter = recruitmentStarter;
            _configuredAppStarter = configuredAppStarter;
            _users = users;
            _dbContextFactory = dbContextFactory;
            _configuration = configuration;
            _syncManager = syncManager;
            _tenantManager = tenantManager;
            _submissionQueries = new SubmissionQueryService(_subRepo, _formRepo, null);
            _templateCatalog = new BuilderTemplateCatalogService(env);
        }

        // [OqTemplateNewtonsoftJson v20260430-14] BuilderTemplateRecord has Newtonsoft
        // JArray/JObject/JToken properties (Fields, Settings, Rules). Oqtane wires
        // System.Text.Json (cannot AddNewtonsoftJson on Oqtane's IMvcBuilder), so the
        // default Ok(record) emits empty `{}` for those properties — losing nested
        // Row.columns.fields. Pre-serialize via Newtonsoft and return as Content().
        private ContentResult JsonOk(object payload)
        {
            var json = Newtonsoft.Json.JsonConvert.SerializeObject(payload);
            return new ContentResult
            {
                Content = json,
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        private UserContext GetCurrentUserContext()
        {
            var user = User;
            var userId = ParseClaimsUserId(user);
            var userName = user != null ? (user.FindFirst(ClaimTypes.Name)?.Value ?? user.Identity?.Name ?? "anonymous") : "anonymous";
            var displayName = user != null
                ? (user.FindFirst("name")?.Value
                    ?? user.FindFirst(ClaimTypes.Name)?.Value
                    ?? user.Identity?.Name
                    ?? "anonymous")
                : "anonymous";
            var email = user != null ? (user.FindFirst(ClaimTypes.Email)?.Value ?? string.Empty) : string.Empty;

            User dbUser = null;
            if ((string.IsNullOrWhiteSpace(email) || string.Equals(displayName, "anonymous", StringComparison.OrdinalIgnoreCase) || userId <= 0)
                && userId > 0)
            {
                dbUser = _users.GetUser(userId, false) ?? _users.GetUser(userId);
            }

            if (dbUser == null
                && (string.IsNullOrWhiteSpace(email) || userId <= 0)
                && !string.IsNullOrWhiteSpace(userName)
                && !string.Equals(userName, "anonymous", StringComparison.OrdinalIgnoreCase))
            {
                dbUser = _users.GetUser(userName);
            }

            if (dbUser != null)
            {
                if (userId <= 0)
                    userId = dbUser.UserId;
                if (string.IsNullOrWhiteSpace(email))
                    email = dbUser.Email ?? string.Empty;
                if (string.Equals(displayName, "anonymous", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(dbUser.DisplayName))
                    displayName = dbUser.DisplayName;
                if (string.Equals(userName, "anonymous", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(dbUser.Username))
                    userName = dbUser.Username;
            }

            return new UserContext
            {
                UserId = userId,
                UserName = userName,
                DisplayName = displayName,
                Email = email,
                IsAuthenticated = user != null && user.Identity != null && user.Identity.IsAuthenticated,
                IsAdmin = user != null && (user.IsInRole("Host") || user.IsInRole("Administrators") || user.IsInRole("Admin")),
                IsSuperUser = user != null && user.IsInRole("Host"),
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

            var authSiteId = AuthEntityId(EntityNames.Site);
            return authSiteId > 0 ? authSiteId : ParsePositiveInt(Request?.Headers["X-OQTANE-SITEID"].FirstOrDefault());
        }

        private AppDefinitionService CreateAppDefinitionService()
        {
            return new AppDefinitionService(_phase2Repo, _formRepo, new AppProfileService());
        }

        private AppQueryRegistryService CreateAppQueryRegistryService(AppDefinitionService apps = null)
        {
            return new AppQueryRegistryService(_phase2Repo, _formRepo, apps ?? CreateAppDefinitionService());
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

        private static int ParseClaimsUserId(ClaimsPrincipal user)
        {
            int userId;
            return int.TryParse(user?.FindFirst("sub")?.Value ?? user?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out userId)
                ? userId
                : -1;
        }

        private bool CanUseAdminPopup()
        {
            return User?.Identity?.IsAuthenticated == true;
        }

        // ══════════════════════════════════════════════════════
        //  FORM CRUD
        // ══════════════════════════════════════════════════════

        [HttpGet("Form/{formId}")]
        [Authorize(Policy = "ViewModule")]
        public IActionResult GetForm(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound();
            var dto = ToDto(form);
            var resolved = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson, form.SubmitButtonText, form.SuccessMessage, form.RedirectUrl);
            var authModuleId = AuthEntityId(EntityNames.Module);
            var selectedPresetThemeKey = GetSelectedThemePresetKey(authModuleId > 0 ? authModuleId : form.ModuleId);
            dto.SchemaJson = resolved.SchemaJson;
            dto.SettingsJson = resolved.SettingsJson;
            dto.ResolvedSchemaJson = resolved.SchemaJson;
            dto.ResolvedSettingsJson = resolved.SettingsJson;
            dto.SubmitButtonText = resolved.SubmitButtonText;
            dto.SuccessMessage = resolved.SuccessMessage;
            dto.RedirectUrl = resolved.RedirectUrl;
            dto.ResolverBadge = resolved.Badge;
            dto.InitialInlineCss = ThemePresetInlineCssService.Build(resolved.SettingsJson, selectedPresetThemeKey, "#mf-form-wrapper-" + form.FormId);
            return Ok(dto);
        }

        // [OQ-difix20260418-10] Bug C: Builder TS (dom.ts:1213 loadAndInitBuilder)
        // calls GET /api/MegaForm/Form/Get?formId=... — a DNN-style convention.
        // The Oqtane port previously only exposed /Form/{id}, so the Builder
        // received 404 and silently failed to load existing forms.
        // Alias delegates to the same handler.
        [HttpGet("Form/Get")]
        [Authorize(Policy = "ViewModule")]
        public IActionResult GetFormByQuery([FromQuery] int formId)
        {
            return GetForm(formId);
        }

        [HttpGet("Form/List")]
        [Authorize(Policy = "ViewModule")]
        public IActionResult ListForms([FromQuery] int moduleId = 0, [FromQuery] int siteId = 0)
        {
            // [OQListFormsExplicitZero v20260501-07] Caller passes moduleId=0 to
            // request site-wide forms (e.g. Dashboard module which has no forms
            // bound to it). Previously we restored moduleId from AuthEntityId
            // which silently undid the explicit 0 → forced the per-module path
            // → Dashboard always showed 0 forms. Now: only fall back to auth
            // when BOTH ids are missing, so an explicit moduleId=0 is honored.
            var authModuleId = AuthEntityId(EntityNames.Module);
            var authSiteId = AuthEntityId(EntityNames.Site);
            if (siteId <= 0) siteId = authSiteId;
            if (moduleId < 0) moduleId = 0;
            // Backwards-compat: if caller did NOT pass moduleId at all (default 0)
            // AND did not pass siteId, infer module from auth so legacy callers
            // (per-module dropdowns) keep working.
            if (moduleId == 0 && siteId == 0) moduleId = authModuleId;

            List<FormInfo> forms;
            if (moduleId > 0)
            {
                forms = _formRepo.GetFormsByModule(moduleId);
                if ((forms == null || forms.Count == 0) && siteId > 0)
                    forms = _formRepo.ListForms(siteId, pageSize: 0);
            }
            else if (siteId > 0)
            {
                forms = _formRepo.ListForms(siteId, pageSize: 0);
            }
            else
            {
                return Ok(new List<FormDto>());
            }

            return Ok((forms ?? new List<FormInfo>()).Select(ToDto));
        }

        [HttpPost("Form")]
        [Authorize(Policy = "EditModule")]
        public IActionResult SaveForm([FromBody] JsonElement bodyElement)
        {
            // [OQ-difix20260418-07] System.Text.Json (ASP.NET Core default) cannot
            // deserialize directly into Newtonsoft.Json.Linq.JObject. Oqtane does NOT
            // call .AddNewtonsoftJson() on its IMvcBuilder. Previously the param was
            // [FromBody] JObject → bound as null → returned 400 "Request body is empty".
            // Fix: bind to JsonElement (native), then parse the raw text into JObject
            // so the rest of this method (which uses JObject features extensively)
            // continues to work unchanged.
            string rawBodyJson = bodyElement.ValueKind == JsonValueKind.Undefined
                              || bodyElement.ValueKind == JsonValueKind.Null
                ? null
                : bodyElement.GetRawText();
            if (string.IsNullOrWhiteSpace(rawBodyJson))
                return BadRequest(new { error = "Request body is empty or not valid JSON" });
            JObject rawBody;
            try { rawBody = JObject.Parse(rawBodyJson); }
            catch (Exception ex) { return BadRequest(new { error = "Request body is not valid JSON: " + ex.Message }); }

            // Accept JObject (same pattern as SaveTheme) so the JS builder can send
            // schemaJson/settingsJson as either a JSON object or a JSON string.
            // FormDto expects string fields — we normalise here.

            // Helper: extract a field as JSON string whether it arrived as object or string
            static string JTokenToString(JToken token)
            {
                if (token == null) return null;
                return token.Type == JTokenType.String
                    ? token.Value<string>()
                    : token.ToString(Newtonsoft.Json.Formatting.None);
            }

            bool preserveModuleBindingOnSave = (rawBody.Value<bool?>("PreserveModuleBindingOnSave") ?? false)
                                            || (rawBody.Value<bool?>("preserveModuleBindingOnSave") ?? false);

            // [OQSavePublishDuplicate v20260502-01] DO NOT add the two casings —
            // when the client sends BOTH "FormId":44 AND "formId":44 (e.g. from
            // re-serialised payloads or older builders), the server computed
            // 44+44=88 → no row found → SaveForm created a NEW row → publishing
            // produced a duplicate every time. Coalesce instead.
            var dto = new FormDto
            {
                FormId             = ReadIntCoalesced(rawBody, "FormId", "formId"),
                ModuleId           = ReadIntCoalesced(rawBody, "ModuleId", "moduleId"),
                SiteId             = ReadIntCoalesced(rawBody, "SiteId", "siteId"),
                Title              = rawBody.Value<string>("Title") ?? rawBody.Value<string>("title"),
                Description        = rawBody.Value<string>("Description") ?? rawBody.Value<string>("description"),
                Status             = rawBody.Value<string>("Status") ?? rawBody.Value<string>("status") ?? "Draft",
                SubmitButtonText   = rawBody.Value<string>("SubmitButtonText") ?? rawBody.Value<string>("submitButtonText") ?? "Submit",
                SuccessMessage     = rawBody.Value<string>("SuccessMessage") ?? rawBody.Value<string>("successMessage"),
                RedirectUrl        = rawBody.Value<string>("RedirectUrl") ?? rawBody.Value<string>("redirectUrl"),
                EnableCaptcha      = rawBody.Value<bool>("EnableCaptcha") || rawBody.Value<bool>("enableCaptcha"),
                EnableSaveResume   = rawBody.Value<bool>("EnableSaveResume") || rawBody.Value<bool>("enableSaveResume"),
                RequireAuth        = rawBody.Value<bool>("RequireAuth") || rawBody.Value<bool>("requireAuth"),
                NotifyEmails       = rawBody.Value<string>("NotifyEmails") ?? rawBody.Value<string>("notifyEmails"),
                WebhookUrl         = rawBody.Value<string>("WebhookUrl") ?? rawBody.Value<string>("webhookUrl"),
                SchemaJson         = JTokenToString(rawBody["SchemaJson"] ?? rawBody["schemaJson"]),
                SettingsJson       = JTokenToString(rawBody["SettingsJson"] ?? rawBody["settingsJson"]),
                ThemeJson          = JTokenToString(rawBody["ThemeJson"] ?? rawBody["themeJson"]),
                RulesJson          = JTokenToString(rawBody["RulesJson"] ?? rawBody["rulesJson"]),
                WorkflowJson       = JTokenToString(rawBody["WorkflowJson"] ?? rawBody["workflowJson"]),
                AssetSelectionBadge = rawBody.Value<string>("AssetSelectionBadge") ?? rawBody.Value<string>("assetSelectionBadge"),
            };

            // Merge plugin lists if sent
            var pScripts = rawBody["PluginScripts"] ?? rawBody["pluginScripts"];
            if (pScripts?.Type == JTokenType.Array)
                dto.PluginScripts = pScripts.ToObject<List<string>>() ?? new();
            var pStyles = rawBody["PluginStyles"] ?? rawBody["pluginStyles"];
            if (pStyles?.Type == JTokenType.Array)
                dto.PluginStyles = pStyles.ToObject<List<string>>() ?? new();

            if (string.IsNullOrWhiteSpace(dto.RulesJson) || dto.RulesJson == "[]")
            {
                dto.RulesJson = ExtractRulesJson(dto.SchemaJson, dto.SettingsJson);
            }

            var authModuleId = AuthEntityId(EntityNames.Module);
            var authSiteId = AuthEntityId(EntityNames.Site);
            if (dto.ModuleId <= 0)
            {
                dto.ModuleId = authModuleId > 0 ? authModuleId : ParsePositiveInt(Request?.Headers["X-OQTANE-MODULEID"].FirstOrDefault());
            }
            if (dto.SiteId <= 0)
            {
                dto.SiteId = authSiteId > 0 ? authSiteId : ParsePositiveInt(Request?.Headers["X-OQTANE-SITEID"].FirstOrDefault());
            }
            if (dto.ModuleId <= 0 || dto.SiteId <= 0)
            {
                return BadRequest(new { error = "MegaForm Oqtane save requires a valid moduleId and siteId." });
            }

            var entity = ToEntity(dto);
            entity.ModuleId = dto.ModuleId;
            entity.PortalId = dto.SiteId;
            int formId = _formRepo.SaveForm(entity);

            // [OQ-difix20260418-09] Bug A fix: auto-bind module → form on save.
            // Builder JS only POSTs /Form (saving the form) but never POSTs
            // /ModuleConfig (writing the MegaForm:FormId setting). Without this
            // binding, the form is in DB but Index.razor renders "No form
            // configured" because ReadModuleSetting("MegaForm:FormId") returns "".
            // Doing the bind here means Save AND Publish both immediately make the
            // form visible on the module instance.
            if (formId > 0 && entity.ModuleId > 0)
            {
                try
                {
                    var existingModuleSettings = ReadSettings(EntityNames.Module, entity.ModuleId);
                    int configuredFormId = ParsePositiveInt(ReadSetting(existingModuleSettings, "MegaForm:FormId", ReadSetting(existingModuleSettings, "FormId", "0")));
                    bool shouldAutoBind = !preserveModuleBindingOnSave || configuredFormId <= 0 || configuredFormId == dto.FormId;
                    if (shouldAutoBind)
                    {
                        UpsertSetting(EntityNames.Module, entity.ModuleId, "MegaForm:FormId", formId.ToString(), false);
                        UpsertSetting(EntityNames.Module, entity.ModuleId, "FormId",          formId.ToString(), false);
                        UpsertSetting(EntityNames.Module, entity.ModuleId, "MegaForm:ModuleConfigured", "true", false);
                        UpsertSetting(EntityNames.Module, entity.ModuleId, "ModuleConfigured",          "true", false);
                    }
                }
                catch (Exception ex)
                {
                    // Non-fatal: form is saved; user can still bind manually via Settings.
                    _logger.Log(LogLevel.Warning, this, LogFunction.Other,
                        "MegaForm auto-bind module={ModuleId} form={FormId} failed: {Error}",
                        entity.ModuleId, formId, ex.Message);
                }
            }

            _logger.Log(LogLevel.Information, this, LogFunction.Create, "MegaForm Saved {FormId}", formId);
            return Ok(new { formId, moduleId = entity.ModuleId, siteId = entity.PortalId });
        }

        // [OQLockForm v20260502-01] Dashboard's "lock form" feature posts to
        // Form/Lock / Form/Unlock and reads the live list from Form/LockedIds.
        // Oqtane previously had none of these → click did nothing ("lock form
        // không được"). Storage matches the Web pattern: a JSON file under the
        // app's content root so locks persist across browsers/devices.
        private string LockedFormsPath =>
            Path.Combine(_env.ContentRootPath ?? string.Empty, "App_Data", "MegaForm", "locked-forms.json");

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
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                System.IO.File.WriteAllText(LockedFormsPath,
                    JsonConvert.SerializeObject(ids.OrderBy(x => x).ToList()));
            }
            catch { }
        }

        [HttpGet("Form/LockedIds")]
        [Authorize(Policy = "ViewModule")]
        public IActionResult GetLockedIds()
        {
            var ids = ReadLockedIds();
            return Ok(new { lockedIds = ids.OrderBy(x => x).ToList() });
        }

        // [OQLockJsonBind v20260502-03] Bind to JsonElement instead of JObject —
        // Oqtane does NOT call AddNewtonsoftJson(), so [FromBody] JObject binds
        // to null and the body's "formId" is unreadable → endpoint always
        // returned "formId required" even with valid POST. Same fix pattern as
        // SaveForm above.
        [HttpPost("Form/Lock")]
        [Authorize(Policy = "EditModule")]
        public IActionResult LockForm([FromBody] JsonElement bodyElement)
        {
            int id = ReadFormIdFromJsonElement(bodyElement);
            if (id == 0) return BadRequest(new { error = "formId required" });
            var ids = ReadLockedIds();
            ids.Add(id);
            WriteLockedIds(ids);
            return Ok(new { success = true, lockedIds = ids.OrderBy(x => x).ToList() });
        }

        [HttpPost("Form/Unlock")]
        [Authorize(Policy = "EditModule")]
        public IActionResult UnlockForm([FromBody] JsonElement bodyElement)
        {
            int id = ReadFormIdFromJsonElement(bodyElement);
            if (id == 0) return BadRequest(new { error = "formId required" });
            var ids = ReadLockedIds();
            ids.Remove(id);
            WriteLockedIds(ids);
            return Ok(new { success = true, lockedIds = ids.OrderBy(x => x).ToList() });
        }

        private static int ReadFormIdFromJsonElement(JsonElement el)
        {
            try
            {
                if (el.ValueKind != JsonValueKind.Object) return 0;
                foreach (var name in new[] { "formId", "FormId" })
                {
                    if (el.TryGetProperty(name, out var v))
                    {
                        if (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out int n)) return n;
                        if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out int s)) return s;
                    }
                }
            }
            catch { }
            return 0;
        }

        // [OQDeleteRoute v20260501-11] Dashboard's bulk-delete (and DNN/Web
        // adapters) call POST Form/Delete?formId=N. Without this alias, only
        // the REST-style DELETE Form/{formId} works → dashboard delete returned
        // 404/405 ("Chua xoa duoc form trong dashboard, bao loi API"). Now both
        // verbs/paths route to the same action.
        [HttpDelete("Form/{formId}")]
        [HttpPost("Form/Delete")]
        [Authorize(Policy = "EditModule")]
        public IActionResult DeleteForm([FromQuery(Name = "formId")] int? formIdQuery, [FromRoute(Name = "formId")] int? formIdRoute)
        {
            var formId = formIdRoute ?? formIdQuery ?? 0;
            if (formId <= 0) return BadRequest(new { error = "formId required" });
            _formRepo.DeleteForm(formId);
            _logger.Log(LogLevel.Information, this, LogFunction.Delete, "MegaForm Deleted {FormId}", formId);
            return Ok();
        }

        [HttpGet("Permissions/Get")]
        [Authorize(Policy = "EditModule")]
        public IActionResult GetPermissions([FromQuery] int formId)
        {
            if (formId <= 0) return BadRequest(new { error = "formId required" });

            var permissions = PermissionCatalogService.NormalizeRules(formId, _phase2Repo.GetFormPermissions(formId));
            return Ok(new { permissions });
        }

        [HttpGet("Permissions/Catalog")]
        [Authorize(Policy = "EditModule")]
        public IActionResult GetPermissionsCatalog([FromQuery] int formId)
        {
            // formId <= 0 → SITE-LEVEL catalog (used by the Form Creation Wizard, which
            // has no formId yet). Principals (roles + users) come from the portal, not the
            // form, so the catalog is fully populated; only the form-specific permission
            // rules are skipped. ResolvePortalId(0) falls back to auth/header site.
            if (formId < 0) formId = 0;

            var permissions = formId > 0
                ? PermissionCatalogService.NormalizeRules(formId, _phase2Repo.GetFormPermissions(formId))
                : new List<FormPermissionInfo>();
            var catalog = _permissionCatalog.GetCatalog(formId, ResolvePortalId(formId), GetCurrentUserContext());
            return Ok(new { permissions, catalog });
        }

        [HttpPost("Permissions/Save")]
        [Authorize(Policy = "EditModule")]
        public IActionResult SavePermissions([FromBody] JsonElement bodyElement)
        {
            string rawBodyJson = bodyElement.ValueKind == JsonValueKind.Undefined || bodyElement.ValueKind == JsonValueKind.Null
                ? null
                : bodyElement.GetRawText();
            if (string.IsNullOrWhiteSpace(rawBodyJson))
                return BadRequest(new { error = "Request body is empty or not valid JSON" });

            JObject body;
            try { body = JObject.Parse(rawBodyJson); }
            catch (Exception ex) { return BadRequest(new { error = "Request body is not valid JSON: " + ex.Message }); }

            int formId = body.Value<int?>("formId") ?? body.Value<int?>("FormId") ?? 0;
            if (formId <= 0) return BadRequest(new { error = "formId required" });

            var permissions = body["permissions"]?.ToObject<List<FormPermissionInfo>>() ??
                              body["Permissions"]?.ToObject<List<FormPermissionInfo>>() ??
                              new List<FormPermissionInfo>();
            var normalized = PermissionCatalogService.NormalizeRules(formId, permissions);
            _phase2Repo.SaveFormPermissions(formId, normalized);
            return Ok(new { success = true, permissions = normalized });
        }

        [HttpPost("Form/SaveTheme")]
        [Authorize(Policy = "EditModule")]
        public IActionResult SaveTheme([FromBody] JsonElement bodyElement)
        {
            // [OQ-difix20260418-07] See SaveForm for rationale: System.Text.Json can't
            // bind directly to Newtonsoft JObject in Oqtane (no AddNewtonsoftJson).
            string rawBodyJson = bodyElement.ValueKind == JsonValueKind.Undefined
                              || bodyElement.ValueKind == JsonValueKind.Null
                ? null
                : bodyElement.GetRawText();
            if (string.IsNullOrWhiteSpace(rawBodyJson))
                return BadRequest(new { error = "body required" });
            JObject body;
            try { body = JObject.Parse(rawBodyJson); }
            catch (Exception ex) { return BadRequest(new { error = "Request body is not valid JSON: " + ex.Message }); }

            int formId = body.Value<int>("FormId");
            string themeJson = body["ThemeJson"]?.ToString() ?? "{}";
            string schemaCustomCss = body["SchemaCustomCss"]?.ToString();
            string themeId = body["ThemeId"]?.ToString();
            var cssOverrides = body["CssOverrides"] as JObject;
            // [B274] Optional page-theme inheritance flags (Settings popup "Page integration").
            // Null when the caller is only patching theme/css → those forms are left untouched.
            bool? inheritType = (body["InheritPageTypography"] is JToken it && it.Type == JTokenType.Boolean) ? it.Value<bool>() : (bool?)null;
            bool? inheritColors = (body["InheritPageColors"] is JToken ic && ic.Type == JTokenType.Boolean) ? ic.Value<bool>() : (bool?)null;
            if (formId == 0) return BadRequest(new { error = "FormId required" });

            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound(new { error = "Form not found" });

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
                    if (inheritType.HasValue) { settings["inheritPageTypography"] = inheritType.Value; settings["InheritPageTypography"] = inheritType.Value; }
                    if (inheritColors.HasValue) { settings["inheritPageColors"] = inheritColors.Value; settings["InheritPageColors"] = inheritColors.Value; }
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
                if (inheritType.HasValue) { settingsJson["inheritPageTypography"] = inheritType.Value; settingsJson["InheritPageTypography"] = inheritType.Value; }
                if (inheritColors.HasValue) { settingsJson["inheritPageColors"] = inheritColors.Value; settingsJson["InheritPageColors"] = inheritColors.Value; }
                form.SettingsJson = settingsJson.ToString(Newtonsoft.Json.Formatting.None);
            }
            catch { }

            _formRepo.SaveForm(form);
            return Ok(new { formId, saved = true });
        }

        // ══════════════════════════════════════════════════════
        //  i18n — serve locale files from wwwroot/Modules/MegaForm/js/builder/i18n/
        //  Called by megaform-languages.js / megaform-i18n.js in the builder admin.
        //  GET  i18n/list          → ["en-US","vi-VN","fr-FR",...] (array of locale codes)
        //  GET  i18n/Get?id=vi-VN  → locale JSON  { "field.text": "Văn bản ngắn", ... }
        // ══════════════════════════════════════════════════════

        [HttpGet("i18n/list")]
        public IActionResult ListI18nLocales()
        {
            var i18nDir = Path.Combine(
                _env.WebRootPath, "Modules", "MegaForm", "js", "builder", "i18n");

            if (!Directory.Exists(i18nDir))
                return Ok(new[] { "en-US" });

            // index.json gives the ORDERED locale metadata. We UNION it with the on-disk
            // *.json packs so a stale/incomplete index.json can never hide an installed
            // locale (this exact drift — index listing 7 while 18 packs sat on disk — was
            // the cause of the missing de-DE/pt-BR/ar-SA regression). Index order first,
            // then any extra installed packs appended.
            var codes = new List<string>();
            var indexPath = Path.Combine(i18nDir, "index.json");
            if (System.IO.File.Exists(indexPath))
            {
                try
                {
                    var indexJson = JObject.Parse(System.IO.File.ReadAllText(indexPath));
                    var idxCodes = indexJson["locales"]?
                        .Select(l => l.Value<string>("code"))
                        .Where(c => !string.IsNullOrWhiteSpace(c));
                    if (idxCodes != null) codes.AddRange(idxCodes);
                }
                catch { /* fall through to the disk scan */ }
            }

            // Append every on-disk pack not already listed by the index.
            var diskCodes = Directory.GetFiles(i18nDir, "*.json")
                .Select(Path.GetFileNameWithoutExtension)
                .Where(f => !string.Equals(f, "index", StringComparison.OrdinalIgnoreCase))
                .OrderBy(f => f, StringComparer.OrdinalIgnoreCase);
            foreach (var c in diskCodes)
                if (!codes.Contains(c, StringComparer.OrdinalIgnoreCase))
                    codes.Add(c);

            if (codes.Count == 0) codes.Add("en-US");
            return Ok(codes.ToArray());
        }

        [HttpGet("i18n/Get")]
        public IActionResult GetI18nLocale([FromQuery] string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return BadRequest(new { error = "id required" });

            // Sanitise to prevent path traversal
            var safeId = new string(id.Where(c =>
                char.IsLetterOrDigit(c) || c == '-' || c == '_').ToArray());
            if (string.IsNullOrEmpty(safeId)) return BadRequest(new { error = "invalid id" });

            // Try bundles/i18n first (built strings), then builder/i18n (static overrides)
            foreach (var subPath in new[] { "js/bundles/i18n", "js/builder/i18n" })
            {
                var path = Path.Combine(_env.WebRootPath, "Modules", "MegaForm",
                    subPath.Replace('/', Path.DirectorySeparatorChar), safeId + ".json");
                if (System.IO.File.Exists(path))
                    return Content(System.IO.File.ReadAllText(path, System.Text.Encoding.UTF8),
                                   "application/json; charset=utf-8");
            }

            // en-US strings are bundled inline in megaform-i18n.js — no file needed
            if (string.Equals(safeId, "en-US", StringComparison.OrdinalIgnoreCase))
                return Ok(new { });

            return NotFound(new { error = $"Locale '{safeId}' not found" });
        }

        [HttpPost("i18n/create")]
        [HttpPost("i18n/save")]
        [HttpPost("i18n/import")]
        public IActionResult UpsertI18nLocale([FromBody] JsonElement body)
        {
            // [OQI18nWrite v20260617] Implement locale WRITE on Oqtane (was a blanket 501
            // stub). Persists to wwwroot/Modules/MegaForm/js/builder/i18n/<locale>.json —
            // the SAME path GetI18nLocale + ListI18nLocales read, so AI-translated /
            // hand-edited strings are picked up by the runtime immediately (after the
            // per-locale runtime cache is cleared client-side). Three shapes share this
            // action; we discriminate by the body fields:
            //   create  → { locale, copyFrom }      seed a new pack from copyFrom (en-US = empty source)
            //   save    → { locale, entries:{k:v} }  MERGE entries into the existing pack
            //   import  → { locale, jsonText }       REPLACE the whole pack
            // If the host mounts wwwroot read-only the write throws and we return a clear
            // 500 (still better than the old always-501).
            try
            {
                if (body.ValueKind != JsonValueKind.Object ||
                    !body.TryGetProperty("locale", out var locEl) ||
                    locEl.ValueKind != JsonValueKind.String)
                    return BadRequest(new { error = "locale required" });

                var safeLocale = new string((locEl.GetString() ?? "")
                    .Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_').ToArray());
                if (string.IsNullOrEmpty(safeLocale))
                    return BadRequest(new { error = "invalid locale" });
                if (string.Equals(safeLocale, "en-US", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { error = "en-US is the built-in source locale and cannot be overwritten." });

                var i18nDir = Path.Combine(_env.WebRootPath, "Modules", "MegaForm", "js", "builder", "i18n");
                Directory.CreateDirectory(i18nDir);
                var path = Path.Combine(i18nDir, safeLocale + ".json");

                JObject result;
                // import: replace the whole pack with the supplied JSON text
                if (body.TryGetProperty("jsonText", out var jtEl) && jtEl.ValueKind == JsonValueKind.String)
                {
                    try { result = JObject.Parse(jtEl.GetString() ?? "{}"); }
                    catch { return BadRequest(new { error = "jsonText is not valid JSON" }); }
                }
                // save: MERGE the posted entries into the existing pack so a partial /
                // per-tab save never drops keys edited elsewhere.
                else if (body.TryGetProperty("entries", out var enEl) && enEl.ValueKind == JsonValueKind.Object)
                {
                    result = System.IO.File.Exists(path)
                        ? SafeParseI18n(System.IO.File.ReadAllText(path, Encoding.UTF8))
                        : new JObject();
                    foreach (var p in enEl.EnumerateObject())
                        result[p.Name] = p.Value.ValueKind == JsonValueKind.String
                            ? p.Value.GetString()
                            : p.Value.ToString();
                }
                // create: never clobber an existing pack; otherwise seed from copyFrom
                // (en-US has no file — strings live inline in megaform-i18n.js — so a new
                // pack starts empty and the editor copies the English source to translate).
                else
                {
                    if (System.IO.File.Exists(path))
                        return Ok(new { ok = true, locale = safeLocale, existed = true });
                    var copyFrom = body.TryGetProperty("copyFrom", out var cfEl) && cfEl.ValueKind == JsonValueKind.String
                        ? cfEl.GetString() : "en-US";
                    result = LoadI18nPack(copyFrom) ?? new JObject();
                }

                System.IO.File.WriteAllText(path, result.ToString(Formatting.Indented), new UTF8Encoding(false));
                return Ok(new { ok = true, locale = safeLocale, count = result.Count });
            }
            catch (UnauthorizedAccessException)
            {
                return StatusCode(500, new { error = "Locale write failed: wwwroot is not writable on this host. Edit files in wwwroot/Modules/MegaForm/js/builder/i18n/ directly." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Locale write failed: " + ex.Message });
            }
        }

        // [OQI18nWrite] Parse an existing pack, tolerating a corrupt file (start fresh).
        private static JObject SafeParseI18n(string s)
        {
            try { return JObject.Parse(s); } catch { return new JObject(); }
        }

        // [OQI18nWrite] Load an installed locale pack (bundles first, then overrides) to
        // seed a copy-from create. Returns null for en-US (inline source) / missing packs.
        private JObject LoadI18nPack(string locale)
        {
            var safe = new string((locale ?? "")
                .Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_').ToArray());
            if (string.IsNullOrEmpty(safe) ||
                string.Equals(safe, "en-US", StringComparison.OrdinalIgnoreCase))
                return null;
            foreach (var sub in new[] { "js/bundles/i18n", "js/builder/i18n" })
            {
                var p = Path.Combine(_env.WebRootPath, "Modules", "MegaForm",
                    sub.Replace('/', Path.DirectorySeparatorChar), safe + ".json");
                if (System.IO.File.Exists(p))
                {
                    try { return JObject.Parse(System.IO.File.ReadAllText(p, Encoding.UTF8)); }
                    catch { return new JObject(); }
                }
            }
            return null;
        }

        [HttpGet("i18n/export/{locale}")]
        public IActionResult ExportI18nLocale(string locale)
        {
            if (string.IsNullOrWhiteSpace(locale)) return BadRequest();
            var safeLocale = new string(locale.Where(c =>
                char.IsLetterOrDigit(c) || c == '-' || c == '_').ToArray());
            var path = Path.Combine(_env.WebRootPath, "Modules", "MegaForm",
                "js", "builder", "i18n", safeLocale + ".json");
            if (!System.IO.File.Exists(path)) return NotFound();
            return File(System.IO.File.ReadAllBytes(path), "application/json", safeLocale + ".json");
        }

        // ══════════════════════════════════════════════════════
        //  SCHEMA (public form rendering — no auth required)
        // ══════════════════════════════════════════════════════

        [HttpGet("BuilderTemplates/List")]
        [Authorize(Policy = "ViewModule")]
        public IActionResult ListBuilderTemplates()
        {
            return JsonOk(_templateCatalog.List());
        }

        // [DevLockStatus v20260618] Oqtane's static-file server does NOT serve /dev.lock (.lock has
        // no MIME mapping → 404), so the builder gallery can't HEAD-probe it like Web does. Expose
        // the AiFeatureGate dev.lock state via this admin-only endpoint so the gallery can decide
        // whether to reveal the dev-only "Bulk Create Forms" button. The bulk endpoint itself
        // re-checks dev.lock server-side, so this is purely UI gating.
        [HttpGet("DevLockStatus")]
        [Authorize(Policy = "EditModule")]
        public IActionResult DevLockStatus()
        {
            return JsonOk(new { devLock = MegaForm.Core.Services.AiAssistant.AiFeatureGate.IsEnabled(_env?.WebRootPath, _env?.ContentRootPath) });
        }

        [HttpPost("BuilderTemplates/UploadJson")]
        [Authorize(Policy = "EditModule")]
        [RequestSizeLimit(10 * 1024 * 1024)]
        public async Task<IActionResult> UploadBuilderTemplateJson([FromForm] IFormFile file, [FromForm] string templateJson = null)
        {
            try
            {
                if (file == null && string.IsNullOrWhiteSpace(templateJson))
                    return BadRequest(new { error = "Template file or JSON payload is required" });

                string json = templateJson;
                string originalName = file?.FileName ?? "uploaded-template.json";

                if (file != null)
                {
                    var result = _templateCatalog.SaveUploadedTemplate(originalName, file.OpenReadStream(), json);
                    if (result.IsArchive)
                    {
                        return JsonOk(new
                        {
                            success = result.Success,
                            archive = true,
                            message = result.Message,
                            importedTemplateCount = result.ImportedTemplateCount,
                            extractedFileCount = result.ExtractedFileCount,
                            templates = result.Templates
                        });
                    }
                    return JsonOk(result.Saved ?? (object)result);
                }

                var saved = _templateCatalog.SaveTemplateJson(originalName, json);
                return JsonOk(saved);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        // [DevBulkCreate v20260618 — Oqtane parity for the gallery "Dev: Bulk Create Forms"
        //  button] Seed/refresh ONE published form per builder-gallery template, in a single
        //  click. Mirrors MegaForm.DNN BuilderTemplatesController.DevBulkCreateForms: dev.lock
        //  gated, idempotent (find-by-title → update, else create), never module-binds (unlike
        //  the normal /Form save) so it doesn't hijack this module's bound form. EditModule +
        //  dev.lock are BOTH required (dev-only seeding utility).
        [HttpPost("BuilderTemplates/DevBulkCreateForms")]
        [Authorize(Policy = "EditModule")]
        public IActionResult DevBulkCreateForms()
        {
            try
            {
                if (!MegaForm.Core.Services.AiAssistant.AiFeatureGate.IsEnabled(_env?.WebRootPath, _env?.ContentRootPath))
                    return StatusCode(StatusCodes.Status403Forbidden, new { error = "dev.lock is required" });

                int moduleId = AuthEntityId(EntityNames.Module);
                if (moduleId <= 0) moduleId = ParsePositiveInt(Request?.Headers["X-OQTANE-MODULEID"].FirstOrDefault());
                int siteId = AuthEntityId(EntityNames.Site);
                if (siteId <= 0) siteId = ParsePositiveInt(Request?.Headers["X-OQTANE-SITEID"].FirstOrDefault());
                if (moduleId <= 0 || siteId <= 0)
                    return BadRequest(new { error = "Bulk create requires a valid moduleId and siteId." });

                var templates = _templateCatalog.List() ?? (IReadOnlyList<MegaForm.Core.Services.BuilderTemplateCatalogStore.BuilderTemplateRecord>)Array.Empty<MegaForm.Core.Services.BuilderTemplateCatalogStore.BuilderTemplateRecord>();
                var existingForms = _formRepo.ListForms(siteId, pageSize: 0) ?? new List<FormInfo>();

                // [FK fix v20260619] MF_Forms has FK_MF_Forms_Module, so ModuleId=0 violates the FK
                // and EVERY insert fails. Bind seeds to a dedicated ORPHAN "seed bucket" module that
                // exists in dbo.Module but is on NO page — it never renders and never hijacks a real
                // module's auto-render (EfRepositories.ListForms resolves a module's form by
                // f.ModuleId == moduleId, so reusing a real page module would hijack it).
                int seedModuleId = ResolveSeedBucketModuleId(siteId);

                int created = 0, updated = 0;
                var formIds = new List<int>();
                var items = new List<object>();
                var errors = new List<object>();

                foreach (var t in templates)
                {
                    // [Safety v20260618b] Seeded forms are titled by their FILENAME (e.g. "donor.json")
                    // and carry a settings.devBulkSeed marker — NOT the template's display title. So a
                    // real form that happens to share a display title is NEVER matched/overwritten, and
                    // re-runs update only OUR OWN seeds. Mirrors MegaForm.DNN ApplyDevBulkTemplateToForm.
                    var sf = System.IO.Path.GetFileName(string.IsNullOrWhiteSpace(t?.FileName) ? ((t?.Slug ?? "template") + ".json") : t.FileName);
                    if (string.IsNullOrWhiteSpace(sf)) sf = "template.json";
                    var sourceFile = sf;
                    try
                    {
                        var settings = (t.Settings != null) ? (JObject)t.Settings.DeepClone() : new JObject();
                        settings["submitButtonText"] = string.IsNullOrWhiteSpace(t.SubmitButtonText) ? "Submit" : t.SubmitButtonText;
                        settings["successMessage"] = t.SuccessMessage ?? string.Empty;
                        if (!string.IsNullOrEmpty(t.CustomHtml)) settings["customHtml"] = t.CustomHtml;
                        if (!string.IsNullOrEmpty(t.CustomCss)) settings["customCss"] = t.CustomCss;
                        if (t.Rules != null && t.Rules.Type != JTokenType.Null) settings["rules"] = t.Rules.DeepClone();
                        if (t.Workflow != null && t.Workflow.Type != JTokenType.Null) settings["workflowTemplate"] = t.Workflow.DeepClone();
                        settings["devBulkSeed"] = new JObject
                        {
                            ["sourceFile"] = sf,
                            ["templateId"] = t.Id ?? string.Empty,
                            ["templateSlug"] = t.Slug ?? string.Empty,
                            ["createdBy"] = "Dev bulk publish seed (Oqtane) v20260618",
                            ["updatedUtc"] = DateTime.UtcNow.ToString("O"),
                        };

                        var schema = new JObject
                        {
                            ["version"] = "1.0",
                            ["title"] = sf,
                            ["description"] = t.Description ?? "",
                            ["fields"] = t.Fields ?? new JArray(),
                            ["settings"] = settings,
                        };

                        var existingForm = existingForms.FirstOrDefault(f => IsDevSeedMatch(f, sf));
                        bool isNew = existingForm == null;

                        var dto = new FormDto
                        {
                            FormId           = existingForm?.FormId ?? 0,
                            ModuleId         = seedModuleId,   // ORPHAN seed-bucket module (no page) — satisfies FK_MF_Forms_Module without hijacking a real module's binding
                            SiteId           = siteId,
                            Title            = sf,
                            Description      = string.IsNullOrWhiteSpace(t.Description) ? ("DEV bulk form seeded from " + sf) : t.Description,
                            Status           = "Published",
                            SubmitButtonText = string.IsNullOrWhiteSpace(t.SubmitButtonText) ? "Submit" : t.SubmitButtonText,
                            SuccessMessage   = t.SuccessMessage,
                            SchemaJson       = schema.ToString(Newtonsoft.Json.Formatting.None),
                            SettingsJson     = settings.ToString(Newtonsoft.Json.Formatting.None),
                            RulesJson        = (t.Rules ?? new JArray()).ToString(Newtonsoft.Json.Formatting.None),
                        };

                        var entity = ToEntity(dto);
                        entity.ModuleId = seedModuleId;   // ORPHAN seed-bucket module (no page) — satisfies FK_MF_Forms_Module without hijacking a real module's binding
                        entity.PortalId = siteId;
                        int fid = _formRepo.SaveForm(entity);

                        if (isNew) { created++; existingForms.Add(new FormInfo { FormId = fid, Title = sf, SettingsJson = dto.SettingsJson }); }
                        else { updated++; }

                        formIds.Add(fid);
                        items.Add(new { formId = fid, sourceFile, title = sf, status = isNew ? "created" : "updated" });
                    }
                    catch (Exception templateEx)
                    {
                        errors.Add(new { sourceFile, error = templateEx.Message, detail = templateEx.InnerException?.Message });
                    }
                }

                return JsonOk(new
                {
                    success = errors.Count == 0,
                    marker = "Dev bulk publish seed (Oqtane) v20260618",
                    totalTemplates = templates.Count,
                    created,
                    updated,
                    failed = errors.Count,
                    formIds = formIds.Distinct().ToArray(),
                    items,
                    errors,
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message, detail = ex.InnerException?.Message });
            }
        }

        // [FK fix v20260619] Resolves the dedicated ORPHAN "seed bucket" module used to satisfy
        // FK_MF_Forms_Module for dev bulk-create seeds. The bucket module exists in dbo.Module but
        // is on NO page (no PageModule row), so it never renders and never hijacks a real module's
        // auto-rendered form (EfRepositories.ListForms binds a module's form by f.ModuleId == moduleId).
        // Resolution order: (1) cached Site setting MegaForm_SeedBucketModuleId, if it still exists;
        // (2) an existing orphan MegaForm module on this site; (3) create a fresh orphan module.
        // The resolved id is cached back into the Site setting so it is reused on re-runs. On ANY
        // failure we fall back to the caller's moduleId so behavior is no worse than before — NOTE
        // that fallback may bind seeds to a real PAGE module and hijack its auto-rendered form.
        private int ResolveSeedBucketModuleId(int siteId)
        {
            try
            {
                using var db = _dbContextFactory.CreateDbContext();

                // (1) Re-use the cached bucket module if the setting points at a module that still exists.
                var cached = _settings.GetSetting("Site", siteId, "MegaForm_SeedBucketModuleId");
                if (cached != null && int.TryParse(cached.SettingValue, out var cachedId) && cachedId > 0)
                {
                    var stillExists = db.Database.SqlQueryRaw<int>(
                        "SELECT COUNT(*) AS Value FROM Module WHERE ModuleId = @moduleId",
                        new Microsoft.Data.SqlClient.SqlParameter("@moduleId", cachedId)).AsEnumerable().FirstOrDefault();
                    if (stillExists > 0)
                        return cachedId;
                }

                // (2) Find an existing orphan MegaForm module (on this site, on no page) to reuse.
                var orphanId = db.Database.SqlQueryRaw<int>(
                    "SELECT TOP 1 m.ModuleId AS Value FROM Module m " +
                    "WHERE m.SiteId = @siteId AND m.ModuleDefinitionName LIKE '%MegaForm%' " +
                    "AND NOT EXISTS (SELECT 1 FROM PageModule pm WHERE pm.ModuleId = m.ModuleId)",
                    new Microsoft.Data.SqlClient.SqlParameter("@siteId", siteId)).AsEnumerable().FirstOrDefault();
                if (orphanId > 0)
                {
                    UpsertSetting("Site", siteId, "MegaForm_SeedBucketModuleId", orphanId.ToString(CultureInfo.InvariantCulture), false);
                    return orphanId;
                }

                // (3) Create a fresh orphan module (no PageModule row → never renders). INSERT ... OUTPUT
                // returns the new id in the same command so it is read back atomically.
                var newId = db.Database.SqlQueryRaw<int>(
                    "INSERT INTO Module (SiteId, ModuleDefinitionName, AllPages, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn) " +
                    "OUTPUT INSERTED.ModuleId AS Value " +
                    "VALUES (@siteId, 'MegaForm.Client, MegaForm.Oqtane.Client.Oqtane', 0, 'megaform-seed', SYSUTCDATETIME(), 'megaform-seed', SYSUTCDATETIME())",
                    new Microsoft.Data.SqlClient.SqlParameter("@siteId", siteId)).AsEnumerable().FirstOrDefault();
                if (newId > 0)
                {
                    UpsertSetting("Site", siteId, "MegaForm_SeedBucketModuleId", newId.ToString(CultureInfo.InvariantCulture), false);
                    return newId;
                }
            }
            catch
            {
                // Swallow and fall through to the legacy fallback below.
            }

            // Fallback: behave no worse than before. NOTE this may bind seeds to a real PAGE module
            // and hijack its auto-rendered form — acceptable only because the orphan path above failed.
            int fallback = AuthEntityId(EntityNames.Module);
            if (fallback <= 0) fallback = ParsePositiveInt(Request?.Headers["X-OQTANE-MODULEID"].FirstOrDefault());
            return fallback;
        }

        // [DevBulkCreate v20260618] True only for a form that THIS seeder created — matched by the
        // settings.devBulkSeed.sourceFile marker, else by Title == filename (seeds are titled by their
        // file). A normal form (display title, no marker) never matches, so bulk-create can re-run
        // idempotently without ever touching a real form.
        private static bool IsDevSeedMatch(FormInfo f, string sourceFile)
        {
            if (f == null || string.IsNullOrWhiteSpace(sourceFile)) return false;
            try
            {
                if (!string.IsNullOrWhiteSpace(f.SettingsJson))
                {
                    var s = JObject.Parse(f.SettingsJson);
                    var seed = s["devBulkSeed"] as JObject;
                    var existing = (string)seed?["sourceFile"];
                    if (!string.IsNullOrWhiteSpace(existing) && string.Equals(existing, sourceFile, StringComparison.OrdinalIgnoreCase))
                        return true;
                }
            }
            catch { }
            return string.Equals(f.Title, sourceFile, StringComparison.OrdinalIgnoreCase);
        }

        // ══════════════════════════════════════════════════════
        //  FIELD OPTIONS — load Dropdown/Radio/Checkbox options from SQL
        //  Public endpoint (form is rendered to anonymous users) — security guards
        //  inside FieldOptionsService: SELECT-only inline SQL or stored proc,
        //  banned DML keywords, 10s timeout, schema-derived connection only.
        //
        //  Cascading: any query-string parameter starting with "__p__" is
        //  stripped of that prefix and passed to the SQL/stored proc as a
        //  named parameter (parent field value → child dropdown filter).
        //  Badge: FieldOptionsService v20260516-02 (cascading)
        // ══════════════════════════════════════════════════════
        private string MergeRequestParameterJson(string json)
        {
            var dict = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

            foreach (var kv in Request.Query)
            {
                if (string.IsNullOrWhiteSpace(kv.Key) || !kv.Key.StartsWith("__p__", StringComparison.OrdinalIgnoreCase))
                    continue;
                var name = kv.Key.Substring(5);
                if (string.IsNullOrWhiteSpace(name))
                    continue;
                dict[name] = kv.Value.ToString();
            }

            if (!string.IsNullOrWhiteSpace(json))
            {
                try
                {
                    var parsed = JsonConvert.DeserializeObject<Dictionary<string, object>>(json);
                    if (parsed != null)
                    {
                        foreach (var item in parsed)
                        {
                            if (!string.IsNullOrWhiteSpace(item.Key))
                                dict[item.Key] = item.Value;
                        }
                    }
                }
                catch
                {
                    if (dict.Count == 0) return json;
                }
            }

            return dict.Count == 0 ? json : JsonConvert.SerializeObject(dict);
        }

        [HttpGet("Field/Options")]
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

            var svc = new MegaForm.Core.Services.FieldOptionsService(_connectionRegistry, _formRepo);
            var options = svc.GetOptions(formId, fieldKey, parameters);
            return Ok(options);
        }

        // ══════════════════════════════════════════════════════
        //  FIELD/INSERT TEST (admin) — dry-run INSERT in a rolled-back transaction.
        //  Body: { "connectionKey": "...", "databaseType": "...", "insertSql": "...", "sampleData": {...} }
        //  Badge: FormDatabaseInsertTest v20260430-01
        // ══════════════════════════════════════════════════════
        [HttpGet("DataRepeater/Query")]
        public IActionResult DataRepeaterQuery(
            int formId,
            string widgetKey,
            string parentId = null,
            int level = 0,
            int page = 1,
            int pageSize = 50,
            string sortCol = null,
            string sortDir = null,
            string filterJson = null)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(widgetKey))
                return BadRequest(new { error = "formId and widgetKey are required." });

            var request = new DataRepeaterQueryRequest
            {
                FormId = formId,
                WidgetKey = widgetKey,
                ParentId = parentId,
                Level = level,
                Page = Math.Max(1, page),
                PageSize = Math.Min(Math.Max(1, pageSize), 500),
                SortCol = sortCol,
                SortDir = sortDir,
                FilterJson = MergeRequestParameterJson(filterJson)
            };

            var service = new DataRepeaterService(_connectionRegistry, _formRepo);
            var result = service.ExecuteQuery(request);
            return Ok(result);
        }

        [HttpGet("DataRepeater/FilterOptions")]
        public IActionResult DataRepeaterFilterOptions(int formId, string widgetKey, string filterKey, string contextJson = null)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(widgetKey) || string.IsNullOrWhiteSpace(filterKey))
                return BadRequest(new { error = "formId, widgetKey, and filterKey are required." });

            var service = new DataRepeaterService(_connectionRegistry, _formRepo);
            var options = service.ExecuteFilterQuery(formId, widgetKey, filterKey, MergeRequestParameterJson(contextJson));
            return Ok(new { options });
        }

        [HttpGet("DataRepeater/ColumnOptions")]
        public IActionResult DataRepeaterColumnOptions(int formId, string widgetKey, string columnKey, string contextJson = null)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(widgetKey) || string.IsNullOrWhiteSpace(columnKey))
                return BadRequest(new { error = "formId, widgetKey, and columnKey are required." });

            var service = new DataRepeaterService(_connectionRegistry, _formRepo);
            var options = service.ExecuteGridColumnOptionsQuery(formId, widgetKey, columnKey, MergeRequestParameterJson(contextJson));
            return Ok(options);
        }

        [HttpGet("DataRepeater/Export")]
        public IActionResult DataRepeaterExport(int formId, string widgetKey, string format = "csv", string filterJson = null)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(widgetKey))
                return BadRequest(new { error = "formId and widgetKey are required." });

            if (!string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { error = "PDF export is handled client-side." });

            var request = new DataRepeaterQueryRequest
            {
                FormId = formId,
                WidgetKey = widgetKey,
                Page = 1,
                PageSize = 5000,
                FilterJson = MergeRequestParameterJson(filterJson)
            };

            var service = new DataRepeaterService(_connectionRegistry, _formRepo);
            var csv = service.ExportCsv(request);
            if (string.IsNullOrEmpty(csv))
                return BadRequest(new { error = "Export failed." });

            return File(Encoding.UTF8.GetBytes(csv), "text/csv", "data-repeater-export.csv");
        }

        [HttpPost("Field/TestInsert")]
        [Authorize(Policy = "EditModule")]
        public IActionResult TestFieldInsert([FromBody] Newtonsoft.Json.Linq.JObject body)
        {
            if (body == null) return BadRequest(new { error = "body required" });
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
                        ParameterMapping = body["parameterMapping"] is Newtonsoft.Json.Linq.JObject pm
                            ? pm.ToObject<Dictionary<string, string>>() ?? new Dictionary<string, string>()
                            : new Dictionary<string, string>()
                    }
                };
                var sample = body["sampleData"] is Newtonsoft.Json.Linq.JObject sd
                    ? sd.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>()
                    : new Dictionary<string, object>();
                var svc = new MegaForm.Core.Services.FormDatabaseInsertService(_connectionRegistry);
                var result = svc.TestExecute(settings, sample);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return Ok(new MegaForm.Core.Services.FormDatabaseInsertTestResult { Success = false, Error = ex.Message });
            }
        }

        [HttpGet("Schema/{formId}")]
        public IActionResult Schema(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null) // [B267] draft/published gate removed — serve schema for any existing form
                return NotFound();

            var resolvedRenderModel = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson, form.SubmitButtonText, form.SuccessMessage, form.RedirectUrl);
            var authModuleId = AuthEntityId(EntityNames.Module);
            var selectedPresetThemeKey = GetSelectedThemePresetKey(authModuleId > 0 ? authModuleId : form.ModuleId);
            var assetManifest = BuildAssetManifest(resolvedRenderModel.SchemaJson ?? "{}");
            return Ok(new SchemaResponse
            {
                FormId = form.FormId,
                Title = form.Title,
                Description = form.Description,
                Schema = resolvedRenderModel.SchemaJson,
                SubmitButtonText = resolvedRenderModel.SubmitButtonText,
                EnableCaptcha = form.EnableCaptcha,
                EnableSaveResume = form.EnableSaveResume,
                ThemeJson = form.ThemeJson,
                SettingsJson = resolvedRenderModel.SettingsJson,
                InitialInlineCss = ThemePresetInlineCssService.Build(resolvedRenderModel.SettingsJson, selectedPresetThemeKey, "#mf-form-wrapper-" + form.FormId),
                RequireAuth = form.RequireAuth,
                AssetSelectionBadge = assetManifest.Badge,
                PluginScripts = assetManifest.ScriptFiles ?? new System.Collections.Generic.List<string>(),
                PluginStyles = assetManifest.StyleFiles ?? new System.Collections.Generic.List<string>()
            });
        }

        // ══════════════════════════════════════════════════════
        //  SUBMIT (public — no auth required)
        // ══════════════════════════════════════════════════════
        // [OQSubmitRoute v20260501-11] Canonical client (renderer/index.ts +
        // dnn.ts + aspcore.ts adapters) calls "Submit/Post" — DNN/Web routes
        // match. Oqtane previously had only "Submit" → 404/400 on every form
        // submission ("Server error: 400" toast). Aligned to "Submit/Post".
        // Kept "Submit" as alias to avoid breaking any older client cached in
        // the browser before the new bundle loads.

        [HttpPost("Submit/Post")]
        [HttpPost("Submit")]
        [AllowAnonymous]
        public async Task<IActionResult> Submit([FromBody] SubmitRequest request)
        {
            if (request.FormId <= 0 || request.Data == null)
                return BadRequest(new SubmitResponse { Success = false, Error = "formId and data required" });

            // [SubmitJsonElementFix v20260508-01] ASP.NET Core's System.Text.Json
            // deserialises Dictionary<string, object> values as JsonElement structs.
            // When the processor later writes DataJson via Newtonsoft.Json, it
            // serializes JsonElement's only public property ("ValueKind"), giving
            // useless rows like {"firstName":{"ValueKind":3}, ...}. Normalise here
            // so the processor sees plain CLR types (string/long/double/bool/list/dict).
            request.Data = NormalizeJsonElementDict(request.Data);

            string ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            string ua = Request.Headers["User-Agent"].ToString();
            var currentUserId = User.Identity?.IsAuthenticated == true ? ParseClaimsUserId(User) : -1;
            int? userId = currentUserId > 0 ? currentUserId : (int?)null;

            var result = await _processor.ProcessAsync(
                request.FormId, request.Data, ip, ua, userId, request.SubmissionTime);

            if (result.Success)
            {
                _logger.Log(LogLevel.Information, this, LogFunction.Create,
                    "MegaForm Submission Created {SubmissionId}", result.SubmissionId);

                // Optional: also INSERT into a custom database if FormSettings.DatabaseInsert is enabled.
                // Fail-soft — log error but never fail the submission.
                // Badge: FormDatabaseInsert v20260430-01
                try
                {
                    var form = _formRepo.GetForm(request.FormId);
                    if (form != null)
                    {
                        var resolved = MegaForm.Core.Rendering.RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson);
                        var settings = resolved?.Schema?.Settings;
                        if (settings?.DatabaseInsert != null && settings.DatabaseInsert.Enabled)
                        {
                            var insertSvc = new MegaForm.Core.Services.FormDatabaseInsertService(_connectionRegistry);
                            var insertResult = insertSvc.Execute(settings, request.Data);
                            if (insertResult.Executed && !insertResult.Success)
                            {
                                _logger.Log(LogLevel.Warning, this, LogFunction.Other,
                                    "MegaForm DatabaseInsert failed for form {FormId}: {Error}", request.FormId, insertResult.Error);
                            }
                        }
                    }
                }
                catch (Exception dbEx)
                {
                    _logger.Log(LogLevel.Warning, this, LogFunction.Other,
                        "MegaForm DatabaseInsert exception for form {FormId}: {Message}", request.FormId, dbEx.Message);
                }

                // [SDK Files A v20260616] Record uploaded files in MF_Files so the SDK Files
                // API (IMegaFormClient.Files.GetBySubmission) returns them. Upload happens
                // before the submission exists, so the row is created here from the File field
                // metadata. Fail-soft — never fails the submission (Oqtane-isolated).
                PersistSubmissionFilesFailSoft(request.FormId, result.SubmissionId, request.Data);

                return Ok(new SubmitResponse
                {
                    Success = true,
                    SubmissionId = result.SubmissionId,
                    SuccessMessage = result.SuccessMessage,
                    RedirectUrl = result.RedirectUrl
                });
            }
            // [OQSubmitFieldErrors v20260502-01] Forward the per-field error
            // map so the renderer can highlight specific fields instead of just
            // showing "Validation failed." with no information.
            return BadRequest(new SubmitResponse
            {
                Success = false,
                Error = result.ErrorMessage,
                ValidationErrors = result.ValidationErrors,
            });
        }

        [HttpPost("Upload/File")]
        [AllowAnonymous]
        public async Task<IActionResult> UploadFile(IFormFile file, [FromForm] int formId, [FromForm] string fieldKey)
        {
            _ = PdfFormUploadOqtaneBadge;
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "No file provided" });
            if (formId <= 0 || string.IsNullOrWhiteSpace(fieldKey))
                return BadRequest(new { error = "formId and fieldKey are required" });

            var form = _formRepo.GetForm(formId);
            if (form == null) // [B267] draft/published gate removed — allow uploads for any existing form
                return NotFound(new { error = "Form not found" });
            if (form.RequireAuth && !(User?.Identity?.IsAuthenticated ?? false))
                return Unauthorized(new { error = "Authentication required for uploads" });

            FormSchema schema = null;
            try { schema = string.IsNullOrWhiteSpace(form.SchemaJson) ? null : JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson); }
            catch { }

            var uploadField = MegaFormUtils.FlattenFields(schema?.Fields ?? new List<FormField>())
                .FirstOrDefault(f => f != null
                    && string.Equals(f.Key, fieldKey, StringComparison.OrdinalIgnoreCase)
                    && (string.Equals(f.Type, "File", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(f.Type, "PdfForm", StringComparison.OrdinalIgnoreCase)));
            if (uploadField == null)
                return BadRequest(new { error = "Invalid file field" });

            var isPdfFormField = string.Equals(uploadField.Type, "PdfForm", StringComparison.OrdinalIgnoreCase);
            var uploadPolicy = GetUploadPolicy(ResolvePortalId(formId));
            var originalName = Path.GetFileName(file.FileName ?? string.Empty);
            var ext = (Path.GetExtension(originalName) ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(ext))
                return BadRequest(new { error = "File type is required" });

            var fieldAllowed = isPdfFormField
                ? FileUploadSecurityService.ParseExtensions(new[] { ".pdf" })
                : FileUploadSecurityService.ParseExtensions(uploadField.FileSettings != null ? uploadField.FileSettings.AllowedExtensions : null);
            var globalAllowed = FileUploadSecurityService.ParseExtensions(uploadPolicy.AllowedExtensionsCsv);
            var globalBlocked = FileUploadSecurityService.ParseExtensions(uploadPolicy.BlockedExtensionsCsv);
            if (globalBlocked.Contains(ext))
                return BadRequest(new { error = "This file type is blocked by system policy" });

            var effectiveAllowed = fieldAllowed.Count > 0
                ? new HashSet<string>(fieldAllowed.Where(x => globalAllowed.Count == 0 || globalAllowed.Contains(x)), StringComparer.OrdinalIgnoreCase)
                : new HashSet<string>(globalAllowed, StringComparer.OrdinalIgnoreCase);
            if (effectiveAllowed.Count > 0 && !effectiveAllowed.Contains(ext))
                return BadRequest(new { error = "File type not allowed. Accepted: " + string.Join(", ", effectiveAllowed.OrderBy(x => x)) });

            var fieldMaxMb = isPdfFormField
                ? uploadPolicy.MaxSizeMb
                : (uploadField.FileSettings != null ? uploadField.FileSettings.MaxSizeMB : uploadPolicy.MaxSizeMb);
            var maxSizeMb = Math.Max(1, Math.Min(uploadPolicy.MaxSizeMb, fieldMaxMb));
            var maxBytes = (long)maxSizeMb * 1024L * 1024L;
            if (file.Length > maxBytes)
                return BadRequest(new { error = $"File too large (max {maxSizeMb}MB)" });

            using (var validationStream = file.OpenReadStream())
            {
                if (!FileUploadSecurityService.ValidateContentByExtension(validationStream, ext))
                    return BadRequest(new { error = "File content does not match its type. Possible security risk." });
            }

            var appDataRoot = Path.Combine(_env.ContentRootPath ?? AppDomain.CurrentDomain.BaseDirectory, "App_Data", "MegaForm", "PrivateUploads");
            var safeFieldKey = FileUploadSecurityService.SanitizePathSegment(uploadField.Key ?? fieldKey, "file");
            var folder = Path.Combine(appDataRoot, "form-" + formId, "field-" + safeFieldKey);
            if (!Directory.Exists(folder)) Directory.CreateDirectory(folder);

            var safeName = Guid.NewGuid().ToString("N").Substring(0, 16) + ext;
            var filePath = Path.Combine(folder, safeName);
            using (var source = file.OpenReadStream())
            using (var target = new FileStream(filePath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                await source.CopyToAsync(target);
            }

            var relativePath = "form-" + formId + "/field-" + safeFieldKey + "/" + safeName;
            return Ok(new
            {
                fileId = 0,
                fileName = originalName,
                fileSize = file.Length,
                contentType = file.ContentType ?? "application/octet-stream",
                fileUrl = "/api/MegaForm/Files/Download?path=" + Uri.EscapeDataString(relativePath),
                tempPath = relativePath,
                storedIn = "private"
            });
        }

        // ════════════════════════════════════════════════════════════
        //  IMAGE UPLOAD + GALLERY (HTML Token Designer) — [oq-imgupload v20260618-01]
        //  Ported from the DNN UploadController (Image/List). These routes
        //  existed ONLY on DNN, so on Oqtane the Token Designer's "Upload"
        //  POSTed Upload/Image → 400 and "Gallery" GET Upload/List → 404.
        //  Images are PUBLIC (referenced in custom HTML), so they go under
        //  wwwroot/Modules/MegaForm/Images/{yyyy-MM}/ (served by static-files
        //  middleware, like PdfForm/UploadTemplate). Response uses `url`
        //  (lowercase) to match the shared JS (token-designer.ts → j.url).
        //    POST /Upload/Image  (multipart: file)   → { url, fileName, size, type }
        //    GET  /Upload/List                        → { items: [{ url, fileName, size, modified }] }
        // ════════════════════════════════════════════════════════════
        private static readonly HashSet<string> _imageUploadExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp" };

        private string ImagesPublicRoot()
        {
            var webRoot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath ?? AppDomain.CurrentDomain.BaseDirectory, "wwwroot");
            return Path.Combine(webRoot, "Modules", "MegaForm", "Images");
        }

        [HttpPost("Upload/Image")]
        [Authorize]
        public async Task<IActionResult> UploadImage(IFormFile file)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "No file uploaded" });

            var originalName = Path.GetFileName(file.FileName ?? string.Empty);
            var ext = (Path.GetExtension(originalName) ?? string.Empty).Trim().ToLowerInvariant();
            if (!_imageUploadExtensions.Contains(ext))
                return BadRequest(new { error = "File type not allowed. Accepted: JPEG, PNG, GIF, WebP, SVG, BMP." });

            const long MaxBytes = 5L * 1024L * 1024L;
            if (file.Length > MaxBytes)
                return BadRequest(new { error = "Image must be under 5 MB." });

            using (var validationStream = file.OpenReadStream())
            {
                if (!FileUploadSecurityService.ValidateContentByExtension(validationStream, ext))
                    return BadRequest(new { error = "File content does not match its type. Possible security risk." });
            }

            try
            {
                var monthFolder = DateTime.UtcNow.ToString("yyyy-MM");
                var folder = Path.Combine(ImagesPublicRoot(), monthFolder);
                if (!Directory.Exists(folder)) Directory.CreateDirectory(folder);

                var safeName = Guid.NewGuid().ToString("N").Substring(0, 12) + ext;
                var filePath = Path.Combine(folder, safeName);
                using (var source = file.OpenReadStream())
                using (var target = new FileStream(filePath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    await source.CopyToAsync(target);
                }

                var url = "/Modules/MegaForm/Images/" + monthFolder + "/" + safeName;
                return Ok(new
                {
                    url = url,
                    fileName = safeName,
                    size = file.Length,
                    type = file.ContentType ?? "application/octet-stream"
                });
            }
            catch (System.Exception ex)
            {
                return StatusCode(500, new { error = "Upload failed: " + ex.Message });
            }
        }

        [HttpGet("Upload/List")]
        [Authorize]
        public IActionResult UploadImageList()
        {
            if (!CanUseAdminPopup()) return Forbid();
            try
            {
                var webRoot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath ?? AppDomain.CurrentDomain.BaseDirectory, "wwwroot");
                var root = ImagesPublicRoot();
                var items = new List<object>();
                if (Directory.Exists(root))
                {
                    var files = Directory.EnumerateFiles(root, "*.*", SearchOption.AllDirectories)
                        .Where(p => _imageUploadExtensions.Contains(Path.GetExtension(p) ?? string.Empty))
                        .Select(p => new System.IO.FileInfo(p))
                        .OrderByDescending(fi => fi.LastWriteTimeUtc)
                        .Take(500);
                    foreach (var fi in files)
                    {
                        var rel = fi.FullName.Substring(webRoot.Length).Replace('\\', '/').TrimStart('/');
                        items.Add(new
                        {
                            url = "/" + rel,
                            fileName = fi.Name,
                            size = fi.Length,
                            modified = fi.LastWriteTimeUtc.ToString("o")
                        });
                    }
                }
                return JsonOk(new { items });
            }
            catch (System.Exception ex)
            {
                return StatusCode(500, new { error = "Gallery list failed: " + ex.Message });
            }
        }

        // ================================================================
        // PDF FORM TEMPLATES — Admin uploads a PDF used as the background of a
        // PdfForm widget. Stored in wwwroot/Modules/MegaForm/PdfTemplates so
        // the static-files middleware serves it directly. Returns the public
        // URL for the Builder to save into widgetProps.pdfUrl.
        //
        // POST api/MegaForm/PdfForm/UploadTemplate  (multipart: file)
        // Auth: Admin role
        // ================================================================
        [HttpPost("PdfForm/UploadTemplate")]
        [Authorize(Roles = "Administrators")]
        public async Task<IActionResult> UploadPdfTemplate(IFormFile file)
        {
            const string AdminBadge = "PdfFormAdminUploadOqtane v20260506-01";
            _ = AdminBadge;

            if (file == null || file.Length == 0)
                return BadRequest(new { error = "No file uploaded" });

            var originalName = Path.GetFileName(file.FileName ?? string.Empty);
            var ext = (Path.GetExtension(originalName) ?? string.Empty).Trim().ToLowerInvariant();
            if (!string.Equals(ext, ".pdf", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { error = "Only .pdf files are accepted" });

            const long MaxBytes = 50L * 1024L * 1024L;
            if (file.Length > MaxBytes)
                return BadRequest(new { error = "PDF too large (max 50 MB)" });

            // Validate magic bytes
            using (var s = file.OpenReadStream())
            {
                var head = new byte[5];
                var read = s.Read(head, 0, 5);
                if (read < 5 || head[0] != 0x25 || head[1] != 0x50 || head[2] != 0x44 || head[3] != 0x46 || head[4] != 0x2D)
                    return BadRequest(new { error = "File is not a valid PDF (missing %PDF- header)" });
            }

            var publicRoot = Path.Combine(_env.WebRootPath ?? Path.Combine(_env.ContentRootPath ?? AppDomain.CurrentDomain.BaseDirectory, "wwwroot"),
                                          "Modules", "MegaForm", "PdfTemplates");
            if (!Directory.Exists(publicRoot)) Directory.CreateDirectory(publicRoot);

            var slug = SlugifyName(Path.GetFileNameWithoutExtension(originalName));
            if (slug.Length > 60) slug = slug.Substring(0, 60);
            var shortId = Guid.NewGuid().ToString("N").Substring(0, 8);
            var safeName = (string.IsNullOrEmpty(slug) ? "pdf" : slug) + "-" + shortId + ".pdf";
            var filePath = Path.Combine(publicRoot, safeName);

            using (var source = file.OpenReadStream())
            using (var target = new FileStream(filePath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                await source.CopyToAsync(target);
            }

            var publicUrl = "/Modules/MegaForm/PdfTemplates/" + safeName;
            return Ok(new
            {
                fileName = originalName,
                fileSize = file.Length,
                fileUrl  = publicUrl,
                storedIn = "modules-public"
            });
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

        [HttpGet("Files/Download")]
        [Authorize]
        public IActionResult DownloadFile([FromQuery] string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return NotFound();

            var safePath = path.Replace("..", string.Empty).TrimStart('/', '\\').Replace('/', Path.DirectorySeparatorChar);
            var appDataRoot = Path.Combine(_env.ContentRootPath ?? AppDomain.CurrentDomain.BaseDirectory, "App_Data", "MegaForm", "PrivateUploads");
            var fullPath = Path.Combine(appDataRoot, safePath);
            if (!fullPath.StartsWith(appDataRoot, StringComparison.OrdinalIgnoreCase) || !System.IO.File.Exists(fullPath))
                return NotFound();

            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(fullPath, out var contentType))
                contentType = "application/octet-stream";

            return PhysicalFile(fullPath, contentType, Path.GetFileName(fullPath));
        }

        // [OQSavePublishDuplicate v20260502-01] Helper used by SaveForm to read
        // an int that may arrive as either PascalCase or camelCase. Returns the
        // first key whose value is non-zero (or 0 if both missing). Replaces
        // the broken "Pascal + camel" addition that produced doubles like 88
        // when both casings were present, which broke UPDATE → caused INSERT.
        private static int ReadIntCoalesced(JObject body, string pascal, string camel)
        {
            int p = body.Value<int?>(pascal) ?? 0;
            if (p != 0) return p;
            return body.Value<int?>(camel) ?? 0;
        }

        private static bool IsSubmissionAdmin(UserContext actor)
        {
            return actor != null && (actor.IsAdmin || actor.IsSuperUser);
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

        private bool HasExplicitSubmissionViewRule(int formId)
        {
            var rules = PermissionCatalogService.NormalizeRules(formId, _phase2Repo.GetFormPermissions(formId));
            return rules.Any(rule =>
            {
                var permissionType = PermissionCatalogService.NormalizePermissionType(rule.PermissionType);
                return string.Equals(permissionType, "view", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(permissionType, "manage", StringComparison.OrdinalIgnoreCase);
            });
        }

        private bool CanUseSubmissionManagement(int formId, UserContext actor, PermissionService permissions)
        {
            if (IsSubmissionAdmin(actor)) return true;
            if (actor == null || !actor.IsAuthenticated) return false;
            if (!HasExplicitSubmissionViewRule(formId)) return false;
            return permissions.CanView(formId, actor);
        }

        private bool CanViewSubmissionRow(int formId, SubmissionInfo submission, UserContext actor, PermissionService permissions)
        {
            if (IsSubmissionAdmin(actor)) return true;
            if (actor == null || !actor.IsAuthenticated) return false;
            if (!HasExplicitSubmissionViewRule(formId)) return false;
            return permissions.CanView(formId, actor) && permissions.CanViewSubmission(formId, submission, actor);
        }

        // ══════════════════════════════════════════════════════
        //  SUBMISSIONS (admin)
        // ══════════════════════════════════════════════════════

        [HttpGet("Submissions")]
        [AllowAnonymous]
        public IActionResult ListSubmissions(int formId, string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null, int pageIndex = 0, int page = -1, int pageSize = 25, string queryKey = null)
        {
            if (page >= 0 && pageIndex == 0) pageIndex = page;
            if (formId <= 0) return BadRequest(new { error = "formId is required" });
            var actor = GetCurrentUserContextWithRoles();
            var permissions = new PermissionService(_phase2Repo);
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound();
            var isPublicListView = string.Equals(form.Status, "Published", StringComparison.OrdinalIgnoreCase)
                && IsPublicSubmissionQueryKey(queryKey);
            if (!isPublicListView && !CanUseSubmissionManagement(formId, actor, permissions))
                return StatusCode(403, new { error = "You do not have permission to view submissions for this form." });
            if (!IsSubmissionAdmin(actor) && (pageSize <= 0 || pageSize > 100))
                pageSize = 100;

            var query = new SubmissionListQuery
            {
                FormId = formId,
                Status = status,
                Search = search,
                DateFrom = dateFrom,
                DateTo = dateTo,
                PageIndex = pageIndex,
                PageSize = pageSize
            };
            var result = ListSubmissionsWithBinding(query, queryKey, actor);
            var resultItems = result.Items ?? new List<SubmissionListItem>();

            // [Fix #7 v20260619] Decide the blanket view decision ONCE, before the loop — instead of
            // running CanViewSubmissionRow (which re-loads the form's permission rules per row) on
            // every item AFTER pagination and then reporting TotalCount = visibleItems.Count (only the
            // current page → a wrong pager total). hasExplicitRule is computed a single time here and
            // mirrors HasExplicitSubmissionViewRule's own per-form rule load.
            bool isAdmin = IsSubmissionAdmin(actor);
            bool hasExplicitRule = HasExplicitSubmissionViewRule(formId);

            // Genuine per-row RLS is required ONLY for a non-admin, non-public actor on a form that
            // carries an explicit view/manage rule. Everyone else (public list view, admins, and the
            // "passed CanUseSubmissionManagement with no explicit rule" path) gets a blanket grant, so
            // we keep the whole page AND report the true SQL TotalCount. Note: a non-admin/non-public
            // actor can only reach this point if it already passed CanUseSubmissionManagement above,
            // which itself requires hasExplicitRule — so the default stays "filter unless permitted".
            bool applyPerRowFilter = !isPublicListView && !isAdmin && hasExplicitRule;

            var visibleItems = applyPerRowFilter
                ? resultItems.Where(item => CanViewSubmissionRow(formId, new SubmissionInfo
                {
                    SubmissionId = item.SubmissionId,
                    FormId = item.FormId,
                    UserId = item.UserId,
                    Status = item.Status
                }, actor, permissions)).ToList()
                : resultItems.ToList();
            var openTasksBySubmission = BuildOpenWorkflowTaskLookup(formId, visibleItems.Select(item => item.SubmissionId));
            return JsonOk(new SubmissionPagedResult<SubmissionDto>
            {
                Items = visibleItems.Select(x => ToSubmissionDto(
                    x,
                    BuildAvailableSubmissionActions(
                        formId,
                        new SubmissionInfo
                        {
                            SubmissionId = x.SubmissionId,
                            FormId = x.FormId,
                            UserId = x.UserId,
                            Status = x.Status,
                            DataJson = x.DataJson,
                            SubmittedOnUtc = x.SubmittedOnUtc,
                            IpAddress = x.IpAddress,
                            IsSpam = x.IsSpam
                        },
                        actor,
                        permissions,
                        openTasksBySubmission.TryGetValue(x.SubmissionId, out var openTasks) ? openTasks : null))
                    ).ToList(),
                // [Fix #7 v20260619] Common path (public list view + admins + management-permitted
                // with no per-row RLS) now reports the TRUE SQL TotalCount so the pager is correct.
                // Only when genuine per-row RLS filtering is active do we fall back to the visible
                // count (acceptable for the RLS case — the true total is intentionally not exposed).
                TotalCount = applyPerRowFilter ? visibleItems.Count : result.TotalCount,
                PageIndex = result.PageIndex,
                PageSize = result.PageSize
            });
        }

        private SubmissionPagedResult<SubmissionListItem> ListSubmissionsWithBinding(SubmissionListQuery query, string queryKey, UserContext actor)
        {
            if (query == null)
                query = new SubmissionListQuery();

            if (string.IsNullOrWhiteSpace(queryKey) || query.FormId <= 0)
                return _submissionQueries.List(query);

            var form = _formRepo.GetForm(query.FormId);
            var validation = CreateAppQueryRegistryService().ValidateBinding(ResolvePortalId(query.FormId), form, queryKey);
            if (!validation.IsValid || validation.Query == null)
            {
                return new SubmissionPagedResult<SubmissionListItem>
                {
                    Items = new List<SubmissionListItem>(),
                    TotalCount = 0,
                    PageIndex = Math.Max(0, query.PageIndex),
                    PageSize = query.PageSize > 0 ? query.PageSize : 25
                };
            }

            var definition = ParseObject(validation.Query.DefinitionJson);
            var queryStatus = ReadJsonString(definition, "status", "Status");
            var fieldKey = ReadJsonString(definition, "field", "Field");
            var source = ReadJsonString(definition, "source", "Source");
            var rawValue = ReadJsonString(definition, "value", "Value");
            var expectedValue = ResolveBoundQueryExpectedValue(source, rawValue, actor);
            var requiresFieldFilter = !string.IsNullOrWhiteSpace(fieldKey) && !string.IsNullOrWhiteSpace(expectedValue);

            var fetchQuery = new SubmissionListQuery
            {
                FormId = query.FormId,
                Status = !string.IsNullOrWhiteSpace(query.Status) ? query.Status : queryStatus,
                Search = query.Search,
                DateFrom = query.DateFrom,
                DateTo = query.DateTo,
                PageIndex = 0,
                PageSize = 5000
            };

            var loaded = _submissionQueries.List(fetchQuery);
            var filtered = loaded.Items ?? new List<SubmissionListItem>();

            if (!string.IsNullOrWhiteSpace(queryStatus))
            {
                filtered = filtered
                    .Where(item => string.Equals(item?.Status ?? string.Empty, queryStatus, StringComparison.OrdinalIgnoreCase))
                    .ToList();
            }

            if (requiresFieldFilter)
            {
                filtered = filtered
                    .Where(item => MatchesSubmissionField(item, fieldKey, expectedValue))
                    .ToList();
            }

            filtered = ApplyConfiguredAppListViewQuery(filtered, queryKey);

            var totalCount = filtered.Count;
            var pageSizeValue = query.PageSize > 0 ? query.PageSize : 25;
            var safePageIndex = Math.Max(0, query.PageIndex);
            var pageItems = filtered
                .Skip(safePageIndex * pageSizeValue)
                .Take(pageSizeValue)
                .ToList();

            return new SubmissionPagedResult<SubmissionListItem>
            {
                Items = pageItems,
                TotalCount = totalCount,
                PageIndex = safePageIndex,
                PageSize = pageSizeValue
            };
        }

        private static List<SubmissionListItem> ApplyConfiguredAppListViewQuery(IEnumerable<SubmissionListItem> source, string queryKey)
        {
            var rows = (source ?? Enumerable.Empty<SubmissionListItem>()).ToList();
            var key = (queryKey ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(key))
                return rows;

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

            return (ordered ?? rows.Where(predicate).OrderByDescending(item => item.SubmittedOnUtc)).ToList();
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
            return ParseObject(item.DataJson);
        }

        private static string JsonString(SubmissionListItem item, string field)
        {
            var token = SubmissionData(item)[field];
            var value = token == null ? string.Empty : token.ToString();
            if (string.IsNullOrWhiteSpace(value) && string.Equals(field, "status", StringComparison.OrdinalIgnoreCase))
                return item?.Status ?? string.Empty;
            return value ?? string.Empty;
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

        private static string ReadJsonString(JObject obj, string camel, string pascal = null)
        {
            var token = obj?[camel];
            if (token == null && !string.IsNullOrWhiteSpace(pascal))
                token = obj?[pascal];
            return token == null
                ? string.Empty
                : (token.Type == JTokenType.String ? (token.Value<string>() ?? string.Empty) : token.ToString(Newtonsoft.Json.Formatting.None));
        }

        private static string ResolveBoundQueryExpectedValue(string source, string rawValue, UserContext actor)
        {
            var normalized = (source ?? string.Empty).Trim().ToLowerInvariant();
            if (normalized == "currentuser.email" || normalized == "currentuser:email")
                return actor?.Email ?? string.Empty;
            if (normalized == "currentuser.username" || normalized == "currentuser:username" || normalized == "currentuser.userName")
                return actor?.UserName ?? string.Empty;
            if (normalized == "currentuser.userid" || normalized == "currentuser:userid" || normalized == "currentuser.userId")
                return actor != null && actor.UserId > 0 ? actor.UserId.ToString() : string.Empty;
            if (normalized == "currentuser.displayname" || normalized == "currentuser:displayname" || normalized == "currentuser.displayName")
                return actor?.DisplayName ?? string.Empty;
            return rawValue ?? string.Empty;
        }

        private static bool MatchesSubmissionField(SubmissionListItem item, string fieldKey, string expectedValue)
        {
            if (item == null || string.IsNullOrWhiteSpace(fieldKey) || string.IsNullOrWhiteSpace(expectedValue))
                return false;

            var data = ParseObject(item.DataJson);
            if (data == null || !data.Properties().Any())
                return false;

            var match = data.Properties().FirstOrDefault(prop => string.Equals(prop.Name, fieldKey, StringComparison.OrdinalIgnoreCase));
            if (match == null || match.Value == null)
                return false;

            var actual = match.Value.Type == JTokenType.String
                ? match.Value.Value<string>()
                : match.Value.ToString(Newtonsoft.Json.Formatting.None);
            return string.Equals((actual ?? string.Empty).Trim(), expectedValue.Trim(), StringComparison.OrdinalIgnoreCase);
        }

        [HttpGet("Submissions/{submissionId}")]
        [AllowAnonymous]
        public IActionResult GetSubmission(int submissionId)
        {
            var detail = _submissionQueries.GetDetail(submissionId);
            if (detail == null) return NotFound();
            var actor = GetCurrentUserContextWithRoles();
            var permissions = new PermissionService(_phase2Repo);
            var formId = detail.Form != null ? detail.Form.FormId : (detail.Submission != null ? detail.Submission.FormId : 0);
            if (formId <= 0 || !CanViewSubmissionRow(formId, detail.Submission, actor, permissions))
                return StatusCode(403, new { error = "You do not have permission to view this submission." });
            detail.WorkflowDetail = new SubmissionWorkflowDetailService().GetDetail(detail);
            var openTasksBySubmission = BuildOpenWorkflowTaskLookup(formId, new[] { detail.Submission.SubmissionId });
            var availableActions = BuildAvailableSubmissionActions(
                formId,
                detail.Submission,
                actor,
                permissions,
                openTasksBySubmission.TryGetValue(detail.Submission.SubmissionId, out var openTasks) ? openTasks : null);
            // [SubmissionDetailData v20260518-10] `values` is FlattenedValues (label/value list).
            // Detail-shell Data tab keys by field KEY → also return parsed `data` dict.
            Dictionary<string, object> parsedData = null;
            try
            {
                if (!string.IsNullOrWhiteSpace(detail.Submission?.DataJson))
                    parsedData = JsonConvert.DeserializeObject<Dictionary<string, object>>(detail.Submission.DataJson);
            }
            catch { }

            return Ok(new
            {
                submission = ToSubmissionDto(detail.Submission, availableActions),
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

        [HttpPost("Submissions/{submissionId}/Status")]
        [Authorize(Policy = "EditModule")]
        public IActionResult UpdateSubmissionStatus(int submissionId, [FromBody] JsonElement body)
        {
            string status = body.TryGetProperty("status", out var s) ? s.GetString() : null;
            if (string.IsNullOrWhiteSpace(status)) return BadRequest(new { error = "status is required" });
            _subRepo.UpdateStatus(submissionId, status);
            return Ok(new { success = true });
        }

        [HttpPost("Submissions/UpdateData")]
        [Authorize(Policy = "EditModule")]
        public IActionResult UpdateSubmissionData([FromQuery] int submissionId, [FromBody] Dictionary<string, object> data)
        {
            if (submissionId <= 0) return BadRequest(new { error = "submissionId is required" });
            _subRepo.UpdateData(submissionId, System.Text.Json.JsonSerializer.Serialize(data ?? new Dictionary<string, object>()));
            return Ok(new { success = true });
        }

        [HttpGet("Submissions/Export")]
        [Authorize(Policy = "ViewModule")]
        public IActionResult ExportSubmissions(int formId, string format = "json")
        {
            var result = _submissionQueries.List(new SubmissionListQuery { FormId = formId, PageIndex = 0, PageSize = 10000 });
            if (string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
            {
                var lines = new List<string> { "SubmissionId,SubmittedOnUtc,Status,IpAddress,Summary" };
                foreach (var item in result.Items)
                {
                    lines.Add(string.Join(",", new[] {
                        Csv(item.SubmissionId.ToString()),
                        Csv(item.SubmittedOnUtc.ToString("yyyy-MM-dd HH:mm:ss")),
                        Csv(item.Status ?? ""),
                        Csv(item.IpAddress ?? ""),
                        Csv(item.SummaryText ?? "")
                    }));
                }
                var csv = string.Join("\n", lines);
                return File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv", $"submissions-form{formId}-{DateTime.UtcNow:yyyyMMdd}.csv");
            }

            var json = System.Text.Json.JsonSerializer.Serialize(result.Items, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
            return File(System.Text.Encoding.UTF8.GetBytes(json), "application/json", $"submissions-form{formId}-{DateTime.UtcNow:yyyyMMdd}.json");
        }

        [HttpDelete("Submissions/{submissionId}")]
        [Authorize(Policy = "EditModule")]
        public IActionResult DeleteSubmission(int submissionId)
        {
            _subRepo.Delete(submissionId);
            _logger.Log(LogLevel.Information, this, LogFunction.Delete,
                "MegaForm Submission Deleted {SubmissionId}", submissionId);
            return Ok();
        }



        // ══════════════════════════════════════════════════════
        //  WORKFLOW (admin / builder)
        // ══════════════════════════════════════════════════════

        [HttpGet("Form/Workflow/Get")]
        [Authorize(Policy = "ViewModule")]
        public IActionResult GetWorkflow([FromQuery] int formId)
        {
            if (formId <= 0) return BadRequest(new { error = "formId is required." });
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound(new { error = "Form not found." });

            var env = WorkflowEnvelope.ParseOrMigrate(form.WorkflowJson);
            return Ok(new
            {
                formId,
                hasWorkflow = env.DraftWorkflow != null || env.AppliedWorkflow != null,
                workflow = env.DraftWorkflow ?? env.AppliedWorkflow,
                appliedWorkflow = env.AppliedWorkflow,
                draftUpdatedAt = env.DraftUpdatedAt,
                appliedAt = env.AppliedAt,
                appliedBy = env.AppliedBy,
                draftVersion = env.DraftVersion,
                appliedVersion = env.AppliedVersion
            });
        }


        [HttpGet("Form/Workflow/NodeSchema")]
        public IActionResult GetWorkflowNodeSchema([FromQuery] string nodeType)
        {
            if (string.IsNullOrWhiteSpace(nodeType)) return BadRequest(new { error = "nodeType is required." });
            var schema = new WorkflowNodeUiSchemaProvider().GetSchema(nodeType);
            if (schema == null) return NotFound(new { error = "Schema not found for nodeType='" + nodeType + "'." });
            return Ok(schema);
        }

        [HttpGet("Form/Workflow/Webhook/Presets")]
        public IActionResult GetWorkflowWebhookPresets()
        {
            var schema = new WorkflowNodeUiSchemaProvider().GetSchema("Webhook");
            return Ok(schema != null && schema.Presets != null ? schema.Presets : new List<WorkflowNodeUiPreset>());
        }

        [HttpGet("Form/Workflow/Email/Presets")]
        public IActionResult GetWorkflowEmailPresets()
        {
            var schema = new WorkflowNodeUiSchemaProvider().GetSchema("SendEmail");
            return Ok(schema != null && schema.Presets != null ? schema.Presets : new List<WorkflowNodeUiPreset>());
        }

        [HttpPost("Form/Workflow/SaveDraft")]
        [Authorize(Policy = "EditModule")]
        public IActionResult SaveDraftWorkflow([FromBody] WorkflowSaveRequest req)
        {
            if (req == null || req.FormId <= 0) return BadRequest(new { error = "formId is required." });
            if (req.Workflow.ValueKind == JsonValueKind.Undefined || req.Workflow.ValueKind == JsonValueKind.Null)
                return BadRequest(new { error = "workflow is required." });

            WorkflowDefinition def;
            try { def = JsonConvert.DeserializeObject<WorkflowDefinition>(req.Workflow.GetRawText()); }
            catch (Exception ex)
            {
                return UnprocessableEntity(BuildWorkflowResult(false, "draft-blocked", null, null,
                    new List<WorkflowIssue> { new WorkflowIssue { Id = "parse", Severity = "error", Source = "save-draft", Message = "Invalid workflow JSON: " + ex.Message } }));
            }

            var validation = new WorkflowEvaluator().ValidateDefinition(def, ValidationMode.Draft);
            var issues = validation.Errors.Select(e => WorkflowIssue.FromValidationError(e, "save-draft")).ToList();
            if (issues.Any(i => i.Severity == "error"))
                return UnprocessableEntity(BuildWorkflowResult(false, "draft-blocked", def, null, issues));

            var form = _formRepo.GetForm(req.FormId);
            if (form == null) return NotFound(new { error = "Form not found." });

            var env = WorkflowEnvelope.ParseOrMigrate(form.WorkflowJson);
            env.DraftWorkflow = def;
            env.DraftUpdatedAt = DateTime.UtcNow;
            env.DraftVersion = NextDraftVersion(env.AppliedVersion, env.DraftVersion);
            if (env.AppliedWorkflow == null)
            {
                env.AppliedWorkflow = def;
                env.AppliedAt = def.UpdatedAt != default(DateTime) ? def.UpdatedAt : DateTime.UtcNow;
                env.AppliedBy = string.IsNullOrWhiteSpace(env.AppliedBy) ? "migrated" : env.AppliedBy;
                env.AppliedVersion = string.IsNullOrWhiteSpace(env.AppliedVersion) ? StripDraftSuffix(env.DraftVersion) : env.AppliedVersion;
            }
            form.WorkflowJson = JsonConvert.SerializeObject(env);
            _formRepo.SaveForm(form);
            return Ok(BuildWorkflowResult(true, "draft-saved", def, env, issues));
        }

        [HttpPost("Form/Workflow/Validate")]
        [Authorize(Policy = "EditModule")]
        public IActionResult ValidateWorkflow([FromBody] WorkflowSaveRequest req)
        {
            if (req == null) return BadRequest(new { error = "workflow is required." });
            if (req.Workflow.ValueKind == JsonValueKind.Undefined || req.Workflow.ValueKind == JsonValueKind.Null)
                return BadRequest(new { error = "workflow is required." });

            WorkflowDefinition def;
            try { def = JsonConvert.DeserializeObject<WorkflowDefinition>(req.Workflow.GetRawText()); }
            catch (Exception ex)
            {
                return UnprocessableEntity(BuildWorkflowResult(false, "validated", null, null,
                    new List<WorkflowIssue> { new WorkflowIssue { Id = "parse", Severity = "error", Source = "validate", Message = "Invalid workflow JSON: " + ex.Message } }));
            }

            var validation = new WorkflowEvaluator().ValidateDefinition(def, ValidationMode.Apply);
            var issues = validation.Errors.Select(e => WorkflowIssue.FromValidationError(e, "validate")).ToList();
            var env = req.FormId > 0 ? WorkflowEnvelope.ParseOrMigrate(_formRepo.GetForm(req.FormId)?.WorkflowJson) : null;
            return Ok(BuildWorkflowResult(!issues.Any(i => i.Severity == "error"), "validated", def, env, issues));
        }

        [HttpPost("Form/Workflow/Apply")]
        [Authorize(Policy = "EditModule")]
        public IActionResult ApplyWorkflow([FromBody] WorkflowSaveRequest req)
        {
            if (req == null || req.FormId <= 0) return BadRequest(new { error = "formId is required." });
            if (req.Workflow.ValueKind == JsonValueKind.Undefined || req.Workflow.ValueKind == JsonValueKind.Null)
                return BadRequest(new { error = "workflow is required." });

            WorkflowDefinition def;
            try { def = JsonConvert.DeserializeObject<WorkflowDefinition>(req.Workflow.GetRawText()); }
            catch (Exception ex)
            {
                return UnprocessableEntity(BuildWorkflowResult(false, "apply-blocked", null, null,
                    new List<WorkflowIssue> { new WorkflowIssue { Id = "parse", Severity = "error", Source = "apply", Message = "Invalid workflow JSON: " + ex.Message } }));
            }

            var validation = new WorkflowEvaluator().ValidateDefinition(def, ValidationMode.Apply);
            var issues = validation.Errors.Select(e => WorkflowIssue.FromValidationError(e, "apply")).ToList();
            if (issues.Any(i => i.Severity == "error"))
                return UnprocessableEntity(BuildWorkflowResult(false, "apply-blocked", def, null, issues));

            var form = _formRepo.GetForm(req.FormId);
            if (form == null) return NotFound(new { error = "Form not found." });

            var env = WorkflowEnvelope.ParseOrMigrate(form.WorkflowJson);
            env.DraftWorkflow = def;
            env.DraftUpdatedAt = DateTime.UtcNow;
            env.DraftVersion = NextDraftVersion(env.AppliedVersion, env.DraftVersion);
            env.AppliedWorkflow = def;
            env.AppliedAt = DateTime.UtcNow;
            env.AppliedBy = User?.Identity?.Name ?? "user";
            env.AppliedVersion = StripDraftSuffix(env.DraftVersion) ?? "1.0.0";
            form.WorkflowJson = JsonConvert.SerializeObject(env);
            _formRepo.SaveForm(form);
            return Ok(BuildWorkflowResult(true, "applied", def, env, issues));
        }

        [HttpPost("Form/Workflow/Save")]
        [Authorize(Policy = "EditModule")]
        public IActionResult SaveWorkflow([FromBody] WorkflowSaveRequest req)
        {
            return ApplyWorkflow(req);
        }

        [HttpPost("Form/Workflow/TestRun")]
        [Authorize(Policy = "EditModule")]
        public IActionResult TestRunWorkflow([FromBody] WorkflowTestRunRequest req)
        {
            if (req == null || req.FormId <= 0) return BadRequest(new { error = "formId is required." });
            return Ok(new
            {
                executionId = Guid.NewGuid().ToString("N"),
                status = "success",
                log = Array.Empty<object>(),
                variables = new { },
                nodeResults = new { },
                errorMessage = (string)null,
                durationMs = 0
            });
        }


        private static WorkflowSaveResult BuildWorkflowResult(bool success, string status, WorkflowDefinition def, WorkflowEnvelope env, List<WorkflowIssue> issues)
        {
            return new WorkflowSaveResult
            {
                Success = success,
                Status = status,
                WorkflowVersion = env != null ? env.DraftVersion : (def != null ? def.Version : null),
                ActiveVersion = env != null ? env.AppliedVersion : null,
                DraftUpdatedAt = env != null ? env.DraftUpdatedAt : (DateTime?)null,
                AppliedAt = env != null ? env.AppliedAt : (DateTime?)null,
                AppliedBy = env != null ? env.AppliedBy : null,
                Issues = issues ?? new List<WorkflowIssue>()
            };
        }

        private static string NextDraftVersion(string appliedVersion, string currentDraftVersion)
        {
            var baseVersion = StripDraftSuffix(currentDraftVersion) ?? StripDraftSuffix(appliedVersion) ?? "1.0.0";
            return baseVersion + "-draft";
        }

        private static string StripDraftSuffix(string version)
        {
            if (string.IsNullOrWhiteSpace(version)) return null;
            return version.EndsWith("-draft", StringComparison.OrdinalIgnoreCase)
                ? version.Substring(0, version.Length - 6)
                : version;
        }

        // ══════════════════════════════════════════════════════
        //  MODULE CONFIG — reads/writes Oqtane module + site settings
        // ══════════════════════════════════════════════════════

        [HttpGet("ModuleConfig/{moduleId}")]
        [Authorize]
        public IActionResult GetModuleConfig(int moduleId)
        {
            if (!CanUseAdminPopup()) return Forbid();
            var siteId = AuthEntityId(EntityNames.Site);
            // [ViewDesigner v20260503-04] When called from the cross-platform
            // settings popup via plain /api/MegaForm/... (no /{alias} prefix),
            // AuthEntityId can't resolve the site → siteId = -1 → forms list
            // ends up empty even though the user has admin rights. Accept a
            // ?siteId=NN query-string fallback so the popup can pass it from
            // SiteState and get the real form list. The Authorize policy on
            // moduleId still gates access; the query string only fills in
            // missing site context, it doesn't grant cross-site reads.
            if (siteId <= 0 && int.TryParse(Request.Query["siteId"], out var qSiteId) && qSiteId > 0)
            {
                siteId = qSiteId;
            }
            var moduleSettings = ReadSettings(EntityNames.Module, moduleId);
            var siteSettings = siteId > 0 ? ReadSettings(EntityNames.Site, siteId) : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            int configuredFormId = ParsePositiveInt(ReadSetting(moduleSettings, "MegaForm:FormId", ReadSetting(moduleSettings, "FormId", "0")));
            string viewType = "submit";
            string cssClass = ReadSetting(moduleSettings, "MegaForm:CssClass", ReadSetting(moduleSettings, "CssClass", string.Empty));
            bool moduleConfigured = ReadBool(moduleSettings, "MegaForm:ModuleConfigured", ReadBool(moduleSettings, "ModuleConfigured", configuredFormId > 0));
            string viewConfig = BuildViewConfigForSave(
                ReadSetting(moduleSettings, "MegaForm:ViewConfig", ReadSetting(moduleSettings, "ViewConfig", string.Empty)),
                ParsePopupDisplayConfig(ReadSetting(moduleSettings, "MegaForm:ViewConfig", ReadSetting(moduleSettings, "ViewConfig", string.Empty))));

            var popupConfig = ParsePopupDisplayConfig(viewConfig);
            var rendererHostUrl = NormalizeRendererHostUrl(ReadSetting(siteSettings, "MegaForm:RendererHostUrl", string.Empty));
            var rendererHostPageId = ParsePositiveInt(ReadSetting(siteSettings, "MegaForm:RendererHostPageId", "0"));
            var rendererHostModuleId = ParsePositiveInt(ReadSetting(siteSettings, "MegaForm:RendererHostModuleId", "0"));
            var formViews = configuredFormId > 0 ? (_phase2Repo.GetFormViews(configuredFormId) ?? new List<FormViewInfo>()) : new List<FormViewInfo>();
            popupConfig.SelectedViewKey = FormViewSelector.SanitizeSelectedViewKey(popupConfig.SelectedViewKey, formViews);

            var forms = new List<FormListItem>();
            if (siteId > 0)
            {
                try
                {
                    forms = (_formRepo.ListForms(siteId, pageSize: 0) ?? new List<FormInfo>())
                        .OrderByDescending(f => f.UpdatedOnUtc ?? f.CreatedOnUtc)
                        .ThenByDescending(f => f.FormId)
                        .Select(f => new FormListItem { FormId = f.FormId, Title = f.Title, Status = f.Status })
                        .ToList();
                }
                catch
                {
                    forms = new List<FormListItem>();
                }
            }

            // Oqtane's default MVC serializer can emit an empty 200 response for
            // this shared DTO shape in the popup flow. Use the Newtonsoft-backed
            // JsonOk helper so the settings popup always receives a real payload.
            return JsonOk(new ModuleConfigResponse
            {
                Configured = configuredFormId > 0,
                ModuleConfigured = moduleConfigured,
                ModuleId = moduleId,
                SiteId = siteId,
                Forms = forms,
                RendererHostUrl = rendererHostUrl,
                RendererHostPageId = rendererHostPageId,
                RendererHostModuleId = rendererHostModuleId,
                Config = new ModuleConfigDto
                {
                    ModuleId = moduleId,
                    FormId = configuredFormId,
                    ViewType = viewType,
                    SelectedViewKey = popupConfig.SelectedViewKey,
                    ViewConfig = viewConfig,
                    CssClass = cssClass,
                    ModuleConfigured = moduleConfigured,
                    DisplayMode = popupConfig.DisplayMode,
                    TriggerType = popupConfig.TriggerType,
                    DelaySeconds = popupConfig.DelaySeconds,
                    ScrollPercent = popupConfig.ScrollPercent,
                    ClickSelector = popupConfig.ClickSelector,
                    PopupSize = popupConfig.PopupSize,
                    ViewMode = popupConfig.ViewMode,
                    ListFields = popupConfig.ListFields,
                    ListTemplate = popupConfig.ListTemplate,
                    CardFields = popupConfig.CardFields,
                    CardTemplate = popupConfig.CardTemplate,
                    ListViewSettingsJson = popupConfig.ListViewSettingsJson,
                    ShowOncePerSession = popupConfig.ShowOncePerSession,
                    CloseOnOverlay = popupConfig.CloseOnOverlay,
                    StartAt = popupConfig.StartAt,
                    EndAt = popupConfig.EndAt,
                    RendererHostUrl = rendererHostUrl,
                    RendererHostPageId = rendererHostPageId,
                    RendererHostModuleId = rendererHostModuleId
                }
            });
        }

        [HttpPost("ModuleConfig/SaveStyle")]
        [Authorize]
        public IActionResult SaveStyle([FromBody] JsonElement bodyElement)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (bodyElement.ValueKind == JsonValueKind.Undefined || bodyElement.ValueKind == JsonValueKind.Null)
                return BadRequest(new { error = "Request body is empty" });

            JObject body;
            try { body = JObject.Parse(bodyElement.GetRawText()); }
            catch { return BadRequest(new { error = "Invalid JSON body" }); }

            var moduleId = (int?)body["moduleId"] ?? 0;
            var selectedPresetThemeKey = ((string)body["selectedPresetThemeKey"] ?? string.Empty).Trim();
            if (moduleId <= 0)
                return BadRequest(new { error = "moduleId is required" });

            UpsertSetting(EntityNames.Module, moduleId, "MegaForm:SelectedThemePresetKey", selectedPresetThemeKey, false);
            UpsertSetting(EntityNames.Module, moduleId, "SelectedThemePresetKey", selectedPresetThemeKey, false);

            InvalidateSiteSettingsCache();
            return Ok(new { success = true, selectedPresetThemeKey = selectedPresetThemeKey });
        }

        // [ModuleStyle v20260624-B262] Per-module CSS source. Each module owns ONE CSS for its
        // CURRENT form (MegaForm:ModuleStyleJson, keyed by MegaForm:ModuleStyleFormId). The public
        // render overlays it onto the form's settings (module-setting-wins). When the module binds
        // a DIFFERENT form, GetModuleStyle reseeds from the new form's CSS.
        [HttpGet("ModuleConfig/ModuleStyle")]
        [Authorize]
        public IActionResult GetModuleStyle([FromQuery] int moduleId, [FromQuery] int formId)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (moduleId <= 0 || formId <= 0) return BadRequest(new { error = "moduleId and formId required" });
            var settings = ReadSettings(EntityNames.Module, moduleId);
            var storedFormId = ReadSetting(settings, "MegaForm:ModuleStyleFormId", string.Empty);
            var storedJson = ReadSetting(settings, "MegaForm:ModuleStyleJson", string.Empty);
            if (int.TryParse(storedFormId, out var sf) && sf == formId && !string.IsNullOrWhiteSpace(storedJson))
            {
                try { return Ok(new { moduleId, formId, seeded = false, style = JObject.Parse(storedJson) }); }
                catch { /* corrupt → reseed below */ }
            }
            // The module has no style, or it was bound to a DIFFERENT form → seed from this form's CSS.
            var seeded = SeedModuleStyleFromForm(moduleId, formId);
            return Ok(new { moduleId, formId, seeded = true, style = seeded });
        }

        [HttpPost("ModuleConfig/SaveModuleStyle")]
        [Authorize]
        public IActionResult SaveModuleStyle([FromBody] JsonElement bodyElement)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (bodyElement.ValueKind == JsonValueKind.Undefined || bodyElement.ValueKind == JsonValueKind.Null)
                return BadRequest(new { error = "Request body is empty" });
            JObject body;
            try { body = JObject.Parse(bodyElement.GetRawText()); }
            catch { return BadRequest(new { error = "Invalid JSON body" }); }
            var moduleId = (int?)body["moduleId"] ?? 0;
            var formId = (int?)body["formId"] ?? 0;
            if (moduleId <= 0 || formId <= 0) return BadRequest(new { error = "moduleId and formId required" });
            var style = new JObject();
            foreach (var key in new[] { "theme", "themeCssOverrides", "customCss", "cssOverrides" })
            {
                var tok = body[key];
                if (tok != null && tok.Type != JTokenType.Null) style[key] = tok;
            }
            WriteModuleStyle(moduleId, formId, style);
            return Ok(new { success = true, moduleId, formId });
        }

        private JObject SeedModuleStyleFromForm(int moduleId, int formId)
        {
            var style = new JObject();
            try
            {
                var form = _formRepo.GetForm(formId);
                if (form != null)
                {
                    var resolved = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson);
                    var sObj = string.IsNullOrWhiteSpace(resolved?.SchemaJson) ? null : JObject.Parse(resolved.SchemaJson)["settings"] as JObject;
                    if (sObj != null)
                    {
                        foreach (var key in new[] { "theme", "themeCssOverrides", "customCss", "cssOverrides" })
                        {
                            var tok = sObj[key] ?? sObj[char.ToUpperInvariant(key[0]) + key.Substring(1)];
                            if (tok != null && tok.Type != JTokenType.Null) style[key] = tok;
                        }
                    }
                }
            }
            catch { /* seed best-effort; empty style = form base used at render */ }
            WriteModuleStyle(moduleId, formId, style);
            return style;
        }

        private void WriteModuleStyle(int moduleId, int formId, JObject style)
        {
            UpsertSetting(EntityNames.Module, moduleId, "MegaForm:ModuleStyleJson", style?.ToString(Newtonsoft.Json.Formatting.None) ?? "{}", false);
            UpsertSetting(EntityNames.Module, moduleId, "MegaForm:ModuleStyleFormId", formId.ToString(System.Globalization.CultureInfo.InvariantCulture), false);
            InvalidateSiteSettingsCache();
        }

        [HttpPost("ModuleConfig")]
        [Authorize]
        public IActionResult SaveModuleConfig([FromBody] ModuleConfigDto config)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (config == null || config.ModuleId <= 0)
                return BadRequest(new { error = "moduleId is required" });

            var siteId = AuthEntityId(EntityNames.Site);
            // [ViewDesigner v20260503-04] same fallback as GetModuleConfig — the
            // popup may POST without alias prefix; honor ?siteId query string.
            if (siteId <= 0 && int.TryParse(Request.Query["siteId"], out var qSiteId) && qSiteId > 0)
            {
                siteId = qSiteId;
            }
            var popupConfig = new PopupDisplayConfig
            {
                DisplayMode = string.Equals(config.DisplayMode, "popup", StringComparison.OrdinalIgnoreCase) ? "popup" : "fixed",
                TriggerType = NormalizeTriggerType(config.TriggerType),
                DelaySeconds = config.DelaySeconds < 0 ? 5 : Math.Min(600, config.DelaySeconds),
                ScrollPercent = Clamp(config.ScrollPercent, 5, 95, 50),
                ClickSelector = (config.ClickSelector ?? string.Empty).Trim(),
                PopupSize = NormalizePopupSize(config.PopupSize),
                ViewMode = NormalizeViewMode(config.ViewMode),
                ListFields = (config.ListFields ?? string.Empty).Trim(),
                ListTemplate = config.ListTemplate ?? string.Empty,
                CardFields = (config.CardFields ?? string.Empty).Trim(),
                CardTemplate = config.CardTemplate ?? string.Empty,
                ListViewSettingsJson = config.ListViewSettingsJson ?? "{}",
                SelectedViewKey = (config.SelectedViewKey ?? string.Empty).Trim(),
                ShowOncePerSession = config.ShowOncePerSession,
                CloseOnOverlay = config.CloseOnOverlay,
                StartAt = (config.StartAt ?? string.Empty).Trim(),
                EndAt = (config.EndAt ?? string.Empty).Trim()
            };

            var formId = config.FormId > 0 ? config.FormId : 0;
            var formViews = formId > 0 ? (_phase2Repo.GetFormViews(formId) ?? new List<FormViewInfo>()) : new List<FormViewInfo>();
            popupConfig.SelectedViewKey = FormViewSelector.SanitizeSelectedViewKey(popupConfig.SelectedViewKey, formViews);
            var viewConfig = BuildViewConfigForSave(config.ViewConfig, popupConfig);
            if (formId > 0)
            {
                viewConfig = FormViewSelector.AttachSelectionMetadata(viewConfig, popupConfig.SelectedViewKey, formViews);
            }
            var cssClass = (config.CssClass ?? string.Empty).Trim();

            UpsertSetting(EntityNames.Module, config.ModuleId, "MegaForm:FormId", formId > 0 ? formId.ToString() : string.Empty, false);
            UpsertSetting(EntityNames.Module, config.ModuleId, "FormId", formId > 0 ? formId.ToString() : string.Empty, false);
            UpsertSetting(EntityNames.Module, config.ModuleId, "MegaForm:ViewType", "submit", false);
            UpsertSetting(EntityNames.Module, config.ModuleId, "ViewType", "submit", false);
            UpsertSetting(EntityNames.Module, config.ModuleId, "MegaForm:CssClass", cssClass, false);
            UpsertSetting(EntityNames.Module, config.ModuleId, "CssClass", cssClass, false);
            UpsertSetting(EntityNames.Module, config.ModuleId, "MegaForm:ViewConfig", viewConfig, false);
            UpsertSetting(EntityNames.Module, config.ModuleId, "ViewConfig", viewConfig, false);
            UpsertSetting(EntityNames.Module, config.ModuleId, "MegaForm:ModuleConfigured", "true", false);
            UpsertSetting(EntityNames.Module, config.ModuleId, "ModuleConfigured", "true", false);

            if (siteId > 0)
            {
                var currentPageUrl = NormalizeRendererHostUrl(config.CurrentPageUrl);
                var siteSettings = ReadSettings(EntityNames.Site, siteId);
                var existingRendererHostUrl = NormalizeRendererHostUrl(ReadSetting(siteSettings, "MegaForm:RendererHostUrl", string.Empty));
                var existingRendererHostPageId = ParsePositiveInt(ReadSetting(siteSettings, "MegaForm:RendererHostPageId", "0"));
                var existingRendererHostModuleId = ParsePositiveInt(ReadSetting(siteSettings, "MegaForm:RendererHostModuleId", "0"));
                var currentPageId = config.CurrentPageId > 0 ? config.CurrentPageId : 0;

                if (config.UseCurrentPageAsRendererHost)
                {
                    UpsertSetting(EntityNames.Site, siteId, "MegaForm:RendererHostUrl", currentPageUrl, false);
                    UpsertSetting(EntityNames.Site, siteId, "MegaForm:RendererHostPageId", currentPageId > 0 ? currentPageId.ToString() : string.Empty, false);
                    UpsertSetting(EntityNames.Site, siteId, "MegaForm:RendererHostModuleId", config.ModuleId.ToString(), false);
                }
                else if ((existingRendererHostModuleId > 0 && existingRendererHostModuleId == config.ModuleId)
                    || (currentPageId > 0 && existingRendererHostPageId > 0 && existingRendererHostPageId == currentPageId)
                    || (!string.IsNullOrWhiteSpace(currentPageUrl) && string.Equals(existingRendererHostUrl, currentPageUrl, StringComparison.OrdinalIgnoreCase)))
                {
                    UpsertSetting(EntityNames.Site, siteId, "MegaForm:RendererHostUrl", string.Empty, false);
                    UpsertSetting(EntityNames.Site, siteId, "MegaForm:RendererHostPageId", string.Empty, false);
                    UpsertSetting(EntityNames.Site, siteId, "MegaForm:RendererHostModuleId", string.Empty, false);
                }
            }

            _logger.Log(LogLevel.Information, this, LogFunction.Update,
                "MegaForm ModuleConfig Saved Module={ModuleId} Form={FormId}", config.ModuleId, config.FormId);

            InvalidateSiteSettingsCache();
            return Ok(new { success = true });
        }

        [HttpGet("Phase2/GetViewConfigs")]
        [Authorize]
        public IActionResult GetViewConfigs(int formId)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (formId <= 0) return BadRequest(new { error = "formId required" });
            var portalId = ResolvePortalId(formId);
            var form = _formRepo.GetForm(formId);
            var apps = CreateAppDefinitionService();
            var queries = CreateAppQueryRegistryService(apps);
            var bundle = form == null ? null : apps.GetByScope(portalId, form.AppScope, hydrateManifest: false);
            return JsonOk(new
            {
                views = _phase2Repo.GetFormViews(formId) ?? new List<FormViewInfo>(),
                app = BuildAppSummary(bundle),
                queries = form == null ? new List<AppQueryDefinitionInfo>() : queries.ListForForm(portalId, formId)
            });
        }

        [HttpPost("Phase2/SaveViewConfig")]
        [Authorize]
        public IActionResult SaveViewConfig([FromBody] FormViewInfo view)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (view == null || view.FormId <= 0) return BadRequest(new { error = "Invalid view data" });
            var existingViews = _phase2Repo.GetFormViews(view.FormId) ?? new List<FormViewInfo>();
            var validation = FormViewSelector.ValidateAndNormalizeForSave(view, existingViews);
            if (!validation.IsValid || validation.View == null)
                return BadRequest(new { error = validation.Error ?? "Invalid view data" });

            var apps = CreateAppDefinitionService();
            var queries = CreateAppQueryRegistryService(apps);
            var form = _formRepo.GetForm(validation.View.FormId);
            var queryValidation = queries.ValidateBinding(ResolvePortalId(validation.View.FormId), form, validation.View.QueryKey);
            if (!queryValidation.IsValid)
                return BadRequest(new { error = queryValidation.Error ?? "Invalid query binding" });

            validation.View.QueryKey = queryValidation.NormalizedQueryKey ?? string.Empty;

            var id = _phase2Repo.SaveFormView(validation.View);
            return Ok(new { viewId = id });
        }

        [HttpPost("Phase2/DeleteViewConfig")]
        [Authorize]
        public IActionResult DeleteViewConfig([FromQuery] int? viewId, [FromBody] JObject body = null)
        {
            if (!CanUseAdminPopup()) return Forbid();
            var id = viewId.GetValueOrDefault();
            if (id <= 0) id = (int?)body?["viewId"] ?? 0;
            if (id <= 0) return BadRequest(new { error = "viewId required" });
            _phase2Repo.DeleteFormView(id);
            return Ok(new { success = true });
        }

        // ════════════════════════════════════════════════════════════
        //  APP BUILDER CRUD (Custom Apps) — [oq-appdef v20260617-01]
        //  Ported from the DNN MegaFormApiController [AppBuilderCRUD] block.
        //  These routes previously existed ONLY on DNN, so the Oqtane
        //  dashboard's Business Starters → "Custom Apps" section
        //  (fetchCustomApps → Phase2/AppDefinitionList) hit HTTP 404 on
        //  :5070. Same response shapes as DNN so the shared JS works as-is.
        //    GET   /Phase2/AppDefinitionList
        //    GET   /Phase2/AppDefinitionGet?appKey=X
        //    POST  /Phase2/AppDefinitionSave        (body=app metadata)
        //    POST  /Phase2/AppDefinitionDelete      (body={ appId })
        //    POST  /Phase2/AppDefinitionAssignForm  (body={ formId, appScope, assign })
        // ════════════════════════════════════════════════════════════

        [HttpGet("Phase2/AppDefinitionList")]
        [Authorize]
        public IActionResult AppDefinitionList()
        {
            if (!CanUseAdminPopup()) return Forbid();
            try
            {
                var svc = CreateAppDefinitionService();
                var portalId = ResolvePortalId(0);
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
                return JsonOk(new { items });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("Phase2/AppDefinitionGet")]
        [Authorize]
        public IActionResult AppDefinitionGet(string appKey)
        {
            if (!CanUseAdminPopup()) return Forbid();
            try
            {
                if (string.IsNullOrWhiteSpace(appKey))
                    return BadRequest(new { error = "appKey required" });
                var portalId = ResolvePortalId(0);
                var bundle = CreateAppDefinitionService().Get(portalId, appKey, hydrateManifest: true);
                if (bundle == null) return NotFound(new { error = "Not found" });
                return JsonOk(new
                {
                    app = bundle.App,
                    forms = bundle.Forms.Select(f => new { formId = f.FormId, title = f.Title, status = f.Status, appScope = f.AppScope }).ToList(),
                    views = bundle.Views,
                    queries = bundle.Queries,
                    manifest = bundle.Manifest
                });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Phase2/AppDefinitionSave")]
        [Authorize]
        public IActionResult AppDefinitionSave([FromBody] JObject body)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (body == null) return BadRequest(new { error = "body required" });
            try
            {
                var portalId = ResolvePortalId(0);
                var existingKey = body.Value<string>("appKey");
                AppDefinitionInfo app;
                if (!string.IsNullOrWhiteSpace(existingKey))
                {
                    var existing = _phase2Repo.GetAppDefinition(portalId, existingKey);
                    app = existing ?? new AppDefinitionInfo { AppId = body.Value<int?>("appId") ?? 0 };
                }
                else
                {
                    app = new AppDefinitionInfo { AppId = body.Value<int?>("appId") ?? 0 };
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
                var uid = GetCurrentUserContext()?.UserId ?? 0;
                if (app.AppId == 0) app.CreatedByUserId = uid;
                app.ModifiedByUserId = uid;
                var savedId = CreateAppDefinitionService().Save(app, null);
                return Ok(new { appId = savedId, appKey = app.AppKey, appScope = app.AppScope });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Phase2/AppDefinitionDelete")]
        [Authorize]
        public IActionResult AppDefinitionDelete([FromBody] JObject body)
        {
            if (!CanUseAdminPopup()) return Forbid();
            try
            {
                int appId = (body != null ? body.Value<int?>("appId") : null) ?? 0;
                if (appId <= 0) return BadRequest(new { error = "appId required" });
                CreateAppDefinitionService().Delete(appId);
                return Ok(new { success = true });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Phase2/AppDefinitionAssignForm")]
        [Authorize]
        public IActionResult AppDefinitionAssignForm([FromBody] JObject body)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (body == null) return BadRequest(new { error = "body required" });
            try
            {
                int formId = body.Value<int?>("formId") ?? 0;
                var appScope = body.Value<string>("appScope") ?? string.Empty;
                bool assign = body.Value<bool?>("assign") ?? true;
                if (formId <= 0) return BadRequest(new { error = "formId required" });
                var form = _formRepo.GetForm(formId);
                if (form == null) return NotFound(new { error = "Form not found" });
                form.AppScope = assign ? appScope : string.Empty;
                _formRepo.SaveForm(form);
                return Ok(new { formId, appScope = form.AppScope, assign });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        private sealed class PopupDisplayConfig
        {
            public string DisplayMode { get; set; } = "fixed";
            public string TriggerType { get; set; } = "time_delay";
            public int DelaySeconds { get; set; } = 5;
            public int ScrollPercent { get; set; } = 50;
            public string ClickSelector { get; set; } = string.Empty;
            // [PopupSize v20260502-12] Width preset persisted in viewConfig.popup
            // small | medium | large | fullscreen — read by renderer to size overlay.
            public string PopupSize { get; set; } = "medium";
            // [ModuleViewModes v20260502-13]
            public string ViewMode { get; set; } = "form";
            public string ListFields { get; set; } = string.Empty;
            public string ListTemplate { get; set; } = string.Empty;
            public string CardFields { get; set; } = string.Empty;
            public string CardTemplate { get; set; } = string.Empty;
            // [ListViewRouting v20260507-25] Per-mode settings blob for the new
            // ListView (formId, fields, rowTemplate, pageSize, …).
            public string ListViewSettingsJson { get; set; } = "{}";
            public string SelectedViewKey { get; set; } = string.Empty;
            public bool ShowOncePerSession { get; set; } = true;
            public bool CloseOnOverlay { get; set; } = true;
            public string StartAt { get; set; } = string.Empty;
            public string EndAt { get; set; } = string.Empty;
        }

        private static string NormalizePopupSize(string value)
        {
            var v = (value ?? string.Empty).Trim().ToLowerInvariant();
            if (v == "small" || v == "sm") return "small";
            if (v == "large" || v == "lg") return "large";
            if (v == "fullscreen" || v == "full") return "fullscreen";
            return "medium";
        }

        // [ModuleViewModes v20260502-13]
        private static string NormalizeViewMode(string value)
        {
            // [ListViewRouting v20260507-25] Accept the new "listview" mode
            // (and existing "list"/"card"). Anything else falls back to "form".
            var v = (value ?? string.Empty).Trim().ToLowerInvariant();
            return (v == "list" || v == "card" || v == "listview") ? v : "form";
        }

        /// <summary>
        /// [SubmitJsonElementFix v20260508-01] Walk a Dictionary&lt;string, object&gt;
        /// and convert each JsonElement value into its native CLR type. This is
        /// needed because ASP.NET Core's System.Text.Json model binder produces
        /// JsonElement instances when the destination type is `object`, and
        /// downstream Newtonsoft.Json serialisation of JsonElement only emits
        /// the {"ValueKind":N} struct shape (useless on the wire).
        /// </summary>
        private static Dictionary<string, object> NormalizeJsonElementDict(Dictionary<string, object> src)
        {
            if (src == null) return null;
            var dst = new Dictionary<string, object>(src.Count, StringComparer.Ordinal);
            foreach (var kv in src) dst[kv.Key] = NormalizeJsonValue(kv.Value);
            return dst;
        }

        private static object NormalizeJsonValue(object v)
        {
            if (v is null) return null;
            if (v is System.Text.Json.JsonElement el)
            {
                switch (el.ValueKind)
                {
                    case System.Text.Json.JsonValueKind.String:    return el.GetString();
                    case System.Text.Json.JsonValueKind.Number:
                        if (el.TryGetInt64(out var l)) return l;
                        if (el.TryGetDouble(out var d)) return d;
                        return el.GetRawText();
                    case System.Text.Json.JsonValueKind.True:      return true;
                    case System.Text.Json.JsonValueKind.False:     return false;
                    case System.Text.Json.JsonValueKind.Null:      return null;
                    case System.Text.Json.JsonValueKind.Array:
                    {
                        var list = new List<object>();
                        foreach (var item in el.EnumerateArray()) list.Add(NormalizeJsonValue(item));
                        return list;
                    }
                    case System.Text.Json.JsonValueKind.Object:
                    {
                        var dict = new Dictionary<string, object>(StringComparer.Ordinal);
                        foreach (var prop in el.EnumerateObject()) dict[prop.Name] = NormalizeJsonValue(prop.Value);
                        return dict;
                    }
                    default: return el.GetRawText();
                }
            }
            // Already-CLR values pass through unchanged.
            return v;
        }

        private Dictionary<string, string> ReadSettings(string entityName, int entityId)
        {
            try
            {
                return (_settings.GetSettings(entityName, entityId) ?? Enumerable.Empty<Setting>())
                    .GroupBy(s => s.SettingName ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                    .ToDictionary(g => g.Key, g => g.LastOrDefault()?.SettingValue ?? string.Empty, StringComparer.OrdinalIgnoreCase);
            }
            catch
            {
                return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            }
        }

        private static string ReadSetting(Dictionary<string, string> settings, string key, string defaultValue)
        {
            if (settings != null && settings.TryGetValue(key, out var value) && value != null)
                return value;
            return defaultValue;
        }

        private static bool ReadBool(Dictionary<string, string> settings, string key, bool defaultValue)
        {
            var raw = ReadSetting(settings, key, null);
            return bool.TryParse(raw, out var parsed) ? parsed : defaultValue;
        }

        private string GetSelectedThemePresetKey(int moduleId)
        {
            if (moduleId <= 0) return string.Empty;
            var moduleSettings = ReadSettings(EntityNames.Module, moduleId);
            var preferred = ReadSetting(moduleSettings, "MegaForm:SelectedThemePresetKey", string.Empty);
            if (!string.IsNullOrWhiteSpace(preferred)) return preferred;
            return ReadSetting(moduleSettings, "SelectedThemePresetKey", string.Empty);
        }

        private void UpsertSetting(string entityName, int entityId, string settingName, string value, bool isPrivate)
        {
            var existing = _settings.GetSetting(entityName, entityId, settingName);
            if (existing == null)
            {
                _settings.AddSetting(new Setting
                {
                    EntityName = entityName,
                    EntityId = entityId,
                    SettingName = settingName,
                    SettingValue = value ?? string.Empty,
                    IsPrivate = isPrivate
                });
            }
            else
            {
                existing.SettingValue = value ?? string.Empty;
                existing.IsPrivate = isPrivate;
                _settings.UpdateSetting(existing);
            }
        }

        // [B214 settings-cache invalidate] Force Oqtane to drop its cached site state so a
        // module-setting change (e.g. MegaForm:FormId) is picked up by OTHER browsers/circuits
        // on their next load WITHOUT an app restart. ModuleState.Settings is materialized from
        // the cached site entry, which a direct ISettingRepository write does not touch; a Site
        // Refresh sync event invalidates it. Fail-soft: never break the save if sync is absent.
        private void InvalidateSiteSettingsCache()
        {
            try
            {
                var alias = _tenantManager != null ? _tenantManager.GetAlias() : null;
                if (alias != null && _syncManager != null)
                {
                    _syncManager.AddSyncEvent(alias, EntityNames.Site, alias.SiteId, SyncEventActions.Refresh);
                }
            }
            catch { /* best-effort cache invalidation; the setting is already persisted */ }
        }

        private (int MaxSizeMb, string AllowedExtensionsCsv, string BlockedExtensionsCsv) GetUploadPolicy(int siteId)
        {
            var siteSettings = siteId > 0
                ? ReadSettings(EntityNames.Site, siteId)
                : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            var maxSize = ParsePositiveInt(ReadSetting(
                siteSettings,
                "MegaForm:Upload_MaxSizeMB",
                ReadSetting(siteSettings, "MegaForm_Upload_MaxSizeMB", "10")));
            if (maxSize <= 0) maxSize = 10;

            return (
                maxSize,
                FileUploadSecurityService.NormalizeExtensionsCsv(
                    ReadSetting(
                        siteSettings,
                        "MegaForm:Upload_AllowedExtensions",
                        ReadSetting(siteSettings, "MegaForm_Upload_AllowedExtensions", FileUploadSecurityService.GetDefaultAllowedExtensionsCsv())),
                    FileUploadSecurityService.GetDefaultAllowedExtensionsCsv()),
                FileUploadSecurityService.NormalizeExtensionsCsv(
                    ReadSetting(
                        siteSettings,
                        "MegaForm:Upload_BlockedExtensions",
                        ReadSetting(siteSettings, "MegaForm_Upload_BlockedExtensions", FileUploadSecurityService.GetDefaultBlockedExtensionsCsv())),
                    FileUploadSecurityService.GetDefaultBlockedExtensionsCsv())
            );
        }

        private static PopupDisplayConfig ParsePopupDisplayConfig(string raw)
        {
            var cfg = new PopupDisplayConfig();
            if (string.IsNullOrWhiteSpace(raw)) return cfg;
            try
            {
                var obj = JObject.Parse(raw);
                cfg.DisplayMode = string.Equals((string)obj["displayMode"] ?? (string)obj["DisplayMode"], "popup", StringComparison.OrdinalIgnoreCase)
                    ? "popup"
                    : "fixed";
                var popup = obj["popup"] as JObject ?? obj["Popup"] as JObject ?? new JObject();
                cfg.TriggerType = NormalizeTriggerType((string)popup["triggerType"] ?? (string)popup["TriggerType"]);
                cfg.DelaySeconds = Clamp(ParsePositiveInt((string)popup["delaySeconds"] ?? (string)popup["DelaySeconds"]), 0, 600, 5);
                cfg.ScrollPercent = Clamp(ParsePositiveInt((string)popup["scrollPercent"] ?? (string)popup["ScrollPercent"]), 5, 95, 50);
                cfg.ClickSelector = ((string)popup["clickSelector"] ?? (string)popup["ClickSelector"] ?? string.Empty).Trim();
                cfg.PopupSize = NormalizePopupSize((string)popup["popupSize"] ?? (string)popup["PopupSize"]);
                // [ModuleViewModes v20260502-13] Read view-mode + list/card config
                // from the same viewConfig JSON. Stored under root keys (not under
                // "popup") because they're not popup-specific.
                cfg.ViewMode     = NormalizeViewMode((string)obj["viewMode"]     ?? (string)obj["ViewMode"]);
                cfg.ListFields   = ((string)obj["listFields"]   ?? (string)obj["ListFields"]   ?? string.Empty).Trim();
                cfg.ListTemplate = ((string)obj["listTemplate"] ?? (string)obj["ListTemplate"] ?? string.Empty);
                cfg.CardFields   = ((string)obj["cardFields"]   ?? (string)obj["CardFields"]   ?? string.Empty).Trim();
                cfg.CardTemplate = ((string)obj["cardTemplate"] ?? (string)obj["CardTemplate"] ?? string.Empty);
                // [ListViewRouting v20260507-25] Pull listView settings blob.
                // Stored as a string at root, not nested under popup.
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

        private static bool ReadBooleanToken(JObject obj, string camelKey, string pascalKey, bool defaultValue)
        {
            var token = obj[camelKey] ?? obj[pascalKey];
            if (token == null) return defaultValue;
            var text = token.ToString();
            return bool.TryParse(text, out var parsed) ? parsed : defaultValue;
        }

        private static string BuildViewConfigForSave(string existingRaw, PopupDisplayConfig nextCfg)
        {
            var baseObj = ParseObject(existingRaw);
            var effectiveDisplayMode = string.Equals(nextCfg.DisplayMode, "popup", StringComparison.OrdinalIgnoreCase) ? "popup" : "fixed";
            var effectiveTriggerType = effectiveDisplayMode == "popup" ? NormalizeTriggerType(nextCfg.TriggerType) : "time_delay";
            baseObj["displayMode"] = effectiveDisplayMode;
            baseObj["popup"] = new JObject
            {
                ["triggerType"] = effectiveTriggerType,
                ["delaySeconds"] = nextCfg.DelaySeconds,
                ["scrollPercent"] = nextCfg.ScrollPercent,
                ["clickSelector"] = nextCfg.ClickSelector ?? string.Empty,
                ["popupSize"] = NormalizePopupSize(nextCfg.PopupSize),
                ["borderMode"] = "transparent_popup",
                ["showOncePerSession"] = nextCfg.ShowOncePerSession,
                ["closeOnOverlay"] = nextCfg.CloseOnOverlay,
                ["startAt"] = nextCfg.StartAt ?? string.Empty,
                ["endAt"] = nextCfg.EndAt ?? string.Empty
            };
            // [ModuleViewModes v20260502-13] Persist view-mode + list/card at the
            // root of viewConfig (not nested under "popup") so it's not popup-bound.
            baseObj["viewMode"]     = NormalizeViewMode(nextCfg.ViewMode);
            baseObj["listFields"]   = nextCfg.ListFields ?? string.Empty;
            baseObj["listTemplate"] = nextCfg.ListTemplate ?? string.Empty;
            baseObj["cardFields"]   = nextCfg.CardFields ?? string.Empty;
            baseObj["cardTemplate"] = nextCfg.CardTemplate ?? string.Empty;
            // [ListViewRouting v20260507-25] Persist the new ListView settings
            // blob alongside the per-mode legacy fields. Index.razor reads this
            // via ApplyViewConfigFromJson + ParseListViewSettings.
            baseObj["listViewSettingsJson"] = nextCfg.ListViewSettingsJson ?? "{}";
            baseObj["selectedViewKey"] = nextCfg.SelectedViewKey ?? string.Empty;
            return baseObj.ToString(Newtonsoft.Json.Formatting.None);
        }

        private static JObject ParseObject(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return new JObject();
            try { return JObject.Parse(raw); } catch { return new JObject(); }
        }

        private static int ParsePositiveInt(string value)
        {
            return int.TryParse((value ?? string.Empty).Trim(), out var parsed) && parsed > 0 ? parsed : 0;
        }

        private static int Clamp(int value, int min, int max, int fallback)
        {
            if (value <= 0) return fallback;
            if (value < min) return min;
            if (value > max) return max;
            return value;
        }

        private static string NormalizeTriggerType(string value)
        {
            var trigger = (value ?? string.Empty).Trim().ToLowerInvariant();
            return trigger == "scroll_depth" || trigger == "click_trigger" ? trigger : "time_delay";
        }

        private static string NormalizeRendererHostUrl(string urlLike)
        {
            var raw = (urlLike ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
            try
            {
                var uri = new Uri(raw, UriKind.RelativeOrAbsolute);
                if (!uri.IsAbsoluteUri) return raw.TrimEnd('/');
                return uri.GetLeftPart(UriPartial.Path).TrimEnd('/');
            }
            catch
            {
                return raw.TrimEnd('/');
            }
        }

        // ══════════════════════════════════════════════════════
        //  MAPPING HELPERS
        // ══════════════════════════════════════════════════════

        private static string Csv(string value)
        {
            value = value ?? string.Empty;
            if (value.Contains(",") || value.Contains("\"") || value.Contains("\n") || value.Contains("\r"))
                return "\"" + value.Replace("\"", "\"\"") + "\"";
            return value;
        }

        private static FormDto ToDto(MegaForm.Core.Models.FormInfo e) => new FormDto
        {
            FormId = e.FormId,
            ModuleId = e.ModuleId,
            SiteId = e.PortalId,
            Title = e.Title,
            Description = e.Description,
            SchemaJson = e.SchemaJson,
            SettingsJson = e.SettingsJson,
            ThemeJson = e.ThemeJson,
            Status = e.Status,
            SubmitButtonText = e.SubmitButtonText,
            SuccessMessage = e.SuccessMessage,
            RedirectUrl = e.RedirectUrl,
            EnableCaptcha = e.EnableCaptcha,
            EnableSaveResume = e.EnableSaveResume,
            RequireAuth = e.RequireAuth,
            NotifyEmails = e.NotifyEmails,
            WebhookUrl = e.WebhookUrl,
            WorkflowJson = e.WorkflowJson,
            CreatedOnUtc = e.CreatedOnUtc,
            UpdatedOnUtc = e.UpdatedOnUtc,
        };

        private static MegaForm.Core.Models.FormInfo ToEntity(FormDto d) => new MegaForm.Core.Models.FormInfo
        {
            FormId = d.FormId,
            ModuleId = d.ModuleId,
            PortalId = d.SiteId,
            Title = d.Title,
            Description = d.Description,
            SchemaJson = d.SchemaJson,
            SettingsJson = d.SettingsJson,
            ThemeJson = d.ThemeJson,
            Status = d.Status ?? "Draft",
            SubmitButtonText = d.SubmitButtonText ?? "Submit",
            SuccessMessage = d.SuccessMessage,
            RedirectUrl = d.RedirectUrl,
            EnableCaptcha = d.EnableCaptcha,
            EnableSaveResume = d.EnableSaveResume,
            RequireAuth = d.RequireAuth,
            NotifyEmails = d.NotifyEmails,
            WebhookUrl = d.WebhookUrl,
            RulesJson = d.RulesJson,
            WorkflowJson = d.WorkflowJson,
        };


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


        private Dictionary<int, List<WorkflowTaskInstance>> BuildOpenWorkflowTaskLookup(int formId, IEnumerable<int> submissionIds)
        {
            var ids = (submissionIds ?? Enumerable.Empty<int>())
                .Where(id => id > 0)
                .Distinct()
                .ToList();
            if (formId <= 0 || ids.Count == 0)
                return new Dictionary<int, List<WorkflowTaskInstance>>();

            var tasks = _workflowRepo.ListTasks(new WorkflowTaskQuery
            {
                FormId = formId,
                OpenOnly = true,
                PageIndex = 0,
                PageSize = 5000
            }) ?? new List<WorkflowTaskInstance>();

            var idSet = new HashSet<int>(ids);
            return tasks
                .Where(task => task != null && task.SubmissionId > 0 && idSet.Contains(task.SubmissionId))
                .OrderBy(task => task.DueAt ?? DateTime.MaxValue)
                .ThenByDescending(task => task.CreatedAt)
                .GroupBy(task => task.SubmissionId)
                .ToDictionary(group => group.Key, group => group.ToList());
        }

        private List<SubmissionActionDto> BuildAvailableSubmissionActions(
            int formId,
            SubmissionInfo submission,
            UserContext actor,
            PermissionService permissions,
            List<WorkflowTaskInstance> openTasks)
        {
            var actions = new List<SubmissionActionDto>();
            if (submission == null)
                return actions;

            actions.Add(CreateSubmissionAction("view", "View", "Open submission details"));

            var visibleTask = (openTasks ?? new List<WorkflowTaskInstance>())
                .FirstOrDefault(task => IsTaskVisibleToActor(task, actor));

            if (visibleTask != null)
            {
                var canClaim = visibleTask.Status == WorkflowTaskStatus.Pending
                    && CanActorClaimTask(visibleTask, actor)
                    && !IsTaskAssignedToActor(visibleTask, actor);
                var canWork = CanActorWorkTask(visibleTask, actor);

                if (canClaim)
                    actions.Add(CreateSubmissionAction("claim", "Claim", "Claim this BPMN task", "info", visibleTask.TaskId));

                if (canWork)
                {
                    var actorIdentifiers = GetActorIdentifiers(actor);
                    var explicitForwardTargets = (visibleTask.CandidateUsers ?? new List<string>())
                        .Where(user => !string.IsNullOrWhiteSpace(user))
                        .Where(user => !actorIdentifiers.Contains(user, StringComparer.OrdinalIgnoreCase))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList();

                    actions.Add(CreateSubmissionAction("approve", "Approve", "Approve this BPMN task", "success", visibleTask.TaskId));
                    actions.Add(CreateSubmissionAction("reject", "Reject", "Reject this BPMN task", "danger", visibleTask.TaskId, visibleTask.CommentRequiredOnReject));
                    if (visibleTask.AllowForward && explicitForwardTargets.Count > 0)
                        actions.Add(CreateSubmissionAction("forward", "Forward", "Forward this BPMN task", "neutral", visibleTask.TaskId));
                }

                return actions
                    .GroupBy(action => action.Key, StringComparer.OrdinalIgnoreCase)
                    .Select(group => group.First())
                    .ToList();
            }

            var hasOpenWorkflow = openTasks != null && openTasks.Count > 0;
            if (!hasOpenWorkflow && permissions != null && permissions.CanEdit(formId, actor))
                actions.Add(CreateSubmissionAction("edit", "Edit", "Edit this submission"));
            if (!hasOpenWorkflow && permissions != null && permissions.CanDelete(formId, actor))
                actions.Add(CreateSubmissionAction("delete", "Delete", "Delete this submission", "danger"));

            return actions;
        }

        private static SubmissionActionDto CreateSubmissionAction(
            string key,
            string label,
            string title,
            string tone = "neutral",
            string taskId = null,
            bool requiresComment = false)
        {
            return new SubmissionActionDto
            {
                Key = key ?? string.Empty,
                Label = label ?? string.Empty,
                Title = title ?? string.Empty,
                Tone = tone ?? "neutral",
                TaskId = taskId ?? string.Empty,
                RequiresComment = requiresComment
            };
        }

        private static bool IsTaskVisibleToActor(WorkflowTaskInstance task, UserContext actor)
        {
            return IsTaskAssignedToActor(task, actor) || CanActorClaimTask(task, actor);
        }

        private static bool CanActorWorkTask(WorkflowTaskInstance task, UserContext actor)
        {
            if (actor == null || task == null)
                return false;
            if (actor.IsAdmin || actor.IsSuperUser)
                return true;
            if (IsTaskAssignedToActor(task, actor))
                return true;
            return task.Status == WorkflowTaskStatus.Pending && CanActorClaimTask(task, actor);
        }

        private static bool CanActorClaimTask(WorkflowTaskInstance task, UserContext actor)
        {
            if (actor == null || task == null)
                return false;
            if (actor.IsAdmin || actor.IsSuperUser)
                return true;
            if (IsTaskAssignedToActor(task, actor))
                return true;

            var identifiers = GetActorIdentifiers(actor);
            if (task.CandidateUsers != null && task.CandidateUsers.Any(user => identifiers.Contains(user, StringComparer.OrdinalIgnoreCase)))
                return true;

            return task.CandidateRoles != null
                && actor.Roles != null
                && task.CandidateRoles.Any(role => actor.Roles.Contains(role, StringComparer.OrdinalIgnoreCase));
        }

        private static bool IsTaskAssignedToActor(WorkflowTaskInstance task, UserContext actor)
        {
            if (actor == null || task == null)
                return false;

            if (task.AssignedUserId.HasValue && actor.UserId > 0 && task.AssignedUserId.Value == actor.UserId)
                return true;
            if (string.IsNullOrWhiteSpace(task.AssignedUserName))
                return false;

            var identifiers = GetActorIdentifiers(actor);
            return identifiers.Contains(task.AssignedUserName, StringComparer.OrdinalIgnoreCase);
        }

        private static List<string> GetActorIdentifiers(UserContext actor)
        {
            var values = new List<string>();
            if (actor == null)
                return values;

            if (actor.UserId > 0)
                values.Add(actor.UserId.ToString());
            if (!string.IsNullOrWhiteSpace(actor.UserName))
                values.Add(actor.UserName);
            if (!string.IsNullOrWhiteSpace(actor.DisplayName))
                values.Add(actor.DisplayName);
            if (!string.IsNullOrWhiteSpace(actor.Email))
                values.Add(actor.Email);

            return values
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        private static SubmissionDto ToSubmissionDto(MegaForm.Core.Models.SubmissionInfo s, List<SubmissionActionDto> availableActions = null) => new SubmissionDto
        {
            SubmissionId = s.SubmissionId,
            FormId = s.FormId,
            DataJson = s.DataJson,
            Status = s.Status,
            IsSpam = s.IsSpam,
            SubmittedOnUtc = s.SubmittedOnUtc,
            IpAddress = s.IpAddress,
            ActiveTaskId = string.Empty,
            AvailableActions = availableActions ?? new List<SubmissionActionDto>()
        };

        private static SubmissionDto ToSubmissionDto(MegaForm.Core.Models.SubmissionListItem s, List<SubmissionActionDto> availableActions = null) => new SubmissionDto
        {
            SubmissionId = s.SubmissionId,
            FormId = s.FormId,
            DataJson = s.DataJson,
            Status = s.Status,
            IsSpam = s.IsSpam,
            SubmittedOnUtc = s.SubmittedOnUtc,
            IpAddress = s.IpAddress,
            ActiveTaskId = availableActions?.Select(action => action.TaskId).FirstOrDefault(taskId => !string.IsNullOrWhiteSpace(taskId)) ?? string.Empty,
            AvailableActions = availableActions ?? new List<SubmissionActionDto>()
        };


        private static string MergeSchemaAndSettings(string schemaJson, string settingsJson)
        {
            return RenderModelResolver.ResolveSchemaJson(schemaJson, settingsJson);
        }

        public class WorkflowSaveRequest
        {
            public int FormId { get; set; }
            public JsonElement Workflow { get; set; }
        }

        public class WorkflowTestRunRequest
        {
            public int FormId { get; set; }
            public Dictionary<string, object> FormData { get; set; }
            public bool DryRun { get; set; }
        }

        private static LocalAssetManifest BuildAssetManifest(string schemaJson)
        {
            if (string.IsNullOrWhiteSpace(schemaJson))
                return new LocalAssetManifest { Badge = "CoreAssetManifest v20260505-06" };

            try
            {
                var schema = JsonConvert.DeserializeObject<FormSchema>(schemaJson) ?? new FormSchema();
                return BuildAssetManifest(schema);
            }
            catch
            {
                return new LocalAssetManifest { Badge = "CoreAssetManifest v20260505-06" };
            }
        }

        private static LocalAssetManifest BuildAssetManifest(FormSchema schema)
        {
            var manifest = new LocalAssetManifest { Badge = "CoreAssetManifest v20260505-06" };
            if (schema?.Fields == null || schema.Fields.Count == 0)
                return manifest;

            var scripts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var styles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var flatFields = MegaFormUtils.FlattenFields(schema.Fields);

            foreach (var field in flatFields)
            {
                var type = (field?.Type ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(type))
                    continue;

                switch (type.ToLowerInvariant())
                {
                    case "repeater":
                        AddAsset(scripts, styles, "megaform-widget-repeater.js", "megaform-widget-repeater.css");
                        break;
                    case "signature":
                        AddAsset(scripts, styles, "megaform-widget-signature.js", "megaform-widget-signature.css");
                        break;
                    case "calculator":
                        AddAsset(scripts, styles, "megaform-widget-calculator.js", "megaform-widget-calculator.css");
                        break;
                    case "rating":
                    case "likert":
                    case "nps":
                    case "opinionscale":
                    case "ranking":
                        AddAsset(scripts, styles, "megaform-widget-rating-suite.js", "megaform-widget-rating-suite.css");
                        break;
                    case "imagechoice":
                        AddScript(scripts, "megaform-widget-image-choice.js");
                        break;
                    case "advancedfile":
                        AddAsset(scripts, styles, "megaform-widget-advanced-file.js", "megaform-widget-advanced-file.css");
                        break;
                    case "richtext":
                        AddAsset(scripts, styles, "megaform-widget-rich-text.js", "megaform-widget-rich-text.css");
                        break;
                    case "payment":
                    case "paymentsummary":
                    case "paypal":
                    case "stripe":
                    case "square":
                        AddPaymentAssets(field, scripts, styles);
                        break;
                    case "appointment":
                        AddScript(scripts, "megaform-widget-appointment.js");
                        break;
                    case "geolocation":
                        AddScript(scripts, "megaform-widget-geolocation.js");
                        break;
                    case "infinitelist":
                        AddAsset(scripts, styles, "megaform-widget-infinite-list.js", "megaform-widget-infinite-list.css");
                        break;
                    case "productlineitems":
                        AddAsset(scripts, styles, "megaform-widget-product-line-items.js", "megaform-widget-product-line-items.css");
                        break;
                    case "drawonimage":
                        AddAsset(scripts, styles, "megaform-widget-draw-on-image.js", "megaform-widget-draw-on-image.css");
                        break;
                    case "videoembed":
                        AddAsset(scripts, styles, "megaform-widget-video-embed.js", "megaform-widget-video-embed.css");
                        break;
                    case "gridrepeater":
                        AddAsset(scripts, styles, "megaform-widget-grid-repeater.js", "megaform-widget-grid-repeater.css");
                        break;
                    case "phonenumberpro":
                        AddAsset(scripts, styles, "megaform-widget-phone-pro.js", "megaform-widget-phone-pro.css");
                        break;
                    case "pdfform":
                        // [PdfForm v20260506-01] Vite-bundled multi-file builder; CSS inlined in JS.
                        AddScript(scripts, "megaform-widget-pdf-form.js");
                        break;
                    case "captcha":
                        AddScript(scripts, "megaform-widget-captcha.js");
                        break;
                    case "qrcode":
                    case "qr":
                        AddScript(scripts, "megaform-widget-qrcode.js");
                        break;
                    // [CoreAssetManifest v20260504-05] Missing widget plugin
                    // registrations — without these the public form renderer
                    // never loaded the data-repeater / golf-scorecard / subform /
                    // content-slider plugin scripts. Renderer iterated fields,
                    // found no registered widget handler, and rendered nothing
                    // for those fields. Result was a form page with only header
                    // / customHtml visible and an empty fields container.
                    case "datarepeater":
                        AddAsset(scripts, styles, "megaform-widget-data-repeater.js", "megaform-widget-data-repeater.css");
                        break;
                    case "golfscorecard":
                        AddAsset(scripts, styles, "megaform-widget-golf-scorecard.js", "megaform-widget-golf-scorecard.css");
                        break;
                    case "subform":
                        AddScript(scripts, "megaform-widget-subform.js");
                        break;
                    case "contentslider":
                        AddScript(scripts, "megaform-widget-content-slider.js");
                        break;
                }
            }

            manifest.ScriptFiles = scripts.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList();
            manifest.StyleFiles = styles.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList();
            return manifest;
        }

        private static void AddPaymentAssets(FormField field, HashSet<string> scripts, HashSet<string> styles)
        {
            AddStyle(styles, "megaform-widget-payment.css");
            AddScript(scripts, "megaform-widget-payment-unified.js");

            var provider = GetWidgetProp(field, "provider");
            provider = string.IsNullOrWhiteSpace(provider) ? "both" : provider.Trim().ToLowerInvariant();
            var loadStripe = provider == "both" || provider == "stripe" || provider == "card" || provider == "all";
            var loadPaypal = provider == "both" || provider == "paypal" || provider == "all";

            if (loadStripe)
                AddAsset(scripts, styles, "megaform-widget-stripe.js", "megaform-widget-stripe.css");
            if (loadPaypal)
                AddAsset(scripts, styles, "megaform-widget-paypal.js", "megaform-widget-paypal.css");
        }

        private static string GetWidgetProp(FormField field, string key)
        {
            if (field?.WidgetProps == null || string.IsNullOrWhiteSpace(key))
                return null;

            foreach (var kv in field.WidgetProps)
            {
                if (string.Equals(kv.Key, key, StringComparison.OrdinalIgnoreCase))
                    return kv.Value?.ToString();
            }
            return null;
        }

        private static void AddAsset(HashSet<string> scripts, HashSet<string> styles, string scriptFile, string styleFile)
        {
            AddScript(scripts, scriptFile);
            AddStyle(styles, styleFile);
        }

        private static void AddScript(HashSet<string> scripts, string scriptFile)
        {
            if (!string.IsNullOrWhiteSpace(scriptFile))
                scripts.Add(scriptFile);
        }

        private static void AddStyle(HashSet<string> styles, string styleFile)
        {
            if (!string.IsNullOrWhiteSpace(styleFile))
                styles.Add(styleFile);
        }


        private sealed class LocalAssetManifest
        {
            public string Badge { get; set; }
            public List<string> ScriptFiles { get; set; } = new List<string>();
            public List<string> StyleFiles { get; set; } = new List<string>();
        }

    }
}
