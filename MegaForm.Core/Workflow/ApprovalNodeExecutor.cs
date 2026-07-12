using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Workflow
{
    /// <summary>
    /// Human approval node. Creates a task, moves the execution into Waiting,
    /// and lets the host resume later through WorkflowTaskService.
    /// </summary>
    public class ApprovalNodeExecutor : INodeExecutor
    {
        private readonly IWorkflowRepository _repo;
        private readonly ISubmissionRepository _submissionRepo;
        private readonly IWorkflowEvaluator _evaluator;
        private readonly IWorkflowEmailSender _emailSender;
        private readonly IWorkflowPrincipalResolver _principalResolver;
        private readonly ILogService _log;

        public WorkflowNodeType NodeType { get { return WorkflowNodeType.Approval; } }

        public ApprovalNodeExecutor(
            IWorkflowRepository repo,
            ISubmissionRepository submissionRepo,
            ILogService log = null)
        {
            _repo = repo;
            _submissionRepo = submissionRepo;
            _log = log;
        }

        public ApprovalNodeExecutor(
            IWorkflowRepository repo,
            ISubmissionRepository submissionRepo,
            IWorkflowEvaluator evaluator,
            IWorkflowEmailSender emailSender,
            IWorkflowPrincipalResolver principalResolver,
            ILogService log = null)
        {
            _repo = repo;
            _submissionRepo = submissionRepo;
            _evaluator = evaluator;
            _emailSender = emailSender;
            _principalResolver = principalResolver;
            _log = log;
        }

        public async Task<WorkflowNodeResult> ExecuteAsync(
            WorkflowNode node,
            WorkflowExecutionContext ctx,
            CancellationToken ct)
        {
            if (node != null && node.IsDisabled)
                return WorkflowNodeResult.Skipped("handle::default");

            ApprovalNodeConfig config;
            try
            {
                config = ParseConfig(node);
            }
            catch (Exception ex)
            {
                return WorkflowNodeResult.Failed("Approval: invalid config - " + ex.Message);
            }

            if ((config.CandidateRoles == null || config.CandidateRoles.Count == 0) &&
                (config.CandidateUsers == null || config.CandidateUsers.Count == 0))
            {
                return WorkflowNodeResult.Failed("Approval requires at least one candidate role or user.");
            }

            if (ctx.IsDryRun)
            {
                return WorkflowNodeResult.Waiting(new
                {
                    dryRun = true,
                    approval = true,
                    nodeId = node != null ? node.Id : string.Empty
                });
            }

            var workflowCase = GetOrCreateCase(ctx, node);
            var task = _repo.GetActiveTask(ctx.ExecutionId, node.Id);
            var created = false;
            if (task == null)
            {
                created = true;
                task = BuildTask(ctx, node, workflowCase, config);
                AssignDirectlyIfSingleUser(task, ctx);
                _repo.SaveTask(task);
            }

            workflowCase.CurrentNodeId = node.Id;
            workflowCase.ActiveTaskId = task.TaskId;
            workflowCase.Status = WorkflowCaseStatus.Waiting;
            _repo.SaveCase(workflowCase);

            if (created)
            {
                _repo.AddTaskAction(new WorkflowTaskAction
                {
                    TaskId = task.TaskId,
                    CaseId = workflowCase.CaseId,
                    ExecutionId = ctx.ExecutionId,
                    FormId = ctx.FormId,
                    SubmissionId = ctx.SubmissionId,
                    ActionType = WorkflowTaskActionType.Created,
                    Comment = "Approval task created."
                });

                await SendCreateNotificationAsync(task, config, ctx, ct).ConfigureAwait(false);
            }

            ctx.CaseId = workflowCase.CaseId;
            ctx.PendingTaskId = task.TaskId;

            if (ctx.SubmissionId > 0 && !string.IsNullOrWhiteSpace(task.PendingSubmissionStatus))
            {
                try
                {
                    _submissionRepo.UpdateStatus(ctx.SubmissionId, task.PendingSubmissionStatus);
                }
                catch (Exception ex)
                {
                    _log?.LogWarning("MegaForm.Workflow", "Approval pending status update failed: " + ex.Message);
                }
            }

            return WorkflowNodeResult.Waiting(new
            {
                caseId = workflowCase.CaseId,
                taskId = task.TaskId,
                nodeId = node.Id,
                nodeLabel = task.NodeLabel
            });
        }

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            var result = new WorkflowValidationResult { IsValid = true };
            var config = TryParseConfig(node);
            if (config == null ||
                ((config.CandidateRoles == null || config.CandidateRoles.Count == 0) &&
                 (config.CandidateUsers == null || config.CandidateUsers.Count == 0)))
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId = node != null ? node.Id : null,
                    Field = "CandidateRoles",
                    Message = "Approval '" + ((node != null ? (node.Label ?? node.Id) : "node")) + "': choose at least one candidate role or user.",
                    Severity = "error"
                });
            }
            return result;
        }

        private WorkflowCaseInstance GetOrCreateCase(WorkflowExecutionContext ctx, WorkflowNode node)
        {
            WorkflowCaseInstance workflowCase = null;
            if (!string.IsNullOrWhiteSpace(ctx.CaseId))
                workflowCase = _repo.GetCase(ctx.CaseId);
            if (workflowCase == null)
                workflowCase = _repo.GetCaseByExecution(ctx.ExecutionId);

            if (workflowCase != null)
                return workflowCase;

            SubmissionInfo submission = null;
            if (ctx.SubmissionId > 0)
            {
                try { submission = _submissionRepo.Get(ctx.SubmissionId); }
                catch { }
            }

            // [Submitter fix 2026-07-12] The case used to record the NUMERIC user id
            // as the "name" ("3"). The submit pipeline now stamps the real actor into
            // the workflow data (__actorUserName/__actorDisplayName) — prefer those.
            string startedByName = string.Empty;
            if (ctx.FormData != null)
            {
                object raw;
                if (ctx.FormData.TryGetValue("__actorDisplayName", out raw) && raw != null)
                    startedByName = raw.ToString();
                if (string.IsNullOrWhiteSpace(startedByName) &&
                    ctx.FormData.TryGetValue("__actorUserName", out raw) && raw != null)
                    startedByName = raw.ToString();
                if (startedByName == "anonymous" || startedByName.StartsWith("user-", StringComparison.Ordinal))
                    startedByName = string.Empty;
            }
            if (string.IsNullOrWhiteSpace(startedByName) && submission != null && submission.UserId.HasValue)
                startedByName = submission.UserId.Value.ToString();

            return new WorkflowCaseInstance
            {
                ExecutionId = ctx.ExecutionId,
                FormId = ctx.FormId,
                SubmissionId = ctx.SubmissionId,
                CurrentNodeId = node != null ? node.Id : string.Empty,
                StartedByUserId = submission != null ? submission.UserId : null,
                StartedByUserName = startedByName ?? string.Empty,
                Status = WorkflowCaseStatus.Waiting
            };
        }

        private static WorkflowTaskInstance BuildTask(
            WorkflowExecutionContext ctx,
            WorkflowNode node,
            WorkflowCaseInstance workflowCase,
            ApprovalNodeConfig config)
        {
            var task = new WorkflowTaskInstance
            {
                CaseId = workflowCase.CaseId,
                ExecutionId = ctx.ExecutionId,
                FormId = ctx.FormId,
                SubmissionId = ctx.SubmissionId,
                NodeId = node != null ? node.Id : string.Empty,
                NodeLabel = node != null ? (node.Label ?? node.Id) : string.Empty,
                AllowClaim = config.AllowClaim,
                AllowForward = config.AllowForward,
                AllowReassign = config.AllowReassign,
                CommentRequiredOnReject = config.CommentRequiredOnReject,
                PendingSubmissionStatus = config.PendingSubmissionStatus ?? "pending_approval",
                ApprovedSubmissionStatus = config.ApprovedSubmissionStatus ?? "approved",
                RejectedSubmissionStatus = config.RejectedSubmissionStatus ?? "rejected"
            };

            if (config.CandidateRoles != null)
                task.CandidateRoles = config.CandidateRoles
                    .Where(v => !string.IsNullOrWhiteSpace(v))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
            if (config.CandidateUsers != null)
                task.CandidateUsers = config.CandidateUsers
                    .Where(v => !string.IsNullOrWhiteSpace(v))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
            if (config.DueInHours > 0)
                task.DueAt = DateTime.UtcNow.AddHours(config.DueInHours);

            return task;
        }

        /// <summary>
        /// When a step names exactly ONE person, hand the task to them instead of dropping it into a
        /// queue they have to claim.
        ///
        /// Until now every task was a pull: candidate roles/users were recorded, AssignedUserId stayed
        /// null, and the task sat in "Incoming" until somebody clicked Claim. A workflow that says
        /// "this goes to Nam" was therefore indistinguishable from "anyone in Finance may take this" —
        /// Nam had to find it himself. A step that names several people, or a role, still queues: with
        /// more than one candidate there is nobody to hand it to, and claiming is what prevents two
        /// approvers working the same task.
        /// </summary>
        private void AssignDirectlyIfSingleUser(WorkflowTaskInstance task, WorkflowExecutionContext ctx)
        {
            if (task == null || task.AssignedUserId.HasValue) return;
            if (task.CandidateUsers == null || task.CandidateUsers.Count != 1) return;
            if (_principalResolver == null) return;   // no identity source: leave it claimable

            var candidate = task.CandidateUsers[0];
            UserPrincipal user = null;
            try { user = _principalResolver.ResolveUser(candidate, GetPortalId(ctx)); }
            catch (Exception ex) { _log?.LogWarning("MegaForm.Workflow", "Approval assignee resolve failed: " + ex.Message); }

            // An unresolvable name must not silently become "assigned to nobody" — leave the task in
            // the queue so a human still sees it.
            if (user == null || !user.UserId.HasValue || user.UserId.Value <= 0) return;

            task.AssignedUserId = user.UserId;
            task.AssignedUserName = user.UserName ?? candidate;
            task.AssignedDisplayName = string.IsNullOrWhiteSpace(user.DisplayName) ? (user.UserName ?? candidate) : user.DisplayName;
            task.ClaimedAt = DateTime.UtcNow;
        }

        private ApprovalNodeConfig ParseConfig(WorkflowNode node)
        {
            if (node == null || node.Config == null || node.Config.Count == 0)
                return new ApprovalNodeConfig();

            var json = JsonConvert.SerializeObject(node.Config);
            var config = JsonConvert.DeserializeObject<ApprovalNodeConfig>(json) ?? new ApprovalNodeConfig();
            config.CandidateRoles = ReadStringList(node.Config, "CandidateRoles", "candidateRoles", config.CandidateRoles);
            config.CandidateUsers = ReadStringList(node.Config, "CandidateUsers", "candidateUsers", config.CandidateUsers);
            return config;
        }

        private ApprovalNodeConfig TryParseConfig(WorkflowNode node)
        {
            try { return ParseConfig(node); }
            catch { return null; }
        }

        private static List<string> ReadStringList(
            IDictionary<string, object> config,
            string primaryKey,
            string secondaryKey,
            List<string> fallback)
        {
            object raw = null;
            if (config != null)
            {
                if (!config.TryGetValue(primaryKey, out raw))
                    config.TryGetValue(secondaryKey, out raw);
            }

            if (raw == null)
                return fallback ?? new List<string>();

            var list = raw as IEnumerable<object>;
            if (list != null && !(raw is string))
                return list.Select(v => v == null ? string.Empty : v.ToString())
                    .Where(v => !string.IsNullOrWhiteSpace(v))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

            var text = raw.ToString();
            if (string.IsNullOrWhiteSpace(text))
                return new List<string>();

            if (text.StartsWith("[", StringComparison.Ordinal))
            {
                try
                {
                    return JsonConvert.DeserializeObject<List<string>>(text) ?? new List<string>();
                }
                catch { }
            }

            return text
                .Split(new[] { ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(v => v.Trim())
                .Where(v => v.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        private async Task SendCreateNotificationAsync(
            WorkflowTaskInstance task,
            ApprovalNodeConfig config,
            WorkflowExecutionContext ctx,
            CancellationToken ct)
        {
            if (!config.NotifyOnCreate || _emailSender == null)
                return;

            var recipients = ResolveTaskRecipients(task, ctx);
            if (recipients.Count == 0)
                return;

            string subject = !string.IsNullOrWhiteSpace(config.NotifyCreateSubject) && _evaluator != null
                ? _evaluator.ResolveExpression(config.NotifyCreateSubject, ctx)
                : EmailNotificationService.GetTaskCreatedDefaultSubject(task);

            string body = !string.IsNullOrWhiteSpace(config.NotifyCreateBody) && _evaluator != null
                ? _evaluator.ResolveExpression(config.NotifyCreateBody, ctx)
                : EmailNotificationService.GetTaskCreatedDefaultBody(task);

            await SendToRecipientsAsync(recipients, subject, body, ct).ConfigureAwait(false);
        }

        private List<string> ResolveTaskRecipients(WorkflowTaskInstance task, WorkflowExecutionContext ctx)
        {
            var emails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var portalId = GetPortalId(ctx);

            foreach (var userRef in task.CandidateUsers ?? new List<string>())
            {
                var value = (userRef ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(value)) continue;

                if (value.IndexOf('@') >= 0)
                {
                    emails.Add(value);
                }
                else if (_principalResolver != null)
                {
                    var user = _principalResolver.ResolveUser(value, portalId);
                    if (user != null && !string.IsNullOrWhiteSpace(user.Email))
                        emails.Add(user.Email);
                }
            }

            foreach (var roleName in task.CandidateRoles ?? new List<string>())
            {
                if (_principalResolver == null) continue;
                foreach (var user in _principalResolver.ResolveRoleMembers(roleName, portalId))
                {
                    if (!string.IsNullOrWhiteSpace(user.Email))
                        emails.Add(user.Email);
                }
            }

            return emails.ToList();
        }

        private async Task SendToRecipientsAsync(List<string> recipients, string subject, string body, CancellationToken ct)
        {
            var tasks = new List<Task>();
            foreach (var to in recipients)
            {
                var email = to;
                tasks.Add(Task.Run(async () =>
                {
                    try
                    {
                        await _emailSender.SendAsync(email, null, subject, body, null, ct).ConfigureAwait(false);
                    }
                    catch (Exception ex)
                    {
                        _log?.LogWarning("MegaForm.Workflow", "Task notification email failed: " + ex.Message);
                    }
                }, ct));
            }
            await Task.WhenAll(tasks).ConfigureAwait(false);
        }

        private static int GetPortalId(WorkflowExecutionContext ctx)
        {
            if (ctx?.FormData == null) return 0;
            object raw;
            if (ctx.FormData.TryGetValue("__portalId", out raw))
            {
                int portalId;
                if (int.TryParse(raw?.ToString(), out portalId)) return portalId;
            }
            return 0;
        }
    }
}
