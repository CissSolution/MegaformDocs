using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    // ══════════════════════════════════════════════════════════════════════════
    //  DataRepeaterService  v20260428-01
    //  Shared across DNN / Oqtane / Web.  C# 7.3 compatible (net472).
    //
    //  Security:
    //    - SQL queries come ONLY from server-side form schema, never from client.
    //    - All user-provided values are parameterized.
    //    - Only SELECT statements allowed; DDL/DML blocked.
    //    - Row cap enforced server-side.
    //    - Connection strings resolved via IConnectionRegistry (never from client).
    // ══════════════════════════════════════════════════════════════════════════

    public class DataRepeaterService
    {
        private readonly IConnectionRegistry _registry;
        private readonly IFormRepository _formRepo;
        private readonly ISubmissionRepository _subs;   // optional — only needed for the "megaform_submissions" source

        private static readonly Regex _dangerousPattern = new Regex(
            @"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE|MERGE)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex _tokenParam = new Regex(
            @":(\w+)", RegexOptions.Compiled);

        private const int ABSOLUTE_MAX_ROWS = 5000;

        public DataRepeaterService(IConnectionRegistry registry, IFormRepository formRepo, ISubmissionRepository subs = null)
        {
            _registry = registry;
            _formRepo = formRepo;
            _subs = subs;
        }

        // ─── Public: Execute Query ────────────────────────────────────────────

        public DataRepeaterQueryResult ExecuteQuery(DataRepeaterQueryRequest request)
        {
            var sw = Stopwatch.StartNew();
            var result = new DataRepeaterQueryResult { Page = request.Page, PageSize = request.PageSize };

            try
            {
                // 1. Load form + extract widget config
                var config = ExtractWidgetConfig(request.FormId, request.WidgetKey);
                if (config == null)
                {
                    result.Error = "Widget configuration not found.";
                    return result;
                }

                // 1a. MegaForm Submissions source — read submissions through the standard Core
                //     submission repository (the same path IMegaFormClient.Submissions.FindAsync uses),
                //     project ONLY whitelisted field keys, enforce tenant + status. NEVER touches SQL.
                if (string.Equals(config.DataSource, "megaform_submissions", StringComparison.OrdinalIgnoreCase))
                {
                    result = ExecuteMegaformSubmissionsQuery(config, request);
                    sw.Stop();
                    result.ExecutionMs = sw.ElapsedMilliseconds;
                    return result;
                }

                // 2. Determine which query to run
                string sql;
                if (request.Level <= 0 || string.IsNullOrWhiteSpace(request.ParentId))
                {
                    sql = config.DataSource == "storedproc"
                        ? BuildStoredProcCall(config.MasterQuery)
                        : config.MasterQuery;
                }
                else
                {
                    var levelIdx = Math.Min(request.Level - 1, config.DetailLevels.Count - 1);
                    if (levelIdx < 0 || levelIdx >= config.DetailLevels.Count)
                    {
                        result.Error = "No detail query configured for level " + request.Level + ".";
                        return result;
                    }
                    var lvl = config.DetailLevels[levelIdx];
                    sql = config.DataSource == "storedproc"
                        ? BuildStoredProcCall(lvl.Query)
                        : lvl.Query;
                }

                if (string.IsNullOrWhiteSpace(sql))
                {
                    result.Error = "Query is empty.";
                    return result;
                }

                // 3. Security: block non-SELECT
                if (config.DataSource != "storedproc" && IsDangerousQuery(sql))
                {
                    result.Error = "Only SELECT queries are allowed.";
                    return result;
                }

                // 4. Build parameters
                var parameters = BuildParameters(request);

                // 5. Apply pagination (wrap query)
                int maxRows = config.MaxRows > 0
                    ? Math.Min(config.MaxRows, ABSOLUTE_MAX_ROWS)
                    : ABSOLUTE_MAX_ROWS;
                int pageSize = request.PageSize > 0
                    ? Math.Min(request.PageSize, maxRows)
                    : maxRows;
                int offset = Math.Max(0, (request.Page - 1)) * pageSize;

                // 6. Execute
                using (var conn = _registry.GetConnection(
                    config.ConnectionKey, config.DatabaseType, null))
                {
                    conn.Open();
                    result = ExecuteSql(conn, sql, parameters, offset, pageSize, maxRows,
                        request.SortCol, request.SortDir, config.DataSource == "storedproc");
                    result.Page = request.Page;
                    result.PageSize = pageSize;
                }
            }
            catch (Exception ex)
            {
                result.Error = "Query execution failed: " + ex.Message;
            }

            sw.Stop();
            result.ExecutionMs = sw.ElapsedMilliseconds;
            return result;
        }

        // ─── MegaForm Submissions source ──────────────────────────────────────
        // Reads a form's submissions via ISubmissionRepository.List (the same call the
        // SDK's IMegaFormClient.Submissions.FindAsync makes — Core cannot reference the SDK
        // assembly because the SDK references Core, so we use the identical repo contract).
        // Privacy + tenant safety are enforced HERE because the repo/SDK do not scope reads.
        private DataRepeaterQueryResult ExecuteMegaformSubmissionsQuery(
            DataRepeaterWidgetConfig config, DataRepeaterQueryRequest request)
        {
            var result = new DataRepeaterQueryResult { Page = Math.Max(1, request.Page) };

            if (_subs == null)
            {
                result.Error = "Submissions data source is not available on this host.";
                return result;
            }

            int targetFormId = config.SubmissionsFormId > 0 ? config.SubmissionsFormId : request.FormId;

            // PRIVACY GATE — only whitelisted field keys ever leave the server.
            // Accept either the array (FieldWhitelist, from JSON edit / checkbox UI) or a
            // comma-separated string (FieldWhitelistCsv, from the simple builder text field).
            var whitelistSource = (config.FieldWhitelist != null && config.FieldWhitelist.Count > 0)
                ? config.FieldWhitelist
                : SplitCsv(config.FieldWhitelistCsv);
            var whitelist = new List<string>();
            foreach (var raw in whitelistSource)
            {
                var key = (raw ?? string.Empty).Trim();
                if (key.Length == 0) continue;
                bool dup = false;
                foreach (var existing in whitelist)
                    if (string.Equals(existing, key, StringComparison.OrdinalIgnoreCase)) { dup = true; break; }
                if (!dup) whitelist.Add(key);
            }
            if (whitelist.Count == 0)
            {
                // Nothing whitelisted ⇒ nothing public (safe default).
                result.TotalRows = 0;
                return result;
            }

            // Optional submission-Status filter ("" / "all" = no filter).
            string status = (config.StatusFilter ?? string.Empty).Trim();
            if (status.Length == 0 || string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
                status = null;

            // TENANT GUARD — the target form must belong to the SAME portal as the host form
            // that embeds this widget (the repo/SDK do NOT scope by portal).
            var targetForm = _formRepo.GetForm(targetFormId);
            if (targetForm == null)
            {
                result.TotalRows = 0;
                return result;
            }
            // TENANT GUARD — STRICT portal equality. PortalId 0 is a REAL tenant
            // (DNN's default/primary portal is 0), NOT a wildcard — never special-case it
            // (that fails open). Deny when the host form is missing or on a different portal.
            var hostForm = _formRepo.GetForm(request.FormId);
            if (hostForm == null || hostForm.PortalId != targetForm.PortalId)
            {
                result.Error = "Cross-tenant access denied.";
                return result;
            }

            var labels = BuildFieldLabelMap(targetForm.SchemaJson);

            int page = Math.Max(1, request.Page);
            // Server-side row cap (defense-in-depth — the SQL path clamps too; do not rely on
            // callers/controllers to clamp this privacy-sensitive path, e.g. ExportCsv asks 5000).
            int cap = config.MaxRows > 0 ? Math.Min(config.MaxRows, ABSOLUTE_MAX_ROWS) : ABSOLUTE_MAX_ROWS;
            int pageSize = request.PageSize > 0
                ? request.PageSize
                : (config.PageSize > 0 ? config.PageSize : 25);
            if (pageSize > cap) pageSize = cap;
            int pageIndex = page - 1;

            var listed = _subs.List(targetFormId, status, null, null, null, pageIndex, pageSize);
            var rows = listed.Items ?? new List<SubmissionInfo>();
            int total = listed.TotalCount;

            // Columns: token Name = field key; Label = friendly header (header shown client-side).
            result.Columns = new List<DataRepeaterColumn>();
            foreach (var key in whitelist)
            {
                string label;
                labels.TryGetValue(key, out label);
                result.Columns.Add(new DataRepeaterColumn
                {
                    Name = key,
                    Label = string.IsNullOrWhiteSpace(label) ? key : label,
                    DataType = "string"
                });
            }

            result.Rows = new List<object[]>();
            foreach (var s in rows)
            {
                if (s != null && s.IsSpam) continue;   // never expose spam-flagged submissions publicly
                var map = ParseSubmissionData(s);
                var row = new object[whitelist.Count];
                for (int i = 0; i < whitelist.Count; i++)
                {
                    object v;
                    row[i] = (map != null && map.TryGetValue(whitelist[i], out v)) ? v : null;
                }
                result.Rows.Add(row);
            }

            result.TotalRows = total;
            result.Page = page;
            result.PageSize = pageSize;
            result.HasMore = ((long)page * pageSize) < total;
            return result;
        }

        // Build a key→label map from the target form schema (top-level + paged + row columns).
        // Plus three always-available pseudo-keys for list chrome: __id, __status, __date.
        private Dictionary<string, string> BuildFieldLabelMap(string schemaJson)
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                { "__id", "ID" },
                { "__status", "Status" },
                { "__date", "Date" }
            };
            if (string.IsNullOrWhiteSpace(schemaJson)) return map;
            try
            {
                var schema = JObject.Parse(schemaJson);
                CollectFieldLabels(schema["fields"] as JArray, map);
                var pages = schema["pages"] as JArray;
                if (pages != null)
                    foreach (var pg in pages)
                        CollectFieldLabels(pg["fields"] as JArray, map);
            }
            catch { /* leave defaults */ }
            return map;
        }

        private void CollectFieldLabels(JArray fields, Dictionary<string, string> map)
        {
            if (fields == null) return;
            foreach (var f in fields)
            {
                var key = f.Value<string>("key");
                if (!string.IsNullOrWhiteSpace(key) && !map.ContainsKey(key))
                {
                    var label = f.Value<string>("label");
                    map[key] = string.IsNullOrWhiteSpace(label) ? key : label;
                }
                var cols = f["columns"] as JArray;
                if (cols != null)
                    foreach (var c in cols)
                        CollectFieldLabels(c["fields"] as JArray, map);
            }
        }

        // Parse one submission's DataJson into a key→display-value map, plus pseudo-keys.
        private Dictionary<string, object> ParseSubmissionData(SubmissionInfo s)
        {
            var map = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (s == null) return map;
            map["__id"] = s.SubmissionId;
            map["__status"] = s.Status;
            map["__date"] = s.SubmittedOnUtc.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            if (!string.IsNullOrWhiteSpace(s.DataJson))
            {
                try
                {
                    var jo = JObject.Parse(s.DataJson);
                    foreach (var p in jo.Properties())
                        map[p.Name] = StringifyToken(p.Value);
                }
                catch { /* malformed DataJson → just the pseudo-keys */ }
            }
            return map;
        }

        private static List<string> SplitCsv(string csv)
        {
            var list = new List<string>();
            if (string.IsNullOrWhiteSpace(csv)) return list;
            foreach (var part in csv.Split(','))
            {
                var p = part.Trim();
                if (p.Length > 0) list.Add(p);
            }
            return list;
        }

        private static object StringifyToken(JToken t)
        {
            if (t == null) return null;
            switch (t.Type)
            {
                case JTokenType.Null:
                    return null;
                case JTokenType.String:
                    return t.Value<string>();
                case JTokenType.Integer:
                case JTokenType.Float:
                case JTokenType.Boolean:
                case JTokenType.Date:
                    return t.ToString();
                case JTokenType.Array:
                    var parts = new List<string>();
                    foreach (var c in (JArray)t)
                        parts.Add(c.Type == JTokenType.Object || c.Type == JTokenType.Array
                            ? c.ToString(Formatting.None) : c.ToString());
                    return string.Join(", ", parts);
                case JTokenType.Object:
                    return t.ToString(Formatting.None);
                default:
                    return t.ToString();
            }
        }

        // ─── Public: Ad-hoc SQL preview (used by unified widget designer) ────
        // [B38] Lets designer popups run an arbitrary SELECT against a known
        // connectionKey (defaults DashboardDatabase) and stream back columns +
        // up to 25 rows for live preview. Same SELECT-only guardrail as the
        // main Query path. No widget config lookup — caller supplies SQL.
        public DataRepeaterQueryResult ExecutePreviewSql(
            string sql, string connectionKey, string databaseType,
            int page, int pageSize, Dictionary<string, object> parameters)
        {
            var sw = Stopwatch.StartNew();
            var result = new DataRepeaterQueryResult { Page = page, PageSize = pageSize };
            try
            {
                if (string.IsNullOrWhiteSpace(sql))
                {
                    result.Error = "SQL is empty.";
                    return result;
                }
                if (IsDangerousQuery(sql))
                {
                    result.Error = "Only SELECT queries are allowed.";
                    return result;
                }
                if (string.IsNullOrWhiteSpace(connectionKey))
                {
                    connectionKey = "DashboardDatabase";
                }
                int maxRows = Math.Min(ABSOLUTE_MAX_ROWS, 200);
                int effectivePageSize = pageSize > 0
                    ? Math.Min(pageSize, maxRows)
                    : Math.Min(25, maxRows);
                int offset = Math.Max(0, (page - 1)) * effectivePageSize;
                var prms = parameters ?? new Dictionary<string, object>();
                using (var conn = _registry.GetConnection(connectionKey, databaseType, null))
                {
                    conn.Open();
                    result = ExecuteSql(conn, sql, prms, offset, effectivePageSize, maxRows,
                        null, null, false);
                    result.Page = page;
                    result.PageSize = effectivePageSize;
                }
            }
            catch (Exception ex)
            {
                result.Error = "Preview failed: " + ex.Message;
            }
            sw.Stop();
            result.ExecutionMs = sw.ElapsedMilliseconds;
            return result;
        }

        // ─── Public: Execute Filter Options Query ─────────────────────────────

        public List<DataRepeaterFilterOption> ExecuteFilterQuery(
            int formId, string widgetKey, string filterKey, string contextJson = null)
        {
            var options = new List<DataRepeaterFilterOption>();
            try
            {
                var config = ExtractWidgetConfig(formId, widgetKey);
                if (config == null) return options;

                var filter = config.Filters.FirstOrDefault(
                    f => string.Equals(f.Key, filterKey, StringComparison.OrdinalIgnoreCase));
                if (filter == null || string.IsNullOrWhiteSpace(filter.Query)) return options;

                if (IsDangerousQuery(filter.Query)) return options;

                using (var conn = _registry.GetConnection(config.ConnectionKey, config.DatabaseType, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = _tokenParam.Replace(filter.Query, "@$1");
                        cmd.CommandTimeout = 10;

                        var parameters = ParseJsonParameters(contextJson);
                        foreach (var kv in parameters)
                        {
                            var p = cmd.CreateParameter();
                            p.ParameterName = kv.Key.StartsWith("@", StringComparison.Ordinal)
                                ? kv.Key
                                : ("@" + kv.Key);
                            p.Value = kv.Value ?? DBNull.Value;
                            cmd.Parameters.Add(p);
                        }

                        var referencedParams = _tokenParam.Matches(filter.Query);
                        for (int pi = 0; pi < referencedParams.Count; pi++)
                        {
                            var paramName = "@" + referencedParams[pi].Groups[1].Value;
                            bool exists = false;
                            foreach (DbParameter existing in cmd.Parameters)
                            {
                                if (string.Equals(existing.ParameterName, paramName, StringComparison.OrdinalIgnoreCase))
                                {
                                    exists = true;
                                    break;
                                }
                            }
                            if (!exists)
                            {
                                var mp = cmd.CreateParameter();
                                mp.ParameterName = paramName;
                                mp.Value = DBNull.Value;
                                cmd.Parameters.Add(mp);
                            }
                        }

                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                var val = reader.GetValue(0);
                                var label = reader.FieldCount > 1 ? reader.GetValue(1) : val;
                                options.Add(new DataRepeaterFilterOption
                                {
                                    Value = Convert.ToString(val, CultureInfo.InvariantCulture),
                                    Label = Convert.ToString(label, CultureInfo.InvariantCulture)
                                });
                            }
                        }
                    }
                }
            }
            catch { /* swallow — return empty list */ }
            return options;
        }

        public List<DataRepeaterFilterOption> ExecuteGridColumnOptionsQuery(
            int formId, string widgetKey, string columnKey, string contextJson = null)
        {
            var options = new List<DataRepeaterFilterOption>();
            try
            {
                if (formId <= 0 || string.IsNullOrWhiteSpace(widgetKey) || string.IsNullOrWhiteSpace(columnKey))
                    return options;

                var widget = FindWidgetToken(formId, widgetKey) as JObject;
                var widgetProps = widget?["widgetProps"] as JObject;
                if (widgetProps == null) return options;

                var columns = widgetProps["columns"] as JArray;
                if (columns == null || columns.Count == 0) return options;

                JObject column = null;
                for (int i = 0; i < columns.Count; i++)
                {
                    var item = columns[i] as JObject;
                    if (item == null) continue;
                    var key = item.Value<string>("key");
                    if (string.Equals(key, columnKey, StringComparison.OrdinalIgnoreCase))
                    {
                        column = item;
                        break;
                    }
                }
                if (column == null) return options;

                var optionsSource = (column.Value<string>("optionsSource") ?? string.Empty).Trim();
                if (!string.Equals(optionsSource, "sql", StringComparison.OrdinalIgnoreCase))
                    return options;

                var sqlOrProc = (column.Value<string>("optionsSql") ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(sqlOrProc))
                    return options;

                var optionsType = (column.Value<string>("optionsType") ?? "sql").Trim();
                var connectionKey = (column.Value<string>("optionsConnectionKey") ?? widgetProps.Value<string>("connectionKey") ?? string.Empty).Trim();
                var databaseType = (column.Value<string>("optionsDatabaseType") ?? widgetProps.Value<string>("databaseType") ?? string.Empty).Trim();

                return ExecuteOptionsQuery(connectionKey, databaseType, sqlOrProc, optionsType, contextJson);
            }
            catch
            {
                return options;
            }
        }

        // ─── Public: Export CSV ───────────────────────────────────────────────

        public string ExportCsv(DataRepeaterQueryRequest request)
        {
            // Override pagination to get all rows
            request.Page = 1;
            request.PageSize = ABSOLUTE_MAX_ROWS;
            var data = ExecuteQuery(request);
            if (!string.IsNullOrEmpty(data.Error) || data.Columns.Count == 0) return "";

            var sb = new StringBuilder();

            // Header (friendly Label when present — matches the on-screen table for the submissions source)
            sb.AppendLine(string.Join(",", data.Columns.Select(c => EscapeCsv(string.IsNullOrEmpty(c.Label) ? c.Name : c.Label))));

            // Rows
            foreach (var row in data.Rows)
            {
                var cells = new List<string>();
                for (int i = 0; i < row.Length; i++)
                {
                    cells.Add(EscapeCsv(Convert.ToString(row[i] ?? "", CultureInfo.InvariantCulture)));
                }
                sb.AppendLine(string.Join(",", cells));
            }
            return sb.ToString();
        }

        // ─── Private: Extract widget config from form schema ──────────────────

        private DataRepeaterWidgetConfig ExtractWidgetConfig(int formId, string widgetKey)
        {
            var widget = FindWidgetToken(formId, widgetKey);
            var wp = widget?["widgetProps"];
            if (wp == null) return null;
            try
            {
                var cfg = JsonConvert.DeserializeObject<DataRepeaterWidgetConfig>(wp.ToString());
                if (cfg != null) cfg.Normalize();
                return cfg;
            }
            catch { /* parse error */ }
            return null;
        }

        private JToken FindWidgetToken(int formId, string widgetKey)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(widgetKey)) return null;

            var form = _formRepo.GetForm(formId);
            if (form == null || string.IsNullOrWhiteSpace(form.SchemaJson)) return null;

            try
            {
                var schema = JObject.Parse(form.SchemaJson);

                var pages = schema["pages"] as JArray;
                if (pages != null)
                {
                    foreach (var page in pages)
                    {
                        var fields = page["fields"] as JArray;
                        if (fields == null) continue;
                        var found = FindField(fields, widgetKey);
                        if (found != null) return found;
                    }
                }

                var rootFields = schema["fields"] as JArray;
                if (rootFields != null)
                {
                    var found = FindField(rootFields, widgetKey);
                    if (found != null) return found;
                }
            }
            catch { }
            return null;
        }

        private JToken FindField(JArray fields, string key)
        {
            foreach (var field in fields)
            {
                var fkey = field.Value<string>("key");
                if (string.Equals(fkey, key, StringComparison.OrdinalIgnoreCase))
                    return field;

                // Recurse into rows/columns
                var columns = field["columns"] as JArray;
                if (columns != null)
                {
                    foreach (var col in columns)
                    {
                        var subFields = col["fields"] as JArray;
                        if (subFields != null)
                        {
                            var found = FindField(subFields, key);
                            if (found != null) return found;
                        }
                    }
                }
            }
            return null;
        }

        // ─── Private: Execute SQL ─────────────────────────────────────────────

        private DataRepeaterQueryResult ExecuteSql(
            DbConnection conn, string sql, Dictionary<string, object> parameters,
            int offset, int limit, int maxRows, string sortCol, string sortDir,
            bool isStoredProc)
        {
            var result = new DataRepeaterQueryResult();

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
                    // Normalize :param → @param (SQL Server uses @, SQLite/Postgres accept both)
                    cmd.CommandText = _tokenParam.Replace(sql, "@$1");
                }
                cmd.CommandTimeout = 30;

                // Add parameters from request (filters, parentId, etc.)
                foreach (var kv in parameters)
                {
                    var p = cmd.CreateParameter();
                    p.ParameterName = kv.Key.StartsWith("@") ? kv.Key : ("@" + kv.Key);
                    p.Value = kv.Value ?? DBNull.Value;
                    cmd.Parameters.Add(p);
                }

                // Auto-add any @param tokens in SQL that are missing from parameters dict
                // (e.g. filter not yet selected → provide DBNull so query doesn't crash)
                var sqlText = cmd.CommandText;
                var referencedParams = _tokenParam.Matches(sql);
                for (int pi = 0; pi < referencedParams.Count; pi++)
                {
                    var paramName = "@" + referencedParams[pi].Groups[1].Value;
                    bool exists = false;
                    foreach (DbParameter existing in cmd.Parameters)
                    {
                        if (string.Equals(existing.ParameterName, paramName, StringComparison.OrdinalIgnoreCase))
                        { exists = true; break; }
                    }
                    if (!exists)
                    {
                        var mp = cmd.CreateParameter();
                        mp.ParameterName = paramName;
                        mp.Value = DBNull.Value;
                        cmd.Parameters.Add(mp);
                    }
                }

                using (var reader = cmd.ExecuteReader())
                {
                    // Read column metadata
                    for (int i = 0; i < reader.FieldCount; i++)
                    {
                        result.Columns.Add(new DataRepeaterColumn
                        {
                            Name = reader.GetName(i),
                            DataType = MapDataType(reader.GetFieldType(i))
                        });
                    }

                    // Read all rows (up to maxRows) — we read all to get TotalRows
                    var allRows = new List<object[]>();
                    int rowCount = 0;
                    while (reader.Read() && rowCount < maxRows)
                    {
                        var row = new object[reader.FieldCount];
                        for (int i = 0; i < reader.FieldCount; i++)
                        {
                            var val = reader.GetValue(i);
                            row[i] = val == DBNull.Value ? null : val;
                        }
                        allRows.Add(row);
                        rowCount++;
                    }

                    // Sort in memory if requested (simple approach)
                    if (!string.IsNullOrWhiteSpace(sortCol))
                    {
                        int colIdx = -1;
                        for (int i = 0; i < result.Columns.Count; i++)
                        {
                            if (string.Equals(result.Columns[i].Name, sortCol, StringComparison.OrdinalIgnoreCase))
                            { colIdx = i; break; }
                        }
                        if (colIdx >= 0)
                        {
                            bool desc = string.Equals(sortDir, "desc", StringComparison.OrdinalIgnoreCase);
                            allRows.Sort((a, b) =>
                            {
                                var va = a[colIdx] as IComparable;
                                var vb = b[colIdx] as IComparable;
                                if (va == null && vb == null) return 0;
                                if (va == null) return desc ? 1 : -1;
                                if (vb == null) return desc ? -1 : 1;
                                int cmp = va.CompareTo(vb);
                                return desc ? -cmp : cmp;
                            });
                        }
                    }

                    result.TotalRows = allRows.Count;

                    // Apply pagination
                    if (offset > 0 || limit < allRows.Count)
                    {
                        int start = Math.Min(offset, allRows.Count);
                        int take = Math.Min(limit, allRows.Count - start);
                        result.Rows = allRows.GetRange(start, take);
                    }
                    else
                    {
                        result.Rows = allRows;
                    }
                    result.HasMore = (offset + limit) < allRows.Count;
                }
            }
            return result;
        }

        // ─── Private: Build Parameters ────────────────────────────────────────

        private Dictionary<string, object> BuildParameters(DataRepeaterQueryRequest request)
        {
            var dict = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

            // :parentId always available
            if (!string.IsNullOrWhiteSpace(request.ParentId))
                dict["parentId"] = request.ParentId;

            foreach (var kv in ParseJsonParameters(request.FilterJson))
            {
                dict[kv.Key] = kv.Value;
            }
            return dict;
        }

        private Dictionary<string, object> ParseJsonParameters(string json)
        {
            var dict = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrWhiteSpace(json)) return dict;

            try
            {
                var filters = JsonConvert.DeserializeObject<Dictionary<string, string>>(json);
                if (filters != null)
                {
                    foreach (var kv in filters)
                    {
                        if (!string.IsNullOrWhiteSpace(kv.Key))
                            dict[kv.Key] = kv.Value ?? "";
                    }
                }
            }
            catch
            {
                // Ignore invalid JSON and return empty parameter bag.
            }

            return dict;
        }

        private List<DataRepeaterFilterOption> ExecuteOptionsQuery(
            string connectionKey, string databaseType, string sqlOrProc, string optionsType, string contextJson)
        {
            var options = new List<DataRepeaterFilterOption>();
            if (string.IsNullOrWhiteSpace(sqlOrProc)) return options;

            var isStoredProc = string.Equals(optionsType, "storedproc", StringComparison.OrdinalIgnoreCase)
                || string.Equals(optionsType, "sproc", StringComparison.OrdinalIgnoreCase);

            if (!isStoredProc && IsDangerousQuery(sqlOrProc)) return options;

            using (var conn = _registry.GetConnection(connectionKey, databaseType, null))
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandTimeout = 10;
                    if (isStoredProc)
                    {
                        cmd.CommandType = CommandType.StoredProcedure;
                        cmd.CommandText = BuildStoredProcCall(sqlOrProc);
                    }
                    else
                    {
                        cmd.CommandType = CommandType.Text;
                        cmd.CommandText = _tokenParam.Replace(sqlOrProc, "@$1");
                    }

                    var parameters = ParseJsonParameters(contextJson);
                    foreach (var kv in parameters)
                    {
                        var p = cmd.CreateParameter();
                        p.ParameterName = kv.Key.StartsWith("@", StringComparison.Ordinal) ? kv.Key : ("@" + kv.Key);
                        p.Value = kv.Value ?? DBNull.Value;
                        cmd.Parameters.Add(p);
                    }

                    if (!isStoredProc)
                    {
                        var referencedParams = _tokenParam.Matches(sqlOrProc);
                        for (int pi = 0; pi < referencedParams.Count; pi++)
                        {
                            var paramName = "@" + referencedParams[pi].Groups[1].Value;
                            bool exists = false;
                            foreach (DbParameter existing in cmd.Parameters)
                            {
                                if (string.Equals(existing.ParameterName, paramName, StringComparison.OrdinalIgnoreCase))
                                {
                                    exists = true;
                                    break;
                                }
                            }
                            if (!exists)
                            {
                                var mp = cmd.CreateParameter();
                                mp.ParameterName = paramName;
                                mp.Value = DBNull.Value;
                                cmd.Parameters.Add(mp);
                            }
                        }
                    }

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var val = reader.GetValue(0);
                            var label = reader.FieldCount > 1 ? reader.GetValue(1) : val;
                            options.Add(new DataRepeaterFilterOption
                            {
                                Value = Convert.ToString(val, CultureInfo.InvariantCulture),
                                Label = Convert.ToString(label, CultureInfo.InvariantCulture)
                            });
                        }
                    }
                }
            }

            return options;
        }

        // ─── Private: Security ────────────────────────────────────────────────

        private bool IsDangerousQuery(string sql)
        {
            // Strip string literals and comments to avoid false positives
            var stripped = Regex.Replace(sql, @"'[^']*'", "''");
            stripped = Regex.Replace(stripped, @"--[^\r\n]*", "");
            stripped = Regex.Replace(stripped, @"/\*.*?\*/", "", RegexOptions.Singleline);
            return _dangerousPattern.IsMatch(stripped);
        }

        private string BuildStoredProcCall(string procName)
        {
            // For stored procs, just return the clean name
            if (string.IsNullOrWhiteSpace(procName)) return null;
            return procName.Trim();
        }

        // ─── Private: Helpers ─────────────────────────────────────────────────

        private static string MapDataType(Type type)
        {
            if (type == null) return "string";
            var tc = Type.GetTypeCode(type);
            switch (tc)
            {
                case TypeCode.Int16:
                case TypeCode.Int32:
                case TypeCode.Int64:
                case TypeCode.Single:
                case TypeCode.Double:
                case TypeCode.Decimal:
                case TypeCode.UInt16:
                case TypeCode.UInt32:
                case TypeCode.UInt64:
                case TypeCode.Byte:
                case TypeCode.SByte:
                    return "number";
                case TypeCode.DateTime:
                    return "date";
                case TypeCode.Boolean:
                    return "bool";
                default:
                    return "string";
            }
        }

        private static string EscapeCsv(string value)
        {
            if (value == null) return "";
            if (value.IndexOfAny(new[] { ',', '"', '\n', '\r' }) >= 0)
                return "\"" + value.Replace("\"", "\"\"") + "\"";
            return value;
        }
    }

    // ── Filter option model ───────────────────────────────────────────────────
    public class DataRepeaterFilterOption
    {
        public string Value { get; set; }
        public string Label { get; set; }
    }
}
