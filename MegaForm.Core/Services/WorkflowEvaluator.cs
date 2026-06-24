using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Pure logic evaluator — no side effects, no DB, no HTTP.
    /// C# 7.3 compatible (net472 + net8.0 + net9.0).
    /// </summary>
    public class WorkflowEvaluator : IWorkflowEvaluator
    {
        // regex: {{anything}} - compiled once
        private static readonly Regex _templateRegex =
            new Regex(@"\{\{([^}]+)\}\}", RegexOptions.Compiled);

        // ─── EvaluateCondition ───────────────────────────────────────────────

        public bool EvaluateCondition(string conditionsJson, Dictionary<string, object> data)
        {
            if (string.IsNullOrWhiteSpace(conditionsJson))
                return true;
            try
            {
                var settings = new JsonSerializerSettings();
                settings.Converters.Add(new ConditionNodeConverter());
                var group = JsonConvert.DeserializeObject<ConditionGroup>(conditionsJson, settings);
                return group == null || EvaluateGroup(group, data);
            }
            catch { return false; }
        }

        private bool EvaluateGroup(ConditionGroup group, Dictionary<string, object> data)
        {
            if (group.Children == null || group.Children.Count == 0)
                return true;

            var results = new List<bool>();
            foreach (var child in group.Children)
            {
                var subGroup = child as ConditionGroup;
                if (subGroup != null)
                    results.Add(EvaluateGroup(subGroup, data));
                else
                {
                    var rule = child as ConditionRule;
                    if (rule != null)
                        results.Add(EvaluateRule(rule, data));
                }
            }

            return group.Logic == RuleLogicOperator.any
                ? results.Any(r => r)
                : results.All(r => r);
        }

        private bool EvaluateRule(ConditionRule rule, Dictionary<string, object> data)
        {
            string fv = GetDataValue(data, rule.Field ?? "");
            string cv = rule.Value != null ? rule.Value.ToString() : "";

            switch (rule.Operator)
            {
                case ComparisonOperator.eq:
                    return string.Equals(fv, cv, StringComparison.OrdinalIgnoreCase);
                case ComparisonOperator.neq:
                    return !string.Equals(fv, cv, StringComparison.OrdinalIgnoreCase);
                case ComparisonOperator.contains:
                    return fv.IndexOf(cv, StringComparison.OrdinalIgnoreCase) >= 0;
                case ComparisonOperator.startsWith:
                    return fv.StartsWith(cv, StringComparison.OrdinalIgnoreCase);
                case ComparisonOperator.endsWith:
                    return fv.EndsWith(cv, StringComparison.OrdinalIgnoreCase);
                case ComparisonOperator.gt:
                {
                    double a, b;
                    return TryNum(fv, out a) && TryNum(cv, out b) && a > b;
                }
                case ComparisonOperator.gte:
                {
                    double a, b;
                    return TryNum(fv, out a) && TryNum(cv, out b) && a >= b;
                }
                case ComparisonOperator.lt:
                {
                    double a, b;
                    return TryNum(fv, out a) && TryNum(cv, out b) && a < b;
                }
                case ComparisonOperator.lte:
                {
                    double a, b;
                    return TryNum(fv, out a) && TryNum(cv, out b) && a <= b;
                }
                case ComparisonOperator.@in:
                {
                    foreach (var v in cv.Split(','))
                        if (string.Equals(v.Trim(), fv, StringComparison.OrdinalIgnoreCase))
                            return true;
                    return false;
                }
                case ComparisonOperator.notIn:
                {
                    foreach (var v in cv.Split(','))
                        if (string.Equals(v.Trim(), fv, StringComparison.OrdinalIgnoreCase))
                            return false;
                    return true;
                }
                case ComparisonOperator.isEmpty:    return string.IsNullOrWhiteSpace(fv);
                case ComparisonOperator.isNotEmpty: return !string.IsNullOrWhiteSpace(fv);
                case ComparisonOperator.isTrue:     return fv == "true" || fv == "1" || fv == "yes";
                case ComparisonOperator.isFalse:
                    return fv == "false" || fv == "0" || fv == "no" || string.IsNullOrEmpty(fv);
                default: return false;
            }
        }

        private string GetDataValue(Dictionary<string, object> data, string key)
        {
            if (data == null || string.IsNullOrEmpty(key)) return "";

            object raw = null;
            if (!data.TryGetValue(key, out raw))
            {
                foreach (var k in data.Keys)
                {
                    if (string.Equals(k, key, StringComparison.OrdinalIgnoreCase))
                    {
                        raw = data[k];
                        break;
                    }
                }
            }
            if (raw == null) return "";
            var arr = raw as JArray;
            return arr != null ? string.Join(",", arr.Select(j => j.ToString())) : raw.ToString();
        }

        // ─── ResolveExpression ───────────────────────────────────────────────

        public string ResolveExpression(string template, WorkflowExecutionContext ctx)
        {
            if (string.IsNullOrEmpty(template)) return template ?? "";
            if (ctx == null) return template;

            return _templateRegex.Replace(template, m =>
            {
                string expr = m.Groups[1].Value.Trim();

                if (expr.StartsWith("field.", StringComparison.OrdinalIgnoreCase))
                    return GetDataValue(ctx.FormData, expr.Substring(6));

                if (expr.StartsWith("variable.", StringComparison.OrdinalIgnoreCase))
                    return GetVarValue(ctx, expr.Substring(9));

                if (string.Equals(expr, "submission.id", StringComparison.OrdinalIgnoreCase))
                    return ctx.SubmissionId.ToString();

                if (string.Equals(expr, "form.id", StringComparison.OrdinalIgnoreCase))
                    return ctx.FormId.ToString();

                if (string.Equals(expr, "execution.id", StringComparison.OrdinalIgnoreCase))
                    return ctx.ExecutionId ?? "";

                // shorthand: try form data then variable
                string val = GetDataValue(ctx.FormData, expr);
                if (!string.IsNullOrEmpty(val)) return val;
                val = GetVarValue(ctx, expr);
                if (!string.IsNullOrEmpty(val)) return val;

                return m.Value;
            });
        }

        private string GetVarValue(WorkflowExecutionContext ctx, string key)
        {
            if (ctx.Variables == null || string.IsNullOrEmpty(key)) return "";

            object raw = null;
            if (!ctx.Variables.TryGetValue(key, out raw))
            {
                foreach (var k in ctx.Variables.Keys)
                {
                    if (string.Equals(k, key, StringComparison.OrdinalIgnoreCase))
                    {
                        raw = ctx.Variables[k];
                        break;
                    }
                }
            }
            return raw != null ? raw.ToString() : "";
        }

        // ─── Calculate ───────────────────────────────────────────────────────

        public double Calculate(string operand1, CalcOperator op, string operand2,
            WorkflowExecutionContext ctx)
        {
            double v1 = ResolveNum(operand1, ctx);
            double v2 = ResolveNum(operand2, ctx);

            switch (op)
            {
                case CalcOperator.Add:      return v1 + v2;
                case CalcOperator.Subtract: return v1 - v2;
                case CalcOperator.Multiply: return v1 * v2;
                case CalcOperator.Divide:   return v2 == 0 ? 0 : v1 / v2;
                case CalcOperator.Modulo:   return v2 == 0 ? 0 : v1 % v2;
                case CalcOperator.Power:    return Math.Pow(v1, v2);
                case CalcOperator.Assign:   return v2;
                default:                    return 0;
            }
        }

        private double ResolveNum(string operand, WorkflowExecutionContext ctx)
        {
            if (string.IsNullOrEmpty(operand)) return 0;
            double lit;
            if (TryNum(operand, out lit)) return lit;
            string resolved = ResolveExpression("{{" + operand + "}}", ctx);
            if (resolved.Contains("{{")) return 0;
            double val;
            return TryNum(resolved, out val) ? val : 0;
        }

        // ─── EvaluateNavigation ──────────────────────────────────────────────

        public WorkflowNavigationResult EvaluateNavigation(
            WorkflowDefinition definition,
            string currentNodeId,
            Dictionary<string, object> formData)
        {
            var result = new WorkflowNavigationResult();
            if (definition == null || string.IsNullOrEmpty(currentNodeId))
                return result;

            WorkflowNode node = null;
            foreach (var n in definition.Nodes)
            {
                if (n.Id == currentNodeId) { node = n; break; }
            }
            if (node == null) return result;

            // Build merged data
            var merged = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (formData != null)
                foreach (var kvp in formData) merged[kvp.Key] = kvp.Value;

            if (definition.Variables != null)
                foreach (var v in definition.Variables)
                    if (v.DefaultValue != null) merged["variable." + v.Key] = v.DefaultValue;

            if (node.Type == WorkflowNodeType.FormField)
            {
                EvaluateLegacyRules(node, merged, result);
            }
            else if (node.Type == WorkflowNodeType.Condition
                     && node.ZoneType == WorkflowZoneType.Navigation)
            {
                bool cond = false;
                object condJson = null;
                if (node.Config != null && node.Config.TryGetValue("ConditionsJson", out condJson)
                    && condJson != null)
                {
                    cond = EvaluateCondition(condJson.ToString(), merged);
                }

                string handle = cond ? "true" : "false";
                foreach (var edge in definition.Edges)
                {
                    if (edge.SourceNodeId == currentNodeId && edge.SourceHandle == handle)
                    {
                        result.NextNodeId = edge.TargetNodeId;
                        break;
                    }
                }
                return result;
            }

            // Default edge
            foreach (var edge in definition.Edges)
            {
                if (edge.SourceNodeId == currentNodeId
                    && (edge.SourceHandle == "default" || string.IsNullOrEmpty(edge.SourceHandle)))
                {
                    result.NextNodeId = edge.TargetNodeId;
                    break;
                }
            }

            return result;
        }

        private void EvaluateLegacyRules(WorkflowNode node, Dictionary<string, object> data,
            WorkflowNavigationResult result)
        {
            if (node.LegacyRules == null || node.LegacyRules.Count == 0) return;

            foreach (var rule in node.LegacyRules)
            {
                if (string.IsNullOrEmpty(rule.ConditionsJson)) continue;
                if (!EvaluateCondition(rule.ConditionsJson, data)) continue;
                if (string.IsNullOrEmpty(rule.ActionsJson)) continue;

                try
                {
                    var actions = JsonConvert.DeserializeObject<List<RuleAction>>(rule.ActionsJson);
                    if (actions == null) continue;
                    foreach (var action in actions)
                    {
                        result.FieldEffects.Add(new WorkflowFieldEffect
                        {
                            FieldKey = action.Target,
                            Action   = action.Action.ToString().ToLower(),
                            Value    = action.Value,
                        });
                    }
                }
                catch { /* ignore */ }
            }
        }

        // ─── ResolveTemplate (alias for ResolveExpression, satisfies interface) ─

        public string ResolveTemplate(string template, WorkflowExecutionContext ctx)
        {
            return ResolveExpression(template, ctx);
        }

        // ─── ValidateDefinition ──────────────────────────────────────────────

        public WorkflowValidationResult ValidateDefinition(
            WorkflowDefinition definition,
            ValidationMode mode = ValidationMode.Apply)
        {
            var result = new WorkflowValidationResult { IsValid = true };

            if (definition == null)
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    Message = "WorkflowDefinition is null.", Severity = "error"
                });
                return result;
            }

            if (!string.IsNullOrEmpty(definition.StartNodeId))
            {
                bool found = false;
                foreach (var n in definition.Nodes)
                    if (n.Id == definition.StartNodeId) { found = true; break; }
                if (!found)
                    result.Errors.Add(new WorkflowValidationError
                    {
                        Field = "StartNodeId",
                        Message = "StartNodeId '" + definition.StartNodeId + "' not found in Nodes.",
                        Severity = "error"
                    });
            }

            var nodeIds = new HashSet<string>();
            foreach (var n in definition.Nodes) nodeIds.Add(n.Id);

            foreach (var edge in definition.Edges)
            {
                if (!nodeIds.Contains(edge.SourceNodeId))
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = edge.SourceNodeId, Field = "SourceNodeId",
                        Message = "Edge source '" + edge.SourceNodeId + "' not found.", Severity = "error"
                    });
                if (!nodeIds.Contains(edge.TargetNodeId))
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = edge.TargetNodeId, Field = "TargetNodeId",
                        Message = "Edge target '" + edge.TargetNodeId + "' not found.", Severity = "error"
                    });
            }

            foreach (var node in definition.Nodes)
                ValidateNode(node, definition, result, mode);

            if (result.Errors.Exists(e => e.Severity == "error"))
                result.IsValid = false;

            return result;
        }

        private void ValidateNode(WorkflowNode node, WorkflowDefinition def,
            WorkflowValidationResult result, ValidationMode mode = ValidationMode.Apply)
        {
            string label = node.Label ?? node.Id;

            // ── Whitelist check — always enforced in both modes ───────────────
            if (!SupportedNodeTypes.All.Contains(node.Type))
            {
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId   = node.Id,
                    Field    = "Type",
                    Message  = "Node '" + label + "': type '" + node.Type + "' is not supported by the backend runtime.",
                    Severity = "error"
                });
                return;
            }

            // ── In Draft mode, skip required-field checks ─────────────────────
            // (allow saving incomplete nodes during editing)
            if (mode == ValidationMode.Draft) return;

            // ── Apply mode: full runtime safety checks ────────────────────────
            if (node.Type == WorkflowNodeType.Webhook)
            {
                if (string.IsNullOrWhiteSpace(GetConfigStr(node, "Url")))
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = node.Id, Field = "Url",
                        Message = "Webhook '" + label + "': URL is required.", Severity = "error"
                    });
            }
            else if (node.Type == WorkflowNodeType.SendEmail)
            {
                if (string.IsNullOrWhiteSpace(GetConfigStr(node, "To")))
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = node.Id, Field = "To",
                        Message = "SendEmail '" + label + "': recipient (To) is required.", Severity = "error"
                    });
            }
            else if (node.Type == WorkflowNodeType.Database)
            {
                var connectionMode = GetConfigStr(node, "ConnectionMode");
                var connectionName = GetConfigStr(node, "ConnectionName");
                var connectionString = GetConfigStr(node, "ConnectionString");
                var databaseType = GetConfigStr(node, "DatabaseType");
                if (string.Equals(connectionMode, "External", StringComparison.OrdinalIgnoreCase))
                {
                    if (string.IsNullOrWhiteSpace(connectionString))
                        result.Errors.Add(new WorkflowValidationError
                        {
                            NodeId = node.Id, Field = "ConnectionString",
                            Message = "Database '" + label + "': ConnectionString is required for External mode.", Severity = "error"
                        });
                }
                else if (string.IsNullOrWhiteSpace(connectionName))
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = node.Id, Field = "ConnectionName",
                        Message = "Database '" + label + "': ConnectionName is required.", Severity = "error"
                    });

                var opStr = GetConfigStr(node, "Operation");
                DatabaseOperation op = DatabaseOperation.Insert;
                bool opValid = !string.IsNullOrEmpty(opStr) &&
                               System.Enum.TryParse<DatabaseOperation>(opStr, true, out op);

                if (!opValid)
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = node.Id, Field = "Operation",
                        Message = "Database '" + label + "': Operation must be Insert, Update, Upsert, or StoredProcedure.", Severity = "error"
                    });
                else if (op == DatabaseOperation.StoredProcedure)
                {
                    if (string.Equals(connectionMode, "External", StringComparison.OrdinalIgnoreCase) && string.Equals(databaseType, "Sqlite", StringComparison.OrdinalIgnoreCase))
                        result.Errors.Add(new WorkflowValidationError
                        {
                            NodeId = node.Id, Field = "Operation",
                            Message = "Database '" + label + "': StoredProcedure is not supported for SQLite.", Severity = "error"
                        });
                    if (string.IsNullOrWhiteSpace(GetConfigStr(node, "ProcedureName")))
                        result.Errors.Add(new WorkflowValidationError
                        {
                            NodeId = node.Id, Field = "ProcedureName",
                            Message = "Database '" + label + "': ProcedureName is required for StoredProcedure.", Severity = "error"
                        });
                }
                else
                {
                    if (string.IsNullOrWhiteSpace(GetConfigStr(node, "TableName")))
                        result.Errors.Add(new WorkflowValidationError
                        {
                            NodeId = node.Id, Field = "TableName",
                            Message = "Database '" + label + "': TableName is required.", Severity = "error"
                        });
                }
            }
            else if (node.Type == WorkflowNodeType.GoogleSheets)
            {
                if (string.IsNullOrWhiteSpace(GetConfigStr(node, "SpreadsheetId")))
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = node.Id, Field = "SpreadsheetId",
                        Message = "Google Sheets '" + label + "': SpreadsheetId is required.", Severity = "error"
                    });

                if (string.IsNullOrWhiteSpace(GetConfigStr(node, "Range")) && string.IsNullOrWhiteSpace(GetConfigStr(node, "SheetName")))
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = node.Id, Field = "Range",
                        Message = "Google Sheets '" + label + "': SheetName or Range is required.", Severity = "error"
                    });
            }
            else if (node.Type == WorkflowNodeType.Switch)
            {
                if (string.IsNullOrWhiteSpace(GetConfigStr(node, "FieldKey")))
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = node.Id, Field = "FieldKey",
                        Message = "Switch '" + label + "': FieldKey is required.", Severity = "warning"
                    });
            }
            else if (node.Type == WorkflowNodeType.Loop)
            {
                var sourceType = GetConfigStr(node, "SourceType");
                if (string.Equals(sourceType, "variable", StringComparison.OrdinalIgnoreCase))
                {
                    if (string.IsNullOrWhiteSpace(GetConfigStr(node, "VariableKey")))
                        result.Errors.Add(new WorkflowValidationError
                        {
                            NodeId = node.Id, Field = "VariableKey",
                            Message = "Loop '" + label + "': VariableKey is recommended when SourceType=variable.", Severity = "warning"
                        });
                }
                else if (string.IsNullOrWhiteSpace(GetConfigStr(node, "FieldKey")))
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = node.Id, Field = "FieldKey",
                        Message = "Loop '" + label + "': FieldKey is recommended when SourceType=field.", Severity = "warning"
                    });
            }
            else if (node.Type == WorkflowNodeType.Calculate)
            {
                string target = GetConfigStr(node, "TargetVariable");
                if (string.IsNullOrWhiteSpace(target))
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = node.Id, Field = "TargetVariable",
                        Message = "Calculate '" + label + "': TargetVariable is required.", Severity = "error"
                    });
                else
                {
                    bool declared = false;
                    if (def.Variables != null)
                        foreach (var v in def.Variables)
                            if (v.Key == target) { declared = true; break; }
                    if (!declared)
                        result.Errors.Add(new WorkflowValidationError
                        {
                            NodeId = node.Id, Field = "TargetVariable",
                            Message = "Variable '" + target + "' not declared in workflow variables.", Severity = "warning"
                        });
                }
            }
            else if (node.Type == WorkflowNodeType.Fork)
            {
                if (string.IsNullOrWhiteSpace(GetConfigStr(node, "JoinNodeId")))
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = node.Id, Field = "JoinNodeId",
                        Message = "Fork '" + label + "': JoinNodeId is required.", Severity = "error"
                    });
            }
            else if (node.Type == WorkflowNodeType.SetVariable)
            {
                if (string.IsNullOrWhiteSpace(GetConfigStr(node, "VariableKey")))
                    result.Errors.Add(new WorkflowValidationError
                    {
                        NodeId = node.Id, Field = "VariableKey",
                        Message = "SetVariable '" + label + "': VariableKey is required.", Severity = "error"
                    });
            }
        }

        // ─── Private helpers ─────────────────────────────────────────────────

        private string GetConfigStr(WorkflowNode node, string key)
        {
            if (node.Config == null) return null;
            object val = null;
            return node.Config.TryGetValue(key, out val) && val != null ? val.ToString() : null;
        }

        private bool TryNum(string s, out double result)
        {
            return double.TryParse(s,
                System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture,
                out result);
        }
    }
}
