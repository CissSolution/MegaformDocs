namespace MegaForm.Core.Services.TypedSubmission
{
    /// <summary>
    /// Options for the legacy DataJson → typed rows backfill process.
    /// </summary>
    public sealed class BackfillOptions
    {
        public int? FormId { get; set; }
        public int BatchSize { get; set; } = 100;
        public int? MaxSubmissions { get; set; }
        public bool Force { get; set; }
    }
}
