using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Services.Blog
{
    public interface IScheduledPublishService
    {
        Task<int> ProcessScheduledPostsAsync(int portalId, CancellationToken ct = default);
    }
}
