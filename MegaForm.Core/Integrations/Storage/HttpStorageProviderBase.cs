using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace MegaForm.Core.Integrations.Storage
{
    public abstract class HttpStorageProviderBase : IStorageProvider
    {
        protected HttpClient HttpClient { get; }

        protected HttpStorageProviderBase(HttpClient httpClient)
        {
            HttpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        }

        public abstract string ProviderName { get; }

        public abstract Task<StorageHealthResult> HealthCheckAsync(StorageConnectionSettings settings, CancellationToken cancellationToken = default);
        public abstract Task<StorageItem> UploadAsync(StorageConnectionSettings settings, Stream stream, string fileName, string folderPath, CancellationToken cancellationToken = default);
        public abstract Task<Stream> DownloadAsync(StorageConnectionSettings settings, string itemId, CancellationToken cancellationToken = default);
        public abstract Task<IReadOnlyList<StorageItem>> ListAsync(StorageConnectionSettings settings, string folderPath, CancellationToken cancellationToken = default);
        public abstract Task DeleteAsync(StorageConnectionSettings settings, string itemId, CancellationToken cancellationToken = default);
        public abstract Task<string> CreateFolderAsync(StorageConnectionSettings settings, string folderName, string parentPath, CancellationToken cancellationToken = default);

        protected virtual string ResolveBaseUrl(StorageConnectionSettings settings)
        {
            if (!string.IsNullOrWhiteSpace(settings.BaseUrl))
                return settings.BaseUrl.TrimEnd('/');
            return GetDefaultBaseUrl(settings);
        }

        protected abstract string GetDefaultBaseUrl(StorageConnectionSettings settings);

        protected HttpRequestMessage CreateRequest(StorageConnectionSettings settings, HttpMethod method, string relativeUrl, object payload = null)
        {
            var baseUrl = ResolveBaseUrl(settings);
            var request = new HttpRequestMessage(method, baseUrl + relativeUrl);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", settings.AccessToken);

            if (payload != null)
            {
                request.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            }

            return request;
        }
    }
}
