using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Workflow;

namespace MegaForm.Sdk.Tests
{
    /// <summary>In-memory IFormRepository for SDK contract tests (no DB).</summary>
    internal sealed class InMemoryFormRepository : IFormRepository
    {
        private readonly Dictionary<int, FormInfo> _forms = new();
        private int _seq = 0;

        public FormInfo GetForm(int formId) => _forms.TryGetValue(formId, out var f) ? f : null;

        public List<FormInfo> GetFormsByModule(int moduleId) =>
            _forms.Values.Where(f => f.ModuleId == moduleId).ToList();

        public List<FormInfo> ListForms(int portalId, string status = null, string search = null, int pageIndex = 0, int pageSize = 20)
        {
            IEnumerable<FormInfo> q = _forms.Values.Where(f => f.PortalId == portalId);
            if (!string.IsNullOrEmpty(status)) q = q.Where(f => string.Equals(f.Status, status, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrEmpty(search)) q = q.Where(f => (f.Title ?? "").IndexOf(search, StringComparison.OrdinalIgnoreCase) >= 0);
            return q.Skip(pageIndex * pageSize).Take(pageSize).ToList();
        }

        public int SaveForm(FormInfo form)
        {
            if (form.FormId == 0) form.FormId = ++_seq;
            _forms[form.FormId] = form;
            return form.FormId;
        }

        public void DeleteForm(int formId) => _forms.Remove(formId);

        public FormStatsInfo GetFormStats(int formId) => new FormStatsInfo { TotalSubmissions = 0 };

        public int DuplicateForm(int formId, int userId)
        {
            var src = GetForm(formId);
            if (src == null) return 0;
            var copy = new FormInfo { PortalId = src.PortalId, Title = src.Title + " (copy)", SchemaJson = src.SchemaJson, Status = src.Status };
            return SaveForm(copy);
        }
    }

    /// <summary>In-memory ISubmissionRepository for SDK contract tests (no DB).</summary>
    internal sealed class InMemorySubmissionRepository : ISubmissionRepository
    {
        private readonly Dictionary<int, SubmissionInfo> _subs = new();
        private int _seq = 0;

        public int Insert(SubmissionInfo sub)
        {
            if (sub.SubmissionId == 0) sub.SubmissionId = ++_seq;
            if (sub.SubmittedOnUtc == default) sub.SubmittedOnUtc = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            _subs[sub.SubmissionId] = sub;
            return sub.SubmissionId;
        }

        public SubmissionInfo Get(int submissionId) => _subs.TryGetValue(submissionId, out var s) ? s : null;

        public List<SubmissionValueInfo> GetValues(int submissionId) => new();

        public (List<SubmissionInfo> Items, int TotalCount) List(int formId, string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null, int pageIndex = 0, int pageSize = 50)
        {
            IEnumerable<SubmissionInfo> q = _subs.Values.Where(s => s.FormId == formId);
            if (!string.IsNullOrEmpty(status)) q = q.Where(s => string.Equals(s.Status, status, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrEmpty(search)) q = q.Where(s => (s.DataJson ?? "").IndexOf(search, StringComparison.OrdinalIgnoreCase) >= 0);
            if (dateFrom.HasValue) q = q.Where(s => s.SubmittedOnUtc >= dateFrom.Value);
            if (dateTo.HasValue) q = q.Where(s => s.SubmittedOnUtc <= dateTo.Value);
            var all = q.OrderBy(s => s.SubmissionId).ToList();
            var page = all.Skip(pageIndex * pageSize).Take(pageSize).ToList();
            return (page, all.Count);
        }

        public void UpdateStatus(int submissionId, string status) { if (_subs.TryGetValue(submissionId, out var s)) s.Status = status; }
        public void UpdateData(int submissionId, string dataJson) { if (_subs.TryGetValue(submissionId, out var s)) s.DataJson = dataJson; }
        public void Delete(int submissionId) => _subs.Remove(submissionId);
        public void BulkDelete(int formId, int[] submissionIds) { foreach (var id in submissionIds) _subs.Remove(id); }
        public void InsertValues(int submissionId, List<SubmissionValueInfo> values) { }
    }

    /// <summary>In-memory IFileRepository for SDK Files-API contract tests.</summary>
    internal sealed class InMemoryFileRepository : IFileRepository
    {
        private readonly List<FileInfo> _files = new();
        private int _seq = 0;
        public int InsertFile(FileInfo file) { if (file.FileId == 0) file.FileId = ++_seq; _files.Add(file); return file.FileId; }
        public List<FileInfo> GetBySubmission(int submissionId) => _files.Where(f => f.SubmissionId == submissionId).ToList();
        public void DeleteBySubmission(int submissionId) => _files.RemoveAll(f => f.SubmissionId == submissionId);
    }

    /// <summary>In-memory IStorageService: stores bytes keyed by a fake path.</summary>
    internal sealed class InMemoryStorage : IStorageService
    {
        private readonly Dictionary<string, byte[]> _blobs = new();
        public void Put(string path, byte[] bytes) => _blobs[path] = bytes;
        public System.Threading.Tasks.Task<string> SaveFileAsync(System.IO.Stream stream, string fileName, string folder)
        { using var ms = new System.IO.MemoryStream(); stream.CopyTo(ms); var p = folder + "/" + fileName; _blobs[p] = ms.ToArray(); return System.Threading.Tasks.Task.FromResult(p); }
        public System.IO.Stream GetFile(string filePath) => _blobs.TryGetValue(filePath, out var b) ? new System.IO.MemoryStream(b) : null;
        public void DeleteFile(string filePath) => _blobs.Remove(filePath);
        public string GetFileUrl(string filePath) => "/files/" + filePath;
    }

    internal sealed class InMemoryWorkflowRepository : IWorkflowRepository
    {
        private readonly Dictionary<string, WorkflowCaseInstance> _cases = new();
        private readonly Dictionary<string, WorkflowExecutionContext> _executions = new();
        private readonly Dictionary<string, WorkflowTaskInstance> _tasks = new();
        private readonly List<WorkflowTaskAction> _actions = new();

        public WorkflowEnvelope GetEnvelope(int formId) => new WorkflowEnvelope();
        public void SaveDraft(int formId, WorkflowDefinition draft) { }
        public void ApplyDraft(int formId, string appliedBy = "system") { }
        public WorkflowDefinition GetByFormId(int formId) => null;
        public void Save(int formId, WorkflowDefinition definition) { }

        public string SaveExecution(WorkflowExecutionContext ctx)
        {
            _executions[ctx.ExecutionId] = ctx;
            return ctx.ExecutionId;
        }

        public void UpdateExecution(WorkflowExecutionContext ctx) => _executions[ctx.ExecutionId] = ctx;
        public WorkflowExecutionContext GetExecution(string executionId) => _executions.TryGetValue(executionId, out var ctx) ? ctx : null;
        public List<WorkflowExecutionSummary> ListExecutions(int formId, int pageIndex = 0, int pageSize = 20) => new();

        public WorkflowCaseInstance GetCase(string caseId) => !string.IsNullOrEmpty(caseId) && _cases.TryGetValue(caseId, out var c) ? c : null;

        public WorkflowCaseInstance GetCaseByExecution(string executionId) =>
            _cases.Values.FirstOrDefault(c => string.Equals(c.ExecutionId, executionId, StringComparison.OrdinalIgnoreCase));

        public void SaveCase(WorkflowCaseInstance workflowCase) => _cases[workflowCase.CaseId] = workflowCase;

        public WorkflowTaskInstance GetTask(string taskId) => !string.IsNullOrEmpty(taskId) && _tasks.TryGetValue(taskId, out var t) ? t : null;

        public WorkflowTaskInstance GetActiveTask(string executionId, string nodeId) =>
            _tasks.Values.FirstOrDefault(t => string.Equals(t.ExecutionId, executionId, StringComparison.OrdinalIgnoreCase) &&
                                              string.Equals(t.NodeId, nodeId, StringComparison.OrdinalIgnoreCase) &&
                                              (t.Status == WorkflowTaskStatus.Pending || t.Status == WorkflowTaskStatus.Claimed));

        public List<WorkflowTaskInstance> ListTasks(WorkflowTaskQuery query)
        {
            query ??= new WorkflowTaskQuery();
            IEnumerable<WorkflowTaskInstance> q = _tasks.Values;
            if (query.FormId.HasValue) q = q.Where(t => t.FormId == query.FormId.Value);
            if (query.SubmissionId.HasValue) q = q.Where(t => t.SubmissionId == query.SubmissionId.Value);
            if (!string.IsNullOrEmpty(query.CaseId)) q = q.Where(t => string.Equals(t.CaseId, query.CaseId, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrEmpty(query.ExecutionId)) q = q.Where(t => string.Equals(t.ExecutionId, query.ExecutionId, StringComparison.OrdinalIgnoreCase));
            if (query.OpenOnly) q = q.Where(t => t.Status == WorkflowTaskStatus.Pending || t.Status == WorkflowTaskStatus.Claimed);
            var pageSize = query.PageSize <= 0 ? 50 : query.PageSize;
            var pageIndex = query.PageIndex < 0 ? 0 : query.PageIndex;
            return q.OrderBy(t => t.CreatedAt).Skip(pageIndex * pageSize).Take(pageSize).ToList();
        }

        public void SaveTask(WorkflowTaskInstance task) => _tasks[task.TaskId] = task;
        public void AddTaskAction(WorkflowTaskAction action) => _actions.Add(action);
        public List<WorkflowTaskAction> ListTaskActions(string taskId) => _actions.Where(a => a.TaskId == taskId).ToList();
    }

    internal sealed class FakeWorkflowEngine : IWorkflowEngine
    {
        public Task<WorkflowExecutionContext> ExecuteAsync(int formId, int submissionId, Dictionary<string, object> formData, CancellationToken ct) =>
            Task.FromResult(new WorkflowExecutionContext { FormId = formId, SubmissionId = submissionId, Status = WorkflowExecutionStatus.Completed, CompletedAt = DateTime.UtcNow });

        public Task<WorkflowNavigationResult> EvaluateNavigationAsync(int formId, string currentNodeId, Dictionary<string, object> formData, CancellationToken ct) =>
            Task.FromResult(new WorkflowNavigationResult());

        public Task<WorkflowExecutionContext> GetExecutionStatusAsync(string executionId) =>
            Task.FromResult(new WorkflowExecutionContext { ExecutionId = executionId, Status = WorkflowExecutionStatus.Completed });

        public Task<WorkflowExecutionContext> ResumeAsync(string executionId, string outcomeHandle, Dictionary<string, object> resumeData, CancellationToken ct) =>
            Task.FromResult(new WorkflowExecutionContext { ExecutionId = executionId, Status = WorkflowExecutionStatus.Completed, CompletedAt = DateTime.UtcNow });

        public Task CancelExecutionAsync(string executionId) => Task.CompletedTask;
        public bool HasExecutableWorkflow(int formId) => true;
    }
}
