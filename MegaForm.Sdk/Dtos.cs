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
