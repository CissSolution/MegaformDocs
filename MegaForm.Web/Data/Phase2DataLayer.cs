using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;

namespace MegaForm.Web.Data
{
    // ── Extra EF entities (không có sẵn trong Core.Models) ────────────────

    public class UniqueIdCounterRow
    {
        public int    Id       { get; set; }
        public int    FormId   { get; set; }
        public string FieldKey { get; set; }
        public long   Counter  { get; set; }
    }

    public class RateLimitRow
    {
        public int      Id         { get; set; }
        public string   IpAddress  { get; set; }
        public int      FormId     { get; set; }
        public DateTime CreatedUtc { get; set; }
    }

    public class WorkflowCaseRow
    {
        public string   CaseId          { get; set; }
        public string   ExecutionId     { get; set; }
        public int      FormId          { get; set; }
        public int      SubmissionId    { get; set; }
        public string   WorkflowId      { get; set; }
        public string   CurrentNodeId   { get; set; }
        public int      Status          { get; set; }
        public int?     StartedByUserId { get; set; }
        public string   StartedByUserName { get; set; }
        public string   ActiveTaskId    { get; set; }
        public string   Outcome         { get; set; }
        public string   LastComment     { get; set; }
        public DateTime CreatedAt       { get; set; }
        public DateTime? CompletedAt    { get; set; }
    }

    public class WorkflowTaskRow
    {
        public string   TaskId          { get; set; }
        public string   CaseId          { get; set; }
        public string   ExecutionId     { get; set; }
        public int      FormId          { get; set; }
        public int      SubmissionId    { get; set; }
        public string   NodeId          { get; set; }
        public string   NodeLabel       { get; set; }
        public int      Status          { get; set; }
        public string   CandidateRolesJson { get; set; }
        public string   CandidateUsersJson { get; set; }
        public int?     AssignedUserId  { get; set; }
        public string   AssignedUserName { get; set; }
        public string   AssignedDisplayName { get; set; }
        public bool     AllowClaim      { get; set; }
        public bool     AllowForward    { get; set; }
        public bool     AllowReassign   { get; set; }
        public bool     CommentRequiredOnReject { get; set; }
        public string   PendingSubmissionStatus { get; set; }
        public string   ApprovedSubmissionStatus { get; set; }
        public string   RejectedSubmissionStatus { get; set; }
        public string   Outcome         { get; set; }
        public string   Comment         { get; set; }
        public DateTime CreatedAt       { get; set; }
        public DateTime? ClaimedAt      { get; set; }
        public DateTime? DueAt          { get; set; }
        public DateTime? CompletedAt    { get; set; }
    }

    public class WorkflowTaskActionRow
    {
        public string   ActionId        { get; set; }
        public string   TaskId          { get; set; }
        public string   CaseId          { get; set; }
        public string   ExecutionId     { get; set; }
        public int      FormId          { get; set; }
        public int      SubmissionId    { get; set; }
        public int      ActionType      { get; set; }
        public int?     ActorUserId     { get; set; }
        public string   ActorUserName   { get; set; }
        public string   ActorDisplayName { get; set; }
        public string   TargetUser      { get; set; }
        public string   Outcome         { get; set; }
        public string   Comment         { get; set; }
        public DateTime CreatedAt       { get; set; }
    }

    // ── Partial DbContext — thêm Phase2 DbSets ────────────────────────────

    public partial class MegaFormDbContext
    {
        // TextType được định nghĩa trong DataLayer.cs (partial class)

        public DbSet<FormViewInfo>       FormViews        { get; set; }
        public DbSet<TemplateInfo>       Templates        { get; set; }
        public DbSet<FormPermissionInfo> FormPermissions  { get; set; }
        public DbSet<WorkflowInfo>       Workflows        { get; set; }
        public DbSet<AuditLogInfo>       AuditLogs        { get; set; }
        public DbSet<UniqueIdCounterRow> UniqueIdCounters { get; set; }
        public DbSet<RateLimitRow>       RateLimits       { get; set; }
        public DbSet<WorkflowCaseRow>    WorkflowCases    { get; set; }
        public DbSet<WorkflowTaskRow>    WorkflowTasks    { get; set; }
        public DbSet<WorkflowTaskActionRow> WorkflowTaskActions { get; set; }
        public DbSet<AppDefinitionInfo>  AppDefinitions   { get; set; }
        public DbSet<AppQueryDefinitionInfo> AppQueries   { get; set; }
        public DbSet<FormRelationInfo>   FormRelations    { get; set; }
        public DbSet<SubmissionLinkInfo> SubmissionLinks  { get; set; }
    }

    // ── EfPhase2Repository ─────────────────────────────────────────────────

    public class EfPhase2Repository : IPhase2Repository
    {
        private readonly MegaFormDbContext _db;
        public EfPhase2Repository(MegaFormDbContext db) { _db = db; }

        // Views
        public List<FormViewInfo> GetFormViews(int formId) =>
            _db.FormViews.Where(v => v.FormId == formId).ToList();
        public int SaveFormView(FormViewInfo v)
        {
            if (v.ViewId == 0) _db.FormViews.Add(v); else _db.FormViews.Update(v);
            _db.SaveChanges(); return v.ViewId;
        }
        public void DeleteFormView(int viewId)
        {
            var v = _db.FormViews.Find(viewId);
            if (v != null) { _db.FormViews.Remove(v); _db.SaveChanges(); }
        }

        // Templates
        public List<TemplateInfo> ListTemplates(int portalId, string category = null)
        {
            var q = _db.Templates.Where(t => t.PortalId == portalId || t.PortalId == -1);
            if (!string.IsNullOrEmpty(category)) q = q.Where(t => t.Category == category);
            return q.ToList();
        }
        public int SaveTemplate(TemplateInfo t)
        {
            if (t.TemplateId == 0) _db.Templates.Add(t); else _db.Templates.Update(t);
            _db.SaveChanges(); return t.TemplateId;
        }
        public void DeleteTemplate(int portalId, string slug)
        {
            var t = _db.Templates.FirstOrDefault(x => x.PortalId == portalId && x.Slug == slug);
            if (t != null) { _db.Templates.Remove(t); _db.SaveChanges(); }
        }

        // Permissions
        public List<FormPermissionInfo> GetFormPermissions(int formId) =>
            _db.FormPermissions.Where(p => p.FormId == formId).ToList();
        public void SaveFormPermissions(int formId, List<FormPermissionInfo> perms)
        {
            _db.FormPermissions.RemoveRange(_db.FormPermissions.Where(p => p.FormId == formId));
            foreach (var p in perms) { p.FormId = formId; _db.FormPermissions.Add(p); }
            _db.SaveChanges();
        }

        // Workflows
        public List<WorkflowInfo> GetWorkflows(int formId) =>
            _db.Workflows.Where(w => w.FormId == formId).ToList();
        public int SaveWorkflow(WorkflowInfo w)
        {
            if (w.WorkflowId == 0) _db.Workflows.Add(w); else _db.Workflows.Update(w);
            _db.SaveChanges(); return w.WorkflowId;
        }
        public void DeleteWorkflow(int workflowId)
        {
            var w = _db.Workflows.Find(workflowId);
            if (w != null) { _db.Workflows.Remove(w); _db.SaveChanges(); }
        }

        // Workflow runs — lưu vào AuditLog (đơn giản hóa cho Web)
        public long CreateWorkflowRun(int workflowId, int submissionId)
        {
            var log = new AuditLogInfo
            {
                Action     = "WorkflowRun",
                EntityType = "Workflow",
                EntityId   = workflowId,
                Details    = $"sub={submissionId} status=running",
                Timestamp  = DateTime.UtcNow,
            };
            _db.AuditLogs.Add(log); _db.SaveChanges();
            return log.LogId;
        }
        public void CompleteWorkflowRun(long runId, string status, string error)
        {
            var log = _db.AuditLogs.Find(runId);
            if (log != null) { log.Result = status; log.Details += $" err={error}"; _db.SaveChanges(); }
        }
        public void LogWorkflowStep(long runId, string stepId, string stepType, string status, string output, string error)
        {
            _db.AuditLogs.Add(new AuditLogInfo
            {
                Action     = "WorkflowStep",
                EntityType = "WorkflowStep",
                Details    = $"run={runId} step={stepId} type={stepType} out={output} err={error}",
                Result     = status,
                Timestamp  = DateTime.UtcNow,
            });
            _db.SaveChanges();
        }

        // Audit
        public void InsertAuditLog(AuditLogInfo log)
        {
            log.Timestamp = DateTime.UtcNow;
            _db.AuditLogs.Add(log); _db.SaveChanges();
        }

        // UniqueId
        public long IncrementUniqueId(int formId, string fieldKey, long startValue)
        {
            var row = _db.UniqueIdCounters.FirstOrDefault(x => x.FormId == formId && x.FieldKey == fieldKey);
            if (row == null)
            {
                row = new UniqueIdCounterRow { FormId = formId, FieldKey = fieldKey, Counter = startValue };
                _db.UniqueIdCounters.Add(row);
            }
            else row.Counter++;
            _db.SaveChanges();
            return row.Counter;
        }
        public long GetUniqueIdCounter(int formId, string fieldKey)
        {
            var row = _db.UniqueIdCounters.FirstOrDefault(x => x.FormId == formId && x.FieldKey == fieldKey);
            return row?.Counter ?? 0;
        }

        // Webhook log
        public void InsertWebhookLog(WebhookLogInfo log)
        {
            _db.WebhookLogs.Add(log); _db.SaveChanges();
        }

        // Rate limit
        public int GetRecentSubmissionCount(string ip, int windowMinutes)
        {
            var since = DateTime.UtcNow.AddMinutes(-windowMinutes);
            return _db.RateLimits.Count(r => r.IpAddress == ip && r.CreatedUtc >= since);
        }
        public void InsertRateLimitEntry(string ip, int formId)
        {
            _db.RateLimits.Add(new RateLimitRow { IpAddress = ip, FormId = formId, CreatedUtc = DateTime.UtcNow });
            _db.SaveChanges();
        }

        // App foundation
        public List<string> GetAppScopes(int portalId)
        {
            return _db.AppDefinitions
                .Where(a => a.PortalId == portalId || portalId == 0)
                .Select(a => a.AppScope)
                .Where(s => !string.IsNullOrEmpty(s))
                .Distinct()
                .ToList();
        }
        public List<AppDefinitionInfo> ListAppDefinitions(int portalId, string appScope = null)
        {
            var q = _db.AppDefinitions.AsQueryable();
            if (portalId > 0) q = q.Where(a => a.PortalId == portalId);
            if (!string.IsNullOrEmpty(appScope)) q = q.Where(a => a.AppScope == appScope);
            return q.OrderBy(a => a.SortOrder).ThenBy(a => a.AppName).ToList();
        }
        public AppDefinitionInfo GetAppDefinition(int portalId, string appKey)
        {
            return _db.AppDefinitions
                .FirstOrDefault(a => a.PortalId == portalId && a.AppKey == appKey)
                ?? _db.AppDefinitions.FirstOrDefault(a => a.AppKey == appKey);
        }
        public int SaveAppDefinition(AppDefinitionInfo app)
        {
            if (app == null) throw new ArgumentNullException(nameof(app));
            if (app.AppId == 0) { app.CreatedOnUtc = DateTime.UtcNow; _db.AppDefinitions.Add(app); }
            else { app.ModifiedOnUtc = DateTime.UtcNow; _db.AppDefinitions.Update(app); }
            _db.SaveChanges();
            return app.AppId;
        }
        public void DeleteAppDefinition(int appId)
        {
            var a = _db.AppDefinitions.Find(appId);
            if (a != null)
            {
                var queries = _db.AppQueries.Where(q => q.AppId == appId);
                _db.AppQueries.RemoveRange(queries);
                _db.AppDefinitions.Remove(a);
                _db.SaveChanges();
            }
        }

        public List<AppQueryDefinitionInfo> ListAppQueries(int appId)
        {
            return _db.AppQueries.Where(q => q.AppId == appId).OrderBy(q => q.SortOrder).ThenBy(q => q.QueryName).ToList();
        }
        public AppQueryDefinitionInfo GetAppQuery(int appId, string queryKey)
        {
            return _db.AppQueries.FirstOrDefault(q => q.AppId == appId && q.QueryKey == queryKey);
        }
        public int SaveAppQuery(AppQueryDefinitionInfo query)
        {
            if (query == null) throw new ArgumentNullException(nameof(query));
            if (query.QueryId == 0) { query.CreatedOnUtc = DateTime.UtcNow; _db.AppQueries.Add(query); }
            else { query.ModifiedOnUtc = DateTime.UtcNow; _db.AppQueries.Update(query); }
            _db.SaveChanges();
            return query.QueryId;
        }
        public void DeleteAppQuery(int queryId)
        {
            var q = _db.AppQueries.Find(queryId);
            if (q != null) { _db.AppQueries.Remove(q); _db.SaveChanges(); }
        }

        // Relations
        public List<FormRelationInfo> GetFormRelations(int formId)
        {
            return _db.FormRelations.Where(r => r.ParentFormId == formId || r.ChildFormId == formId).ToList();
        }
        public int SaveFormRelation(FormRelationInfo relation)
        {
            if (relation == null) throw new ArgumentNullException(nameof(relation));
            if (relation.RelationId == 0) _db.FormRelations.Add(relation);
            else _db.FormRelations.Update(relation);
            _db.SaveChanges();
            return relation.RelationId;
        }
        public void DeleteFormRelation(int relationId)
        {
            var r = _db.FormRelations.Find(relationId);
            if (r != null)
            {
                _db.SubmissionLinks.RemoveRange(_db.SubmissionLinks.Where(l => l.RelationId == relationId));
                _db.FormRelations.Remove(r);
                _db.SaveChanges();
            }
        }
        public void LinkSubmissions(int relationId, int parentSubmissionId, int childSubmissionId)
        {
            var exists = _db.SubmissionLinks.Any(l =>
                l.RelationId == relationId &&
                l.ParentSubmissionId == parentSubmissionId &&
                l.ChildSubmissionId == childSubmissionId);
            if (!exists)
            {
                _db.SubmissionLinks.Add(new SubmissionLinkInfo
                {
                    RelationId = relationId,
                    ParentSubmissionId = parentSubmissionId,
                    ChildSubmissionId = childSubmissionId,
                    CreatedOnUtc = DateTime.UtcNow
                });
                _db.SaveChanges();
            }
        }
        public (List<SubmissionInfo> Items, int TotalCount) GetChildSubmissions(
            int parentSubmissionId, int? relationId = null, int page = 1, int pageSize = 50)
        {
            var q = _db.SubmissionLinks.Where(l => l.ParentSubmissionId == parentSubmissionId);
            if (relationId.HasValue) q = q.Where(l => l.RelationId == relationId.Value);
            var childIds = q.Select(l => l.ChildSubmissionId).Distinct().ToList();
            var items = _db.Submissions.AsNoTracking()
                .Where(s => childIds.Contains(s.SubmissionId))
                .OrderByDescending(s => s.SubmissionId)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .ToList();
            return (items, childIds.Count);
        }
    }
}
