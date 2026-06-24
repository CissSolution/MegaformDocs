using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Payments
{
    /// <summary>
    /// In-memory coupon store. Replace with persistent store for production.
    /// </summary>
    public class InMemoryCouponStore : ICouponStore
    {
        private readonly ConcurrentDictionary<string, CouponDefinition> _coupons = new ConcurrentDictionary<string, CouponDefinition>();
        private readonly ConcurrentDictionary<string, long> _redemptions = new ConcurrentDictionary<string, long>();

        public Task<CouponDefinition> GetByCodeAsync(string code, CancellationToken cancellationToken = default)
        {
            _coupons.TryGetValue(code?.ToLowerInvariant() ?? string.Empty, out var coupon);
            return Task.FromResult(coupon);
        }

        public Task<IReadOnlyList<CouponDefinition>> ListAsync(CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<CouponDefinition>>(_coupons.Values.ToList());
        }

        public Task SaveAsync(CouponDefinition coupon, CancellationToken cancellationToken = default)
        {
            if (coupon == null)
                return Task.CompletedTask;

            _coupons[coupon.Code.ToLowerInvariant()] = coupon;
            return Task.CompletedTask;
        }

        public Task DeleteAsync(string code, CancellationToken cancellationToken = default)
        {
            _coupons.TryRemove(code?.ToLowerInvariant() ?? string.Empty, out _);
            return Task.CompletedTask;
        }

        public Task<bool> RedeemAsync(string code, CancellationToken cancellationToken = default)
        {
            var key = code?.ToLowerInvariant() ?? string.Empty;
            if (!_coupons.TryGetValue(key, out var coupon))
                return Task.FromResult(false);

            if (coupon.MaxRedemptions.HasValue)
            {
                var current = _redemptions.AddOrUpdate(key, 1, (k, v) => v + 1);
                if (current > coupon.MaxRedemptions.Value)
                {
                    _redemptions.TryUpdate(key, coupon.MaxRedemptions.Value, current);
                    return Task.FromResult(false);
                }
            }

            return Task.FromResult(true);
        }
    }
}
