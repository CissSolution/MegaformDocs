using System;
using System.Collections.Generic;

namespace MegaForm.Core.Integrations.Storage
{
    public class StorageConnectionSettings
    {
        public string ProviderName { get; set; }
        public string AccessToken { get; set; }
        public string RefreshToken { get; set; }
        public string ClientId { get; set; }
        public string ClientSecret { get; set; }
        public string BaseFolder { get; set; }
        public string BaseUrl { get; set; }
        public Dictionary<string, string> Extra { get; set; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    }

    public class StorageItem
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Path { get; set; }
        public string MimeType { get; set; }
        public long? Size { get; set; }
        public DateTime? CreatedAt { get; set; }
        public DateTime? ModifiedAt { get; set; }
        public bool IsFolder { get; set; }
        public string WebViewLink { get; set; }
    }

    public class StorageResult
    {
        public bool Success { get; set; }
        public StorageItem Item { get; set; }
        public string Message { get; set; }
        public Exception Error { get; set; }

        public static StorageResult Ok(StorageItem item, string message = null)
        {
            return new StorageResult { Success = true, Item = item, Message = message };
        }

        public static StorageResult Fail(string message, Exception error = null)
        {
            return new StorageResult { Success = false, Message = message, Error = error };
        }
    }

    public class StorageHealthResult
    {
        public bool Healthy { get; set; }
        public string Message { get; set; }
        public Exception Error { get; set; }

        public static StorageHealthResult Ok(string message = null)
        {
            return new StorageHealthResult { Healthy = true, Message = message };
        }

        public static StorageHealthResult Fail(string message, Exception error = null)
        {
            return new StorageHealthResult { Healthy = false, Message = message, Error = error };
        }
    }

    public class StorageIntegrationMapping
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string ProviderName { get; set; }
        public string ConnectionSettingsId { get; set; }
        public string TargetFolder { get; set; }
        public List<string> UploadFieldKeys { get; set; } = new List<string>();
        public bool OrganizeBySubmission { get; set; } = true;
    }
}
