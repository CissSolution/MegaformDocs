using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;

namespace MegaForm.AspNetCore.Component
{
    /// <summary>
    /// Free-tier no-op workflow engine. Keeps DI resolvable when the premium
    /// workflow package is not installed, without executing any workflows.
    /// </summary>
    public sealed class NoOpWorkflowEngine : IWorkflowEngine
    {
        public Task<WorkflowExecutionContext> ExecuteAsync(
            int formId,
            int submissionId,
            Dictionary<string, object> formData,
            CancellationToken ct)
        {
            return Task.FromResult(new WorkflowExecutionContext
            {
                FormId = formId,
                SubmissionId = submissionId,
                Status = WorkflowExecutionStatus.Completed,
                CompletedAt = DateTime.UtcNow,
            });
        }

        public Task<WorkflowNavigationResult> EvaluateNavigationAsync(
            int formId,
            string currentNodeId,
            Dictionary<string, object> formData,
            CancellationToken ct)
        {
            return Task.FromResult(new WorkflowNavigationResult());
        }

        public Task<WorkflowExecutionContext> GetExecutionStatusAsync(string executionId)
        {
            return Task.FromResult<WorkflowExecutionContext>(null);
        }

        public Task<WorkflowExecutionContext> ResumeAsync(
            string executionId,
            string outcomeHandle,
            Dictionary<string, object> resumeData,
            CancellationToken ct)
        {
            return Task.FromResult<WorkflowExecutionContext>(null);
        }

        public Task CancelExecutionAsync(string executionId)
        {
            return Task.CompletedTask;
        }
    }
}
