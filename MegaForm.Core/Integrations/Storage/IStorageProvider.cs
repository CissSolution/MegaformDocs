using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Integrations.Storage
{
    /// <summary>
    /// Platform-agnostic contract for cloud storage providers
    /// (Google Drive, Dropbox, OneDrive, Box, ...).
    /// </summary>
    public interface IStorageProvider
    {
        string ProviderName { get; }

        Task<StorageHealthResult> HealthCheckAsync(StorageConnectionSettings settings, CancellationToken cancellationToken = default);

        Task<StorageItem> UploadAsync(StorageConnectionSettings settings, Stream stream, string fileName, string folderPath, CancellationToken cancellationToken = default);

        Task<Stream> DownloadAsync(StorageConnectionSettings settings, string itemId, CancellationToken cancellationToken = default);

        Task<IReadOnlyList<StorageItem>> ListAsync(StorageConnectionSettings settings, string folderPath, CancellationToken cancellationToken = default);

        Task DeleteAsync(StorageConnectionSettings settings, string itemId, CancellationToken cancellationToken = default);

        Task<string> CreateFolderAsync(StorageConnectionSettings settings, string folderName, string parentPath, CancellationToken cancellationToken = default);
    }
}
