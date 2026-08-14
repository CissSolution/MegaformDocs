using System;
using System.Collections.Generic;
using System.Globalization;
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

    public class UmbracoSubmissionRepository : ISubmissionRepository, ISubmissionOwnerFilterableRepository, ISubmissionTypedQueryRepository
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
            => ListCore(formId, null, status, search, dateFrom, dateTo, pageIndex, pageSize);

        public (List<SubmissionInfo> Items, int TotalCount) ListOwnedBy(int formId, int userId,
            string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null,
            int pageIndex = 0, int pageSize = 50)
            => ListCore(formId, userId, status, search, dateFrom, dateTo, pageIndex, pageSize);

        public (List<SubmissionInfo> Items, int TotalCount) ListTyped(SubmissionListQuery query)
        {
            if (query == null) throw new ArgumentNullException(nameof(query));

            var q = _db.Submissions.AsNoTracking().AsQueryable();
            if (query.FormId > 0) q = q.Where(s => s.FormId == query.FormId);
            if (query.UserId.HasValue && query.UserId.Value > 0) q = q.Where(s => s.UserId == query.UserId.Value);
            if (!string.IsNullOrWhiteSpace(query.Status)) q = q.Where(s => s.Status == query.Status);
            if (query.DateFrom.HasValue) q = q.Where(s => s.SubmittedOnUtc >= query.DateFrom.Value);
            if (query.DateTo.HasValue)
            {
                var endExclusive = query.DateTo.Value.Date.AddDays(1);
                q = q.Where(s => s.SubmittedOnUtc < endExclusive);
            }

            q = ApplyTypedSearch(q, query.Search);
            foreach (var filter in query.FieldFilters ?? new List<SubmissionFieldFilter>())
                q = ApplyTypedFilter(q, filter);

            var pageIndex = Math.Max(0, query.PageIndex);
            var pageSize = query.PageSize > 0 ? Math.Min(query.PageSize, 5000) : 50;
            var total = q.Count();
            var items = q.OrderByDescending(s => s.SubmittedOnUtc).ThenByDescending(s => s.SubmissionId)
                .Skip(pageIndex * pageSize).Take(pageSize).ToList();
            return (items, total);
        }

        private IQueryable<SubmissionInfo> ApplyTypedSearch(IQueryable<SubmissionInfo> query, string search)
        {
            if (string.IsNullOrWhiteSpace(search)) return query;

            var term = search.Trim();
            var pattern = "%" + EscapeLike(term) + "%";
            var hasId = int.TryParse(term, NumberStyles.Integer, CultureInfo.InvariantCulture, out var submissionId) && submissionId > 0;
            var hasNumber = decimal.TryParse(term, NumberStyles.Number, CultureInfo.InvariantCulture, out var number);
            var hasDate = DateTime.TryParse(term, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var date);
            var hasBoolean = bool.TryParse(term, out var boolean);

            return query.Where(s =>
                (hasId && s.SubmissionId == submissionId)
                || EF.Functions.Like(s.IpAddress ?? string.Empty, pattern, "~")
                || EF.Functions.Like(s.Status ?? string.Empty, pattern, "~")
                || _db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && !f.IsSensitive
                    && (EF.Functions.Like(f.FieldKey ?? string.Empty, pattern, "~")
                        || EF.Functions.Like(f.DisplayValue ?? string.Empty, pattern, "~")))
                || _db.SubmissionValueString.Any(v => v.SubmissionId == s.SubmissionId
                    && EF.Functions.Like(v.Value ?? string.Empty, pattern, "~")
                    && _db.SubmissionFields.Any(f => f.SubmissionFieldId == v.SubmissionFieldId && !f.IsSensitive))
                || _db.SubmissionValueLongText.Any(v => v.SubmissionId == s.SubmissionId
                    && EF.Functions.Like(v.Value ?? string.Empty, pattern, "~")
                    && _db.SubmissionFields.Any(f => f.SubmissionFieldId == v.SubmissionFieldId && !f.IsSensitive))
                || (hasNumber && _db.SubmissionValueNumber.Any(v => v.SubmissionId == s.SubmissionId && v.Value == number
                    && _db.SubmissionFields.Any(f => f.SubmissionFieldId == v.SubmissionFieldId && !f.IsSensitive)))
                || (hasDate && _db.SubmissionValueDate.Any(v => v.SubmissionId == s.SubmissionId && v.Value == date
                    && _db.SubmissionFields.Any(f => f.SubmissionFieldId == v.SubmissionFieldId && !f.IsSensitive)))
                || (hasBoolean && _db.SubmissionValueBoolean.Any(v => v.SubmissionId == s.SubmissionId && v.Value == boolean
                    && _db.SubmissionFields.Any(f => f.SubmissionFieldId == v.SubmissionFieldId && !f.IsSensitive))));
        }

        private IQueryable<SubmissionInfo> ApplyTypedFilter(IQueryable<SubmissionInfo> query, SubmissionFieldFilter filter)
        {
            var key = filter.FieldKey.Trim();
            if (filter.Operator == SubmissionFieldFilterOperator.IsEmpty)
                return query.Where(s => _db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && f.FieldKey == key && !f.HasValue));
            if (filter.Operator == SubmissionFieldFilterOperator.IsNotEmpty)
                return query.Where(s => _db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && f.FieldKey == key && f.HasValue));

            var dataType = ResolveFilterDataType(filter);
            if (dataType == SubmissionDataType.String)
                return ApplyStringFilter(query, filter, key, false);
            if (dataType == SubmissionDataType.LongText)
                return ApplyStringFilter(query, filter, key, true);
            if (dataType == SubmissionDataType.Number)
                return ApplyNumberFilter(query, filter, key);
            if (dataType == SubmissionDataType.Date)
                return ApplyDateFilter(query, filter, key);
            if (dataType == SubmissionDataType.Boolean)
            {
                var value = filter.BooleanValue.Value;
                if (filter.Operator == SubmissionFieldFilterOperator.NotEquals)
                    return query.Where(s => _db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && f.FieldKey == key)
                        && !_db.SubmissionValueBoolean.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));
                return query.Where(s => _db.SubmissionValueBoolean.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));
            }
            throw new NotSupportedException("JSON values cannot be compared as strings. Use a normalized typed field.");
        }

        private IQueryable<SubmissionInfo> ApplyStringFilter(IQueryable<SubmissionInfo> query, SubmissionFieldFilter filter, string key, bool longText)
        {
            var value = filter.TextValue ?? string.Empty;
            if (filter.Operator == SubmissionFieldFilterOperator.NotEquals)
            {
                return longText
                    ? query.Where(s => _db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && f.FieldKey == key)
                        && !_db.SubmissionValueLongText.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value))
                    : query.Where(s => _db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && f.FieldKey == key)
                        && !_db.SubmissionValueString.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));
            }
            if (filter.Operator == SubmissionFieldFilterOperator.Equals)
                return longText
                    ? query.Where(s => _db.SubmissionValueLongText.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value))
                    : query.Where(s => _db.SubmissionValueString.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));

            var pattern = BuildLikePattern(value, filter.Operator);
            return longText
                ? query.Where(s => _db.SubmissionValueLongText.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && EF.Functions.Like(v.Value ?? string.Empty, pattern, "~")))
                : query.Where(s => _db.SubmissionValueString.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && EF.Functions.Like(v.Value ?? string.Empty, pattern, "~")));
        }

        private IQueryable<SubmissionInfo> ApplyNumberFilter(IQueryable<SubmissionInfo> query, SubmissionFieldFilter filter, string key)
        {
            var value = filter.NumberValue.Value;
            if (filter.Operator == SubmissionFieldFilterOperator.NotEquals)
                return query.Where(s => _db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && f.FieldKey == key)
                    && !_db.SubmissionValueNumber.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));
            if (filter.Operator == SubmissionFieldFilterOperator.GreaterThan)
                return query.Where(s => _db.SubmissionValueNumber.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value > value));
            if (filter.Operator == SubmissionFieldFilterOperator.GreaterThanOrEqual)
                return query.Where(s => _db.SubmissionValueNumber.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value >= value));
            if (filter.Operator == SubmissionFieldFilterOperator.LessThan)
                return query.Where(s => _db.SubmissionValueNumber.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value < value));
            if (filter.Operator == SubmissionFieldFilterOperator.LessThanOrEqual)
                return query.Where(s => _db.SubmissionValueNumber.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value <= value));
            return query.Where(s => _db.SubmissionValueNumber.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));
        }

        private IQueryable<SubmissionInfo> ApplyDateFilter(IQueryable<SubmissionInfo> query, SubmissionFieldFilter filter, string key)
        {
            var value = filter.DateValue.Value;
            if (filter.Operator == SubmissionFieldFilterOperator.NotEquals)
                return query.Where(s => _db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && f.FieldKey == key)
                    && !_db.SubmissionValueDate.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));
            if (filter.Operator == SubmissionFieldFilterOperator.GreaterThan)
                return query.Where(s => _db.SubmissionValueDate.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value > value));
            if (filter.Operator == SubmissionFieldFilterOperator.GreaterThanOrEqual)
                return query.Where(s => _db.SubmissionValueDate.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value >= value));
            if (filter.Operator == SubmissionFieldFilterOperator.LessThan)
                return query.Where(s => _db.SubmissionValueDate.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value < value));
            if (filter.Operator == SubmissionFieldFilterOperator.LessThanOrEqual)
                return query.Where(s => _db.SubmissionValueDate.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value <= value));
            return query.Where(s => _db.SubmissionValueDate.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));
        }

        private static SubmissionDataType ResolveFilterDataType(SubmissionFieldFilter filter)
        {
            if (filter.DataType.HasValue) return filter.DataType.Value;
            if (filter.NumberValue.HasValue) return SubmissionDataType.Number;
            if (filter.DateValue.HasValue) return SubmissionDataType.Date;
            if (filter.BooleanValue.HasValue) return SubmissionDataType.Boolean;
            return SubmissionDataType.String;
        }

        private static string BuildLikePattern(string value, SubmissionFieldFilterOperator op)
        {
            var escaped = EscapeLike(value);
            if (op == SubmissionFieldFilterOperator.Contains) return "%" + escaped + "%";
            if (op == SubmissionFieldFilterOperator.StartsWith) return escaped + "%";
            if (op == SubmissionFieldFilterOperator.EndsWith) return "%" + escaped;
            throw new NotSupportedException("The selected operator is not valid for text fields.");
        }

        private static string EscapeLike(string value)
            => (value ?? string.Empty).Replace("~", "~~").Replace("%", "~%").Replace("_", "~_").Replace("[", "~[");

        private (List<SubmissionInfo> Items, int TotalCount) ListCore(int formId, int? userId,
            string status, string search, DateTime? dateFrom, DateTime? dateTo,
            int pageIndex, int pageSize)
        {
            var q = _db.Submissions.AsNoTracking().Where(s => s.FormId == formId);
            if (userId.HasValue) q = q.Where(s => s.UserId == userId.Value);
            if (!string.IsNullOrEmpty(status)) q = q.Where(s => s.Status == status);
            if (dateFrom.HasValue) q = q.Where(s => s.SubmittedOnUtc >= dateFrom.Value);
            if (dateTo.HasValue) q = q.Where(s => s.SubmittedOnUtc <= dateTo.Value);
            q = ApplyTypedSearch(q, search);

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
