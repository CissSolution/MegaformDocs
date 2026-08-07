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
    //  DelayNodeExecutor  [CloudReady A2 v20260806]
    //  Durable timer node ("a human task that needs no human"). Parks the
    //  execution with status=waiting + WaitUntilUtc; a host timer scanner
    //  (Web/Oqtane/Umbraco hosted service, DNN SchedulerClient) claims the row
    //  and resumes through IWorkflowEngine.ResumeAsync(executionId, "default").
    //
    //  Resume edge convention: the Delay node's outgoing edge must use the
    //  default source handle ("default") — same as every single-out node.
    // ══════════════════════════════════════════════════════════════════════════

    public class DelayNodeExecutor : INodeExecutor
    {
        private readonly IWorkflowEvaluator _evaluator;

        public WorkflowNodeType NodeType { get { return WorkflowNodeType.Delay; } }

        public DelayNodeExecutor(IWorkflowEvaluator evaluator)
        {
            _evaluator = evaluator;
        }

        public Task<WorkflowNodeResult> ExecuteAsync(
            WorkflowNode node,
            WorkflowExecutionContext ctx,
            CancellationToken ct)
        {
            if (node != null && node.IsDisabled)
                return Task.FromResult(WorkflowNodeResult.Skipped("handle::default"));

            DelayNodeConfig config;
            try
            {
                config = ParseConfig(node);
            }
            catch (Exception ex)
            {
                return Task.FromResult(WorkflowNodeResult.Failed("Delay: invalid config — " + ex.Message));
            }

            if (config.DelaySeconds <= 0 && string.IsNullOrWhiteSpace(config.UntilExpression))
            {
                return Task.FromResult(WorkflowNodeResult.Failed(
                    "Delay '" + (node != null ? (node.Label ?? node.Id) : "node") +
                    "': set DelaySeconds or UntilExpression."));
            }

            // Resolve {{field.x}} / {{variable.x}} tokens against the live context.
            // An unparseable value silently falls back to DelaySeconds — a bad field
            // value must not fail the whole execution.
            string resolvedUntil = null;
            if (!string.IsNullOrWhiteSpace(config.UntilExpression))
            {
                resolvedUntil = _evaluator != null
                    ? _evaluator.ResolveTemplate(config.UntilExpression, ctx)
                    : config.UntilExpression;
            }

            DateTime wakeUtc;
            var nowUtc = DateTime.UtcNow;
            if (!DelayTimeParser.TryResolveWakeTime(resolvedUntil, config.DelaySeconds, nowUtc, out wakeUtc))
            {
                return Task.FromResult(WorkflowNodeResult.Failed(
                    "Delay '" + (node != null ? (node.Label ?? node.Id) : "node") +
                    "': UntilExpression resolved to '" + (resolvedUntil ?? string.Empty) +
                    "', which is not a datetime or ISO-8601 duration, and DelaySeconds is not set."));
            }

            // A wake time in the past (or ~now) must not park the run at all —
            // walk on immediately so backdated due dates behave like no delay.
            if (wakeUtc <= nowUtc.AddSeconds(1))
            {
                return Task.FromResult(WorkflowNodeResult.Success("handle::default",
                    new { delay = true, wakeUtc = wakeUtc, skippedWait = true }));
            }

            return Task.FromResult(WorkflowNodeResult.WaitUntil(wakeUtc));
        }

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            var result = new WorkflowValidationResult { IsValid = true };
            var config = TryParseConfig(node);
            if (config == null ||
                (config.DelaySeconds <= 0 && string.IsNullOrWhiteSpace(config.UntilExpression)))
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId   = node != null ? node.Id : null,
                    Field    = "DelaySeconds",
                    Message  = "Delay '" + (node != null ? (node.Label ?? node.Id) : "node") +
                               "': set DelaySeconds or UntilExpression.",
                    Severity = "error"
                });
            }
            return result;
        }

        private static DelayNodeConfig ParseConfig(WorkflowNode node)
        {
            if (node == null || node.Config == null || node.Config.Count == 0)
                return new DelayNodeConfig();

            var json = JsonConvert.SerializeObject(node.Config);
            return JsonConvert.DeserializeObject<DelayNodeConfig>(json) ?? new DelayNodeConfig();
        }

        private static DelayNodeConfig TryParseConfig(WorkflowNode node)
        {
            try { return ParseConfig(node); }
            catch { return null; }
        }
    }
}
