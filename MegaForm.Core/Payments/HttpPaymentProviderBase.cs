using System;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Payments
{
    public abstract class HttpPaymentProviderBase : IPaymentProvider
    {
        protected HttpClient HttpClient { get; }

        protected HttpPaymentProviderBase(HttpClient httpClient)
        {
            HttpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        }

        public abstract string ProviderName { get; }

        public abstract Task<PaymentHealthResult> HealthCheckAsync(PaymentConnectionSettings settings, CancellationToken cancellationToken = default);
        public abstract Task<PaymentIntentResult> CreatePaymentIntentAsync(PaymentIntentRequest request, CancellationToken cancellationToken = default);
        public abstract Task<PaymentIntentResult> CapturePaymentIntentAsync(string intentId, PaymentConnectionSettings settings, CancellationToken cancellationToken = default);
        public abstract Task<SubscriptionResult> CreateSubscriptionAsync(SubscriptionRequest request, CancellationToken cancellationToken = default);
        public abstract Task<SubscriptionResult> CancelSubscriptionAsync(string subscriptionId, PaymentConnectionSettings settings, CancellationToken cancellationToken = default);
        public abstract Task<CouponResult> CreateCouponAsync(CouponDefinition coupon, PaymentConnectionSettings settings, CancellationToken cancellationToken = default);
        public abstract Task<CalculationResult> CalculateAsync(CalculationRequest request, CancellationToken cancellationToken = default);

        protected virtual string ResolveBaseUrl(PaymentConnectionSettings settings)
        {
            if (!string.IsNullOrWhiteSpace(settings.BaseUrl))
                return settings.BaseUrl.TrimEnd('/');
            return GetDefaultBaseUrl(settings);
        }

        protected abstract string GetDefaultBaseUrl(PaymentConnectionSettings settings);
    }
}
