using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Web.Api;
using MegaForm.Core.Services.AiAssistant;
using MegaForm.DNN.Services;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    /// <summary>
    /// REST surface for the MegaForm AI Form Assistant.
    /// All real AI traffic happens browser → provider (OpenAI/Claude/etc.) —
    /// this controller only bootstraps the client config and persists admin
    /// settings to HostSettings. Mirrors the ACME ContentBuilderController
    /// pattern (E:\CISS.SideMenu.Nuget_GPT\src\Oqtane\Server) but adapted to
    /// DNN's DnnApiController + HostSettings.
    ///
    /// Route prefix: /DesktopModules/MegaForm/API/AiAssistant/{action}
    /// </summary>
    [DnnAuthorize]
    public class AiAssistantController : DnnApiController
    {
        private readonly IAiAssistantService _svc = new DnnAiAssistantService();

        private bool IsAdmin
        {
            get
            {
                var u = UserInfo;
                return u != null && (u.IsSuperUser || u.IsInRole("Administrators"));
            }
        }

        /// <summary>
        /// [AiFeatureGate v20260527-08] All endpoints refuse to respond when
        /// the install has no dev.lock marker. Returns 404 so the gate is
        /// indistinguishable from the controller not existing at all.
        /// </summary>
        private HttpResponseMessage RejectIfDisabled()
        {
            var enabled = MegaForm.Core.Services.AiAssistant.AiFeatureGate.IsEnabled(
                PortalSettings != null ? PortalSettings.HomeDirectoryMapPath : null);
            if (enabled) return null;
            return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "AI assistant disabled (no dev.lock)" });
        }

        /// <summary>
        /// GET /AiAssistant/DefaultConfig?portalId=N
        /// Returns the server-side default AI config. Includes the API key
        /// only for administrators/super-users (so anonymous/regular users
        /// can't exfiltrate the key by polling this endpoint).
        /// </summary>
        [HttpGet]
        [ActionName("DefaultConfig")]
        public HttpResponseMessage GetDefaultConfig()
        {
            var gate = RejectIfDisabled();
            if (gate != null) return gate;
            var portalId = PortalSettings != null ? PortalSettings.PortalId : 0;
            var cfg = _svc.GetDefaultConfig(portalId, includeApiKey: IsAdmin);
            // [v20260607-B84] enabled: stored toggle wins; when never saved,
            // default to the dev.lock gate so existing installs keep the chatbot.
            var rawEnabled = DotNetNuke.Entities.Controllers.HostController.Instance.GetString(AiSettingKeys.Enabled, string.Empty);
            var enabled = string.IsNullOrEmpty(rawEnabled)
                ? MegaForm.Core.Services.AiAssistant.AiFeatureGate.IsEnabled(
                    PortalSettings != null ? PortalSettings.HomeDirectoryMapPath : null)
                : string.Equals(rawEnabled, "true", System.StringComparison.OrdinalIgnoreCase);
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                provider = cfg.Provider,
                baseUrl = cfg.BaseUrl,
                model = cfg.Model,
                apiKey = cfg.ApiKey,
                enabled,
            });
        }

        /// <summary>
        /// POST /AiAssistant/DefaultConfig
        /// Persists the host-level default config (admin only).
        /// Body: { provider, baseUrl, model, apiKey }.
        /// </summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        [DnnAuthorize(StaticRoles = "Administrators")]
        [ActionName("DefaultConfig")]
        public HttpResponseMessage SaveDefaultConfig([FromBody] JObject body)
        {
            var gate = RejectIfDisabled();
            if (gate != null) return gate;
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });
            var cfg = new AiClientDefaultConfig
            {
                Provider = body.Value<string>("provider") ?? "openai",
                BaseUrl = body.Value<string>("baseUrl") ?? string.Empty,
                Model = body.Value<string>("model") ?? string.Empty,
                ApiKey = body.Value<string>("apiKey") ?? string.Empty,
                Enabled = body.Value<bool?>("enabled") ?? false,
            };
            var portalId = PortalSettings != null ? PortalSettings.PortalId : 0;
            _svc.SaveDefaultConfig(portalId, cfg);
            return Request.CreateResponse(HttpStatusCode.OK, new { ok = true });
        }
    }
}
