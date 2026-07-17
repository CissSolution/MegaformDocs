using System.Collections.Generic;
using MegaForm.Core.Models;

namespace MegaForm.Core.Services.TypedSubmission
{
    /// <summary>
    /// Platform-agnostic read model for a submission's typed field data.
    /// Reconstructed from MF_SubmissionFields + MF_SubmissionValue* rows.
    /// </summary>
    public sealed class SubmissionDataDocument
    {
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public Dictionary<string, object> Data { get; set; }
        public IReadOnlyList<SubmissionFieldRecord> Fields { get; set; }

        /// <summary>
        /// Typed values keyed by SubmissionFieldId. Populated by hosts that want to
        /// reconstruct the canonical Data dictionary from rows instead of JSON.
        /// </summary>
        public Dictionary<long, TypedFieldValues> FieldValues { get; set; }
    }
}
