using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services.TypedSubmission;

namespace MegaForm.Oqtane.Server.Data
{
    /// <summary>
    /// EF Core implementation of <see cref="ISubmissionDataStore"/> for Oqtane.
    /// Persists Umbraco Forms-style typed submission rows — MF_SubmissionFields plus
    /// the six MF_SubmissionValue* tables — in parallel with the legacy
    /// MF_Submissions.DataJson payload. Phase 1 is write-only: readers still use
    /// DataJson, so a failure here is fail-soft (see SubmissionProcessor).
    /// Mirrors the InMemory contract in MegaForm.Sdk.Tests/TypedSubmissionStorageTests.cs.
    /// </summary>
    public class EfSubmissionDataStore : ISubmissionDataStore
    {
        private readonly IDbContextFactory<MegaFormDbContext> _dbContextFactory;
        private readonly SubmissionFieldNormalizer _normalizer = new SubmissionFieldNormalizer();

        public EfSubmissionDataStore(IDbContextFactory<MegaFormDbContext> dbContextFactory)
        {
            _dbContextFactory = dbContextFactory;
        }

        // Oqtane reconstructs DataJson from typed rows on read (EfSubmissionRepository.HydrateDataJson),
        // so it is safe to collapse the stored MF_Submissions.DataJson to "{}" after a typed write.
        public bool SupportsDataJsonCollapse => true;

        public bool HasFields(int submissionId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.SubmissionFields.AsNoTracking().Any(f => f.SubmissionId == submissionId);
        }

        public IReadOnlyList<SubmissionFieldRecord> GetFields(int submissionId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.SubmissionFields.AsNoTracking()
                .Where(f => f.SubmissionId == submissionId)
                .OrderBy(f => f.PageIndex).ThenBy(f => f.FieldOrder).ThenBy(f => f.SubmissionFieldId)
                .ToList();
        }

        public SubmissionDataDocument GetData(int submissionId)
        {
            using var db = _dbContextFactory.CreateDbContext();

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

            // Six bulk reads (one per typed table) keyed by SubmissionId, then grouped
            // in memory by SubmissionFieldId — avoids an N+1 query per field.
            var strings   = db.SubmissionValueString.AsNoTracking().Where(v => v.SubmissionId == submissionId).ToList();
            var longTexts = db.SubmissionValueLongText.AsNoTracking().Where(v => v.SubmissionId == submissionId).ToList();
            var numbers   = db.SubmissionValueNumber.AsNoTracking().Where(v => v.SubmissionId == submissionId).ToList();
            var dates     = db.SubmissionValueDate.AsNoTracking().Where(v => v.SubmissionId == submissionId).ToList();
            var booleans  = db.SubmissionValueBoolean.AsNoTracking().Where(v => v.SubmissionId == submissionId).ToList();
            var jsons     = db.SubmissionValueJson.AsNoTracking().Where(v => v.SubmissionId == submissionId).ToList();

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

        public IReadOnlyList<SubmissionValueStringRecord> GetStringValues(long submissionFieldId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.SubmissionValueString.AsNoTracking()
                .Where(v => v.SubmissionFieldId == submissionFieldId).OrderBy(v => v.Ordinal).ToList();
        }

        public IReadOnlyList<SubmissionValueLongTextRecord> GetLongTextValues(long submissionFieldId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.SubmissionValueLongText.AsNoTracking()
                .Where(v => v.SubmissionFieldId == submissionFieldId).OrderBy(v => v.Ordinal).ToList();
        }

        public IReadOnlyList<SubmissionValueNumberRecord> GetNumberValues(long submissionFieldId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.SubmissionValueNumber.AsNoTracking()
                .Where(v => v.SubmissionFieldId == submissionFieldId).OrderBy(v => v.Ordinal).ToList();
        }

        public IReadOnlyList<SubmissionValueDateRecord> GetDateValues(long submissionFieldId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.SubmissionValueDate.AsNoTracking()
                .Where(v => v.SubmissionFieldId == submissionFieldId).OrderBy(v => v.Ordinal).ToList();
        }

        public IReadOnlyList<SubmissionValueBooleanRecord> GetBooleanValues(long submissionFieldId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.SubmissionValueBoolean.AsNoTracking()
                .Where(v => v.SubmissionFieldId == submissionFieldId).OrderBy(v => v.Ordinal).ToList();
        }

        public IReadOnlyList<SubmissionValueJsonRecord> GetJsonValues(long submissionFieldId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.SubmissionValueJson.AsNoTracking()
                .Where(v => v.SubmissionFieldId == submissionFieldId).OrderBy(v => v.Ordinal).ToList();
        }

        public void InsertFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields)
        {
            if (fields == null) return;
            using var db = _dbContextFactory.CreateDbContext();
            InsertFieldsCore(db, submissionId, formId, fields);
        }

        public void ReplaceFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields)
        {
            using var db = _dbContextFactory.CreateDbContext();
            using var tx = db.Database.BeginTransaction();

            DeleteFieldsCore(db, submissionId);
            db.SaveChanges();

            if (fields != null)
                InsertFieldsCore(db, submissionId, formId, fields);

            tx.Commit();
        }

        public void DeleteFields(int submissionId)
        {
            using var db = _dbContextFactory.CreateDbContext();
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

            // First SaveChanges assigns SubmissionFieldId identities to every field row;
            // the value rows then reference those generated ids.
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
