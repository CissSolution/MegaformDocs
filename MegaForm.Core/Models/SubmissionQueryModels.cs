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
