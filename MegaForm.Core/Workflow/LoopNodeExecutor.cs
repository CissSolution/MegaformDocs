using System;
using System.Collections;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Workflow
{
    /// <summary>Minimal backend iterator for Loop nodes. Uses loop/done handles and stores current item/index in workflow variables.</summary>
    public class LoopNodeExecutor : INodeExecutor
    {
        public WorkflowNodeType NodeType { get { return WorkflowNodeType.Loop; } }

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            return new WorkflowValidationResult { IsValid = true };
        }

        public Task<WorkflowNodeResult> ExecuteAsync(WorkflowNode node, WorkflowExecutionContext ctx, CancellationToken ct)
        {
            if (node != null && node.IsDisabled)
                return Task.FromResult(WorkflowNodeResult.Skipped("handle::done"));

            LoopNodeConfig config;
            try
            {
                var json = JsonConvert.SerializeObject(node != null ? node.Config : null);
                config = JsonConvert.DeserializeObject<LoopNodeConfig>(json) ?? new LoopNodeConfig();
            }
            catch (Exception ex)
            {
                return Task.FromResult(WorkflowNodeResult.Failed("Loop: invalid config — " + ex.Message));
            }

            if (ctx.Variables == null) ctx.Variables = new Dictionary<string, object>();

            var items = ResolveItems(config, ctx);
            var stateKey = "__loop." + (node != null ? node.Id : "node") + ".index";
            var index = GetInt(ctx.Variables, stateKey);
            var max = config.MaxIterations > 0 ? config.MaxIterations : 25;

            if (items.Count == 0 || index >= items.Count || index >= max)
            {
                ctx.Variables.Remove(stateKey);
                return Task.FromResult(WorkflowNodeResult.Success("handle::done", new
                {
                    iterating = false,
                    total = items.Count,
                    index = index
                }));
            }

            var itemVar = string.IsNullOrWhiteSpace(config.ItemVariable) ? "loopItem" : config.ItemVariable;
            var indexVar = string.IsNullOrWhiteSpace(config.IndexVariable) ? "loopIndex" : config.IndexVariable;
            ctx.Variables[itemVar] = items[index];
            ctx.Variables[indexVar] = index;
            ctx.Variables[stateKey] = index + 1;

            return Task.FromResult(WorkflowNodeResult.Success("handle::loop", new
            {
                iterating = true,
                total = items.Count,
                index = index,
                itemVariable = itemVar,
                indexVariable = indexVar
            }));
        }

        private static int GetInt(Dictionary<string, object> vars, string key)
        {
            if (vars == null || string.IsNullOrWhiteSpace(key)) return 0;
            object raw;
            if (!vars.TryGetValue(key, out raw) || raw == null) return 0;
            int value;
            return int.TryParse(Convert.ToString(raw), out value) ? value : 0;
        }

        private static List<object> ResolveItems(LoopNodeConfig config, WorkflowExecutionContext ctx)
        {
            var source = ResolveSource(config, ctx);
            return ToObjectList(source);
        }

        private static object ResolveSource(LoopNodeConfig config, WorkflowExecutionContext ctx)
        {
            if (ctx == null || config == null) return null;
            object raw;
            if (string.Equals(config.SourceType, "variable", StringComparison.OrdinalIgnoreCase))
            {
                if (ctx.Variables != null && !string.IsNullOrWhiteSpace(config.VariableKey) && ctx.Variables.TryGetValue(config.VariableKey, out raw)) return raw;
                return null;
            }
            if (ctx.FormData != null && !string.IsNullOrWhiteSpace(config.FieldKey) && ctx.FormData.TryGetValue(config.FieldKey, out raw)) return raw;
            return null;
        }

        private static List<object> ToObjectList(object source)
        {
            var result = new List<object>();
            if (source == null) return result;

            var str = source as string;
            if (str != null)
            {
                var trimmed = str.Trim();
                if (trimmed.Length == 0) return result;
                if ((trimmed.StartsWith("[") && trimmed.EndsWith("]")) || (trimmed.StartsWith("{") && trimmed.EndsWith("}")))
                {
                    try
                    {
                        var token = JsonConvert.DeserializeObject(trimmed);
                        return ToObjectList(token);
                    }
                    catch { }
                }
                result.Add(str);
                return result;
            }

            if (source is IEnumerable && !(source is IDictionary))
            {
                foreach (var item in (IEnumerable)source) result.Add(item);
                return result;
            }

            result.Add(source);
            return result;
        }
    }
}
