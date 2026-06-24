using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Oqtane.Server.Data
{
    public class EfWorkflowRepository : IWorkflowRepository
    {
        private readonly IDbContextFactory<MegaFormDbContext> _dbContextFactory;

        private static readonly JsonSerializerSettings JsonSettings = new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,
            DefaultValueHandling = DefaultValueHandling.Ignore
        };

        public EfWorkflowRepository(IDbContextFactory<MegaFormDbContext> dbContextFactory)
        {
            _dbContextFactory = dbContextFactory ?? throw new ArgumentNullException(nameof(dbContextFactory));
        }

        public WorkflowEnvelope GetEnvelope(int formId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var form = db.Forms.AsNoTracking().FirstOrDefault(f => f.FormId == formId);
            if (form == null || string.IsNullOrWhiteSpace(form.WorkflowJson))
                return new WorkflowEnvelope();

            return WorkflowEnvelope.ParseOrMigrate(form.WorkflowJson);
        }

        public void SaveDraft(int formId, WorkflowDefinition draft)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var form = db.Forms.FirstOrDefault(f => f.FormId == formId);
            if (form == null)
                throw new InvalidOperationException("Form " + formId + " not found.");

            var env = WorkflowEnvelope.ParseOrMigrate(form.WorkflowJson);
            draft = draft ?? new WorkflowDefinition();
            draft.UpdatedAt = DateTime.UtcNow;
            env.DraftWorkflow = draft;
            env.DraftUpdatedAt = DateTime.UtcNow;
            env.DraftVersion = BumpDraftVersion(env.DraftVersion);

            form.WorkflowJson = JsonConvert.SerializeObject(env, JsonSettings);
            form.UpdatedOnUtc = DateTime.UtcNow;
            db.SaveChanges();
        }

        public void ApplyDraft(int formId, string appliedBy = "system")
        {
            using var db = _dbContextFactory.CreateDbContext();
            var form = db.Forms.FirstOrDefault(f => f.FormId == formId);
            if (form == null)
                throw new InvalidOperationException("Form " + formId + " not found.");

            var env = WorkflowEnvelope.ParseOrMigrate(form.WorkflowJson);
            if (env.DraftWorkflow == null)
                throw new InvalidOperationException("No draft to apply for form " + formId + ".");

            env.AppliedWorkflow = env.DraftWorkflow;
            env.AppliedAt = DateTime.UtcNow;
            env.AppliedBy = appliedBy ?? "system";
            env.AppliedVersion = ToAppliedVersion(env.DraftVersion);

            form.WorkflowJson = JsonConvert.SerializeObject(env, JsonSettings);
            form.UpdatedOnUtc = DateTime.UtcNow;
            db.SaveChanges();
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
            using var db = _dbContextFactory.CreateDbContext();
            db.Set<WorkflowExecutionRow>().Add(new WorkflowExecutionRow
            {
                ExecutionId = ctx.ExecutionId,
                FormId = ctx.FormId,
                SubmissionId = ctx.SubmissionId,
                Status = (ctx.Status.ToString() ?? "running").ToLowerInvariant(),
                StartedAt = ctx.StartedAt,
                CurrentNodeId = ctx.CurrentNodeId ?? string.Empty,
                ContextJson = Serialize(ctx),
                ErrorMessage = ctx.ErrorMessage ?? string.Empty
            });
            db.SaveChanges();
            return ctx.ExecutionId;
        }

        public void UpdateExecution(WorkflowExecutionContext ctx)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var row = db.Set<WorkflowExecutionRow>().FirstOrDefault(r => r.ExecutionId == ctx.ExecutionId);
            if (row == null)
                return;

            row.Status = (ctx.Status.ToString() ?? "running").ToLowerInvariant();
            row.CurrentNodeId = ctx.CurrentNodeId ?? string.Empty;
            row.CompletedAt = ctx.CompletedAt;
            row.ContextJson = Serialize(ctx);
            row.ErrorMessage = ctx.ErrorMessage ?? string.Empty;
            db.SaveChanges();
        }

        public WorkflowExecutionContext GetExecution(string executionId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var row = db.Set<WorkflowExecutionRow>().AsNoTracking()
                .FirstOrDefault(r => r.ExecutionId == executionId);
            if (row == null || string.IsNullOrWhiteSpace(row.ContextJson))
                return null;

            try
            {
                return JsonConvert.DeserializeObject<WorkflowExecutionContext>(row.ContextJson, JsonSettings);
            }
            catch
            {
                return null;
            }
        }

        public List<WorkflowExecutionSummary> ListExecutions(int formId, int pageIndex = 0, int pageSize = 20)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.Set<WorkflowExecutionRow>().AsNoTracking()
                .Where(r => r.FormId == formId)
                .OrderByDescending(r => r.StartedAt)
                .Skip(pageIndex * pageSize)
                .Take(pageSize)
                .Select(r => new WorkflowExecutionSummary
                {
                    ExecutionId = r.ExecutionId,
                    FormId = r.FormId,
                    SubmissionId = r.SubmissionId,
                    Status = r.Status,
                    CurrentNodeId = r.CurrentNodeId,
                    ErrorMessage = r.ErrorMessage,
                    StartedAt = r.StartedAt,
                    CompletedAt = r.CompletedAt,
                    DurationMs = r.CompletedAt.HasValue ? (long)(r.CompletedAt.Value - r.StartedAt).TotalMilliseconds : 0
                })
                .ToList();
        }

        public WorkflowCaseInstance GetCase(string caseId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var row = db.Set<WorkflowCaseRow>().AsNoTracking().FirstOrDefault(r => r.CaseId == caseId);
            return row == null ? null : MapCase(row);
        }

        public WorkflowCaseInstance GetCaseByExecution(string executionId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var row = db.Set<WorkflowCaseRow>().AsNoTracking().FirstOrDefault(r => r.ExecutionId == executionId);
            return row == null ? null : MapCase(row);
        }

        public void SaveCase(WorkflowCaseInstance workflowCase)
        {
            if (workflowCase == null || string.IsNullOrWhiteSpace(workflowCase.CaseId))
                return;

            using var db = _dbContextFactory.CreateDbContext();
            var row = db.Set<WorkflowCaseRow>().FirstOrDefault(r => r.CaseId == workflowCase.CaseId);
            if (row == null)
            {
                row = new WorkflowCaseRow { CaseId = workflowCase.CaseId };
                db.Set<WorkflowCaseRow>().Add(row);
            }

            row.ExecutionId = workflowCase.ExecutionId ?? string.Empty;
            row.FormId = workflowCase.FormId;
            row.SubmissionId = workflowCase.SubmissionId;
            row.WorkflowId = workflowCase.WorkflowId ?? string.Empty;
            row.CurrentNodeId = workflowCase.CurrentNodeId ?? string.Empty;
            row.Status = (workflowCase.Status.ToString() ?? "running").ToLowerInvariant();
            row.StartedByUserId = workflowCase.StartedByUserId;
            row.StartedByUserName = workflowCase.StartedByUserName ?? string.Empty;
            row.ActiveTaskId = workflowCase.ActiveTaskId ?? string.Empty;
            row.Outcome = workflowCase.Outcome ?? string.Empty;
            row.LastComment = workflowCase.LastComment ?? string.Empty;
            row.CreatedAt = workflowCase.CreatedAt;
            row.CompletedAt = workflowCase.CompletedAt;
            db.SaveChanges();
        }

        public WorkflowTaskInstance GetTask(string taskId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var row = db.Set<WorkflowTaskRow>().AsNoTracking().FirstOrDefault(r => r.TaskId == taskId);
            return row == null ? null : MapTask(row);
        }

        public WorkflowTaskInstance GetActiveTask(string executionId, string nodeId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var row = db.Set<WorkflowTaskRow>().AsNoTracking()
                .Where(r => r.ExecutionId == executionId && r.NodeId == nodeId)
                .Where(r => r.Status == "pending" || r.Status == "claimed")
                .OrderByDescending(r => r.CreatedAt)
                .FirstOrDefault();
            return row == null ? null : MapTask(row);
        }

        public List<WorkflowTaskInstance> ListTasks(WorkflowTaskQuery query)
        {
            query = query ?? new WorkflowTaskQuery();
            using var db = _dbContextFactory.CreateDbContext();

            var rows = db.Set<WorkflowTaskRow>().AsNoTracking().AsQueryable();
            if (query.FormId.HasValue)
                rows = rows.Where(r => r.FormId == query.FormId.Value);
            if (query.SubmissionId.HasValue)
                rows = rows.Where(r => r.SubmissionId == query.SubmissionId.Value);
            if (!string.IsNullOrWhiteSpace(query.CaseId))
                rows = rows.Where(r => r.CaseId == query.CaseId);
            if (!string.IsNullOrWhiteSpace(query.ExecutionId))
                rows = rows.Where(r => r.ExecutionId == query.ExecutionId);
            if (query.OpenOnly)
                rows = rows.Where(r => r.Status == "pending" || r.Status == "claimed");

            if (query.PageSize <= 0) query.PageSize = 50;
            if (query.PageSize > 500) query.PageSize = 500;
            if (query.PageIndex < 0) query.PageIndex = 0;

            return rows
                .OrderByDescending(r => r.CreatedAt)
                .Skip(query.PageIndex * query.PageSize)
                .Take(query.PageSize)
                .ToList()
                .Select(MapTask)
                .ToList();
        }

        public void SaveTask(WorkflowTaskInstance task)
        {
            if (task == null || string.IsNullOrWhiteSpace(task.TaskId))
                return;

            using var db = _dbContextFactory.CreateDbContext();
            var row = db.Set<WorkflowTaskRow>().FirstOrDefault(r => r.TaskId == task.TaskId);
            if (row == null)
            {
                row = new WorkflowTaskRow { TaskId = task.TaskId };
                db.Set<WorkflowTaskRow>().Add(row);
            }

            row.CaseId = task.CaseId ?? string.Empty;
            row.ExecutionId = task.ExecutionId ?? string.Empty;
            row.FormId = task.FormId;
            row.SubmissionId = task.SubmissionId;
            row.NodeId = task.NodeId ?? string.Empty;
            row.NodeLabel = task.NodeLabel ?? string.Empty;
            row.Status = (task.Status.ToString() ?? "pending").ToLowerInvariant();
            row.CandidateRolesJson = SerializeList(task.CandidateRoles);
            row.CandidateUsersJson = SerializeList(task.CandidateUsers);
            row.AssignedUserId = task.AssignedUserId;
            row.AssignedUserName = task.AssignedUserName ?? string.Empty;
            row.AssignedDisplayName = task.AssignedDisplayName ?? string.Empty;
            row.AllowClaim = task.AllowClaim;
            row.AllowForward = task.AllowForward;
            row.AllowReassign = task.AllowReassign;
            row.CommentRequiredOnReject = task.CommentRequiredOnReject;
            row.PendingSubmissionStatus = task.PendingSubmissionStatus ?? "pending_approval";
            row.ApprovedSubmissionStatus = task.ApprovedSubmissionStatus ?? "approved";
            row.RejectedSubmissionStatus = task.RejectedSubmissionStatus ?? "rejected";
            row.Outcome = task.Outcome ?? string.Empty;
            row.Comment = task.Comment ?? string.Empty;
            row.CreatedAt = task.CreatedAt;
            row.ClaimedAt = task.ClaimedAt;
            row.DueAt = task.DueAt;
            row.CompletedAt = task.CompletedAt;
            db.SaveChanges();
        }

        public void AddTaskAction(WorkflowTaskAction action)
        {
            if (action == null || string.IsNullOrWhiteSpace(action.ActionId))
                return;

            using var db = _dbContextFactory.CreateDbContext();
            var exists = db.Set<WorkflowTaskActionRow>().AsNoTracking().Any(a => a.ActionId == action.ActionId);
            if (exists)
                return;

            db.Set<WorkflowTaskActionRow>().Add(new WorkflowTaskActionRow
            {
                ActionId = action.ActionId,
                TaskId = action.TaskId ?? string.Empty,
                CaseId = action.CaseId ?? string.Empty,
                ExecutionId = action.ExecutionId ?? string.Empty,
                FormId = action.FormId,
                SubmissionId = action.SubmissionId,
                ActionType = (action.ActionType.ToString() ?? string.Empty).ToLowerInvariant(),
                ActorUserId = action.ActorUserId,
                ActorUserName = action.ActorUserName ?? string.Empty,
                ActorDisplayName = action.ActorDisplayName ?? string.Empty,
                TargetUser = action.TargetUser ?? string.Empty,
                Outcome = action.Outcome ?? string.Empty,
                Comment = action.Comment ?? string.Empty,
                CreatedAt = action.CreatedAt
            });
            db.SaveChanges();
        }

        public List<WorkflowTaskAction> ListTaskActions(string taskId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.Set<WorkflowTaskActionRow>().AsNoTracking()
                .Where(r => r.TaskId == taskId)
                .OrderBy(r => r.CreatedAt)
                .ToList()
                .Select(MapAction)
                .ToList();
        }

        private static string Serialize(WorkflowExecutionContext ctx)
        {
            try { return JsonConvert.SerializeObject(ctx, JsonSettings); }
            catch { return "{}"; }
        }

        private static string SerializeList(List<string> values)
        {
            try { return JsonConvert.SerializeObject(values ?? new List<string>()); }
            catch { return "[]"; }
        }

        private static List<string> DeserializeList(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
                return new List<string>();

            try
            {
                return JsonConvert.DeserializeObject<List<string>>(json) ?? new List<string>();
            }
            catch
            {
                return new List<string>();
            }
        }

        private static string BumpDraftVersion(string current)
        {
            if (string.IsNullOrEmpty(current))
                return "1.0.1-draft";

            var baseVersion = current.Replace("-draft", string.Empty);
            var parts = baseVersion.Split('.');
            if (parts.Length >= 3 && int.TryParse(parts[2], out var patch))
                parts[2] = (patch + 1).ToString();

            return string.Join(".", parts) + "-draft";
        }

        private static string ToAppliedVersion(string draftVersion)
        {
            if (string.IsNullOrEmpty(draftVersion))
                return "1.0.0";

            return draftVersion.Replace("-draft", string.Empty);
        }

        private static WorkflowCaseInstance MapCase(WorkflowCaseRow row)
        {
            if (!Enum.TryParse(row.Status ?? string.Empty, true, out WorkflowCaseStatus status))
                status = WorkflowCaseStatus.Running;

            return new WorkflowCaseInstance
            {
                CaseId = row.CaseId,
                ExecutionId = row.ExecutionId,
                FormId = row.FormId,
                SubmissionId = row.SubmissionId,
                WorkflowId = row.WorkflowId,
                CurrentNodeId = row.CurrentNodeId,
                Status = status,
                StartedByUserId = row.StartedByUserId,
                StartedByUserName = row.StartedByUserName,
                ActiveTaskId = row.ActiveTaskId,
                Outcome = row.Outcome,
                LastComment = row.LastComment,
                CreatedAt = row.CreatedAt,
                CompletedAt = row.CompletedAt
            };
        }

        private static WorkflowTaskInstance MapTask(WorkflowTaskRow row)
        {
            if (!Enum.TryParse(row.Status ?? string.Empty, true, out WorkflowTaskStatus status))
                status = WorkflowTaskStatus.Pending;

            return new WorkflowTaskInstance
            {
                TaskId = row.TaskId,
                CaseId = row.CaseId,
                ExecutionId = row.ExecutionId,
                FormId = row.FormId,
                SubmissionId = row.SubmissionId,
                NodeId = row.NodeId,
                NodeLabel = row.NodeLabel,
                Status = status,
                CandidateRoles = DeserializeList(row.CandidateRolesJson),
                CandidateUsers = DeserializeList(row.CandidateUsersJson),
                AssignedUserId = row.AssignedUserId,
                AssignedUserName = row.AssignedUserName,
                AssignedDisplayName = row.AssignedDisplayName,
                AllowClaim = row.AllowClaim,
                AllowForward = row.AllowForward,
                AllowReassign = row.AllowReassign,
                CommentRequiredOnReject = row.CommentRequiredOnReject,
                PendingSubmissionStatus = row.PendingSubmissionStatus,
                ApprovedSubmissionStatus = row.ApprovedSubmissionStatus,
                RejectedSubmissionStatus = row.RejectedSubmissionStatus,
                Outcome = row.Outcome,
                Comment = row.Comment,
                CreatedAt = row.CreatedAt,
                ClaimedAt = row.ClaimedAt,
                DueAt = row.DueAt,
                CompletedAt = row.CompletedAt
            };
        }

        private static WorkflowTaskAction MapAction(WorkflowTaskActionRow row)
        {
            if (!Enum.TryParse(row.ActionType ?? string.Empty, true, out WorkflowTaskActionType actionType))
                actionType = WorkflowTaskActionType.Commented;

            return new WorkflowTaskAction
            {
                ActionId = row.ActionId,
                TaskId = row.TaskId,
                CaseId = row.CaseId,
                ExecutionId = row.ExecutionId,
                FormId = row.FormId,
                SubmissionId = row.SubmissionId,
                ActionType = actionType,
                ActorUserId = row.ActorUserId,
                ActorUserName = row.ActorUserName,
                ActorDisplayName = row.ActorDisplayName,
                TargetUser = row.TargetUser,
                Outcome = row.Outcome,
                Comment = row.Comment,
                CreatedAt = row.CreatedAt
            };
        }
    }
}
