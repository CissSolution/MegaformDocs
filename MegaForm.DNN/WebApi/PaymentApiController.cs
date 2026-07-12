using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using System.Web.Http;
using DotNetNuke.Security;
using DotNetNuke.Web.Api;
using MegaForm.Core.Payments;
using MegaForm.DNN.Services;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    /// <summary>
    /// [PAY-2 v20260712] DNN payment gateway endpoints. DNN stored Stripe/PayPal
    /// keys for months but had NO gateway endpoints — a form with a payment
    /// field rendered, then every checkout call 404'd. Routes are registered in
    /// MegaFormRouteMapper as payments/* so the public URLs mirror the other
    /// platforms:
    ///   POST /DesktopModules/MegaForm/API/payments/stripe/create-intent
    ///   POST /DesktopModules/MegaForm/API/payments/stripe/confirm
    ///   GET  /DesktopModules/MegaForm/API/payments/paypal/public-config
    ///   POST /DesktopModules/MegaForm/API/payments/paypal/test-credentials  (admin)
    ///   POST /DesktopModules/MegaForm/API/payments/paypal/create-order
    ///   POST /DesktopModules/MegaForm/API/payments/paypal/capture-order
    ///   POST /DesktopModules/MegaForm/API/payments/stripe/webhook
    ///   POST /DesktopModules/MegaForm/API/payments/paypal/webhook
    ///
    /// [AllowAnonymous] is deliberate on the checkout actions (ACTION level, so
    /// it cannot switch off the admin gate on test-credentials): they sit on the
    /// public form path (same as Submit/Upload-File) and every money decision
    /// is made server-side in the shared Core PaymentEndpointService
    /// (server-resolved price, per-IP rate limit, bounded gateway concurrency).
    /// Webhooks are called by Stripe/PayPal servers and authenticate via
    /// signature verification, not DNN auth.
    /// </summary>
    public class PaymentController : DnnApiController
    {
        private static PaymentEndpointService Payments
        {
            get
            {
                var locator = DnnServiceLocator.Instance;
                return new PaymentEndpointService(locator.PaymentStore, locator.FormRepo, locator.PaymentGateway, locator.LogService);
            }
        }

        private static PaymentWebhookService Webhooks
        {
            get
            {
                var locator = DnnServiceLocator.Instance;
                return new PaymentWebhookService(locator.PaymentStore, locator.PaymentGateway, locator.LogService);
            }
        }

        // ── Checkout (public form path) ────────────────────────────────────

        [HttpPost]
        [ActionName("StripeCreateIntent")]
        [AllowAnonymous]
        public async Task<HttpResponseMessage> StripeCreateIntent([FromBody] JObject body)
        {
            var result = await Payments.StripeCreateIntentAsync(ResolvePortalId(body), body, ClientIp());
            return ToResponse(result);
        }

        [HttpPost]
        [ActionName("StripeConfirm")]
        [AllowAnonymous]
        public async Task<HttpResponseMessage> StripeConfirm([FromBody] JObject body)
        {
            var result = await Payments.StripeConfirmAsync(ResolvePortalId(body), body, ClientIp());
            return ToResponse(result);
        }

        [HttpGet]
        [ActionName("PayPalPublicConfig")]
        [AllowAnonymous]
        public HttpResponseMessage PayPalPublicConfig()
        {
            return ToResponse(Payments.PayPalPublicConfig(ResolvePortalId(null)));
        }

        [HttpPost]
        [ActionName("PayPalCreateOrder")]
        [AllowAnonymous]
        public async Task<HttpResponseMessage> PayPalCreateOrder([FromBody] JObject body)
        {
            var result = await Payments.PayPalCreateOrderAsync(ResolvePortalId(body), body, ClientIp());
            return ToResponse(result);
        }

        [HttpPost]
        [ActionName("PayPalCaptureOrder")]
        [AllowAnonymous]
        public async Task<HttpResponseMessage> PayPalCaptureOrder([FromBody] JObject body)
        {
            var result = await Payments.PayPalCaptureOrderAsync(ResolvePortalId(body), body, ClientIp());
            return ToResponse(result);
        }

        // ── Admin diagnostics (accepts credential overrides → admin only) ──

        [HttpPost]
        [ActionName("PayPalTestCredentials")]
        [DnnAuthorize(StaticRoles = "Administrators")]
        public async Task<HttpResponseMessage> PayPalTestCredentials([FromBody] JObject body)
        {
            var result = await Payments.PayPalTestCredentialsAsync(ResolvePortalId(body), body);
            return ToResponse(result);
        }

        // ── Gateway webhooks (server-to-server, signature-verified) ────────

        [HttpPost]
        [ActionName("StripeWebhook")]
        [AllowAnonymous]
        public async Task<HttpResponseMessage> StripeWebhook()
        {
            var payload = await Request.Content.ReadAsStringAsync();
            string signature = null;
            System.Collections.Generic.IEnumerable<string> values;
            if (Request.Headers.TryGetValues("Stripe-Signature", out values))
            {
                foreach (var v in values) { signature = v; break; }
            }
            var result = Webhooks.HandleStripe(ResolvePortalId(null), payload, signature);
            return ToResponse(result);
        }

        [HttpPost]
        [ActionName("PayPalWebhook")]
        [AllowAnonymous]
        public async Task<HttpResponseMessage> PayPalWebhook()
        {
            var payload = await Request.Content.ReadAsStringAsync();
            var result = await Webhooks.HandlePayPalAsync(
                ResolvePortalId(null),
                payload,
                Header("PAYPAL-TRANSMISSION-ID"),
                Header("PAYPAL-TRANSMISSION-TIME"),
                Header("PAYPAL-TRANSMISSION-SIG"),
                Header("PAYPAL-CERT-URL"),
                Header("PAYPAL-AUTH-ALGO"));
            return ToResponse(result);
        }

        // ── Helpers ────────────────────────────────────────────────────────

        private string Header(string name)
        {
            System.Collections.Generic.IEnumerable<string> values;
            if (Request.Headers.TryGetValues(name, out values))
            {
                foreach (var v in values) return v;
            }
            return string.Empty;
        }

        /// <summary>Portal whose payment keys apply: the form's portal when the
        /// body names a form, else the request's portal.</summary>
        private int ResolvePortalId(JObject body)
        {
            try
            {
                var formId = body != null ? (body.Value<int?>("formId") ?? 0) : 0;
                if (formId > 0)
                {
                    var form = DnnServiceLocator.Instance.FormRepo.GetForm(formId);
                    if (form != null && form.PortalId >= 0) return form.PortalId;
                }
            }
            catch { }
            return PortalSettings != null ? PortalSettings.PortalId : 0;
        }

        private string ClientIp()
        {
            try
            {
                var ctx = System.Web.HttpContext.Current;
                return ctx != null && ctx.Request != null ? (ctx.Request.UserHostAddress ?? "?") : "?";
            }
            catch { return "?"; }
        }

        private HttpResponseMessage ToResponse(PaymentApiResult result)
        {
            // DNN WebApi serializes with Newtonsoft — JObject payloads are safe here.
            return Request.CreateResponse((HttpStatusCode)result.StatusCode, result.Payload);
        }
    }
}
