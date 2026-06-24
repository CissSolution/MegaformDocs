using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Payments.Providers
{
    public class StripePaymentProvider : HttpPaymentProviderBase
    {
        public StripePaymentProvider(HttpClient httpClient) : base(httpClient) { }

        public override string ProviderName => "Stripe";

        protected override string GetDefaultBaseUrl(PaymentConnectionSettings settings)
        {
            return settings.Sandbox ? "https://api.stripe.com" : "https://api.stripe.com";
        }

        public override async Task<PaymentHealthResult> HealthCheckAsync(PaymentConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var request = CreateFormRequest(settings, HttpMethod.Get, "/v1/account", new Dictionary<string, string>());
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                if (response.IsSuccessStatusCode)
                    return PaymentHealthResult.Ok("Connected to Stripe.");

                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return PaymentHealthResult.Fail($"Stripe health check failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return PaymentHealthResult.Fail("Stripe health check error.", ex);
            }
        }

        public override async Task<PaymentIntentResult> CreatePaymentIntentAsync(PaymentIntentRequest request, CancellationToken cancellationToken = default)
        {
            try
            {
                var settings = request.Settings;
                long finalAmount = request.AmountInCents;

                if (!string.IsNullOrWhiteSpace(request.CouponCode))
                {
                    // Coupon application is handled by calculation service; this is a fallback.
                    finalAmount = await ApplyCouponAsync(settings, request.CouponCode, finalAmount, cancellationToken).ConfigureAwait(false);
                }

                var parameters = new Dictionary<string, string>
                {
                    ["amount"] = finalAmount.ToString(),
                    ["currency"] = request.Currency,
                    ["automatic_payment_methods[enabled]"] = "true",
                    ["metadata[form_title]"] = request.FormTitle ?? ""
                };

                if (!string.IsNullOrWhiteSpace(request.CustomerEmail))
                    parameters["receipt_email"] = request.CustomerEmail;

                foreach (var kvp in request.Metadata)
                    parameters[$"metadata[{kvp.Key}]"] = kvp.Value?.ToString() ?? "";

                var stripeRequest = CreateFormRequest(settings, HttpMethod.Post, "/v1/payment_intents", parameters);
                var response = await HttpClient.SendAsync(stripeRequest, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                {
                    var json = JObject.Parse(body);
                    return PaymentIntentResult.Ok(
                        json["id"]?.ToString(),
                        json["client_secret"]?.ToString(),
                        json["amount"]?.Value<long>() ?? finalAmount,
                        json["currency"]?.ToString() ?? request.Currency,
                        json["status"]?.ToString());
                }

                return PaymentIntentResult.Fail($"Stripe PaymentIntent failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return PaymentIntentResult.Fail("Stripe PaymentIntent error.", ex);
            }
        }

        public override async Task<PaymentIntentResult> CapturePaymentIntentAsync(string intentId, PaymentConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var parameters = new Dictionary<string, string>();
                var request = CreateFormRequest(settings, HttpMethod.Post, $"/v1/payment_intents/{intentId}/capture", parameters);
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                {
                    var json = JObject.Parse(body);
                    return PaymentIntentResult.Ok(
                        json["id"]?.ToString(),
                        null,
                        json["amount"]?.Value<long>() ?? 0,
                        json["currency"]?.ToString(),
                        json["status"]?.ToString());
                }

                return PaymentIntentResult.Fail($"Stripe capture failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return PaymentIntentResult.Fail("Stripe capture error.", ex);
            }
        }

        public override async Task<SubscriptionResult> CreateSubscriptionAsync(SubscriptionRequest request, CancellationToken cancellationToken = default)
        {
            try
            {
                var settings = request.Settings;

                // 1. Create or retrieve customer.
                var customerId = await CreateCustomerAsync(settings, request.CustomerEmail, request.CustomerName, cancellationToken).ConfigureAwait(false);
                if (string.IsNullOrWhiteSpace(customerId))
                    return SubscriptionResult.Fail("Could not create Stripe customer.");

                // 2. Create subscription.
                var parameters = new Dictionary<string, string>
                {
                    ["customer"] = customerId,
                    ["items[0][price]"] = request.PriceId,
                    ["payment_behavior"] = "default_incomplete",
                    ["expand[0]"] = "latest_invoice.payment_intent"
                };

                if (!string.IsNullOrWhiteSpace(request.CouponCode))
                    parameters["coupon"] = request.CouponCode;

                if (request.TrialDays.HasValue)
                    parameters["trial_period_days"] = request.TrialDays.Value.ToString();

                foreach (var kvp in request.Metadata)
                    parameters[$"metadata[{kvp.Key}]"] = kvp.Value?.ToString() ?? "";

                var subRequest = CreateFormRequest(settings, HttpMethod.Post, "/v1/subscriptions", parameters);
                var response = await HttpClient.SendAsync(subRequest, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                {
                    var json = JObject.Parse(body);
                    var clientSecret = json["latest_invoice"]?["payment_intent"]?["client_secret"]?.ToString();
                    return SubscriptionResult.Ok(json["id"]?.ToString(), json["status"]?.ToString(), clientSecret);
                }

                return SubscriptionResult.Fail($"Stripe subscription failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return SubscriptionResult.Fail("Stripe subscription error.", ex);
            }
        }

        public override async Task<SubscriptionResult> CancelSubscriptionAsync(string subscriptionId, PaymentConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var request = CreateFormRequest(settings, HttpMethod.Delete, $"/v1/subscriptions/{subscriptionId}", new Dictionary<string, string>());
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                {
                    var json = JObject.Parse(body);
                    return SubscriptionResult.Ok(json["id"]?.ToString(), json["status"]?.ToString());
                }

                return SubscriptionResult.Fail($"Stripe cancel subscription failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return SubscriptionResult.Fail("Stripe cancel subscription error.", ex);
            }
        }

        public override async Task<CouponResult> CreateCouponAsync(CouponDefinition coupon, PaymentConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var parameters = new Dictionary<string, string>
                {
                    ["id"] = coupon.Code,
                    ["duration"] = "forever"
                };

                if (coupon.Type == CouponType.Percent)
                    parameters["percent_off"] = coupon.DiscountValue.ToString();
                else
                    parameters["amount_off"] = ((long)(coupon.DiscountValue * 100)).ToString();

                if (coupon.MaxRedemptions.HasValue)
                    parameters["max_redemptions"] = coupon.MaxRedemptions.Value.ToString();

                if (coupon.RedeemBy.HasValue)
                    parameters["redeem_by"] = new DateTimeOffset(coupon.RedeemBy.Value).ToUnixTimeSeconds().ToString();

                var request = CreateFormRequest(settings, HttpMethod.Post, "/v1/coupons", parameters);
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                {
                    var json = JObject.Parse(body);
                    return CouponResult.Ok(json["id"]?.ToString(), json["id"]?.ToString());
                }

                return CouponResult.Fail($"Stripe coupon failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return CouponResult.Fail("Stripe coupon error.", ex);
            }
        }

        public override async Task<CalculationResult> CalculateAsync(CalculationRequest request, CancellationToken cancellationToken = default)
        {
            var result = CalculationResult.Empty(request.Currency);
            result.SubtotalInCents = request.LineItems.Sum(i => i.AmountInCents * i.Quantity);
            if (result.SubtotalInCents == 0)
                result.SubtotalInCents = request.BaseAmountInCents;

            result.Currency = request.Currency;

            if (!string.IsNullOrWhiteSpace(request.CouponCode) && request.Settings != null)
            {
                result.AppliedCouponCode = request.CouponCode;
                var discount = await GetCouponDiscountAsync(request.Settings, request.CouponCode, result.SubtotalInCents, cancellationToken).ConfigureAwait(false);
                result.DiscountInCents = discount;
            }

            // Platform fee
            if (request.Settings?.TransactionFeePercent.HasValue == true)
            {
                result.FeeInCents += (long)(result.SubtotalInCents * request.Settings.TransactionFeePercent.Value / 100m);
            }
            if (request.Settings?.TransactionFeeFixed.HasValue == true)
            {
                result.FeeInCents += (long)(request.Settings.TransactionFeeFixed.Value * 100);
            }

            result.TotalInCents = result.SubtotalInCents - result.DiscountInCents + result.TaxInCents + result.FeeInCents;
            return result;
        }

        private async Task<string> CreateCustomerAsync(PaymentConnectionSettings settings, string email, string name, CancellationToken cancellationToken)
        {
            var parameters = new Dictionary<string, string>();
            if (!string.IsNullOrWhiteSpace(email))
                parameters["email"] = email;
            if (!string.IsNullOrWhiteSpace(name))
                parameters["name"] = name;

            var request = CreateFormRequest(settings, HttpMethod.Post, "/v1/customers", parameters);
            var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
                return null;

            var json = JObject.Parse(body);
            return json["id"]?.ToString();
        }

        private async Task<long> ApplyCouponAsync(PaymentConnectionSettings settings, string couponCode, long amountInCents, CancellationToken cancellationToken)
        {
            var discount = await GetCouponDiscountAsync(settings, couponCode, amountInCents, cancellationToken).ConfigureAwait(false);
            return amountInCents - discount;
        }

        private async Task<long> GetCouponDiscountAsync(PaymentConnectionSettings settings, string couponCode, long amountInCents, CancellationToken cancellationToken)
        {
            try
            {
                var request = CreateFormRequest(settings, HttpMethod.Get, $"/v1/coupons/{couponCode}", new Dictionary<string, string>());
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                    return 0;

                var json = JObject.Parse(body);
                if (json["percent_off"] != null)
                {
                    var percent = json["percent_off"].Value<decimal>();
                    return (long)(amountInCents * percent / 100m);
                }

                if (json["amount_off"] != null)
                    return json["amount_off"].Value<long>();

                return 0;
            }
            catch
            {
                return 0;
            }
        }

        private HttpRequestMessage CreateFormRequest(PaymentConnectionSettings settings, HttpMethod method, string relativeUrl, Dictionary<string, string> parameters)
        {
            var baseUrl = ResolveBaseUrl(settings);
            var request = new HttpRequestMessage(method, baseUrl + relativeUrl);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", settings.SecretKey);

            if (parameters != null && parameters.Count > 0)
            {
                request.Content = new FormUrlEncodedContent(parameters);
            }

            return request;
        }
    }
}
