using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;

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
}
