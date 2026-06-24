using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Integrations.Storage
{
    public interface IStorageIntegrationService
    {
        Task<IReadOnlyList<string>> GetRegisteredProviderNamesAsync(CancellationToken cancellationToken = default);

        Task<StorageResult> UploadSubmissionFilesAsync(
            StorageIntegrationMapping mapping,
            StorageConnectionSettings settings,
            int submissionId,
            IReadOnlyDictionary<string, Stream> files,
            CancellationToken cancellationToken = default);

        Task<StorageHealthResult> TestConnectionAsync(string providerName, StorageConnectionSettings settings, CancellationToken cancellationToken = default);
    }
}
