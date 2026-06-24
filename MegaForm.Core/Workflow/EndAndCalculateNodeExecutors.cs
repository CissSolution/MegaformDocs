using System;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Workflow
{
    // ══════════════════════════════════════════════════════════════════════════
    //  EndNodeExecutor
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Executor for End nodes — terminal node, stops workflow execution.
    /// Resolves success message / redirect URL templates.
    /// </summary>
    public class EndNodeExecutor : INodeExecutor
    {
        private readonly IWorkflowEvaluator _evaluator;

        public WorkflowNodeType NodeType => WorkflowNodeType.End;

        public EndNodeExecutor(IWorkflowEvaluator evaluator)
        {
            _evaluator = evaluator;
        }

        public Task<WorkflowNodeResult> ExecuteAsync(
            WorkflowNode node,
            WorkflowExecutionContext ctx,
            CancellationToken ct)
        {
            EndNodeConfig config;
            try { config = ParseConfig(node); }
            catch { config = new EndNodeConfig(); }

            string message     = _evaluator.ResolveExpression(config.Message ?? "", ctx);
            string redirectUrl = _evaluator.ResolveExpression(config.RedirectUrl ?? "", ctx);

            // Store resolved end state in context for caller (SubmissionProcessor/Controller)
            if (ctx.NodeResults == null)
                ctx.NodeResults = new System.Collections.Generic.Dictionary<string, object>();

            ctx.NodeResults["__end"] = new
            {
                endType     = config.EndType.ToString(),
                message,
                redirectUrl,
            };

            // NextNodeId = null → engine stops walking
            return Task.FromResult(new WorkflowNodeResult
            {
                Status     = config.EndType == EndType.Failure ? "failed" : "success",
                NextNodeId = null,
                OutputData = new { message, redirectUrl, endType = config.EndType.ToString() },
            });
        }

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            return new WorkflowValidationResult { IsValid = true };
        }

        private EndNodeConfig ParseConfig(WorkflowNode node)
        {
            if (node.Config == null || node.Config.Count == 0)
                return new EndNodeConfig();
            return JsonConvert.DeserializeObject<EndNodeConfig>(
                       JsonConvert.SerializeObject(node.Config))
                   ?? new EndNodeConfig();
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  CalculateNodeExecutor
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Executor for Calculate nodes — performs arithmetic on WorkflowVariables.
    /// V1.5 node type. Sync evaluation wrapped in Task.FromResult.
    /// </summary>
    public class CalculateNodeExecutor : INodeExecutor
    {
        private readonly IWorkflowEvaluator _evaluator;

        public WorkflowNodeType NodeType => WorkflowNodeType.Calculate;

        public CalculateNodeExecutor(IWorkflowEvaluator evaluator)
        {
            _evaluator = evaluator;
        }

        public Task<WorkflowNodeResult> ExecuteAsync(
            WorkflowNode node,
            WorkflowExecutionContext ctx,
            CancellationToken ct)
        {
            if (node.IsDisabled)
                return Task.FromResult(WorkflowNodeResult.Skipped("handle::default"));

            CalculateNodeConfig config;
            try { config = ParseConfig(node); }
            catch (Exception ex)
            {
                return Task.FromResult(WorkflowNodeResult.Failed("Invalid calculate config: " + ex.Message));
            }

            if (string.IsNullOrWhiteSpace(config.TargetVariable))
                return Task.FromResult(WorkflowNodeResult.Failed("TargetVariable is required."));

            double result = _evaluator.Calculate(
                config.Operand1 ?? "0",
                config.Operator,
                config.Operand2 ?? "0",
                ctx);

            object finalValue = config.RoundToInt ? (object)(int)Math.Round(result) : result;

            // Write result back into ctx.Variables
            if (ctx.Variables == null)
                ctx.Variables = new System.Collections.Generic.Dictionary<string, object>(
                    StringComparer.OrdinalIgnoreCase);

            ctx.Variables[config.TargetVariable] = finalValue;

            return Task.FromResult(WorkflowNodeResult.Success("handle::default", new
            {
                targetVariable = config.TargetVariable,
                result         = finalValue,
            }));
        }

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            var result = new WorkflowValidationResult { IsValid = true };
            var config = TryParseConfig(node);
            if (config == null || string.IsNullOrWhiteSpace(config.TargetVariable))
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId   = node.Id,
                    Field    = "TargetVariable",
                    Message  = "Calculate '" + (node.Label ?? node.Id) + "': TargetVariable is required.",
                    Severity = "error",
                });
            }
            return result;
        }

        private CalculateNodeConfig ParseConfig(WorkflowNode node)
        {
            if (node.Config == null || node.Config.Count == 0)
                return new CalculateNodeConfig();
            return JsonConvert.DeserializeObject<CalculateNodeConfig>(
                       JsonConvert.SerializeObject(node.Config))
                   ?? new CalculateNodeConfig();
        }

        private CalculateNodeConfig TryParseConfig(WorkflowNode node)
        {
            try { return ParseConfig(node); } catch { return null; }
        }
    }
}
