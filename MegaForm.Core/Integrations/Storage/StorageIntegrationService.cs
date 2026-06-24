using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Integrations.Storage
{
    public class StorageIntegrationService : IStorageIntegrationService
    {
        private readonly IReadOnlyDictionary<string, IStorageProvider> _providers;

        public StorageIntegrationService(IEnumerable<IStorageProvider> providers)
        {
            if (providers == null)
                throw new ArgumentNullException(nameof(providers));

            _providers = providers.ToDictionary(p => p.ProviderName, p => p, StringComparer.OrdinalIgnoreCase);
        }

        public Task<IReadOnlyList<string>> GetRegisteredProviderNamesAsync(CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<string>>(_providers.Keys.ToList());
        }

        public async Task<StorageResult> UploadSubmissionFilesAsync(
            StorageIntegrationMapping mapping,
            StorageConnectionSettings settings,
            int submissionId,
            IReadOnlyDictionary<string, Stream> files,
            CancellationToken cancellationToken = default)
        {
            if (mapping == null)
                return StorageResult.Fail("Mapping is null.");
            if (settings == null)
                return StorageResult.Fail("Connection settings are null.");
            if (files == null || files.Count == 0)
                return StorageResult.Fail("No files to upload.");

            if (!_providers.TryGetValue(mapping.ProviderName, out var provider))
                return StorageResult.Fail($"Storage provider '{mapping.ProviderName}' is not registered.");

            var folderPath = mapping.TargetFolder ?? settings.BaseFolder ?? "/";
            if (mapping.OrganizeBySubmission)
                folderPath = Path.Combine(folderPath, $"submission-{submissionId}").Replace('\\', '/');

            StorageResult lastResult = null;
            foreach (var file in files)
            {
                if (file.Value == null)
                    continue;

                lastResult = StorageResult.Ok(await provider.UploadAsync(settings, file.Value, file.Key, folderPath, cancellationToken).ConfigureAwait(false));
            }

            return lastResult ?? StorageResult.Fail("No files uploaded.");
        }

        public async Task<StorageHealthResult> TestConnectionAsync(string providerName, StorageConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            if (settings == null)
                return StorageHealthResult.Fail("Connection settings are null.");

            if (!_providers.TryGetValue(providerName, out var provider))
                return StorageHealthResult.Fail($"Storage provider '{providerName}' is not registered.");

            return await provider.HealthCheckAsync(settings, cancellationToken).ConfigureAwait(false);
        }
    }
}
