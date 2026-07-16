using System.Threading;

namespace MegaForm.Core.Services.ExternalTable
{
    /// <summary>
    /// [SourcePicker v20260715] Per-request data-source override for the submissions READ path,
    /// carried on an AsyncLocal so ISubmissionRepository's signature stays untouched (a dozen
    /// services resolve it from DI — changing List()'s shape would ripple across 4 platforms).
    ///
    /// The controller SETS a scope before calling the query facade; ExternalSubmissionRepository
    /// READS it to route, and writes the outcome back (which source actually answered, whether the
    /// count is bounded, which table). The controller then echoes those facts to the client so the
    /// UI can never claim "SQL table" while silently serving JSON — the exact twin-gap trap this
    /// feature replaces (see handoff ERP_DEMO §source-picker).
    ///
    /// Source values:
    ///   auto — default; existing behavior (ATBE-bound form reads live, everything else JSON).
    ///   json — force MegaForm's own store (MF_Submissions), even for an ATBE-bound form.
    ///   sql  — force the external table: ATBE binding when present, else the table derived
    ///          from settings.databaseInsert. Fail-CLOSED (empty page) when neither resolves.
    /// </summary>
    public sealed class ExternalSourceScope
    {
        public const string Auto = "auto";
        public const string Json = "json";
        public const string Sql = "sql";

        /// <summary>Requested source (auto | json | sql).</summary>
        public string Source { get; set; } = Auto;

        // ── Outputs (written by ExternalSubmissionRepository.List) ──
        /// <summary>Which store actually served the page: "json" | "sql" | "" (nothing served / fail-closed).</summary>
        public string AppliedSource { get; set; } = string.Empty;
        /// <summary>True when TotalCount is a floor, not a fact (exact count was too expensive / timed out).</summary>
        public bool TotalIsBounded { get; set; }
        /// <summary>External table that served the rows (for the grid header sub-label).</summary>
        public string Table { get; set; } = string.Empty;
        public string SchemaName { get; set; } = string.Empty;
    }

    public static class ExternalSourceContext
    {
        private static readonly AsyncLocal<ExternalSourceScope> _current = new AsyncLocal<ExternalSourceScope>();

        public static ExternalSourceScope Current
        {
            get { return _current.Value; }
            set { _current.Value = value; }
        }

        /// <summary>Requested source, normalized; "auto" when no scope is active.</summary>
        public static string Source
        {
            get
            {
                var s = _current.Value != null ? _current.Value.Source : null;
                return s == ExternalSourceScope.Json || s == ExternalSourceScope.Sql ? s : ExternalSourceScope.Auto;
            }
        }

        /// <summary>Normalize a client-supplied source string (anything unknown → auto).</summary>
        public static string Normalize(string raw)
        {
            var s = (raw ?? string.Empty).Trim().ToLowerInvariant();
            return s == ExternalSourceScope.Json || s == ExternalSourceScope.Sql ? s : ExternalSourceScope.Auto;
        }
    }
}
