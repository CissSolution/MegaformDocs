using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Payments
{
    /// <summary>
    /// Platform-agnostic contract for payment processors
    /// (Stripe, PayPal, Square, Adyen, ...).
    /// </summary>
    public interface IPaymentProvider
    {
        string ProviderName { get; }

        Task<PaymentHealthResult> HealthCheckAsync(PaymentConnectionSettings settings, CancellationToken cancellationToken = default);

        Task<PaymentIntentResult> CreatePaymentIntentAsync(PaymentIntentRequest request, CancellationToken cancellationToken = default);

        Task<PaymentIntentResult> CapturePaymentIntentAsync(string intentId, PaymentConnectionSettings settings, CancellationToken cancellationToken = default);

        Task<SubscriptionResult> CreateSubscriptionAsync(SubscriptionRequest request, CancellationToken cancellationToken = default);

        Task<SubscriptionResult> CancelSubscriptionAsync(string subscriptionId, PaymentConnectionSettings settings, CancellationToken cancellationToken = default);

        Task<CouponResult> CreateCouponAsync(CouponDefinition coupon, PaymentConnectionSettings settings, CancellationToken cancellationToken = default);

        Task<CalculationResult> CalculateAsync(CalculationRequest request, CancellationToken cancellationToken = default);
    }
}
