using System;
using System.Collections.Generic;

namespace MegaForm.Core.Addons.OfflineForms
{
    public class OfflineSubmissionQueueItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public int FormId { get; set; }
        public string SessionId { get; set; }
        public Dictionary<string, object> Values { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public List<OfflineAttachment> Attachments { get; set; } = new List<OfflineAttachment>();
        public DateTime QueuedAt { get; set; } = DateTime.UtcNow;
        public int RetryCount { get; set; }
        public DateTime? LastRetryAt { get; set; }
        public string ErrorMessage { get; set; }
        public OfflineSubmissionStatus Status { get; set; } = OfflineSubmissionStatus.Pending;
    }

    public enum OfflineSubmissionStatus
    {
        Pending,
        Syncing,
        Synced,
        Failed,
        Conflict
    }

    public class OfflineAttachment
    {
        public string FileName { get; set; }
        public string ContentType { get; set; }
        public byte[] Data { get; set; }
        public long Size { get; set; }
    }

    public class OfflineSyncResult
    {
        public int Total { get; set; }
        public int Synced { get; set; }
        public int Failed { get; set; }
        public List<string> Errors { get; set; } = new List<string>();
    }

    public class OfflineFormManifest
    {
        public int FormId { get; set; }
        public string FormSchemaJson { get; set; }
        public string FormHtml { get; set; }
        public DateTime CachedAt { get; set; } = DateTime.UtcNow;
        public DateTime ExpiresAt { get; set; }
    }
}
