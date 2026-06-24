using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Workflow
{
    // ══════════════════════════════════════════════════════════════════════════
    //  DatabaseNodeExecutor
    //  Supports: Insert, Update, Upsert, StoredProcedure.
    //  Security rules:
    //    - Connection strings come ONLY from server IConnectionRegistry, never frontend.
    //    - All parameters are fully parameterized — zero raw SQL from user input.
    //    - Table/column names are validated against identifier whitelist pattern.
    // ══════════════════════════════════════════════════════════════════════════

    public class DatabaseNodeExecutor : INodeExecutor
    {
        private readonly IWorkflowEvaluator  _evaluator;
        private readonly IConnectionRegistry _registry;

        public WorkflowNodeType NodeType => WorkflowNodeType.Database;

        private static readonly Regex _safeIdent =
            new Regex(@"^[A-Za-z_][A-Za-z0-9_]{0,127}$", RegexOptions.Compiled);

        public DatabaseNodeExecutor(IWorkflowEvaluator evaluator, IConnectionRegistry registry)
        {
            _evaluator = evaluator;
            _registry  = registry;
        }

        // ─── INodeExecutor.Validate ───────────────────────────────────────────

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            var result = new WorkflowValidationResult { IsValid = true };
            var label  = node.Label ?? node.Id;

            DatabaseNodeConfig config;
            try { config = ParseConfig(node); }
            catch (Exception ex)
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId = node.Id, Field = "Config",
                    Message = "Database '" + label + "': invalid config — " + ex.Message,
                    Severity = "error",
                });
                return result;
            }

            var externalMode = string.Equals(config.ConnectionMode, "External", StringComparison.OrdinalIgnoreCase);
            if (externalMode)
            {
                if (string.IsNullOrWhiteSpace(config.ConnectionString))
                {
                    result.IsValid = false;
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = node.Id, Field = "ConnectionString",
                        Message = "Database '" + label + "': ConnectionString is required for External mode.",
                        Severity = "error",
                    });
                }
            }
            else if (string.IsNullOrWhiteSpace(config.ConnectionName))
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId = node.Id, Field = "ConnectionName",
                    Message = "Database '" + label + "': ConnectionName is required.",
                    Severity = "error",
                });
            }

            if (config.Operation == DatabaseOperation.StoredProcedure)
            {
                if (string.Equals(config.ConnectionMode, "External", StringComparison.OrdinalIgnoreCase) && string.Equals(config.DatabaseType, "Sqlite", StringComparison.OrdinalIgnoreCase))
                {
                    result.IsValid = false;
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = node.Id, Field = "Operation",
                        Message = "Database '" + label + "': StoredProcedure is not supported for SQLite.",
                        Severity = "error",
                    });
                }
                if (string.IsNullOrWhiteSpace(config.ProcedureName))
                {
                    result.IsValid = false;
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = node.Id, Field = "ProcedureName",
                        Message = "Database '" + label + "': ProcedureName is required for StoredProcedure.",
                        Severity = "error",
                    });
                }
            }
            else
            {
                if (string.IsNullOrWhiteSpace(config.TableName))
                {
                    result.IsValid = false;
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = node.Id, Field = "TableName",
                        Message = "Database '" + label + "': TableName is required.",
                        Severity = "error",
                    });
                }
            }

            return result;
        }

        // ─── INodeExecutor.ExecuteAsync ───────────────────────────────────────

        public async Task<WorkflowNodeResult> ExecuteAsync(
            WorkflowNode node,
            WorkflowExecutionContext ctx,
            CancellationToken ct)
        {
            if (node.IsDisabled)
                return WorkflowNodeResult.Skipped("handle::default");

            DatabaseNodeConfig config;
            try { config = ParseConfig(node); }
            catch (Exception ex)
            {
                return WorkflowNodeResult.Failed(
                    "Database: invalid config — " + ex.Message);
            }

            DbConnection conn;
            try { conn = _registry.GetConnection(string.Equals(config.ConnectionMode, "External", StringComparison.OrdinalIgnoreCase) ? null : config.ConnectionName, string.Equals(config.ConnectionMode, "External", StringComparison.OrdinalIgnoreCase) ? config.DatabaseType : null, string.Equals(config.ConnectionMode, "External", StringComparison.OrdinalIgnoreCase) ? config.ConnectionString : null); }
            catch (Exception ex)
            {
                var target = string.Equals(config.ConnectionMode, "External", StringComparison.OrdinalIgnoreCase)
                    ? (config.DatabaseType + " external connection")
                    : ("connection '" + config.ConnectionName + "'");
                return WorkflowNodeResult.Failed(
                    "Database: cannot resolve " + target + " — " + ex.Message);
            }

            using (var cts = CancellationTokenSource.CreateLinkedTokenSource(ct))
            {
                cts.CancelAfter(TimeSpan.FromSeconds(
                    config.TimeoutSeconds > 0 ? config.TimeoutSeconds : 30));

                try
                {
                    int rowsAffected = await RunCommandAsync(conn, config, ctx, cts.Token);
                    return WorkflowNodeResult.Success("handle::default",
                        new Dictionary<string, object> { { "rowsAffected", rowsAffected } });
                }
                catch (OperationCanceledException)
                {
                    var msg = "Database: operation timed out after " + config.TimeoutSeconds + "s.";
                    if (config.ContinueOnError) return WorkflowNodeResult.Success("handle::default");
                    return WorkflowNodeResult.Failed(msg);
                }
                catch (Exception ex)
                {
                    var msg = "Database: " + ex.Message;
                    if (config.ContinueOnError) return WorkflowNodeResult.Success("handle::default");
                    return WorkflowNodeResult.Failed(msg);
                }
            }
        }

        // ─── Command builders ─────────────────────────────────────────────────

        private async Task<int> RunCommandAsync(
            DbConnection conn, DatabaseNodeConfig config,
            WorkflowExecutionContext ctx, CancellationToken ct)
        {
            if (conn.State != ConnectionState.Open)
                await conn.OpenAsync(ct);

            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandTimeout = config.TimeoutSeconds > 0 ? config.TimeoutSeconds : 30;

                switch (config.Operation)
                {
                    case DatabaseOperation.StoredProcedure:
                        BuildProcedureCommand(cmd, config, ctx);
                        return await cmd.ExecuteNonQueryAsync(ct);

                    case DatabaseOperation.Insert:
                        BuildInsertCommand(cmd, config, ctx);
                        return await cmd.ExecuteNonQueryAsync(ct);

                    case DatabaseOperation.Update:
                        BuildUpdateCommand(cmd, config, ctx);
                        return await cmd.ExecuteNonQueryAsync(ct);

                    case DatabaseOperation.Upsert:
                        BuildUpdateCommand(cmd, config, ctx);
                        int updated = await cmd.ExecuteNonQueryAsync(ct);
                        if (updated > 0) return updated;
                        cmd.Parameters.Clear();
                        BuildInsertCommand(cmd, config, ctx);
                        return await cmd.ExecuteNonQueryAsync(ct);

                    default:
                        throw new InvalidOperationException("Unsupported operation: " + config.Operation);
                }
            }
        }

        private void BuildInsertCommand(DbCommand cmd, DatabaseNodeConfig config, WorkflowExecutionContext ctx)
        {
            ValidateIdentifier(config.TableName, "TableName");
            var cols = new List<string>(); var pNames = new List<string>();
            foreach (var kv in config.FieldMappings)
            {
                if (string.IsNullOrWhiteSpace(kv.Key)) continue;
                ValidateIdentifier(kv.Key, "FieldMappings key");
                var pName = "@p_" + kv.Key;
                cols.Add("[" + kv.Key + "]"); pNames.Add(pName);
                var p = cmd.CreateParameter(); p.ParameterName = pName;
                p.Value = ResolveValue(kv.Value, ctx) ?? (object)DBNull.Value;
                cmd.Parameters.Add(p);
            }
            if (cols.Count == 0) throw new InvalidOperationException("Insert requires at least one FieldMapping.");
            cmd.CommandText = "INSERT INTO [" + config.TableName + "] (" +
                              string.Join(", ", cols) + ") VALUES (" + string.Join(", ", pNames) + ")";
        }

        private void BuildUpdateCommand(DbCommand cmd, DatabaseNodeConfig config, WorkflowExecutionContext ctx)
        {
            ValidateIdentifier(config.TableName, "TableName");
            var sets = new List<string>(); var wheres = new List<string>();
            foreach (var kv in config.FieldMappings)
            {
                if (string.IsNullOrWhiteSpace(kv.Key)) continue;
                ValidateIdentifier(kv.Key, "FieldMappings key");
                var pName = "@set_" + kv.Key;
                sets.Add("[" + kv.Key + "] = " + pName);
                var p = cmd.CreateParameter(); p.ParameterName = pName;
                p.Value = ResolveValue(kv.Value, ctx) ?? (object)DBNull.Value;
                cmd.Parameters.Add(p);
            }
            foreach (var kv in config.WhereMappings)
            {
                if (string.IsNullOrWhiteSpace(kv.Key)) continue;
                ValidateIdentifier(kv.Key, "WhereMappings key");
                var pName = "@wh_" + kv.Key;
                wheres.Add("[" + kv.Key + "] = " + pName);
                var p = cmd.CreateParameter(); p.ParameterName = pName;
                p.Value = ResolveValue(kv.Value, ctx) ?? (object)DBNull.Value;
                cmd.Parameters.Add(p);
            }
            if (sets.Count == 0) throw new InvalidOperationException("Update requires at least one FieldMapping.");
            cmd.CommandText = "UPDATE [" + config.TableName + "] SET " + string.Join(", ", sets);
            if (wheres.Count > 0) cmd.CommandText += " WHERE " + string.Join(" AND ", wheres);
        }

        private void BuildProcedureCommand(DbCommand cmd, DatabaseNodeConfig config, WorkflowExecutionContext ctx)
        {
            ValidateIdentifier(config.ProcedureName, "ProcedureName");
            cmd.CommandType = CommandType.StoredProcedure;
            cmd.CommandText = config.ProcedureName;
            foreach (var kv in config.FieldMappings)
            {
                if (string.IsNullOrWhiteSpace(kv.Key)) continue;
                var pName = "@" + Regex.Replace(kv.Key, @"[^A-Za-z0-9_]", "");
                var p = cmd.CreateParameter(); p.ParameterName = pName;
                p.Value = ResolveValue(kv.Value, ctx) ?? (object)DBNull.Value;
                cmd.Parameters.Add(p);
            }
        }

        private object ResolveValue(string sourceValue, WorkflowExecutionContext ctx)
        {
            if (string.IsNullOrEmpty(sourceValue)) return null;
            if (sourceValue.Contains("{{")) return _evaluator.ResolveTemplate(sourceValue, ctx);
            object val;
            if (ctx.FormData != null && ctx.FormData.TryGetValue(sourceValue, out val)) return val;
            if (ctx.Variables != null && ctx.Variables.TryGetValue(sourceValue, out val)) return val;
            return sourceValue; // treat as literal
        }

        private static void ValidateIdentifier(string name, string fieldName)
        {
            if (string.IsNullOrWhiteSpace(name))
                throw new ArgumentException(fieldName + " cannot be empty.");
            if (!_safeIdent.IsMatch(name))
                throw new ArgumentException(fieldName + " '" + name + "' contains invalid characters.");
        }

        private static DatabaseNodeConfig ParseConfig(WorkflowNode node)
        {
            if (node.Config == null) throw new InvalidOperationException("Node config is null.");
            var json = JsonConvert.SerializeObject(node.Config);
            var cfg  = JsonConvert.DeserializeObject<DatabaseNodeConfig>(json);
            if (cfg == null) throw new InvalidOperationException("Failed to deserialize DatabaseNodeConfig.");
            return cfg;
        }
    }
}
