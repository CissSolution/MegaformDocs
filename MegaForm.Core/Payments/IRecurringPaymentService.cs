using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Payments
{
    public interface IRecurringPaymentService
    {
        Task<IReadOnlyList<string>> GetRegisteredProviderNamesAsync(CancellationToken cancellationToken = default);

        Task<PaymentIntentResult> CreatePaymentIntentAsync(PaymentIntentRequest request, CancellationToken cancellationToken = default);

        Task<SubscriptionResult> CreateSubscriptionAsync(SubscriptionRequest request, CancellationToken cancellationToken = default);

        Task<SubscriptionResult> CancelSubscriptionAsync(string providerName, string subscriptionId, PaymentConnectionSettings settings, CancellationToken cancellationToken = default);

        Task<CouponResult> CreateCouponAsync(string providerName, CouponDefinition coupon, PaymentConnectionSettings settings, CancellationToken cancellationToken = default);

        Task<CalculationResult> CalculateAsync(CalculationRequest request, CancellationToken cancellationToken = default);

        Task<PaymentHealthResult> TestConnectionAsync(string providerName, PaymentConnectionSettings settings, CancellationToken cancellationToken = default);
    }
}
