using System;
using System.Collections.Generic;

namespace MegaForm.Core.Services.TypedSubmission
{
    /// <summary>
    /// Single source of truth for how a form field <c>Type</c> maps to typed-storage
    /// behavior. The same logical control is spelled several ways across the codebase —
    /// UI field plugins register canonical names (<c>File</c>, <c>Date</c>), but AI
    /// starters and older schemas emit aliases (<c>FileUpload</c>), and the builder canvas
    /// uses yet more. Historically the normalizer and the file-meta extractor each carried
    /// their OWN private list of "what is a file field" / "what maps to a date", so the two
    /// drifted: a <c>FileUpload</c> value was stored as JSON but never produced an
    /// <c>MF_Files</c> row.
    ///
    /// Any surface that classifies a field for typed storage (normalizer, file extractor,
    /// and future dashboard/SDK readers) MUST consult THIS class instead of hard-coding a
    /// local list, so the classification can never drift again.
    /// </summary>
    public static class SubmissionFieldTypeSemantics
    {
        // Alias field type -> canonical spelling. Case-insensitive.
        //  - FileUpload: emitted by ProposalStarterService + recognized by the AI form
        //    creator/builder canvas; the registered plugin type is actually "File".
        //  - DateTimePicker: forward guard — not currently emitted, but if an AI/starter
        //    ever produces it, it must land in the typed Date table, not JSON.
        private static readonly Dictionary<string, string> Aliases =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["FileUpload"] = "File",
                ["DateTimePicker"] = "Date",
            };

        // Widgets that RENDER output but collect no submitted value (display-only). Storing
        // them would create empty field rows / "null" JSON values that pollute dashboards.
        // DataRepeater renders SQL/API data; QRCode renders an image from other fields.
        private static readonly HashSet<string> DisplayOnly =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "DataRepeater",
                "QRCode",
            };

        // Field types whose submitted value carries uploaded-file metadata, and therefore
        // must be parsed into MF_Files rows (see SubmissionFileMetaExtractor). "FileUpload"
        // is the alias that used to fall through and lose its MF_Files rows.
        private static readonly HashSet<string> FileLike =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "File",
                "FileUpload",
                "PdfForm",
            };

        /// <summary>Maps an alias field type to its canonical spelling (identity when not an alias).</summary>
        public static string Canonicalize(string type)
        {
            var t = (type ?? string.Empty).Trim();
            return Aliases.TryGetValue(t, out var canonical) ? canonical : t;
        }

        /// <summary>True for display-only widgets that submit no value (e.g. DataRepeater, QRCode).</summary>
        public static bool IsDisplayOnly(string type)
            => DisplayOnly.Contains((type ?? string.Empty).Trim());

        /// <summary>True for File/FileUpload/PdfForm — values carry uploaded-file metadata (-> MF_Files).</summary>
        public static bool IsFileLike(string type)
            => FileLike.Contains((type ?? string.Empty).Trim());
    }
}
