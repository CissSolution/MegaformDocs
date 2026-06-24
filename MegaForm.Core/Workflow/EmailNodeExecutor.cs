using System;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Workflow
{
    /// <summary>
    /// Executor for SendEmail nodes.
    /// Resolves {{field.key}} and {{variable.name}} in To, Subject, Body.
    /// Uses IWorkflowEmailSender abstraction (reuses EmailNotificationService).
    /// </summary>
    public class EmailNodeExecutor : INodeExecutor
    {
        private readonly IWorkflowEvaluator   _evaluator;
        private readonly IWorkflowEmailSender _emailSender;

        public WorkflowNodeType NodeType => WorkflowNodeType.SendEmail;

        public EmailNodeExecutor(IWorkflowEvaluator evaluator, IWorkflowEmailSender emailSender)
        {
            _evaluator   = evaluator;
            _emailSender = emailSender;
        }

        public async Task<WorkflowNodeResult> ExecuteAsync(
            WorkflowNode node,
            WorkflowExecutionContext ctx,
            CancellationToken ct)
        {
            if (node.IsDisabled)
                return WorkflowNodeResult.Skipped("handle::default");

            SendEmailNodeConfig config;
            try { config = ParseConfig(node); }
            catch (Exception ex)
            {
                return WorkflowNodeResult.Failed("Invalid email config: " + ex.Message);
            }

            string to      = _evaluator.ResolveExpression(config.To ?? "", ctx);
            string cc      = _evaluator.ResolveExpression(config.Cc ?? "", ctx);
            string subject = _evaluator.ResolveExpression(config.Subject ?? "", ctx);
            string body    = _evaluator.ResolveExpression(config.Body ?? "", ctx);
            string replyTo = _evaluator.ResolveExpression(config.ReplyTo ?? "", ctx);

            if (string.IsNullOrWhiteSpace(to))
                return WorkflowNodeResult.Failed("Email recipient is empty after template resolution.");

            // Dry run — log only
            if (ctx.IsDryRun)
            {
                return WorkflowNodeResult.Success("handle::default", new
                {
                    dryRun = true, to, subject,
                });
            }

            try
            {
                await _emailSender.SendAsync(to, cc, subject, body, replyTo, ct);

                return WorkflowNodeResult.Success("handle::default", new
                {
                    sentTo  = to,
                    subject,
                });
            }
            catch (Exception ex)
            {
                return WorkflowNodeResult.Failed("Email send failed: " + ex.Message);
            }
        }

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            var result = new WorkflowValidationResult { IsValid = true };
            var config = TryParseConfig(node);

            if (config == null || string.IsNullOrWhiteSpace(config.To))
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId   = node.Id,
                    Field    = "To",
                    Message  = "SendEmail '" + (node.Label ?? node.Id) + "': recipient is required.",
                    Severity = "error",
                });
            }
            if (config != null && string.IsNullOrWhiteSpace(config.Subject))
            {
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId   = node.Id,
                    Field    = "Subject",
                    Message  = "SendEmail '" + (node.Label ?? node.Id) + "': subject is recommended.",
                    Severity = "warning",
                });
            }
            return result;
        }

        private SendEmailNodeConfig ParseConfig(WorkflowNode node)
        {
            if (node.Config == null || node.Config.Count == 0)
                return new SendEmailNodeConfig();
            string json = JsonConvert.SerializeObject(node.Config);
            return JsonConvert.DeserializeObject<SendEmailNodeConfig>(json)
                   ?? new SendEmailNodeConfig();
        }

        private SendEmailNodeConfig TryParseConfig(WorkflowNode node)
        {
            try { return ParseConfig(node); } catch { return null; }
        }
    }
}
