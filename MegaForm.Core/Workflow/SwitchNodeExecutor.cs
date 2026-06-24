using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Workflow
{
    /// <summary>Minimal backend executor for Switch nodes. Routes to case:n or default.</summary>
    public class SwitchNodeExecutor : INodeExecutor
    {
        public WorkflowNodeType NodeType { get { return WorkflowNodeType.Switch; } }

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            return new WorkflowValidationResult { IsValid = true };
        }

        public Task<WorkflowNodeResult> ExecuteAsync(WorkflowNode node, WorkflowExecutionContext ctx, CancellationToken ct)
        {
            if (node != null && node.IsDisabled)
                return Task.FromResult(WorkflowNodeResult.Skipped("handle::default"));

            SwitchNodeConfig config;
            try
            {
                var json = JsonConvert.SerializeObject(node != null ? node.Config : null);
                config = JsonConvert.DeserializeObject<SwitchNodeConfig>(json) ?? new SwitchNodeConfig();
                if (config.Cases == null) config.Cases = new List<SwitchCaseConfig>();
            }
            catch (Exception ex)
            {
                return Task.FromResult(WorkflowNodeResult.Failed("Switch: invalid config — " + ex.Message));
            }

            var raw = ResolveValue(config.FieldKey, ctx);
            var actual = raw == null ? string.Empty : Convert.ToString(raw);
            var mode = (config.MatchMode ?? "equals").Trim().ToLowerInvariant();

            for (var i = 0; i < config.Cases.Count; i++)
            {
                var c = config.Cases[i] ?? new SwitchCaseConfig();
                var expected = c.Value ?? string.Empty;
                if (IsMatch(actual, expected, mode))
                {
                    return Task.FromResult(WorkflowNodeResult.Success("handle::case:" + i, new
                    {
                        matched = true,
                        caseIndex = i,
                        caseId = string.IsNullOrWhiteSpace(c.Id) ? ("case-" + i) : c.Id,
                        caseLabel = c.Label ?? string.Empty,
                        value = actual ?? string.Empty
                    }));
                }
            }

            return Task.FromResult(WorkflowNodeResult.Success("handle::default", new
            {
                matched = false,
                caseIndex = -1,
                value = actual ?? string.Empty
            }));
        }

        private static bool IsMatch(string actual, string expected, string mode)
        {
            actual = actual ?? string.Empty;
            expected = expected ?? string.Empty;
            if (string.Equals(mode, "contains", StringComparison.OrdinalIgnoreCase))
                return actual.IndexOf(expected, StringComparison.OrdinalIgnoreCase) >= 0;
            return string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);
        }

        private static object ResolveValue(string fieldKey, WorkflowExecutionContext ctx)
        {
            if (string.IsNullOrWhiteSpace(fieldKey) || ctx == null) return null;
            object raw;
            if (ctx.FormData != null && ctx.FormData.TryGetValue(fieldKey, out raw)) return raw;
            if (ctx.Variables != null && ctx.Variables.TryGetValue(fieldKey, out raw)) return raw;
            if (ctx.Variables != null && ctx.Variables.TryGetValue("variable." + fieldKey, out raw)) return raw;
            return null;
        }
    }
}
