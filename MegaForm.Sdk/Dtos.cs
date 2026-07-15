using System;
using System.Collections.Generic;

namespace MegaForm.Sdk
{
    /// <summary>
    /// Explicit tenant/user context for an SDK call. Pass this when the caller runs
    /// OUTSIDE a MegaForm request (background job, scheduler, another module) where the
    /// ambient <c>IPlatformContext</c> is not available or not the right tenant. When
    /// omitted, the ambient platform context is used.
    /// </summary>
    public sealed class MegaFormScope
    {
        /// <summary>Portal / site id the operation runs against.</summary>
        public int PortalId { get; set; }

        /// <summary>Acting user id (0 = anonymous/system).</summary>
        public int UserId { get; set; }

        /// <summary>Acting username, used by workflow inbox matching when available.</summary>
        public string? UserName { get; set; }

        /// <summary>Display name for audit/inbox operations when available.</summary>
        public string? DisplayName { get; set; }

        /// <summary>Acting user's email address when available.</summary>
        public string? UserEmail { get; set; }

        /// <summary>Whether the actor is authenticated. Defaults from <see cref="UserId"/> when unset.</summary>
        public bool? IsAuthenticated { get; set; }

        /// <summary>Whether the actor should be treated as a site administrator.</summary>
        public bool? IsAdmin { get; set; }

        /// <summary>Whether the actor should be treated as a host/super user.</summary>
        public bool? IsSuperUser { get; set; }

        /// <summary>Role names used by workflow role-queue matching.</summary>
        public List<string> Roles { get; set; } = new List<string>();

        /// <summary>Optional client IP for audit-oriented operations.</summary>
        public string? IpAddress { get; set; }
    }

    /// <summary>A form, as exposed to SDK consumers. Decoupled from internal storage models.</summary>
    public sealed class FormDto
    {
        /// <summary>Unique form id.</summary>
        public int FormId { get; set; }

        /// <summary>Portal / site id that owns this form.</summary>
        public int PortalId { get; set; }

        /// <summary>Form title.</summary>
        public string? Title { get; set; }

        /// <summary>Form description.</summary>
        public string? Description { get; set; }

        /// <summary>Form status, e.g. "draft" or "published".</summary>
        public string? Status { get; set; }

        /// <summary>Form schema as a JSON string (field definitions, layout).</summary>
        public string? SchemaJson { get; set; }

        /// <summary>Whether the form requires an authenticated user to submit.</summary>
        public bool RequireAuth { get; set; }

        /// <summary>Total number of submissions for this form.</summary>
        public int SubmissionCount { get; set; }
    }

    /// <summary>Request to create a new form.</summary>
    public sealed class CreateFormRequest
    {
        /// <summary>Form title.</summary>
        public string Title { get; set; } = string.Empty;

        /// <summary>Form description.</summary>
        public string? Description { get; set; }

        /// <summary>Optional schema JSON. Defaults to an empty form when null.</summary>
        public string? SchemaJson { get; set; }

        /// <summary>"published" or "draft" (default).</summary>
        public string? Status { get; set; }

        /// <summary>Whether the form requires an authenticated user.</summary>
        public bool RequireAuth { get; set; }
    }

    /// <summary>Filter/paging options for listing forms.</summary>
    public sealed class FormQuery
    {
        /// <summary>Optional status filter ("published"/"draft"). Null = all.</summary>
        public string? Status { get; set; }

        /// <summary>Optional title/description search term.</summary>
        public string? Search { get; set; }

        /// <summary>Page number (1-based).</summary>
        public int Page { get; set; } = 1;

        /// <summary>Number of items per page.</summary>
        public int PageSize { get; set; } = 20;
    }

    /// <summary>A submission, as exposed to SDK consumers.</summary>
    public sealed class SubmissionDto
    {
        /// <summary>Unique submission id.</summary>
        public int SubmissionId { get; set; }

        /// <summary>Id of the form this submission belongs to.</summary>
        public int FormId { get; set; }

        /// <summary>Submitted field values as a JSON string.</summary>
        public string? DataJson { get; set; }

        /// <summary>Submission status, e.g. "new", "approved", "rejected".</summary>
        public string? Status { get; set; }

        /// <summary>Whether the submission was flagged as spam.</summary>
        public bool IsSpam { get; set; }

        /// <summary>Id of the user who submitted the record, if known.</summary>
        public int? UserId { get; set; }

        /// <summary>UTC timestamp when the submission was created.</summary>
        public DateTime SubmittedOnUtc { get; set; }
    }

    /// <summary>Filter/paging options for querying submissions (FindData).</summary>
    public sealed class SubmissionQuery
    {
        /// <summary>Id of the form to query.</summary>
        public int FormId { get; set; }

        /// <summary>Optional status filter. Null = all.</summary>
        public string? Status { get; set; }

        /// <summary>Page number (1-based).</summary>
        public int Page { get; set; } = 1;

        /// <summary>Number of items per page.</summary>
        public int PageSize { get; set; } = 50;
    }

    /// <summary>An uploaded file attached to a submission (metadata only; no storage path leaks).</summary>
    public sealed class FileDto
    {
        /// <summary>Unique file id.</summary>
        public int FileId { get; set; }

        /// <summary>Id of the submission this file belongs to.</summary>
        public int SubmissionId { get; set; }

        /// <summary>The form field this file was uploaded against.</summary>
        public string? FieldKey { get; set; }

        /// <summary>Original (user-facing) file name.</summary>
        public string? FileName { get; set; }

        /// <summary>MIME content type of the file.</summary>
        public string? ContentType { get; set; }

        /// <summary>File size in bytes.</summary>
        public long SizeBytes { get; set; }

        /// <summary>UTC timestamp when the file was uploaded.</summary>
        public DateTime UploadedOnUtc { get; set; }
    }

    /// <summary>The bytes + metadata of a file, ready to stream to a download response.</summary>
    public sealed class MegaFormFileContent
    {
        /// <summary>Original file name to present to the downloader.</summary>
        public string FileName { get; set; } = "download";

        /// <summary>MIME content type of the file.</summary>
        public string ContentType { get; set; } = "application/octet-stream";

        /// <summary>Raw file bytes.</summary>
        public byte[] Content { get; set; } = Array.Empty<byte>();
    }

    /// <summary>
    /// Result of submitting form data through <c>ISubmissionApi.SubmitAsync</c>. Mirrors the
    /// server submission pipeline's outcome. On a validation failure <see cref="Success"/> is
    /// false and <see cref="ValidationErrors"/> carries the per-field messages (no row is saved).
    /// </summary>
    public sealed class SubmitResult
    {
        /// <summary>True when the submission was accepted and persisted.</summary>
        public bool Success { get; set; }

        /// <summary>Id of the newly created submission (0 when the submit failed).</summary>
        public int SubmissionId { get; set; }

        /// <summary>Human-readable error message when <see cref="Success"/> is false, otherwise null.</summary>
        public string? ErrorMessage { get; set; }

        /// <summary>Optional success message configured on the form (post-submit experience).</summary>
        public string? SuccessMessage { get; set; }

        /// <summary>Optional redirect URL configured on the form for after a successful submit.</summary>
        public string? RedirectUrl { get; set; }

        /// <summary>True when the submission was flagged as spam by the anti-spam check.</summary>
        public bool IsSpam { get; set; }

        /// <summary>Spam score assigned by the anti-spam check (higher = more spammy).</summary>
        public double SpamScore { get; set; }

        /// <summary>Per-field validation errors (field key → message) when validation failed; null on success.</summary>
        public Dictionary<string, string>? ValidationErrors { get; set; }
    }

    /// <summary>
    /// A partial update to an existing form: only the non-null members are applied, so callers
    /// can change a single property (e.g. just the title) without re-sending the whole form.
    /// </summary>
    public sealed class UpdateFormRequest
    {
        /// <summary>New title, or null to leave unchanged.</summary>
        public string? Title { get; set; }

        /// <summary>New description, or null to leave unchanged.</summary>
        public string? Description { get; set; }

        /// <summary>New schema JSON, or null to leave unchanged.</summary>
        public string? SchemaJson { get; set; }

        /// <summary>New status ("published"/"draft"…), or null to leave unchanged.</summary>
        public string? Status { get; set; }

        /// <summary>New require-auth flag, or null to leave unchanged (nullable distinguishes "no change" from "set false").</summary>
        public bool? RequireAuth { get; set; }
    }

    /// <summary>A page of results plus the total count for the query.</summary>
    /// <typeparam name="T">Item type.</typeparam>
    public sealed class PagedResult<T>
    {
        /// <summary>Items on the current page.</summary>
        public IReadOnlyList<T> Items { get; set; } = Array.Empty<T>();

        /// <summary>Total number of items matching the query across all pages.</summary>
        public int TotalCount { get; set; }

        /// <summary>Current page number (1-based).</summary>
        public int Page { get; set; }

        /// <summary>Number of items per page.</summary>
        public int PageSize { get; set; }
    }

    /// <summary>Filter options for an in-host dashboard overview.</summary>
    public sealed class DashboardQuery
    {
        /// <summary>Optional form status filter.</summary>
        public string? Status { get; set; }

        /// <summary>Optional form title/description search term.</summary>
        public string? Search { get; set; }

        /// <summary>Recent-submission window in days.</summary>
        public int Days { get; set; } = 30;

        /// <summary>Maximum number of forms to include.</summary>
        public int MaxForms { get; set; } = 250;
    }

    /// <summary>Dashboard-level totals and per-form summaries.</summary>
    public sealed class DashboardOverviewDto
    {
        public int PortalId { get; set; }
        public int Days { get; set; }
        public DateTime GeneratedAtUtc { get; set; }
        public int TotalForms { get; set; }
        public int TotalSubmissions { get; set; }
        public int RecentSubmissions { get; set; }
        public IReadOnlyList<DashboardFormSummaryDto> Forms { get; set; } = Array.Empty<DashboardFormSummaryDto>();
    }

    /// <summary>One form row for dashboard overview UIs.</summary>
    public sealed class DashboardFormSummaryDto
    {
        public int FormId { get; set; }
        public string? Title { get; set; }
        public string? Status { get; set; }
        public DateTime? CreatedOnUtc { get; set; }
        public int SubmissionCount { get; set; }
        public int RecentSubmissionCount { get; set; }
    }

    /// <summary>Richer query contract for submission dashboard screens.</summary>
    public sealed class SubmissionSearchQuery
    {
        public int FormId { get; set; }
        public string? Status { get; set; }
        public string? Search { get; set; }
        public DateTime? DateFrom { get; set; }
        public DateTime? DateTo { get; set; }
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 50;
    }

    /// <summary>Dashboard-friendly submission list row.</summary>
    public sealed class SubmissionListItemDto
    {
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public string? FormTitle { get; set; }
        public string? Status { get; set; }
        public bool IsSpam { get; set; }
        public decimal? SpamScore { get; set; }
        public DateTime SubmittedOnUtc { get; set; }
        public DateTime? ReadOnUtc { get; set; }
        public int? UserId { get; set; }
        public string? IpAddress { get; set; }
        public string? SummaryText { get; set; }
        public string? DataJson { get; set; }
    }

    /// <summary>Full submission detail payload for custom dashboards.</summary>
    public sealed class SubmissionDetailDto
    {
        public SubmissionDto? Submission { get; set; }
        public FormDto? Form { get; set; }
        public FormSchemaInfo Schema { get; set; } = new FormSchemaInfo();
        public IReadOnlyList<FileDto> Files { get; set; } = Array.Empty<FileDto>();
        public IReadOnlyList<SubmissionValueDto> Values { get; set; } = Array.Empty<SubmissionValueDto>();
        public IReadOnlyList<SubmissionFieldSnapshotDto> FieldSnapshots { get; set; } = Array.Empty<SubmissionFieldSnapshotDto>();
        public bool HasSnapshot { get; set; }
        public SubmissionWorkflowSummaryDto Workflow { get; set; } = new SubmissionWorkflowSummaryDto();
    }

    /// <summary>A display value produced by flattening a submission against its schema.</summary>
    public sealed class SubmissionValueDto
    {
        public string? Key { get; set; }
        public string? Value { get; set; }
    }

    /// <summary>Stored field snapshot captured at submit time.</summary>
    public sealed class SubmissionFieldSnapshotDto
    {
        public string? FieldKey { get; set; }
        public string? FieldLabel { get; set; }
        public string? FieldType { get; set; }
        public string? RawValue { get; set; }
        public string? DisplayValue { get; set; }
        public int SortOrder { get; set; }
        public bool IsLegacyFallback { get; set; }
    }

    /// <summary>Workflow summary attached to a submission detail.</summary>
    public sealed class SubmissionWorkflowSummaryDto
    {
        public bool HasWorkflow { get; set; }
        public string? ActiveTaskId { get; set; }
        public string? ActiveNodeLabel { get; set; }
        public string? CaseStatus { get; set; }
        public string? ExecutionStatus { get; set; }
        public int TaskCount { get; set; }
        public int OpenTaskCount { get; set; }
        public int ActionCount { get; set; }
        public IReadOnlyList<InboxTaskDto> Tasks { get; set; } = Array.Empty<InboxTaskDto>();
        public IReadOnlyList<InboxTaskActionDto> Actions { get; set; } = Array.Empty<InboxTaskActionDto>();
    }

    /// <summary>Options for the current actor's inbox board.</summary>
    public sealed class InboxQuery
    {
        public int RecentCompleted { get; set; } = 25;
    }

    /// <summary>Inbox board split into incoming, in-progress, and completed lanes.</summary>
    public sealed class InboxBoardDto
    {
        public InboxUserDto User { get; set; } = new InboxUserDto();
        public InboxKpiDto Kpis { get; set; } = new InboxKpiDto();
        public IReadOnlyList<InboxTaskDto> Incoming { get; set; } = Array.Empty<InboxTaskDto>();
        public IReadOnlyList<InboxTaskDto> InProgress { get; set; } = Array.Empty<InboxTaskDto>();
        public IReadOnlyList<InboxTaskDto> Completed { get; set; } = Array.Empty<InboxTaskDto>();
        public DateTime GeneratedAtUtc { get; set; }
    }

    public sealed class InboxUserDto
    {
        public int UserId { get; set; }
        public string? UserName { get; set; }
        public string? DisplayName { get; set; }
        public bool IsAdmin { get; set; }
    }

    public sealed class InboxKpiDto
    {
        public int Incoming { get; set; }
        public int InProgress { get; set; }
        public int Completed { get; set; }
        public int Overdue { get; set; }
    }

    /// <summary>One human workflow task row.</summary>
    public sealed class InboxTaskDto
    {
        public string? TaskId { get; set; }
        public string? CaseId { get; set; }
        public string? ExecutionId { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public string? NodeId { get; set; }
        public string? NodeLabel { get; set; }
        public string? Status { get; set; }
        public IReadOnlyList<string> CandidateRoles { get; set; } = Array.Empty<string>();
        public IReadOnlyList<string> CandidateUsers { get; set; } = Array.Empty<string>();
        public int? AssignedUserId { get; set; }
        public string? AssignedUserName { get; set; }
        public string? AssignedDisplayName { get; set; }
        public bool AllowClaim { get; set; }
        public bool AllowForward { get; set; }
        public bool AllowReassign { get; set; }
        public string? Outcome { get; set; }
        public string? Comment { get; set; }
        public DateTime CreatedAtUtc { get; set; }
        public DateTime? ClaimedAtUtc { get; set; }
        public DateTime? DueAtUtc { get; set; }
        public DateTime? CompletedAtUtc { get; set; }
    }

    /// <summary>Action request used by claim/approve/reject/forward/comment.</summary>
    public sealed class InboxTaskActionRequest
    {
        public string TaskId { get; set; } = string.Empty;
        public string? Comment { get; set; }
        public string? TargetUser { get; set; }
        public Dictionary<string, object>? Data { get; set; }
    }

    /// <summary>File attachment request for a workflow inbox task.</summary>
    public sealed class InboxFileAttachmentRequest
    {
        public string TaskId { get; set; } = string.Empty;
        public string FieldKey { get; set; } = "inbox_attachment";
        public string FileName { get; set; } = "attachment";
        public string ContentType { get; set; } = "application/octet-stream";
        public System.IO.Stream Content { get; set; } = System.IO.Stream.Null;
        public long? SizeBytes { get; set; }
    }

    /// <summary>Request to route a submission into a user's inbox without a prebuilt workflow.</summary>
    public sealed class SendSubmissionToInboxRequest
    {
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public string TargetUser { get; set; } = string.Empty;
        public string? Title { get; set; }
        public string? Comment { get; set; }
    }

    /// <summary>Result of a workflow task operation.</summary>
    public sealed class InboxTaskResultDto
    {
        public bool Success { get; set; }
        public string? Error { get; set; }
        public InboxTaskDto? Task { get; set; }
        public SubmissionDto? Submission { get; set; }
        public IReadOnlyList<FileDto> Files { get; set; } = Array.Empty<FileDto>();
        public IReadOnlyList<InboxTaskActionDto> Actions { get; set; } = Array.Empty<InboxTaskActionDto>();
    }

    /// <summary>Result of attaching a file through the inbox facade.</summary>
    public sealed class InboxFileAttachmentResultDto
    {
        public bool Success { get; set; }
        public string? Error { get; set; }
        public FileDto? File { get; set; }
        public InboxTaskResultDto? Task { get; set; }
    }

    /// <summary>Result of sending a submission to an inbox.</summary>
    public sealed class InboxSendSubmissionResultDto
    {
        public bool Success { get; set; }
        public string? TaskId { get; set; }
        public string? AssignedTo { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
    }

    /// <summary>One workflow task action/audit entry.</summary>
    public sealed class InboxTaskActionDto
    {
        public string? ActionId { get; set; }
        public string? TaskId { get; set; }
        public string? CaseId { get; set; }
        public string? ExecutionId { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public string? ActionType { get; set; }
        public int? ActorUserId { get; set; }
        public string? ActorUserName { get; set; }
        public string? ActorDisplayName { get; set; }
        public string? TargetUser { get; set; }
        public string? Outcome { get; set; }
        public string? Comment { get; set; }
        public DateTime CreatedAtUtc { get; set; }
    }

    /// <summary>
    /// A form's schema parsed into typed, read-only field metadata (decoupled from the
    /// internal storage models). Returned by <c>ISchemaApi.Parse</c>. Row/column layout is
    /// flattened so <see cref="Fields"/> is the same ordered, input-field list the server
    /// validates against.
    /// </summary>
    public sealed class FormSchemaInfo
    {
        /// <summary>The form's fields, flattened (Row containers expanded into their children) and ordered.</summary>
        public IReadOnlyList<FormFieldInfo> Fields { get; set; } = Array.Empty<FormFieldInfo>();
    }

    /// <summary>A single field's metadata, as exposed to SDK consumers (e.g. a custom renderer).</summary>
    public sealed class FormFieldInfo
    {
        /// <summary>Unique machine key, e.g. "first_name".</summary>
        public string? Key { get; set; }

        /// <summary>Field type as a string, e.g. "Text", "Email", "Composite" (kept as a string so plugin types survive).</summary>
        public string? Type { get; set; }

        /// <summary>Display label.</summary>
        public string? Label { get; set; }

        /// <summary>Placeholder text.</summary>
        public string? Placeholder { get; set; }

        /// <summary>Help/hint text.</summary>
        public string? HelpText { get; set; }

        /// <summary>Whether the field is required.</summary>
        public bool Required { get; set; }

        /// <summary>Whether the field is read-only.</summary>
        public bool ReadOnly { get; set; }

        /// <summary>Whether the field is hidden.</summary>
        public bool Hidden { get; set; }

        /// <summary>Layout width hint, e.g. "50%".</summary>
        public string? Width { get; set; }

        /// <summary>Sort order within the form.</summary>
        public int Order { get; set; }

        /// <summary>True for value-bearing inputs; false for layout/display types (Html, Section, Row, UniqueId).</summary>
        public bool IsInputField { get; set; }

        /// <summary>Choice options (for Select/Radio/Checkbox), or empty.</summary>
        public IReadOnlyList<FieldOptionInfo> Options { get; set; } = Array.Empty<FieldOptionInfo>();

        /// <summary>Validation rules, or null when the field has none.</summary>
        public FieldValidationInfo? Validation { get; set; }
    }

    /// <summary>Validation rules for a field (subset relevant to consumers).</summary>
    public sealed class FieldValidationInfo
    {
        /// <summary>Minimum string length.</summary>
        public int? MinLength { get; set; }

        /// <summary>Maximum string length.</summary>
        public int? MaxLength { get; set; }

        /// <summary>Minimum numeric value.</summary>
        public double? Min { get; set; }

        /// <summary>Maximum numeric value.</summary>
        public double? Max { get; set; }

        /// <summary>Regex pattern the value must match.</summary>
        public string? Pattern { get; set; }

        /// <summary>Custom message shown when the pattern fails.</summary>
        public string? PatternMessage { get; set; }

        /// <summary>Custom message shown when any rule fails.</summary>
        public string? CustomMessage { get; set; }
    }

    /// <summary>A choice option for Select/Radio/Checkbox fields.</summary>
    public sealed class FieldOptionInfo
    {
        /// <summary>Display label.</summary>
        public string? Label { get; set; }

        /// <summary>Stored value.</summary>
        public string? Value { get; set; }

        /// <summary>Whether this option is selected by default.</summary>
        public bool Selected { get; set; }
    }
}
