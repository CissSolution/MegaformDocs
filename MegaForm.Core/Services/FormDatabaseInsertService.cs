// ─────────────────────────────────────────────────────────────
//  FormDatabaseInsertService — v20260726-01 (token normalize :name -> @name for SqlClient;
//  dotted composite tokens :name.first -> @name_first; multi-value -> CSV)
//  After a form submission saves to MegaForm DB, optionally also INSERT
//  a row into a CUSTOM database (configured in form settings).
//
//  FormSettings.DatabaseInsert shape (canonical):
//    {
//      enabled            : bool
//      connectionKey      : string  (e.g. "DashboardDatabase")
//      databaseType       : string  (optional, e.g. "SqlServer")
//      insertSql          : string  (e.g. "INSERT INTO Leads (Name, Email) VALUES (:fullName, :email)")
//      parameterMapping   : { ":fullName": "fullName", ":email": "email" }   (optional, auto-detected if empty)
//    }
//
//  Behaviour:
//    - Fail-soft. If insert throws, default submission still succeeds. Error logged, never rethrown.
//    - Idempotent on null/empty config (no-op).
//    - Uses parameterized commands → no SQL injection.
//    - Fields not present in form data become DbNull.
// ─────────────────────────────────────────────────────────────
using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Text.RegularExpressions;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;

namespace MegaForm.Core.Services
{
    public sealed class FormDatabaseInsertResult
    {
        public bool Executed { get; set; }
        public bool Success  { get; set; }
        public string Error  { get; set; }
        public int RowsAffected { get; set; }
    }

    public sealed class FormDatabaseInsertTestResult
    {
        public bool Success { get; set; }
        public string Error  { get; set; }
        public int ParameterCount { get; set; }
        public List<string> ParameterNames { get; set; } = new List<string>();
        public List<string> UnboundParameters { get; set; } = new List<string>();
        public int RowsAffected { get; set; }
        public string Message { get; set; }
    }

    public sealed class FormDatabaseInsertService
    {
        public const string Badge = "FormDatabaseInsert v20260726-01";

        private readonly IConnectionRegistry _registry;
        public FormDatabaseInsertService(IConnectionRegistry registry) { _registry = registry; }

        public FormDatabaseInsertResult Execute(FormSettings settings, Dictionary<string, object> formData)
        {
            var result = new FormDatabaseInsertResult();
            if (settings?.DatabaseInsert == null || !settings.DatabaseInsert.Enabled) return result;

            var cfg = settings.DatabaseInsert;
            if (string.IsNullOrWhiteSpace(cfg.ConnectionKey) || string.IsNullOrWhiteSpace(cfg.InsertSql)) return result;
            if (IsDangerousNonInsertQuery(cfg.InsertSql)) {
                result.Executed = true;
                result.Success  = false;
                result.Error    = "DatabaseInsert.InsertSql must be a single INSERT statement.";
                return result;
            }

            result.Executed = true;
            try
            {
                using (var conn = _registry.GetConnection(cfg.ConnectionKey, cfg.DatabaseType, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        // Normalize :name → @name for SqlClient (SQLite/Postgres accept both).
                        // Mirrors DataRepeaterService / FieldOptionsService token handling.
                        cmd.CommandText = NormalizeSql(cfg.InsertSql);
                        cmd.CommandTimeout = 15;
                        var paramNames = ExtractParamNames(cfg.InsertSql);
                        var mapping = cfg.ParameterMapping ?? new Dictionary<string, string>();
                        foreach (var pname in paramNames)
                        {
                            var p = cmd.CreateParameter();
                            p.ParameterName = "@" + SafeParam(pname);
                            p.Value = ResolveValue(formData, MapToFieldKey(mapping, pname));
                            cmd.Parameters.Add(p);
                        }
                        result.RowsAffected = ExecuteRescuingBlanks(cmd);
                        result.Success = true;
                    }
                }
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Error = ex.Message;
            }
            return result;
        }

        /// <summary>
        /// [BlankNumericRescue v20260726] An optional Number/Date field left blank posts an EMPTY
        /// STRING, and "" does not convert to decimal/int ("Error converting data type nvarchar to
        /// numeric") — so one untouched optional field threw and, this path being fail-soft, the
        /// WHOLE custom-table row vanished. Run the statement exactly as before first (no behaviour
        /// change for anything that already works); only if it throws AND a blank string was bound,
        /// re-bind the blanks as NULL and try once more. A second failure propagates unchanged.
        /// </summary>
        private static int ExecuteRescuingBlanks(IDbCommand cmd)
        {
            try { return cmd.ExecuteNonQuery(); }
            catch
            {
                var rebound = false;
                foreach (IDataParameter p in cmd.Parameters)
                {
                    var s = p.Value as string;
                    if (s != null && s.Trim().Length == 0) { p.Value = DBNull.Value; rebound = true; }
                }
                if (!rebound) throw;
                return cmd.ExecuteNonQuery();
            }
        }

        /// <summary>
        /// Dry-run an INSERT against the configured connection inside an explicit transaction
        /// that is ALWAYS rolled back. Returns parameter coverage + any error so the builder
        /// can show "test passed" without persisting data. Same security guards as Execute.
        /// </summary>
        public FormDatabaseInsertTestResult TestExecute(FormSettings settings, Dictionary<string, object> sampleData)
        {
            var result = new FormDatabaseInsertTestResult();
            if (settings?.DatabaseInsert == null)
            {
                result.Success = false; result.Error = "DatabaseInsert config missing"; return result;
            }
            var cfg = settings.DatabaseInsert;
            if (string.IsNullOrWhiteSpace(cfg.ConnectionKey)) { result.Error = "Connection name required"; return result; }
            if (string.IsNullOrWhiteSpace(cfg.InsertSql))     { result.Error = "INSERT SQL required";       return result; }
            if (IsDangerousNonInsertQuery(cfg.InsertSql))     { result.Error = "Only a single INSERT statement is allowed."; return result; }

            var paramNames = ExtractParamNames(cfg.InsertSql);
            result.ParameterCount = paramNames.Count;
            result.ParameterNames = paramNames;
            var mapping = cfg.ParameterMapping ?? new Dictionary<string, string>();
            var unbound = new List<string>();
            foreach (var pname in paramNames)
            {
                if (ResolveValue(sampleData, MapToFieldKey(mapping, pname)) == DBNull.Value) unbound.Add(pname);
            }
            result.UnboundParameters = unbound;

            try
            {
                using (var conn = _registry.GetConnection(cfg.ConnectionKey, cfg.DatabaseType, null))
                {
                    conn.Open();
                    // Mirror Execute's blank rescue — but each attempt gets its OWN transaction.
                    // A failed statement can leave SQL Server with no active transaction, and a
                    // retry on that connection would then run in AUTOCOMMIT: the dry-run row would
                    // be PERSISTED while the result still claimed "rolled back" (observed 07-26).
                    bool hadBlank;
                    if (!TestAttempt(conn, cfg, paramNames, mapping, sampleData, false, result, out hadBlank) && hadBlank)
                    {
                        result.Error = null;
                        TestAttempt(conn, cfg, paramNames, mapping, sampleData, true, result, out hadBlank);
                    }
                }
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Error = ex.Message;
            }
            return result;
        }

        /// <summary>One dry-run attempt in its own always-rolled-back transaction.</summary>
        private static bool TestAttempt(IDbConnection conn, FormDatabaseInsertSettings cfg, List<string> paramNames,
                                        Dictionary<string, string> mapping, Dictionary<string, object> sampleData,
                                        bool blanksAsNull, FormDatabaseInsertTestResult result, out bool hadBlank)
        {
            hadBlank = false;
            using (var tx = conn.BeginTransaction())
            {
                try
                {
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.Transaction = tx;
                        cmd.CommandText = NormalizeSql(cfg.InsertSql);
                        cmd.CommandTimeout = 10;
                        foreach (var pname in paramNames)
                        {
                            var p = cmd.CreateParameter();
                            p.ParameterName = "@" + SafeParam(pname);
                            var v = ResolveValue(sampleData, MapToFieldKey(mapping, pname));
                            var s = v as string;
                            if (s != null && s.Trim().Length == 0)
                            {
                                hadBlank = true;
                                if (blanksAsNull) v = DBNull.Value;
                            }
                            p.Value = v;
                            cmd.Parameters.Add(p);
                        }
                        result.RowsAffected = cmd.ExecuteNonQuery();
                        result.Success = true;
                        result.Error = null;
                        result.Message = $"OK — INSERT executed inside transaction ({result.RowsAffected} row), then ROLLED BACK. Nothing was persisted.";
                        return true;
                    }
                }
                catch (Exception ex)
                {
                    result.Success = false;
                    result.Error = ex.Message;
                    return false;
                }
                finally
                {
                    try { tx.Rollback(); } catch { }
                }
            }
        }

        // Extract :paramName tokens from SQL (Oracle-style named params, also used by Dapper).
        // [DottedParamFlatten v20260726] The token may address a Composite field's SUB-PART
        // (`:name.first` / `:name.last`) so one "Full Name" field can fill FirstName + LastName —
        // the AI emits that shape naturally. The old regex stopped at the dot and produced
        // `@name.first`, which SQL Server parses as a METHOD CALL on the @name variable
        // ("Cannot call methods on nvarchar", Msg 258). Since this whole path is fail-soft the
        // exception silently dropped the ENTIRE custom-table row. A SQL parameter name can never
        // contain a dot → flatten to `@name_first` and resolve the value from the composite parts.
        private static readonly Regex _paramRx = new Regex(
            @":([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)", RegexOptions.Compiled);

        /// <summary>Renderer posts raw Composite sub-part values under this key (see collectFormData).</summary>
        private const string CompositePartsKey = "__mf_parts";

        /// <summary>`name.first` → `name_first`. Dots are illegal in a SQL parameter name.</summary>
        private static string SafeParam(string token)
        {
            return string.IsNullOrEmpty(token) ? token : token.Replace('.', '_');
        }

        /// <summary>Rewrite every `:token` in the SQL to its dot-free `@token` parameter.</summary>
        private static string NormalizeSql(string sql)
        {
            return _paramRx.Replace(sql ?? string.Empty, m => "@" + SafeParam(m.Groups[1].Value));
        }

        /// <summary>Explicit ParameterMapping wins (`:key` or bare `key`); else the token IS the field key.</summary>
        private static string MapToFieldKey(Dictionary<string, string> mapping, string pname)
        {
            string k;
            if (mapping != null && mapping.TryGetValue(":" + pname, out k) && !string.IsNullOrWhiteSpace(k)) return k;
            if (mapping != null && mapping.TryGetValue(pname, out k) && !string.IsNullOrWhiteSpace(k)) return k;
            return pname;
        }

        /// <summary>
        /// Resolve one token's value. Order: exact data key → Composite sub-part for a dotted
        /// token (`__mf_parts[field][part]`, else a nested `data[field][part]`) → flattened
        /// `field_part` key. DBNull when nothing matches.
        /// </summary>
        private static object ResolveValue(Dictionary<string, object> data, string fieldKey)
        {
            if (data == null || string.IsNullOrWhiteSpace(fieldKey)) return DBNull.Value;
            object v;
            if (data.TryGetValue(fieldKey, out v) && v != null) return Coerce(v);
            var dot = fieldKey.IndexOf('.');
            if (dot > 0)
            {
                var parent = fieldKey.Substring(0, dot);
                var part = fieldKey.Substring(dot + 1);
                object partVal;
                if (TryGetSubValue(data, CompositePartsKey, parent, part, out partVal)) return Coerce(partVal);
                if (TryGetSubValue(data, null, parent, part, out partVal)) return Coerce(partVal);
                if (data.TryGetValue(SafeParam(fieldKey), out v) && v != null) return Coerce(v);
            }
            return DBNull.Value;
        }

        /// <summary>Read data[container?][field][part] out of whatever JSON shape the platform handed us.</summary>
        private static bool TryGetSubValue(Dictionary<string, object> data, string container, string field, string part, out object value)
        {
            value = null;
            try
            {
                object raw;
                if (!data.TryGetValue(container ?? field, out raw) || raw == null) return false;
                var root = raw as Newtonsoft.Json.Linq.JObject
                           ?? Newtonsoft.Json.Linq.JObject.Parse(
                                  raw is string ? (string)raw : Newtonsoft.Json.JsonConvert.SerializeObject(raw));
                if (container != null)
                {
                    var groupProp = root.Property(field, StringComparison.OrdinalIgnoreCase);
                    root = groupProp?.Value as Newtonsoft.Json.Linq.JObject;
                    if (root == null) return false;
                }
                var prop = root.Property(part, StringComparison.OrdinalIgnoreCase);
                if (prop == null || prop.Value == null || prop.Value.Type == Newtonsoft.Json.Linq.JTokenType.Null) return false;
                var jv = prop.Value as Newtonsoft.Json.Linq.JValue;
                value = jv != null ? jv.Value : prop.Value.ToString();
                return value != null;
            }
            catch { return false; }
        }

        /// <summary>
        /// [MultiValueCoerce v20260725] Checkbox / Chips multi-selects (and any JArray/array field
        /// value) reach us as a collection. SqlClient cannot bind a collection to a scalar column, so
        /// ExecuteNonQuery throws and — because this path is fail-soft — the ENTIRE custom-table row
        /// is silently dropped whenever such a field is filled. Flatten to CSV so the row survives.
        /// </summary>
        private static object Coerce(object val)
        {
            if (val == null) return DBNull.Value;
            if (val is string) return val;
            var seq = val as System.Collections.IEnumerable;
            if (seq == null) return val;
            var parts = new List<string>();
            foreach (var item in seq) parts.Add(item == null ? string.Empty : item.ToString());
            return string.Join(", ", parts);
        }

        private static List<string> ExtractParamNames(string sql)
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var list = new List<string>();
            foreach (Match m in _paramRx.Matches(sql ?? string.Empty))
            {
                // Dedupe on the FLATTENED name — `:name.first` and `:name_first` would otherwise
                // add the same @name_first parameter twice ("parameter already added").
                var name = m.Groups[1].Value;
                if (seen.Add(SafeParam(name))) list.Add(name);
            }
            return list;
        }

        // [SecFix P1-5] Allow only a single INSERT. The old check matched banned verbs with a
        // trailing SPACE ("UPDATE ") and never rejected statement-stacking, so a public submission
        // running form-configured InsertSql could smuggle "INSERT ...;UPDATE\nT SET..." past it.
        // Now: reject stacking + comments, require a leading INSERT, and word-boundary-block every
        // non-INSERT verb (so INSERT\tINTO ... SELECT still works but INSERT;DROP does not).
        private static readonly Regex _bannedRx = new Regex(
            @"\b(UPDATE|DELETE|DROP|ALTER|TRUNCATE|EXEC|EXECUTE|CREATE|GRANT|REVOKE|DENY|MERGE|BULK|BACKUP|RESTORE|SHUTDOWN|RECONFIGURE|WAITFOR|OPENROWSET|OPENQUERY|OPENDATASOURCE)\b|\bxp_",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static bool IsDangerousNonInsertQuery(string sql)
        {
            if (string.IsNullOrWhiteSpace(sql)) return true;
            var body = sql.Trim().TrimEnd(';');
            if (body.IndexOf(';') >= 0) return true;                                    // no statement stacking
            if (body.IndexOf("--", StringComparison.Ordinal) >= 0 ||
                body.IndexOf("/*", StringComparison.Ordinal) >= 0) return true;         // no comment obfuscation
            if (!Regex.IsMatch(body, @"^\s*INSERT\b", RegexOptions.IgnoreCase)) return true;
            return _bannedRx.IsMatch(body);
        }
    }
}
