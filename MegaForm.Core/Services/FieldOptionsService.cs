// ─────────────────────────────────────────────────────────────
//  FieldOptionsService — v20260519-03 (cascading SQL + stored proc + parameters + FormLookup)
//  Loads dropdown / radio / checkbox options from a SQL query
//  configured in the field's properties bag.
//
//  Field properties (in form schema, set by builder UI):
//    optionsSource         : 'static' | 'sql' | 'form-lookup'
//    optionsType           : 'sql' | 'storedproc'   (default: sql; SQL branch only)
//    optionsConnectionKey  : string  (e.g. "DashboardDatabase";  SQL branch only)
//    optionsDatabaseType   : string  (optional, e.g. "SqlServer"; SQL branch only)
//    optionsSql            : string  (SELECT value [, label] FROM ...  OR  stored proc name)
//    optionsDependsOn      : string[] (parent field keys whose changes re-fetch this)
//    optionsReloadOnChange : bool    (default true when optionsDependsOn is set)
//
//  [FormLookup v20260519-03] When optionsSource = 'form-lookup':
//    optionsLookupFormId        : int    — the form whose submissions populate options
//    optionsLookupValueField    : string — field key whose value becomes <option value>
//                                          (special "submissionId" → uses the submission's own ID)
//    optionsLookupLabelField    : string — field key whose value becomes <option label>
//    optionsLookupStatus        : string — optional filter (e.g. "Published") on submission Status
//    optionsLookupFilterField   : string — optional, name of the submission data field to match
//    optionsLookupFilterParam   : string — optional, name of the runtime parameter to compare
//                                          (so cascading still works via :paramName same as SQL)
//
//  No SQL/stored-proc setup required for the form-lookup branch — it reads
//  Submission rows via ISubmissionRepository, so the security surface is the
//  same as the regular submissions list endpoint.
//
//  SQL token substitution:
//    Tokens of form :paramName are normalized to @paramName (mirrors DataRepeaterService).
//    Parameter values come from the caller's parameters dictionary (field values from form).
//    Missing tokens auto-bind to DBNull so the query does not throw.
//
//  Stored procedure:
//    optionsType='storedproc' → optionsSql holds the proc name; parameters dictionary becomes
//    @-prefixed proc parameters.
//
//  Mirrors DataRepeaterService.ExecuteFilterQuery — same security guard,
//  same registry, same shape — so connection management stays single source.
// ─────────────────────────────────────────────────────────────
using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    public sealed class FieldOption
    {
        public string Value { get; set; }
        public string Label { get; set; }
    }

    public sealed class FieldOptionsService
    {
        public const string Badge = "FieldOptionsService v20260519-04";

        private static readonly Regex _tokenParam = new Regex(@":(\w+)", RegexOptions.Compiled);

        private readonly IConnectionRegistry _registry;
        private readonly IFormRepository _formRepo;
        // [FormLookup v20260519-03] Optional — only the form-lookup branch uses it.
        // Backward-compatible: existing static + SQL callers still work when null.
        private readonly ISubmissionRepository _submissionRepo;
        // [DefaultConnFallback v20260519-04] If a field has optionsSource=sql
        // but no optionsConnectionKey (legacy data or builder UX bug), fall
        // back to this alias before silently returning [].
        private readonly string _defaultConnectionKey;

        public FieldOptionsService(IConnectionRegistry registry, IFormRepository formRepo)
            : this(registry, formRepo, null, null)
        {
        }

        public FieldOptionsService(IConnectionRegistry registry, IFormRepository formRepo, ISubmissionRepository submissionRepo)
            : this(registry, formRepo, submissionRepo, null)
        {
        }

        public FieldOptionsService(IConnectionRegistry registry, IFormRepository formRepo, ISubmissionRepository submissionRepo, string defaultConnectionKey)
        {
            _registry = registry;
            _formRepo = formRepo;
            _submissionRepo = submissionRepo;
            _defaultConnectionKey = defaultConnectionKey;
        }

        // Backward-compatible overload — old callers without parameters keep working.
        public List<FieldOption> GetOptions(int formId, string fieldKey)
        {
            return GetOptions(formId, fieldKey, null);
        }

        /// <summary>
        /// [v20260531-DataGridSqlCols] Per-column lookup for DataGrid SELECT cells.
        /// When `columnKey` is provided, reads `widgetProps.columns[columnKey].
        /// optionsSql` (instead of the field's own `properties.optionsSql`) and
        /// runs it through the same SQL pipeline so a grid column can pick from
        /// a parent table (e.g. Order line item → Products).
        /// </summary>
        public List<FieldOption> GetColumnOptions(int formId, string fieldKey, string columnKey, IDictionary<string, object> parameters)
        {
            var options = new List<FieldOption>();
            if (formId <= 0 || string.IsNullOrWhiteSpace(fieldKey) || string.IsNullOrWhiteSpace(columnKey)) return options;
            try
            {
                var form = _formRepo.GetForm(formId);
                if (form == null || string.IsNullOrWhiteSpace(form.SchemaJson)) return options;
                var schema = JObject.Parse(form.SchemaJson);
                var fieldNode = FindField(schema, fieldKey);
                if (fieldNode == null) return options;

                var widgetProps = fieldNode["widgetProps"] as JObject ?? fieldNode["WidgetProps"] as JObject;
                if (widgetProps == null) return options;
                var cols = widgetProps["columns"] as JArray;
                if (cols == null) return options;

                JObject colNode = null;
                foreach (var c in cols.OfType<JObject>())
                {
                    if (string.Equals((string)c["key"], columnKey, StringComparison.OrdinalIgnoreCase))
                    { colNode = c; break; }
                }
                if (colNode == null) return options;

                // Synthesize a fieldProps-like object so we can reuse the same
                // SQL execution pipeline. Surface the column's options* keys
                // under the canonical names the SQL branch reads.
                var shim = new JObject
                {
                    ["optionsSource"]        = "sql",
                    ["optionsType"]          = colNode["optionsType"] ?? "sql",
                    ["optionsConnectionKey"] = colNode["optionsConnectionKey"] ?? colNode["connectionKey"] ?? "DashboardDatabase",
                    ["optionsDatabaseType"]  = colNode["optionsDatabaseType"],
                    ["optionsSql"]           = colNode["optionsSql"],
                    ["optionsDependsOn"]     = colNode["optionsDependsOn"],
                };
                // Reuse the existing SQL pipeline by calling the same private path
                // — but we're outside that method's scope here. Implement the
                // minimal SQL fetch inline to avoid an awkward refactor.
                var connectionKey = (string)shim["optionsConnectionKey"];
                if (string.IsNullOrWhiteSpace(connectionKey)) connectionKey = _defaultConnectionKey;
                var sql = (string)shim["optionsSql"];
                if (string.IsNullOrWhiteSpace(sql)) return options;

                using (var conn = _registry.GetConnection(connectionKey, (string)shim["optionsDatabaseType"], null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = _tokenParam.Replace(sql, "@$1");
                        cmd.CommandTimeout = 15;
                        var seenParams = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        foreach (Match m in _tokenParam.Matches(sql))
                        {
                            var pname = m.Groups[1].Value;
                            if (!seenParams.Add(pname)) continue;
                            object val = System.DBNull.Value;
                            if (parameters != null && parameters.TryGetValue(pname, out var v) && v != null) val = v;
                            var p = cmd.CreateParameter();
                            p.ParameterName = "@" + pname;
                            p.Value = val;
                            cmd.Parameters.Add(p);
                        }
                        using (var rdr = cmd.ExecuteReader())
                        {
                            while (rdr.Read())
                            {
                                var valueCol = rdr.IsDBNull(0) ? "" : Convert.ToString(rdr.GetValue(0));
                                string labelCol = valueCol;
                                if (rdr.FieldCount > 1 && !rdr.IsDBNull(1)) labelCol = Convert.ToString(rdr.GetValue(1));
                                options.Add(new FieldOption { Value = valueCol, Label = labelCol });
                            }
                        }
                    }
                }
            }
            catch { /* fail-soft: empty options */ }
            return options;
        }

        private static JObject FindField(JObject schema, string fieldKey)
        {
            var fields = schema["fields"] as JArray;
            if (fields == null) return null;
            foreach (var f in fields.OfType<JObject>())
            {
                if (string.Equals((string)f["key"], fieldKey, StringComparison.OrdinalIgnoreCase)) return f;
                if (string.Equals((string)f["type"], "Row", StringComparison.OrdinalIgnoreCase))
                {
                    var cols = f["columns"] as JArray;
                    if (cols == null) continue;
                    foreach (var c in cols.OfType<JObject>())
                    {
                        var inner = c["fields"] as JArray;
                        if (inner == null) continue;
                        foreach (var sub in inner.OfType<JObject>())
                            if (string.Equals((string)sub["key"], fieldKey, StringComparison.OrdinalIgnoreCase)) return sub;
                    }
                }
            }
            return null;
        }

        public List<FieldOption> GetOptions(int formId, string fieldKey, IDictionary<string, object> parameters)
        {
            var options = new List<FieldOption>();
            if (formId <= 0 || string.IsNullOrWhiteSpace(fieldKey)) return options;

            try
            {
                var form = _formRepo.GetForm(formId);
                if (form == null || string.IsNullOrWhiteSpace(form.SchemaJson)) return options;

                var schema = JObject.Parse(form.SchemaJson);
                var fieldProps = FindFieldProperties(schema, fieldKey);
                if (fieldProps == null) return options;

                var source = (string)fieldProps["optionsSource"];

                // [FormLookup v20260519-03] form-lookup branch — read submissions
                // of another form, map (valueField, labelField) → FieldOption.
                if (string.Equals(source, "form-lookup", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(source, "formlookup", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(source, "form_lookup", StringComparison.OrdinalIgnoreCase))
                {
                    return GetFormLookupOptions(fieldProps, parameters);
                }

                if (!string.Equals(source, "sql", StringComparison.OrdinalIgnoreCase)) return options;

                var optionsType   = (string)fieldProps["optionsType"];
                var connectionKey = (string)fieldProps["optionsConnectionKey"];
                var databaseType  = (string)fieldProps["optionsDatabaseType"];
                var sql           = (string)fieldProps["optionsSql"];

                // [DefaultConnFallback v20260519-04] Empty connectionKey falls back to
                // the platform's default alias (HostSetting MegaForm_Database_ConnectionAlias).
                // Pre-fix, missing key silently returned [] with no clue to the form author.
                if (string.IsNullOrWhiteSpace(connectionKey))
                    connectionKey = _defaultConnectionKey;

                if (string.IsNullOrWhiteSpace(connectionKey) || string.IsNullOrWhiteSpace(sql)) return options;

                var isStoredProc = string.Equals(optionsType, "storedproc", StringComparison.OrdinalIgnoreCase)
                                || string.Equals(optionsType, "sproc",      StringComparison.OrdinalIgnoreCase);

                // Inline SQL must be SELECT-only. Stored procs are name-only, but the name still
                // reaches the DB — restrict it to a plain [schema.]identifier (blocks xp_/system procs).
                if (!isStoredProc && IsDangerousQuery(sql)) return options;
                if (isStoredProc && !IsSafeProcName(sql)) return options;

                using (var conn = _registry.GetConnection(connectionKey, databaseType, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        if (isStoredProc)
                        {
                            cmd.CommandType = CommandType.StoredProcedure;
                            cmd.CommandText = sql.Trim();
                        }
                        else
                        {
                            cmd.CommandType = CommandType.Text;
                            cmd.CommandText = _tokenParam.Replace(sql, "@$1");
                        }
                        cmd.CommandTimeout = 10;

                        AddParameters(cmd, sql, parameters, isStoredProc);

                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                if (reader.FieldCount == 0) continue;
                                var val   = reader.GetValue(0);
                                var label = reader.FieldCount > 1 ? reader.GetValue(1) : val;
                                options.Add(new FieldOption
                                {
                                    Value = Convert.ToString(val, CultureInfo.InvariantCulture),
                                    Label = Convert.ToString(label, CultureInfo.InvariantCulture)
                                });
                            }
                        }
                    }
                }
            }
            catch { /* swallow — return empty list, renderer falls back to static options */ }

            return options;
        }

        // ─── form-lookup branch ─────────────────────────────────────────────
        // Read submissions of another form, project (valueField, labelField) into
        // FieldOption rows. Honors optional Status filter + a single field=param
        // filter so cascading still works (e.g. application form's job_id picker
        // filters Job Postings by location field).
        private List<FieldOption> GetFormLookupOptions(JToken fieldProps, IDictionary<string, object> parameters)
        {
            var result = new List<FieldOption>();
            if (_submissionRepo == null) return result;

            int lookupFormId = 0;
            try { lookupFormId = (int)fieldProps["optionsLookupFormId"]; } catch { }
            if (lookupFormId <= 0) return result;

            var valueField = (string)fieldProps["optionsLookupValueField"] ?? "submissionId";
            var labelField = (string)fieldProps["optionsLookupLabelField"];
            var statusFilter = (string)fieldProps["optionsLookupStatus"];
            var filterField  = (string)fieldProps["optionsLookupFilterField"];
            var filterParam  = (string)fieldProps["optionsLookupFilterParam"];

            // Pull up to 500 submissions of the parent form. Optional Status filter
            // narrows server-side; field filter (filterField=:filterParam) narrows
            // client-side after deserialising data.
            try
            {
                var page = _submissionRepo.List(lookupFormId,
                    status: string.IsNullOrWhiteSpace(statusFilter) ? null : statusFilter,
                    search: null, dateFrom: null, dateTo: null,
                    pageIndex: 0, pageSize: 500);

                string filterValue = null;
                if (!string.IsNullOrWhiteSpace(filterField) && !string.IsNullOrWhiteSpace(filterParam) && parameters != null)
                {
                    if (parameters.TryGetValue(filterParam, out var v) && v != null)
                        filterValue = Convert.ToString(v, CultureInfo.InvariantCulture);
                }

                foreach (var sub in page.Items ?? new System.Collections.Generic.List<SubmissionInfo>())
                {
                    JObject data = null;
                    if (!string.IsNullOrWhiteSpace(sub.DataJson))
                    {
                        try { data = JObject.Parse(sub.DataJson); } catch { data = null; }
                    }

                    if (filterValue != null)
                    {
                        var actual = data != null ? Convert.ToString(data[filterField], CultureInfo.InvariantCulture) : null;
                        if (!string.Equals(actual ?? string.Empty, filterValue, StringComparison.OrdinalIgnoreCase)) continue;
                    }

                    string value;
                    if (string.Equals(valueField, "submissionId", StringComparison.OrdinalIgnoreCase)
                        || string.IsNullOrWhiteSpace(valueField))
                    {
                        value = sub.SubmissionId.ToString(CultureInfo.InvariantCulture);
                    }
                    else
                    {
                        value = data != null ? Convert.ToString(data[valueField], CultureInfo.InvariantCulture) : null;
                    }

                    string label;
                    if (string.IsNullOrWhiteSpace(labelField))
                    {
                        label = value;
                    }
                    else if (string.Equals(labelField, "submissionId", StringComparison.OrdinalIgnoreCase))
                    {
                        label = "#" + sub.SubmissionId.ToString(CultureInfo.InvariantCulture);
                    }
                    else
                    {
                        label = data != null ? Convert.ToString(data[labelField], CultureInfo.InvariantCulture) : value;
                    }

                    if (string.IsNullOrWhiteSpace(value)) continue;
                    result.Add(new FieldOption { Value = value, Label = string.IsNullOrEmpty(label) ? value : label });
                }
            }
            catch { /* swallow — empty list lets renderer show its own fallback */ }

            return result;
        }

        // ─── parameter binding ───────────────────────────────────────────────
        private static void AddParameters(
            DbCommand cmd,
            string originalSql,
            IDictionary<string, object> parameters,
            bool isStoredProc)
        {
            // 1. Add caller-supplied values
            if (parameters != null)
            {
                foreach (var kv in parameters)
                {
                    if (string.IsNullOrWhiteSpace(kv.Key)) continue;
                    var p = cmd.CreateParameter();
                    p.ParameterName = kv.Key.StartsWith("@", StringComparison.Ordinal) ? kv.Key : ("@" + kv.Key);
                    p.Value = kv.Value ?? DBNull.Value;
                    cmd.Parameters.Add(p);
                }
            }

            // 2. For inline SQL, auto-bind any :token in the original text that wasn't supplied
            //    (prevents "must declare scalar variable @x" when user not yet selected parent value).
            if (!isStoredProc)
            {
                var matches = _tokenParam.Matches(originalSql);
                for (int i = 0; i < matches.Count; i++)
                {
                    var name = "@" + matches[i].Groups[1].Value;
                    bool exists = false;
                    foreach (DbParameter existing in cmd.Parameters)
                    {
                        if (string.Equals(existing.ParameterName, name, StringComparison.OrdinalIgnoreCase))
                        { exists = true; break; }
                    }
                    if (!exists)
                    {
                        var mp = cmd.CreateParameter();
                        mp.ParameterName = name;
                        mp.Value = DBNull.Value;
                        cmd.Parameters.Add(mp);
                    }
                }
            }
        }

        // ─── helpers ─────────────────────────────────────────────────────────
        private static JObject FindFieldProperties(JToken node, string fieldKey)
        {
            if (node == null) return null;
            if (node is JObject obj)
            {
                var keyToken = obj["key"] ?? obj["Key"];
                if (keyToken != null && string.Equals((string)keyToken, fieldKey, StringComparison.OrdinalIgnoreCase))
                {
                    return (obj["properties"] as JObject) ?? (obj["Properties"] as JObject);
                }
                foreach (var prop in obj.Properties())
                {
                    var hit = FindFieldProperties(prop.Value, fieldKey);
                    if (hit != null) return hit;
                }
            }
            else if (node is JArray arr)
            {
                foreach (var child in arr)
                {
                    var hit = FindFieldProperties(child, fieldKey);
                    if (hit != null) return hit;
                }
            }
            return null;
        }

        // [SecFix P1-4] Word-boundary danger scan for the "read options" path. The old version
        // matched "INSERT " with a trailing SPACE, so INSERT\tINTO / INSERT\nINTO (tab/newline
        // obfuscation) slipped through. This is a read-only surface — legitimate config is a
        // single SELECT — so we also reject statement-stacking and comments outright.
        private static readonly System.Text.RegularExpressions.Regex _dangerRx =
            new System.Text.RegularExpressions.Regex(
                @"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE|DENY|MERGE|BULK|BACKUP|RESTORE|SHUTDOWN|RECONFIGURE|WAITFOR|OPENROWSET|OPENQUERY|OPENDATASOURCE)\b|\bxp_",
                System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        private static bool IsDangerousQuery(string sql)
        {
            if (string.IsNullOrWhiteSpace(sql)) return true;
            var body = sql.Trim().TrimEnd(';');
            if (body.IndexOf(';') >= 0) return true;                                   // no statement stacking
            if (body.IndexOf("--", StringComparison.Ordinal) >= 0 ||
                body.IndexOf("/*", StringComparison.Ordinal) >= 0) return true;        // no comment obfuscation
            return _dangerRx.IsMatch(body);
        }

        // [SecFix P1-4] Stored-proc mode executes a proc NAME (no arbitrary body) but the name
        // still reaches the DB verbatim — restrict it to a plain [schema.]identifier so it can't
        // carry a system proc reference or injected fragment.
        private static readonly System.Text.RegularExpressions.Regex _procNameRx =
            new System.Text.RegularExpressions.Regex(
                @"^\s*\[?[A-Za-z_][A-Za-z0-9_]*\]?(\s*\.\s*\[?[A-Za-z_][A-Za-z0-9_]*\]?)?\s*$",
                System.Text.RegularExpressions.RegexOptions.Compiled);

        private static bool IsSafeProcName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return false;
            if (name.IndexOf("xp_", StringComparison.OrdinalIgnoreCase) >= 0) return false;
            return _procNameRx.IsMatch(name);
        }
    }
}
