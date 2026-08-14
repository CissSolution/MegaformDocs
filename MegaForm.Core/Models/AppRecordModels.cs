using System;
using System.Collections.Generic;

namespace MegaForm.Core.Models
{
    public sealed class AppRecordQueryRequest
    {
        public int PortalId { get; set; }
        public string AppKey { get; set; }
        public string QueryKey { get; set; }
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 20;
        public string Search { get; set; }
        public Dictionary<string, object> Parameters { get; set; } =
            new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
    }

    public sealed class AppRecordInfo
    {
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public string Status { get; set; }
        public int? UserId { get; set; }
        public DateTime SubmittedOnUtc { get; set; }
        public Dictionary<string, object> Data { get; set; } =
            new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public bool IsTyped { get; set; }
    }

    public sealed class AppRecordPage
    {
        public AppDefinitionInfo App { get; set; }
        public AppQueryDefinitionInfo Query { get; set; }
        public FormInfo Form { get; set; }
        public List<AppRecordInfo> Items { get; set; } = new List<AppRecordInfo>();
        public int TotalCount { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public bool IsBounded { get; set; }
    }
}
