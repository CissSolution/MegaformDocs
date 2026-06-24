using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Payments
{
    /// <summary>
    /// Generic coupon repository. Implementations can be in-memory, JSON, or database-backed per host.
    /// </summary>
    public interface ICouponStore
    {
        Task<CouponDefinition> GetByCodeAsync(string code, CancellationToken cancellationToken = default);
        Task<IReadOnlyList<CouponDefinition>> ListAsync(CancellationToken cancellationToken = default);
        Task SaveAsync(CouponDefinition coupon, CancellationToken cancellationToken = default);
        Task DeleteAsync(string code, CancellationToken cancellationToken = default);
        Task<bool> RedeemAsync(string code, CancellationToken cancellationToken = default);
    }
}
