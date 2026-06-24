using System;

namespace MegaForm.Core.Models
{
    public static class DocumentStatuses
    {
        public const string Draft = "draft";
        public const string PendingApproval = "pending_approval";
        public const string Approved = "approved";
        public const string Published = "published";
        public const string Rejected = "rejected";
        public const string Archived = "archived";
    }

    public class DocumentInfo
    {
        public int DocumentId { get; set; }
        public int PortalId { get; set; }
        public string AppScope { get; set; }
        public string Slug { get; set; }
        public string Title { get; set; }
        public string Summary { get; set; }
        public string Status { get; set; }
        public int? PublishedRevisionId { get; set; }
        public int? LatestRevisionId { get; set; }
        public int CreatedByUserId { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public int? UpdatedByUserId { get; set; }
        public DateTime? UpdatedOnUtc { get; set; }
        public int? PublishedByUserId { get; set; }
        public DateTime? PublishedOnUtc { get; set; }

        public DocumentInfo()
        {
            AppScope = string.Empty;
            Slug = string.Empty;
            Title = string.Empty;
            Summary = string.Empty;
            Status = DocumentStatuses.Draft;
            CreatedOnUtc = DateTime.UtcNow;
        }
    }

    public class DocumentRevisionInfo
    {
        public int RevisionId { get; set; }
        public int DocumentId { get; set; }
        public int FormId { get; set; }
        public int? SubmissionId { get; set; }
        public int VersionNumber { get; set; }
        public string Status { get; set; }
        public string Title { get; set; }
        public string Summary { get; set; }
        public string Slug { get; set; }
        public string OriginalName { get; set; }
        public string StoredPath { get; set; }
        public string ContentType { get; set; }
        public long FileSizeBytes { get; set; }
        public string StoredIn { get; set; }
        public string Hash { get; set; }
        public bool IsPublished { get; set; }
        public int CreatedByUserId { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public int? PublishedByUserId { get; set; }
        public DateTime? PublishedOnUtc { get; set; }

        public DocumentRevisionInfo()
        {
            Status = DocumentStatuses.Draft;
            Title = string.Empty;
            Summary = string.Empty;
            Slug = string.Empty;
            OriginalName = string.Empty;
            StoredPath = string.Empty;
            ContentType = string.Empty;
            StoredIn = "private";
            Hash = string.Empty;
            VersionNumber = 1;
            CreatedOnUtc = DateTime.UtcNow;
        }
    }

    public class DocumentAliasInfo
    {
        public int AliasId { get; set; }
        public int DocumentId { get; set; }
        public int PortalId { get; set; }
        public string Slug { get; set; }
        public bool IsPrimary { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedOnUtc { get; set; }

        public DocumentAliasInfo()
        {
            Slug = string.Empty;
            IsActive = true;
            CreatedOnUtc = DateTime.UtcNow;
        }
    }
}
