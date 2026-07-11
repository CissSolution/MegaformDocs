using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;

namespace MegaForm.Umbraco.Data
{
    /// <summary>
    /// EF-backed workflow repository for the Umbraco host.
    /// Stores workflow envelopes, executions, cases, tasks and task actions
    /// in the same database used by Umbraco (umbracoDbDSN).
    /// </summary>
    public class UmbracoWorkflowRepository : IWorkflowRepository
    {
        private readonly MegaFormDbContext _db;

        private static readonly JsonSerializerSettings _json = new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,
            DefaultValueHandling = DefaultValueHandling.Ignore,
        };

        public UmbracoWorkflowRepository(MegaFormDbContext db) { _db = db; }

        // ─── Envelope ────────────────────────────────────────────────────────

        public WorkflowEnvelope GetEnvelope(int formId)
        {
            var form = _db.Forms.AsNoTracking().FirstOrDefault(f => f.FormId == formId);
            if (form == null || string.IsNullOrWhiteSpace(form.WorkflowJson))
                return new WorkflowEnvelope();
            return WorkflowEnvelope.ParseOrMigrate(form.WorkflowJson);
        }

        public void SaveDraft(int formId, WorkflowDefinition draft)
        {
            var form = _db.Forms.FirstOrDefault(f => f.FormId == formId);
            if (form == null)
                throw new InvalidOperationException("Form " + formId + " not found.");

            var env = WorkflowEnvelope.ParseOrMigrate(form.WorkflowJson);
            draft.UpdatedAt = DateTime.UtcNow;
            env.DraftWorkflow = draft;
            env.DraftUpdatedAt = DateTime.UtcNow;
            env.DraftVersion = BumpDraftVersion(env.DraftVersion);

            form.WorkflowJson = JsonConvert.SerializeObject(env, _json);
            form.UpdatedOnUtc = DateTime.UtcNow;
            _db.SaveChanges();
        }

        public void ApplyDraft(int formId, string appliedBy = "system")
        {
            var form = _db.Forms.FirstOrDefault(f => f.FormId == formId);
            if (form == null)
                throw new InvalidOperationException("Form " + formId + " not found.");

            var env = WorkflowEnvelope.ParseOrMigrate(form.WorkflowJson);
            if (env.DraftWorkflow == null)
                throw new InvalidOperationException("No draft to apply for form " + formId + ".");

            env.AppliedWorkflow = env.DraftWorkflow;
            env.AppliedAt = DateTime.UtcNow;
            env.AppliedBy = appliedBy ?? "system";
            env.AppliedVersion = ToAppliedVersion(env.DraftVersion);

            form.WorkflowJson = JsonConvert.SerializeObject(env, _json);
            form.UpdatedOnUtc = DateTime.UtcNow;
            _db.SaveChanges();
        }

        // ─── Legacy compatibility ────────────────────────────────────────────

        public WorkflowDefinition GetByFormId(int formId)
        {
            var env = GetEnvelope(formId);
            return env.AppliedWorkflow;
        }

        public void Save(int formId, WorkflowDefinition definition)
        {
            SaveDraft(formId, definition);
            ApplyDraft(formId, "legacy-save");
        }

        // ─── Executions ──────────────────────────────────────────────────────

        public string SaveExecution(WorkflowExecutionContext ctx)
        {
            var row = new WorkflowExecutionRow
            {
                ExecutionId = ctx.ExecutionId,
                FormId = ctx.FormId,
                SubmissionId = ctx.SubmissionId,
                Status = ctx.Status.ToString().ToLower(),
                StartedAt = ctx.StartedAt,
                CurrentNodeId = ctx.CurrentNodeId ?? "",
                ContextJson = Serialize(ctx),
                ErrorMessage = ctx.ErrorMessage ?? "",
            };
            _db.WorkflowExecutions.Add(row);
            _db.SaveChanges();
            return ctx.ExecutionId;
        }

        public void UpdateExecution(WorkflowExecutionContext ctx)
        {
            var row = _db.WorkflowExecutions.FirstOrDefault(r => r.ExecutionId == ctx.ExecutionId);
            if (row == null) return;
            row.Status = ctx.Status.ToString().ToLower();
            row.CurrentNodeId = ctx.CurrentNodeId ?? "";
            row.CompletedAt = ctx.CompletedAt;
            row.ContextJson = Serialize(ctx);
            row.ErrorMessage = ctx.ErrorMessage ?? "";
            _db.SaveChanges();
        }

        public WorkflowExecutionContext GetExecution(string executionId)
        {
            var row = _db.WorkflowExecutions.AsNoTracking()
                .FirstOrDefault(r => r.ExecutionId == executionId);
            if (row == null || string.IsNullOrWhiteSpace(row.ContextJson)) return null;
            try { return JsonConvert.DeserializeObject<WorkflowExecutionContext>(row.ContextJson, _json); }
            catch { return null; }
        }

        public List<WorkflowExecutionSummary> ListExecutions(int formId, int pageIndex = 0, int pageSize = 20)
        {
            return _db.WorkflowExecutions.AsNoTracking()
                .Where(r => r.FormId == formId)
                .OrderByDescending(r => r.StartedAt)
                .Skip(pageIndex * pageSize).Take(pageSize)
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
                    DurationMs = r.CompletedAt.HasValue
                        ? (long)(r.CompletedAt.Value - r.StartedAt).TotalMilliseconds : 0,
                }).ToList();
        }

        // ─── Cases & Tasks ───────────────────────────────────────────────────

        public WorkflowCaseInstance GetCase(string caseId)
        {
            var row = _db.WorkflowCases.AsNoTracking().FirstOrDefault(r => r.CaseId == caseId);
            return row == null ? null : MapCase(row);
        }

        public WorkflowCaseInstance GetCaseByExecution(string executionId)
        {
            var row = _db.WorkflowCases.AsNoTracking().FirstOrDefault(r => r.ExecutionId == executionId);
            return row == null ? null : MapCase(row);
        }

        public void SaveCase(WorkflowCaseInstance workflowCase)
        {
            if (workflowCase == null) return;
            var row = _db.WorkflowCases.Find(workflowCase.CaseId);
            if (row == null)
            {
                row = new WorkflowCaseRow { CaseId = workflowCase.CaseId, CreatedAt = workflowCase.CreatedAt };
                _db.WorkflowCases.Add(row);
            }
            row.ExecutionId = workflowCase.ExecutionId ?? string.Empty;
            row.FormId = workflowCase.FormId;
            row.SubmissionId = workflowCase.SubmissionId;
            row.WorkflowId = workflowCase.WorkflowId ?? string.Empty;
            row.CurrentNodeId = workflowCase.CurrentNodeId ?? string.Empty;
            row.Status = (int)workflowCase.Status;
            row.StartedByUserId = workflowCase.StartedByUserId;
            row.StartedByUserName = workflowCase.StartedByUserName ?? string.Empty;
            row.ActiveTaskId = workflowCase.ActiveTaskId ?? string.Empty;
            row.Outcome = workflowCase.Outcome ?? string.Empty;
            row.LastComment = workflowCase.LastComment ?? string.Empty;
            row.CompletedAt = workflowCase.CompletedAt;
            _db.SaveChanges();
        }

        public WorkflowTaskInstance GetTask(string taskId)
        {
            var row = _db.WorkflowTasks.AsNoTracking().FirstOrDefault(r => r.TaskId == taskId);
            return row == null ? null : MapTask(row);
        }

        public WorkflowTaskInstance GetActiveTask(string executionId, string nodeId)
        {
            var row = _db.WorkflowTasks.AsNoTracking()
                .Where(r => r.ExecutionId == executionId && r.NodeId == nodeId)
                .Where(r => r.Status == (int)WorkflowTaskStatus.Pending || r.Status == (int)WorkflowTaskStatus.Claimed)
                .OrderByDescending(r => r.CreatedAt)
                .FirstOrDefault();
            return row == null ? null : MapTask(row);
        }

        public List<WorkflowTaskInstance> ListTasks(WorkflowTaskQuery query)
        {
            var q = _db.WorkflowTasks.AsNoTracking().AsQueryable();
            if (query == null) return q.OrderByDescending(r => r.CreatedAt).Take(50).Select(MapTask).ToList();
            if (query.FormId.HasValue) q = q.Where(r => r.FormId == query.FormId.Value);
            if (query.SubmissionId.HasValue) q = q.Where(r => r.SubmissionId == query.SubmissionId.Value);
            if (!string.IsNullOrEmpty(query.CaseId)) q = q.Where(r => r.CaseId == query.CaseId);
            if (!string.IsNullOrEmpty(query.ExecutionId)) q = q.Where(r => r.ExecutionId == query.ExecutionId);
            if (query.OpenOnly) q = q.Where(r => r.Status == (int)WorkflowTaskStatus.Pending || r.Status == (int)WorkflowTaskStatus.Claimed);
            q = q.OrderByDescending(r => r.CreatedAt);
            var page = query.PageIndex < 0 ? 0 : query.PageIndex;
            var size = query.PageSize <= 0 ? 50 : Math.Min(query.PageSize, 250);
            return q.Skip(page * size).Take(size).Select(MapTask).ToList();
        }

        public void SaveTask(WorkflowTaskInstance task)
        {
            if (task == null) return;
            var row = _db.WorkflowTasks.Find(task.TaskId);
            if (row == null)
            {
                row = new WorkflowTaskRow { TaskId = task.TaskId, CreatedAt = task.CreatedAt };
                _db.WorkflowTasks.Add(row);
            }
            row.CaseId = task.CaseId ?? string.Empty;
            row.ExecutionId = task.ExecutionId ?? string.Empty;
            row.FormId = task.FormId;
            row.SubmissionId = task.SubmissionId;
            row.NodeId = task.NodeId ?? string.Empty;
            row.NodeLabel = task.NodeLabel ?? string.Empty;
            row.Status = (int)task.Status;
            row.CandidateRolesJson = JsonConvert.SerializeObject(task.CandidateRoles ?? new List<string>(), _json);
            row.CandidateUsersJson = JsonConvert.SerializeObject(task.CandidateUsers ?? new List<string>(), _json);
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
            row.ClaimedAt = task.ClaimedAt;
            row.DueAt = task.DueAt;
            row.CompletedAt = task.CompletedAt;
            _db.SaveChanges();
        }

        public void AddTaskAction(WorkflowTaskAction action)
        {
            if (action == null) return;
            _db.WorkflowTaskActions.Add(new WorkflowTaskActionRow
            {
                ActionId = string.IsNullOrEmpty(action.ActionId) ? Guid.NewGuid().ToString("N") : action.ActionId,
                TaskId = action.TaskId ?? string.Empty,
                CaseId = action.CaseId ?? string.Empty,
                ExecutionId = action.ExecutionId ?? string.Empty,
                FormId = action.FormId,
                SubmissionId = action.SubmissionId,
                ActionType = (int)action.ActionType,
                ActorUserId = action.ActorUserId,
                ActorUserName = action.ActorUserName ?? string.Empty,
                ActorDisplayName = action.ActorDisplayName ?? string.Empty,
                TargetUser = action.TargetUser ?? string.Empty,
                Outcome = action.Outcome ?? string.Empty,
                Comment = action.Comment ?? string.Empty,
                CreatedAt = action.CreatedAt == default ? DateTime.UtcNow : action.CreatedAt,
            });
            _db.SaveChanges();
        }

        public List<WorkflowTaskAction> ListTaskActions(string taskId)
        {
            return _db.WorkflowTaskActions.AsNoTracking()
                .Where(r => r.TaskId == taskId)
                .OrderByDescending(r => r.CreatedAt)
                .Select(r => new WorkflowTaskAction
                {
                    ActionId = r.ActionId,
                    TaskId = r.TaskId,
                    CaseId = r.CaseId,
                    ExecutionId = r.ExecutionId,
                    FormId = r.FormId,
                    SubmissionId = r.SubmissionId,
                    ActionType = (WorkflowTaskActionType)r.ActionType,
                    ActorUserId = r.ActorUserId,
                    ActorUserName = r.ActorUserName,
                    ActorDisplayName = r.ActorDisplayName,
                    TargetUser = r.TargetUser,
                    Outcome = r.Outcome,
                    Comment = r.Comment,
                    CreatedAt = r.CreatedAt,
                }).ToList();
        }

        // ─── Helpers ─────────────────────────────────────────────────────────

        private static WorkflowCaseInstance MapCase(WorkflowCaseRow r) => new WorkflowCaseInstance
        {
            CaseId = r.CaseId,
            ExecutionId = r.ExecutionId,
            FormId = r.FormId,
            SubmissionId = r.SubmissionId,
            WorkflowId = r.WorkflowId,
            CurrentNodeId = r.CurrentNodeId,
            Status = (WorkflowCaseStatus)r.Status,
            StartedByUserId = r.StartedByUserId,
            StartedByUserName = r.StartedByUserName,
            ActiveTaskId = r.ActiveTaskId,
            Outcome = r.Outcome,
            LastComment = r.LastComment,
            CreatedAt = r.CreatedAt,
            CompletedAt = r.CompletedAt,
        };

        private static WorkflowTaskInstance MapTask(WorkflowTaskRow r)
        {
            List<string> DeserializeList(string json)
            {
                try { return JsonConvert.DeserializeObject<List<string>>(json, _json) ?? new List<string>(); }
                catch { return new List<string>(); }
            }
            return new WorkflowTaskInstance
            {
                TaskId = r.TaskId,
                CaseId = r.CaseId,
                ExecutionId = r.ExecutionId,
                FormId = r.FormId,
                SubmissionId = r.SubmissionId,
                NodeId = r.NodeId,
                NodeLabel = r.NodeLabel,
                Status = (WorkflowTaskStatus)r.Status,
                CandidateRoles = DeserializeList(r.CandidateRolesJson),
                CandidateUsers = DeserializeList(r.CandidateUsersJson),
                AssignedUserId = r.AssignedUserId,
                AssignedUserName = r.AssignedUserName,
                AssignedDisplayName = r.AssignedDisplayName,
                AllowClaim = r.AllowClaim,
                AllowForward = r.AllowForward,
                AllowReassign = r.AllowReassign,
                CommentRequiredOnReject = r.CommentRequiredOnReject,
                PendingSubmissionStatus = r.PendingSubmissionStatus,
                ApprovedSubmissionStatus = r.ApprovedSubmissionStatus,
                RejectedSubmissionStatus = r.RejectedSubmissionStatus,
                Outcome = r.Outcome,
                Comment = r.Comment,
                CreatedAt = r.CreatedAt,
                ClaimedAt = r.ClaimedAt,
                DueAt = r.DueAt,
                CompletedAt = r.CompletedAt,
            };
        }

        private static string BumpDraftVersion(string current)
        {
            if (string.IsNullOrEmpty(current)) return "1.0.1-draft";
            var base2 = current.Replace("-draft", "");
            var parts = base2.Split('.');
            if (parts.Length >= 3 && int.TryParse(parts[2], out int patch))
                parts[2] = (patch + 1).ToString();
            return string.Join(".", parts) + "-draft";
        }

        private static string ToAppliedVersion(string draftVersion)
        {
            if (string.IsNullOrEmpty(draftVersion)) return "1.0.0";
            return draftVersion.Replace("-draft", "");
        }

        private string Serialize(WorkflowExecutionContext ctx)
        {
            try { return JsonConvert.SerializeObject(ctx, _json); }
            catch { return "{}"; }
        }
    }
}
