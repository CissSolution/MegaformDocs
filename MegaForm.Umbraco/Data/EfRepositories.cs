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
                    // [WfApplyClobber v20260711] SetValues copies nulls too — the builder toolbar
                    // never sends WorkflowJson, and the applied BPMN workflow lives only in this
                    // column, so a plain builder Save was wiping it. Null = "not editing the
                    // workflow": keep the stored value.
                    var storedWorkflowJson = existing.WorkflowJson;
                    _db.Entry(existing).CurrentValues.SetValues(form);
                    if (form.WorkflowJson == null) existing.WorkflowJson = storedWorkflowJson;
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

        public List<SubmissionValueInfo> GetValues(int submissionId)
            => _db.SubmissionValues.AsNoTracking().Where(v => v.SubmissionId == submissionId).ToList();
    }
}
