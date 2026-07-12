using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Utilities;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Payments
{
    /// <summary>Platform-neutral controller result: HTTP status + payload object.
    /// NOTE for Oqtane: payloads can contain JTokens (PayPal passthrough fields) —
    /// serialize with Newtonsoft (JsonOk / explicit JsonConvert), never bare Ok().</summary>
    public sealed class PaymentApiResult
    {
        public int StatusCode { get; set; }
        public object Payload { get; set; }

        public static PaymentApiResult Ok(object payload) { return new PaymentApiResult { StatusCode = 200, Payload = payload }; }
        public static PaymentApiResult Error(int status, string message) { return new PaymentApiResult { StatusCode = status, Payload = new JObject { ["error"] = message } }; }
    }

    /// <summary>
    /// [SecFix 2026-07-12 PAY-2] The checkout endpoints (create-intent /
    /// create-order / capture / confirm / config), shared by all four platform
    /// controllers so Oqtane and DNN stop being "no payment backend" platforms
    /// and every host enforces the same rules:
    ///  • price is re-derived server-side from the saved schema; a missing form,
    ///    unparsable schema or unknown field now REJECTS (the old code silently
    ///    trusted the client amount on those paths);
    ///  • variable amount modes (field / listenTotals) are bounded by the
    ///    field's optional minAmount/maxAmount — and the authoritative check
    ///    happens again at submit time against the actual submission data;
    ///  • Stripe intents / PayPal orders are stamped with formId+fieldKey so the
    ///    submit-time verifier can refuse cross-form replay;
    ///  • Stripe amounts use per-currency minor units (VND and other
    ///    zero-decimal currencies were previously charged ×100);
    ///  • per-IP fixed-window rate limits guard the anonymous endpoints against
    ///    card-testing;
    ///  • all outbound calls go through PaymentGatewayClient (bounded
    ///    concurrency, retry with Idempotency-Key, PayPal token cache).
    /// </summary>
    public class PaymentEndpointService
    {
        // Card-testing guard on the anonymous endpoints. Per-IP fixed windows;
        // generous enough for a shared office/NAT IP filling several forms.
        public const int CreatePerIpPerMinute = 20;
        public const int CapturePerIpPerMinute = 40;

        private readonly IPaymentGatewayStore _store;
        private readonly IFormRepository _formRepo;
        private readonly PaymentGatewayClient _gateway;
        private readonly ILogService _log;

        public PaymentEndpointService(IPaymentGatewayStore store, IFormRepository formRepo,
            PaymentGatewayClient gateway, ILogService log = null)
        {
            _store = store;
            _formRepo = formRepo;
            _gateway = gateway ?? new PaymentGatewayClient();
            _log = log;
        }

        // ── Stripe ─────────────────────────────────────────────────────────

        public async Task<PaymentApiResult> StripeCreateIntentAsync(int portalId, JObject body, string clientIp)
        {
            if (!PaymentRateLimiter.Allow("pay-create:" + (clientIp ?? "?"), CreatePerIpPerMinute, TimeSpan.FromMinutes(1)))
                return PaymentApiResult.Error(429, "Too many payment attempts. Please wait a minute and try again.");

            var secretKey = _store.Get(portalId, PaymentSettingKeys.StripeSecretKey);
            if (string.IsNullOrWhiteSpace(secretKey))
                return PaymentApiResult.Error(400, "Stripe secret key not configured. Add it in Payment Settings.");

            decimal clientAmount = ReadAmount(body != null ? body["amount"] : null);
            string currency = NormalizeCurrency(body != null ? body.Value<string>("currency") : null);
            string fieldKey = (body != null ? body.Value<string>("fieldKey") : null) ?? string.Empty;
            int formId = body != null ? (body.Value<int?>("formId") ?? 0) : 0;

            var priced = ResolveCreateAmount(formId, fieldKey, clientAmount, currency);
            if (priced.Error != null) return PaymentApiResult.Error(400, priced.Error);

            long minorUnits = PaymentCurrency.ToStripeMinorUnits(priced.Amount, priced.Currency);
            if (minorUnits <= 0)
                return PaymentApiResult.Error(400, "Amount must be greater than 0.");

            var metadata = new Dictionary<string, string>
            {
                { "formId", formId.ToString(CultureInfo.InvariantCulture) },
                { "fieldKey", fieldKey }
            };

            var resp = await _gateway.StripeCreatePaymentIntentAsync(secretKey, minorUnits, priced.Currency,
                metadata, Guid.NewGuid().ToString("N")).ConfigureAwait(false);

            if (resp.TransportError)
                return PaymentApiResult.Error(503, resp.Error ?? "Payment system is busy. Please try again.");
            if (!resp.IsSuccess)
            {
                var msg = ReadStripeError(resp.Json) ?? ("Stripe error: " + resp.StatusCode);
                return PaymentApiResult.Error(resp.StatusCode, msg);
            }

            var result = resp.Json ?? new JObject();
            return PaymentApiResult.Ok(new JObject
            {
                ["clientSecret"] = result.Value<string>("client_secret"),
                ["paymentIntentId"] = result.Value<string>("id"),
                ["amount"] = priced.Amount,
                ["currency"] = priced.Currency.ToUpperInvariant()
            });
        }

        public async Task<PaymentApiResult> StripeConfirmAsync(int portalId, JObject body, string clientIp)
        {
            if (!PaymentRateLimiter.Allow("pay-confirm:" + (clientIp ?? "?"), CapturePerIpPerMinute, TimeSpan.FromMinutes(1)))
                return PaymentApiResult.Error(429, "Too many payment attempts. Please wait a minute and try again.");

            var secretKey = _store.Get(portalId, PaymentSettingKeys.StripeSecretKey);
            if (string.IsNullOrWhiteSpace(secretKey))
                return PaymentApiResult.Error(400, "Stripe secret key not configured.");

            var clientSecret = body != null ? body.Value<string>("clientSecret") : null;
            if (string.IsNullOrWhiteSpace(clientSecret))
                return PaymentApiResult.Error(400, "clientSecret is required.");

            var parts = clientSecret.Split('_');
            if (parts.Length < 2)
                return PaymentApiResult.Error(400, "Invalid clientSecret format.");
            var paymentIntentId = parts[0] + "_" + parts[1];

            var resp = await _gateway.StripeGetPaymentIntentAsync(secretKey, paymentIntentId).ConfigureAwait(false);
            if (resp.TransportError)
                return PaymentApiResult.Error(503, resp.Error ?? "Payment system is busy. Please try again.");
            if (!resp.IsSuccess)
            {
                var msg = ReadStripeError(resp.Json) ?? ("Stripe error: " + resp.StatusCode);
                return PaymentApiResult.Error(resp.StatusCode, msg);
            }

            var pi = resp.Json ?? new JObject();
            var status = pi.Value<string>("status") ?? string.Empty;
            var paid = status == "succeeded";
            return PaymentApiResult.Ok(new JObject
            {
                ["paid"] = paid,
                ["status"] = status,
                ["paymentIntentId"] = paymentIntentId,
                ["message"] = paid ? "Payment completed." : ("Payment status: " + status)
            });
        }

        // ── PayPal ─────────────────────────────────────────────────────────

        public PaymentApiResult PayPalPublicConfig(int portalId)
        {
            var cfg = ResolvePayPalConfig(portalId);
            if (cfg.Error != null || string.IsNullOrWhiteSpace(cfg.ClientId))
                return PaymentApiResult.Error(400, cfg.Error ?? "PayPal is not configured.");
            return PaymentApiResult.Ok(new JObject
            {
                ["clientId"] = cfg.ClientId,
                ["mode"] = cfg.Mode,
                ["integrationDate"] = "2026-03-23"
            });
        }

        public async Task<PaymentApiResult> PayPalCreateOrderAsync(int portalId, JObject body, string clientIp)
        {
            if (!PaymentRateLimiter.Allow("pay-create:" + (clientIp ?? "?"), CreatePerIpPerMinute, TimeSpan.FromMinutes(1)))
                return PaymentApiResult.Error(429, "Too many payment attempts. Please wait a minute and try again.");

            var cfg = ResolvePayPalConfig(portalId);
            if (cfg.Error != null) return PaymentApiResult.Error(400, cfg.Error);

            decimal clientAmount = ReadAmount(body != null ? body["amount"] : null);
            string currency = NormalizeCurrency(body != null ? body.Value<string>("currency") : null);
            string fieldKey = ((body != null ? body.Value<string>("fieldKey") : null) ?? string.Empty).Trim();
            string description = ((body != null ? body.Value<string>("description") : null) ?? string.Empty).Trim();
            string intent = NormalizePayPalIntent(body != null ? body.Value<string>("intent") : null);
            int formId = body != null ? (body.Value<int?>("formId") ?? 0) : 0;

            var priced = ResolveCreateAmount(formId, fieldKey, clientAmount, currency);
            if (priced.Error != null) return PaymentApiResult.Error(400, priced.Error);
            if (priced.Amount <= 0m) return PaymentApiResult.Error(400, "Amount must be greater than 0.");

            var tokenResp = await _gateway.GetPayPalTokenAsync(cfg.ClientId, cfg.ClientSecret, cfg.BaseUrl).ConfigureAwait(false);
            string token = tokenResp.Json != null ? tokenResp.Json.Value<string>("access_token") : null;
            if (!tokenResp.IsSuccess || string.IsNullOrWhiteSpace(token))
            {
                return PaymentApiResult.Error(502, ReadPayPalError(tokenResp.Json) ?? "Failed to authenticate with PayPal.");
            }

            var orderPayload = new JObject
            {
                ["intent"] = intent,
                ["purchase_units"] = new JArray
                {
                    new JObject
                    {
                        ["reference_id"] = string.IsNullOrWhiteSpace(fieldKey) ? "payment" : fieldKey,
                        // custom_id carries the formId — the submit-time verifier
                        // uses it to refuse an order minted for another form.
                        ["custom_id"] = formId.ToString(CultureInfo.InvariantCulture),
                        ["description"] = string.IsNullOrWhiteSpace(description) ? null : description,
                        ["amount"] = new JObject
                        {
                            ["currency_code"] = priced.Currency,
                            ["value"] = PaymentCurrency.ToPayPalValue(priced.Amount, priced.Currency)
                        }
                    }
                },
                ["application_context"] = new JObject
                {
                    ["shipping_preference"] = "NO_SHIPPING",
                    ["user_action"] = "PAY_NOW"
                }
            };

            var resp = await _gateway.PayPalPostAsync(cfg.BaseUrl, token, "/v2/checkout/orders", orderPayload).ConfigureAwait(false);
            if (resp.TransportError)
                return PaymentApiResult.Error(503, resp.Error ?? "Payment system is busy. Please try again.");
            if (!resp.IsSuccess)
            {
                return PaymentApiResult.Error(resp.StatusCode, ReadPayPalError(resp.Json) ?? "PayPal create order failed.");
            }

            var result = resp.Json ?? new JObject();
            var orderId = result.Value<string>("id");
            if (string.IsNullOrWhiteSpace(orderId))
                return PaymentApiResult.Error(502, "PayPal did not return an order ID.");

            return PaymentApiResult.Ok(new JObject
            {
                ["orderId"] = orderId,
                ["id"] = orderId,
                ["status"] = result.Value<string>("status") ?? "CREATED"
            });
        }

        public async Task<PaymentApiResult> PayPalCaptureOrderAsync(int portalId, JObject body, string clientIp)
        {
            if (!PaymentRateLimiter.Allow("pay-capture:" + (clientIp ?? "?"), CapturePerIpPerMinute, TimeSpan.FromMinutes(1)))
                return PaymentApiResult.Error(429, "Too many payment attempts. Please wait a minute and try again.");

            var cfg = ResolvePayPalConfig(portalId);
            if (cfg.Error != null) return PaymentApiResult.Error(400, cfg.Error);

            var orderId = ((body != null ? body.Value<string>("orderId") : null) ?? string.Empty).Trim();
            if (orderId.Length == 0)
                return PaymentApiResult.Error(400, "orderId is required.");

            var tokenResp = await _gateway.GetPayPalTokenAsync(cfg.ClientId, cfg.ClientSecret, cfg.BaseUrl).ConfigureAwait(false);
            string token = tokenResp.Json != null ? tokenResp.Json.Value<string>("access_token") : null;
            if (!tokenResp.IsSuccess || string.IsNullOrWhiteSpace(token))
            {
                return PaymentApiResult.Error(502, ReadPayPalError(tokenResp.Json) ?? "Failed to authenticate with PayPal.");
            }

            var resp = await _gateway.PayPalPostAsync(cfg.BaseUrl, token,
                "/v2/checkout/orders/" + Uri.EscapeDataString(orderId) + "/capture", null).ConfigureAwait(false);
            if (resp.TransportError)
                return PaymentApiResult.Error(503, resp.Error ?? "Payment system is busy. Please try again.");
            if (!resp.IsSuccess)
            {
                return PaymentApiResult.Error(resp.StatusCode, ReadPayPalError(resp.Json) ?? "PayPal capture failed.");
            }

            var result = resp.Json ?? new JObject();
            var ppStatus = result.Value<string>("status") ?? string.Empty;
            var paid = string.Equals(ppStatus, "COMPLETED", StringComparison.OrdinalIgnoreCase);

            string captureId = null;
            try
            {
                var units = result["purchase_units"] as JArray;
                var unit = units != null && units.Count > 0 ? units[0] as JObject : null;
                var payments = unit != null ? unit["payments"] as JObject : null;
                var captures = payments != null ? payments["captures"] as JArray : null;
                var capture = captures != null && captures.Count > 0 ? captures[0] as JObject : null;
                captureId = capture != null ? capture.Value<string>("id") : null;
            }
            catch { }

            return PaymentApiResult.Ok(new JObject
            {
                ["paid"] = paid,
                ["status"] = ppStatus,
                ["orderId"] = orderId,
                ["captureId"] = captureId ?? string.Empty,
                ["payer"] = result["payer"],
                ["purchase_units"] = result["purchase_units"],
                ["message"] = paid ? "Payment completed." : ("Payment status: " + ppStatus)
            });
        }

        /// <summary>Admin diagnostics (dashboard "Test PayPal keys" button). The
        /// CALLER must gate this behind an admin check — it accepts body overrides.</summary>
        public async Task<PaymentApiResult> PayPalTestCredentialsAsync(int portalId, JObject body)
        {
            var cfg = ResolvePayPalConfig(portalId, body, true);
            if (cfg.Error != null) return PaymentApiResult.Error(400, cfg.Error);

            var tokenResp = await _gateway.GetPayPalTokenAsync(cfg.ClientId, cfg.ClientSecret, cfg.BaseUrl).ConfigureAwait(false);
            string token = tokenResp.Json != null ? tokenResp.Json.Value<string>("access_token") : null;
            if (!tokenResp.IsSuccess || string.IsNullOrWhiteSpace(token))
            {
                return PaymentApiResult.Error(502, ReadPayPalError(tokenResp.Json) ?? "Failed to authenticate with PayPal.");
            }
            return PaymentApiResult.Ok(new JObject
            {
                ["success"] = true,
                ["mode"] = cfg.Mode,
                ["message"] = "PayPal API connection successful. Credentials are valid."
            });
        }

        // ── Server-side price resolution ───────────────────────────────────

        private sealed class PricedAmount
        {
            public decimal Amount;
            public string Currency;
            public string Error;
        }

        /// <summary>
        /// [SecFix 2026-07-04 P0-2 + 2026-07-12 PAY-2] Re-derive the checkout
        /// price from the SAVED schema. Fixed fields enforce the stored
        /// amount/currency outright. Variable modes (field/listenTotals) cannot
        /// be re-derived before the form is submitted, so they are bounded by
        /// the field's optional minAmount/maxAmount here and re-checked
        /// authoritatively at submit time. Unresolvable context (missing form,
        /// unparsable schema, unknown field) fails CLOSED — those used to be
        /// fail-open branches that quietly trusted the client's number.
        /// </summary>
        private PricedAmount ResolveCreateAmount(int formId, string fieldKey, decimal clientAmount, string clientCurrency)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(fieldKey))
                return new PricedAmount { Error = "Payment form context (formId/fieldKey) is required." };

            FormInfo form = null;
            FormSchema schema = null;
            try
            {
                form = _formRepo.GetForm(formId);
                if (form != null && !string.IsNullOrWhiteSpace(form.SchemaJson))
                    schema = Newtonsoft.Json.JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson);
            }
            catch (Exception ex)
            {
                Log("Schema lookup failed for form " + formId + ": " + ex.Message);
                schema = null;
            }
            if (form == null || schema == null || schema.Fields == null)
                return new PricedAmount { Error = "Payment form context is invalid." };

            FormField field = null;
            foreach (var f in MegaFormUtils.FlattenFields(schema.Fields))
            {
                if (f != null && string.Equals(f.Key, fieldKey, StringComparison.OrdinalIgnoreCase)) { field = f; break; }
            }
            if (field == null || !PaymentSubmissionVerifier.IsPaymentField(field))
                return new PricedAmount { Error = "Payment form context is invalid." };

            var props = field.WidgetProps ?? new Dictionary<string, object>();
            string mode = (GetProp(props, "amountMode") ?? string.Empty).Trim().ToLowerInvariant();
            string schemaCurrency = GetProp(props, "currency");
            string currency = !string.IsNullOrWhiteSpace(schemaCurrency)
                ? schemaCurrency.Trim().ToUpperInvariant()
                : NormalizeCurrency(clientCurrency);

            if (mode == "field" || mode == "listentotals")
            {
                if (clientAmount <= 0m)
                    return new PricedAmount { Error = "Amount must be greater than 0." };
                decimal? min = GetDecimalProp(props, "minAmount");
                decimal? max = GetDecimalProp(props, "maxAmount");
                if (min.HasValue && clientAmount < min.Value)
                    return new PricedAmount { Error = "Amount is below this form's minimum." };
                if (max.HasValue && clientAmount > max.Value)
                    return new PricedAmount { Error = "Amount is above this form's maximum." };
                return new PricedAmount { Amount = Math.Round(clientAmount, 2, MidpointRounding.AwayFromZero), Currency = currency };
            }

            var raw = GetProp(props, "amount");
            decimal schemaAmount;
            if (!string.IsNullOrWhiteSpace(raw) &&
                decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out schemaAmount) &&
                schemaAmount > 0m)
            {
                return new PricedAmount { Amount = schemaAmount, Currency = currency };
            }

            // Legacy fixed widget with no stored price (old donation forms):
            // preserve the client amount, but never <= 0.
            if (clientAmount <= 0m)
                return new PricedAmount { Error = "Amount must be greater than 0." };
            Log("Form " + formId + " field '" + fieldKey + "' has no stored amount — accepting client amount (legacy).");
            return new PricedAmount { Amount = Math.Round(clientAmount, 2, MidpointRounding.AwayFromZero), Currency = currency };
        }

        // ── Config / helpers ───────────────────────────────────────────────

        private sealed class PayPalConfig
        {
            public string ClientId;
            public string ClientSecret;
            public string BaseUrl;
            public string Mode;
            public string Error;
        }

        private PayPalConfig ResolvePayPalConfig(int portalId, JObject body = null, bool allowBodyOverrides = false)
        {
            string clientId = Normalize(_store.Get(portalId, PaymentSettingKeys.PayPalClientId));
            string clientSecret = Normalize(_store.Get(portalId, PaymentSettingKeys.PayPalClientSecret));
            string mode = Normalize(_store.Get(portalId, PaymentSettingKeys.PayPalMode));
            if (string.IsNullOrWhiteSpace(mode)) mode = "sandbox";

            if (allowBodyOverrides && body != null)
            {
                var bodyMode = Normalize(body.Value<string>("mode") ?? body.Value<string>("paypalMode"));
                var bodyClientId = Normalize(body.Value<string>("clientId") ?? body.Value<string>("paypalClientId"));
                var bodyClientSecret = Normalize(body.Value<string>("clientSecret") ?? body.Value<string>("paypalClientSecret"));
                if (!string.IsNullOrWhiteSpace(bodyMode)) mode = bodyMode;
                if (!string.IsNullOrWhiteSpace(bodyClientId)) clientId = bodyClientId;
                if (!string.IsNullOrWhiteSpace(bodyClientSecret)) clientSecret = bodyClientSecret;
            }

            mode = string.Equals(mode, "live", StringComparison.OrdinalIgnoreCase) ? "live" : "sandbox";
            if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
                return new PayPalConfig { Mode = mode, Error = "PayPal client ID and client secret are required." };

            return new PayPalConfig
            {
                ClientId = clientId,
                ClientSecret = clientSecret,
                Mode = mode,
                BaseUrl = PaymentGatewayClient.PayPalBaseUrl(mode)
            };
        }

        private static string Normalize(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return string.Empty;
            return value.Replace("\r", string.Empty).Replace("\n", string.Empty).Trim();
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

        private static decimal ReadAmount(JToken token)
        {
            if (token == null) return 0m;
            if (token.Type == JTokenType.Float || token.Type == JTokenType.Integer)
            {
                try { return token.Value<decimal>(); } catch { return 0m; }
            }
            var raw = (token.Value<string>() ?? string.Empty).Trim();
            decimal parsed;
            if (decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out parsed)) return parsed;
            return 0m;
        }

        private static string GetProp(Dictionary<string, object> props, string key)
        {
            object value;
            if (props == null || !props.TryGetValue(key, out value) || value == null) return null;
            return Convert.ToString(value, CultureInfo.InvariantCulture);
        }

        private static decimal? GetDecimalProp(Dictionary<string, object> props, string key)
        {
            var raw = GetProp(props, key);
            decimal parsed;
            if (!string.IsNullOrWhiteSpace(raw) &&
                decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out parsed) && parsed > 0m)
                return parsed;
            return null;
        }

        private static string ReadStripeError(JObject json)
        {
            if (json == null) return null;
            var err = json["error"] as JObject;
            return err != null ? err.Value<string>("message") : null;
        }

        private static string ReadPayPalError(JObject json)
        {
            if (json == null) return null;
            var message = json.Value<string>("message")
                ?? json.Value<string>("error_description")
                ?? json.Value<string>("error")
                ?? json.Value<string>("name");
            string issue = null;
            try
            {
                var details = json["details"] as JArray;
                var first = details != null && details.Count > 0 ? details[0] as JObject : null;
                issue = first != null ? first.Value<string>("issue") : null;
            }
            catch { }
            if (!string.IsNullOrWhiteSpace(message) && !string.IsNullOrWhiteSpace(issue))
                return message + " (" + issue + ")";
            return message;
        }

        private void Log(string message)
        {
            if (_log != null) _log.LogWarning(nameof(PaymentEndpointService), message);
        }
    }
}
