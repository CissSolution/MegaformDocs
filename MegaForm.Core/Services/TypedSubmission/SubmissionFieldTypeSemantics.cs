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
            if (Aliases.TryGetValue(t, out var canonical)) return canonical;
            // [CompositeAliasRender 2026-07-28] Palette tiles are named CompositePhone /
            // CompositeAddress / … and every WRITE path rewrites them to a canonical
            // Composite field carrying a preset. A schema that skipped those paths — an
            // AI-authored form applied straight from JSON — kept the tile name, and the
            // renderer had no case for it, so the field drew a "plugin not installed"
            // placeholder instead of the phone/address inputs. Canonicalising on READ makes
            // such a form render correctly with no data migration. Keep in parity with
            // canonicalizeFieldType() in renderer/field-type-semantics.ts.
            if (t.Length > CompositeTypePrefix.Length
                && t.StartsWith(CompositeTypePrefix, StringComparison.OrdinalIgnoreCase))
                return CompositeTypePrefix;
            return t;
        }

        private const string CompositeTypePrefix = "Composite";

        /// <summary>
        /// [CompositeAliasRender 2026-07-28] Preset implied by a palette-tile type name:
        /// "CompositePhone" → "phone", "CompositeNamePlus" → "name_plus". Returns empty for
        /// anything that is not such an alias. Mirrors compositeAliasToPresetMap() on the
        /// client, which derives the same pairs from COMPOSITE_PRESET_META.
        /// </summary>
        public static string CompositePresetFromAlias(string type)
        {
            var t = (type ?? string.Empty).Trim();
            if (t.Length <= CompositeTypePrefix.Length
                || !t.StartsWith(CompositeTypePrefix, StringComparison.OrdinalIgnoreCase))
                return string.Empty;

            var rest = t.Substring(CompositeTypePrefix.Length);
            var sb = new System.Text.StringBuilder(rest.Length + 4);
            for (var i = 0; i < rest.Length; i++)
            {
                var ch = rest[i];
                if (char.IsUpper(ch) && i > 0) sb.Append('_');
                sb.Append(char.ToLowerInvariant(ch));
            }
            return sb.ToString();
        }

        /// <summary>True for display-only widgets that submit no value (e.g. DataRepeater, QRCode).</summary>
        public static bool IsDisplayOnly(string type)
            => DisplayOnly.Contains((type ?? string.Empty).Trim());

        /// <summary>True for File/FileUpload/PdfForm — values carry uploaded-file metadata (-> MF_Files).</summary>
        public static bool IsFileLike(string type)
            => FileLike.Contains((type ?? string.Empty).Trim());
    }
}
