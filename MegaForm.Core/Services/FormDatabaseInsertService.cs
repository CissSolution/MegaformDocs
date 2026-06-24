// ─────────────────────────────────────────────────────────────
//  FormDatabaseInsertService — v20260516-03 (token normalize :name -> @name for SqlClient)
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
        public const string Badge = "FormDatabaseInsert v20260516-03";

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
                        cmd.CommandText = _paramRx.Replace(cfg.InsertSql, "@$1");
                        cmd.CommandTimeout = 15;
                        var paramNames = ExtractParamNames(cfg.InsertSql);
                        var mapping = cfg.ParameterMapping ?? new Dictionary<string, string>();
                        foreach (var pname in paramNames)
                        {
                            // map: try explicit mapping first, else use param name (without ":") as field key
                            var fieldKey = mapping.TryGetValue(":" + pname, out var k) && !string.IsNullOrWhiteSpace(k)
                                           ? k
                                           : (mapping.TryGetValue(pname, out var k2) && !string.IsNullOrWhiteSpace(k2) ? k2 : pname);
                            object val = DBNull.Value;
                            if (formData != null && formData.TryGetValue(fieldKey, out var v) && v != null)
                            {
                                val = v;
                            }
                            var p = cmd.CreateParameter();
                            p.ParameterName = "@" + pname;
                            p.Value = val;
                            cmd.Parameters.Add(p);
                        }
                        result.RowsAffected = cmd.ExecuteNonQuery();
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
                var fieldKey = mapping.TryGetValue(":" + pname, out var k) && !string.IsNullOrWhiteSpace(k) ? k
                              : (mapping.TryGetValue(pname, out var k2) && !string.IsNullOrWhiteSpace(k2) ? k2 : pname);
                if (sampleData == null || !sampleData.ContainsKey(fieldKey)) unbound.Add(pname);
            }
            result.UnboundParameters = unbound;

            try
            {
                using (var conn = _registry.GetConnection(cfg.ConnectionKey, cfg.DatabaseType, null))
                {
                    conn.Open();
                    using (var tx = conn.BeginTransaction())
                    {
                        try
                        {
                            using (var cmd = conn.CreateCommand())
                            {
                                cmd.Transaction = tx;
                                cmd.CommandText = _paramRx.Replace(cfg.InsertSql, "@$1");
                                cmd.CommandTimeout = 10;
                                foreach (var pname in paramNames)
                                {
                                    var fieldKey = mapping.TryGetValue(":" + pname, out var k3) && !string.IsNullOrWhiteSpace(k3) ? k3
                                                  : (mapping.TryGetValue(pname, out var k4) && !string.IsNullOrWhiteSpace(k4) ? k4 : pname);
                                    object val = DBNull.Value;
                                    if (sampleData != null && sampleData.TryGetValue(fieldKey, out var v) && v != null) val = v;
                                    var p = cmd.CreateParameter();
                                    p.ParameterName = "@" + pname; p.Value = val;
                                    cmd.Parameters.Add(p);
                                }
                                result.RowsAffected = cmd.ExecuteNonQuery();
                                result.Success = true;
                                result.Message = $"OK — INSERT executed inside transaction ({result.RowsAffected} row), then ROLLED BACK. Nothing was persisted.";
                            }
                        }
                        finally
                        {
                            try { tx.Rollback(); } catch { }
                        }
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

        // Extract :paramName tokens from SQL (Oracle-style named params, also used by Dapper).
        private static readonly Regex _paramRx = new Regex(@":([a-zA-Z_][a-zA-Z0-9_]*)", RegexOptions.Compiled);

        private static List<string> ExtractParamNames(string sql)
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var list = new List<string>();
            foreach (Match m in _paramRx.Matches(sql ?? string.Empty))
            {
                var name = m.Groups[1].Value;
                if (seen.Add(name)) list.Add(name);
            }
            return list;
        }

        // Allow only INSERT. Block UPDATE/DELETE/DDL etc.
        private static readonly string[] _bannedKeywords = new[]
        {
            "UPDATE ", "DELETE ", "DROP ", "ALTER ", "TRUNCATE ", "EXEC ", "EXECUTE ",
            "CREATE ", "GRANT ", "REVOKE ", "MERGE ", "BULK ", "BACKUP ", "RESTORE "
        };

        private static bool IsDangerousNonInsertQuery(string sql)
        {
            if (string.IsNullOrWhiteSpace(sql)) return true;
            var upper = " " + sql.Trim().ToUpperInvariant() + " ";
            if (!upper.TrimStart().StartsWith("INSERT ")) return true;
            return _bannedKeywords.Any(b => upper.Contains(b));
        }
    }
}
