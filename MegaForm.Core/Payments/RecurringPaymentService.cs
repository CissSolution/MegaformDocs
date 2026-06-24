using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Payments
{
    /// <summary>
    /// Platform-agnostic orchestrator for payment providers including
    /// one-time payments, subscriptions, coupons, and fee calculation.
    /// </summary>
    public class RecurringPaymentService : IRecurringPaymentService
    {
        private readonly IReadOnlyDictionary<string, IPaymentProvider> _providers;

        public RecurringPaymentService(IEnumerable<IPaymentProvider> providers)
        {
            if (providers == null)
                throw new ArgumentNullException(nameof(providers));

            _providers = providers.ToDictionary(p => p.ProviderName, p => p, StringComparer.OrdinalIgnoreCase);
        }

        public Task<IReadOnlyList<string>> GetRegisteredProviderNamesAsync(CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<string>>(_providers.Keys.ToList());
        }

        public async Task<PaymentIntentResult> CreatePaymentIntentAsync(PaymentIntentRequest request, CancellationToken cancellationToken = default)
        {
            if (request?.Settings == null)
                return PaymentIntentResult.Fail("Payment settings are required.");

            if (!_providers.TryGetValue(request.Settings.ProviderName, out var provider))
                return PaymentIntentResult.Fail($"Payment provider '{request.Settings.ProviderName}' is not registered.");

            return await provider.CreatePaymentIntentAsync(request, cancellationToken).ConfigureAwait(false);
        }

        public async Task<SubscriptionResult> CreateSubscriptionAsync(SubscriptionRequest request, CancellationToken cancellationToken = default)
        {
            if (request?.Settings == null)
                return SubscriptionResult.Fail("Payment settings are required.");

            if (!_providers.TryGetValue(request.Settings.ProviderName, out var provider))
                return SubscriptionResult.Fail($"Payment provider '{request.Settings.ProviderName}' is not registered.");

            return await provider.CreateSubscriptionAsync(request, cancellationToken).ConfigureAwait(false);
        }

        public async Task<SubscriptionResult> CancelSubscriptionAsync(string providerName, string subscriptionId, PaymentConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            if (settings == null)
                return SubscriptionResult.Fail("Payment settings are required.");

            if (!_providers.TryGetValue(providerName, out var provider))
                return SubscriptionResult.Fail($"Payment provider '{providerName}' is not registered.");

            return await provider.CancelSubscriptionAsync(subscriptionId, settings, cancellationToken).ConfigureAwait(false);
        }

        public async Task<CouponResult> CreateCouponAsync(string providerName, CouponDefinition coupon, PaymentConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            if (settings == null)
                return CouponResult.Fail("Payment settings are required.");

            if (!_providers.TryGetValue(providerName, out var provider))
                return CouponResult.Fail($"Payment provider '{providerName}' is not registered.");

            return await provider.CreateCouponAsync(coupon, settings, cancellationToken).ConfigureAwait(false);
        }

        public async Task<CalculationResult> CalculateAsync(CalculationRequest request, CancellationToken cancellationToken = default)
        {
            if (request?.Settings == null)
                return CalculationResult.Empty(request?.Currency ?? "usd");

            if (!_providers.TryGetValue(request.Settings.ProviderName, out var provider))
                return CalculationResult.Empty(request.Currency);

            return await provider.CalculateAsync(request, cancellationToken).ConfigureAwait(false);
        }

        public async Task<PaymentHealthResult> TestConnectionAsync(string providerName, PaymentConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            if (settings == null)
                return PaymentHealthResult.Fail("Payment settings are required.");

            if (!_providers.TryGetValue(providerName, out var provider))
                return PaymentHealthResult.Fail($"Payment provider '{providerName}' is not registered.");

            return await provider.HealthCheckAsync(settings, cancellationToken).ConfigureAwait(false);
        }
    }
}
