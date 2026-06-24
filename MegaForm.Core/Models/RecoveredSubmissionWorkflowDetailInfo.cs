using System.Collections.Generic;
using MegaForm.Core.Workflow;

// [Recovered 2026-06-15] June-added model whose defining file was lost in the
// April-21 revert (see memory: project-april-revert-incident-recovery). Consumed by
// Services/SubmissionWorkflowDetailService.cs (`using MegaForm.Core.Models`).
// Re-extracted verbatim from the deployed MegaForm.Core.dll (June-15) via ilspycmd.
namespace MegaForm.Core.Models
{
    public class SubmissionWorkflowDetailInfo
    {
        public bool HasWorkflow { get; set; }

        public WorkflowDefinition Workflow { get; set; }

        public WorkflowExecutionContext WorkflowExecution { get; set; }

        public WorkflowCaseInstance WorkflowCase { get; set; }

        public List<WorkflowTaskInstance> WorkflowTasks { get; set; }

        public List<WorkflowTaskAction> WorkflowActions { get; set; }

        public WorkflowTransparencyInfo Transparency { get; set; }

        public SubmissionWorkflowDetailInfo()
        {
            WorkflowTasks = new List<WorkflowTaskInstance>();
            WorkflowActions = new List<WorkflowTaskAction>();
            Transparency = new WorkflowTransparencyInfo();
        }
    }
}
