using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Integrations.Storage.Providers
{
    public class GoogleDriveProvider : HttpStorageProviderBase
    {
        public GoogleDriveProvider(HttpClient httpClient) : base(httpClient) { }

        public override string ProviderName => "GoogleDrive";

        protected override string GetDefaultBaseUrl(StorageConnectionSettings settings)
        {
            return "https://www.googleapis.com/drive/v3";
        }

        public override async Task<StorageHealthResult> HealthCheckAsync(StorageConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var request = CreateRequest(settings, HttpMethod.Get, "/about?fields=user");
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                if (response.IsSuccessStatusCode)
                    return StorageHealthResult.Ok("Connected to Google Drive.");

                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return StorageHealthResult.Fail($"Google Drive health check failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return StorageHealthResult.Fail("Google Drive health check error.", ex);
            }
        }

        public override async Task<StorageItem> UploadAsync(StorageConnectionSettings settings, Stream stream, string fileName, string folderPath, CancellationToken cancellationToken = default)
        {
            string folderId = null;
            if (!string.IsNullOrWhiteSpace(folderPath) && folderPath != "/")
            {
                folderId = await EnsureFolderPathAsync(settings, folderPath, cancellationToken).ConfigureAwait(false);
            }

            var metadata = new
            {
                name = fileName,
                parents = folderId != null ? new[] { folderId } : null
            };

            var content = new MultipartFormDataContent();
            var metadataContent = new StringContent(JsonConvert.SerializeObject(metadata), Encoding.UTF8, "application/json");
            content.Add(metadataContent, "metadata");

            var streamContent = new StreamContent(stream);
            streamContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");
            content.Add(streamContent, "media", fileName);

            var request = new HttpRequestMessage(HttpMethod.Post, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
            {
                Content = content
            };
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", settings.AccessToken);

            var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
                throw new Exception($"Google Drive upload failed: {(int)response.StatusCode} {body}");

            var json = JObject.Parse(body);
            return new StorageItem
            {
                Id = json["id"]?.ToString(),
                Name = fileName,
                Path = folderPath,
                WebViewLink = $"https://drive.google.com/file/d/{json["id"]}/view"
            };
        }

        public override async Task<Stream> DownloadAsync(StorageConnectionSettings settings, string itemId, CancellationToken cancellationToken = default)
        {
            var request = CreateRequest(settings, HttpMethod.Get, $"/files/{itemId}?alt=media");
            var response = await HttpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
                throw new Exception($"Google Drive download failed: {(int)response.StatusCode}");

            return await response.Content.ReadAsStreamAsync().ConfigureAwait(false);
        }

        public override async Task<IReadOnlyList<StorageItem>> ListAsync(StorageConnectionSettings settings, string folderPath, CancellationToken cancellationToken = default)
        {
            string folderId = "root";
            if (!string.IsNullOrWhiteSpace(folderPath) && folderPath != "/")
            {
                folderId = await ResolveFolderIdAsync(settings, folderPath, cancellationToken).ConfigureAwait(false) ?? "root";
            }

            var request = CreateRequest(settings, HttpMethod.Get, $"/files?q='{folderId}'+in+parents&fields=files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink)");
            var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
                return new List<StorageItem>();

            var json = JObject.Parse(body);
            var items = new List<StorageItem>();
            foreach (var file in json["files"] ?? new JArray())
            {
                items.Add(new StorageItem
                {
                    Id = file["id"]?.ToString(),
                    Name = file["name"]?.ToString(),
                    Path = folderPath,
                    MimeType = file["mimeType"]?.ToString(),
                    IsFolder = file["mimeType"]?.ToString() == "application/vnd.google-apps.folder",
                    Size = file["size"] != null ? (long?)file["size"] : null,
                    CreatedAt = file["createdTime"] != null ? (DateTime?)file["createdTime"] : null,
                    ModifiedAt = file["modifiedTime"] != null ? (DateTime?)file["modifiedTime"] : null,
                    WebViewLink = file["webViewLink"]?.ToString()
                });
            }
            return items;
        }

        public override async Task DeleteAsync(StorageConnectionSettings settings, string itemId, CancellationToken cancellationToken = default)
        {
            var request = CreateRequest(settings, HttpMethod.Delete, $"/files/{itemId}");
            var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
                throw new Exception($"Google Drive delete failed: {(int)response.StatusCode}");
        }

        public override async Task<string> CreateFolderAsync(StorageConnectionSettings settings, string folderName, string parentPath, CancellationToken cancellationToken = default)
        {
            var metadata = new
            {
                name = folderName,
                mimeType = "application/vnd.google-apps.folder",
                parents = string.IsNullOrWhiteSpace(parentPath) ? null : new[] { await ResolveFolderIdAsync(settings, parentPath, cancellationToken).ConfigureAwait(false) }
            };

            var request = CreateRequest(settings, HttpMethod.Post, "/files", metadata);
            var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
                throw new Exception($"Google Drive folder creation failed: {(int)response.StatusCode} {body}");

            var json = JObject.Parse(body);
            return json["id"]?.ToString();
        }

        private async Task<string> EnsureFolderPathAsync(StorageConnectionSettings settings, string folderPath, CancellationToken cancellationToken)
        {
            var parts = folderPath.Split(new[] { '/', '\\' }, StringSplitOptions.RemoveEmptyEntries);
            string currentId = null;
            string currentPath = null;

            foreach (var part in parts)
            {
                currentPath = currentPath == null ? part : currentPath + "/" + part;
                var existingId = await ResolveFolderIdAsync(settings, currentPath, cancellationToken).ConfigureAwait(false);
                if (existingId != null)
                {
                    currentId = existingId;
                    continue;
                }

                currentId = await CreateFolderAsync(settings, part, currentId, cancellationToken).ConfigureAwait(false);
            }

            return currentId;
        }

        private async Task<string> ResolveFolderIdAsync(StorageConnectionSettings settings, string folderPath, CancellationToken cancellationToken)
        {
            var parts = folderPath.Split(new[] { '/', '\\' }, StringSplitOptions.RemoveEmptyEntries);
            string parentId = "root";

            foreach (var part in parts)
            {
                var query = $"name='{part}' and '{parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false";
                var request = CreateRequest(settings, HttpMethod.Get, "/files?q=" + Uri.EscapeDataString(query));
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                    return null;

                var json = JObject.Parse(body);
                var folder = json["files"]?.FirstOrDefault();
                if (folder == null)
                    return null;

                parentId = folder["id"]?.ToString();
            }

            return parentId;
        }
    }
}
