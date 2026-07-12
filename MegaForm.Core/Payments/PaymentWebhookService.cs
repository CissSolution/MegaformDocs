using System;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Payments
{
    /// <summary>
    /// [SecFix 2026-07-12 PAY-3] Gateway webhook intake. The dashboard has been
    /// collecting a Stripe "Webhook Secret" for months while no endpoint used
    /// it — this service finally does. Webhooks give the system an asynchronous
    /// source of truth: signature-verified events are recorded in the
    /// transaction registry (where the submit-time verifier can cross-check
    /// them) and refunds/failures on already-stored submissions are logged
    /// loudly for the site admin.
    ///
    /// Verification is strict and fail-closed:
    ///  • Stripe: HMAC-SHA256 over "{t}.{payload}" with the stored webhook
    ///    secret, constant-time compare, 10-minute tolerance;
    ///  • PayPal: server-to-server verify-webhook-signature call using the
    ///    stored Webhook ID.
    /// Unverifiable events are rejected — an unauthenticated webhook endpoint
    /// that ACTS on events would otherwise be a forgery vector.
    /// </summary>
    public class PaymentWebhookService
    {
        private readonly IPaymentGatewayStore _store;
        private readonly PaymentGatewayClient _gateway;
        private readonly ILogService _log;

        public PaymentWebhookService(IPaymentGatewayStore store, PaymentGatewayClient gateway, ILogService log = null)
        {
            _store = store;
            _gateway = gateway ?? new PaymentGatewayClient();
            _log = log;
        }

        // ── Stripe ─────────────────────────────────────────────────────────

        public PaymentApiResult HandleStripe(int portalId, string payload, string signatureHeader)
        {
            var secret = _store.Get(portalId, PaymentSettingKeys.StripeWebhookSecret);
            if (string.IsNullOrWhiteSpace(secret))
            {
                Log("Stripe webhook received but no webhook secret is configured — rejecting.");
                return PaymentApiResult.Error(400, "Webhook secret is not configured.");
            }
            if (!VerifyStripeSignature(payload, signatureHeader, secret))
            {
                Log("Stripe webhook signature verification FAILED.");
                return PaymentApiResult.Error(400, "Invalid signature.");
            }

            JObject evt;
            try { evt = JObject.Parse(payload); }
            catch { return PaymentApiResult.Error(400, "Invalid payload."); }

            var type = evt.Value<string>("type") ?? string.Empty;
            var data = evt["data"] as JObject;
            var obj = data != null ? data["object"] as JObject : null;
            if (obj == null) return PaymentApiResult.Ok(new JObject { ["received"] = true });

            if (type == "payment_intent.succeeded" || type == "payment_intent.payment_failed")
            {
                var piId = obj.Value<string>("id") ?? string.Empty;
                var currency = (obj.Value<string>("currency") ?? string.Empty).ToUpperInvariant();
                long minor = obj.Value<long?>("amount_received") ?? obj.Value<long?>("amount") ?? 0;
                if (piId.Length > 0)
                {
                    PaymentTransactionRegistry.RecordFact("stripe:" + piId, new PaymentTransactionRegistry.WebhookFact
                    {
                        Status = type == "payment_intent.succeeded" ? "succeeded" : "failed",
                        Amount = PaymentCurrency.FromStripeMinorUnits(minor, currency),
                        Currency = currency
                    });
                }
            }
            else if (type == "charge.refunded" || type == "charge.dispute.created")
            {
                var piId = obj.Value<string>("payment_intent") ?? string.Empty;
                if (piId.Length > 0)
                {
                    PaymentTransactionRegistry.RecordFact("stripe:" + piId, new PaymentTransactionRegistry.WebhookFact
                    {
                        Status = type == "charge.refunded" ? "refunded" : "disputed",
                        Currency = (obj.Value<string>("currency") ?? string.Empty).ToUpperInvariant()
                    });
                    // Deliberately do NOT rewrite the submission's workflow status —
                    // that belongs to the approval pipeline. Loud log instead.
                    Log("Stripe reports '" + type + "' for payment intent " + piId +
                        ". A stored submission may reference this transaction; review it in the admin panel.");
                }
            }

            return PaymentApiResult.Ok(new JObject { ["received"] = true });
        }

        /// <summary>Stripe-Signature: t=timestamp,v1=hex[,v1=hex…] — HMAC-SHA256 of "t.payload".</summary>
        public static bool VerifyStripeSignature(string payload, string signatureHeader, string secret)
        {
            if (string.IsNullOrWhiteSpace(payload) || string.IsNullOrWhiteSpace(signatureHeader) || string.IsNullOrWhiteSpace(secret))
                return false;

            long timestamp = 0;
            var signatures = new System.Collections.Generic.List<string>();
            var parts = signatureHeader.Split(',');
            for (int i = 0; i < parts.Length; i++)
            {
                var kv = parts[i].Split(new[] { '=' }, 2);
                if (kv.Length != 2) continue;
                var k = kv[0].Trim();
                if (k == "t") long.TryParse(kv[1].Trim(), NumberStyles.None, CultureInfo.InvariantCulture, out timestamp);
                else if (k == "v1") signatures.Add(kv[1].Trim());
            }
            if (timestamp <= 0 || signatures.Count == 0) return false;

            // Replay tolerance: 10 minutes.
            var eventTime = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddSeconds(timestamp);
            if (Math.Abs((DateTime.UtcNow - eventTime).TotalMinutes) > 10) return false;

            byte[] expected;
            using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret)))
            {
                expected = hmac.ComputeHash(Encoding.UTF8.GetBytes(timestamp.ToString(CultureInfo.InvariantCulture) + "." + payload));
            }
            var expectedHex = ToHex(expected);
            for (int i = 0; i < signatures.Count; i++)
            {
                if (FixedTimeEquals(expectedHex, signatures[i])) return true;
            }
            return false;
        }

        // ── PayPal ─────────────────────────────────────────────────────────

        public async Task<PaymentApiResult> HandlePayPalAsync(int portalId, string payload,
            string transmissionId, string transmissionTime, string transmissionSig, string certUrl, string authAlgo)
        {
            var webhookId = _store.Get(portalId, PaymentSettingKeys.PayPalWebhookId);
            var clientId = _store.Get(portalId, PaymentSettingKeys.PayPalClientId);
            var clientSecret = _store.Get(portalId, PaymentSettingKeys.PayPalClientSecret);
            var mode = _store.Get(portalId, PaymentSettingKeys.PayPalMode);
            if (string.IsNullOrWhiteSpace(webhookId) || string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            {
                Log("PayPal webhook received but webhook ID / credentials are not configured — rejecting.");
                return PaymentApiResult.Error(400, "PayPal webhook is not configured.");
            }

            JObject evt;
            try { evt = JObject.Parse(payload); }
            catch { return PaymentApiResult.Error(400, "Invalid payload."); }

            var baseUrl = PaymentGatewayClient.PayPalBaseUrl(mode);
            var tokenResp = await _gateway.GetPayPalTokenAsync(clientId, clientSecret, baseUrl).ConfigureAwait(false);
            string token = tokenResp.Json != null ? tokenResp.Json.Value<string>("access_token") : null;
            if (!tokenResp.IsSuccess || string.IsNullOrWhiteSpace(token))
                return PaymentApiResult.Error(502, "Could not authenticate with PayPal to verify the webhook.");

            var verifyPayload = new JObject
            {
                ["transmission_id"] = transmissionId,
                ["transmission_time"] = transmissionTime,
                ["transmission_sig"] = transmissionSig,
                ["cert_url"] = certUrl,
                ["auth_algo"] = authAlgo,
                ["webhook_id"] = webhookId,
                ["webhook_event"] = evt
            };
            var verifyResp = await _gateway.PayPalPostAsync(baseUrl, token,
                "/v1/notifications/verify-webhook-signature", verifyPayload).ConfigureAwait(false);
            var verificationStatus = verifyResp.Json != null ? verifyResp.Json.Value<string>("verification_status") : null;
            if (!verifyResp.IsSuccess || !string.Equals(verificationStatus, "SUCCESS", StringComparison.OrdinalIgnoreCase))
            {
                Log("PayPal webhook signature verification FAILED (status=" + (verificationStatus ?? "n/a") + ").");
                return PaymentApiResult.Error(400, "Invalid signature.");
            }

            var eventType = evt.Value<string>("event_type") ?? string.Empty;
            var resource = evt["resource"] as JObject;
            if (resource != null &&
                (eventType == "PAYMENT.CAPTURE.COMPLETED" || eventType == "PAYMENT.CAPTURE.DENIED" ||
                 eventType == "PAYMENT.CAPTURE.REFUNDED" || eventType == "PAYMENT.CAPTURE.REVERSED"))
            {
                var captureId = resource.Value<string>("id") ?? string.Empty;
                var amountObj = resource["amount"] as JObject;
                decimal amount = 0m;
                string currency = string.Empty;
                if (amountObj != null)
                {
                    currency = (amountObj.Value<string>("currency_code") ?? string.Empty).ToUpperInvariant();
                    decimal.TryParse(amountObj.Value<string>("value") ?? string.Empty, NumberStyles.Any, CultureInfo.InvariantCulture, out amount);
                }
                string status = eventType == "PAYMENT.CAPTURE.COMPLETED" ? "succeeded"
                    : eventType == "PAYMENT.CAPTURE.REFUNDED" ? "refunded"
                    : eventType == "PAYMENT.CAPTURE.REVERSED" ? "reversed"
                    : "failed";

                var fact = new PaymentTransactionRegistry.WebhookFact { Status = status, Amount = amount, Currency = currency };
                if (captureId.Length > 0)
                    PaymentTransactionRegistry.RecordFact("paypal:" + captureId, fact);
                try
                {
                    var related = resource["supplementary_data"] as JObject;
                    var ids = related != null ? related["related_ids"] as JObject : null;
                    var orderId = ids != null ? ids.Value<string>("order_id") : null;
                    if (!string.IsNullOrWhiteSpace(orderId))
                        PaymentTransactionRegistry.RecordFact("paypal:" + orderId, fact);
                }
                catch { }

                if (status == "refunded" || status == "reversed" || status == "failed")
                {
                    Log("PayPal reports '" + eventType + "' for capture " + captureId +
                        ". A stored submission may reference this transaction; review it in the admin panel.");
                }
            }

            return PaymentApiResult.Ok(new JObject { ["received"] = true });
        }

        // ── helpers ────────────────────────────────────────────────────────

        private static string ToHex(byte[] bytes)
        {
            var sb = new StringBuilder(bytes.Length * 2);
            for (int i = 0; i < bytes.Length; i++) sb.Append(bytes[i].ToString("x2", CultureInfo.InvariantCulture));
            return sb.ToString();
        }

        private static bool FixedTimeEquals(string a, string b)
        {
            if (a == null || b == null || a.Length != b.Length) return false;
            int diff = 0;
            for (int i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
            return diff == 0;
        }

        private void Log(string message)
        {
            if (_log != null) _log.LogWarning(nameof(PaymentWebhookService), message);
        }
    }
}
