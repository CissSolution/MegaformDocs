using System;

namespace MegaForm.Core.Models
{
    public static class DocumentAssignmentTypes
    {
        public const string Review = "review";
        public const string Process = "process";
        public const string Publish = "publish";
        public const string Archive = "archive";
    }

    public static class DocumentAssignmentStatuses
    {
        public const string Pending = "pending";
        public const string InProgress = "in_progress";
        public const string Completed = "completed";
        public const string Cancelled = "cancelled";
        public const string Rejected = "rejected";
    }

    public static class DocumentCommentTypes
    {
        public const string Comment = "comment";
        public const string Note = "note";
        public const string System = "system";
        public const string Approval = "approval";
    }

    public static class DocumentDirectiveStatuses
    {
        public const string Open = "open";
        public const string Acknowledged = "acknowledged";
        public const string Completed = "completed";
        public const string Cancelled = "cancelled";
    }

    public class DocumentAssignmentInfo
    {
        public int AssignmentId { get; set; }
        public int DocumentId { get; set; }
        public int? RevisionId { get; set; }
        public int? SubmissionId { get; set; }
        public string AssignmentType { get; set; }
        public string Status { get; set; }
        public int SequenceOrder { get; set; }
        public int? AssignedToUserId { get; set; }
        public string AssignedToUserName { get; set; }
        public string AssignedRole { get; set; }
        public string AssignedDepartment { get; set; }
        public int? AssignedByUserId { get; set; }
        public string AssignedByUserName { get; set; }
        public DateTime AssignedOnUtc { get; set; }
        public DateTime? DueOnUtc { get; set; }
        public DateTime? CompletedOnUtc { get; set; }
        public string Comment { get; set; }

        public DocumentAssignmentInfo()
        {
            AssignmentType = DocumentAssignmentTypes.Review;
            Status = DocumentAssignmentStatuses.Pending;
            AssignedToUserName = string.Empty;
            AssignedRole = string.Empty;
            AssignedDepartment = string.Empty;
            AssignedByUserName = string.Empty;
            Comment = string.Empty;
            AssignedOnUtc = DateTime.UtcNow;
        }
    }

    public class DocumentCommentInfo
    {
        public int CommentId { get; set; }
        public int DocumentId { get; set; }
        public int? RevisionId { get; set; }
        public int? SubmissionId { get; set; }
        public int? ParentCommentId { get; set; }
        public string CommentType { get; set; }
        public string Body { get; set; }
        public int? CreatedByUserId { get; set; }
        public string CreatedByUserName { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public bool IsInternal { get; set; }

        public DocumentCommentInfo()
        {
            CommentType = DocumentCommentTypes.Comment;
            Body = string.Empty;
            CreatedByUserName = string.Empty;
            CreatedOnUtc = DateTime.UtcNow;
            IsInternal = true;
        }
    }

    public class DocumentDirectiveInfo
    {
        public int DirectiveId { get; set; }
        public int DocumentId { get; set; }
        public int? RevisionId { get; set; }
        public int? AssignmentId { get; set; }
        public string Status { get; set; }
        public string DirectiveText { get; set; }
        public int? TargetUserId { get; set; }
        public string TargetUserName { get; set; }
        public string TargetRole { get; set; }
        public int? IssuedByUserId { get; set; }
        public string IssuedByUserName { get; set; }
        public DateTime IssuedOnUtc { get; set; }
        public DateTime? DueOnUtc { get; set; }
        public DateTime? CompletedOnUtc { get; set; }
        public string CompletionNote { get; set; }

        public DocumentDirectiveInfo()
        {
            Status = DocumentDirectiveStatuses.Open;
            DirectiveText = string.Empty;
            TargetUserName = string.Empty;
            TargetRole = string.Empty;
            IssuedByUserName = string.Empty;
            CompletionNote = string.Empty;
            IssuedOnUtc = DateTime.UtcNow;
        }
    }
}
