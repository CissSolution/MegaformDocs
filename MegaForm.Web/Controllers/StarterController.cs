using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Text.Json;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Core.Services.Starters;
using MegaForm.Core.ViewModes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;

namespace MegaForm.Web.Controllers
{
    /// <summary>
    /// [WebStarters v20260710] Business Starter setup/launch endpoints for the
    /// standalone ASP.NET Core Web host. Mirrors Oqtane/DNN starter APIs.
    /// </summary>
    [ApiController]
    [Route("api/MegaForm/Starter")]
    [Authorize]
    public class StarterController : ControllerBase
    {
        private readonly StarterStatusService _statusService;
        private readonly LeaveRequestStarterService _leaveRequestStarter;
        private readonly ProposalStarterService _proposalStarter;
        private readonly DocumentExchangeStarterService _documentExchangeStarter;
        private readonly PurchaseOrderStarterService _purchaseOrderStarter;
        private readonly RecruitmentStarterService _recruitmentStarter;
        private readonly ConfiguredAppStarterService _configuredAppStarter;
        private readonly IFormRepository _formRepo;
        private readonly IPhase2Repository _phase2Repo;
        private readonly IModuleSettingsService _moduleSettings;
        private readonly IPlatformContext _ctx;

        public StarterController(
            StarterStatusService statusService,
            LeaveRequestStarterService leaveRequestStarter,
            ProposalStarterService proposalStarter,
            DocumentExchangeStarterService documentExchangeStarter,
            PurchaseOrderStarterService purchaseOrderStarter,
            RecruitmentStarterService recruitmentStarter,
            ConfiguredAppStarterService configuredAppStarter,
            IFormRepository formRepo,
            IPhase2Repository phase2Repo,
            IModuleSettingsService moduleSettings,
            IPlatformContext ctx)
        {
            _statusService = statusService;
            _leaveRequestStarter = leaveRequestStarter;
            _proposalStarter = proposalStarter;
            _documentExchangeStarter = documentExchangeStarter;
            _purchaseOrderStarter = purchaseOrderStarter;
            _recruitmentStarter = recruitmentStarter;
            _configuredAppStarter = configuredAppStarter;
            _formRepo = formRepo;
            _phase2Repo = phase2Repo;
            _moduleSettings = moduleSettings;
            _ctx = ctx;
        }

        [HttpGet("Status")]
        public IActionResult Status()
        {
            try
            {
                var portalId = ResolvePortalId();
                var items = _statusService.GetAll(portalId);
                return Ok(new { items });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("LeaveRequest/Setup")]
        [Authorize(Roles = "Administrator")]
        public IActionResult SetupLeaveRequest([FromBody] JsonElement bodyElement)
        {
            var actor = GetCurrentUserContext();
            if (!IsAdmin(actor)) return Forbid();

            var body = ParseBody(bodyElement) ?? new JObject();
            var portalId = ResolvePortalId(body);
            var moduleId = body.Value<int?>("moduleId") ?? 0;
            var homeUrl = (body.Value<string>("homeUrl") ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(homeUrl))
                homeUrl = GetCurrentPageBaseUrl();

            try
            {
                var result = _leaveRequestStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Proposal/Setup")]
        [Authorize(Roles = "Administrator")]
        public IActionResult SetupProposal([FromBody] JsonElement bodyElement)
        {
            var actor = GetCurrentUserContext();
            if (!IsAdmin(actor)) return Forbid();

            var body = ParseBody(bodyElement) ?? new JObject();
            var portalId = ResolvePortalId(body);
            var moduleId = body.Value<int?>("moduleId") ?? 0;
            var homeUrl = (body.Value<string>("homeUrl") ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(homeUrl))
                homeUrl = GetCurrentPageBaseUrl();

            try
            {
                var result = _proposalStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Recruitment/Setup")]
        [Authorize(Roles = "Administrator")]
        public IActionResult SetupRecruitment([FromBody] JsonElement bodyElement)
        {
            var actor = GetCurrentUserContext();
            if (!IsAdmin(actor)) return Forbid();

            var body = ParseBody(bodyElement) ?? new JObject();
            var portalId = ResolvePortalId(body);
            var moduleId = body.Value<int?>("moduleId") ?? 0;
            var homeUrl = (body.Value<string>("homeUrl") ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(homeUrl))
                homeUrl = GetCurrentPageBaseUrl();

            try
            {
                var result = _recruitmentStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("DocumentExchange/Setup")]
        [Authorize(Roles = "Administrator")]
        public IActionResult SetupDocumentExchange([FromBody] JsonElement bodyElement)
        {
            var actor = GetCurrentUserContext();
            if (!IsAdmin(actor)) return Forbid();

            var body = ParseBody(bodyElement) ?? new JObject();
            var portalId = ResolvePortalId(body);
            var moduleId = body.Value<int?>("moduleId") ?? 0;
            var homeUrl = (body.Value<string>("homeUrl") ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(homeUrl))
                homeUrl = GetCurrentPageBaseUrl();

            try
            {
                var result = _documentExchangeStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("PurchaseOrder/Setup")]
        [Authorize(Roles = "Administrator")]
        public IActionResult SetupPurchaseOrder([FromBody] JsonElement bodyElement)
        {
            var actor = GetCurrentUserContext();
            if (!IsAdmin(actor)) return Forbid();

            var body = ParseBody(bodyElement) ?? new JObject();
            var portalId = ResolvePortalId(body);
            var moduleId = body.Value<int?>("moduleId") ?? 0;

            try
            {
                var result = _purchaseOrderStarter.EnsureStarter(portalId, moduleId, actor.UserId);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Blog/Setup")]
        [Authorize(Roles = "Administrator")]
        public IActionResult SetupBlog([FromBody] JsonElement bodyElement)
        {
            var actor = GetCurrentUserContext();
            if (!IsAdmin(actor)) return Forbid();

            var body = ParseBody(bodyElement) ?? new JObject();
            var portalId = ResolvePortalId(body);
            var moduleId = body.Value<int?>("moduleId") ?? 0;
            var homeUrl = (body.Value<string>("homeUrl") ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(homeUrl))
                homeUrl = GetCurrentPageBaseUrl();

            try
            {
                var result = _configuredAppStarter.EnsureStarter("blog", portalId, moduleId, homeUrl, actor);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Launch")]
        [Authorize(Roles = "Administrator")]
        public IActionResult Launch([FromBody] JsonElement bodyElement)
        {
            var actor = GetCurrentUserContext();
            if (!IsAdmin(actor)) return Forbid();

            var body = ParseBody(bodyElement) ?? new JObject();
            var starterKey = (body.Value<string>("starterKey") ?? string.Empty).Trim();
            var portalId = ResolvePortalId(body);
            var moduleId = body.Value<int?>("moduleId") ?? 0;
            var homeUrl = (body.Value<string>("homeUrl") ?? string.Empty).Trim();
            var currentPageUrl = (body.Value<string>("currentPageUrl") ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(homeUrl))
                homeUrl = !string.IsNullOrWhiteSpace(currentPageUrl) ? currentPageUrl : GetCurrentPageBaseUrl();
            if (string.IsNullOrWhiteSpace(currentPageUrl))
                currentPageUrl = homeUrl;

            if (portalId < 0)
                return BadRequest(new { error = "Missing site context for starter launch." });
            if (moduleId <= 0)
                return BadRequest(new { error = "Missing module context for starter launch." });
            if (string.IsNullOrWhiteSpace(starterKey))
                return BadRequest(new { error = "starterKey is required." });

            try
            {
                var starter = EnsureStarterForLaunch(starterKey, portalId, moduleId, homeUrl, actor);
                var formId = ReadStarterInt(starter, "FormId");
                var defaultViewKey = ReadStarterString(starter, "DefaultViewKey");
                if (formId <= 0)
                    return BadRequest(new { error = "Starter app setup did not return a valid form." });

                BindStarterToModule(moduleId, formId, defaultViewKey);
                var redirectUrl = BuildStarterRedirectUrl(currentPageUrl, defaultViewKey);

                return Ok(new
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
                return BadRequest(new { error = ex.Message });
            }
        }

        // ── helpers ─────────────────────────────────────────────────────────

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

        private static int ParseUserId(ClaimsPrincipal user)
        {
            if (user == null) return -1;
            return int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub"), out var userId)
                ? userId
                : -1;
        }

        private static bool IsAdmin(UserContext actor)
        {
            return actor != null && (actor.IsAdmin || actor.IsSuperUser);
        }

        private int ResolvePortalId(JObject body = null)
        {
            var portalId = body?.Value<int?>("siteId") ?? 0;
            if (portalId <= 0)
                portalId = _ctx.PortalId;
            return portalId;
        }

        private string GetCurrentPageBaseUrl()
        {
            try
            {
                var request = HttpContext?.Request;
                if (request == null) return string.Empty;
                return request.Scheme + "://" + request.Host + request.PathBase + request.Path;
            }
            catch
            {
                return string.Empty;
            }
        }

        private object EnsureStarterForLaunch(string starterKey, int portalId, int moduleId, string homeUrl, UserContext actor)
        {
            var normalized = (starterKey ?? string.Empty).Trim().ToLowerInvariant();
            switch (normalized)
            {
                case "leave":
                case "leave-request":
                    return _leaveRequestStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                case "proposal":
                    return _proposalStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                case "documents":
                case "document":
                case "document-exchange":
                    return _documentExchangeStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                case "recruitment":
                case "recruitment-pipeline":
                    return _recruitmentStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                case "blog":
                case "blogs":
                case "blog-publishing":
                    return _configuredAppStarter.EnsureStarter("blog", portalId, moduleId, homeUrl, actor);
                default:
                    throw new InvalidOperationException("Unknown starter app.");
            }
        }

        private void BindStarterToModule(int moduleId, int formId, string selectedViewKey)
        {
            var cssClass = _moduleSettings.GetSetting(moduleId, "MegaForm_CssClass", _moduleSettings.GetSetting(moduleId, "CssClass", string.Empty));
            var existingViewConfig = _moduleSettings.GetSetting(moduleId, "MegaForm_ViewConfig", _moduleSettings.GetSetting(moduleId, "ViewConfig", string.Empty));
            var popupConfig = ParsePopupDisplayConfig(existingViewConfig);
            var formViews = formId > 0 ? (_phase2Repo.GetFormViews(formId) ?? new List<FormViewInfo>()) : new List<FormViewInfo>();

            popupConfig.SelectedViewKey = FormViewSelector.SanitizeSelectedViewKey(selectedViewKey, formViews);
            var nextViewConfig = BuildViewConfigForSave(existingViewConfig, popupConfig);
            if (formId > 0)
            {
                nextViewConfig = FormViewSelector.AttachSelectionMetadata(nextViewConfig, popupConfig.SelectedViewKey, formViews);
            }

            _moduleSettings.SetSetting(moduleId, "MegaForm_FormId", formId > 0 ? formId.ToString() : string.Empty);
            _moduleSettings.SetSetting(moduleId, "FormId", formId > 0 ? formId.ToString() : string.Empty);
            _moduleSettings.SetSetting(moduleId, "MegaForm_ViewType", "submit");
            _moduleSettings.SetSetting(moduleId, "ViewType", "submit");
            _moduleSettings.SetSetting(moduleId, "MegaForm_CssClass", cssClass);
            _moduleSettings.SetSetting(moduleId, "CssClass", cssClass);
            _moduleSettings.SetSetting(moduleId, "MegaForm_ViewConfig", nextViewConfig);
            _moduleSettings.SetSetting(moduleId, "ViewConfig", nextViewConfig);
            _moduleSettings.SetSetting(moduleId, "MegaForm_ModuleConfigured", "true");
            _moduleSettings.SetSetting(moduleId, "ModuleConfigured", "true");
        }

        private string BuildStarterRedirectUrl(string currentPageUrl, string defaultViewKey)
        {
            var baseUrl = !string.IsNullOrWhiteSpace(currentPageUrl) ? currentPageUrl : GetCurrentPageBaseUrl();
            if (string.IsNullOrWhiteSpace(baseUrl))
                baseUrl = "/";

            if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var absolute))
            {
                var request = HttpContext?.Request;
                if (request == null)
                    return baseUrl;
                var root = $"{request.Scheme}://{request.Host}";
                Uri.TryCreate(new Uri(root), baseUrl, out absolute);
            }

            if (absolute == null)
                return baseUrl;

            var target = new UriBuilder(absolute);
            var query = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(target.Query ?? string.Empty)
                .ToDictionary(pair => pair.Key, pair => pair.Value.ToString(), StringComparer.OrdinalIgnoreCase);
            query.Remove("view");
            query.Remove("formid");
            query.Remove("mfpanel");
            query.Remove("edit");
            if (!string.IsNullOrWhiteSpace(defaultViewKey))
                query["vk"] = defaultViewKey;
            else
                query.Remove("vk");
            target.Query = string.Join("&", query
                .Where(pair => !string.IsNullOrWhiteSpace(pair.Key))
                .Select(pair => Uri.EscapeDataString(pair.Key) + "=" + Uri.EscapeDataString(pair.Value ?? string.Empty)));
            return target.Uri.PathAndQuery + target.Fragment;
        }

        private static int ReadStarterInt(object starter, string propertyName)
        {
            if (starter == null || string.IsNullOrWhiteSpace(propertyName))
                return 0;
            var prop = starter.GetType().GetProperty(propertyName);
            if (prop == null) return 0;
            var value = prop.GetValue(starter);
            if (value is int intValue) return intValue;
            if (value is long longValue && longValue > 0 && longValue <= int.MaxValue) return (int)longValue;
            return int.TryParse(Convert.ToString(value), out var parsed) ? parsed : 0;
        }

        private static string ReadStarterString(object starter, string propertyName)
        {
            if (starter == null || string.IsNullOrWhiteSpace(propertyName))
                return string.Empty;
            var prop = starter.GetType().GetProperty(propertyName);
            return prop == null ? string.Empty : (Convert.ToString(prop.GetValue(starter)) ?? string.Empty).Trim();
        }

        private static JObject ParseBody(JsonElement bodyElement)
        {
            if (bodyElement.ValueKind == JsonValueKind.Undefined || bodyElement.ValueKind == JsonValueKind.Null)
                return null;
            try { return JObject.Parse(bodyElement.GetRawText()); }
            catch { return null; }
        }

        private sealed class PopupDisplayConfig
        {
            public string DisplayMode { get; set; } = "fixed";
            public string TriggerType { get; set; } = "time_delay";
            public int DelaySeconds { get; set; } = 5;
            public int ScrollPercent { get; set; } = 50;
            public string ClickSelector { get; set; } = string.Empty;
            public string PopupSize { get; set; } = "medium";
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

        private static PopupDisplayConfig ParsePopupDisplayConfig(string existingViewConfig)
        {
            if (string.IsNullOrWhiteSpace(existingViewConfig))
                return new PopupDisplayConfig();
            try
            {
                var json = JObject.Parse(existingViewConfig);
                var cfg = json["popup"]?.ToObject<PopupDisplayConfig>() ?? new PopupDisplayConfig();
                if (json["selectedViewKey"] != null)
                    cfg.SelectedViewKey = json.Value<string>("selectedViewKey") ?? string.Empty;
                return cfg;
            }
            catch
            {
                return new PopupDisplayConfig();
            }
        }

        private static string BuildViewConfigForSave(string existingViewConfig, PopupDisplayConfig popupConfig)
        {
            try
            {
                var json = string.IsNullOrWhiteSpace(existingViewConfig) ? new JObject() : JObject.Parse(existingViewConfig);
                json["popup"] = JObject.FromObject(popupConfig);
                json["selectedViewKey"] = popupConfig.SelectedViewKey;
                return json.ToString(Newtonsoft.Json.Formatting.None);
            }
            catch
            {
                var fallback = new JObject();
                fallback["popup"] = JObject.FromObject(popupConfig);
                fallback["selectedViewKey"] = popupConfig.SelectedViewKey;
                return fallback.ToString(Newtonsoft.Json.Formatting.None);
            }
        }
    }
}
