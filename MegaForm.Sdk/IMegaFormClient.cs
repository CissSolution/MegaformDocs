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
}
