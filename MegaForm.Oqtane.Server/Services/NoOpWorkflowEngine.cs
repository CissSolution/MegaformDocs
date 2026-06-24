using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// [OQ-difix20260418-05] No-op IWorkflowEngine for Oqtane build.
    ///
    /// Why this exists:
    ///   The "real" engine (WorkflowEngineV2) requires a chain of services that the
    ///   Oqtane port has never wired up:
    ///     - IWorkflowRepository       (only MegaForm.Web has an EF impl)
    ///     - IWorkflowEvaluator         (would need WorkflowEvaluator registered)
    ///     - IEnumerable&lt;INodeExecutor&gt;  (10 implementations in MegaForm.Core/Workflow/*)
    ///   Each NodeExecutor in turn pulls more services (IEmailSender, IFormRepository,
    ///   HttpClient for webhooks, Google API client, etc.). Wiring all of them risks
    ///   a cascade of new DI failures and is wasted work for users who only need
    ///   Save/Publish/List CRUD — which is what "MegaForm core" actually does.
    ///
    /// What this implementation does:
    ///   - ExecuteAsync: returns a "Completed" context immediately, no nodes ran.
    ///   - EvaluateNavigationAsync: returns no field effects, no skip — client-side
    ///     navigation already drives the form, server-side eval is the secondary path.
    ///   - GetExecutionStatusAsync / CancelExecutionAsync: harmless no-ops.
    ///
    /// Effect on the user:
    ///   Forms save and submissions persist. Email/Webhook/Database/GoogleSheets
    ///   workflow nodes do NOT fire on Oqtane. To enable them later, register
    ///   IWorkflowRepository + IWorkflowEvaluator + every INodeExecutor in Startup
    ///   and swap this no-op for WorkflowEngineV2.
    /// </summary>
    public class NoOpWorkflowEngine : IWorkflowEngine
    {
        public Task<WorkflowExecutionContext> ExecuteAsync(
            int formId,
            int submissionId,
            Dictionary<string, object> formData,
            CancellationToken ct)
        {
            var ctx = new WorkflowExecutionContext
            {
                ExecutionId  = System.Guid.NewGuid().ToString("N"),
                FormId       = formId,
                SubmissionId = submissionId,
                FormData     = formData ?? new Dictionary<string, object>(),
                Variables    = new Dictionary<string, object>(),
                NodeResults  = new Dictionary<string, object>(),
                Status       = WorkflowExecutionStatus.Completed,
            };
            return Task.FromResult(ctx);
        }

        public Task<WorkflowNavigationResult> EvaluateNavigationAsync(
            int formId,
            string currentNodeId,
            Dictionary<string, object> formData,
            CancellationToken ct)
        {
            // Empty result — no next node, no skip, no field effects.
            // Client-side WorkflowNavigator.ts handles real navigation.
            return Task.FromResult(new WorkflowNavigationResult
            {
                NextNodeId    = null,
                SkipToPageIndex = null,
                FieldEffects  = new List<WorkflowFieldEffect>(),
            });
        }

        public Task<WorkflowExecutionContext> GetExecutionStatusAsync(string executionId)
        {
            // Engine is stateless — return a synthetic "completed" context.
            return Task.FromResult(new WorkflowExecutionContext
            {
                ExecutionId = executionId,
                Status      = WorkflowExecutionStatus.Completed,
                FormData    = new Dictionary<string, object>(),
                Variables   = new Dictionary<string, object>(),
                NodeResults = new Dictionary<string, object>(),
            });
        }

        // [Recovered June-15] No real workflow runs in the no-op engine, so a resume
        // request just returns a synthetic completed context (graceful no-workflow).
        public Task<WorkflowExecutionContext> ResumeAsync(
            string executionId,
            string outcomeHandle,
            Dictionary<string, object> resumeData,
            CancellationToken ct)
        {
            return Task.FromResult(new WorkflowExecutionContext
            {
                ExecutionId = executionId,
                Status      = WorkflowExecutionStatus.Completed,
                FormData    = new Dictionary<string, object>(),
                Variables   = new Dictionary<string, object>(),
                NodeResults = new Dictionary<string, object>(),
            });
        }

        public Task CancelExecutionAsync(string executionId) => Task.CompletedTask;
    }
}
