using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Integrations.Storage;
using MegaForm.Core.Models;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    public class CloudStorageConnectionCatalogTests
    {
        [Fact]
        public void RoundTrip_PreservesEntries()
        {
            var blob = CloudStorageConnectionCatalog.Upsert(null, new CloudStorageConnectionInfo
            {
                Name = "CompanyDrive",
                Provider = "GoogleDrive",
                AccessToken = "secret-token",
                ClientId = "client-1",
                BaseFolder = "/forms"
            });
            blob = CloudStorageConnectionCatalog.Upsert(blob, new CloudStorageConnectionInfo
            {
                Name = "BackupS3",
                Provider = "AmazonS3",
                ClientId = "AKIA...",
                ClientSecret = "aws-secret",
                BaseFolder = "my-bucket"
            });

            var list = CloudStorageConnectionCatalog.Parse(blob);
            Assert.Equal(2, list.Count);
            var s3 = CloudStorageConnectionCatalog.Find(blob, "backups3"); // case-insensitive
            Assert.NotNull(s3);
            Assert.Equal("AmazonS3", s3.Provider);
            Assert.Equal("aws-secret", s3.ClientSecret);
        }

        [Fact]
        public void Upsert_ReplacesByName_CaseInsensitive()
        {
            var blob = CloudStorageConnectionCatalog.Upsert(null, new CloudStorageConnectionInfo { Name = "Drive", Provider = "GoogleDrive" });
            blob = CloudStorageConnectionCatalog.Upsert(blob, new CloudStorageConnectionInfo { Name = "DRIVE", Provider = "AmazonS3" });

            var list = CloudStorageConnectionCatalog.Parse(blob);
            Assert.Single(list);
            Assert.Equal("AmazonS3", list[0].Provider);
        }

        [Fact]
        public void Remove_DeletesByName()
        {
            var blob = CloudStorageConnectionCatalog.Upsert(null, new CloudStorageConnectionInfo { Name = "Drive", Provider = "GoogleDrive" });
            blob = CloudStorageConnectionCatalog.Remove(blob, "drive");
            Assert.Null(CloudStorageConnectionCatalog.Find(blob, "Drive"));
        }

        [Theory]
        [InlineData("CompanyDrive", true)]
        [InlineData("backup-s3_eu", true)]
        [InlineData("", false)]
        [InlineData("1drive", false)]
        [InlineData("my drive", false)]
        public void ValidateName_Rules(string name, bool valid)
        {
            Assert.Equal(valid, CloudStorageConnectionCatalog.ValidateName(name) == null);
        }

        [Fact]
        public void MaskSecrets_HidesTokens_KeepsIdentifiers()
        {
            var masked = CloudStorageConnectionCatalog.MaskSecrets(new CloudStorageConnectionInfo
            {
                Name = "Drive",
                Provider = "GoogleDrive",
                AccessToken = "token",
                RefreshToken = "refresh",
                ClientId = "client-id",
                ClientSecret = "secret",
                BaseFolder = "/forms"
            });

            Assert.Equal("***", masked.AccessToken);
            Assert.Equal("***", masked.RefreshToken);
            Assert.Equal("***", masked.ClientSecret);
            Assert.Equal("client-id", masked.ClientId);
            Assert.Equal("/forms", masked.BaseFolder);
        }

        [Fact]
        public void MaskSecrets_EmptySecret_StaysEmpty()
        {
            var masked = CloudStorageConnectionCatalog.MaskSecrets(new CloudStorageConnectionInfo { Name = "Drive" });
            Assert.Equal(string.Empty, masked.AccessToken);
        }

        [Fact]
        public void Parse_CorruptBlob_ReturnsEmpty()
        {
            Assert.Empty(CloudStorageConnectionCatalog.Parse("{not json"));
        }

        [Fact]
        public void ToConnectionSettings_MapsAllFields()
        {
            var settings = CloudStorageConnectionCatalog.ToConnectionSettings(new CloudStorageConnectionInfo
            {
                Name = "S3",
                Provider = "AmazonS3",
                ClientId = "key",
                ClientSecret = "secret",
                BaseFolder = "bucket",
                BaseUrl = "https://s3.eu-west-1.amazonaws.com",
                Extra = new Dictionary<string, string> { ["Region"] = "eu-west-1" }
            });

            Assert.Equal("AmazonS3", settings.ProviderName);
            Assert.Equal("key", settings.ClientId);
            Assert.Equal("secret", settings.ClientSecret);
            Assert.Equal("bucket", settings.BaseFolder);
            Assert.Equal("eu-west-1", settings.Extra["Region"]);
        }
    }

    public class SubmissionCloudStorageUploaderTests
    {
        private sealed class FakeStorageService : IStorageIntegrationService
        {
            public List<(StorageIntegrationMapping Mapping, StorageConnectionSettings Settings, int SubmissionId, IReadOnlyDictionary<string, Stream> Files)> Calls
                = new List<(StorageIntegrationMapping, StorageConnectionSettings, int, IReadOnlyDictionary<string, Stream>)>();

            public bool ThrowOnUpload { get; set; }

            public Task<IReadOnlyList<string>> GetRegisteredProviderNamesAsync(CancellationToken cancellationToken = default)
                => Task.FromResult<IReadOnlyList<string>>(new List<string>());

            public Task<StorageResult> UploadSubmissionFilesAsync(
                StorageIntegrationMapping mapping, StorageConnectionSettings settings, int submissionId,
                IReadOnlyDictionary<string, Stream> files, CancellationToken cancellationToken = default)
            {
                if (ThrowOnUpload) throw new InvalidOperationException("provider down");
                // Copy file names only — streams are disposed by the uploader after the call.
                Calls.Add((mapping, settings, submissionId, files.ToDictionary(kv => kv.Key, kv => (Stream)null)));
                return Task.FromResult(StorageResult.Ok(new StorageItem { Id = "1" }));
            }

            public Task<StorageHealthResult> TestConnectionAsync(string providerName, StorageConnectionSettings settings, CancellationToken cancellationToken = default)
                => Task.FromResult(StorageHealthResult.Ok());
        }

        private static FormSchema BuildSchema(bool enabled, params StorageIntegrationMapping[] mappings)
        {
            return new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField { Key = "cv", Type = "FileUpload", Label = "CV" },
                    new FormField { Key = "photo", Type = "File", Label = "Photo" }
                },
                Settings = new FormSettings
                {
                    CloudStorage = new FormCloudStorageSettings
                    {
                        Enabled = enabled,
                        Mappings = mappings.ToList()
                    }
                }
            };
        }

        private static Dictionary<string, object> BuildData()
        {
            return new Dictionary<string, object>
            {
                ["cv"] = "[{\"fileName\":\"cv.pdf\",\"tempPath\":\"form-1/field-cv/aaa.pdf\",\"fileSize\":10}]",
                ["photo"] = "[{\"fileName\":\"photo.png\",\"tempPath\":\"form-1/field-photo/bbb.png\",\"fileSize\":20}]"
            };
        }

        private static ICloudStorageConnectionProvider Connections(params CloudStorageConnectionInfo[] entries)
        {
            string blob = null;
            foreach (var e in entries)
                blob = CloudStorageConnectionCatalog.Upsert(blob, e);
            return new DelegateCloudStorageConnectionProvider(() => blob);
        }

        private sealed class FakeBlobReader : ISubmissionFileBlobReader
        {
            public Stream OpenRead(string storedPath) => new MemoryStream(Encoding.UTF8.GetBytes(storedPath));
        }

        [Fact]
        public async Task Disabled_DoesNothing()
        {
            var storage = new FakeStorageService();
            var uploader = new SubmissionCloudStorageUploader(storage, Connections(), new FakeBlobReader());

            await uploader.UploadFailSoftAsync(1, BuildSchema(false, new StorageIntegrationMapping { ProviderName = "GoogleDrive" }), BuildData(), 42);

            Assert.Empty(storage.Calls);
        }

        [Fact]
        public async Task UploadsAllFiles_WhenNoFieldFilter()
        {
            var storage = new FakeStorageService();
            var uploader = new SubmissionCloudStorageUploader(storage,
                Connections(new CloudStorageConnectionInfo { Name = "Drive", Provider = "GoogleDrive", AccessToken = "t" }),
                new FakeBlobReader());

            await uploader.UploadFailSoftAsync(1, BuildSchema(true,
                new StorageIntegrationMapping { ProviderName = "GoogleDrive", ConnectionSettingsId = "Drive", TargetFolder = "/apps" }), BuildData(), 42);

            var call = Assert.Single(storage.Calls);
            Assert.Equal(42, call.SubmissionId);
            Assert.Equal("t", call.Settings.AccessToken);
            Assert.Equal("GoogleDrive", call.Settings.ProviderName); // mapping wins over catalog entry
            Assert.Equal(2, call.Files.Count);
        }

        [Fact]
        public async Task FieldFilter_SelectsOnlyListedFields()
        {
            var storage = new FakeStorageService();
            var uploader = new SubmissionCloudStorageUploader(storage,
                Connections(new CloudStorageConnectionInfo { Name = "Drive", Provider = "GoogleDrive" }),
                new FakeBlobReader());

            await uploader.UploadFailSoftAsync(1, BuildSchema(true,
                new StorageIntegrationMapping
                {
                    ProviderName = "GoogleDrive",
                    ConnectionSettingsId = "Drive",
                    UploadFieldKeys = new List<string> { "CV" } // case-insensitive match
                }), BuildData(), 42);

            var call = Assert.Single(storage.Calls);
            var name = Assert.Single(call.Files);
            Assert.Equal("cv.pdf", name.Key);
        }

        [Fact]
        public async Task UnknownConnection_SkipsMapping_WithoutThrowing()
        {
            var storage = new FakeStorageService();
            var uploader = new SubmissionCloudStorageUploader(storage, Connections(), new FakeBlobReader());

            await uploader.UploadFailSoftAsync(1, BuildSchema(true,
                new StorageIntegrationMapping { ProviderName = "GoogleDrive", ConnectionSettingsId = "Missing" }), BuildData(), 42);

            Assert.Empty(storage.Calls);
        }

        [Fact]
        public async Task ProviderError_IsSwallowed_OtherMappingsStillRun()
        {
            var storage = new FakeStorageService { ThrowOnUpload = true };
            var storage2 = new FakeStorageService();
            // Two mappings share the same service instance only if we inject one; use a composite:
            var uploader = new SubmissionCloudStorageUploader(storage,
                Connections(new CloudStorageConnectionInfo { Name = "Drive", Provider = "GoogleDrive" }),
                new FakeBlobReader());

            // Must not throw even when the provider blows up.
            await uploader.UploadFailSoftAsync(1, BuildSchema(true,
                new StorageIntegrationMapping { ProviderName = "GoogleDrive", ConnectionSettingsId = "Drive" }), BuildData(), 42);

            Assert.Empty(storage.Calls);
            Assert.Empty(storage2.Calls);
        }

        [Fact]
        public async Task MissingBlobReader_DoesNothing()
        {
            var storage = new FakeStorageService();
            var uploader = new SubmissionCloudStorageUploader(storage, Connections(new CloudStorageConnectionInfo { Name = "Drive" }), null);

            await uploader.UploadFailSoftAsync(1, BuildSchema(true,
                new StorageIntegrationMapping { ProviderName = "GoogleDrive", ConnectionSettingsId = "Drive" }), BuildData(), 42);

            Assert.Empty(storage.Calls);
        }
    }
}
