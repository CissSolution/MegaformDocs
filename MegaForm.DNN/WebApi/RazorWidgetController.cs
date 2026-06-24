// MegaForm Razor Widget — DNN proxy controller
// ──────────────────────────────────────────────────────────────────────
// DNN runs on net472; the Blazor HtmlRenderer (Microsoft.AspNetCore.
// Components.Web) requires net8+, so we can't natively render .razor
// templates in-process on DNN. Phase 1 ships a transparent HTTP proxy:
// the DNN controller forwards /List + /Render to a sibling Oqtane host
// configured via the portal setting `MegaForm_RazorWidget_OqtaneUrl`
// (default: http://localhost:5050). Customers running both DNN +
// Oqtane (typical setup when moving off a legacy tag-language widget)
// get the full feature set; pure-DNN customers get a clear
// "companion required" error +
// installer doc link. Phase 2 will replace the proxy with a native
// classic-Razor renderer for DNN-only deployments.
//
// Routes:
//   GET  /DesktopModules/MegaForm/API/RazorWidget/List
//   POST /DesktopModules/MegaForm/API/RazorWidget/Render
using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using System.Web.Http;
using DotNetNuke.Entities.Portals;
using DotNetNuke.Web.Api;

namespace MegaForm.WebApi
{
    public class RazorWidgetController : DnnApiController
    {
        private const string DefaultOqtaneUrl = "http://localhost:5050";
        private const string PortalSettingKey = "MegaForm_RazorWidget_OqtaneUrl";

        private string CompanionBaseUrl()
        {
            var portalId = PortalSettings?.PortalId ?? -1;
            var v = PortalController.GetPortalSetting(PortalSettingKey, portalId, DefaultOqtaneUrl);
            if (string.IsNullOrWhiteSpace(v)) v = DefaultOqtaneUrl;
            return v.TrimEnd('/');
        }

        // ── List ──────────────────────────────────────────────────────────
        [HttpGet]
        [ActionName("List")]
        [AllowAnonymous]
        public async Task<HttpResponseMessage> List()
        {
            var url = $"{CompanionBaseUrl()}/api/MegaFormPopup/RazorWidget/List";
            try
            {
                using (var client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) })
                {
                    var resp = await client.GetAsync(url).ConfigureAwait(false);
                    var json = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                    return BuildResponse(resp.StatusCode, json);
                }
            }
            catch (Exception ex)
            {
                return CompanionError(ex, url);
            }
        }

        // ── Source ────────────────────────────────────────────────────────
        [HttpGet]
        [ActionName("Source")]
        [AllowAnonymous]
        public async Task<HttpResponseMessage> Source(string name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "name required" });

            var url = $"{CompanionBaseUrl()}/api/MegaFormPopup/RazorWidget/Source?name={WebUtility.UrlEncode(name)}";
            try
            {
                using (var client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) })
                {
                    var resp = await client.GetAsync(url).ConfigureAwait(false);
                    var json = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                    return BuildResponse(resp.StatusCode, json);
                }
            }
            catch (Exception ex)
            {
                return CompanionError(ex, url);
            }
        }

        // ── Render ────────────────────────────────────────────────────────
        [HttpPost]
        [AllowAnonymous]
        [ActionName("Render")]
        public async Task<HttpResponseMessage> Render()
        {
            var url = $"{CompanionBaseUrl()}/api/MegaFormPopup/RazorWidget/Render";
            string body;
            using (var sr = new StreamReader(await Request.Content.ReadAsStreamAsync().ConfigureAwait(false), Encoding.UTF8))
                body = await sr.ReadToEndAsync().ConfigureAwait(false);

            try
            {
                using (var client = new HttpClient { Timeout = TimeSpan.FromSeconds(15) })
                {
                    var content = new StringContent(body ?? "{}", Encoding.UTF8, "application/json");
                    var resp = await client.PostAsync(url, content).ConfigureAwait(false);
                    var json = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                    return BuildResponse(resp.StatusCode, json);
                }
            }
            catch (Exception ex)
            {
                return CompanionError(ex, url);
            }
        }

        // ── Action ────────────────────────────────────────────────────────
        [HttpPost]
        [AllowAnonymous]
        [ActionName("Action")]
        public async Task<HttpResponseMessage> Action()
        {
            return await ForwardJsonPost("Action").ConfigureAwait(false);
        }

        // ── Compile ───────────────────────────────────────────────────────
        [HttpPost]
        [AllowAnonymous]
        [ActionName("Compile")]
        public async Task<HttpResponseMessage> Compile()
        {
            return await ForwardJsonPost("Compile").ConfigureAwait(false);
        }

        // ── Export ────────────────────────────────────────────────────────
        [HttpPost]
        [AllowAnonymous]
        [ActionName("Export")]
        public async Task<HttpResponseMessage> Export()
        {
            var url = $"{CompanionBaseUrl()}/api/MegaFormPopup/RazorWidget/Export";
            string body;
            using (var sr = new StreamReader(await Request.Content.ReadAsStreamAsync().ConfigureAwait(false), Encoding.UTF8))
                body = await sr.ReadToEndAsync().ConfigureAwait(false);

            try
            {
                using (var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) })
                {
                    var content = new StringContent(body ?? "{}", Encoding.UTF8, "application/json");
                    var resp = await client.PostAsync(url, content).ConfigureAwait(false);
                    var bytes = await resp.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
                    var msg = Request.CreateResponse(resp.StatusCode);
                    msg.Content = new ByteArrayContent(bytes);
                    msg.Content.Headers.ContentType = MediaTypeHeaderValue.Parse("text/csv; charset=utf-8");
                    if (resp.Content.Headers.ContentDisposition != null)
                        msg.Content.Headers.ContentDisposition = resp.Content.Headers.ContentDisposition;
                    return msg;
                }
            }
            catch (Exception ex)
            {
                return CompanionError(ex, url);
            }
        }

        // ── Preview ───────────────────────────────────────────────────────
        [HttpGet]
        [AllowAnonymous]
        [ActionName("Preview")]
        public async Task<HttpResponseMessage> Preview()
        {
            var url = $"{CompanionBaseUrl()}/api/MegaFormPopup/RazorWidget/Preview";
            try
            {
                using (var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) })
                {
                    var resp = await client.GetAsync(url).ConfigureAwait(false);
                    var html = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                    var msg = Request.CreateResponse(resp.StatusCode);
                    msg.Content = new StringContent(html ?? string.Empty, Encoding.UTF8, "text/html");
                    return msg;
                }
            }
            catch (Exception ex)
            {
                return CompanionError(ex, url);
            }
        }

        private async Task<HttpResponseMessage> ForwardJsonPost(string action)
        {
            var url = $"{CompanionBaseUrl()}/api/MegaFormPopup/RazorWidget/{action}";
            string body;
            using (var sr = new StreamReader(await Request.Content.ReadAsStreamAsync().ConfigureAwait(false), Encoding.UTF8))
                body = await sr.ReadToEndAsync().ConfigureAwait(false);

            try
            {
                using (var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) })
                {
                    var content = new StringContent(body ?? "{}", Encoding.UTF8, "application/json");
                    var resp = await client.PostAsync(url, content).ConfigureAwait(false);
                    var json = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                    return BuildResponse(resp.StatusCode, json);
                }
            }
            catch (Exception ex)
            {
                return CompanionError(ex, url);
            }
        }

        private HttpResponseMessage BuildResponse(HttpStatusCode status, string json)
        {
            var msg = Request.CreateResponse(status);
            msg.Content = new StringContent(json ?? string.Empty, Encoding.UTF8, "application/json");
            return msg;
        }

        private HttpResponseMessage CompanionError(Exception ex, string url)
        {
            var payload = new
            {
                error = "Razor companion service unreachable",
                companionUrl = url,
                detail = ex.Message,
                hint = $"Set portal setting '{PortalSettingKey}' to the URL of a running MegaForm Oqtane host, or install the companion locally. Default: {DefaultOqtaneUrl}",
            };
            var msg = Request.CreateResponse(HttpStatusCode.ServiceUnavailable, payload);
            return msg;
        }
    }
}
