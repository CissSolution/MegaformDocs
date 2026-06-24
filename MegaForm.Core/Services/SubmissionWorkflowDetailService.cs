using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Builds a workflow detail payload for a submission so hosts can render the
    /// same flow/timeline UI without duplicating workflow lookup logic.
    /// </summary>
    public class SubmissionWorkflowDetailService
    {
        private readonly IWorkflowRepository _workflowRepository;
        private readonly WorkflowTransparencyService _workflowTransparency;

        public SubmissionWorkflowDetailService()
            : this(null, null)
        {
        }

        public SubmissionWorkflowDetailService(
            IWorkflowRepository workflowRepository,
            WorkflowTransparencyService workflowTransparency)
        {
            _workflowRepository = workflowRepository;
            _workflowTransparency = workflowTransparency ?? new WorkflowTransparencyService();
        }

        public SubmissionWorkflowDetailInfo GetDetail(SubmissionDetailResult detail)
        {
            if (detail == null || detail.Submission == null)
                return new SubmissionWorkflowDetailInfo();

            return GetDetail(detail.Form, detail.Submission.FormId, detail.Submission.SubmissionId);
        }

        public SubmissionWorkflowDetailInfo GetDetail(FormInfo form, int formId, int submissionId)
        {
            var workflow = ResolveWorkflowDefinition(form, formId);
            var tasks = _workflowRepository != null
                ? (_workflowRepository.ListTasks(new WorkflowTaskQuery
                {
                    SubmissionId = submissionId,
                    OpenOnly = false,
                    PageIndex = 0,
                    PageSize = 250
                }) ?? new List<WorkflowTaskInstance>())
                    .OrderBy(t => t.CreatedAt)
                    .ThenBy(t => t.TaskId)
                    .ToList()
                : new List<WorkflowTaskInstance>();

            var workflowCase = ResolveWorkflowCase(tasks);
            var execution = ResolveExecution(tasks, workflowCase);
            var actions = tasks
                .SelectMany(t => ResolveTaskActions(t))
                .OrderBy(a => a.CreatedAt)
                .ThenBy(a => a.ActionId)
                .ToList();

            var info = new SubmissionWorkflowDetailInfo
            {
                HasWorkflow = workflow != null || workflowCase != null || execution != null || tasks.Count > 0,
                Workflow = workflow,
                WorkflowExecution = execution,
                WorkflowCase = workflowCase,
                WorkflowTasks = tasks,
                WorkflowActions = actions
            };

            if (info.HasWorkflow)
            {
                info.Transparency = _workflowTransparency.Build(
                    workflow,
                    execution,
                    workflowCase,
                    tasks,
                    actions);
            }

            return info;
        }

        private WorkflowDefinition ResolveWorkflowDefinition(FormInfo form, int formId)
        {
            if (_workflowRepository != null && formId > 0)
            {
                var persisted = _workflowRepository.GetByFormId(formId);
                if (persisted != null)
                    return persisted;
            }

            if (form == null || string.IsNullOrWhiteSpace(form.WorkflowJson))
                return null;

            try
            {
                var envelope = WorkflowEnvelope.ParseOrMigrate(form.WorkflowJson);
                if (envelope != null)
                    return envelope.AppliedWorkflow ?? envelope.DraftWorkflow;
            }
            catch
            {
            }

            try
            {
                return JsonConvert.DeserializeObject<WorkflowDefinition>(form.WorkflowJson);
            }
            catch
            {
                return null;
            }
        }

        private WorkflowCaseInstance ResolveWorkflowCase(IList<WorkflowTaskInstance> tasks)
        {
            if (_workflowRepository == null || tasks == null)
                return null;

            foreach (var task in tasks)
            {
                if (task == null)
                    continue;

                if (!string.IsNullOrWhiteSpace(task.CaseId))
                {
                    var byCaseId = _workflowRepository.GetCase(task.CaseId);
                    if (byCaseId != null)
                        return byCaseId;
                }

                if (!string.IsNullOrWhiteSpace(task.ExecutionId))
                {
                    var byExecution = _workflowRepository.GetCaseByExecution(task.ExecutionId);
                    if (byExecution != null)
                        return byExecution;
                }
            }

            return null;
        }

        private WorkflowExecutionContext ResolveExecution(
            IList<WorkflowTaskInstance> tasks,
            WorkflowCaseInstance workflowCase)
        {
            if (_workflowRepository == null)
                return null;

            var executionId = workflowCase != null ? workflowCase.ExecutionId : string.Empty;
            if (string.IsNullOrWhiteSpace(executionId) && tasks != null)
            {
                executionId = tasks
                    .Where(t => t != null && !string.IsNullOrWhiteSpace(t.ExecutionId))
                    .OrderByDescending(t => t.CreatedAt)
                    .Select(t => t.ExecutionId)
                    .FirstOrDefault();
            }

            if (string.IsNullOrWhiteSpace(executionId))
                return null;

            return _workflowRepository.GetExecution(executionId);
        }

        private IEnumerable<WorkflowTaskAction> ResolveTaskActions(WorkflowTaskInstance task)
        {
            if (_workflowRepository == null || task == null || string.IsNullOrWhiteSpace(task.TaskId))
                return new List<WorkflowTaskAction>();

            return _workflowRepository.ListTaskActions(task.TaskId) ?? new List<WorkflowTaskAction>();
        }
    }
}
