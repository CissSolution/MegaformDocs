using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Workflow;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Builds a host-agnostic workflow history shell so Web/DNN/Oqtane can all
    /// render the same execution timeline, active step marker, SLA state, and
    /// return rounds without duplicating workflow logic in each host.
    /// </summary>
    public class WorkflowTransparencyService
    {
        public WorkflowTransparencyInfo Build(
            WorkflowDefinition definition,
            WorkflowExecutionContext execution,
            WorkflowCaseInstance workflowCase,
            IEnumerable<WorkflowTaskInstance> tasks,
            IEnumerable<WorkflowTaskAction> actions)
        {
            var info = new WorkflowTransparencyInfo();
            var orderedTasks = (tasks ?? new List<WorkflowTaskInstance>())
                .OrderBy(t => t.CreatedAt)
                .ThenBy(t => t.TaskId)
                .ToList();
            var orderedActions = (actions ?? new List<WorkflowTaskAction>())
                .OrderBy(a => a.CreatedAt)
                .ThenBy(a => a.ActionId)
                .ToList();

            info.ActiveNodeId = !string.IsNullOrWhiteSpace(workflowCase != null ? workflowCase.CurrentNodeId : null)
                ? workflowCase.CurrentNodeId
                : execution != null ? (execution.CurrentNodeId ?? string.Empty) : string.Empty;
            info.ActiveTaskId = !string.IsNullOrWhiteSpace(workflowCase != null ? workflowCase.ActiveTaskId : null)
                ? workflowCase.ActiveTaskId
                : execution != null ? (execution.PendingTaskId ?? string.Empty) : string.Empty;
            info.ExecutionStatus = execution != null ? (WorkflowExecutionStatus?)execution.Status : null;
            info.CaseStatus = workflowCase != null ? (WorkflowCaseStatus?)workflowCase.Status : null;
            info.ActiveNodeLabel = ResolveNodeLabel(definition, info.ActiveNodeId, orderedTasks);

            var actionsByTask = orderedActions
                .GroupBy(a => a.TaskId ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

            var tasksByNode = orderedTasks
                .GroupBy(t => t.NodeId ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    g => g.Key,
                    g => new Queue<WorkflowTaskInstance>(g.OrderBy(t => t.CreatedAt).ThenBy(t => t.TaskId)),
                    StringComparer.OrdinalIgnoreCase);

            var usedTaskIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            if (execution != null && execution.Log != null && execution.Log.Count > 0)
            {
                foreach (var log in execution.Log.OrderBy(l => l.Sequence).ThenBy(l => l.Timestamp))
                {
                    var task = MatchTask(log, tasksByNode, usedTaskIds);
                    var step = BuildLogStep(definition, execution, workflowCase, log, task, GetTaskActions(actionsByTask, task));
                    info.Steps.Add(step);
                }
            }

            foreach (var task in orderedTasks)
            {
                if (string.IsNullOrWhiteSpace(task.TaskId) || usedTaskIds.Contains(task.TaskId))
                    continue;

                info.Steps.Add(BuildTaskStep(definition, execution, workflowCase, task, GetTaskActions(actionsByTask, task)));
            }

            if (info.Steps.Count == 0 && !string.IsNullOrWhiteSpace(info.ActiveNodeId))
            {
                info.Steps.Add(new WorkflowTransparencyStep
                {
                    Sequence = 1,
                    NodeId = info.ActiveNodeId,
                    NodeLabel = info.ActiveNodeLabel,
                    NodeType = ResolveNodeType(definition, info.ActiveNodeId),
                    Status = IsExecutionOpen(execution, workflowCase) ? "active" : "completed",
                    IsCurrent = IsExecutionOpen(execution, workflowCase),
                    StartedAt = execution != null ? (DateTime?)execution.StartedAt : null
                });
            }

            var orderedSteps = info.Steps
                .OrderBy(s => s.StartedAt ?? DateTime.MaxValue)
                .ThenBy(s => s.Sequence)
                .ThenBy(s => s.TaskId ?? string.Empty)
                .ToList();

            var now = DateTime.UtcNow;
            var currentRound = 1;
            var nextRoundStarts = true;
            var currentStepIndex = ResolveCurrentStepIndex(orderedSteps, info.ActiveTaskId, info.ActiveNodeId, execution, workflowCase);
            for (var i = 0; i < orderedSteps.Count; i++)
            {
                var step = orderedSteps[i];
                step.RoundIndex = currentRound;
                step.RoundAnchorId = "wf-round-" + currentRound;
                step.PreviousRoundAnchorId = currentRound > 1 ? "wf-round-" + (currentRound - 1) : string.Empty;
                step.IsRoundStart = nextRoundStarts;
                step.IsCurrent = i == currentStepIndex;

                if (!step.IsCurrent &&
                    string.Equals(step.Status, "active", StringComparison.OrdinalIgnoreCase) &&
                    i < orderedSteps.Count - 1)
                {
                    step.Status = "completed";
                }

                if (step.DueAt.HasValue)
                {
                    step.IsOverdue = step.CompletedAt.HasValue
                        ? step.CompletedAt.Value > step.DueAt.Value
                        : now > step.DueAt.Value && step.IsCurrent;
                }

                if (step.IsCurrent)
                    info.CurrentRound = currentRound;

                nextRoundStarts = false;
                if (IsReturnStep(step))
                {
                    currentRound++;
                    nextRoundStarts = true;
                }
            }

            if (orderedSteps.Count > 0 && currentStepIndex < 0)
                info.CurrentRound = Math.Max(1, currentRound);

            info.ReturnCount = Math.Max(0, currentRound - 1);
            info.Steps = orderedSteps;
            return info;
        }

        private static WorkflowTransparencyStep BuildLogStep(
            WorkflowDefinition definition,
            WorkflowExecutionContext execution,
            WorkflowCaseInstance workflowCase,
            WorkflowExecutionLogEntry log,
            WorkflowTaskInstance task,
            List<WorkflowTaskAction> taskActions)
        {
            var maxHours = ResolveMaxProcessingHours(definition, log != null ? log.NodeId : null, task);
            var dueAt = task != null && task.DueAt.HasValue
                ? task.DueAt
                : maxHours.HasValue && log != null
                    ? (DateTime?)log.Timestamp.AddHours(maxHours.Value)
                    : null;

            var step = new WorkflowTransparencyStep
            {
                Sequence = log != null ? log.Sequence : 0,
                NodeId = log != null ? (log.NodeId ?? string.Empty) : string.Empty,
                NodeLabel = ResolveNodeLabel(definition, log != null ? log.NodeId : null, task),
                NodeType = log != null ? (log.NodeType ?? ResolveNodeType(definition, log.NodeId)) : string.Empty,
                TaskId = task != null ? (task.TaskId ?? string.Empty) : string.Empty,
                AssignedTo = ResolveAssignedTo(task),
                CandidateSummary = ResolveCandidateSummary(task),
                Status = ResolveStepStatus(log != null ? log.Status : null, task, execution, workflowCase, log != null ? log.NodeId : null),
                Outcome = ResolveOutcome(task, taskActions),
                Summary = BuildSummary(task, taskActions, log != null ? log.Status : null),
                Comment = ResolveComment(task, taskActions),
                StartedAt = log != null ? (DateTime?)log.Timestamp : null,
                ClaimedAt = task != null ? task.ClaimedAt : null,
                DueAt = dueAt,
                CompletedAt = ResolveCompletedAt(task, log),
                MaxProcessingHours = maxHours,
                IsApprovalStep = task != null || string.Equals(log != null ? log.NodeType : null, "Approval", StringComparison.OrdinalIgnoreCase),
                Events = MapEvents(taskActions)
            };

            step.IsCurrent = IsCurrentStep(step, workflowCase != null ? workflowCase.CurrentNodeId : null, workflowCase != null ? workflowCase.ActiveTaskId : null, execution, workflowCase);
            return step;
        }

        private static WorkflowTransparencyStep BuildTaskStep(
            WorkflowDefinition definition,
            WorkflowExecutionContext execution,
            WorkflowCaseInstance workflowCase,
            WorkflowTaskInstance task,
            List<WorkflowTaskAction> taskActions)
        {
            var maxHours = ResolveMaxProcessingHours(definition, task != null ? task.NodeId : null, task);
            var step = new WorkflowTransparencyStep
            {
                Sequence = 100000 + Math.Abs((task != null ? task.CreatedAt.GetHashCode() : 0)),
                NodeId = task != null ? (task.NodeId ?? string.Empty) : string.Empty,
                NodeLabel = ResolveNodeLabel(definition, task != null ? task.NodeId : null, task),
                NodeType = ResolveNodeType(definition, task != null ? task.NodeId : null),
                TaskId = task != null ? (task.TaskId ?? string.Empty) : string.Empty,
                AssignedTo = ResolveAssignedTo(task),
                CandidateSummary = ResolveCandidateSummary(task),
                Status = ResolveStepStatus(null, task, execution, workflowCase, task != null ? task.NodeId : null),
                Outcome = ResolveOutcome(task, taskActions),
                Summary = BuildSummary(task, taskActions, null),
                Comment = ResolveComment(task, taskActions),
                StartedAt = task != null ? (DateTime?)task.CreatedAt : null,
                ClaimedAt = task != null ? task.ClaimedAt : null,
                DueAt = task != null ? task.DueAt : null,
                CompletedAt = task != null ? task.CompletedAt : null,
                MaxProcessingHours = maxHours,
                IsApprovalStep = true,
                Events = MapEvents(taskActions)
            };

            step.IsCurrent = IsCurrentStep(step, workflowCase != null ? workflowCase.CurrentNodeId : null, workflowCase != null ? workflowCase.ActiveTaskId : null, execution, workflowCase);
            return step;
        }

        private static WorkflowTaskInstance MatchTask(
            WorkflowExecutionLogEntry log,
            IDictionary<string, Queue<WorkflowTaskInstance>> tasksByNode,
            ISet<string> usedTaskIds)
        {
            if (log == null || string.IsNullOrWhiteSpace(log.NodeId))
                return null;

            Queue<WorkflowTaskInstance> queue;
            if (!tasksByNode.TryGetValue(log.NodeId, out queue) || queue == null)
                return null;

            while (queue.Count > 0)
            {
                var next = queue.Peek();
                if (next == null || string.IsNullOrWhiteSpace(next.TaskId) || usedTaskIds.Contains(next.TaskId))
                {
                    queue.Dequeue();
                    continue;
                }

                usedTaskIds.Add(next.TaskId);
                queue.Dequeue();
                return next;
            }

            return null;
        }

        private static List<WorkflowTaskAction> GetTaskActions(
            IDictionary<string, List<WorkflowTaskAction>> actionsByTask,
            WorkflowTaskInstance task)
        {
            if (task == null || string.IsNullOrWhiteSpace(task.TaskId))
                return new List<WorkflowTaskAction>();

            List<WorkflowTaskAction> actions;
            if (!actionsByTask.TryGetValue(task.TaskId, out actions) || actions == null)
                return new List<WorkflowTaskAction>();

            return actions.OrderBy(a => a.CreatedAt).ThenBy(a => a.ActionId).ToList();
        }

        private static string ResolveNodeLabel(
            WorkflowDefinition definition,
            string nodeId,
            IEnumerable<WorkflowTaskInstance> tasks)
        {
            var label = ResolveNodeLabel(
                definition,
                nodeId,
                tasks != null
                    ? tasks.FirstOrDefault(t => string.Equals(t.NodeId, nodeId, StringComparison.OrdinalIgnoreCase))
                    : null);
            return label;
        }

        private static string ResolveNodeLabel(
            WorkflowDefinition definition,
            string nodeId,
            WorkflowTaskInstance task)
        {
            if (task != null && !string.IsNullOrWhiteSpace(task.NodeLabel))
                return task.NodeLabel;

            if (definition != null && definition.Nodes != null && !string.IsNullOrWhiteSpace(nodeId))
            {
                var node = definition.Nodes.FirstOrDefault(n => string.Equals(n.Id, nodeId, StringComparison.OrdinalIgnoreCase));
                if (node != null && !string.IsNullOrWhiteSpace(node.Label))
                    return node.Label;
            }

            return string.IsNullOrWhiteSpace(nodeId) ? "Workflow step" : nodeId;
        }

        private static string ResolveNodeType(WorkflowDefinition definition, string nodeId)
        {
            if (definition != null && definition.Nodes != null && !string.IsNullOrWhiteSpace(nodeId))
            {
                var node = definition.Nodes.FirstOrDefault(n => string.Equals(n.Id, nodeId, StringComparison.OrdinalIgnoreCase));
                if (node != null)
                    return node.Type.ToString();
            }

            return "Workflow";
        }

        private static int? ResolveMaxProcessingHours(WorkflowDefinition definition, string nodeId, WorkflowTaskInstance task)
        {
            if (task != null && task.DueAt.HasValue)
            {
                var diff = task.DueAt.Value - task.CreatedAt;
                if (diff.TotalMinutes > 0)
                    return Math.Max(1, (int)Math.Round(diff.TotalHours, MidpointRounding.AwayFromZero));
            }

            if (definition == null || definition.Nodes == null || string.IsNullOrWhiteSpace(nodeId))
                return null;

            var node = definition.Nodes.FirstOrDefault(n => string.Equals(n.Id, nodeId, StringComparison.OrdinalIgnoreCase));
            if (node == null || node.Config == null || node.Config.Count == 0)
                return null;

            return ReadInt(node.Config, "DueInHours")
                ?? ReadInt(node.Config, "dueInHours")
                ?? ReadInt(node.Config, "MaxProcessingHours")
                ?? ReadInt(node.Config, "maxProcessingHours");
        }

        private static int? ReadInt(IDictionary<string, object> config, string key)
        {
            object raw;
            if (config == null || !config.TryGetValue(key, out raw) || raw == null)
                return null;

            int intValue;
            if (raw is int)
                return (int)raw;
            if (int.TryParse(raw.ToString(), out intValue))
                return intValue > 0 ? (int?)intValue : null;

            return null;
        }

        private static DateTime? ResolveCompletedAt(WorkflowTaskInstance task, WorkflowExecutionLogEntry log)
        {
            if (task != null && task.CompletedAt.HasValue)
                return task.CompletedAt;

            if (log == null)
                return null;

            if (string.Equals(log.Status, "waiting", StringComparison.OrdinalIgnoreCase))
                return null;

            return log.Timestamp;
        }

        private static string ResolveOutcome(WorkflowTaskInstance task, IEnumerable<WorkflowTaskAction> taskActions)
        {
            if (task != null && !string.IsNullOrWhiteSpace(task.Outcome))
                return task.Outcome;

            foreach (var action in taskActions ?? new List<WorkflowTaskAction>())
            {
                if (!string.IsNullOrWhiteSpace(action.Outcome))
                    return action.Outcome;

                if (action.ActionType == WorkflowTaskActionType.Rejected)
                    return "rejected";
                if (action.ActionType == WorkflowTaskActionType.Approved)
                    return "approved";
            }

            return string.Empty;
        }

        private static string ResolveComment(WorkflowTaskInstance task, IEnumerable<WorkflowTaskAction> taskActions)
        {
            foreach (var action in (taskActions ?? new List<WorkflowTaskAction>()).OrderByDescending(a => a.CreatedAt))
            {
                if (!string.IsNullOrWhiteSpace(action.Comment))
                    return action.Comment;
            }

            return task != null ? (task.Comment ?? string.Empty) : string.Empty;
        }

        private static string ResolveAssignedTo(WorkflowTaskInstance task)
        {
            if (task == null)
                return string.Empty;

            if (!string.IsNullOrWhiteSpace(task.AssignedDisplayName))
                return task.AssignedDisplayName;
            if (!string.IsNullOrWhiteSpace(task.AssignedUserName))
                return task.AssignedUserName;

            return string.Empty;
        }

        private static string ResolveCandidateSummary(WorkflowTaskInstance task)
        {
            if (task == null)
                return string.Empty;

            var parts = new List<string>();
            if (task.CandidateRoles != null && task.CandidateRoles.Count > 0)
                parts.Add("Roles: " + string.Join(", ", task.CandidateRoles));
            if (task.CandidateUsers != null && task.CandidateUsers.Count > 0)
                parts.Add("Users: " + string.Join(", ", task.CandidateUsers));

            return string.Join(" | ", parts.Where(v => !string.IsNullOrWhiteSpace(v)).ToArray());
        }

        private static string BuildSummary(
            WorkflowTaskInstance task,
            IEnumerable<WorkflowTaskAction> taskActions,
            string logStatus)
        {
            if (task != null)
            {
                if (!string.IsNullOrWhiteSpace(task.AssignedDisplayName) || !string.IsNullOrWhiteSpace(task.AssignedUserName))
                    return "Assigned to " + ResolveAssignedTo(task);
                if (task.CandidateRoles != null && task.CandidateRoles.Count > 0)
                    return "Waiting for " + string.Join(", ", task.CandidateRoles);
                if (task.CandidateUsers != null && task.CandidateUsers.Count > 0)
                    return "Waiting for " + string.Join(", ", task.CandidateUsers);
            }

            var latestAction = (taskActions ?? new List<WorkflowTaskAction>())
                .OrderByDescending(a => a.CreatedAt)
                .FirstOrDefault();
            if (latestAction != null)
            {
                if (latestAction.ActionType == WorkflowTaskActionType.Forwarded && !string.IsNullOrWhiteSpace(latestAction.TargetUser))
                    return "Forwarded to " + latestAction.TargetUser;
                if (!string.IsNullOrWhiteSpace(latestAction.Comment))
                    return latestAction.Comment;
            }

            if (string.Equals(logStatus, "dry_run", StringComparison.OrdinalIgnoreCase))
                return "Executed in dry-run mode.";
            if (string.Equals(logStatus, "failed", StringComparison.OrdinalIgnoreCase))
                return "Step failed during execution.";

            return string.Empty;
        }

        private static List<WorkflowTransparencyEvent> MapEvents(IEnumerable<WorkflowTaskAction> actions)
        {
            return (actions ?? new List<WorkflowTaskAction>())
                .OrderBy(a => a.CreatedAt)
                .ThenBy(a => a.ActionId)
                .Select(a => new WorkflowTransparencyEvent
                {
                    ActionType = a.ActionType.ToString(),
                    DisplayLabel = ResolveActionLabel(a),
                    ActorName = !string.IsNullOrWhiteSpace(a.ActorDisplayName) ? a.ActorDisplayName : a.ActorUserName,
                    TargetUser = a.TargetUser ?? string.Empty,
                    Outcome = a.Outcome ?? string.Empty,
                    Comment = a.Comment ?? string.Empty,
                    CreatedAt = a.CreatedAt
                })
                .ToList();
        }

        private static string ResolveActionLabel(WorkflowTaskAction action)
        {
            if (action == null)
                return string.Empty;

            switch (action.ActionType)
            {
                case WorkflowTaskActionType.Created:
                    return "Task created";
                case WorkflowTaskActionType.Claimed:
                    return "Task claimed";
                case WorkflowTaskActionType.Approved:
                    return "Approved";
                case WorkflowTaskActionType.Rejected:
                    return "Returned";
                case WorkflowTaskActionType.Forwarded:
                    return "Forwarded";
                case WorkflowTaskActionType.Commented:
                    return "Commented";
                default:
                    return action.ActionType.ToString();
            }
        }

        private static string ResolveStepStatus(
            string logStatus,
            WorkflowTaskInstance task,
            WorkflowExecutionContext execution,
            WorkflowCaseInstance workflowCase,
            string nodeId)
        {
            if (task != null)
            {
                if (task.Status == WorkflowTaskStatus.Pending || task.Status == WorkflowTaskStatus.Claimed)
                    return "active";
                if (task.Status == WorkflowTaskStatus.Cancelled)
                    return "cancelled";
                if (string.Equals(task.Outcome, "rejected", StringComparison.OrdinalIgnoreCase))
                    return "returned";
                return "completed";
            }

            if (IsExecutionOpen(execution, workflowCase) &&
                !string.IsNullOrWhiteSpace(nodeId) &&
                string.Equals(nodeId, !string.IsNullOrWhiteSpace(workflowCase != null ? workflowCase.CurrentNodeId : null) ? workflowCase.CurrentNodeId : execution != null ? execution.CurrentNodeId : null, StringComparison.OrdinalIgnoreCase))
            {
                return "active";
            }

            switch ((logStatus ?? string.Empty).Trim().ToLowerInvariant())
            {
                case "failed":
                    return "failed";
                case "skipped":
                    return "skipped";
                case "waiting":
                    return "active";
                case "dry_run":
                    return "dry_run";
                default:
                    return "completed";
            }
        }

        private static bool IsCurrentStep(
            WorkflowTransparencyStep step,
            string activeNodeId,
            string activeTaskId,
            WorkflowExecutionContext execution,
            WorkflowCaseInstance workflowCase)
        {
            if (step == null || !IsExecutionOpen(execution, workflowCase))
                return false;

            if (!string.IsNullOrWhiteSpace(activeTaskId) && !string.IsNullOrWhiteSpace(step.TaskId))
                return string.Equals(step.TaskId, activeTaskId, StringComparison.OrdinalIgnoreCase);

            if (!string.IsNullOrWhiteSpace(activeNodeId) && !string.IsNullOrWhiteSpace(step.NodeId))
                return string.Equals(step.NodeId, activeNodeId, StringComparison.OrdinalIgnoreCase) &&
                    (string.IsNullOrWhiteSpace(step.Status) ||
                     string.Equals(step.Status, "active", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(step.Status, "completed", StringComparison.OrdinalIgnoreCase));

            return false;
        }

        private static int ResolveCurrentStepIndex(
            IList<WorkflowTransparencyStep> steps,
            string activeTaskId,
            string activeNodeId,
            WorkflowExecutionContext execution,
            WorkflowCaseInstance workflowCase)
        {
            if (!IsExecutionOpen(execution, workflowCase) || steps == null || steps.Count == 0)
                return -1;

            if (!string.IsNullOrWhiteSpace(activeTaskId))
            {
                for (var i = steps.Count - 1; i >= 0; i--)
                {
                    if (string.Equals(steps[i].TaskId, activeTaskId, StringComparison.OrdinalIgnoreCase))
                        return i;
                }
            }

            if (!string.IsNullOrWhiteSpace(activeNodeId))
            {
                for (var i = steps.Count - 1; i >= 0; i--)
                {
                    if (string.Equals(steps[i].NodeId, activeNodeId, StringComparison.OrdinalIgnoreCase))
                        return i;
                }
            }

            return -1;
        }

        private static bool IsExecutionOpen(WorkflowExecutionContext execution, WorkflowCaseInstance workflowCase)
        {
            if (workflowCase != null)
            {
                return workflowCase.Status == WorkflowCaseStatus.Running ||
                    workflowCase.Status == WorkflowCaseStatus.Waiting;
            }

            if (execution != null)
            {
                return execution.Status == WorkflowExecutionStatus.Running ||
                    execution.Status == WorkflowExecutionStatus.Waiting;
            }

            return false;
        }

        private static bool IsReturnStep(WorkflowTransparencyStep step)
        {
            if (step == null)
                return false;

            return string.Equals(step.Status, "returned", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(step.Outcome, "rejected", StringComparison.OrdinalIgnoreCase);
        }
    }
}
