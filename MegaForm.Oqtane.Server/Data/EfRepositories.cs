using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;

namespace MegaForm.Oqtane.Server.Data
{
    public class EfFormRepository : IFormRepository
    {
        private readonly IDbContextFactory<MegaFormDbContext> _dbContextFactory;
        public EfFormRepository(IDbContextFactory<MegaFormDbContext> dbContextFactory) { _dbContextFactory = dbContextFactory; }

        public FormInfo GetForm(int formId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.Forms.FirstOrDefault(f => f.FormId == formId);
        }

        public List<FormInfo> GetFormsByModule(int moduleId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.Forms.Where(f => f.ModuleId == moduleId).OrderByDescending(f => f.CreatedOnUtc).ToList();
        }

        public List<FormInfo> ListForms(int portalId, string status = null, string search = null, int pageIndex = 0, int pageSize = 20)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var q = db.Forms.Where(f => f.PortalId == portalId);
            if (!string.IsNullOrEmpty(status)) q = q.Where(f => f.Status == status);
            if (!string.IsNullOrEmpty(search)) q = q.Where(f => f.Title.Contains(search));
            q = q.OrderByDescending(f => f.UpdatedOnUtc ?? f.CreatedOnUtc).ThenByDescending(f => f.FormId);
            if (pageSize <= 0) return q.ToList();
            return q.Skip(pageIndex * pageSize).Take(pageSize).ToList();
        }

        public int SaveForm(FormInfo form)
        {
            using var db = _dbContextFactory.CreateDbContext();
            // [OQ-difix20260418-08] Coerce null string properties to "" so the 20
            // NOT NULL columns on MF_Forms (Title, SchemaJson, ThemeJson, WebhookSecret,
            // ...) don't trigger SQLite Error 19 when the Builder UI saves a fresh form
            // with most fields unset.
            NullStringNormalizer.Normalize(form);
            if (form.FormId == 0)
            {
                form.CreatedOnUtc = DateTime.UtcNow;
                db.Forms.Add(form);
            }
            else
            {
                form.UpdatedOnUtc = DateTime.UtcNow;
                db.Forms.Update(form);
            }
            db.SaveChanges();
            return form.FormId;
        }

        public void DeleteForm(int formId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var form = db.Forms.Find(formId);
            if (form != null)
            {
                db.Forms.Remove(form);
                db.SaveChanges();
            }
        }

        public FormStatsInfo GetFormStats(int formId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var subs = db.Submissions.Where(s => s.FormId == formId);
            return new FormStatsInfo
            {
                TotalSubmissions = subs.Count(),
                ValidSubmissions = subs.Count(s => !s.IsSpam),
                SpamSubmissions = subs.Count(s => s.IsSpam),
                ReadSubmissions = subs.Count(s => s.ReadOnUtc != null),
                FirstSubmission = subs.OrderBy(s => s.SubmittedOnUtc).Select(s => (DateTime?)s.SubmittedOnUtc).FirstOrDefault(),
                LastSubmission = subs.OrderByDescending(s => s.SubmittedOnUtc).Select(s => (DateTime?)s.SubmittedOnUtc).FirstOrDefault()
            };
        }

        public int DuplicateForm(int formId, int userId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var src = db.Forms.AsNoTracking().FirstOrDefault(f => f.FormId == formId);
            if (src == null) return 0;
            src.FormId = 0;
            src.Title += " (Copy)";
            src.Status = "Draft";
            src.CreatedByUserId = userId;
            src.CreatedOnUtc = DateTime.UtcNow;
            // [OQ-difix20260418-08] Same defensive normalization as SaveForm.
            NullStringNormalizer.Normalize(src);
            db.Forms.Add(src);
            db.SaveChanges();
            return src.FormId;
        }
    }

    public class EfSubmissionRepository : ISubmissionRepository
    {
        private readonly IDbContextFactory<MegaFormDbContext> _dbContextFactory;
        public EfSubmissionRepository(IDbContextFactory<MegaFormDbContext> dbContextFactory) { _dbContextFactory = dbContextFactory; }

        public int Insert(SubmissionInfo sub)
        {
            using var db = _dbContextFactory.CreateDbContext();
            sub.SubmittedOnUtc = DateTime.UtcNow;
            // [OQ-difix20260418-08] MF_Submissions has NOT NULL constraints on
            // DataJson, IpAddress, UserAgent, Status. Anonymous submits frequently
            // arrive with UserAgent or IpAddress null behind a proxy.
            NullStringNormalizer.Normalize(sub);
            db.Submissions.Add(sub);
            db.SaveChanges();
            return sub.SubmissionId;
        }

        public SubmissionInfo Get(int submissionId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.Submissions.FirstOrDefault(s => s.SubmissionId == submissionId);
        }

        public List<SubmissionValueInfo> GetValues(int submissionId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.SubmissionValues.Where(v => v.SubmissionId == submissionId).OrderBy(v => v.ValueId).ToList();
        }

        public (List<SubmissionInfo> Items, int TotalCount) List(int formId, string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null, int pageIndex = 0, int pageSize = 50)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var q = db.Submissions.Where(s => s.FormId == formId);
            if (!string.IsNullOrEmpty(status)) q = q.Where(s => s.Status == status);
            if (dateFrom.HasValue) q = q.Where(s => s.SubmittedOnUtc >= dateFrom.Value);
            if (dateTo.HasValue) q = q.Where(s => s.SubmittedOnUtc <= dateTo.Value);
            if (!string.IsNullOrEmpty(search)) q = q.Where(s => s.DataJson.Contains(search));
            int total = q.Count();
            var items = q.OrderByDescending(s => s.SubmittedOnUtc).Skip(pageIndex * pageSize).Take(pageSize).ToList();
            return (items, total);
        }

        public void UpdateStatus(int submissionId, string status)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var sub = db.Submissions.Find(submissionId);
            if (sub != null)
            {
                sub.Status = status;
                db.SaveChanges();
            }
        }

        public void UpdateData(int submissionId, string dataJson)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var sub = db.Submissions.Find(submissionId);
            if (sub != null)
            {
                sub.DataJson = dataJson;
                db.SaveChanges();
            }
        }

        public void Delete(int submissionId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var sub = db.Submissions.Find(submissionId);
            if (sub != null)
            {
                db.Submissions.Remove(sub);
                db.SaveChanges();
            }
        }

        public void BulkDelete(int formId, int[] submissionIds)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var subs = db.Submissions.Where(s => s.FormId == formId && submissionIds.Contains(s.SubmissionId));
            db.Submissions.RemoveRange(subs);
            db.SaveChanges();
        }

        public void InsertValues(int submissionId, List<SubmissionValueInfo> values)
        {
            using var db = _dbContextFactory.CreateDbContext();
            foreach (var v in values)
            {
                v.SubmissionId = submissionId;
                // [OQ-difix20260418-08] FieldKey + FieldValue are NOT NULL.
                NullStringNormalizer.Normalize(v);
                db.SubmissionValues.Add(v);
            }
            db.SaveChanges();
        }
    }

    public class EfDraftRepository : IDraftRepository
    {
        private readonly IDbContextFactory<MegaFormDbContext> _dbContextFactory;
        public EfDraftRepository(IDbContextFactory<MegaFormDbContext> dbContextFactory) { _dbContextFactory = dbContextFactory; }

        public int SaveDraft(SavedDraftInfo draft)
        {
            using var db = _dbContextFactory.CreateDbContext();
            // [OQ-difix20260418-08] MF_SavedDrafts has NOT NULL on ResumeToken,
            // DataJson, Email, IpAddress.
            NullStringNormalizer.Normalize(draft);
            if (draft.DraftId == 0) db.Drafts.Add(draft);
            else db.Drafts.Update(draft);
            db.SaveChanges();
            return draft.DraftId;
        }

        public SavedDraftInfo GetDraft(string resumeToken)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.Drafts.FirstOrDefault(d => d.ResumeToken == resumeToken);
        }

        public void DeleteDraft(string resumeToken)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var d = db.Drafts.FirstOrDefault(x => x.ResumeToken == resumeToken);
            if (d != null)
            {
                db.Drafts.Remove(d);
                db.SaveChanges();
            }
        }

        public void CleanExpiredDrafts()
        {
            using var db = _dbContextFactory.CreateDbContext();
            var expired = db.Drafts.Where(d => d.ExpiresOnUtc < DateTime.UtcNow);
            db.Drafts.RemoveRange(expired);
            db.SaveChanges();
        }
    }

    /// <summary>
    /// [SDK Files A v20260616] EF-backed MF_Files repository. Enables the MegaForm SDK
    /// Files API (IMegaFormClient.Files.GetBySubmission / OpenAsync) on Oqtane. Rows are
    /// created post-submit by the controller from the File/PdfForm field metadata — see
    /// MegaFormController.PersistSubmissionFilesFailSoft + SubmissionFileMetaExtractor.
    /// MF_Files is mapped in MegaFormDbContext (DbSet&lt;Core.Models.FileInfo&gt; Files).
    /// </summary>
    public class EfFileRepository : IFileRepository
    {
        private readonly IDbContextFactory<MegaFormDbContext> _dbContextFactory;
        public EfFileRepository(IDbContextFactory<MegaFormDbContext> dbContextFactory) { _dbContextFactory = dbContextFactory; }

        public int InsertFile(Core.Models.FileInfo file)
        {
            using var db = _dbContextFactory.CreateDbContext();
            if (file.UploadedOnUtc == default) file.UploadedOnUtc = DateTime.UtcNow;
            // MF_Files NOT NULL guards (mirror NullStringNormalizer usage in the other repos).
            file.FieldKey ??= string.Empty;
            file.OriginalName ??= string.Empty;
            file.StoredPath ??= string.Empty;
            file.ContentType ??= string.Empty;
            db.Files.Add(file);
            db.SaveChanges();
            return file.FileId;
        }

        public List<Core.Models.FileInfo> GetBySubmission(int submissionId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.Files.Where(f => f.SubmissionId == submissionId).OrderBy(f => f.FileId).ToList();
        }

        public void DeleteBySubmission(int submissionId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var rows = db.Files.Where(f => f.SubmissionId == submissionId);
            db.Files.RemoveRange(rows);
            db.SaveChanges();
        }
    }
}
