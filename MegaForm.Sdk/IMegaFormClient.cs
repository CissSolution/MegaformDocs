using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Sdk
{
    /// <summary>
    /// The single public entry point for using MegaForm programmatically. Resolve it from
    /// DI (<c>services.AddMegaFormSdk()</c>) or, in non-DI hosts (e.g. a DNN Razor host),
    /// via the ambient <see cref="MegaForm"/> accessor.
    /// </summary>
    public interface IMegaFormClient
    {
        /// <summary>Form authoring + listing.</summary>
        IFormApi Forms { get; }

        /// <summary>Submission querying (FindData).</summary>
        ISubmissionApi Submissions { get; }

        /// <summary>Dashboard summaries for customers building an in-host dashboard.</summary>
        IDashboardApi Dashboard { get; }

        /// <summary>Submission dashboard search, detail, and status operations.</summary>
        ISubmissionDashboardApi SubmissionDashboard { get; }

        /// <summary>Human-task inbox operations backed by the host workflow task service.</summary>
        IInboxApi Inbox { get; }

        /// <summary>Uploaded-file listing + download.</summary>
        IFileApi Files { get; }

        /// <summary>Parse a form's SchemaJson into typed, read-only field metadata.</summary>
        ISchemaApi Schema { get; }
    }

    /// <summary>Parse a form's schema JSON into typed field metadata (pure, no I/O).</summary>
    public interface ISchemaApi
    {
        /// <summary>
        /// Parse a form's SchemaJson into typed <see cref="FormSchemaInfo"/>. Never throws on malformed
        /// JSON — returns an empty schema (mirrors the server's fail-soft schema resolver). Row layout is
        /// flattened so the field list matches what the server validates.
        /// </summary>
        FormSchemaInfo Parse(string schemaJson);

        /// <summary>Convenience overload: parse <paramref name="form"/>.SchemaJson. Throws <see cref="System.ArgumentNullException"/> when form is null.</summary>
        FormSchemaInfo ParseForm(FormDto form);
    }

    /// <summary>List and download files attached to submissions.</summary>
    public interface IFileApi
    {
        /// <summary>List the files uploaded against a submission (metadata only).</summary>
        Task<System.Collections.Generic.IReadOnlyList<FileDto>> ListForSubmissionAsync(int submissionId, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Read a file's bytes + metadata for a download response, or null if not found.</summary>
        Task<MegaFormFileContent?> OpenAsync(int submissionId, int fileId, MegaFormScope? scope = null, CancellationToken cancellationToken = default);
    }

    /// <summary>Create, read, list and delete forms.</summary>
    public interface IFormApi
    {
        /// <summary>Create a new form. Returns the created form (with its new id).</summary>
        Task<FormDto> CreateFormAsync(CreateFormRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Get a single form by id, or null if not found / not in this portal.</summary>
        Task<FormDto?> GetFormAsync(int formId, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>List forms in the current portal with optional filter + paging.</summary>
        Task<PagedResult<FormDto>> ListFormsAsync(FormQuery? query = null, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Permanently delete a form.</summary>
        Task DeleteFormAsync(int formId, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>
        /// Apply a partial update to a form (only non-null members of <paramref name="request"/> change).
        /// Returns the updated form. Throws <see cref="System.InvalidOperationException"/> when the form
        /// does not exist or belongs to another portal.
        /// </summary>
        Task<FormDto> UpdateFormAsync(int formId, UpdateFormRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default);
    }

    /// <summary>Query, submit, update and delete submissions.</summary>
    public interface ISubmissionApi
    {
        /// <summary>Find submissions for a form with optional status filter + paging (FindData).</summary>
        Task<PagedResult<SubmissionDto>> FindAsync(SubmissionQuery query, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Get a single submission by id, or null if not found.</summary>
        Task<SubmissionDto?> GetAsync(int submissionId, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>
        /// Submit form data, running the same server-side validation as a public form submit.
        /// When the host registered the full submission pipeline (anti-spam, notifications,
        /// workflow), this delegates to it; otherwise it validates and inserts the row. On a
        /// validation failure the result's <see cref="SubmitResult.Success"/> is false and no
        /// row is saved.
        /// </summary>
        Task<SubmitResult> SubmitAsync(int formId, Dictionary<string, object> data, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Replace a submission's stored data (full replace, not merge). No-op if the submission is not in this portal.</summary>
        Task UpdateAsync(int submissionId, Dictionary<string, object> data, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Permanently delete a submission. No-op if the submission is not in this portal.</summary>
        Task DeleteAsync(int submissionId, MegaFormScope? scope = null, CancellationToken cancellationToken = default);
    }

    /// <summary>Read-only dashboard summaries for forms and submissions in the current host.</summary>
    public interface IDashboardApi
    {
        /// <summary>Return per-form counts and recent-submission totals for the current portal.</summary>
        Task<DashboardOverviewDto> GetOverviewAsync(DashboardQuery? query = null, MegaFormScope? scope = null, CancellationToken cancellationToken = default);
    }

    /// <summary>Submission-dashboard operations richer than the legacy <see cref="ISubmissionApi.FindAsync"/> surface.</summary>
    public interface ISubmissionDashboardApi
    {
        /// <summary>Search submissions with status/search/date filters and dashboard-friendly list rows.</summary>
        Task<PagedResult<SubmissionListItemDto>> SearchAsync(SubmissionSearchQuery query, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Load a submission detail payload with schema-derived values, files, and workflow summary when available.</summary>
        Task<SubmissionDetailDto?> GetDetailAsync(int submissionId, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Update a submission status after checking that the submission belongs to the current portal.</summary>
        Task UpdateStatusAsync(int submissionId, string status, MegaFormScope? scope = null, CancellationToken cancellationToken = default);
    }

    /// <summary>Human-task inbox facade for same-host dashboard integrations.</summary>
    public interface IInboxApi
    {
        /// <summary>Return the current actor's workboard: incoming, in-progress, completed, and KPI counts.</summary>
        Task<InboxBoardDto> GetMyInboxAsync(InboxQuery? query = null, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Load one visible task with action history and linked submission summary.</summary>
        Task<InboxTaskResultDto> GetTaskAsync(string taskId, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Claim an open task for the current actor.</summary>
        Task<InboxTaskResultDto> ClaimAsync(InboxTaskActionRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Approve an open task and resume the workflow.</summary>
        Task<InboxTaskResultDto> ApproveAsync(InboxTaskActionRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Reject an open task and resume the workflow.</summary>
        Task<InboxTaskResultDto> RejectAsync(InboxTaskActionRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Forward an open task to another user or role target.</summary>
        Task<InboxTaskResultDto> ForwardAsync(InboxTaskActionRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Add a comment to an open task without changing its state.</summary>
        Task<InboxTaskResultDto> CommentAsync(InboxTaskActionRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Attach a file to the task's linked submission, then return the stored file metadata.</summary>
        Task<InboxFileAttachmentResultDto> AttachFileAsync(InboxFileAttachmentRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Create a one-step review task for a submission without requiring a preconfigured workflow.</summary>
        Task<InboxSendSubmissionResultDto> SendSubmissionAsync(SendSubmissionToInboxRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default);
    }
}
