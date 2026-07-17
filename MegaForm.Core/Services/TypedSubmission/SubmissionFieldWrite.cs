using System;

namespace MegaForm.Core.Services.TypedSubmission
{
    /// <summary>
    /// Write payload for a single submitted field. The normalizer produces these;
    /// the host-specific store persists them into MF_SubmissionFields + typed value rows.
    /// </summary>
    public sealed class SubmissionFieldWrite
    {
        public string FieldKey { get; set; }
        public string FieldId { get; set; }
        public string FieldAlias { get; set; }
        public string FieldType { get; set; }
        public string DataType { get; set; } // "string" | "longtext" | "number" | "date" | "boolean" | "json"
        public string LabelSnapshot { get; set; }
        public object Value { get; set; }
        public string DisplayValue { get; set; }
        public int? PageIndex { get; set; }
        public int? FieldOrder { get; set; }
        public bool IsSensitive { get; set; }
        public DateTime CreatedOnUtc { get; set; } = DateTime.UtcNow;
    }
}
