using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services.TypedSubmission;
using Newtonsoft.Json;

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

    public class EfSubmissionRepository : ISubmissionRepository, ISubmissionOwnerFilterableRepository, ISubmissionTypedQueryRepository
    {
        private readonly IDbContextFactory<MegaFormDbContext> _dbContextFactory;
        // [TypedStorage 2026-07-17] When typed storage is primary, MF_Submissions.DataJson is
        // collapsed to "{}" on submit. This store reconstructs the data dictionary from the typed
        // rows so every legacy reader that consumes submission.DataJson keeps working unchanged.
        // Optional (null) → repository behaves exactly as before (DataJson is the source of truth).
        private readonly MegaForm.Core.Interfaces.ISubmissionDataStore _typedStore;
        // [TypedStorage 2026-07-18] Needed to re-derive typed rows when a caller writes a real DataJson
        // (workflow mutation / admin edit) on a typed-primary host — keeps typed rows + search in sync.
        private readonly IFormRepository _formRepo;
        private readonly SubmissionFieldNormalizer _fieldNormalizer = new SubmissionFieldNormalizer();

        public EfSubmissionRepository(
            IDbContextFactory<MegaFormDbContext> dbContextFactory,
            MegaForm.Core.Interfaces.ISubmissionDataStore typedStore = null,
            IFormRepository formRepo = null)
        {
            _dbContextFactory = dbContextFactory;
            _typedStore = typedStore;
            _formRepo = formRepo;
        }

        // Rehydrate DataJson from typed rows when the stored payload was collapsed ("{}"/empty).
        private void HydrateDataJson(SubmissionInfo sub)
        {
            if (sub == null || _typedStore == null) return;
            var dj = sub.DataJson;
            var isCollapsed = string.IsNullOrWhiteSpace(dj) || dj.Trim() == "{}";
            if (!isCollapsed) return;
            try
            {
                var doc = _typedStore.GetData(sub.SubmissionId);
                if (doc?.Data != null && doc.Data.Count > 0)
                    sub.DataJson = Newtonsoft.Json.JsonConvert.SerializeObject(doc.Data);
            }
            catch { /* fail-soft: leave the collapsed payload rather than break the read */ }
        }

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
            var sub = db.Submissions.FirstOrDefault(s => s.SubmissionId == submissionId);
            HydrateDataJson(sub);
            return sub;
        }

        public List<SubmissionValueInfo> GetValues(int submissionId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.SubmissionValues.Where(v => v.SubmissionId == submissionId).OrderBy(v => v.ValueId).ToList();
        }

        public (List<SubmissionInfo> Items, int TotalCount) List(int formId, string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null, int pageIndex = 0, int pageSize = 50)
        {
            return ListCore(formId, null, status, search, dateFrom, dateTo, pageIndex, pageSize);
        }

        // [OwnerRlsSql v20260722-01] ISubmissionOwnerFilterableRepository: same list with the
        // "owned by userId" predicate pushed into SQL (both the page select and the capped count),
        // so owner-scoped lists (RLS scope "own", My-Submissions) get exact TotalCount/paging.
        public (List<SubmissionInfo> Items, int TotalCount) ListOwnedBy(int formId, int userId,
            string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null, int pageIndex = 0, int pageSize = 50)
        {
            return ListCore(formId, userId, status, search, dateFrom, dateTo, pageIndex, pageSize);
        }

        public (List<SubmissionInfo> Items, int TotalCount) ListTyped(SubmissionListQuery query)
        {
            if (query == null) throw new ArgumentNullException(nameof(query));
            using var db = _dbContextFactory.CreateDbContext();

            var q = db.Submissions.AsQueryable();
            if (query.FormId > 0) q = q.Where(s => s.FormId == query.FormId);
            if (query.UserId.HasValue && query.UserId.Value > 0) q = q.Where(s => s.UserId == query.UserId.Value);
            if (!string.IsNullOrWhiteSpace(query.Status)) q = q.Where(s => s.Status == query.Status);
            if (query.DateFrom.HasValue) q = q.Where(s => s.SubmittedOnUtc >= query.DateFrom.Value);
            if (query.DateTo.HasValue)
            {
                var endExclusive = query.DateTo.Value.Date.AddDays(1);
                q = q.Where(s => s.SubmittedOnUtc < endExclusive);
            }

            q = ApplyTypedSearch(db, q, query.Search);
            foreach (var filter in query.FieldFilters ?? new List<SubmissionFieldFilter>())
                q = ApplyTypedFilter(db, q, filter);

            const int countCap = 10001;
            var total = q.Take(countCap).Count();
            if (total >= countCap)
            {
                total = countCap - 1;
                var scope = MegaForm.Core.Services.ExternalTable.ExternalSourceContext.Current;
                if (scope != null) scope.TotalIsBounded = true;
            }

            var pageIndex = Math.Max(0, query.PageIndex);
            var pageSize = query.PageSize > 0 ? Math.Min(query.PageSize, 5000) : 50;
            var items = q.OrderByDescending(s => s.SubmittedOnUtc).ThenByDescending(s => s.SubmissionId)
                .Skip(pageIndex * pageSize).Take(pageSize).ToList();
            return (items, total);
        }

        private static IQueryable<SubmissionInfo> ApplyTypedSearch(MegaFormDbContext db, IQueryable<SubmissionInfo> query, string search)
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
                || db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && !f.IsSensitive
                    && (EF.Functions.Like(f.FieldKey ?? string.Empty, pattern, "~")
                        || EF.Functions.Like(f.DisplayValue ?? string.Empty, pattern, "~")))
                || db.SubmissionValueString.Any(v => v.SubmissionId == s.SubmissionId
                    && EF.Functions.Like(v.Value ?? string.Empty, pattern, "~")
                    && db.SubmissionFields.Any(f => f.SubmissionFieldId == v.SubmissionFieldId && !f.IsSensitive))
                || db.SubmissionValueLongText.Any(v => v.SubmissionId == s.SubmissionId
                    && EF.Functions.Like(v.Value ?? string.Empty, pattern, "~")
                    && db.SubmissionFields.Any(f => f.SubmissionFieldId == v.SubmissionFieldId && !f.IsSensitive))
                || (hasNumber && db.SubmissionValueNumber.Any(v => v.SubmissionId == s.SubmissionId && v.Value == number
                    && db.SubmissionFields.Any(f => f.SubmissionFieldId == v.SubmissionFieldId && !f.IsSensitive)))
                || (hasDate && db.SubmissionValueDate.Any(v => v.SubmissionId == s.SubmissionId && v.Value == date
                    && db.SubmissionFields.Any(f => f.SubmissionFieldId == v.SubmissionFieldId && !f.IsSensitive)))
                || (hasBoolean && db.SubmissionValueBoolean.Any(v => v.SubmissionId == s.SubmissionId && v.Value == boolean
                    && db.SubmissionFields.Any(f => f.SubmissionFieldId == v.SubmissionFieldId && !f.IsSensitive))));
        }

        private static IQueryable<SubmissionInfo> ApplyTypedFilter(MegaFormDbContext db, IQueryable<SubmissionInfo> query, SubmissionFieldFilter filter)
        {
            var key = filter.FieldKey.Trim();
            if (filter.Operator == SubmissionFieldFilterOperator.IsEmpty)
                return query.Where(s => db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && f.FieldKey == key && !f.HasValue));
            if (filter.Operator == SubmissionFieldFilterOperator.IsNotEmpty)
                return query.Where(s => db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && f.FieldKey == key && f.HasValue));

            var dataType = ResolveFilterDataType(filter);
            if (dataType == SubmissionDataType.String)
                return ApplyStringFilter(db, query, filter, key, false);
            if (dataType == SubmissionDataType.LongText)
                return ApplyStringFilter(db, query, filter, key, true);
            if (dataType == SubmissionDataType.Number)
                return ApplyNumberFilter(db, query, filter, key);
            if (dataType == SubmissionDataType.Date)
                return ApplyDateFilter(db, query, filter, key);
            if (dataType == SubmissionDataType.Boolean)
            {
                var value = filter.BooleanValue.Value;
                if (filter.Operator == SubmissionFieldFilterOperator.NotEquals)
                    return query.Where(s => db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && f.FieldKey == key)
                        && !db.SubmissionValueBoolean.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));
                return query.Where(s => db.SubmissionValueBoolean.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));
            }
            throw new NotSupportedException("JSON values cannot be compared as strings. Use a normalized typed field.");
        }

        private static IQueryable<SubmissionInfo> ApplyStringFilter(MegaFormDbContext db, IQueryable<SubmissionInfo> query, SubmissionFieldFilter filter, string key, bool longText)
        {
            var value = filter.TextValue ?? string.Empty;
            if (filter.Operator == SubmissionFieldFilterOperator.NotEquals)
            {
                return longText
                    ? query.Where(s => db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && f.FieldKey == key)
                        && !db.SubmissionValueLongText.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value))
                    : query.Where(s => db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && f.FieldKey == key)
                        && !db.SubmissionValueString.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));
            }
            if (filter.Operator == SubmissionFieldFilterOperator.Equals)
                return longText
                    ? query.Where(s => db.SubmissionValueLongText.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value))
                    : query.Where(s => db.SubmissionValueString.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));

            var pattern = BuildLikePattern(value, filter.Operator);
            return longText
                ? query.Where(s => db.SubmissionValueLongText.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && EF.Functions.Like(v.Value ?? string.Empty, pattern, "~")))
                : query.Where(s => db.SubmissionValueString.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && EF.Functions.Like(v.Value ?? string.Empty, pattern, "~")));
        }

        private static IQueryable<SubmissionInfo> ApplyNumberFilter(MegaFormDbContext db, IQueryable<SubmissionInfo> query, SubmissionFieldFilter filter, string key)
        {
            var value = filter.NumberValue.Value;
            if (filter.Operator == SubmissionFieldFilterOperator.NotEquals)
                return query.Where(s => db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && f.FieldKey == key)
                    && !db.SubmissionValueNumber.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));
            if (filter.Operator == SubmissionFieldFilterOperator.GreaterThan)
                return query.Where(s => db.SubmissionValueNumber.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value > value));
            if (filter.Operator == SubmissionFieldFilterOperator.GreaterThanOrEqual)
                return query.Where(s => db.SubmissionValueNumber.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value >= value));
            if (filter.Operator == SubmissionFieldFilterOperator.LessThan)
                return query.Where(s => db.SubmissionValueNumber.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value < value));
            if (filter.Operator == SubmissionFieldFilterOperator.LessThanOrEqual)
                return query.Where(s => db.SubmissionValueNumber.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value <= value));
            return query.Where(s => db.SubmissionValueNumber.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));
        }

        private static IQueryable<SubmissionInfo> ApplyDateFilter(MegaFormDbContext db, IQueryable<SubmissionInfo> query, SubmissionFieldFilter filter, string key)
        {
            var value = filter.DateValue.Value;
            if (filter.Operator == SubmissionFieldFilterOperator.NotEquals)
                return query.Where(s => db.SubmissionFields.Any(f => f.SubmissionId == s.SubmissionId && f.FieldKey == key)
                    && !db.SubmissionValueDate.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));
            if (filter.Operator == SubmissionFieldFilterOperator.GreaterThan)
                return query.Where(s => db.SubmissionValueDate.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value > value));
            if (filter.Operator == SubmissionFieldFilterOperator.GreaterThanOrEqual)
                return query.Where(s => db.SubmissionValueDate.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value >= value));
            if (filter.Operator == SubmissionFieldFilterOperator.LessThan)
                return query.Where(s => db.SubmissionValueDate.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value < value));
            if (filter.Operator == SubmissionFieldFilterOperator.LessThanOrEqual)
                return query.Where(s => db.SubmissionValueDate.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value <= value));
            return query.Where(s => db.SubmissionValueDate.Any(v => v.SubmissionId == s.SubmissionId && v.FieldKey == key && v.Value == value));
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

        private (List<SubmissionInfo> Items, int TotalCount) ListCore(int formId, int? userId, string status, string search,
            DateTime? dateFrom, DateTime? dateTo, int pageIndex, int pageSize)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var q = db.Submissions.Where(s => s.FormId == formId);
            if (userId.HasValue) q = q.Where(s => s.UserId == userId.Value);
            if (!string.IsNullOrEmpty(status)) q = q.Where(s => s.Status == status);
            if (dateFrom.HasValue) q = q.Where(s => s.SubmittedOnUtc >= dateFrom.Value);
            if (dateTo.HasValue) q = q.Where(s => s.SubmittedOnUtc <= dateTo.Value);
            if (!string.IsNullOrEmpty(search))
            {
                q = ApplyTypedSearch(db, q, search);
            }
            // [BoundedCount v20260717-01] COUNT(*) over the full predicate ran on EVERY page request;
            // on a very large form (especially with broad free-text search) the count IS the
            // slow part. Cap the counted scan — SELECT COUNT(*) FROM (SELECT TOP (10001) …) — so
            // ≤10 000 stays exact and beyond that we report the 10 000 floor and flag
            // TotalIsBounded through the ambient source scope; the pager already renders "N+"
            // when the controller echoes totalIsBounded (same contract as the external SQL path).
            const int countCap = 10001;
            int total = q.Take(countCap).Count();
            if (total >= countCap)
            {
                total = countCap - 1;
                var scope = MegaForm.Core.Services.ExternalTable.ExternalSourceContext.Current;
                if (scope != null) scope.TotalIsBounded = true;
            }
            var items = q.OrderByDescending(s => s.SubmittedOnUtc).Skip(pageIndex * pageSize).Take(pageSize).ToList();
            // Keep legacy readers operational while the public list contract moves to Data.
            foreach (var it in items) HydrateDataJson(it);
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
            int formId = 0;
            bool found = false;
            using (var db = _dbContextFactory.CreateDbContext())
            {
                var sub = db.Submissions.Find(submissionId);
                if (sub != null)
                {
                    sub.DataJson = dataJson;
                    formId = sub.FormId;
                    found = true;
                    db.SaveChanges();
                }
            }

            // [TypedStorage 2026-07-18] When a caller writes a REAL DataJson (workflow field mutation,
            // admin edit) on a typed-primary host, the typed rows — and the search DisplayValue that the
            // dashboard now relies on — would go stale. Re-derive them from the new payload so typed
            // storage stays consistent. Skipped for the collapse call the submit pipeline itself makes
            // (UpdateData(id,"{}")). Fail-soft: on any error the full DataJson we just wrote is still a
            // correct source for hydration-based readers.
            if (found && _typedStore != null && _typedStore.SupportsDataJsonCollapse && _formRepo != null
                && !string.IsNullOrWhiteSpace(dataJson) && dataJson.Trim() != "{}")
            {
                try
                {
                    var form = _formRepo.GetForm(formId);
                    FormSchema schema = null;
                    if (form != null && !string.IsNullOrWhiteSpace(form.SchemaJson))
                        schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson);
                    var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(dataJson);
                    var writes = _fieldNormalizer.Normalize(formId, schema, data);
                    _typedStore.ReplaceFields(submissionId, formId, writes);
                }
                catch { /* fail-soft — leave the full DataJson as the source for hydration-based readers */ }
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
            // [TypedStorage 2026-07-17] The typed tables carry NO DB-level FK/cascade on Oqtane
            // (the schema is built from the EF model, which declares no fluent relationships), so
            // deleting the master row would orphan MF_SubmissionFields + typed value rows. Clean
            // them up explicitly. Fail-soft: a cleanup error must not fail the delete.
            try { _typedStore?.DeleteFields(submissionId); }
            catch (Exception ex) { System.Console.WriteLine("[MegaForm typed-cleanup] Delete failed for submission " + submissionId + ": " + ex.Message); }
        }

        public void BulkDelete(int formId, int[] submissionIds)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var subs = db.Submissions.Where(s => s.FormId == formId && submissionIds.Contains(s.SubmissionId));
            db.Submissions.RemoveRange(subs);
            db.SaveChanges();
            // [TypedStorage 2026-07-17] Explicit typed-row cleanup — see Delete() above.
            if (_typedStore != null && submissionIds != null)
                foreach (var id in submissionIds)
                {
                    try { _typedStore.DeleteFields(id); }
                    catch (Exception ex) { System.Console.WriteLine("[MegaForm typed-cleanup] BulkDelete failed for submission " + id + ": " + ex.Message); }
                }
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
