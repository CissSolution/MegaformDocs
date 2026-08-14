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
        private static readonly HttpClient OllamaHttp = new HttpClient
        {
            Timeout = System.TimeSpan.FromMinutes(5)
        };

        private bool IsAdmin
        {
            get
            {
                var u = UserInfo;
                return u != null && (u.IsSuperUser || u.IsInRole("Administrators"));
            }
        }

        /// <summary>
        /// [ProductionUnlocksAi v20260726] All endpoints refuse to respond unless the install is
        /// production-licensed (or an unlicensed DEV machine carrying dev.lock — see AiFeatureGate).
        /// Returns 404 so the gate is indistinguishable from the controller not existing at all.
        /// </summary>
        private HttpResponseMessage RejectIfDisabled()
        {
            var enabled = MegaForm.Core.Services.AiAssistant.AiFeatureGate.IsAvailable(
                PortalSettings != null ? PortalSettings.HomeDirectoryMapPath : null);
            if (enabled) return null;
            return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "AI assistant is not available on this install (a production licence is required)." });
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
                ? MegaForm.Core.Services.AiAssistant.AiFeatureGate.IsAvailable(
                    PortalSettings != null ? PortalSettings.HomeDirectoryMapPath : null)
                : string.Equals(rawEnabled, "true", System.StringComparison.OrdinalIgnoreCase);
            // [TrialTighten v20260724] DNN parity with Oqtane: AI is a licensed feature. On a trial
            // (unlicensed) install we never hand out the API key and force enabled=false, so the
            // assistant/form-creator cannot actually run even if a client were bypassed. The `trial`
            // flag lets the builder show a locked "Upgrade" CTA. Production = license.lic OR a valid
            // Marketplace key (LicenseService.IsProductionLicensed).
            var trialLocked = MegaForm.Core.Services.LicenseService.IsTrial();
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                provider = cfg.Provider,
                baseUrl = cfg.BaseUrl,
                model = cfg.Model,
                apiKey = trialLocked ? string.Empty : cfg.ApiKey,
                enabled = enabled && !trialLocked,
                trial = trialLocked,
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

        /// <summary>
        /// Same-origin relay for the OpenAI-compatible Ollama endpoint. The browser supplies only
        /// the chat body; URL and optional bearer credential come from host settings.
        /// </summary>
        [HttpPost]
        [DnnAuthorize(StaticRoles = "Administrators")]
        [ActionName("OllamaProxyChat")]
        public async System.Threading.Tasks.Task<HttpResponseMessage> OllamaProxyChat()
        {
            var gate = RejectIfDisabled();
            if (gate != null) return gate;
            if (!IsAdmin)
                return Request.CreateResponse(HttpStatusCode.Forbidden,
                    new { error = "Administrators only." });

            var host = DotNetNuke.Entities.Controllers.HostController.Instance;
            var configuredBase = host.GetString(OllamaProxy.BaseUrlSettingKey, string.Empty);
            string target;
            string error;
            if (!OllamaProxy.TryResolveChatUrl(configuredBase, out target, out error))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error });

            var body = await Request.Content.ReadAsStringAsync();
            if (string.IsNullOrWhiteSpace(body)) body = "{}";
            if (body.Length > 2000000)
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "Request body too large." });

            try
            {
                using (var outbound = new HttpRequestMessage(HttpMethod.Post, target))
                {
                    outbound.Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
                    var apiKey = host.GetString(OllamaProxy.ApiKeySettingKey, string.Empty);
                    if (!string.IsNullOrWhiteSpace(apiKey))
                        outbound.Headers.TryAddWithoutValidation("Authorization", "Bearer " + apiKey.Trim());

                    using (var response = await OllamaHttp.SendAsync(outbound))
                    {
                        var responseBody = await response.Content.ReadAsStringAsync();
                        return new HttpResponseMessage(response.StatusCode)
                        {
                            Content = new StringContent(responseBody, System.Text.Encoding.UTF8,
                                "application/json")
                        };
                    }
                }
            }
            catch
            {
                return Request.CreateResponse(HttpStatusCode.BadGateway, new
                {
                    error = "Cannot reach the local Ollama endpoint. Ensure Ollama is running and the server-side Ollama URL is correct."
                });
            }
        }
    }
}
