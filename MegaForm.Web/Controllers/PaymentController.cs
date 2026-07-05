using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Globalization;
using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Web.Controllers
{
    /// <summary>
    /// Payment gateway proxy endpoints.
    /// Called by megaform-widget-stripe.js and megaform-widget-paypal.js (Pro version).
    ///
    /// Routes (match widget defaults exactly):
    ///   POST /api/megaform/payments/stripe/create-intent
    ///   POST /api/megaform/payments/stripe/confirm
    ///   POST /api/megaform/payments/paypal/create-order
    ///   POST /api/megaform/payments/paypal/capture-order
    ///
    /// Config in appsettings.json / appsettings.Production.json:
    ///   "Payment": {
    ///     "Stripe": { "SecretKey": "sk_live_..." },
    ///     "PayPal": {
    ///       "ClientId":     "...",
    ///       "ClientSecret": "...",
    ///       "Mode":         "live"   // or "sandbox"
    ///     }
    ///   }
    /// </summary>
    [ApiController]
    [Route("api/megaform/payments")]
    public class PaymentController : ControllerBase
    {
        private readonly IConfiguration _cfg;
        private readonly IModuleSettingsService _settings;
        private readonly IFormRepository _formRepo;
        // [PerfFix 2026-07-05 PERF-C5] Bound the request time (was default 100s → a degraded Stripe/PayPal
        // endpoint pinned a request thread up to 100s → thread-pool starvation during a provider incident).
        private static readonly HttpClient _http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };

        public PaymentController(IConfiguration cfg, IModuleSettingsService settings, IFormRepository formRepo)
        {
            _cfg = cfg;
            _settings = settings;
            _formRepo = formRepo;
        }

        // Helper: DB setting takes priority over appsettings
        private string GetKey(string dbKey, string cfgPath)
        {
            var dbVal = NormalizeStoredSetting(_settings.GetSetting(0, dbKey));
            if (!string.IsNullOrWhiteSpace(dbVal)) return dbVal;
            return NormalizeStoredSetting(_cfg[cfgPath]);
        }

        // ══════════════════════════════════════════════════════════════════
        //  [SecFix 2026-07-04 P0-2] Server-side price enforcement (amount tampering)
        // ══════════════════════════════════════════════════════════════════
        /// <summary>
        /// Re-derive the payment amount/currency server-side from the saved form schema so a tampered
        /// client "amount" cannot lower the charge. For a FIXED payment field (widgetProps.amountMode
        /// == "fixed", or unspecified but with a stored amount) the schema amount/currency are enforced.
        /// Variable modes ("field"/"listenTotals") are computed client-side and cannot be re-derived from
        /// the schema alone, so the client amount is preserved (donations / user-entered totals keep working).
        /// [SecFix 2026-07-05 SEC-B2] Missing form context now fails CLOSED (see below). The remaining
        /// fail-open branches (form/field unresolvable, variable modes, legacy fixed-with-no-price) are
        /// documented residuals: the hard enforcement kicks in whenever a fixed-price field IS resolvable.
        /// Returns (amount, currency-or-null-to-keep-client, error-or-null-to-reject).
        /// </summary>
        private (decimal amount, string currency, string error) ResolveServerAmount(JObject body, decimal clientAmount, string clientCurrency)
        {
            var formId   = body?["formId"]?.Value<int?>() ?? 0;
            var fieldKey = body?["fieldKey"]?.Value<string>();
            // [SecFix 2026-07-05 SEC-B2] FAIL-CLOSED on missing form context. Previously this fail-opened,
            // which made the P0-2 enforcement a NO-OP because the payment widget never sent formId → every
            // request took this branch and trusted the (tamperable) client amount. The unified payment widget
            // now always sends formId+fieldKey (data-mf-form-id), so an absent context = hand-crafted/tampered
            // request → reject it. NOTE: requires the rebuilt payment plugin + bumped AssetVersion to ship
            // together (stale client bundle would omit formId and be rejected). See REMEDIATION_PLAN §S0.2.
            if (formId <= 0 || string.IsNullOrWhiteSpace(fieldKey))
                return (clientAmount, clientCurrency, "Payment form context (formId/fieldKey) is required.");

            FormSchema schema;
            try
            {
                var form = _formRepo.GetForm(formId);
                if (form == null || string.IsNullOrWhiteSpace(form.SchemaJson))
                    return (clientAmount, clientCurrency, null);
                schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson);
            }
            catch
            {
                // Lookup/parse failure → fail-open (never break checkout on an infra hiccup).
                return (clientAmount, clientCurrency, null);
            }

            var field = FindFieldByKey(schema?.Fields, fieldKey);
            if (field == null || field.WidgetProps == null)
                return (clientAmount, clientCurrency, null);

            var mode = GetProp(field.WidgetProps, "amountMode");
            // Variable modes: price is computed client-side; nothing authoritative to enforce.
            if (string.Equals(mode, "field", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(mode, "listenTotals", StringComparison.OrdinalIgnoreCase))
                return (clientAmount, clientCurrency, null);

            // Fixed (or unspecified but with a stored amount): ENFORCE the schema amount/currency.
            var raw = GetProp(field.WidgetProps, "amount");
            if (!string.IsNullOrWhiteSpace(raw) &&
                decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var schemaAmount) &&
                schemaAmount > 0m)
            {
                var schemaCurrency = GetProp(field.WidgetProps, "currency");
                return (schemaAmount, string.IsNullOrWhiteSpace(schemaCurrency) ? clientCurrency : schemaCurrency, null);
            }

            // amountMode missing AND no stored amount → legacy fixed widget with no price on record;
            // preserve the client value rather than breaking existing donation/legacy forms.
            return (clientAmount, clientCurrency, null);
        }

        /// <summary>Depth-first find a field by key, recursing into Row → Columns → Fields.</summary>
        private static FormField FindFieldByKey(List<FormField> fields, string key)
        {
            if (fields == null) return null;
            foreach (var f in fields)
            {
                if (f == null) continue;
                if (string.Equals(f.Key, key, StringComparison.OrdinalIgnoreCase)) return f;
                if (f.Columns != null)
                {
                    foreach (var col in f.Columns)
                    {
                        var hit = FindFieldByKey(col?.Fields, key);
                        if (hit != null) return hit;
                    }
                }
            }
            return null;
        }

        /// <summary>Read a boxed widgetProp value as an invariant string (values arrive as JValue/boxed).</summary>
        private static string GetProp(Dictionary<string, object> props, string key)
        {
            if (props == null || !props.TryGetValue(key, out var v) || v == null) return null;
            return Convert.ToString(v, CultureInfo.InvariantCulture);
        }

        // ══════════════════════════════════════════════════════════════════
        //  STRIPE — Create PaymentIntent
        //  POST /api/megaform/payments/stripe/create-intent
        // ══════════════════════════════════════════════════════════════════
        [HttpPost("stripe/create-intent")]
        public async Task<IActionResult> StripeCreateIntent([FromBody] JObject body)
        {
            try
            {
                var secretKey = GetKey("Payment_Stripe_SecretKey", "Payment:Stripe:SecretKey");
                if (string.IsNullOrWhiteSpace(secretKey))
                    return BadRequest(new { error = "Stripe secret key not configured. Add Payment:Stripe:SecretKey to appsettings." });

                var amount   = body["amount"]?.Value<double>() ?? 0;
                var currency = (body["currency"]?.Value<string>() ?? "USD").ToLower();
                var fieldKey = body["fieldKey"]?.Value<string>() ?? "payment";

                // [SecFix 2026-07-04 P0-2] Amount-tampering fix. Re-derive the price server-side from the
                // saved schema: for a FIXED payment field (widgetProps.amountMode=="fixed") the schema
                // amount/currency are enforced and the tampered body values are ignored. Variable modes
                // ("field"/"listenTotals") are computed client-side and are preserved. See ResolveServerAmount.
                var (serverAmount, serverCurrency, priceErr) = ResolveServerAmount(body, (decimal)amount, currency);
                if (priceErr != null) return BadRequest(new { error = priceErr });
                amount = (double)serverAmount;
                if (!string.IsNullOrWhiteSpace(serverCurrency)) currency = serverCurrency.ToLowerInvariant();

                if (amount <= 0)
                    return BadRequest(new { error = "Amount must be greater than 0." });

                // Stripe amounts are in smallest currency unit (cents for USD)
                var amountInt = (int)Math.Round(amount * 100);

                // Call Stripe API
                var req = new HttpRequestMessage(HttpMethod.Post, "https://api.stripe.com/v1/payment_intents");
                req.Headers.Add("Authorization", "Bearer " + secretKey);

                var formData = new System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<string, string>>
                {
                    new System.Collections.Generic.KeyValuePair<string, string>("amount",   amountInt.ToString()),
                    new System.Collections.Generic.KeyValuePair<string, string>("currency", currency),
                    new System.Collections.Generic.KeyValuePair<string, string>("metadata[fieldKey]", fieldKey),
                    new System.Collections.Generic.KeyValuePair<string, string>("automatic_payment_methods[enabled]", "true"),
                };
                req.Content = new FormUrlEncodedContent(formData);

                var resp = await _http.SendAsync(req);
                var json = await resp.Content.ReadAsStringAsync();

                if (!resp.IsSuccessStatusCode)
                {
                    var err = TryParseJson(json);
                    return StatusCode((int)resp.StatusCode, new
                    {
                        error = err?["error"]?["message"]?.Value<string>() ?? "Stripe error: " + resp.StatusCode
                    });
                }

                var result = JObject.Parse(json);
                return Ok(new
                {
                    clientSecret    = result["client_secret"]?.Value<string>(),
                    paymentIntentId = result["id"]?.Value<string>(),
                    amount          = amount,
                    currency        = currency.ToUpper()
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Internal error: " + ex.Message });
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  STRIPE — Confirm / Verify PaymentIntent status
        //  POST /api/megaform/payments/stripe/confirm
        //  Called by megaform-widget-stripe.js after confirmPayment()
        //  Body: { formId, fieldKey, clientSecret }
        //  Response: { paid, status, paymentIntentId, message }
        // ══════════════════════════════════════════════════════════════════
        [HttpPost("stripe/confirm")]
        public async Task<IActionResult> StripeConfirm([FromBody] JObject body)
        {
            try
            {
                var secretKey = GetKey("Payment_Stripe_SecretKey", "Payment:Stripe:SecretKey");
                if (string.IsNullOrWhiteSpace(secretKey))
                    return BadRequest(new { error = "Stripe secret key not configured." });

                var clientSecret = body["clientSecret"]?.Value<string>();
                if (string.IsNullOrWhiteSpace(clientSecret))
                    return BadRequest(new { error = "clientSecret is required." });

                // Extract PaymentIntent ID from clientSecret (format: pi_xxx_secret_yyy)
                var parts = clientSecret.Split('_');
                if (parts.Length < 2)
                    return BadRequest(new { error = "Invalid clientSecret format." });

                var paymentIntentId = parts[0] + "_" + parts[1]; // "pi_xxx"

                // Retrieve PaymentIntent from Stripe to verify status
                var req = new HttpRequestMessage(HttpMethod.Get,
                    "https://api.stripe.com/v1/payment_intents/" + paymentIntentId);
                req.Headers.Add("Authorization", "Bearer " + secretKey);

                var resp = await _http.SendAsync(req);
                var json = await resp.Content.ReadAsStringAsync();

                if (!resp.IsSuccessStatusCode)
                {
                    var err = TryParseJson(json);
                    return StatusCode((int)resp.StatusCode, new
                    {
                        error = err?["error"]?["message"]?.Value<string>() ?? "Stripe error: " + resp.StatusCode
                    });
                }

                var pi     = JObject.Parse(json);
                var status = pi["status"]?.Value<string>() ?? "";
                var paid   = status == "succeeded";

                return Ok(new
                {
                    paid            = paid,
                    status          = status,
                    paymentIntentId = paymentIntentId,
                    message         = paid ? "Payment completed." : "Payment status: " + status
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Internal error: " + ex.Message });
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  PAYPAL — Public Config
        //  GET /api/megaform/payments/paypal/public-config
        // ══════════════════════════════════════════════════════════════════
        [HttpGet("paypal/public-config")]
        public IActionResult PayPalPublicConfig()
        {
            var (clientId, _, _, mode, err) = ResolvePayPalConfig();
            if (!string.IsNullOrWhiteSpace(err) || string.IsNullOrWhiteSpace(clientId))
                return BadRequest(new { error = err ?? "PayPal is not configured." });

            return Ok(new
            {
                clientId,
                mode,
                integrationDate = "2026-03-23"
            });
        }

        // ══════════════════════════════════════════════════════════════════
        //  PAYPAL — Test Credentials
        //  POST /api/megaform/payments/paypal/test-credentials
        // ══════════════════════════════════════════════════════════════════
        [HttpPost("paypal/test-credentials")]
        public async Task<IActionResult> PayPalTestCredentials([FromBody] JObject body)
        {
            try
            {
                var bodyMode = NormalizeStoredSetting(body?["mode"]?.Value<string>() ?? body?["paypalMode"]?.Value<string>());
                var bodyClientId = NormalizeStoredSetting(body?["clientId"]?.Value<string>() ?? body?["paypalClientId"]?.Value<string>());
                var bodyClientSecret = NormalizeStoredSetting(body?["clientSecret"]?.Value<string>() ?? body?["paypalClientSecret"]?.Value<string>());
                var usingBodyClientId = !string.IsNullOrWhiteSpace(bodyClientId);
                var usingBodyClientSecret = !string.IsNullOrWhiteSpace(bodyClientSecret);

                var (clientId, clientSecret, baseUrl, mode, err) = ResolvePayPalConfig(body, allowBodyOverrides: true);
                if (err != null) return BadRequest(new { error = err });

                var diagnostic = new
                {
                    mode,
                    apiBaseUrl = baseUrl,
                    clientIdPreview = MaskClientId(clientId),
                    clientIdSource = usingBodyClientId ? "request-body" : "saved-settings",
                    clientSecretSource = usingBodyClientSecret ? "request-body" : "saved-settings",
                    clientSecretLength = string.IsNullOrWhiteSpace(clientSecret) ? 0 : clientSecret.Length,
                    selectedModeInput = string.IsNullOrWhiteSpace(bodyMode) ? mode : bodyMode
                };

                var (token, authError, debugId, rawAuth) = await GetPayPalAccessTokenDetailed(clientId, clientSecret, baseUrl);
                if (string.IsNullOrWhiteSpace(token))
                {
                    return StatusCode(502, new
                    {
                        error = authError ?? "Failed to authenticate with PayPal.",
                        debugId,
                        mode,
                        hint = BuildPayPalAuthHint(rawAuth, mode),
                        diagnostic
                    });
                }

                return Ok(new
                {
                    success = true,
                    mode,
                    message = "PayPal API connection successful. Credentials are valid.",
                    diagnostic
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Internal error: " + ex.Message });
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  PAYPAL — Create Order
        //  POST /api/megaform/payments/paypal/create-order
        // ══════════════════════════════════════════════════════════════════
        [HttpPost("paypal/create-order")]
        public async Task<IActionResult> PayPalCreateOrder([FromBody] JObject body)
        {
            try
            {
                var (clientId, clientSecret, baseUrl, _, err) = ResolvePayPalConfig();
                if (err != null) return BadRequest(new { error = err });

                var amount = ReadPayPalAmount(body?["amount"]);
                var currency = NormalizeCurrency(body?["currency"]?.Value<string>());
                var intent = NormalizePayPalIntent(body?["intent"]?.Value<string>());
                var description = body?["description"]?.Value<string>()?.Trim();
                var fieldKey = body?["fieldKey"]?.Value<string>()?.Trim();

                // [SecFix 2026-07-04 P0-2] Enforce server-side price for FIXED payment fields (see Stripe path).
                // (Depends on the PayPal widget sending formId+fieldKey; if absent, the client amount is preserved.)
                var (serverAmount, serverCurrency, priceErr) = ResolveServerAmount(body, amount, currency);
                if (priceErr != null) return BadRequest(new { error = priceErr });
                amount = serverAmount;
                if (!string.IsNullOrWhiteSpace(serverCurrency)) currency = NormalizeCurrency(serverCurrency);

                if (amount <= 0m)
                    return BadRequest(new { error = "Amount must be greater than 0." });

                var (token, authError, debugId, _) = await GetPayPalAccessTokenDetailed(clientId, clientSecret, baseUrl);
                if (string.IsNullOrWhiteSpace(token))
                {
                    return StatusCode(502, new
                    {
                        error = authError ?? "Failed to authenticate with PayPal.",
                        debugId
                    });
                }

                var orderPayload = new
                {
                    intent = intent,
                    purchase_units = new[]
                    {
                        new
                        {
                            reference_id = string.IsNullOrWhiteSpace(fieldKey) ? "payment" : fieldKey,
                            description = string.IsNullOrWhiteSpace(description) ? null : description,
                            amount = new
                            {
                                currency_code = currency,
                                value = amount.ToString("0.00", CultureInfo.InvariantCulture)
                            }
                        }
                    },
                    application_context = new
                    {
                        shipping_preference = "NO_SHIPPING",
                        user_action = "PAY_NOW"
                    }
                };

                var req = new HttpRequestMessage(HttpMethod.Post, baseUrl + "/v2/checkout/orders");
                req.Headers.Add("Authorization", "Bearer " + token);
                req.Headers.Add("Prefer", "return=representation");
                req.Content = new StringContent(
                    JsonConvert.SerializeObject(orderPayload),
                    Encoding.UTF8,
                    "application/json");

                var resp = await _http.SendAsync(req);
                var json = await resp.Content.ReadAsStringAsync();

                if (!resp.IsSuccessStatusCode)
                {
                    var errObj = TryParseJson(json);
                    return StatusCode((int)resp.StatusCode, new
                    {
                        error = BuildPayPalErrorMessage(errObj, "PayPal create order failed."),
                        debugId = errObj?["debug_id"]?.Value<string>()
                    });
                }

                var result = JObject.Parse(json);
                var orderId = result["id"]?.Value<string>();

                if (string.IsNullOrWhiteSpace(orderId))
                    return StatusCode(502, new { error = "PayPal did not return an order ID." });

                return Ok(new
                {
                    orderId,
                    id = orderId,
                    status = result["status"]?.Value<string>() ?? "CREATED"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Internal error: " + ex.Message });
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  PAYPAL — Capture Order
        //  POST /api/megaform/payments/paypal/capture-order
        // ══════════════════════════════════════════════════════════════════
        [HttpPost("paypal/capture-order")]
        public async Task<IActionResult> PayPalCaptureOrder([FromBody] JObject body)
        {
            try
            {
                var (clientId, clientSecret, baseUrl, _, err) = ResolvePayPalConfig();
                if (err != null) return BadRequest(new { error = err });

                var orderId = body?["orderId"]?.Value<string>()?.Trim();
                if (string.IsNullOrWhiteSpace(orderId))
                    return BadRequest(new { error = "orderId is required." });

                var (token, authError, debugId, _) = await GetPayPalAccessTokenDetailed(clientId, clientSecret, baseUrl);
                if (string.IsNullOrWhiteSpace(token))
                {
                    return StatusCode(502, new
                    {
                        error = authError ?? "Failed to authenticate with PayPal.",
                        debugId
                    });
                }

                var req = new HttpRequestMessage(HttpMethod.Post, baseUrl + "/v2/checkout/orders/" + orderId + "/capture");
                req.Headers.Add("Authorization", "Bearer " + token);
                req.Headers.Add("Prefer", "return=representation");
                req.Content = new StringContent("{}", Encoding.UTF8, "application/json");

                var resp = await _http.SendAsync(req);
                var json = await resp.Content.ReadAsStringAsync();

                if (!resp.IsSuccessStatusCode)
                {
                    var errObj = TryParseJson(json);
                    return StatusCode((int)resp.StatusCode, new
                    {
                        error = BuildPayPalErrorMessage(errObj, "PayPal capture failed."),
                        debugId = errObj?["debug_id"]?.Value<string>()
                    });
                }

                var result = JObject.Parse(json);
                var ppStatus = result["status"]?.Value<string>() ?? string.Empty;
                var paid = string.Equals(ppStatus, "COMPLETED", StringComparison.OrdinalIgnoreCase);

                string captureId = null;
                try
                {
                    captureId = result["purchase_units"]?[0]?["payments"]?["captures"]?[0]?["id"]?.Value<string>();
                }
                catch { }

                return Ok(new
                {
                    paid,
                    status = ppStatus,
                    orderId,
                    captureId = captureId ?? string.Empty,
                    payer = result["payer"],
                    purchase_units = result["purchase_units"],
                    message = paid ? "Payment completed." : ("Payment status: " + ppStatus)
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Internal error: " + ex.Message });
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  Helpers
        // ══════════════════════════════════════════════════════════════════

        private (string clientId, string clientSecret, string baseUrl, string mode, string error) ResolvePayPalConfig(JObject body = null, bool allowBodyOverrides = false)
        {
            var clientId = NormalizeStoredSetting(GetKey("Payment_PayPal_ClientId", "Payment:PayPal:ClientId"));
            var clientSecret = NormalizeStoredSetting(GetKey("Payment_PayPal_ClientSecret", "Payment:PayPal:ClientSecret"));
            var mode = (NormalizeStoredSetting(GetKey("Payment_PayPal_Mode", "Payment:PayPal:Mode")) is string savedMode && savedMode.Length > 0 ? savedMode : "sandbox").Trim().ToLowerInvariant();

            if (allowBodyOverrides && body != null)
            {
                var bodyMode = NormalizeStoredSetting(body["mode"]?.Value<string>() ?? body["paypalMode"]?.Value<string>());
                var bodyClientId = NormalizeStoredSetting(body["clientId"]?.Value<string>() ?? body["paypalClientId"]?.Value<string>());
                var bodyClientSecret = NormalizeStoredSetting(body["clientSecret"]?.Value<string>() ?? body["paypalClientSecret"]?.Value<string>());

                if (!string.IsNullOrWhiteSpace(bodyMode)) mode = bodyMode.Trim().ToLowerInvariant();
                if (!string.IsNullOrWhiteSpace(bodyClientId)) clientId = bodyClientId.Trim();
                if (!string.IsNullOrWhiteSpace(bodyClientSecret)) clientSecret = bodyClientSecret.Trim();
            }

            mode = mode == "live" ? "live" : "sandbox";

            if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
                return (null, null, null, mode, "PayPal client ID and client secret are required.");

            var baseUrl = mode == "live"
                ? "https://api-m.paypal.com"
                : "https://api-m.sandbox.paypal.com";

            return (clientId, clientSecret, baseUrl, mode, null);
        }

        private async Task<(string token, string error, string debugId, JObject raw)> GetPayPalAccessTokenDetailed(string clientId, string clientSecret, string baseUrl)
        {
            try
            {
                var credentials = Convert.ToBase64String(Encoding.ASCII.GetBytes(clientId + ":" + clientSecret));

                var req = new HttpRequestMessage(HttpMethod.Post, baseUrl + "/v1/oauth2/token");
                req.Headers.Add("Authorization", "Basic " + credentials);
                req.Headers.Add("Accept", "application/json");
                req.Content = new FormUrlEncodedContent(new[]
                {
                    new System.Collections.Generic.KeyValuePair<string, string>("grant_type", "client_credentials")
                });

                var resp = await _http.SendAsync(req);
                var json = await resp.Content.ReadAsStringAsync();
                var parsed = TryParseJson(json);

                if (!resp.IsSuccessStatusCode)
                {
                    return (null, BuildPayPalErrorMessage(parsed, "Failed to authenticate with PayPal."), parsed?["debug_id"]?.Value<string>(), parsed);
                }

                var result = parsed ?? JObject.Parse(json);
                var token = result["access_token"]?.Value<string>();
                return string.IsNullOrWhiteSpace(token)
                    ? (null, "PayPal did not return an access token.", null, result)
                    : (token, null, null, result);
            }
            catch (Exception ex)
            {
                return (null, ex.Message, null, null);
            }
        }

        private static decimal ReadPayPalAmount(JToken token)
        {
            if (token == null) return 0m;
            var raw = token.Type == JTokenType.Float || token.Type == JTokenType.Integer
                ? token.Value<decimal>().ToString(CultureInfo.InvariantCulture)
                : (token.Value<string>() ?? string.Empty).Trim();

            if (decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
                return parsed;

            if (decimal.TryParse(raw, NumberStyles.Any, CultureInfo.CurrentCulture, out parsed))
                return parsed;

            return 0m;
        }

        private static string NormalizeCurrency(string value)
        {
            var currency = (value ?? "USD").Trim().ToUpperInvariant();
            return string.IsNullOrWhiteSpace(currency) ? "USD" : currency;
        }

        private static string NormalizePayPalIntent(string value)
        {
            var intent = (value ?? "CAPTURE").Trim().ToUpperInvariant();
            return intent == "AUTHORIZE" ? "AUTHORIZE" : "CAPTURE";
        }


        private static string NormalizeStoredSetting(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return string.Empty;
            return value.Replace("\r", string.Empty).Replace("\n", string.Empty).Trim();
        }

        private static string MaskClientId(string clientId)
        {
            if (string.IsNullOrWhiteSpace(clientId)) return "(empty)";
            var trimmed = NormalizeStoredSetting(clientId);
            if (trimmed.Length <= 12) return trimmed;
            return trimmed.Substring(0, 6) + "…" + trimmed.Substring(trimmed.Length - 6);
        }

        private static string BuildPayPalErrorMessage(JObject errObj, string fallback)
        {
            if (errObj == null) return fallback;
            var message = errObj["message"]?.Value<string>()
                ?? errObj["error_description"]?.Value<string>()
                ?? errObj["error"]?.Value<string>()
                ?? errObj["name"]?.Value<string>();

            var issue = errObj["details"]?[0]?["issue"]?.Value<string>();
            if (!string.IsNullOrWhiteSpace(message) && !string.IsNullOrWhiteSpace(issue))
                return message + " (" + issue + ")";

            return string.IsNullOrWhiteSpace(message) ? fallback : message;
        }

        private static string BuildPayPalAuthHint(JObject errObj, string mode)
        {
            var error = errObj?["error"]?.Value<string>()?.Trim();
            var description = errObj?["error_description"]?.Value<string>()?.Trim();
            if (string.Equals(error, "invalid_client", StringComparison.OrdinalIgnoreCase))
            {
                return "Check that the Client ID and Client Secret belong to the selected " + (mode == "live" ? "Live" : "Sandbox") + " app, and make sure there are no extra spaces or pasted line breaks. Also confirm the widget is not using a different Client ID than the saved dashboard settings.";
            }

            if (!string.IsNullOrWhiteSpace(description) && description.IndexOf("authentication", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return "Verify the PayPal mode and secret. A Live client ID with Sandbox mode, or a Sandbox client ID with Live mode, will fail authentication.";
            }

            return "Verify the PayPal mode, Client ID, and Client Secret. Live and Sandbox credentials are not interchangeable.";
        }

        private static JObject TryParseJson(string json)
        {
            try { return JObject.Parse(json); }
            catch { return null; }
        }
    }
}
