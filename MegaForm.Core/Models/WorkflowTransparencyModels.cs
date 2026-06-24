using System;
using System.Collections.Generic;
using MegaForm.Core.Workflow;

namespace MegaForm.Core.Models
{
    public class WorkflowTransparencyInfo
    {
        public string ActiveNodeId { get; set; }
        public string ActiveNodeLabel { get; set; }
        public string ActiveTaskId { get; set; }
        public WorkflowExecutionStatus? ExecutionStatus { get; set; }
        public WorkflowCaseStatus? CaseStatus { get; set; }
        public int CurrentRound { get; set; }
        public int ReturnCount { get; set; }
        public List<WorkflowTransparencyStep> Steps { get; set; }

        public WorkflowTransparencyInfo()
        {
            ActiveNodeId = string.Empty;
            ActiveNodeLabel = string.Empty;
            ActiveTaskId = string.Empty;
            CurrentRound = 1;
            Steps = new List<WorkflowTransparencyStep>();
        }
    }

    public class WorkflowTransparencyStep
    {
        public int Sequence { get; set; }
        public int RoundIndex { get; set; }
        public bool IsRoundStart { get; set; }
        public string RoundAnchorId { get; set; }
        public string PreviousRoundAnchorId { get; set; }
        public string NodeId { get; set; }
        public string NodeLabel { get; set; }
        public string NodeType { get; set; }
        public string Status { get; set; }
        public string Outcome { get; set; }
        public bool IsCurrent { get; set; }
        public bool IsOverdue { get; set; }
        public bool IsApprovalStep { get; set; }
        public string TaskId { get; set; }
        public string AssignedTo { get; set; }
        public string CandidateSummary { get; set; }
        public string Summary { get; set; }
        public string Comment { get; set; }
        public DateTime? StartedAt { get; set; }
        public DateTime? ClaimedAt { get; set; }
        public DateTime? DueAt { get; set; }
        public DateTime? CompletedAt { get; set; }
        public int? MaxProcessingHours { get; set; }
        public List<WorkflowTransparencyEvent> Events { get; set; }

        public WorkflowTransparencyStep()
        {
            RoundAnchorId = string.Empty;
            PreviousRoundAnchorId = string.Empty;
            NodeId = string.Empty;
            NodeLabel = string.Empty;
            NodeType = string.Empty;
            Status = string.Empty;
            Outcome = string.Empty;
            TaskId = string.Empty;
            AssignedTo = string.Empty;
            CandidateSummary = string.Empty;
            Summary = string.Empty;
            Comment = string.Empty;
            Events = new List<WorkflowTransparencyEvent>();
        }
    }

    public class WorkflowTransparencyEvent
    {
        public string ActionType { get; set; }
        public string DisplayLabel { get; set; }
        public string ActorName { get; set; }
        public string TargetUser { get; set; }
        public string Outcome { get; set; }
        public string Comment { get; set; }
        public DateTime CreatedAt { get; set; }

        public WorkflowTransparencyEvent()
        {
            ActionType = string.Empty;
            DisplayLabel = string.Empty;
            ActorName = string.Empty;
            TargetUser = string.Empty;
            Outcome = string.Empty;
            Comment = string.Empty;
            CreatedAt = DateTime.UtcNow;
        }
    }
}
