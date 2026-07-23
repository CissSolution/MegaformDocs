using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using MegaForm.Core.Integrations.Storage;

namespace MegaForm.Integrations.CloudStorage
{
    /// <summary>
    /// [CloudStorage v20260723-01] Azure Blob Storage provider. Stateless: the service client is
    /// built per operation from <see cref="StorageConnectionSettings"/> so the provider can be a
    /// DI singleton or manually constructed (DNN).
    ///
    /// Settings mapping: ClientSecret = storage account connection string, BaseFolder = container
    /// name. StorageItem.Id is the full blob name; folder paths are "/" -separated name prefixes
    /// (Azure has no real folders — CreateFolder writes a zero-length ".keep" marker blob).
    /// </summary>
    public class AzureBlobStorageProvider : IStorageProvider
    {
        public string ProviderName => "AzureBlob";

        public Task<StorageHealthResult> HealthCheckAsync(StorageConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var exists = Container(settings).Exists(cancellationToken);
                return Task.FromResult(exists
                    ? StorageHealthResult.Ok("Connected to Azure Blob container '" + ContainerName(settings) + "'.")
                    : StorageHealthResult.Fail("Azure Blob container '" + ContainerName(settings) + "' does not exist."));
            }
            catch (Exception ex)
            {
                return Task.FromResult(StorageHealthResult.Fail("Azure Blob health check error: " + ex.Message, ex));
            }
        }

        public Task<StorageItem> UploadAsync(StorageConnectionSettings settings, Stream stream, string fileName, string folderPath, CancellationToken cancellationToken = default)
        {
            var name = CombineName(folderPath, fileName);
            var blob = Container(settings).GetBlobClient(name);
            var response = blob.Upload(stream, overwrite: true, cancellationToken);
            if (response.GetRawResponse().Status >= 300)
                throw new Exception("Azure Blob upload failed: " + response.GetRawResponse().Status);

            return Task.FromResult(new StorageItem
            {
                Id = name,
                Name = fileName,
                Path = folderPath,
                Size = stream.CanSeek ? stream.Length : (long?)null
            });
        }

        public Task<Stream> DownloadAsync(StorageConnectionSettings settings, string itemId, CancellationToken cancellationToken = default)
        {
            var blob = Container(settings).GetBlobClient(itemId);
            var download = blob.Download(cancellationToken);
            // Buffer to memory: the caller owns the stream, and submission files are already
            // size-capped by the upload endpoints.
            var buffer = new MemoryStream();
            download.Value.Content.CopyTo(buffer);
            buffer.Position = 0;
            return Task.FromResult<Stream>(buffer);
        }

        public Task<IReadOnlyList<StorageItem>> ListAsync(StorageConnectionSettings settings, string folderPath, CancellationToken cancellationToken = default)
        {
            var prefix = NormalizePrefix(folderPath);
            var items = new List<StorageItem>();

            foreach (var blobItem in Container(settings).GetBlobs(BlobTraits.None, BlobStates.None, prefix, cancellationToken))
            {
                var name = blobItem.Name;
                var isMarker = name.EndsWith("/.keep", StringComparison.Ordinal);
                items.Add(new StorageItem
                {
                    Id = name,
                    Name = isMarker ? name.Substring(0, name.Length - "/.keep".Length).Split('/').Last() : name.Split('/').Last(),
                    Path = folderPath,
                    Size = isMarker ? (long?)null : blobItem.Properties.ContentLength,
                    CreatedAt = blobItem.Properties.CreatedOn?.UtcDateTime,
                    ModifiedAt = blobItem.Properties.LastModified?.UtcDateTime,
                    IsFolder = isMarker
                });
            }
            return Task.FromResult<IReadOnlyList<StorageItem>>(items);
        }

        public Task DeleteAsync(StorageConnectionSettings settings, string itemId, CancellationToken cancellationToken = default)
        {
            Container(settings).GetBlobClient(itemId).DeleteIfExists(DeleteSnapshotsOption.IncludeSnapshots, null, cancellationToken);
            return Task.CompletedTask;
        }

        public Task<string> CreateFolderAsync(StorageConnectionSettings settings, string folderName, string parentPath, CancellationToken cancellationToken = default)
        {
            // Azure has no real folders — a zero-length ".keep" marker blob is the convention.
            var prefix = CombineName(parentPath, (folderName ?? string.Empty).Trim('/'));
            var marker = prefix + "/.keep";
            Container(settings).GetBlobClient(marker).Upload(new MemoryStream(new byte[0]), overwrite: true, cancellationToken);
            return Task.FromResult(marker);
        }

        private static BlobContainerClient Container(StorageConnectionSettings settings)
        {
            return new BlobContainerClient(ConnectionString(settings), ContainerName(settings));
        }

        private static string ConnectionString(StorageConnectionSettings settings)
        {
            var cs = (settings?.ClientSecret ?? string.Empty).Trim();
            if (cs.Length == 0)
                throw new InvalidOperationException("Azure Blob connection is missing a connection string (ClientSecret).");
            return cs;
        }

        private static string ContainerName(StorageConnectionSettings settings)
        {
            var name = (settings?.BaseFolder ?? string.Empty).Trim().Trim('/');
            if (name.Length == 0)
                throw new InvalidOperationException("Azure Blob connection is missing a container name (BaseFolder).");
            return name;
        }

        private static string NormalizePrefix(string folderPath)
        {
            var p = (folderPath ?? string.Empty).Replace('\\', '/').Trim('/');
            return p.Length == 0 ? string.Empty : p + "/";
        }

        private static string CombineName(string folderPath, string fileName)
        {
            var prefix = NormalizePrefix(folderPath);
            return prefix + (fileName ?? string.Empty).TrimStart('/');
        }
    }
}
