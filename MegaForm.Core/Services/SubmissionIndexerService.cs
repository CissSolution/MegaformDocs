using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Globalization;
using MegaForm.Core.Models;
using MegaForm.Core.Utilities;

namespace MegaForm.Core.Services
{
    // ============================================================
    // B55 P1 — SubmissionIndexerService
    // ============================================================
    // Writes one row per submitted field into MF_SubmissionValues
    // so the B55 Reporting System can filter / aggregate without
    // re-parsing DataJson on every report run.
    //
    // Type-routing:
    //   Number / Currency           → ValueNumber
    //   Date / DateTime / Time      → ValueDate
    //   Everything else (Text/Email/
    //     Url/Textarea/Select/Radio
    //     /Checkbox/RichText/…)     → ValueText
    //
    // Pluggable connection: callers pass a factory delegate so the
    // service stays platform-agnostic (DNN uses
    // System.Data.SqlClient.SqlConnection, Oqtane uses
    // Microsoft.Data.SqlClient via its IDbContextFactory, Web uses
    // the SQLite ADO provider).
    // ============================================================

    /// <summary>
    /// Writes / refreshes the flat MF_SubmissionValues index for one
    /// submission. Idempotent: every IndexSubmission call replaces
    /// the prior rows for that SubmissionId.
    /// </summary>
    public class SubmissionIndexerService
    {
        /// <summary>Factory that returns an OPEN <see cref="DbConnection"/>.</summary>
        public Func<DbConnection> ConnectionFactory { get; set; }

        public SubmissionIndexerService(Func<DbConnection> connectionFactory)
        {
            ConnectionFactory = connectionFactory
                ?? throw new ArgumentNullException(nameof(connectionFactory));
        }

        /// <summary>
        /// Re-index a single submission. Deletes prior rows and inserts
        /// one row per (FieldKey, value) pair derived from <paramref name="values"/>
        /// using the field-type information in <paramref name="fields"/>.
        /// </summary>
        public void IndexSubmission(
            int submissionId,
            int formId,
            IDictionary<string, object> values,
            IList<FormField> fields)
        {
            if (submissionId <= 0) return;
            if (values == null || values.Count == 0)
            {
                DeleteForSubmission(submissionId);
                return;
            }

            var typeByKey = BuildFieldTypeIndex(fields);

            using (var conn = ConnectionFactory())
            {
                if (conn == null) return;
                if (conn.State != ConnectionState.Open) conn.Open();

                using (var tx = conn.BeginTransaction())
                {
                    DeleteForSubmission(conn, tx, submissionId);
                    foreach (var pair in values)
                    {
                        var key = pair.Key;
                        if (string.IsNullOrWhiteSpace(key)) continue;
                        if (IsInternalKey(key)) continue;

                        string fieldType = typeByKey.TryGetValue(key, out var t) ? t : "Text";
                        InsertRow(conn, tx, submissionId, formId, key, pair.Value, fieldType);
                    }
                    tx.Commit();
                }
            }
        }

        /// <summary>Bulk delete the index rows for one submission.</summary>
        public void DeleteForSubmission(int submissionId)
        {
            if (submissionId <= 0) return;
            using (var conn = ConnectionFactory())
            {
                if (conn == null) return;
                if (conn.State != ConnectionState.Open) conn.Open();
                DeleteForSubmission(conn, null, submissionId);
            }
        }

        // ── Internals ─────────────────────────────────────────────────

        private static Dictionary<string, string> BuildFieldTypeIndex(IList<FormField> fields)
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (fields == null) return map;
            var flat = MegaFormUtils.FlattenFields(new List<FormField>(fields));
            foreach (var f in flat)
            {
                if (f == null || string.IsNullOrWhiteSpace(f.Key)) continue;
                map[f.Key] = EffectiveIndexType(f);
            }
            return map;
        }

        // [Unify v2 2026-06-18] A scalar-preset Composite indexes like its base type so numeric
        // reports/filters keep working after unification: the unified Number control
        // (preset 'number') → ValueNumber, Date-of-Birth (preset 'dob', whose combined value is an
        // ISO date) → ValueDate. Every other preset — incl. the decorated money/measurement/
        // price_range whose combined value is NOT a bare number — falls through to ValueText,
        // exactly as before. Legacy native types are returned verbatim.
        private static string EffectiveIndexType(FormField f)
        {
            if (f == null) return "Text";
            if (!string.Equals(f.Type, "Composite", StringComparison.OrdinalIgnoreCase)) return f.Type ?? "Text";
            string preset = null;
            if (f.WidgetProps != null && f.WidgetProps.TryGetValue("preset", out var pr) && pr != null) preset = pr.ToString();
            if (string.Equals(preset, "number", StringComparison.OrdinalIgnoreCase)) return "Number";
            if (string.Equals(preset, "dob", StringComparison.OrdinalIgnoreCase)) return "Date";
            return f.Type ?? "Composite";
        }

        private static bool IsInternalKey(string key)
        {
            if (string.IsNullOrEmpty(key)) return true;
            // Honeypot / framework keys never reach this method (they are
            // stripped in SubmissionProcessor), but defend in depth.
            return key.StartsWith("__mf_", StringComparison.OrdinalIgnoreCase);
        }

        private static void DeleteForSubmission(DbConnection conn, DbTransaction tx, int submissionId)
        {
            using (var cmd = conn.CreateCommand())
            {
                if (tx != null) cmd.Transaction = tx;
                cmd.CommandText = "DELETE FROM MF_SubmissionValues WHERE SubmissionId = @id";
                cmd.CommandType = CommandType.Text;
                AddParam(cmd, "@id", submissionId);
                cmd.ExecuteNonQuery();
            }
        }

        private static void InsertRow(
            DbConnection conn, DbTransaction tx,
            int submissionId, int formId, string fieldKey, object value, string fieldType)
        {
            string text = null;
            decimal? number = null;
            DateTime? date = null;
            ProjectValue(value, fieldType, out text, out number, out date);

            // Skip pure-null rows so the index does not balloon with empties.
            if (text == null && !number.HasValue && !date.HasValue) return;

            using (var cmd = conn.CreateCommand())
            {
                if (tx != null) cmd.Transaction = tx;
                cmd.CommandText =
                    "INSERT INTO MF_SubmissionValues (SubmissionId, FormId, FieldKey, ValueText, ValueNumber, ValueDate) " +
                    "VALUES (@sid, @fid, @key, @vt, @vn, @vd)";
                cmd.CommandType = CommandType.Text;
                AddParam(cmd, "@sid", submissionId);
                AddParam(cmd, "@fid", formId);
                AddParam(cmd, "@key", fieldKey);
                AddParam(cmd, "@vt", (object)text ?? DBNull.Value);
                AddParam(cmd, "@vn", (object)number ?? DBNull.Value);
                AddParam(cmd, "@vd", (object)date ?? DBNull.Value);
                cmd.ExecuteNonQuery();
            }
        }

        /// <summary>
        /// Decide which of the three typed columns receives the raw
        /// submitted value, based on the form-field's declared type.
        /// </summary>
        private static void ProjectValue(
            object raw, string fieldType,
            out string text, out decimal? number, out DateTime? date)
        {
            text = null;
            number = null;
            date = null;

            if (raw == null) return;
            string s = ProjectRawToText(raw);
            if (string.IsNullOrWhiteSpace(s)) return;

            string t = (fieldType ?? "").Trim();
            if (string.Equals(t, "Number", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(t, "Currency", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(t, "Rating", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(t, "Slider", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(t, "OpinionScale", StringComparison.OrdinalIgnoreCase))
            {
                if (decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var d))
                {
                    number = d;
                    return;
                }
            }
            else if (string.Equals(t, "Date", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(t, "DateTime", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(t, "Time", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(t, "DateRange", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(t, "Appointment", StringComparison.OrdinalIgnoreCase))
            {
                if (DateTime.TryParse(s, CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var dt))
                {
                    date = dt;
                    return;
                }
            }

            // Everything else (Text/Email/Url/Textarea/Select/Radio/Checkbox/
            // RichText/Signature/…) lands in ValueText. We still cap obscenely
            // large values so a 5 MB textarea doesn't dominate the index.
            if (s.Length > 8000) s = s.Substring(0, 8000);
            text = s;
        }

        // [ProjectValueCollectionFix v20260706] The reporting flat index (MF_SubmissionValues.ValueText,
        // read by the Reports/SubmissionData grid + SQL search) previously did Convert.ToString(raw)
        // only, so a multi-value field — which reaches here as a Newtonsoft JArray (backfill) or a CLR
        // List<object> (Oqtane STJ submit, MegaFormController.NormalizeJsonValue) — produced the .NET
        // type-name "System.Collections.Generic.List`1[System.Object]". Flatten collections to a
        // comma-joined VALUE string (option labels aren't available at this projection layer; the
        // Details envelope's DisplayValue already carries labels).
        private static string ProjectRawToText(object raw)
        {
            if (raw == null) return string.Empty;
            if (raw is string rs) return rs;
            if (raw is Newtonsoft.Json.Linq.JArray ja)
            {
                var parts = new System.Collections.Generic.List<string>();
                foreach (var v in ja) parts.Add(v == null ? string.Empty : v.ToString());
                return string.Join(", ", parts);
            }
            if (raw is Newtonsoft.Json.Linq.JValue || raw is Newtonsoft.Json.Linq.JObject)
                return raw.ToString();
            if (raw is System.Collections.IEnumerable en)
            {
                var parts = new System.Collections.Generic.List<string>();
                foreach (var item in en) parts.Add(Convert.ToString(item, CultureInfo.InvariantCulture));
                return string.Join(", ", parts);
            }
            return Convert.ToString(raw, CultureInfo.InvariantCulture);
        }

        private static void AddParam(DbCommand cmd, string name, object value)
        {
            var p = cmd.CreateParameter();
            p.ParameterName = name;
            p.Value = value ?? DBNull.Value;
            cmd.Parameters.Add(p);
        }
    }
}
