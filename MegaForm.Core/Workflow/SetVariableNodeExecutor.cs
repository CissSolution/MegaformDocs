using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Workflow
{
    // ══════════════════════════════════════════════════════════════════════════
    //  SetVariableNodeExecutor
    //  Sets a workflow variable to a resolved value.
    // ══════════════════════════════════════════════════════════════════════════

    public class SetVariableNodeExecutor : INodeExecutor
    {
        private readonly IWorkflowEvaluator _evaluator;

        public WorkflowNodeType NodeType => WorkflowNodeType.SetVariable;

        public SetVariableNodeExecutor(IWorkflowEvaluator evaluator)
        {
            _evaluator = evaluator;
        }

        // ─── INodeExecutor.Validate ───────────────────────────────────────────

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            var result = new WorkflowValidationResult { IsValid = true };
            var label  = node.Label ?? node.Id;

            string key = null;
            if (node.Config != null)
            {
                object val;
                if (node.Config.TryGetValue("VariableKey", out val) && val != null)
                    key = val.ToString();
            }

            if (string.IsNullOrWhiteSpace(key))
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId   = node.Id,
                    Field    = "VariableKey",
                    Message  = "SetVariable '" + label + "': VariableKey is required.",
                    Severity = "error",
                });
            }

            return result;
        }

        // ─── INodeExecutor.ExecuteAsync ───────────────────────────────────────

        public Task<WorkflowNodeResult> ExecuteAsync(
            WorkflowNode node,
            WorkflowExecutionContext ctx,
            CancellationToken ct)
        {
            if (node.IsDisabled)
                return Task.FromResult(WorkflowNodeResult.Skipped("handle::default"));

            SetVariableNodeConfig config;
            try
            {
                var json = JsonConvert.SerializeObject(
                    node.Config ?? new Dictionary<string, object>());
                config = JsonConvert.DeserializeObject<SetVariableNodeConfig>(json)
                         ?? new SetVariableNodeConfig();
            }
            catch (Exception ex)
            {
                return Task.FromResult(
                    WorkflowNodeResult.Failed("SetVariable: invalid config — " + ex.Message));
            }

            if (string.IsNullOrWhiteSpace(config.VariableKey))
                return Task.FromResult(
                    WorkflowNodeResult.Failed("SetVariable: VariableKey is required."));

            var resolved = string.IsNullOrEmpty(config.Value)
                ? ""
                : _evaluator.ResolveTemplate(config.Value, ctx);

            if (ctx.Variables == null)
                ctx.Variables = new Dictionary<string, object>();

            ctx.Variables[config.VariableKey] = resolved;

            return Task.FromResult(
                WorkflowNodeResult.Success("handle::default",
                    new { variableKey = config.VariableKey, value = resolved }));
        }
    }
}
