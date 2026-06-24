using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Workflow;

namespace MegaForm.Umbraco.Data
{
    /// <summary>
    /// In-memory workflow repository for Umbraco. Keeps the DI graph complete
    /// and lets the workflow engine v2 run approvals/forwarding without
    /// requiring a dedicated Umbraco schema migration in this phase.
    /// Data survives for the lifetime of the application process.
    /// </summary>
    public class UmbracoWorkflowRepository : IWorkflowRepository
    {
        private readonly ConcurrentDictionary<int, WorkflowEnvelope> _envelopes = new ConcurrentDictionary<int, WorkflowEnvelope>();
        private readonly ConcurrentDictionary<string, WorkflowExecutionContext> _executions = new ConcurrentDictionary<string, WorkflowExecutionContext>();
        private readonly ConcurrentDictionary<string, WorkflowCaseInstance> _cases = new ConcurrentDictionary<string, WorkflowCaseInstance>();
        private readonly ConcurrentDictionary<string, WorkflowTaskInstance> _tasks = new ConcurrentDictionary<string, WorkflowTaskInstance>();
        private readonly ConcurrentDictionary<string, WorkflowTaskAction> _actions = new ConcurrentDictionary<string, WorkflowTaskAction>();

        private readonly IFormRepository _formRepo;

        public UmbracoWorkflowRepository(IFormRepository formRepo)
        {
            _formRepo = formRepo;
        }

        public WorkflowEnvelope GetEnvelope(int formId)
        {
            return _envelopes.TryGetValue(formId, out var env) ? env : new WorkflowEnvelope();
        }

        public void SaveDraft(int formId, WorkflowDefinition draft)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null)
                throw new InvalidOperationException("Form " + formId + " not found.");

            var env = GetEnvelope(formId);
            draft.UpdatedAt = DateTime.UtcNow;
            env.DraftWorkflow = draft;
            env.DraftUpdatedAt = DateTime.UtcNow;
            env.DraftVersion = BumpDraftVersion(env.DraftVersion);
            _envelopes[formId] = env;
        }

        public void ApplyDraft(int formId, string appliedBy = "system")
        {
            var form = _formRepo.GetForm(formId);
            if (form == null)
                throw new InvalidOperationException("Form " + formId + " not found.");

            var env = GetEnvelope(formId);
            if (env.DraftWorkflow == null)
                throw new InvalidOperationException("No draft to apply for form " + formId + ".");

            env.AppliedWorkflow = env.DraftWorkflow;
            env.AppliedAt = DateTime.UtcNow;
            env.AppliedBy = string.IsNullOrWhiteSpace(appliedBy) ? "system" : appliedBy;
            env.AppliedVersion = ToAppliedVersion(env.DraftVersion);
            _envelopes[formId] = env;
        }

        public WorkflowDefinition GetByFormId(int formId)
        {
            return GetEnvelope(formId).AppliedWorkflow;
        }

        public void Save(int formId, WorkflowDefinition definition)
        {
            SaveDraft(formId, definition);
            ApplyDraft(formId, "legacy-save");
        }

        public string SaveExecution(WorkflowExecutionContext ctx)
        {
            _executions[ctx.ExecutionId] = ctx;
            return ctx.ExecutionId;
        }

        public void UpdateExecution(WorkflowExecutionContext ctx)
        {
            _executions[ctx.ExecutionId] = ctx;
        }

        public WorkflowExecutionContext GetExecution(string executionId)
        {
            _executions.TryGetValue(executionId, out var ctx);
            return ctx;
        }

        public List<WorkflowExecutionSummary> ListExecutions(int formId, int pageIndex = 0, int pageSize = 20)
        {
            var items = _executions.Values
                .Where(e => e.FormId == formId)
                .OrderByDescending(e => e.StartedAt)
                .Select(e => new WorkflowExecutionSummary
                {
                    ExecutionId = e.ExecutionId,
                    FormId = e.FormId,
                    SubmissionId = e.SubmissionId,
                    Status = e.Status.ToString().ToLowerInvariant(),
                    CurrentNodeId = e.CurrentNodeId ?? string.Empty,
                    ErrorMessage = e.ErrorMessage ?? string.Empty,
                    StartedAt = e.StartedAt,
                    CompletedAt = e.CompletedAt,
                    DurationMs = e.CompletedAt.HasValue
                        ? (long)(e.CompletedAt.Value - e.StartedAt).TotalMilliseconds
                        : 0
                })
                .ToList();

            return ApplyPaging(items, pageIndex, pageSize);
        }

        public WorkflowCaseInstance GetCase(string caseId)
        {
            _cases.TryGetValue(caseId, out var c);
            return c;
        }

        public WorkflowCaseInstance GetCaseByExecution(string executionId)
        {
            return _cases.Values.FirstOrDefault(c => c.ExecutionId == executionId);
        }

        public void SaveCase(WorkflowCaseInstance workflowCase)
        {
            if (workflowCase == null || string.IsNullOrWhiteSpace(workflowCase.CaseId))
                return;
            _cases[workflowCase.CaseId] = workflowCase;
        }

        public WorkflowTaskInstance GetTask(string taskId)
        {
            _tasks.TryGetValue(taskId, out var t);
            return t;
        }

        public WorkflowTaskInstance GetActiveTask(string executionId, string nodeId)
        {
            return _tasks.Values
                .Where(t => t.ExecutionId == executionId && t.NodeId == nodeId)
                .Where(t => t.Status == WorkflowTaskStatus.Pending || t.Status == WorkflowTaskStatus.Claimed)
                .OrderByDescending(t => t.CreatedAt)
                .FirstOrDefault();
        }

        public List<WorkflowTaskInstance> ListTasks(WorkflowTaskQuery query)
        {
            query = query ?? new WorkflowTaskQuery();
            var items = _tasks.Values.AsQueryable();

            if (query.FormId.HasValue)
                items = items.Where(t => t.FormId == query.FormId.Value);
            if (query.SubmissionId.HasValue)
                items = items.Where(t => t.SubmissionId == query.SubmissionId.Value);
            if (!string.IsNullOrWhiteSpace(query.CaseId))
                items = items.Where(t => t.CaseId == query.CaseId);
            if (!string.IsNullOrWhiteSpace(query.ExecutionId))
                items = items.Where(t => t.ExecutionId == query.ExecutionId);
            if (query.OpenOnly)
                items = items.Where(t => t.Status == WorkflowTaskStatus.Pending || t.Status == WorkflowTaskStatus.Claimed);

            var pageSize = query.PageSize > 0 ? query.PageSize : 50;
            return items
                .OrderByDescending(t => t.CreatedAt)
                .Skip(query.PageIndex * pageSize)
                .Take(pageSize)
                .ToList();
        }

        public void SaveTask(WorkflowTaskInstance task)
        {
            if (task == null || string.IsNullOrWhiteSpace(task.TaskId))
                return;
            _tasks[task.TaskId] = task;
        }

        public void AddTaskAction(WorkflowTaskAction action)
        {
            if (action == null || string.IsNullOrWhiteSpace(action.ActionId))
                return;
            _actions[action.ActionId] = action;
        }

        public List<WorkflowTaskAction> ListTaskActions(string taskId)
        {
            return _actions.Values
                .Where(a => a.TaskId == taskId)
                .OrderBy(a => a.CreatedAt)
                .ToList();
        }

        private static List<WorkflowExecutionSummary> ApplyPaging(List<WorkflowExecutionSummary> items, int pageIndex, int pageSize)
        {
            if (pageSize <= 0) pageSize = 20;
            if (pageIndex < 0) pageIndex = 0;
            return items.Skip(pageIndex * pageSize).Take(pageSize).ToList();
        }

        private static string BumpDraftVersion(string current)
        {
            if (string.IsNullOrEmpty(current))
                return "1.0.1-draft";
            var baseVersion = current.Replace("-draft", "");
            var parts = baseVersion.Split('.');
            if (parts.Length >= 3 && int.TryParse(parts[2], out var patch))
                parts[2] = (patch + 1).ToString();
            return string.Join(".", parts) + "-draft";
        }

        private static string ToAppliedVersion(string draftVersion)
        {
            if (string.IsNullOrEmpty(draftVersion))
                return "1.0.0";
            return draftVersion.Replace("-draft", "");
        }
    }
}
