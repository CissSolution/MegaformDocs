/*
 * MegaForm.Core/Services/LifecycleRunner.cs
 *
 * Sprint Option A · R2 — CRUD lifecycle hook runner.
 *
 *  - Synchronous (D1). Each hook runs in the caller's DB transaction.
 *  - SQL-only (D4). HookRuntime enum reserved for future "razor" extension.
 *  - Batch + Row granularity (D2). Form-scope hooks always fire once
 *    (treated as "batch" because there's nothing to iterate). DataGrid-
 *    scope hooks fire per row when Granularity = "row", otherwise once
 *    with a :rows JSON array parameter.
 *  - Audit auto-fill: every hook gets these injected before binding,
 *    no ParameterMapping entry required:
 *         :_createdBy, :_createdOn, :_modifiedBy, :_modifiedOn,
 *         :_portalId, :_ipAddress, :_formId, :_submissionId.
 *  - Failure handling:
 *         OnFailure = "abort"    -> caller transaction rolls back.
 *         OnFailure = "continue" -> logged to MF_SubmissionHookErrors,
 *                                   submit proceeds.
 *
 * Badge: LifecycleRunner v20260531-R2-01
 */

using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Text.RegularExpressions;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Context passed into a single LifecycleRunner invocation.
    /// </summary>
    public sealed class LifecycleContext
    {
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public int PortalId { get; set; }
        public int UserId { get; set; }
        public int ModifiedByUserId { get; set; }
        public DateTime UtcNow { get; set; } = DateTime.UtcNow;
        public string IpAddress { get; set; }
        /// <summary>Flat form-data map keyed by field key.</summary>
        public Dictionary<string, object> FormData { get; set; } = new Dictionary<string, object>();
        /// <summary>Optional default connection key when a hook leaves ConnectionKey blank.</summary>
        public string DefaultConnectionKey { get; set; } = "DashboardDatabase";
    }

    /// <summary>
    /// Aggregate result of a slot execution.
    /// </summary>
    public sealed class LifecycleSlotResult
    {
        public string Slot { get; set; }
        public List<LifecycleHookResult> Hooks { get; set; } = new List<LifecycleHookResult>();
        /// <summary>True if any hook with OnFailure=abort raised a failure.</summary>
        public bool ShouldAbort => Hooks.Any(h => h.ShouldAbort);
    }

    public sealed class LifecycleRunner
    {
        public const string Badge = "LifecycleRunner v20260531-R2-01";

        private readonly IConnectionRegistry _registry;
        private readonly Action<LifecycleHookResult, LifecycleContext, LifecycleHook> _onError;

        /// <summary>
        /// Pass an onError delegate that persists the failure into
        /// MF_SubmissionHookErrors. The runner itself is connection-
        /// agnostic so it can be unit-tested without the DNN DB.
        /// </summary>
        public LifecycleRunner(IConnectionRegistry registry, Action<LifecycleHookResult, LifecycleContext, LifecycleHook> onError = null)
        {
            _registry = registry;
            _onError  = onError;
        }

        // ─────────────────────────────────────────────────────────
        //  Public entry points — form-scope and datagrid-row-scope.
        // ─────────────────────────────────────────────────────────

        /// <summary>
        /// Run a single form-scope hook (preInsert / postInsert / etc.)
        /// inside the supplied open connection + transaction.
        /// </summary>
        public LifecycleSlotResult RunFormSlot(string slot, LifecycleHook hook, LifecycleContext ctx, IDbConnection conn, IDbTransaction tx)
        {
            var slotResult = new LifecycleSlotResult { Slot = slot };
            if (hook == null || !hook.Enabled || string.IsNullOrWhiteSpace(hook.Sql))
                return slotResult;

            // Form scope = always batch (nothing to iterate).
            var result = ExecuteHookOnce(hook, ctx, ctx.FormData, slot, "form", conn, tx);
            slotResult.Hooks.Add(result);
            return slotResult;
        }

        /// <summary>
        /// Run a DataGrid-scope hook for the rows[] array under
        /// a specific DataGrid field. Honours Granularity = batch | row.
        /// </summary>
        public LifecycleSlotResult RunDataGridSlot(
            string slot,
            LifecycleHook hook,
            string fieldKey,
            List<Dictionary<string, object>> rows,
            LifecycleContext ctx,
            IDbConnection conn,
            IDbTransaction tx)
        {
            var slotResult = new LifecycleSlotResult { Slot = slot };
            if (hook == null || !hook.Enabled || string.IsNullOrWhiteSpace(hook.Sql))
                return slotResult;
            if (rows == null) rows = new List<Dictionary<string, object>>();
            var scope = "datagrid:" + (fieldKey ?? "?");

            if (string.Equals(hook.Granularity, "row", StringComparison.OrdinalIgnoreCase))
            {
                // Per-row fan-out.
                for (int i = 0; i < rows.Count; i++)
                {
                    var rowData = new Dictionary<string, object>(rows[i] ?? new Dictionary<string, object>(), StringComparer.OrdinalIgnoreCase)
                    {
                        ["_rowIndex"] = i,
                    };
                    var r = ExecuteHookOnce(hook, ctx, rowData, slot, scope, conn, tx);
                    slotResult.Hooks.Add(r);
                    if (r.ShouldAbort) break;
                }
            }
            else
            {
                // Batch: one shot, :rows = JSON array.
                var batchData = new Dictionary<string, object>(ctx.FormData, StringComparer.OrdinalIgnoreCase)
                {
                    ["rows"]     = JsonConvert.SerializeObject(rows),
                    ["rowCount"] = rows.Count,
                };
                var r = ExecuteHookOnce(hook, ctx, batchData, slot, scope, conn, tx);
                slotResult.Hooks.Add(r);
            }
            return slotResult;
        }

        // ─────────────────────────────────────────────────────────
        //  Engine
        // ─────────────────────────────────────────────────────────

        private LifecycleHookResult ExecuteHookOnce(
            LifecycleHook hook,
            LifecycleContext ctx,
            Dictionary<string, object> dataMap,
            string slot,
            string scope,
            IDbConnection conn,
            IDbTransaction tx)
        {
            var result = new LifecycleHookResult { HookSlot = slot, Scope = scope };
            try
            {
                if (!string.Equals(hook.Runtime ?? "sql", "sql", StringComparison.OrdinalIgnoreCase))
                {
                    // v1 ships SQL only. Future runtimes drop in here.
                    result.Success = false;
                    result.ErrorMessage = "Unsupported runtime: " + hook.Runtime;
                    HandleFailure(hook, ctx, result);
                    return result;
                }

                var sql = hook.Sql ?? string.Empty;
                if (IsDangerousVerb(sql))
                {
                    result.Success = false;
                    result.ErrorMessage = "Disallowed verb in hook SQL (DROP DATABASE / TRUNCATE TABLE / xp_cmdshell are blocked).";
                    HandleFailure(hook, ctx, result);
                    return result;
                }

                // Augment data map with audit auto-fill tokens. Caller-supplied
                // keys win — admin can override audit by passing :_createdBy
                // through ParameterMapping.
                var bag = BuildParameterBag(dataMap, ctx);

                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = tx;
                    cmd.CommandText = ParamRx.Replace(sql, "@$1");
                    cmd.CommandTimeout = 20;

                    var paramNames = ExtractParamNames(sql);
                    var mapping = hook.ParameterMapping ?? new Dictionary<string, string>();
                    foreach (var pname in paramNames)
                    {
                        var sourceKey = ResolveSourceKey(pname, mapping);
                        object val = DBNull.Value;
                        if (bag.TryGetValue(sourceKey, out var v) && v != null) val = v;
                        var p = cmd.CreateParameter();
                        p.ParameterName = "@" + pname;
                        p.Value = val ?? DBNull.Value;
                        cmd.Parameters.Add(p);
                    }
                    result.RowsAffected = cmd.ExecuteNonQuery();
                    result.Success = true;
                }
                return result;
            }
            catch (Exception ex)
            {
                result.Success = false;
                // [R5 fix] Use reflection to capture a SQL error Number when the
                // runtime type exposes one (System.Data.SqlClient.SqlException
                // on net472, Microsoft.Data.SqlClient.SqlException on net9).
                // Keeps Core target-framework-agnostic.
                try
                {
                    var numProp = ex.GetType().GetProperty("Number");
                    if (numProp != null)
                    {
                        var nv = numProp.GetValue(ex);
                        if (nv is int n) result.SqlNumber = n;
                    }
                }
                catch { /* swallow */ }
                result.ErrorMessage = Truncate(ex.Message, 2000);
                HandleFailure(hook, ctx, result);
                return result;
            }
        }

        private void HandleFailure(LifecycleHook hook, LifecycleContext ctx, LifecycleHookResult result)
        {
            // Defer error persistence to the caller (so the SubmissionController
            // can log to MF_SubmissionHookErrors on its own connection — failing
            // an "abort" hook will have already rolled back our tx).
            try { _onError?.Invoke(result, ctx, hook); } catch { /* never let logging shadow the real error */ }
            result.ShouldAbort = string.Equals(hook.OnFailure ?? "continue", "abort", StringComparison.OrdinalIgnoreCase);
        }

        private static Dictionary<string, object> BuildParameterBag(Dictionary<string, object> data, LifecycleContext ctx)
        {
            var bag = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (data != null)
            {
                foreach (var kv in data) bag[kv.Key] = kv.Value;
            }
            // Audit auto-fill (case-insensitive; both leading-_ and clean names accepted).
            void Set(string key, object val) { if (!bag.ContainsKey(key)) bag[key] = val; }
            Set("_createdBy",     ctx.UserId);
            Set("_createdOn",     ctx.UtcNow);
            Set("_modifiedBy",    ctx.ModifiedByUserId == 0 ? ctx.UserId : ctx.ModifiedByUserId);
            Set("_modifiedOn",    ctx.UtcNow);
            Set("_portalId",      ctx.PortalId);
            Set("_ipAddress",     ctx.IpAddress ?? string.Empty);
            Set("_formId",        ctx.FormId);
            Set("_submissionId",  ctx.SubmissionId);
            return bag;
        }

        private static string ResolveSourceKey(string paramName, Dictionary<string, string> mapping)
        {
            if (mapping != null)
            {
                if (mapping.TryGetValue(":" + paramName, out var k1) && !string.IsNullOrWhiteSpace(k1)) return k1;
                if (mapping.TryGetValue(paramName,        out var k2) && !string.IsNullOrWhiteSpace(k2)) return k2;
            }
            // Audit tokens reach by their literal name (paramName includes leading _).
            return paramName;
        }

        private static readonly Regex ParamRx = new Regex(@":([a-zA-Z_][a-zA-Z0-9_]*)", RegexOptions.Compiled);

        private static List<string> ExtractParamNames(string sql)
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var list = new List<string>();
            foreach (Match m in ParamRx.Matches(sql ?? string.Empty))
            {
                var name = m.Groups[1].Value;
                if (seen.Add(name)) list.Add(name);
            }
            return list;
        }

        // [SecFix P1-6] Lifecycle hook SQL runs on every PUBLIC form submission, so a
        // CSRF/imported malicious hook could previously ship anything except the 4 substrings
        // below (EXEC, DROP TABLE, DELETE, ALTER, statement-stacking all passed). Hooks are
        // legitimately single DML statements (INSERT/UPDATE/DELETE), so we now reject
        // statement-stacking + comments and word-boundary-block all DDL / privilege / OS-reach
        // verbs, while still allowing plain DML.
        private static readonly System.Text.RegularExpressions.Regex _hookDangerRx =
            new System.Text.RegularExpressions.Regex(
                @"\b(DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE|DENY|SHUTDOWN|RECONFIGURE|WAITFOR|OPENROWSET|OPENQUERY|OPENDATASOURCE|BACKUP|RESTORE|MERGE|BULK)\b|\bxp_|\bsp_oacreate\b",
                System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        private static bool IsDangerousVerb(string sql)
        {
            if (string.IsNullOrWhiteSpace(sql)) return true;
            var body = sql.Trim().TrimEnd(';');
            if (body.IndexOf(';') >= 0) return true;                                    // no statement stacking
            if (body.IndexOf("--", StringComparison.Ordinal) >= 0 ||
                body.IndexOf("/*", StringComparison.Ordinal) >= 0) return true;         // no comment obfuscation
            return _hookDangerRx.IsMatch(body);
        }

        private static string Truncate(string s, int max)
        {
            if (string.IsNullOrEmpty(s)) return s ?? string.Empty;
            return s.Length <= max ? s : s.Substring(0, max);
        }
    }
}
