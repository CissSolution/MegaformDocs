using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;

namespace MegaForm.Umbraco.Data
{
    public class UmbracoFormRepository : IFormRepository
    {
        private readonly MegaFormDbContext _db;
        public UmbracoFormRepository(MegaFormDbContext db) { _db = db; }

        public FormInfo GetForm(int formId)
            => _db.Forms.AsNoTracking().FirstOrDefault(f => f.FormId == formId);

        public List<FormInfo> GetFormsByModule(int moduleId)
            => _db.Forms.AsNoTracking().Where(f => f.ModuleId == moduleId).OrderBy(f => f.FormId).ToList();

        public List<FormInfo> ListForms(int portalId, string status = null, string search = null,
            int pageIndex = 0, int pageSize = 20)
        {
            var q = _db.Forms.AsNoTracking().Where(f => f.PortalId == portalId);
            if (!string.IsNullOrEmpty(status)) q = q.Where(f => f.Status == status);
            if (!string.IsNullOrEmpty(search)) q = q.Where(f => f.Title.Contains(search));
            return q.OrderByDescending(f => f.CreatedOnUtc).Skip(pageIndex * pageSize).Take(pageSize).ToList();
        }

        public int SaveForm(FormInfo form)
        {
            if (form.FormId > 0)
            {
                var existing = _db.Forms.Find(form.FormId);
                if (existing != null)
                {
                    _db.Entry(existing).CurrentValues.SetValues(form);
                    existing.UpdatedOnUtc = DateTime.UtcNow;
                }
            }
            else
            {
                form.CreatedOnUtc = DateTime.UtcNow;
                _db.Forms.Add(form);
            }
            _db.SaveChanges();
            return form.FormId;
        }

        public void DeleteForm(int formId)
        {
            var form = _db.Forms.Find(formId);
            if (form != null) { _db.Forms.Remove(form); _db.SaveChanges(); }
        }

        public FormStatsInfo GetFormStats(int formId)
        {
            var count = _db.Submissions.Count(s => s.FormId == formId);
            return new FormStatsInfo { TotalSubmissions = count };
        }

        public int DuplicateForm(int formId, int userId)
        {
            var src = _db.Forms.AsNoTracking().FirstOrDefault(f => f.FormId == formId);
            if (src == null) return 0;
            src.FormId = 0;
            src.Title = src.Title + " (Copy)";
            src.Status = "Draft";
            src.CreatedByUserId = userId;
            src.CreatedOnUtc = DateTime.UtcNow;
            _db.Forms.Add(src);
            _db.SaveChanges();
            return src.FormId;
        }
    }

    public class UmbracoSubmissionRepository : ISubmissionRepository
    {
        private readonly MegaFormDbContext _db;
        public UmbracoSubmissionRepository(MegaFormDbContext db) { _db = db; }

        public int Insert(SubmissionInfo sub)
        {
            _db.Submissions.Add(sub);
            _db.SaveChanges();
            return sub.SubmissionId;
        }

        public SubmissionInfo Get(int submissionId)
            => _db.Submissions.AsNoTracking().FirstOrDefault(s => s.SubmissionId == submissionId);

        public (List<SubmissionInfo> Items, int TotalCount) List(int formId,
            string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null,
            int pageIndex = 0, int pageSize = 50)
        {
            var q = _db.Submissions.AsNoTracking().Where(s => s.FormId == formId);
            if (!string.IsNullOrEmpty(status)) q = q.Where(s => s.Status == status);
            if (dateFrom.HasValue) q = q.Where(s => s.SubmittedOnUtc >= dateFrom.Value);
            if (dateTo.HasValue) q = q.Where(s => s.SubmittedOnUtc <= dateTo.Value);
            if (!string.IsNullOrEmpty(search)) q = q.Where(s => s.DataJson.Contains(search));

            int total = q.Count();
            var items = q.OrderByDescending(s => s.SubmittedOnUtc)
                .Skip(pageIndex * pageSize).Take(pageSize).ToList();
            return (items, total);
        }

        public void UpdateStatus(int submissionId, string status)
        {
            var sub = _db.Submissions.Find(submissionId);
            if (sub != null) { sub.Status = status; _db.SaveChanges(); }
        }

        public void UpdateData(int submissionId, string dataJson)
        {
            var sub = _db.Submissions.Find(submissionId);
            if (sub != null)
            {
                sub.DataJson = dataJson;
                sub.ModifiedOnUtc = DateTime.UtcNow;
                _db.SaveChanges();
            }
        }

        public void Delete(int submissionId)
        {
            var sub = _db.Submissions.Find(submissionId);
            if (sub != null) { _db.Submissions.Remove(sub); _db.SaveChanges(); }
        }

        public void BulkDelete(int formId, int[] submissionIds)
        {
            var subs = _db.Submissions.Where(s => s.FormId == formId && submissionIds.Contains(s.SubmissionId));
            _db.Submissions.RemoveRange(subs);
            _db.SaveChanges();
        }

        public void InsertValues(int submissionId, List<SubmissionValueInfo> values)
        {
            foreach (var v in values) v.SubmissionId = submissionId;
            _db.SubmissionValues.AddRange(values);
            _db.SaveChanges();
        }
    }

    // Stub repositories — implement as needed
    public class UmbracoDraftRepository : IDraftRepository
    {
        public int SaveDraft(SavedDraftInfo draft) => 0;
        public SavedDraftInfo GetDraft(string resumeToken) => null;
        public void DeleteDraft(string resumeToken) { }
        public void CleanExpiredDrafts() { }
    }

    public class UmbracoFileRepository : IFileRepository
    {
        public int InsertFile(MegaForm.Core.Models.FileInfo file) => 0;
        public List<MegaForm.Core.Models.FileInfo> GetBySubmission(int submissionId) => new();
        public void DeleteBySubmission(int submissionId) { }
    }

    public class UmbracoPhase2Repository : IPhase2Repository
    {
        private readonly MegaFormDbContext _db;
        public UmbracoPhase2Repository(MegaFormDbContext db) { _db = db; }

        public List<FormViewInfo> GetFormViews(int formId)
            => _db.FormViews.Where(v => v.FormId == formId).OrderBy(v => v.SortOrder).ToList();

        public int SaveFormView(FormViewInfo view)
        {
            if (view.ViewId > 0) _db.FormViews.Update(view);
            else _db.FormViews.Add(view);
            _db.SaveChanges();
            return view.ViewId;
        }

        public void DeleteFormView(int viewId)
        {
            var v = _db.FormViews.Find(viewId);
            if (v != null) { _db.FormViews.Remove(v); _db.SaveChanges(); }
        }

        // Stubs for remaining Phase2 methods
        public List<TemplateInfo> ListTemplates(int portalId, string category = null) => new();
        public int SaveTemplate(TemplateInfo template) => 0;
        public void DeleteTemplate(int portalId, string slug) { }
        public List<FormPermissionInfo> GetFormPermissions(int formId) => new();
        public void SaveFormPermissions(int formId, List<FormPermissionInfo> perms) { }
        public List<WorkflowInfo> GetWorkflows(int formId) => new();
        public int SaveWorkflow(WorkflowInfo wf) => 0;
        public void DeleteWorkflow(int workflowId) { }
        public long CreateWorkflowRun(int workflowId, int submissionId) => 0;
        public void CompleteWorkflowRun(long runId, string status, string error) { }
        public void LogWorkflowStep(long runId, string stepId, string stepType, string status, string output, string error) { }
        public void InsertAuditLog(AuditLogInfo log) { }
        public long IncrementUniqueId(int formId, string fieldKey, long startValue) => startValue;
        public long GetUniqueIdCounter(int formId, string fieldKey) => 0;
        public void InsertWebhookLog(WebhookLogInfo log) { }
        public int GetRecentSubmissionCount(string ipAddress, int windowMinutes) => 0;
        public void InsertRateLimitEntry(string ipAddress, int formId) { }
    }
}
