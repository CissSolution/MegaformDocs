using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Payments;
using Newtonsoft.Json.Linq;
using Oqtane.Infrastructure;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Controllers
{
    /// <summary>
    /// [PAY-2 v20260712] Oqtane payment gateway endpoints. The unified payment
    /// widget defaults to /api/megaform/payments/* (same contract as
    /// MegaForm.Web's PaymentController) — until this controller existed those
    /// calls 404'd on Oqtane and a form with a payment field simply could not
    /// charge anyone. All money rules live in the shared Core
    /// PaymentEndpointService (server-resolved price, per-IP rate limit,
    /// bounded gateway concurrency, idempotent Stripe create).
    ///
    /// Antiforgery: the checkout actions are [AllowAnonymous] +
    /// [IgnoreAntiforgeryToken] at ACTION level (public checkout is called by
    /// plain fetch from the rendered form, same as Submit; webhooks are called
    /// by Stripe/PayPal servers which cannot carry an antiforgery token —
    /// they authenticate via signature verification instead).
    ///
    /// STJ trap guard: every response body here is a Newtonsoft JObject
    /// (PayPal passthrough fields are JTokens), so responses are serialized
    /// explicitly with Newtonsoft via JsonPayload() — never bare Ok().
    /// </summary>
    [Route("api/megaform/payments")]
    public class PaymentController : ControllerBase
    {
        private readonly PaymentEndpointService _payments;
        private readonly PaymentWebhookService _webhooks;
        private readonly IFormRepository _formRepo;
        private readonly ITenantManager _tenantManager;

        public PaymentController(PaymentEndpointService payments, PaymentWebhookService webhooks,
            IFormRepository formRepo, ITenantManager tenantManager)
        {
            _payments = payments;
            _webhooks = webhooks;
            _formRepo = formRepo;
            _tenantManager = tenantManager;
        }

        // ── Checkout (public form path) ────────────────────────────────────

        [HttpPost("stripe/create-intent")]
        [AllowAnonymous]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> StripeCreateIntent([FromBody] JObject body)
        {
            var result = await _payments.StripeCreateIntentAsync(ResolveSiteId(body), body, ClientIp());
            return JsonPayload(result);
        }

        [HttpPost("stripe/confirm")]
        [AllowAnonymous]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> StripeConfirm([FromBody] JObject body)
        {
            var result = await _payments.StripeConfirmAsync(ResolveSiteId(body), body, ClientIp());
            return JsonPayload(result);
        }

        [HttpGet("paypal/public-config")]
        [AllowAnonymous]
        public IActionResult PayPalPublicConfig()
        {
            return JsonPayload(_payments.PayPalPublicConfig(ResolveSiteId(null)));
        }

        [HttpPost("paypal/create-order")]
        [AllowAnonymous]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> PayPalCreateOrder([FromBody] JObject body)
        {
            var result = await _payments.PayPalCreateOrderAsync(ResolveSiteId(body), body, ClientIp());
            return JsonPayload(result);
        }

        [HttpPost("paypal/capture-order")]
        [AllowAnonymous]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> PayPalCaptureOrder([FromBody] JObject body)
        {
            var result = await _payments.PayPalCaptureOrderAsync(ResolveSiteId(body), body, ClientIp());
            return JsonPayload(result);
        }

        // ── Admin diagnostics ──────────────────────────────────────────────

        [HttpPost("paypal/test-credentials")]
        [Authorize]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> PayPalTestCredentials([FromBody] JObject body)
        {
            // Accepts credential overrides from the body → admin only.
            if (!User.IsInRole(RoleNames.Admin) && !User.IsInRole(RoleNames.Host))
                return Forbid();
            var result = await _payments.PayPalTestCredentialsAsync(ResolveSiteId(body), body);
            return JsonPayload(result);
        }

        // ── Gateway webhooks (server-to-server, signature-verified) ────────

        [HttpPost("stripe/webhook")]
        [AllowAnonymous]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> StripeWebhook()
        {
            string payload;
            using (var reader = new StreamReader(Request.Body))
            {
                payload = await reader.ReadToEndAsync();
            }
            var signature = Request.Headers["Stripe-Signature"].ToString();
            var result = _webhooks.HandleStripe(ResolveSiteIdFromQuery(), payload, signature);
            return JsonPayload(result);
        }

        [HttpPost("paypal/webhook")]
        [AllowAnonymous]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> PayPalWebhook()
        {
            string payload;
            using (var reader = new StreamReader(Request.Body))
            {
                payload = await reader.ReadToEndAsync();
            }
            var result = await _webhooks.HandlePayPalAsync(
                ResolveSiteIdFromQuery(),
                payload,
                Request.Headers["PAYPAL-TRANSMISSION-ID"].ToString(),
                Request.Headers["PAYPAL-TRANSMISSION-TIME"].ToString(),
                Request.Headers["PAYPAL-TRANSMISSION-SIG"].ToString(),
                Request.Headers["PAYPAL-CERT-URL"].ToString(),
                Request.Headers["PAYPAL-AUTH-ALGO"].ToString());
            return JsonPayload(result);
        }

        // ── Helpers ────────────────────────────────────────────────────────

        /// <summary>Site whose payment keys apply: the form's site when the body
        /// names a form, else the current alias, else site 1.</summary>
        private int ResolveSiteId(JObject body)
        {
            try
            {
                var formId = body != null ? (body.Value<int?>("formId") ?? 0) : 0;
                if (formId > 0)
                {
                    var form = _formRepo.GetForm(formId);
                    if (form != null && form.PortalId > 0) return form.PortalId;
                }
            }
            catch { }
            return ResolveSiteIdFromQuery();
        }

        private int ResolveSiteIdFromQuery()
        {
            try
            {
                int siteId;
                if (int.TryParse(Request.Query["siteId"], out siteId) && siteId > 0) return siteId;
                var alias = _tenantManager != null ? _tenantManager.GetAlias() : null;
                if (alias != null && alias.SiteId > 0) return alias.SiteId;
            }
            catch { }
            return 1;
        }

        private string ClientIp()
        {
            try { return HttpContext.Connection.RemoteIpAddress?.ToString() ?? "?"; }
            catch { return "?"; }
        }

        /// <summary>Newtonsoft-serialized response — [reference_oqtane_stj_no_raw_jobject]
        /// STJ mangles JTokens returned through bare Ok().</summary>
        private IActionResult JsonPayload(PaymentApiResult result)
        {
            var token = result.Payload as JToken;
            var content = token != null
                ? token.ToString(Newtonsoft.Json.Formatting.None)
                : Newtonsoft.Json.JsonConvert.SerializeObject(result.Payload);
            return new ContentResult
            {
                Content = content,
                ContentType = "application/json",
                StatusCode = result.StatusCode
            };
        }
    }
}
