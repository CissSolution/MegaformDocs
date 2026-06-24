using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;

namespace MegaForm.Core.Services.Workflow
{
    /// <summary>
    /// Executor for Condition nodes (If/Else branching).
    /// Sync evaluation wrapped in Task.FromResult — no async needed.
    /// Output: routes to "true" or "false" edge handle.
    /// </summary>
    public class ConditionNodeExecutor : INodeExecutor
    {
        private readonly IWorkflowEvaluator _evaluator;

        public WorkflowNodeType NodeType => WorkflowNodeType.Condition;

        public ConditionNodeExecutor(IWorkflowEvaluator evaluator)
        {
            _evaluator = evaluator;
        }

        public Task<WorkflowNodeResult> ExecuteAsync(
            WorkflowNode node,
            WorkflowExecutionContext ctx,
            CancellationToken ct)
        {
            if (node.IsDisabled)
                return Task.FromResult(NextViaHandle(node, ctx, "true"));

            // Get ConditionsJson from config
            string conditionsJson = GetConfigStr(node, "ConditionsJson");

            // Merge FormData + Variables for evaluation
            var data = MergeData(ctx);

            bool result = _evaluator.EvaluateCondition(conditionsJson, data);
            string handle = result ? "true" : "false";

            var output = new { conditionResult = result, handle };
            return Task.FromResult(NextViaHandle(node, ctx, handle, output));
        }

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            var result = new WorkflowValidationResult { IsValid = true };
            string condJson = GetConfigStr(node, "ConditionsJson");
            if (string.IsNullOrWhiteSpace(condJson))
            {
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId   = node.Id,
                    Field    = "ConditionsJson",
                    Message  = "Condition node '" + (node.Label ?? node.Id) + "': conditions are required.",
                    Severity = "warning", // warning, not error — empty = always true
                });
            }
            return result;
        }

        // ─── Helpers ─────────────────────────────────────────────────────────

        private WorkflowNodeResult NextViaHandle(
            WorkflowNode node,
            WorkflowExecutionContext ctx,
            string handle,
            object output = null)
        {
            // Next node is determined by the engine via edge lookup — we return handle as hint
            // Engine resolves: find edge where SourceNodeId=node.Id AND SourceHandle=handle
            return new WorkflowNodeResult
            {
                Status     = "success",
                NextNodeId = ResolveNextNode(node, ctx, handle),
                OutputData = output,
            };
        }

        private string ResolveNextNode(WorkflowNode node, WorkflowExecutionContext ctx, string handle)
        {
            // The engine (WorkflowEngine.cs) passes the full definition — but executors
            // don't have direct access to edges. We encode the handle in NextNodeId
            // using a special format that the engine unwraps: "handle::<handle_value>"
            // Engine will resolve the actual target node from edges.
            return "handle::" + handle;
        }

        private System.Collections.Generic.Dictionary<string, object> MergeData(
            WorkflowExecutionContext ctx)
        {
            var merged = new System.Collections.Generic.Dictionary<string, object>(
                System.StringComparer.OrdinalIgnoreCase);

            if (ctx.FormData != null)
                foreach (var kvp in ctx.FormData)
                    merged[kvp.Key] = kvp.Value;

            if (ctx.Variables != null)
                foreach (var kvp in ctx.Variables)
                    merged["variable." + kvp.Key] = kvp.Value;

            return merged;
        }

        private string GetConfigStr(WorkflowNode node, string key)
        {
            if (node.Config == null) return null;
            object val = null;
            return node.Config.TryGetValue(key, out val) && val != null ? val.ToString() : null;
        }
    }
}
