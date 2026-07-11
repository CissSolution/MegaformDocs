using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Shared human-task operations. Hosts only need to resolve the current user
    /// and expose UI/API shells on top of this service.
    /// </summary>
    public class WorkflowTaskService
    {
        private readonly IWorkflowRepository _repo;
        private readonly IWorkflowEngine _engine;
        private readonly ISubmissionRepository _submissionRepo;
        private readonly IWorkflowEvaluator _evaluator;
        private readonly IWorkflowEmailSender _emailSender;
        private readonly IWorkflowPrincipalResolver _principalResolver;
        private readonly ILogService _log;
        private readonly DocumentRevisionService _documentRevisionService;

        public WorkflowTaskService(
            IWorkflowRepository repo,
            IWorkflowEngine engine,
            ISubmissionRepository submissionRepo,
            ILogService log = null,
            DocumentRevisionService documentRevisionService = null)
        {
            _repo = repo;
            _engine = engine;
            _submissionRepo = submissionRepo;
            _log = log;
            _documentRevisionService = documentRevisionService;
        }

        public WorkflowTaskService(
            IWorkflowRepository repo,
            IWorkflowEngine engine,
            ISubmissionRepository submissionRepo,
            IWorkflowEvaluator evaluator,
            IWorkflowEmailSender emailSender,
            IWorkflowPrincipalResolver principalResolver,
            ILogService log = null,
            DocumentRevisionService documentRevisionService = null)
            : this(repo, engine, submissionRepo, log, documentRevisionService)
        {
            _evaluator = evaluator;
            _emailSender = emailSender;
            _principalResolver = principalResolver;
        }

        public WorkflowInboxResult GetInbox(UserContext actor, int pageIndex, int pageSize)
        {
            EnsureActor(actor);

            if (pageSize <= 0) pageSize = 20;
            if (pageSize > 100) pageSize = 100;
            if (pageIndex < 0) pageIndex = 0;

            var query = new WorkflowTaskQuery
            {
                OpenOnly = true,
                PageIndex = 0,
                PageSize = 500
            };

            var tasks = _repo.ListTasks(query) ?? new List<WorkflowTaskInstance>();
            var ordered = tasks
                .OrderBy(t => t.DueAt ?? DateTime.MaxValue)
                .ThenByDescending(t => t.CreatedAt)
                .ToList();

            var result = new WorkflowInboxResult();
            foreach (var task in ordered)
            {
                if (IsAssignedToActor(task, actor))
                    result.MyTasks.Add(task);
                else if (CanActorClaim(task, actor))
                    result.RoleQueue.Add(task);
            }

            result.MyTasks = ApplyPaging(result.MyTasks, pageIndex, pageSize);
            result.RoleQueue = ApplyPaging(result.RoleQueue, pageIndex, pageSize);
            return result;
        }

        /// <summary>
        /// Personal workboard for the "My Inbox" surface. Splits the open task set into
        /// Incoming (claimable by me) and InProgress (assigned to me), then adds a recent
        /// slice of Completed tasks I acted on. Admins/superusers see all completed tasks.
        /// </summary>
        public WorkflowWorkboardResult GetWorkboard(UserContext actor, int recentCompleted = 25)
        {
            EnsureActor(actor);
            if (recentCompleted <= 0) recentCompleted = 25;
            if (recentCompleted > 200) recentCompleted = 200;

            var result = new WorkflowWorkboardResult();
            var now = DateTime.UtcNow;

            var openTasks = _repo.ListTasks(new WorkflowTaskQuery { OpenOnly = true, PageIndex = 0, PageSize = 500 })
                ?? new List<WorkflowTaskInstance>();
            var orderedOpen = openTasks
                .OrderBy(t => t.DueAt ?? DateTime.MaxValue)
                .ThenByDescending(t => t.CreatedAt)
                .ToList();

            foreach (var task in orderedOpen)
            {
                if (IsAssignedToActor(task, actor))
                    result.InProgress.Add(task);
                else if (CanActorClaim(task, actor))
                    result.Incoming.Add(task);
            }

            result.OverdueCount = result.InProgress
                .Concat(result.Incoming)
                .Count(t => t.DueAt.HasValue && t.DueAt.Value < now);

            var allTasks = _repo.ListTasks(new WorkflowTaskQuery { OpenOnly = false, PageIndex = 0, PageSize = 500 })
                ?? new List<WorkflowTaskInstance>();
            var canSeeAll = actor.IsAdmin || actor.IsSuperUser;
            result.Completed = allTasks
                .Where(t => t.Status == WorkflowTaskStatus.Completed && (canSeeAll || IsAssignedToActor(t, actor)))
                .OrderByDescending(t => t.CompletedAt ?? t.CreatedAt)
                .Take(recentCompleted)
                .ToList();

            return result;
        }

        public WorkflowTaskOperationResult GetTask(string taskId, UserContext actor)
        {
            EnsureActor(actor);
            var task = RequireTask(taskId);
            EnsureVisible(task, actor);
            return BuildResult(task);
        }

        // [SendToInbox v20260625] Ad-hoc routing: send a submission to a chosen user's inbox
        // WITHOUT a pre-configured workflow. Creates a single-step review task assigned directly
        // to the target user (mirrors ForwardTaskAsync's assignment), so it lands in that user's
        // My Inbox "In Progress". Additive — does not touch the existing engine-driven task path.
        public WorkflowTaskInstance CreateAdHocReviewTask(int formId, int submissionId, string targetUser, string title, string comment, UserContext actor)
        {
            EnsureActor(actor);
            if (string.IsNullOrWhiteSpace(targetUser))
                throw new InvalidOperationException("targetUser is required.");

            var nowUtc = DateTime.UtcNow;
            var caseInst = new WorkflowCaseInstance
            {
                CaseId = Guid.NewGuid().ToString("N"),
                FormId = formId,
                SubmissionId = submissionId,
                WorkflowId = "adhoc-inbox",
                CurrentNodeId = "adhoc-review",
                Status = WorkflowCaseStatus.Running,
                StartedByUserId = actor.UserId,
                StartedByUserName = actor.UserName ?? string.Empty,
                CreatedAt = nowUtc,
            };
            var task = new WorkflowTaskInstance
            {
                CaseId = caseInst.CaseId,
                FormId = formId,
                SubmissionId = submissionId,
                NodeId = "adhoc-review",
                NodeLabel = string.IsNullOrWhiteSpace(title) ? "Review submission" : title.Trim(),
                Status = WorkflowTaskStatus.Claimed,
                AssignedUserId = TryParseUserId(targetUser),
                AssignedUserName = (targetUser ?? string.Empty).Trim(),
                AssignedDisplayName = (targetUser ?? string.Empty).Trim(),
                ClaimedAt = nowUtc,
                AllowClaim = true,
                AllowForward = true,
                AllowReassign = true,
                Comment = comment ?? string.Empty,
            };
            caseInst.ActiveTaskId = task.TaskId;
            _repo.SaveCase(caseInst);
            _repo.SaveTask(task);
            _repo.AddTaskAction(BuildAction(task, actor, WorkflowTaskActionType.Forwarded, null, comment, targetUser));
            return task;
        }

        public Task<WorkflowTaskOperationResult> ClaimTaskAsync(
            string taskId,
            UserContext actor,
            string comment,
            CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            EnsureActor(actor);
            var task = RequireTask(taskId);
            if (!IsTaskOpen(task))
                throw new InvalidOperationException("Task is not open.");

            if (!CanActorClaim(task, actor))
                throw new InvalidOperationException("You do not have permission to claim this task.");

            if (task.Status == WorkflowTaskStatus.Claimed && !IsAssignedToActor(task, actor))
                throw new InvalidOperationException("Task is already claimed by another user.");

            if (task.Status != WorkflowTaskStatus.Claimed)
            {
                ApplyAssignment(task, actor);
                task.Status = WorkflowTaskStatus.Claimed;
                task.Comment = comment ?? string.Empty;
                _repo.SaveTask(task);
                _repo.AddTaskAction(BuildAction(task, actor, WorkflowTaskActionType.Claimed, null, comment, null));
            }

            return Task.FromResult(BuildResult(task));
        }

        public async Task<WorkflowTaskOperationResult> ApproveTaskAsync(
            string taskId,
            UserContext actor,
            string comment,
            Dictionary<string, object> resumeData,
            CancellationToken ct)
        {
            var task = await PrepareCompletionAsync(taskId, actor, comment, false, ct);
            var result = await ResumeTaskAsync(task, actor, "approved", comment, resumeData, ct);
            return result;
        }

        public async Task<WorkflowTaskOperationResult> RejectTaskAsync(
            string taskId,
            UserContext actor,
            string comment,
            Dictionary<string, object> resumeData,
            CancellationToken ct)
        {
            var task = await PrepareCompletionAsync(taskId, actor, comment, true, ct);
            var result = await ResumeTaskAsync(task, actor, "rejected", comment, resumeData, ct);
            return result;
        }

        public async Task<WorkflowTaskOperationResult> ForwardTaskAsync(
            string taskId,
            UserContext actor,
            string targetUser,
            string comment,
            CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            EnsureActor(actor);
            if (string.IsNullOrWhiteSpace(targetUser))
                throw new InvalidOperationException("targetUser is required.");

            var task = RequireTask(taskId);
            if (!IsTaskOpen(task))
                throw new InvalidOperationException("Task is not open.");

            if (!CanActorWork(task, actor))
                throw new InvalidOperationException("You do not have permission to forward this task.");

            if (!task.AllowForward && !actor.IsAdmin && !actor.IsSuperUser)
                throw new InvalidOperationException("Forwarding is disabled for this task.");

            bool isRoleForward = targetUser.Trim().StartsWith("role:", StringComparison.OrdinalIgnoreCase);
            string roleName = isRoleForward ? targetUser.Trim().Substring(5).Trim() : null;

            if (isRoleForward)
            {
                task.Status = WorkflowTaskStatus.Pending;
                task.AssignedUserId = null;
                task.AssignedUserName = string.Empty;
                task.AssignedDisplayName = string.Empty;
                task.ClaimedAt = null;
                if (task.CandidateRoles == null)
                    task.CandidateRoles = new List<string>();
                if (!task.CandidateRoles.Any(r => string.Equals(r, roleName, StringComparison.OrdinalIgnoreCase)))
                    task.CandidateRoles.Add(roleName);
                task.Comment = comment ?? string.Empty;
            }
            else
            {
                task.Status = WorkflowTaskStatus.Claimed;
                task.AssignedUserId = TryParseUserId(targetUser);
                task.AssignedUserName = (targetUser ?? string.Empty).Trim();
                task.AssignedDisplayName = task.AssignedUserName;
                task.ClaimedAt = DateTime.UtcNow;
                task.Comment = comment ?? string.Empty;
            }

            _repo.SaveTask(task);
            _repo.AddTaskAction(BuildAction(task, actor, WorkflowTaskActionType.Forwarded, null, comment, targetUser));

            if (task.SubmissionId > 0 && !string.IsNullOrWhiteSpace(task.PendingSubmissionStatus))
            {
                try { _submissionRepo.UpdateStatus(task.SubmissionId, task.PendingSubmissionStatus); }
                catch (Exception ex) { _log?.LogWarning("MegaForm.Workflow", "Forward status update failed: " + ex.Message); }
                try { _documentRevisionService?.SyncWorkflowStatus(task.SubmissionId, task.PendingSubmissionStatus, actor.UserId); }
                catch (Exception ex) { _log?.LogWarning("MegaForm.Workflow", "Forward document status sync failed: " + ex.Message); }
            }

            await SendForwardNotificationAsync(task, actor, targetUser, comment, isRoleForward, roleName, ct).ConfigureAwait(false);

            return BuildResult(task);
        }

        // [MyInbox Phase 2 2026-06-11] Record a comment in the task audit trail
        // WITHOUT changing task state — the task stays open in the same step.
        // Backs the inbox "Comment" action and the "Return for revision" action
        // (true return-to-submitter routing is not modelled in the engine yet, so
        // Return is surfaced as a clearly-labelled comment that keeps the task open).
        public Task<WorkflowTaskOperationResult> CommentTaskAsync(
            string taskId,
            UserContext actor,
            string comment,
            CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            EnsureActor(actor);
            if (string.IsNullOrWhiteSpace(comment))
                throw new InvalidOperationException("A comment is required.");

            var task = RequireTask(taskId);
            if (!IsTaskOpen(task))
                throw new InvalidOperationException("Task is not open.");
            if (!CanActorWork(task, actor))
                throw new InvalidOperationException("You do not have permission to comment on this task.");

            _repo.AddTaskAction(BuildAction(task, actor, WorkflowTaskActionType.Commented, null, comment, null));
            return Task.FromResult(BuildResult(task));
        }

        private async Task<WorkflowTaskInstance> PrepareCompletionAsync(
            string taskId,
            UserContext actor,
            string comment,
            bool reject,
            CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            EnsureActor(actor);

            var task = RequireTask(taskId);
            if (!IsTaskOpen(task))
                throw new InvalidOperationException("Task is not open.");

            if (!CanActorWork(task, actor))
                throw new InvalidOperationException("You do not have permission to complete this task.");

            if (reject && task.CommentRequiredOnReject && string.IsNullOrWhiteSpace(comment))
                throw new InvalidOperationException("A comment is required when rejecting this task.");

            if (!IsAssignedToActor(task, actor))
            {
                if (!task.AllowClaim && !actor.IsAdmin && !actor.IsSuperUser)
                    throw new InvalidOperationException("Task must be assigned before it can be completed.");

                ApplyAssignment(task, actor);
            }

            task.Status = WorkflowTaskStatus.Completed;
            task.CompletedAt = DateTime.UtcNow;
            task.Outcome = reject ? "rejected" : "approved";
            task.Comment = comment ?? string.Empty;
            _repo.SaveTask(task);
            _repo.AddTaskAction(BuildAction(task, actor, reject ? WorkflowTaskActionType.Rejected : WorkflowTaskActionType.Approved, task.Outcome, comment, null));
            return task;
        }

        private async Task<WorkflowTaskOperationResult> ResumeTaskAsync(
            WorkflowTaskInstance task,
            UserContext actor,
            string outcomeHandle,
            string comment,
            Dictionary<string, object> resumeData,
            CancellationToken ct)
        {
            var workflowCase = _repo.GetCase(task.CaseId) ?? new WorkflowCaseInstance
            {
                CaseId = task.CaseId,
                ExecutionId = task.ExecutionId,
                FormId = task.FormId,
                SubmissionId = task.SubmissionId
            };

            workflowCase.ActiveTaskId = string.Empty;
            workflowCase.CurrentNodeId = task.NodeId ?? string.Empty;
            workflowCase.Outcome = outcomeHandle ?? string.Empty;
            workflowCase.LastComment = comment ?? string.Empty;
            workflowCase.Status = WorkflowCaseStatus.Running;
            _repo.SaveCase(workflowCase);

            var payload = resumeData != null
                ? new Dictionary<string, object>(resumeData, StringComparer.OrdinalIgnoreCase)
                : new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            payload["approval.outcome"] = outcomeHandle ?? string.Empty;
            payload["approval.comment"] = comment ?? string.Empty;
            payload["approval.taskId"] = task.TaskId ?? string.Empty;

            var ctx = await _engine.ResumeAsync(task.ExecutionId, outcomeHandle, payload, ct);
            if (ctx == null)
                throw new InvalidOperationException("Workflow resume returned no execution context.");

            workflowCase.CurrentNodeId = ctx.CurrentNodeId ?? string.Empty;
            workflowCase.ActiveTaskId = ctx.PendingTaskId ?? string.Empty;
            workflowCase.Status = MapCaseStatus(ctx, outcomeHandle);
            if (ctx.Status == WorkflowExecutionStatus.Completed ||
                ctx.Status == WorkflowExecutionStatus.Cancelled ||
                ctx.Status == WorkflowExecutionStatus.Failed)
                workflowCase.CompletedAt = DateTime.UtcNow;
            _repo.SaveCase(workflowCase);

            UpdateSubmissionStatusAfterResume(task, ctx, outcomeHandle);

            var result = BuildResult(task);
            result.Case = workflowCase;
            result.Execution = ctx;
            return result;
        }

        private void UpdateSubmissionStatusAfterResume(
            WorkflowTaskInstance task,
            WorkflowExecutionContext ctx,
            string outcomeHandle)
        {
            if (task.SubmissionId <= 0)
                return;

            try
            {
                if (ctx != null && ctx.Status == WorkflowExecutionStatus.Waiting)
                {
                    var waitingStatus = ResolveWaitingSubmissionStatus(task, ctx);
                    _submissionRepo.UpdateStatus(task.SubmissionId, waitingStatus);
                    _documentRevisionService?.SyncWorkflowStatus(task.SubmissionId, waitingStatus, task.AssignedUserId);
                    return;
                }

                if (string.Equals(outcomeHandle, "rejected", StringComparison.OrdinalIgnoreCase))
                {
                    var rejectedStatus = task.RejectedSubmissionStatus ?? "rejected";
                    _submissionRepo.UpdateStatus(task.SubmissionId, rejectedStatus);
                    _documentRevisionService?.SyncWorkflowStatus(task.SubmissionId, rejectedStatus, task.AssignedUserId);
                    return;
                }

                if (ctx != null && ctx.Status == WorkflowExecutionStatus.Completed)
                {
                    var approvedStatus = task.ApprovedSubmissionStatus ?? "approved";
                    _submissionRepo.UpdateStatus(task.SubmissionId, approvedStatus);
                    _documentRevisionService?.SyncWorkflowStatus(task.SubmissionId, approvedStatus, task.AssignedUserId);
                }
            }
            catch (Exception ex)
            {
                _log?.LogWarning("MegaForm.Workflow", "Submission status sync failed: " + ex.Message);
            }
        }

        private string ResolveWaitingSubmissionStatus(
            WorkflowTaskInstance completedTask,
            WorkflowExecutionContext ctx)
        {
            if (ctx != null && !string.IsNullOrWhiteSpace(ctx.PendingTaskId))
            {
                try
                {
                    var nextTask = _repo.GetTask(ctx.PendingTaskId);
                    if (nextTask != null && !string.IsNullOrWhiteSpace(nextTask.PendingSubmissionStatus))
                        return nextTask.PendingSubmissionStatus;
                }
                catch (Exception ex)
                {
                    _log?.LogWarning("MegaForm.Workflow", "Could not resolve next pending task status: " + ex.Message);
                }
            }

            return completedTask?.PendingSubmissionStatus ?? "pending_approval";
        }

        private static WorkflowCaseStatus MapCaseStatus(WorkflowExecutionContext ctx, string outcomeHandle)
        {
            if (ctx == null)
                return WorkflowCaseStatus.Failed;

            switch (ctx.Status)
            {
                case WorkflowExecutionStatus.Waiting:
                    return WorkflowCaseStatus.Waiting;
                case WorkflowExecutionStatus.Completed:
                    return string.Equals(outcomeHandle, "rejected", StringComparison.OrdinalIgnoreCase)
                        ? WorkflowCaseStatus.Rejected
                        : WorkflowCaseStatus.Completed;
                case WorkflowExecutionStatus.Cancelled:
                    return WorkflowCaseStatus.Cancelled;
                case WorkflowExecutionStatus.Failed:
                    return WorkflowCaseStatus.Failed;
                default:
                    return WorkflowCaseStatus.Running;
            }
        }

        private WorkflowTaskOperationResult BuildResult(WorkflowTaskInstance task)
        {
            return new WorkflowTaskOperationResult
            {
                Success = true,
                Task = task,
                Case = !string.IsNullOrWhiteSpace(task.CaseId) ? _repo.GetCase(task.CaseId) : null,
                Submission = _submissionRepo != null && task.SubmissionId > 0 ? _submissionRepo.Get(task.SubmissionId) : null,
                Actions = _repo.ListTaskActions(task.TaskId) ?? new List<WorkflowTaskAction>()
            };
        }

        private static void EnsureActor(UserContext actor)
        {
            if (actor == null)
                throw new InvalidOperationException("Workflow actor context is required.");
        }

        private WorkflowTaskInstance RequireTask(string taskId)
        {
            if (string.IsNullOrWhiteSpace(taskId))
                throw new InvalidOperationException("taskId is required.");

            var task = _repo.GetTask(taskId);
            if (task == null)
                throw new InvalidOperationException("Workflow task not found.");

            return task;
        }

        private static List<WorkflowTaskInstance> ApplyPaging(List<WorkflowTaskInstance> items, int pageIndex, int pageSize)
        {
            return (items ?? new List<WorkflowTaskInstance>())
                .Skip(pageIndex * pageSize)
                .Take(pageSize)
                .ToList();
        }

        private static bool IsTaskOpen(WorkflowTaskInstance task)
        {
            return task != null &&
                (task.Status == WorkflowTaskStatus.Pending || task.Status == WorkflowTaskStatus.Claimed);
        }

        /// <summary>
        /// True when the actor holds a workflow task on this submission — assigned to them
        /// (any status, so an approver keeps read access to what they acted on), or still
        /// open and claimable by them (candidate role/user). Hosts use this to let an
        /// approver READ the submission they are approving; membership comes from the
        /// task tables, never from the request.
        /// </summary>
        public bool HoldsTaskForSubmission(int submissionId, UserContext actor)
        {
            if (submissionId <= 0 || actor == null || !actor.IsAuthenticated)
                return false;
            var tasks = _repo.ListTasks(new WorkflowTaskQuery
            {
                SubmissionId = submissionId,
                OpenOnly = false,
                PageSize = 100
            });
            if (tasks == null)
                return false;
            foreach (var task in tasks)
            {
                if (IsAssignedToActor(task, actor))
                    return true;
                if (IsTaskOpen(task) && CanActorClaim(task, actor))
                    return true;
            }
            return false;
        }

        private void EnsureVisible(WorkflowTaskInstance task, UserContext actor)
        {
            if (!IsAssignedToActor(task, actor) && !CanActorClaim(task, actor))
                throw new InvalidOperationException("You do not have access to this task.");
        }

        private bool CanActorWork(WorkflowTaskInstance task, UserContext actor)
        {
            if (actor.IsAdmin || actor.IsSuperUser)
                return true;
            if (IsAssignedToActor(task, actor))
                return true;
            return task.Status == WorkflowTaskStatus.Pending && CanActorClaim(task, actor);
        }

        private bool CanActorClaim(WorkflowTaskInstance task, UserContext actor)
        {
            if (task == null || actor == null)
                return false;
            if (actor.IsAdmin || actor.IsSuperUser)
                return true;
            if (IsAssignedToActor(task, actor))
                return true;

            var identifiers = GetActorIdentifiers(actor);
            if (task.CandidateUsers != null && task.CandidateUsers.Any(u => identifiers.Contains(u, StringComparer.OrdinalIgnoreCase)))
                return true;

            if (task.CandidateRoles != null && actor.Roles != null &&
                task.CandidateRoles.Any(r => actor.Roles.Contains(r, StringComparer.OrdinalIgnoreCase)))
                return true;

            return false;
        }

        private static bool IsAssignedToActor(WorkflowTaskInstance task, UserContext actor)
        {
            if (task == null || actor == null)
                return false;

            if (task.AssignedUserId.HasValue && actor.UserId > 0 && task.AssignedUserId.Value == actor.UserId)
                return true;

            if (string.IsNullOrWhiteSpace(task.AssignedUserName))
                return false;

            var identifiers = GetActorIdentifiers(actor);
            return identifiers.Contains(task.AssignedUserName, StringComparer.OrdinalIgnoreCase);
        }

        private static List<string> GetActorIdentifiers(UserContext actor)
        {
            var values = new List<string>();
            if (actor == null)
                return values;

            if (actor.UserId > 0)
                values.Add(actor.UserId.ToString());
            if (!string.IsNullOrWhiteSpace(actor.UserName))
                values.Add(actor.UserName);
            if (!string.IsNullOrWhiteSpace(actor.DisplayName))
                values.Add(actor.DisplayName);
            if (!string.IsNullOrWhiteSpace(actor.Email))
                values.Add(actor.Email);

            return values
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        private static void ApplyAssignment(WorkflowTaskInstance task, UserContext actor)
        {
            task.AssignedUserId = actor.UserId > 0 ? (int?)actor.UserId : null;
            task.AssignedUserName = !string.IsNullOrWhiteSpace(actor.UserName)
                ? actor.UserName
                : (!string.IsNullOrWhiteSpace(actor.Email) ? actor.Email : string.Empty);
            task.AssignedDisplayName = !string.IsNullOrWhiteSpace(actor.DisplayName)
                ? actor.DisplayName
                : task.AssignedUserName;
            task.ClaimedAt = DateTime.UtcNow;
        }

        private static WorkflowTaskAction BuildAction(
            WorkflowTaskInstance task,
            UserContext actor,
            WorkflowTaskActionType actionType,
            string outcome,
            string comment,
            string targetUser)
        {
            return new WorkflowTaskAction
            {
                TaskId = task.TaskId,
                CaseId = task.CaseId,
                ExecutionId = task.ExecutionId,
                FormId = task.FormId,
                SubmissionId = task.SubmissionId,
                ActionType = actionType,
                ActorUserId = actor.UserId > 0 ? (int?)actor.UserId : null,
                ActorUserName = actor.UserName ?? string.Empty,
                ActorDisplayName = actor.DisplayName ?? actor.UserName ?? string.Empty,
                Outcome = outcome ?? string.Empty,
                Comment = comment ?? string.Empty,
                TargetUser = targetUser ?? string.Empty
            };
        }

        private static int? TryParseUserId(string value)
        {
            int userId;
            return int.TryParse(value, out userId) && userId > 0 ? (int?)userId : null;
        }

        private async Task SendForwardNotificationAsync(
            WorkflowTaskInstance task,
            UserContext actor,
            string targetUser,
            string comment,
            bool isRoleForward,
            string roleName,
            CancellationToken ct)
        {
            if (_emailSender == null)
                return;

            var config = TryGetApprovalConfig(task);
            if (config != null && !config.NotifyOnForward)
                return;

            var recipients = new List<string>();
            var portalId = GetPortalId(task);

            if (isRoleForward && !string.IsNullOrWhiteSpace(roleName) && _principalResolver != null)
            {
                recipients = _principalResolver.ResolveRoleMembers(roleName, portalId)
                    .Where(u => !string.IsNullOrWhiteSpace(u.Email))
                    .Select(u => u.Email)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
            }
            else if (!isRoleForward)
            {
                var target = (targetUser ?? string.Empty).Trim();
                if (target.IndexOf('@') >= 0)
                {
                    recipients.Add(target);
                }
                else if (_principalResolver != null)
                {
                    var user = _principalResolver.ResolveUser(target, portalId);
                    if (user != null && !string.IsNullOrWhiteSpace(user.Email))
                        recipients.Add(user.Email);
                }
            }

            if (recipients.Count == 0)
                return;

            string subject = config != null && !string.IsNullOrWhiteSpace(config.NotifyForwardSubject) && _evaluator != null
                ? _evaluator.ResolveExpression(config.NotifyForwardSubject, BuildContext(task))
                : EmailNotificationService.GetTaskForwardedDefaultSubject(task);

            string body = config != null && !string.IsNullOrWhiteSpace(config.NotifyForwardBody) && _evaluator != null
                ? _evaluator.ResolveExpression(config.NotifyForwardBody, BuildContext(task))
                : EmailNotificationService.GetTaskForwardedDefaultBody(task, actor.DisplayName ?? actor.UserName, comment);

            await SendToRecipientsAsync(recipients, subject, body, ct).ConfigureAwait(false);
        }

        private ApprovalNodeConfig TryGetApprovalConfig(WorkflowTaskInstance task)
        {
            try
            {
                var definition = _repo.GetByFormId(task.FormId);
                if (definition?.Nodes == null)
                    return null;
                var node = definition.Nodes.FirstOrDefault(n => n.Id == task.NodeId);
                if (node?.Config == null || node.Config.Count == 0)
                    return null;
                var json = JsonConvert.SerializeObject(node.Config);
                return JsonConvert.DeserializeObject<ApprovalNodeConfig>(json);
            }
            catch
            {
                return null;
            }
        }

        private WorkflowExecutionContext BuildContext(WorkflowTaskInstance task)
        {
            var ctx = _repo.GetExecution(task.ExecutionId);
            if (ctx != null)
                return ctx;

            return new WorkflowExecutionContext
            {
                ExecutionId = task.ExecutionId,
                FormId = task.FormId,
                SubmissionId = task.SubmissionId,
                FormData = new Dictionary<string, object>()
            };
        }

        private static int GetPortalId(WorkflowTaskInstance task)
        {
            var ctx = task != null ? new WorkflowExecutionContext
            {
                ExecutionId = task.ExecutionId,
                FormId = task.FormId,
                SubmissionId = task.SubmissionId,
                FormData = new Dictionary<string, object>()
            } : null;
            return GetPortalId(ctx);
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
                        _log?.LogWarning("MegaForm.Workflow", "Forward notification email failed: " + ex.Message);
                    }
                }, ct));
            }
            await Task.WhenAll(tasks).ConfigureAwait(false);
        }
    }
}
