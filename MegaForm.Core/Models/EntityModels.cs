using System;

namespace MegaForm.Core.Models
{
    public class FormInfo
    {
        public int FormId { get; set; }
        public int ModuleId { get; set; }
        public int PortalId { get; set; }
        public string Title { get; set; }
        public string Description { get; set; }
        public string SchemaJson { get; set; }
        public string SettingsJson { get; set; }
        public string ThemeJson { get; set; }
        public string Status { get; set; }
        public string SubmitButtonText { get; set; }
        public string SuccessMessage { get; set; }
        public string RedirectUrl { get; set; }
        public int? MaxSubmissions { get; set; }
        public DateTime? ExpiresOnUtc { get; set; }
        public bool RequireAuth { get; set; }
        public bool EnableCaptcha { get; set; }
        public bool EnableSaveResume { get; set; }
        public string WebhookUrl { get; set; }
        public string WebhookSecret { get; set; }
        public string WebhookHeaders { get; set; }
        public string NotifyEmails { get; set; }
        public string NotifyTemplate { get; set; }
        public bool AutoresponderEnabled { get; set; }
        public string AutoresponderEmailField { get; set; }
        public string AutoresponderSubject { get; set; }
        public string AutoresponderBody { get; set; }
        public int CreatedByUserId { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public int? UpdatedByUserId { get; set; }
        public DateTime? UpdatedOnUtc { get; set; }

        /// <summary>
        /// App scope for multi-purpose isolation.
        /// NULL = standalone form. Values: "articles", "forum", "helpdesk", "crm", "qa"...
        /// All module instances with same AppScope on same portal share data.
        /// </summary>
        public string AppScope { get; set; }

        /// <summary>
        /// JSON array of RuleDefinition objects — evaluated client-side and server-side.
        /// Stored as TEXT. Null / empty = no rules.
        /// LEGACY: vẫn dùng khi WorkflowJson = null (backward compat).
        /// </summary>
        public string RulesJson { get; set; }

        /// <summary>
        /// Serialized WorkflowDefinition JSON — Workflow Engine v2.0.
        /// Cột MỚI, bổ sung song song với RulesJson (không thay thế).
        /// NULL = form dùng legacy RulesJson. Khi có giá trị → Engine dùng WorkflowDefinition.
        /// </summary>
        public string WorkflowJson { get; set; }

        // Computed
        public int SubmissionCount { get; set; }
    }

    public class SubmissionInfo
    {
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public string DataJson { get; set; }
        public string IpAddress { get; set; }
        public string UserAgent { get; set; }
        public int? UserId { get; set; }
        public string Status { get; set; }
        public bool IsSpam { get; set; }
        public decimal? SpamScore { get; set; }
        public DateTime SubmittedOnUtc { get; set; }
        public DateTime? ReadOnUtc { get; set; }
        public DateTime? ModifiedOnUtc { get; set; }
        public int? ModifiedByUserId { get; set; }
    }

    /// <summary>
    /// Per-module view configuration — determines what a module instance displays.
    /// </summary>
    public class ModuleViewConfigInfo
    {
        public int ConfigId { get; set; }
        public int ModuleId { get; set; }
        public int FormId { get; set; }
        public string ViewType { get; set; } = "submit";  // submit, list, card, detail, continuous
        public string ViewConfigJson { get; set; }
        public string CssClass { get; set; }
        public int CacheMinutes { get; set; }
        public string PermissionsJson { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public DateTime? ModifiedOnUtc { get; set; }
    }

    public class SubmissionValueInfo
    {
        public int ValueId { get; set; }
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public string FieldKey { get; set; }
        public string FieldValue { get; set; }
        public string ValueText { get; set; }
        public decimal? ValueNumber { get; set; }
        public DateTime? ValueDate { get; set; }
    }

    public class FileInfo
    {
        public int FileId { get; set; }
        public int SubmissionId { get; set; }
        public string FieldKey { get; set; }
        public string OriginalName { get; set; }
        public string StoredPath { get; set; }
        public string ContentType { get; set; }
        public long FileSizeBytes { get; set; }
        public DateTime UploadedOnUtc { get; set; }
    }

    public class WebhookLogInfo
    {
        public int LogId { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public string WebhookUrl { get; set; }
        public string RequestBody { get; set; }
        public int? ResponseCode { get; set; }
        public string ResponseBody { get; set; }
        public bool Success { get; set; }
        public int RetryCount { get; set; }
        public DateTime CreatedOnUtc { get; set; }
    }

    public class SavedDraftInfo
    {
        public int DraftId { get; set; }
        public int FormId { get; set; }
        public string ResumeToken { get; set; }
        public string DataJson { get; set; }
        public string Email { get; set; }
        public string IpAddress { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public DateTime ExpiresOnUtc { get; set; }
    }

    public class FormStatsInfo
    {
        public int TotalSubmissions { get; set; }
        public int ValidSubmissions { get; set; }
        public int SpamSubmissions { get; set; }
        public int ReadSubmissions { get; set; }
        public DateTime? FirstSubmission { get; set; }
        public DateTime? LastSubmission { get; set; }
    }

    /// <summary>
    /// Cross-form relation definition.
    /// e.g. Forum Thread → Replies, CRM Contact → Deals
    /// </summary>
    public class FormRelationInfo
    {
        public int RelationId { get; set; }
        public int ParentFormId { get; set; }
        public int ChildFormId { get; set; }
        public string RelationType { get; set; }  // has_many, belongs_to, lookup
        public string ForeignKey { get; set; }     // field key in child
        public string ParentKey { get; set; }      // what child FK points to (default: SubmissionId)
        public string Label { get; set; }          // display: "Replies", "Deals"
        public bool CascadeDelete { get; set; }
    }

    /// <summary>
    /// Actual link between two submissions (parent → child).
    /// </summary>
    public class SubmissionLinkInfo
    {
        public int LinkId { get; set; }
        public int RelationId { get; set; }
        public int ParentSubmissionId { get; set; }
        public int ChildSubmissionId { get; set; }
        public DateTime CreatedOnUtc { get; set; }
    }
}
