using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Builds host-agnostic admin detail and inbox shells from shared repositories.
    /// Web / DNN / Oqtane can render different shells on top of the same shape.
    /// </summary>
    public class AdminRecordShellService
    {
        private readonly SubmissionQueryService _submissionQueries;
        private readonly WorkflowTaskService _workflowTasks;
        private readonly IWorkflowRepository _workflowRepository;
        private readonly IFormRepository _forms;
        private readonly ISubmissionRepository _submissions;
        private readonly IDocumentRepository _documents;
        private readonly AppProfileService _profiles;
        private readonly WorkflowTransparencyService _workflowTransparency;

        public AdminRecordShellService(
            SubmissionQueryService submissionQueries,
            WorkflowTaskService workflowTasks,
            IWorkflowRepository workflowRepository,
            IFormRepository forms,
            ISubmissionRepository submissions,
            IDocumentRepository documents,
            AppProfileService profiles,
            WorkflowTransparencyService workflowTransparency)
        {
            _submissionQueries = submissionQueries;
            _workflowTasks = workflowTasks;
            _workflowRepository = workflowRepository;
            _forms = forms;
            _submissions = submissions;
            _documents = documents;
            _profiles = profiles;
            _workflowTransparency = workflowTransparency;
        }

        public AdminRecordShellInfo GetRecordDetail(int submissionId)
        {
            var detail = _submissionQueries.GetDetail(submissionId);
            if (detail == null || detail.Submission == null)
                return null;

            var data = ParseData(detail.Submission.DataJson);
            var projection = _profiles.Project(detail.Form, detail.Schema, detail.Submission, data);
            var tasks = (_workflowRepository.ListTasks(new WorkflowTaskQuery
            {
                SubmissionId = submissionId,
                OpenOnly = false,
                PageIndex = 0,
                PageSize = 200
            }) ?? new List<WorkflowTaskInstance>())
                .OrderByDescending(t => t.CreatedAt)
                .ThenByDescending(t => t.CompletedAt ?? DateTime.MinValue)
                .ToList();

            var workflowActions = tasks
                .SelectMany(t => _workflowRepository.ListTaskActions(t.TaskId) ?? new List<WorkflowTaskAction>())
                .OrderByDescending(x => x.CreatedAt)
                .ToList();

            var workflowCase = ResolveCase(tasks);
            var workflowDefinition = detail.Form != null ? _workflowRepository.GetByFormId(detail.Form.FormId) : null;
            var workflowExecution = ResolveExecution(workflowCase, tasks);
            var currentRevision = _documents.GetRevisionBySubmission(submissionId);
            DocumentInfo document = null;
            DocumentRevisionInfo latestRevision = null;
            DocumentRevisionInfo publishedRevision = null;
            DocumentMetadataInfo metadata = null;
            var assignments = new List<DocumentAssignmentInfo>();
            var comments = new List<DocumentCommentInfo>();
            var directives = new List<DocumentDirectiveInfo>();
            var aliases = new List<DocumentAliasInfo>();
            var publicUrl = string.Empty;

            if (currentRevision != null)
            {
                document = _documents.GetDocument(currentRevision.DocumentId);
                if (document != null)
                {
                    latestRevision = _documents.GetLatestRevision(document.DocumentId);
                    publishedRevision = _documents.GetPublishedRevision(document.DocumentId);
                    metadata = _documents.GetMetadata(document.DocumentId);
                    assignments = _documents.ListAssignments(document.DocumentId) ?? new List<DocumentAssignmentInfo>();
                    comments = _documents.ListComments(document.DocumentId) ?? new List<DocumentCommentInfo>();
                    directives = _documents.ListDirectives(document.DocumentId) ?? new List<DocumentDirectiveInfo>();
                    aliases = _documents.ListAliases(document.DocumentId) ?? new List<DocumentAliasInfo>();
                    publicUrl = "/documents/" + document.Slug;
                }
            }

            return new AdminRecordShellInfo
            {
                Detail = detail,
                Projection = projection,
                WorkflowDefinition = workflowDefinition,
                WorkflowExecution = workflowExecution,
                WorkflowCase = workflowCase,
                WorkflowTasks = tasks,
                WorkflowActions = workflowActions,
                WorkflowTransparency = _workflowTransparency.Build(
                    workflowDefinition,
                    workflowExecution,
                    workflowCase,
                    tasks,
                    workflowActions),
                Document = document,
                CurrentRevision = currentRevision,
                LatestRevision = latestRevision,
                PublishedRevision = publishedRevision,
                DocumentMetadata = metadata,
                Assignments = assignments,
                Comments = comments,
                Directives = directives,
                Aliases = aliases,
                PublicUrl = publicUrl
            };
        }

        public AdminInboxShellResult GetInbox(UserContext actor, int pageIndex, int pageSize)
        {
            var inbox = _workflowTasks.GetInbox(actor, pageIndex, pageSize);
            return new AdminInboxShellResult
            {
                GeneratedAt = inbox.GeneratedAt,
                MyTasks = MapTaskList(inbox.MyTasks),
                RoleQueue = MapTaskList(inbox.RoleQueue)
            };
        }

        private List<AdminInboxTaskItem> MapTaskList(IEnumerable<WorkflowTaskInstance> tasks)
        {
            var list = new List<AdminInboxTaskItem>();
            if (tasks == null)
                return list;

            foreach (var task in tasks)
            {
                list.Add(MapTask(task));
            }

            return list;
        }

        private AdminInboxTaskItem MapTask(WorkflowTaskInstance task)
        {
            var submission = task != null && task.SubmissionId > 0 ? _submissions.Get(task.SubmissionId) : null;
            var form = task != null && task.FormId > 0 ? _forms.GetForm(task.FormId) : null;
            var schema = TryParseSchema(form != null ? form.SchemaJson : null);
            var data = ParseData(submission != null ? submission.DataJson : null);
            var projection = _profiles.Project(form, schema, submission, data);
            var workflowCase = ResolveCase(task);
            var currentRevision = task != null && task.SubmissionId > 0 ? _documents.GetRevisionBySubmission(task.SubmissionId) : null;
            DocumentInfo document = null;
            DocumentMetadataInfo metadata = null;
            int assignmentCount = 0;
            int openDirectiveCount = 0;
            var publicUrl = string.Empty;

            if (currentRevision != null)
            {
                document = _documents.GetDocument(currentRevision.DocumentId);
                if (document != null)
                {
                    metadata = _documents.GetMetadata(document.DocumentId);
                    var assignments = _documents.ListAssignments(document.DocumentId) ?? new List<DocumentAssignmentInfo>();
                    var directives = _documents.ListDirectives(document.DocumentId) ?? new List<DocumentDirectiveInfo>();
                    assignmentCount = assignments.Count(a =>
                        !string.Equals(a.Status, DocumentAssignmentStatuses.Completed, StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(a.Status, DocumentAssignmentStatuses.Cancelled, StringComparison.OrdinalIgnoreCase));
                    openDirectiveCount = directives.Count(d =>
                        !string.Equals(d.Status, DocumentDirectiveStatuses.Completed, StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(d.Status, DocumentDirectiveStatuses.Cancelled, StringComparison.OrdinalIgnoreCase));
                    publicUrl = "/documents/" + document.Slug;
                }
            }

            return new AdminInboxTaskItem
            {
                Task = task,
                WorkflowCase = workflowCase,
                Form = form,
                Submission = submission,
                Projection = projection,
                Document = document,
                DocumentMetadata = metadata,
                RecordUrl = task != null && task.SubmissionId > 0 ? "/admin/records/" + task.SubmissionId.ToString(CultureInfo.InvariantCulture) : string.Empty,
                PublicUrl = publicUrl,
                AssignmentCount = assignmentCount,
                OpenDirectiveCount = openDirectiveCount
            };
        }

        private WorkflowCaseInstance ResolveCase(IEnumerable<WorkflowTaskInstance> tasks)
        {
            if (tasks == null)
                return null;

            foreach (var task in tasks)
            {
                var workflowCase = ResolveCase(task);
                if (workflowCase != null)
                    return workflowCase;
            }

            return null;
        }

        private WorkflowCaseInstance ResolveCase(WorkflowTaskInstance task)
        {
            if (task == null)
                return null;

            if (!string.IsNullOrWhiteSpace(task.CaseId))
            {
                var byId = _workflowRepository.GetCase(task.CaseId);
                if (byId != null)
                    return byId;
            }

            if (!string.IsNullOrWhiteSpace(task.ExecutionId))
                return _workflowRepository.GetCaseByExecution(task.ExecutionId);

            return null;
        }

        private WorkflowExecutionContext ResolveExecution(
            WorkflowCaseInstance workflowCase,
            IEnumerable<WorkflowTaskInstance> tasks)
        {
            var executionId = workflowCase != null ? workflowCase.ExecutionId : null;
            if (string.IsNullOrWhiteSpace(executionId))
            {
                executionId = (tasks ?? new List<WorkflowTaskInstance>())
                    .Where(t => !string.IsNullOrWhiteSpace(t.ExecutionId))
                    .OrderByDescending(t => t.CreatedAt)
                    .Select(t => t.ExecutionId)
                    .FirstOrDefault();
            }

            if (string.IsNullOrWhiteSpace(executionId))
                return null;

            return _workflowRepository.GetExecution(executionId);
        }

        private static Dictionary<string, object> ParseData(string dataJson)
        {
            if (string.IsNullOrWhiteSpace(dataJson))
                return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            try
            {
                var parsed = JsonConvert.DeserializeObject<Dictionary<string, object>>(dataJson);
                return parsed ?? new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            }
            catch
            {
                return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            }
        }

        private static FormSchema TryParseSchema(string schemaJson)
        {
            if (string.IsNullOrWhiteSpace(schemaJson))
                return null;
            try { return JsonConvert.DeserializeObject<FormSchema>(schemaJson); }
            catch { return null; }
        }
    }
}
