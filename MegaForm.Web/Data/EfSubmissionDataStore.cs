using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services.TypedSubmission;

namespace MegaForm.Web.Data
{
    /// <summary>
    /// EF Core implementation of <see cref="ISubmissionDataStore"/> for the standalone
    /// MegaForm.Web host. Mirrors the Oqtane store but keeps the legacy DataJson intact
    /// (<see cref="SupportsDataJsonCollapse"/> is false) because Web readers still read
    /// DataJson directly. Typed rows are written in parallel as a fail-soft additive layer.
    /// </summary>
    public class EfSubmissionDataStore : ISubmissionDataStore, ISubmissionDataBatchReader
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly SubmissionFieldNormalizer _normalizer = new SubmissionFieldNormalizer();

        public EfSubmissionDataStore(IServiceProvider serviceProvider)
        {
            _serviceProvider = serviceProvider;
        }

        /// <summary>
        /// Web still reads DataJson directly, so never collapse it after a typed write.
        /// </summary>
        public bool SupportsDataJsonCollapse => false;

        public bool HasFields(int submissionId)
        {
            using var scope = _serviceProvider.CreateScope();
            using var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
            return db.SubmissionFields.AsNoTracking().Any(f => f.SubmissionId == submissionId);
        }

        public IReadOnlyList<SubmissionFieldRecord> GetFields(int submissionId)
        {
            using var scope = _serviceProvider.CreateScope();
            using var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
            return db.SubmissionFields.AsNoTracking()
                .Where(f => f.SubmissionId == submissionId)
                .OrderBy(f => f.PageIndex).ThenBy(f => f.FieldOrder).ThenBy(f => f.SubmissionFieldId)
                .ToList();
        }

        public SubmissionDataDocument GetData(int submissionId)
        {
            using var scope = _serviceProvider.CreateScope();
            using var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();

            var fields = db.SubmissionFields.AsNoTracking()
                .Where(f => f.SubmissionId == submissionId)
                .OrderBy(f => f.PageIndex).ThenBy(f => f.FieldOrder).ThenBy(f => f.SubmissionFieldId)
                .ToList();

            var doc = new SubmissionDataDocument
            {
                SubmissionId = submissionId,
                FormId = fields.Count > 0 ? fields[0].FormId : 0,
                Fields = fields,
                FieldValues = new Dictionary<long, TypedFieldValues>()
            };

            if (fields.Count == 0)
            {
                doc.Data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                return doc;
            }

            var strings = db.SubmissionValueString.AsNoTracking().Where(v => v.SubmissionId == submissionId).ToList();
            var longTexts = db.SubmissionValueLongText.AsNoTracking().Where(v => v.SubmissionId == submissionId).ToList();
            var numbers = db.SubmissionValueNumber.AsNoTracking().Where(v => v.SubmissionId == submissionId).ToList();
            var dates = db.SubmissionValueDate.AsNoTracking().Where(v => v.SubmissionId == submissionId).ToList();
            var booleans = db.SubmissionValueBoolean.AsNoTracking().Where(v => v.SubmissionId == submissionId).ToList();
            var jsons = db.SubmissionValueJson.AsNoTracking().Where(v => v.SubmissionId == submissionId).ToList();

            foreach (var f in fields)
            {
                var tv = new TypedFieldValues();
                tv.StringValues.AddRange(strings.Where(v => v.SubmissionFieldId == f.SubmissionFieldId).OrderBy(v => v.Ordinal).Select(v => v.Value));
                tv.LongTextValues.AddRange(longTexts.Where(v => v.SubmissionFieldId == f.SubmissionFieldId).OrderBy(v => v.Ordinal).Select(v => v.Value));
                tv.NumberValues.AddRange(numbers.Where(v => v.SubmissionFieldId == f.SubmissionFieldId).OrderBy(v => v.Ordinal).Select(v => v.Value));
                tv.DateValues.AddRange(dates.Where(v => v.SubmissionFieldId == f.SubmissionFieldId).OrderBy(v => v.Ordinal).Select(v => v.Value));
                tv.BooleanValues.AddRange(booleans.Where(v => v.SubmissionFieldId == f.SubmissionFieldId).OrderBy(v => v.Ordinal).Select(v => v.Value));
                tv.JsonValues.AddRange(jsons.Where(v => v.SubmissionFieldId == f.SubmissionFieldId).OrderBy(v => v.Ordinal).Select(v => v.Value));
                doc.FieldValues[f.SubmissionFieldId] = tv;
            }

            doc.Data = new SubmissionDataReconstructor().Reconstruct(doc);
            return doc;
        }

        /// <summary>
        /// [PerfFix 2026-08-07] Batch typed read — one query per table for the whole id set
        /// (same document shape as GetData, filtered by IN instead of one submission at a time).
        /// AppRecordQueryService uses this to avoid an N+1 per record on app query pages.
        /// </summary>
        public IDictionary<int, SubmissionDataDocument> GetDataMany(IReadOnlyCollection<int> submissionIds)
        {
            var result = new Dictionary<int, SubmissionDataDocument>();
            if (submissionIds == null || submissionIds.Count == 0) return result;
            var ids = submissionIds.Where(i => i > 0).Distinct().ToList();
            if (ids.Count == 0) return result;

            using var scope = _serviceProvider.CreateScope();
            using var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();

            var fields = db.SubmissionFields.AsNoTracking()
                .Where(f => ids.Contains(f.SubmissionId))
                .OrderBy(f => f.SubmissionId).ThenBy(f => f.PageIndex).ThenBy(f => f.FieldOrder).ThenBy(f => f.SubmissionFieldId)
                .ToList();
            if (fields.Count == 0) return result;

            var strings   = db.SubmissionValueString.AsNoTracking().Where(v => ids.Contains(v.SubmissionId)).ToList();
            var longTexts = db.SubmissionValueLongText.AsNoTracking().Where(v => ids.Contains(v.SubmissionId)).ToList();
            var numbers   = db.SubmissionValueNumber.AsNoTracking().Where(v => ids.Contains(v.SubmissionId)).ToList();
            var dates     = db.SubmissionValueDate.AsNoTracking().Where(v => ids.Contains(v.SubmissionId)).ToList();
            var booleans  = db.SubmissionValueBoolean.AsNoTracking().Where(v => ids.Contains(v.SubmissionId)).ToList();
            var jsons     = db.SubmissionValueJson.AsNoTracking().Where(v => ids.Contains(v.SubmissionId)).ToList();

            var reconstructor = new SubmissionDataReconstructor();
            foreach (var group in fields.GroupBy(f => f.SubmissionId))
            {
                var perSubmission = group.ToList();
                var doc = new SubmissionDataDocument
                {
                    SubmissionId = group.Key,
                    FormId = perSubmission[0].FormId,
                    Fields = perSubmission,
                    FieldValues = new Dictionary<long, TypedFieldValues>()
                };
                foreach (var f in perSubmission)
                {
                    var tv = new TypedFieldValues();
                    tv.StringValues.AddRange(strings.Where(v => v.SubmissionFieldId == f.SubmissionFieldId).OrderBy(v => v.Ordinal).Select(v => v.Value));
                    tv.LongTextValues.AddRange(longTexts.Where(v => v.SubmissionFieldId == f.SubmissionFieldId).OrderBy(v => v.Ordinal).Select(v => v.Value));
                    tv.NumberValues.AddRange(numbers.Where(v => v.SubmissionFieldId == f.SubmissionFieldId).OrderBy(v => v.Ordinal).Select(v => v.Value));
                    tv.DateValues.AddRange(dates.Where(v => v.SubmissionFieldId == f.SubmissionFieldId).OrderBy(v => v.Ordinal).Select(v => v.Value));
                    tv.BooleanValues.AddRange(booleans.Where(v => v.SubmissionFieldId == f.SubmissionFieldId).OrderBy(v => v.Ordinal).Select(v => v.Value));
                    tv.JsonValues.AddRange(jsons.Where(v => v.SubmissionFieldId == f.SubmissionFieldId).OrderBy(v => v.Ordinal).Select(v => v.Value));
                    doc.FieldValues[f.SubmissionFieldId] = tv;
                }
                doc.Data = reconstructor.Reconstruct(doc);
                result[group.Key] = doc;
            }
            return result;
        }

        public IReadOnlyList<SubmissionValueStringRecord> GetStringValues(long submissionFieldId)
        {
            using var scope = _serviceProvider.CreateScope();
            using var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
            return db.SubmissionValueString.AsNoTracking()
                .Where(v => v.SubmissionFieldId == submissionFieldId).OrderBy(v => v.Ordinal).ToList();
        }

        public IReadOnlyList<SubmissionValueLongTextRecord> GetLongTextValues(long submissionFieldId)
        {
            using var scope = _serviceProvider.CreateScope();
            using var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
            return db.SubmissionValueLongText.AsNoTracking()
                .Where(v => v.SubmissionFieldId == submissionFieldId).OrderBy(v => v.Ordinal).ToList();
        }

        public IReadOnlyList<SubmissionValueNumberRecord> GetNumberValues(long submissionFieldId)
        {
            using var scope = _serviceProvider.CreateScope();
            using var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
            return db.SubmissionValueNumber.AsNoTracking()
                .Where(v => v.SubmissionFieldId == submissionFieldId).OrderBy(v => v.Ordinal).ToList();
        }

        public IReadOnlyList<SubmissionValueDateRecord> GetDateValues(long submissionFieldId)
        {
            using var scope = _serviceProvider.CreateScope();
            using var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
            return db.SubmissionValueDate.AsNoTracking()
                .Where(v => v.SubmissionFieldId == submissionFieldId).OrderBy(v => v.Ordinal).ToList();
        }

        public IReadOnlyList<SubmissionValueBooleanRecord> GetBooleanValues(long submissionFieldId)
        {
            using var scope = _serviceProvider.CreateScope();
            using var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
            return db.SubmissionValueBoolean.AsNoTracking()
                .Where(v => v.SubmissionFieldId == submissionFieldId).OrderBy(v => v.Ordinal).ToList();
        }

        public IReadOnlyList<SubmissionValueJsonRecord> GetJsonValues(long submissionFieldId)
        {
            using var scope = _serviceProvider.CreateScope();
            using var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
            return db.SubmissionValueJson.AsNoTracking()
                .Where(v => v.SubmissionFieldId == submissionFieldId).OrderBy(v => v.Ordinal).ToList();
        }

        public void InsertFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields)
        {
            if (fields == null) return;
            using var scope = _serviceProvider.CreateScope();
            using var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
            InsertFieldsCore(db, submissionId, formId, fields);
        }

        public void ReplaceFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields)
        {
            using var scope = _serviceProvider.CreateScope();
            using var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
            using var tx = db.Database.BeginTransaction();

            DeleteFieldsCore(db, submissionId);
            db.SaveChanges();

            if (fields != null)
                InsertFieldsCore(db, submissionId, formId, fields);

            tx.Commit();
        }

        public void DeleteFields(int submissionId)
        {
            using var scope = _serviceProvider.CreateScope();
            using var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
            DeleteFieldsCore(db, submissionId);
            db.SaveChanges();
        }

        private void InsertFieldsCore(MegaFormDbContext db, int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields)
        {
            var pending = new List<(SubmissionFieldRecord field, TypedFieldValues values)>();

            foreach (var w in fields)
            {
                if (w == null) continue;

                var typed = _normalizer.ExtractTypedValues(w);
                var hasValue = typed.HasAnyValue
                    || (w.Value != null && !string.IsNullOrWhiteSpace(w.Value.ToString()));

                var field = new SubmissionFieldRecord
                {
                    SubmissionId = submissionId,
                    FormId = formId,
                    FieldKey = w.FieldKey,
                    FieldId = w.FieldId,
                    FieldAlias = w.FieldAlias,
                    FieldType = w.FieldType,
                    DataType = w.DataType,
                    LabelSnapshot = w.LabelSnapshot,
                    PageIndex = w.PageIndex,
                    FieldOrder = w.FieldOrder,
                    DisplayValue = w.DisplayValue,
                    HasValue = hasValue,
                    IsSensitive = w.IsSensitive,
                    CreatedOnUtc = w.CreatedOnUtc == default ? DateTime.UtcNow : w.CreatedOnUtc
                };

                db.SubmissionFields.Add(field);
                pending.Add((field, typed));
            }

            db.SaveChanges();

            foreach (var (field, typed) in pending)
                AddValueRows(db, field, typed);

            db.SaveChanges();
        }

        private void DeleteFieldsCore(MegaFormDbContext db, int submissionId)
        {
            db.SubmissionValueString.RemoveRange(db.SubmissionValueString.Where(v => v.SubmissionId == submissionId));
            db.SubmissionValueLongText.RemoveRange(db.SubmissionValueLongText.Where(v => v.SubmissionId == submissionId));
            db.SubmissionValueNumber.RemoveRange(db.SubmissionValueNumber.Where(v => v.SubmissionId == submissionId));
            db.SubmissionValueDate.RemoveRange(db.SubmissionValueDate.Where(v => v.SubmissionId == submissionId));
            db.SubmissionValueBoolean.RemoveRange(db.SubmissionValueBoolean.Where(v => v.SubmissionId == submissionId));
            db.SubmissionValueJson.RemoveRange(db.SubmissionValueJson.Where(v => v.SubmissionId == submissionId));
            db.SubmissionFields.RemoveRange(db.SubmissionFields.Where(f => f.SubmissionId == submissionId));
        }

        private static void AddValueRows(MegaFormDbContext db, SubmissionFieldRecord field, TypedFieldValues typed)
        {
            for (int i = 0; i < typed.StringValues.Count; i++)
                db.SubmissionValueString.Add(new SubmissionValueStringRecord
                { SubmissionFieldId = field.SubmissionFieldId, SubmissionId = field.SubmissionId, FormId = field.FormId, FieldKey = field.FieldKey, Ordinal = i, Value = typed.StringValues[i] });

            for (int i = 0; i < typed.LongTextValues.Count; i++)
                db.SubmissionValueLongText.Add(new SubmissionValueLongTextRecord
                { SubmissionFieldId = field.SubmissionFieldId, SubmissionId = field.SubmissionId, FormId = field.FormId, FieldKey = field.FieldKey, Ordinal = i, Value = typed.LongTextValues[i] });

            for (int i = 0; i < typed.NumberValues.Count; i++)
                db.SubmissionValueNumber.Add(new SubmissionValueNumberRecord
                { SubmissionFieldId = field.SubmissionFieldId, SubmissionId = field.SubmissionId, FormId = field.FormId, FieldKey = field.FieldKey, Ordinal = i, Value = typed.NumberValues[i] });

            for (int i = 0; i < typed.DateValues.Count; i++)
                db.SubmissionValueDate.Add(new SubmissionValueDateRecord
                { SubmissionFieldId = field.SubmissionFieldId, SubmissionId = field.SubmissionId, FormId = field.FormId, FieldKey = field.FieldKey, Ordinal = i, Value = typed.DateValues[i] });

            for (int i = 0; i < typed.BooleanValues.Count; i++)
                db.SubmissionValueBoolean.Add(new SubmissionValueBooleanRecord
                { SubmissionFieldId = field.SubmissionFieldId, SubmissionId = field.SubmissionId, FormId = field.FormId, FieldKey = field.FieldKey, Ordinal = i, Value = typed.BooleanValues[i] });

            for (int i = 0; i < typed.JsonValues.Count; i++)
                db.SubmissionValueJson.Add(new SubmissionValueJsonRecord
                { SubmissionFieldId = field.SubmissionFieldId, SubmissionId = field.SubmissionId, FormId = field.FormId, FieldKey = field.FieldKey, Ordinal = i, Value = typed.JsonValues[i] });
        }
    }
}
