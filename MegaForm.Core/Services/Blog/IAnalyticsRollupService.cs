using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Services.Blog
{
    public interface IAnalyticsRollupService
    {
        Task<int> RollupBlogAnalyticsAsync(int portalId, CancellationToken ct = default);
    }
}
