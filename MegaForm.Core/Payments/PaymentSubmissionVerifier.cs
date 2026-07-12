using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Utilities;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Payments
{
    public sealed class PaymentVerificationOutcome
    {
        public bool Allowed { get; set; }
        public string ErrorMessage { get; set; }
        public Dictionary<string, string> FieldErrors { get; set; }

        public static PaymentVerificationOutcome Ok()
        {
            return new PaymentVerificationOutcome { Allowed = true };
        }

        public static PaymentVerificationOutcome Reject(string fieldKey, string message)
        {
            var outcome = new PaymentVerificationOutcome
            {
                Allowed = false,
                ErrorMessage = message,
                FieldErrors = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            };
            if (!string.IsNullOrWhiteSpace(fieldKey)) outcome.FieldErrors[fieldKey] = message;
            return outcome;
        }
    }

    /// <summary>
    /// [SecFix 2026-07-12 PAY-1] The submit-time payment gate. Before this class
    /// existed the pipeline saved whatever the hidden payment input claimed —
    /// POSTing {"status":"paid"} submitted a paid-only form without paying.
    ///
    /// For every payment field that claims "paid" this verifier:
    ///  1. reserves the transactionId in-process and rejects duplicates already
    ///     stored in MF_Submissions (replay / double-submit);
    ///  2. asks the gateway itself (Stripe GET /v1/payment_intents/{id},
    ///     PayPal GET /v2/checkout/orders/{id}) whether the money really moved;
    ///  3. checks the charged amount+currency against the price the SERVER
    ///     resolves from the schema/submission (never the client's number) and
    ///     checks the intent/order was created for THIS form (metadata stamped
    ///     at create time);
    ///  4. rewrites the stored payment value with the gateway-confirmed numbers.
    /// Every ambiguous outcome (no secret key, gateway unreachable, metadata
    /// missing, amount mismatch) fails CLOSED. requiredPaid is enforced here,
    /// server-side — the widget's validate() is a courtesy, not the gate.
    /// </summary>
    public class PaymentSubmissionVerifier
    {
        private static readonly string[] PaymentFieldTypes = { "Payment", "StripePayment", "PayPalPayment" };

        private readonly IPaymentGatewayStore _store;
        private readonly ISubmissionRepository _subRepo;
        private readonly PaymentGatewayClient _gateway;
        private readonly ILogService _log;

        public PaymentSubmissionVerifier(IPaymentGatewayStore store, ISubmissionRepository subRepo,
            PaymentGatewayClient gateway, ILogService log = null)
        {
            _store = store;
            _subRepo = subRepo;
            _gateway = gateway ?? new PaymentGatewayClient();
            _log = log;
        }

        public static bool IsPaymentField(FormField field)
        {
            if (field == null || string.IsNullOrWhiteSpace(field.Type)) return false;
            for (int i = 0; i < PaymentFieldTypes.Length; i++)
            {
                if (string.Equals(field.Type, PaymentFieldTypes[i], StringComparison.OrdinalIgnoreCase)) return true;
            }
            return false;
        }

        public static bool HasPaymentFields(FormSchema schema)
        {
            if (schema == null || schema.Fields == null) return false;
            foreach (var field in MegaFormUtils.FlattenFields(schema.Fields))
            {
                if (IsPaymentField(field)) return true;
            }
            return false;
        }

        public async Task<PaymentVerificationOutcome> VerifyAsync(FormInfo form, FormSchema schema, Dictionary<string, object> formData)
        {
            if (form == null || schema == null || schema.Fields == null || formData == null)
                return PaymentVerificationOutcome.Ok();

            foreach (var field in MegaFormUtils.FlattenFields(schema.Fields))
            {
                if (!IsPaymentField(field)) continue;

                var outcome = await VerifyFieldAsync(form, field, formData).ConfigureAwait(false);
                if (!outcome.Allowed) return outcome;
            }
            return PaymentVerificationOutcome.Ok();
        }

        private async Task<PaymentVerificationOutcome> VerifyFieldAsync(FormInfo form, FormField field, Dictionary<string, object> formData)
        {
            var props = field.WidgetProps ?? new Dictionary<string, object>();
            bool requiredPaid = ReadBool(props, "requiredPaid", true);
            var claimed = ParseClaimedValue(GetFormValue(formData, field.Key));
            string claimedStatus = claimed != null ? (claimed.Value<string>("status") ?? string.Empty) : string.Empty;

            if (!string.Equals(claimedStatus, "paid", StringComparison.OrdinalIgnoreCase))
            {
                if (requiredPaid)
                {
                    return PaymentVerificationOutcome.Reject(field.Key,
                        "Payment is required before this form can be submitted.");
                }
                return PaymentVerificationOutcome.Ok();
            }

            // The client claims the money moved. From here on nothing the client
            // sent is trusted — provider + transactionId are only lookup keys.
            string provider = (claimed.Value<string>("provider") ?? string.Empty).Trim().ToLowerInvariant();

            // Legacy alias field types pin the provider server-side.
            if (string.Equals(field.Type, "StripePayment", StringComparison.OrdinalIgnoreCase)) provider = "stripe";
            if (string.Equals(field.Type, "PayPalPayment", StringComparison.OrdinalIgnoreCase)) provider = "paypal";

            string transactionId = (claimed.Value<string>("transactionId") ?? string.Empty).Trim();
            if ((provider != "stripe" && provider != "paypal") || transactionId.Length == 0 || transactionId.Length > 200)
            {
                Log("Rejected paid claim with missing/invalid provider or transactionId (form " + form.FormId + ").");
                return PaymentVerificationOutcome.Reject(field.Key, "Payment could not be verified. Please try again.");
            }

            // Replay guards must key on the identity the GATEWAY knows, not on the
            // client's transactionId string — otherwise the same intent/order can be
            // replayed under a different claimed id while meta points at the real one.
            var claimedMeta = claimed["meta"] as JObject;
            string canonicalId;
            if (provider == "stripe")
            {
                canonicalId = transactionId.StartsWith("pi_", StringComparison.Ordinal)
                    ? transactionId
                    : (claimedMeta != null ? (claimedMeta.Value<string>("paymentIntentId") ?? string.Empty).Trim() : string.Empty);
                if (!canonicalId.StartsWith("pi_", StringComparison.Ordinal))
                {
                    Log("Stripe paid claim without a payment intent id (form " + form.FormId + ").");
                    return PaymentVerificationOutcome.Reject(field.Key, "Payment could not be verified. Please try again.");
                }
            }
            else
            {
                canonicalId = claimedMeta != null ? (claimedMeta.Value<string>("orderId") ?? string.Empty).Trim() : string.Empty;
                if (canonicalId.Length == 0) canonicalId = transactionId;
            }
            if (canonicalId.Length == 0 || canonicalId.Length > 200)
            {
                return PaymentVerificationOutcome.Reject(field.Key, "Payment could not be verified. Please try again.");
            }

            string txKey = provider + ":" + canonicalId;
            if (!PaymentTransactionRegistry.TryBeginConsume(txKey))
            {
                return PaymentVerificationOutcome.Reject(field.Key,
                    "This payment has already been used by another submission.");
            }

            bool verified = false;
            try
            {
                // Durable replay guard: a transactionId may pay for exactly one
                // stored submission. DataJson search is a LIKE, but gateway ids
                // (pi_…, PayPal capture ids) are high-entropy so false hits are
                // not a practical concern.
                try
                {
                    var duplicates = _subRepo.List(form.FormId, null, transactionId, null, null, 0, 1);
                    if (duplicates.TotalCount > 0)
                    {
                        return PaymentVerificationOutcome.Reject(field.Key,
                            "This payment has already been used by another submission.");
                    }
                }
                catch (Exception ex)
                {
                    Log("Duplicate-payment lookup failed (fail closed): " + ex.Message);
                    return PaymentVerificationOutcome.Reject(field.Key,
                        "Payment could not be verified right now. Please try again.");
                }

                var expected = ResolveExpectedPrice(field, props, formData);

                var gatewayResult = provider == "stripe"
                    ? await VerifyStripeAsync(form, field, claimed, transactionId, expected).ConfigureAwait(false)
                    : await VerifyPayPalAsync(form, field, claimed, transactionId, expected).ConfigureAwait(false);
                var gatewayOutcome = gatewayResult.Item1;
                var verifiedValue = gatewayResult.Item2;

                if (!gatewayOutcome.Allowed) return gatewayOutcome;

                // Persist the SERVER-verified value; the client's numbers never
                // reach DataJson.
                formData[field.Key] = verifiedValue.ToString(Formatting.None);
                verified = true;
                return PaymentVerificationOutcome.Ok();
            }
            finally
            {
                if (!verified) PaymentTransactionRegistry.Release(txKey);
            }
        }

        // ── Stripe ─────────────────────────────────────────────────────────

        private async Task<Tuple<PaymentVerificationOutcome, JObject>> VerifyStripeAsync(FormInfo form, FormField field, JObject claimed,
            string transactionId, ExpectedPrice expected)
        {
            string secretKey = _store != null ? _store.Get(form.PortalId, PaymentSettingKeys.StripeSecretKey) : null;
            if (string.IsNullOrWhiteSpace(secretKey))
            {
                Log("Stripe secret key is not configured — rejecting paid claim on form " + form.FormId + ".");
                return Fail(PaymentVerificationOutcome.Reject(field.Key,
                    "Payment provider is not configured. Please contact the site administrator."));
            }

            string intentId = transactionId;
            if (!intentId.StartsWith("pi_", StringComparison.Ordinal))
            {
                var meta = claimed["meta"] as JObject;
                var fromMeta = meta != null ? (meta.Value<string>("paymentIntentId") ?? string.Empty).Trim() : string.Empty;
                if (fromMeta.StartsWith("pi_", StringComparison.Ordinal)) intentId = fromMeta;
            }
            if (!intentId.StartsWith("pi_", StringComparison.Ordinal))
            {
                Log("Stripe paid claim without a payment intent id (form " + form.FormId + ").");
                return Fail(PaymentVerificationOutcome.Reject(field.Key, "Payment could not be verified. Please try again."));
            }

            var resp = await _gateway.StripeGetPaymentIntentAsync(secretKey, intentId).ConfigureAwait(false);
            if (resp.TransportError)
            {
                Log("Stripe verify transport error for " + intentId + ": " + resp.Error);
                return Fail(PaymentVerificationOutcome.Reject(field.Key,
                    "Payment could not be verified right now. Please try again in a moment."));
            }
            if (!resp.IsSuccess || resp.Json == null)
            {
                Log("Stripe verify returned " + resp.StatusCode + " for " + intentId + ".");
                return Fail(PaymentVerificationOutcome.Reject(field.Key, "Payment could not be verified. Please try again."));
            }

            var pi = resp.Json;
            string status = pi.Value<string>("status") ?? string.Empty;
            if (string.Equals(status, "processing", StringComparison.OrdinalIgnoreCase))
            {
                return Fail(PaymentVerificationOutcome.Reject(field.Key,
                    "Your payment is still processing. Please wait a moment and submit again."));
            }
            if (!string.Equals(status, "succeeded", StringComparison.OrdinalIgnoreCase))
            {
                Log("Stripe intent " + intentId + " has status '" + status + "' — rejecting paid claim.");
                return Fail(PaymentVerificationOutcome.Reject(field.Key, "Payment was not completed. Please try again."));
            }

            // The intent must have been minted by OUR create-intent for THIS form.
            var metadata = pi["metadata"] as JObject;
            string mdFormId = metadata != null ? (metadata.Value<string>("formId") ?? string.Empty) : string.Empty;
            if (!string.Equals(mdFormId, form.FormId.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal))
            {
                Log("Stripe intent " + intentId + " metadata formId '" + mdFormId + "' does not match form " + form.FormId + " — rejecting (cross-form replay).");
                return Fail(PaymentVerificationOutcome.Reject(field.Key, "Payment could not be verified for this form."));
            }

            string gwCurrency = (pi.Value<string>("currency") ?? string.Empty).ToUpperInvariant();
            long gwMinor = pi.Value<long?>("amount_received") ?? pi.Value<long?>("amount") ?? 0;
            decimal gwAmount = PaymentCurrency.FromStripeMinorUnits(gwMinor, gwCurrency);

            var priceCheck = CheckExpectedPrice(field, expected, gwAmount, gwCurrency,
                delegate(decimal amt, string cur) { return PaymentCurrency.ToStripeMinorUnits(amt, cur) == gwMinor; });
            if (priceCheck != null) return Fail(priceCheck);

            var value = BuildVerifiedValue("stripe", gwAmount, gwCurrency, transactionId, claimed, new JObject
            {
                ["paymentIntentId"] = intentId
            });
            return Tuple.Create(PaymentVerificationOutcome.Ok(), value);
        }

        private static Tuple<PaymentVerificationOutcome, JObject> Fail(PaymentVerificationOutcome outcome)
        {
            return Tuple.Create(outcome, (JObject)null);
        }

        // ── PayPal ─────────────────────────────────────────────────────────

        private async Task<Tuple<PaymentVerificationOutcome, JObject>> VerifyPayPalAsync(FormInfo form, FormField field,
            JObject claimed, string transactionId, ExpectedPrice expected)
        {
            string clientId = _store != null ? _store.Get(form.PortalId, PaymentSettingKeys.PayPalClientId) : null;
            string clientSecret = _store != null ? _store.Get(form.PortalId, PaymentSettingKeys.PayPalClientSecret) : null;
            string mode = _store != null ? (_store.Get(form.PortalId, PaymentSettingKeys.PayPalMode) ?? "sandbox") : "sandbox";
            if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            {
                Log("PayPal credentials are not configured — rejecting paid claim on form " + form.FormId + ".");
                return Tuple.Create(PaymentVerificationOutcome.Reject(field.Key,
                    "Payment provider is not configured. Please contact the site administrator."), (JObject)null);
            }

            string baseUrl = PaymentGatewayClient.PayPalBaseUrl(mode);
            var tokenResp = await _gateway.GetPayPalTokenAsync(clientId, clientSecret, baseUrl).ConfigureAwait(false);
            string token = tokenResp.Json != null ? tokenResp.Json.Value<string>("access_token") : null;
            if (!tokenResp.IsSuccess || string.IsNullOrWhiteSpace(token))
            {
                Log("PayPal auth failed during verification: " + (tokenResp.Error ?? tokenResp.StatusCode.ToString()));
                return Tuple.Create(PaymentVerificationOutcome.Reject(field.Key,
                    "Payment could not be verified right now. Please try again in a moment."), (JObject)null);
            }

            var meta = claimed["meta"] as JObject;
            string orderId = meta != null ? (meta.Value<string>("orderId") ?? string.Empty).Trim() : string.Empty;
            if (orderId.Length == 0) orderId = transactionId;

            var resp = await _gateway.PayPalGetOrderAsync(baseUrl, token, orderId).ConfigureAwait(false);
            if (resp.TransportError)
            {
                Log("PayPal verify transport error for order " + orderId + ": " + resp.Error);
                return Tuple.Create(PaymentVerificationOutcome.Reject(field.Key,
                    "Payment could not be verified right now. Please try again in a moment."), (JObject)null);
            }
            if (!resp.IsSuccess || resp.Json == null)
            {
                Log("PayPal verify returned " + resp.StatusCode + " for order " + orderId + ".");
                return Tuple.Create(PaymentVerificationOutcome.Reject(field.Key,
                    "Payment could not be verified. Please try again."), (JObject)null);
            }

            var order = resp.Json;
            string status = order.Value<string>("status") ?? string.Empty;
            if (!string.Equals(status, "COMPLETED", StringComparison.OrdinalIgnoreCase))
            {
                Log("PayPal order " + orderId + " has status '" + status + "' — rejecting paid claim.");
                return Tuple.Create(PaymentVerificationOutcome.Reject(field.Key,
                    "Payment was not completed. Please try again."), (JObject)null);
            }

            var unit = order["purchase_units"] is JArray units && units.Count > 0 ? units[0] as JObject : null;
            if (unit == null)
            {
                return Tuple.Create(PaymentVerificationOutcome.Reject(field.Key,
                    "Payment could not be verified. Please try again."), (JObject)null);
            }

            // custom_id carries the formId our create-order stamped — the
            // cross-form replay guard, same as Stripe's metadata.formId.
            string customId = unit.Value<string>("custom_id") ?? string.Empty;
            if (!string.Equals(customId, form.FormId.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal))
            {
                Log("PayPal order " + orderId + " custom_id '" + customId + "' does not match form " + form.FormId + " — rejecting (cross-form replay).");
                return Tuple.Create(PaymentVerificationOutcome.Reject(field.Key,
                    "Payment could not be verified for this form."), (JObject)null);
            }

            // The money truth for a captured order is the COMPLETED capture.
            JObject capture = null;
            var payments = unit["payments"] as JObject;
            var captures = payments != null ? payments["captures"] as JArray : null;
            if (captures != null)
            {
                for (int i = 0; i < captures.Count; i++)
                {
                    var c = captures[i] as JObject;
                    if (c == null) continue;
                    bool captureCompleted = string.Equals(c.Value<string>("status") ?? string.Empty, "COMPLETED", StringComparison.OrdinalIgnoreCase);
                    bool idMatches = string.Equals(c.Value<string>("id") ?? string.Empty, transactionId, StringComparison.Ordinal);
                    if (captureCompleted && (idMatches || transactionId == orderId))
                    {
                        capture = c;
                        break;
                    }
                }
            }
            if (capture == null)
            {
                Log("PayPal order " + orderId + " has no COMPLETED capture matching '" + transactionId + "' — rejecting.");
                return Tuple.Create(PaymentVerificationOutcome.Reject(field.Key,
                    "Payment was not completed. Please try again."), (JObject)null);
            }

            var amountObj = capture["amount"] as JObject;
            string gwCurrency = amountObj != null ? (amountObj.Value<string>("currency_code") ?? string.Empty).ToUpperInvariant() : string.Empty;
            decimal gwAmount;
            var valueRaw = amountObj != null ? (amountObj.Value<string>("value") ?? string.Empty) : string.Empty;
            if (!decimal.TryParse(valueRaw, NumberStyles.Any, CultureInfo.InvariantCulture, out gwAmount) || gwAmount <= 0m)
            {
                return Tuple.Create(PaymentVerificationOutcome.Reject(field.Key,
                    "Payment could not be verified. Please try again."), (JObject)null);
            }

            var priceCheck = CheckExpectedPrice(field, expected, gwAmount, gwCurrency,
                delegate(decimal amt, string cur)
                {
                    return string.Equals(PaymentCurrency.ToPayPalValue(amt, cur), PaymentCurrency.ToPayPalValue(gwAmount, gwCurrency), StringComparison.Ordinal);
                });
            if (priceCheck != null) return Tuple.Create(priceCheck, (JObject)null);

            string captureId = capture.Value<string>("id") ?? transactionId;
            var value = BuildVerifiedValue("paypal", gwAmount, gwCurrency, captureId, claimed, new JObject
            {
                ["orderId"] = orderId
            });
            return Tuple.Create(PaymentVerificationOutcome.Ok(), value);
        }

        // ── Price expectation ──────────────────────────────────────────────

        private sealed class ExpectedPrice
        {
            public string Mode;            // fixed | field | bounds
            public decimal? Amount;        // authoritative when Mode != bounds
            public string Currency;        // authoritative when set
            public decimal? Min;
            public decimal? Max;
        }

        /// <summary>
        /// Re-derive the price the server can vouch for. fixed → schema amount.
        /// field → the source field's value inside THIS submission (the data is
        /// present at submit time, unlike at create-intent time). listenTotals or
        /// an unresolvable source → optional min/max bounds; the gateway amount
        /// becomes the recorded truth.
        /// </summary>
        private ExpectedPrice ResolveExpectedPrice(FormField field, Dictionary<string, object> props, Dictionary<string, object> formData)
        {
            var expected = new ExpectedPrice { Mode = "bounds" };
            expected.Min = ReadDecimal(props, "minAmount");
            expected.Max = ReadDecimal(props, "maxAmount");
            var currency = ReadString(props, "currency");
            if (!string.IsNullOrWhiteSpace(currency)) expected.Currency = currency.Trim().ToUpperInvariant();

            string mode = (ReadString(props, "amountMode") ?? string.Empty).Trim().ToLowerInvariant();
            decimal? schemaAmount = ReadDecimal(props, "amount");

            if (mode == "field")
            {
                string sourceKey = ReadString(props, "amountFieldKey");
                if (!string.IsNullOrWhiteSpace(sourceKey))
                {
                    decimal parsed;
                    if (TryCoerceAmount(GetFormValue(formData, sourceKey), out parsed) && parsed > 0m)
                    {
                        expected.Mode = "field";
                        expected.Amount = Math.Round(parsed, 2, MidpointRounding.AwayFromZero);
                        return expected;
                    }
                }
                return expected; // unresolvable source → bounds only
            }
            if (mode == "listentotals")
            {
                return expected; // client-computed → bounds only
            }

            // fixed, or legacy widget with a stored amount and no explicit mode.
            if (schemaAmount.HasValue && schemaAmount.Value > 0m)
            {
                expected.Mode = "fixed";
                expected.Amount = schemaAmount.Value;
            }
            return expected;
        }

        /// <summary>Null when the gateway numbers satisfy the expectation; a rejection otherwise.</summary>
        private PaymentVerificationOutcome CheckExpectedPrice(FormField field, ExpectedPrice expected,
            decimal gatewayAmount, string gatewayCurrency, Func<decimal, string, bool> amountsMatch)
        {
            if (gatewayAmount <= 0m)
            {
                return PaymentVerificationOutcome.Reject(field.Key, "Payment was not completed. Please try again.");
            }
            if (!string.IsNullOrWhiteSpace(expected.Currency) &&
                !string.Equals(expected.Currency, gatewayCurrency, StringComparison.OrdinalIgnoreCase))
            {
                Log("Payment currency mismatch on '" + field.Key + "': expected " + expected.Currency + ", gateway " + gatewayCurrency + ".");
                return PaymentVerificationOutcome.Reject(field.Key, "The payment does not match this form's price.");
            }
            if (expected.Amount.HasValue)
            {
                if (!amountsMatch(expected.Amount.Value, expected.Currency ?? gatewayCurrency))
                {
                    Log("Payment amount mismatch on '" + field.Key + "': expected " +
                        expected.Amount.Value.ToString(CultureInfo.InvariantCulture) + " " + (expected.Currency ?? "?") +
                        ", gateway " + gatewayAmount.ToString(CultureInfo.InvariantCulture) + " " + gatewayCurrency + ".");
                    return PaymentVerificationOutcome.Reject(field.Key, "The payment does not match this form's price.");
                }
                return null;
            }
            if (expected.Min.HasValue && gatewayAmount < expected.Min.Value)
            {
                return PaymentVerificationOutcome.Reject(field.Key, "The payment is below this form's minimum amount.");
            }
            if (expected.Max.HasValue && gatewayAmount > expected.Max.Value)
            {
                return PaymentVerificationOutcome.Reject(field.Key, "The payment is above this form's maximum amount.");
            }
            return null;
        }

        private static JObject BuildVerifiedValue(string provider, decimal amount, string currency, string transactionId,
            JObject claimed, JObject meta)
        {
            string payerEmail = claimed.Value<string>("payerEmail") ?? string.Empty;
            string payerName = claimed.Value<string>("payerName") ?? string.Empty;
            string paidAt = claimed.Value<string>("paidAt");
            if (string.IsNullOrWhiteSpace(paidAt)) paidAt = DateTime.UtcNow.ToString("o");

            return new JObject
            {
                ["provider"] = provider,
                ["status"] = "paid",
                ["amount"] = amount,
                ["currency"] = currency,
                ["transactionId"] = transactionId,
                ["payerEmail"] = payerEmail,
                ["payerName"] = payerName,
                ["paidAt"] = paidAt,
                ["error"] = string.Empty,
                ["meta"] = meta ?? new JObject(),
                ["verified"] = true,
                ["verifiedAtUtc"] = DateTime.UtcNow.ToString("o")
            };
        }

        // ── Helpers ────────────────────────────────────────────────────────

        private static object GetFormValue(Dictionary<string, object> data, string key)
        {
            if (data == null || string.IsNullOrWhiteSpace(key)) return null;
            object value;
            if (data.TryGetValue(key, out value)) return value;
            foreach (var pair in data)
            {
                if (string.Equals(pair.Key, key, StringComparison.OrdinalIgnoreCase)) return pair.Value;
            }
            return null;
        }

        private static JObject ParseClaimedValue(object raw)
        {
            if (raw == null) return null;
            var asJObject = raw as JObject;
            if (asJObject != null) return asJObject;
            var asDict = raw as IDictionary<string, object>;
            if (asDict != null)
            {
                try { return JObject.FromObject(asDict); } catch { return null; }
            }
            var text = Convert.ToString(raw, CultureInfo.InvariantCulture);
            if (string.IsNullOrWhiteSpace(text)) return null;
            try { return JObject.Parse(text); } catch { return null; }
        }

        private static string ReadString(Dictionary<string, object> props, string key)
        {
            object value;
            if (props == null || !props.TryGetValue(key, out value) || value == null) return null;
            return Convert.ToString(value, CultureInfo.InvariantCulture);
        }

        private static bool ReadBool(Dictionary<string, object> props, string key, bool defaultValue)
        {
            var raw = ReadString(props, key);
            if (string.IsNullOrWhiteSpace(raw)) return defaultValue;
            raw = raw.Trim().ToLowerInvariant();
            if (raw == "true" || raw == "1" || raw == "yes" || raw == "on") return true;
            if (raw == "false" || raw == "0" || raw == "no" || raw == "off") return false;
            return defaultValue;
        }

        private static decimal? ReadDecimal(Dictionary<string, object> props, string key)
        {
            var raw = ReadString(props, key);
            decimal parsed;
            if (!string.IsNullOrWhiteSpace(raw) &&
                decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out parsed) && parsed > 0m)
            {
                return parsed;
            }
            return null;
        }

        /// <summary>Server-side twin of the widget's amount coercion: accept "1,250.50",
        /// "$99", plain numbers; reject everything else.</summary>
        private static bool TryCoerceAmount(object raw, out decimal amount)
        {
            amount = 0m;
            if (raw == null) return false;
            if (raw is decimal) { amount = (decimal)raw; return true; }
            if (raw is int) { amount = (int)raw; return true; }
            if (raw is long) { amount = (long)raw; return true; }
            if (raw is double) { amount = (decimal)(double)raw; return true; }

            var text = Convert.ToString(raw, CultureInfo.InvariantCulture);
            if (string.IsNullOrWhiteSpace(text)) return false;
            var cleaned = System.Text.RegularExpressions.Regex.Replace(text, "[^0-9,.\\-]", string.Empty);
            if (cleaned.IndexOf(',') >= 0 && cleaned.IndexOf('.') < 0) cleaned = cleaned.Replace(',', '.');
            else cleaned = cleaned.Replace(",", string.Empty);
            return decimal.TryParse(cleaned, NumberStyles.Any, CultureInfo.InvariantCulture, out amount);
        }

        private void Log(string message)
        {
            if (_log != null) _log.LogWarning(nameof(PaymentSubmissionVerifier), message);
        }
    }
}
