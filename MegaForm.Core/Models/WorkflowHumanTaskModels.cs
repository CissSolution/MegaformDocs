using System;
using System.Collections.Generic;
using MegaForm.Core.Models;

namespace MegaForm.Core.Workflow
{
    public enum WorkflowCaseStatus
    {
        Running = 1,
        Waiting = 2,
        Completed = 3,
        Rejected = 4,
        Cancelled = 5,
        Failed = 6
    }

    public enum WorkflowTaskStatus
    {
        Pending = 1,
        Claimed = 2,
        Completed = 3,
        Cancelled = 4
    }

    public enum WorkflowTaskActionType
    {
        Created = 1,
        Claimed = 2,
        Approved = 3,
        Rejected = 4,
        Forwarded = 5,
        Commented = 6
    }

    public class ApprovalNodeConfig
    {
        public List<string> CandidateRoles { get; set; }
        public List<string> CandidateUsers { get; set; }
        public bool AllowClaim { get; set; }
        public bool AllowForward { get; set; }
        public bool AllowReassign { get; set; }
        public bool CommentRequiredOnReject { get; set; }
        public int DueInHours { get; set; }
        public string PendingSubmissionStatus { get; set; }
        public string ApprovedSubmissionStatus { get; set; }
        public string RejectedSubmissionStatus { get; set; }

        public bool NotifyOnCreate { get; set; }
        public bool NotifyOnForward { get; set; }
        public string NotifyCreateSubject { get; set; }
        public string NotifyCreateBody { get; set; }
        public string NotifyForwardSubject { get; set; }
        public string NotifyForwardBody { get; set; }

        public ApprovalNodeConfig()
        {
            CandidateRoles = new List<string> { "Administrator" };
            CandidateUsers = new List<string>();
            AllowClaim = true;
            AllowForward = true;
            AllowReassign = true;
            PendingSubmissionStatus = "pending_approval";
            ApprovedSubmissionStatus = "approved";
            RejectedSubmissionStatus = "rejected";
            NotifyOnCreate = true;
            NotifyOnForward = true;
        }
    }

    public class WorkflowCaseInstance
    {
        public string CaseId { get; set; }
        public string ExecutionId { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public string WorkflowId { get; set; }
        public string CurrentNodeId { get; set; }
        public WorkflowCaseStatus Status { get; set; }
        public int? StartedByUserId { get; set; }
        public string StartedByUserName { get; set; }
        public string ActiveTaskId { get; set; }
        public string Outcome { get; set; }
        public string LastComment { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? CompletedAt { get; set; }

        public WorkflowCaseInstance()
        {
            CaseId = Guid.NewGuid().ToString("N");
            StartedByUserName = string.Empty;
            ActiveTaskId = string.Empty;
            Outcome = string.Empty;
            LastComment = string.Empty;
            Status = WorkflowCaseStatus.Running;
            CreatedAt = DateTime.UtcNow;
        }
    }

    public class WorkflowTaskInstance
    {
        public string TaskId { get; set; }
        public string CaseId { get; set; }
        public string ExecutionId { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public string NodeId { get; set; }
        public string NodeLabel { get; set; }
        public WorkflowTaskStatus Status { get; set; }
        public List<string> CandidateRoles { get; set; }
        public List<string> CandidateUsers { get; set; }
        public int? AssignedUserId { get; set; }
        public string AssignedUserName { get; set; }
        public string AssignedDisplayName { get; set; }
        public bool AllowClaim { get; set; }
        public bool AllowForward { get; set; }
        public bool AllowReassign { get; set; }
        public bool CommentRequiredOnReject { get; set; }
        public string PendingSubmissionStatus { get; set; }
        public string ApprovedSubmissionStatus { get; set; }
        public string RejectedSubmissionStatus { get; set; }
        public string Outcome { get; set; }
        public string Comment { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? ClaimedAt { get; set; }
        public DateTime? DueAt { get; set; }
        public DateTime? CompletedAt { get; set; }

        public WorkflowTaskInstance()
        {
            TaskId = Guid.NewGuid().ToString("N");
            NodeLabel = string.Empty;
            CandidateRoles = new List<string>();
            CandidateUsers = new List<string>();
            AssignedUserName = string.Empty;
            AssignedDisplayName = string.Empty;
            PendingSubmissionStatus = "pending_approval";
            ApprovedSubmissionStatus = "approved";
            RejectedSubmissionStatus = "rejected";
            Outcome = string.Empty;
            Comment = string.Empty;
            Status = WorkflowTaskStatus.Pending;
            AllowClaim = true;
            AllowForward = true;
            AllowReassign = true;
            CreatedAt = DateTime.UtcNow;
        }
    }

    public class WorkflowTaskAction
    {
        public string ActionId { get; set; }
        public string TaskId { get; set; }
        public string CaseId { get; set; }
        public string ExecutionId { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public WorkflowTaskActionType ActionType { get; set; }
        public int? ActorUserId { get; set; }
        public string ActorUserName { get; set; }
        public string ActorDisplayName { get; set; }
        public string TargetUser { get; set; }
        public string Outcome { get; set; }
        public string Comment { get; set; }
        public DateTime CreatedAt { get; set; }

        public WorkflowTaskAction()
        {
            ActionId = Guid.NewGuid().ToString("N");
            ActorUserName = string.Empty;
            ActorDisplayName = string.Empty;
            TargetUser = string.Empty;
            Outcome = string.Empty;
            Comment = string.Empty;
            CreatedAt = DateTime.UtcNow;
        }
    }

    public class WorkflowTaskQuery
    {
        public int? FormId { get; set; }
        public int? SubmissionId { get; set; }
        public string CaseId { get; set; }
        public string ExecutionId { get; set; }
        public bool OpenOnly { get; set; }
        public int PageIndex { get; set; }
        public int PageSize { get; set; }

        public WorkflowTaskQuery()
        {
            OpenOnly = true;
            PageIndex = 0;
            PageSize = 50;
        }
    }

    public class WorkflowInboxResult
    {
        public List<WorkflowTaskInstance> MyTasks { get; set; }
        public List<WorkflowTaskInstance> RoleQueue { get; set; }
        public DateTime GeneratedAt { get; set; }

        public WorkflowInboxResult()
        {
            MyTasks = new List<WorkflowTaskInstance>();
            RoleQueue = new List<WorkflowTaskInstance>();
            GeneratedAt = DateTime.UtcNow;
        }
    }

    /// <summary>
    /// Personal "My Inbox" workboard: a per-user, project-manager-style view of the
    /// human tasks that concern them — incoming (claimable), in-progress (assigned to
    /// me, still open) and recently completed (acted on by me). Built on top of the
    /// same task store as <see cref="WorkflowInboxResult"/> but split for a board UI.
    /// </summary>
    public class WorkflowWorkboardResult
    {
        public List<WorkflowTaskInstance> Incoming { get; set; }
        public List<WorkflowTaskInstance> InProgress { get; set; }
        public List<WorkflowTaskInstance> Completed { get; set; }
        public int OverdueCount { get; set; }
        public DateTime GeneratedAt { get; set; }

        public WorkflowWorkboardResult()
        {
            Incoming = new List<WorkflowTaskInstance>();
            InProgress = new List<WorkflowTaskInstance>();
            Completed = new List<WorkflowTaskInstance>();
            OverdueCount = 0;
            GeneratedAt = DateTime.UtcNow;
        }
    }

    public class WorkflowTaskOperationResult
    {
        public bool Success { get; set; }
        public string Error { get; set; }
        public WorkflowTaskInstance Task { get; set; }
        public WorkflowCaseInstance Case { get; set; }
        public WorkflowExecutionContext Execution { get; set; }
        public List<WorkflowTaskAction> Actions { get; set; }
        public SubmissionInfo Submission { get; set; }
        public WorkflowDefinition Workflow { get; set; }
        public WorkflowTransparencyInfo Transparency { get; set; }

        public WorkflowTaskOperationResult()
        {
            Error = string.Empty;
            Actions = new List<WorkflowTaskAction>();
            Transparency = new WorkflowTransparencyInfo();
        }
    }
}
