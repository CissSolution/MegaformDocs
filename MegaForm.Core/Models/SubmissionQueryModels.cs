using System;
using System.Collections.Generic;

namespace MegaForm.Core.Models
{
    /// <summary>
    /// Shared query contract for submissions across DNN / Web / Oqtane.
    /// Sprint 1: standardize list/detail contracts in Core without breaking legacy repos.
    /// </summary>
    public class SubmissionListQuery
    {
        public int FormId { get; set; }
        public string Status { get; set; }
        public string Search { get; set; }
        public DateTime? DateFrom { get; set; }
        public DateTime? DateTo { get; set; }
        public int PageIndex { get; set; }
        public int PageSize { get; set; } = 50;
        /// <summary>
        /// [OwnerRlsSql v20260722-01] Server-set ONLY (never bound from a request): restricts the
        /// list to submissions OWNED by this user (SubmissionInfo.UserId). Used for the "own"
        /// row-level-security scope and the My-Submissions portal endpoint so the owner filter
        /// runs in SQL and TotalCount/paging stay correct (previously a post-pagination in-memory
        /// filter reported the page size as the total). Repositories that can push the predicate
        /// down implement ISubmissionOwnerFilterableRepository; SubmissionQueryService falls back
        /// to an in-memory page filter elsewhere.
        /// </summary>
        public int? UserId { get; set; }
        /// <summary>
        /// [QueryKey250Fix v20260717-01] Server-set ONLY (never bound from a request): lets a
        /// trusted internal fetch (bound-query queryKey pre-filter, admin report export) page up to
        /// SubmissionQueryService.TrustedMaxPageSize instead of the public 250 clamp. The 250 clamp
        /// silently truncated every queryKey listview and report on forms with more than 250
        /// submissions — filters ran over the first 250 rows only (data loss). The larger fetch is
        /// still ONE bounded SQL page (OFFSET/FETCH pushed down), per CLAUDE.md bounded-read rule 11.
        /// </summary>
        public bool TrustedFetch { get; set; }

        /// <summary>
        /// Typed field predicates. Repositories implementing ISubmissionTypedQueryRepository
        /// evaluate every predicate in storage before count and paging (AND semantics).
        /// </summary>
        public List<SubmissionFieldFilter> FieldFilters { get; set; } = new List<SubmissionFieldFilter>();
    }

    public enum SubmissionFieldFilterOperator
    {
        Equals,
        NotEquals,
        Contains,
        StartsWith,
        EndsWith,
        GreaterThan,
        GreaterThanOrEqual,
        LessThan,
        LessThanOrEqual,
        IsEmpty,
        IsNotEmpty
    }

    /// <summary>
    /// One strongly typed field predicate. DataType may be omitted when exactly one typed value
    /// property is populated; text is the default for compatibility with select/radio controls.
    /// </summary>
    public class SubmissionFieldFilter
    {
        public string FieldKey { get; set; }
        public SubmissionDataType? DataType { get; set; }
        public SubmissionFieldFilterOperator Operator { get; set; } = SubmissionFieldFilterOperator.Equals;
        public string TextValue { get; set; }
        public decimal? NumberValue { get; set; }
        public DateTime? DateValue { get; set; }
        public bool? BooleanValue { get; set; }
    }

    public class SubmissionListItem
    {
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public string FormTitle { get; set; }
        public string Status { get; set; }
        public bool IsSpam { get; set; }
        public decimal? SpamScore { get; set; }
        public DateTime SubmittedOnUtc { get; set; }
        public DateTime? ReadOnUtc { get; set; }
        public int? UserId { get; set; }
        public string IpAddress { get; set; }
        public string SummaryText { get; set; }
        public Dictionary<string, object> Data { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        [Obsolete("Use Data. DataJson is a legacy compatibility mirror and may be collapsed to {} on typed-first hosts.", false)]
        public string DataJson { get; set; }
    }


    public class SubmissionFieldSnapshot
    {
        public string FieldKey { get; set; }
        public string FieldLabel { get; set; }
        public string FieldType { get; set; }
        public string RawValue { get; set; }
        public string DisplayValue { get; set; }
        public int SortOrder { get; set; }
        public bool IsLegacyFallback { get; set; }
    }

    public class SubmissionDetailResult
    {
        public SubmissionInfo Submission { get; set; }
        public FormInfo Form { get; set; }
        public FormSchema Schema { get; set; }
        public List<FileInfo> Files { get; set; } = new List<FileInfo>();
        public Dictionary<string, object> Data { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public List<KeyValuePair<string, string>> FlattenedValues { get; set; } = new List<KeyValuePair<string, string>>();
        public List<SubmissionFieldSnapshot> FieldSnapshots { get; set; } = new List<SubmissionFieldSnapshot>();
        public bool HasSnapshot { get; set; }
        // [Recovered June-15] workflow detail payload for the submission detail view.
        public SubmissionWorkflowDetailInfo WorkflowDetail { get; set; } = new SubmissionWorkflowDetailInfo();
    }

    public class SubmissionPagedResult<T>
    {
        public List<T> Items { get; set; } = new List<T>();
        public int TotalCount { get; set; }
        public int PageIndex { get; set; }
        public int PageSize { get; set; }
    }
}
