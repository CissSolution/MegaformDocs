using System;
using System.Collections.Generic;

namespace MegaForm.Core.Services.TypedSubmission
{
    /// <summary>
    /// The decomposed typed values for a single SubmissionFieldWrite.
    /// Host stores persist the matching list into the appropriate MF_SubmissionValue* table.
    /// </summary>
    public sealed class TypedFieldValues
    {
        public List<string> StringValues { get; set; } = new List<string>();
        public List<string> LongTextValues { get; set; } = new List<string>();
        public List<decimal?> NumberValues { get; set; } = new List<decimal?>();
        public List<DateTime?> DateValues { get; set; } = new List<DateTime?>();
        public List<bool> BooleanValues { get; set; } = new List<bool>();
        public List<string> JsonValues { get; set; } = new List<string>();

        public bool HasAnyValue =>
            StringValues.Count > 0 ||
            LongTextValues.Count > 0 ||
            NumberValues.Count > 0 ||
            DateValues.Count > 0 ||
            BooleanValues.Count > 0 ||
            JsonValues.Count > 0;
    }
}
