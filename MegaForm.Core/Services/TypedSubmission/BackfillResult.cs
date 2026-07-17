using System.Collections.Generic;

namespace MegaForm.Core.Services.TypedSubmission
{
    /// <summary>
    /// Summary returned by the legacy DataJson → typed rows backfill process.
    /// </summary>
    public sealed class BackfillResult
    {
        public int Processed { get; set; }
        public int Skipped { get; set; }
        public int Failed { get; set; }
        public int FieldRowsWritten { get; set; }
        public List<string> Errors { get; set; } = new List<string>();
    }
}
