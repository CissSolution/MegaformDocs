using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Addons.OfflineForms
{
    /// <summary>
    /// Manages offline form caching and queued submission sync.
    /// Hosts provide local storage implementations; this service is platform agnostic.
    /// </summary>
    public interface IOfflineFormService
    {
        Task<OfflineFormManifest> GetCachedFormAsync(int formId, CancellationToken cancellationToken = default);
        Task CacheFormAsync(OfflineFormManifest manifest, CancellationToken cancellationToken = default);
        Task QueueSubmissionAsync(OfflineSubmissionQueueItem item, CancellationToken cancellationToken = default);
        Task<IReadOnlyList<OfflineSubmissionQueueItem>> GetPendingItemsAsync(int? formId = null, CancellationToken cancellationToken = default);
        Task<OfflineSyncResult> SyncAsync(CancellationToken cancellationToken = default);
        Task MarkSyncedAsync(string itemId, CancellationToken cancellationToken = default);
        Task MarkFailedAsync(string itemId, string errorMessage, CancellationToken cancellationToken = default);
    }
}
