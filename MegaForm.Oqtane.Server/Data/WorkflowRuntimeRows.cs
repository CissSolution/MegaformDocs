using System;

namespace MegaForm.Oqtane.Server.Data
{
    public class WorkflowExecutionRow
    {
        public string ExecutionId { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public string Status { get; set; }
        public DateTime StartedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
        public string CurrentNodeId { get; set; }
        public string ContextJson { get; set; }
        public string ErrorMessage { get; set; }
        // [CloudReady A2 v20260806] Durable timer: Delay wake time + timer-scanner lease.
        public DateTime? WaitUntilUtc { get; set; }
        public string LeaseOwner { get; set; }
        public DateTime? LeaseUntilUtc { get; set; }
    }

    public class WorkflowCaseRow
    {
        public string CaseId { get; set; }
        public string ExecutionId { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public string WorkflowId { get; set; }
        public string CurrentNodeId { get; set; }
        public string Status { get; set; }
        public int? StartedByUserId { get; set; }
        public string StartedByUserName { get; set; }
        public string ActiveTaskId { get; set; }
        public string Outcome { get; set; }
        public string LastComment { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
    }

    public class WorkflowTaskRow
    {
        public string TaskId { get; set; }
        public string CaseId { get; set; }
        public string ExecutionId { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public string NodeId { get; set; }
        public string NodeLabel { get; set; }
        public string Status { get; set; }
        public string CandidateRolesJson { get; set; }
        public string CandidateUsersJson { get; set; }
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
        // [CloudReady A2 v20260806] One-shot overdue reminder marker.
        public DateTime? EscalatedAtUtc { get; set; }
    }

    public class WorkflowTaskActionRow
    {
        public string ActionId { get; set; }
        public string TaskId { get; set; }
        public string CaseId { get; set; }
        public string ExecutionId { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public string ActionType { get; set; }
        public int? ActorUserId { get; set; }
        public string ActorUserName { get; set; }
        public string ActorDisplayName { get; set; }
        public string TargetUser { get; set; }
        public string Outcome { get; set; }
        public string Comment { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>
    /// [CloudReady A1 v20260804] Row for MF_WorkflowQueue — DB-backed async workflow
    /// execution queue. Same shape as MegaForm.Web's WorkflowQueueRow; the table is
    /// created from this EF model on fresh installs (InstallSchemaFromModel) and by
    /// migration 01060040 for EF/DNN completeness.
    /// </summary>
    public class WorkflowQueueRow
    {
        public int QueueId { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public string PayloadJson { get; set; }
        public string Status { get; set; }
        public int AttemptCount { get; set; }
        public string LeasedBy { get; set; }
        public DateTime? LeaseUntilUtc { get; set; }
        public DateTime CreatedAtUtc { get; set; }
        public DateTime? ProcessedAtUtc { get; set; }
    }
}
