using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Amazon;
using Amazon.S3;
using Amazon.S3.Model;
using MegaForm.Core.Integrations.Storage;

namespace MegaForm.Integrations.CloudStorage
{
    /// <summary>
    /// [CloudStorage v20260723-01] Amazon S3 storage provider (also S3-compatible services via
    /// BaseUrl: MinIO, Cloudflare R2, ...). Stateless: the S3 client is built per operation from
    /// <see cref="StorageConnectionSettings"/> so the provider can be a DI singleton or manually
    /// constructed (DNN).
    ///
    /// Settings mapping: ClientId = access key id, ClientSecret = secret access key,
    /// BaseFolder = bucket name, Extra["Region"] = region system name (default "us-east-1"),
    /// BaseUrl = optional custom service URL (forces path-style, needed by most S3 clones).
    /// StorageItem.Id is the full object key; folder paths are "/" -separated key prefixes.
    /// </summary>
    public class AmazonS3StorageProvider : IStorageProvider
    {
        public string ProviderName => "AmazonS3";

        public async Task<StorageHealthResult> HealthCheckAsync(StorageConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                using (var client = CreateClient(settings))
                {
                    await client.ListObjectsV2Async(new ListObjectsV2Request
                    {
                        BucketName = Bucket(settings),
                        MaxKeys = 1
                    }, cancellationToken).ConfigureAwait(false);
                }
                return StorageHealthResult.Ok("Connected to Amazon S3 bucket '" + Bucket(settings) + "'.");
            }
            catch (Exception ex)
            {
                return StorageHealthResult.Fail("Amazon S3 health check error: " + ex.Message, ex);
            }
        }

        public async Task<StorageItem> UploadAsync(StorageConnectionSettings settings, Stream stream, string fileName, string folderPath, CancellationToken cancellationToken = default)
        {
            var key = CombineKey(folderPath, fileName);
            using (var client = CreateClient(settings))
            {
                var response = await client.PutObjectAsync(new PutObjectRequest
                {
                    BucketName = Bucket(settings),
                    Key = key,
                    InputStream = stream
                }, cancellationToken).ConfigureAwait(false);

                if ((int)response.HttpStatusCode >= 300)
                    throw new Exception("Amazon S3 upload failed: " + (int)response.HttpStatusCode);
            }

            return new StorageItem
            {
                Id = key,
                Name = fileName,
                Path = folderPath,
                Size = stream.CanSeek ? stream.Length : (long?)null
            };
        }

        public async Task<Stream> DownloadAsync(StorageConnectionSettings settings, string itemId, CancellationToken cancellationToken = default)
        {
            // The caller owns the returned stream; the client must stay alive while it is read,
            // so buffer to memory (submission files are already size-capped by the upload endpoints).
            using (var client = CreateClient(settings))
            using (var response = await client.GetObjectAsync(Bucket(settings), itemId, cancellationToken).ConfigureAwait(false))
            {
                var buffer = new MemoryStream();
                await response.ResponseStream.CopyToAsync(buffer).ConfigureAwait(false);
                buffer.Position = 0;
                return buffer;
            }
        }

        public async Task<IReadOnlyList<StorageItem>> ListAsync(StorageConnectionSettings settings, string folderPath, CancellationToken cancellationToken = default)
        {
            var prefix = NormalizePrefix(folderPath);
            var items = new List<StorageItem>();

            using (var client = CreateClient(settings))
            {
                var response = await client.ListObjectsV2Async(new ListObjectsV2Request
                {
                    BucketName = Bucket(settings),
                    Prefix = prefix,
                    Delimiter = "/"
                }, cancellationToken).ConfigureAwait(false);

                foreach (var commonPrefix in response.CommonPrefixes ?? Enumerable.Empty<string>())
                {
                    items.Add(new StorageItem
                    {
                        Id = commonPrefix,
                        Name = commonPrefix.TrimEnd('/').Split('/').Last(),
                        Path = folderPath,
                        IsFolder = true
                    });
                }
                foreach (var obj in response.S3Objects ?? new List<S3Object>())
                {
                    if (string.Equals(obj.Key, prefix, StringComparison.Ordinal))
                        continue; // the folder marker itself
                    items.Add(new StorageItem
                    {
                        Id = obj.Key,
                        Name = obj.Key.Split('/').Last(),
                        Path = folderPath,
                        Size = obj.Size,
                        ModifiedAt = obj.LastModified,
                        IsFolder = false
                    });
                }
            }
            return items;
        }

        public async Task DeleteAsync(StorageConnectionSettings settings, string itemId, CancellationToken cancellationToken = default)
        {
            using (var client = CreateClient(settings))
            {
                await client.DeleteObjectAsync(Bucket(settings), itemId, cancellationToken).ConfigureAwait(false);
            }
        }

        public async Task<string> CreateFolderAsync(StorageConnectionSettings settings, string folderName, string parentPath, CancellationToken cancellationToken = default)
        {
            // S3 has no real folders — a zero-length object with a trailing slash is the convention.
            var key = CombineKey(parentPath, (folderName ?? string.Empty).Trim('/')) + "/";
            using (var client = CreateClient(settings))
            {
                await client.PutObjectAsync(new PutObjectRequest
                {
                    BucketName = Bucket(settings),
                    Key = key,
                    InputStream = new MemoryStream(new byte[0])
                }, cancellationToken).ConfigureAwait(false);
            }
            return key;
        }

        private static IAmazonS3 CreateClient(StorageConnectionSettings settings)
        {
            if (settings == null) throw new ArgumentNullException(nameof(settings));
            var region = settings.Extra != null && settings.Extra.TryGetValue("Region", out var r) && !string.IsNullOrWhiteSpace(r)
                ? r.Trim()
                : "us-east-1";

            var config = new AmazonS3Config();
            if (!string.IsNullOrWhiteSpace(settings.BaseUrl))
            {
                // S3-compatible endpoint (MinIO, R2, ...) — path-style is the portable choice there.
                config.ServiceURL = settings.BaseUrl.Trim();
                config.ForcePathStyle = true;
            }
            else
            {
                config.RegionEndpoint = RegionEndpoint.GetBySystemName(region);
            }

            return new AmazonS3Client(settings.ClientId, settings.ClientSecret, config);
        }

        private static string Bucket(StorageConnectionSettings settings)
        {
            var bucket = (settings?.BaseFolder ?? string.Empty).Trim().Trim('/');
            if (bucket.Length == 0)
                throw new InvalidOperationException("Amazon S3 connection is missing a bucket name (BaseFolder).");
            return bucket;
        }

        private static string NormalizePrefix(string folderPath)
        {
            var p = (folderPath ?? string.Empty).Replace('\\', '/').Trim('/');
            return p.Length == 0 ? string.Empty : p + "/";
        }

        private static string CombineKey(string folderPath, string fileName)
        {
            var prefix = NormalizePrefix(folderPath);
            return prefix + (fileName ?? string.Empty).TrimStart('/');
        }
    }
}
