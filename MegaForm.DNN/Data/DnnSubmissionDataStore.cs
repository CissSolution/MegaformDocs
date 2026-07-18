using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services.TypedSubmission;

namespace MegaForm.DNN.Data
{
    /// <summary>
    /// ADO.NET implementation of <see cref="ISubmissionDataStore"/> for DNN. Persists the
    /// Umbraco Forms-style typed submission rows (dbo.MF_SubmissionFields + the six
    /// dbo.MF_SubmissionValue* tables) using raw SqlConnection/SqlCommand — the same access
    /// pattern as FormRepository / SubmissionIndexerService.
    ///
    /// DNN is PARALLEL-WRITE: typed rows are written alongside the full MF_Submissions.DataJson.
    /// <see cref="SupportsDataJsonCollapse"/> is false because DNN readers still consume DataJson
    /// directly (there is no read-side reconstruction bridge yet), so the submit pipeline must NOT
    /// collapse DataJson to "{}" on DNN.
    /// </summary>
    public sealed class DnnSubmissionDataStore : ISubmissionDataStore
    {
        private readonly Func<DbConnection> _connectionFactory;
        private readonly SubmissionFieldNormalizer _normalizer = new SubmissionFieldNormalizer();

        public DnnSubmissionDataStore(Func<DbConnection> connectionFactory)
        {
            _connectionFactory = connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
        }

        // DNN reads still depend on DataJson — do NOT collapse the legacy payload here.
        public bool SupportsDataJsonCollapse => false;

        private DbConnection Open()
        {
            var cn = _connectionFactory();
            if (cn.State != ConnectionState.Open) cn.Open();
            return cn;
        }

        private static void AddParam(DbCommand cmd, string name, object value)
        {
            var p = cmd.CreateParameter();
            p.ParameterName = name;
            p.Value = value ?? DBNull.Value;
            cmd.Parameters.Add(p);
        }

        // ── writes ──────────────────────────────────────────────────────────

        public void InsertFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields)
        {
            if (fields == null) return;
            using (var conn = Open())
            using (var tx = conn.BeginTransaction())
            {
                InsertFieldsCore(conn, tx, submissionId, formId, fields);
                tx.Commit();
            }
        }

        public void ReplaceFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields)
        {
            using (var conn = Open())
            using (var tx = conn.BeginTransaction())
            {
                DeleteFieldsCore(conn, tx, submissionId);
                if (fields != null)
                    InsertFieldsCore(conn, tx, submissionId, formId, fields);
                tx.Commit();
            }
        }

        public void DeleteFields(int submissionId)
        {
            using (var conn = Open())
            using (var tx = conn.BeginTransaction())
            {
                DeleteFieldsCore(conn, tx, submissionId);
                tx.Commit();
            }
        }

        private void InsertFieldsCore(DbConnection conn, DbTransaction tx, int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields)
        {
            foreach (var w in fields)
            {
                if (w == null) continue;
                var typed = _normalizer.ExtractTypedValues(w);
                bool hasValue = typed.HasAnyValue
                    || (w.Value != null && !string.IsNullOrWhiteSpace(w.Value.ToString()));

                long fieldId;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = tx;
                    cmd.CommandText =
                        "INSERT INTO dbo.MF_SubmissionFields " +
                        "(SubmissionId, FormId, FormFieldId, FieldKey, FieldId, FieldAlias, FieldType, DataType, " +
                        " LabelSnapshot, PageIndex, FieldOrder, DisplayValue, HasValue, IsSensitive, CreatedOnUtc) " +
                        "OUTPUT INSERTED.SubmissionFieldId " +
                        "VALUES (@sid, @fid, NULL, @key, @fldid, @alias, @ftype, @dtype, @label, @page, @order, " +
                        " @disp, @has, @sens, SYSUTCDATETIME());";
                    AddParam(cmd, "@sid", submissionId);
                    AddParam(cmd, "@fid", formId);
                    AddParam(cmd, "@key", (object)w.FieldKey ?? DBNull.Value);
                    AddParam(cmd, "@fldid", (object)w.FieldId ?? DBNull.Value);
                    AddParam(cmd, "@alias", (object)w.FieldAlias ?? DBNull.Value);
                    AddParam(cmd, "@ftype", (object)w.FieldType ?? DBNull.Value);
                    AddParam(cmd, "@dtype", (object)w.DataType ?? DBNull.Value);
                    AddParam(cmd, "@label", (object)w.LabelSnapshot ?? DBNull.Value);
                    AddParam(cmd, "@page", w.PageIndex.HasValue ? (object)w.PageIndex.Value : DBNull.Value);
                    AddParam(cmd, "@order", w.FieldOrder.HasValue ? (object)w.FieldOrder.Value : DBNull.Value);
                    AddParam(cmd, "@disp", (object)w.DisplayValue ?? DBNull.Value);
                    AddParam(cmd, "@has", hasValue);
                    AddParam(cmd, "@sens", w.IsSensitive);
                    fieldId = Convert.ToInt64(cmd.ExecuteScalar());
                }

                InsertValueRows(conn, tx, "MF_SubmissionValueString",   fieldId, submissionId, formId, w.FieldKey, typed.StringValues,   (i) => (object)typed.StringValues[i]);
                InsertValueRows(conn, tx, "MF_SubmissionValueLongText", fieldId, submissionId, formId, w.FieldKey, typed.LongTextValues, (i) => (object)typed.LongTextValues[i]);
                InsertValueRows(conn, tx, "MF_SubmissionValueNumber",   fieldId, submissionId, formId, w.FieldKey, typed.NumberValues,   (i) => typed.NumberValues[i].HasValue ? (object)typed.NumberValues[i].Value : DBNull.Value);
                InsertValueRows(conn, tx, "MF_SubmissionValueDate",     fieldId, submissionId, formId, w.FieldKey, typed.DateValues,     (i) => typed.DateValues[i].HasValue ? (object)typed.DateValues[i].Value : DBNull.Value);
                InsertValueRows(conn, tx, "MF_SubmissionValueBoolean",  fieldId, submissionId, formId, w.FieldKey, typed.BooleanValues,  (i) => (object)typed.BooleanValues[i]);
                InsertValueRows(conn, tx, "MF_SubmissionValueJson",     fieldId, submissionId, formId, w.FieldKey, typed.JsonValues,     (i) => (object)typed.JsonValues[i]);
            }
        }

        private static void InsertValueRows<T>(DbConnection conn, DbTransaction tx, string table, long fieldId,
            int submissionId, int formId, string fieldKey, IList<T> values, Func<int, object> valueAt)
        {
            if (values == null || values.Count == 0) return;
            for (int i = 0; i < values.Count; i++)
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = tx;
                    cmd.CommandText =
                        "INSERT INTO dbo." + table + " (SubmissionFieldId, SubmissionId, FormId, FieldKey, Ordinal, Value) " +
                        "VALUES (@fldid, @sid, @fid, @key, @ord, @val);";
                    AddParam(cmd, "@fldid", fieldId);
                    AddParam(cmd, "@sid", submissionId);
                    AddParam(cmd, "@fid", formId);
                    AddParam(cmd, "@key", (object)fieldKey ?? DBNull.Value);
                    AddParam(cmd, "@ord", i);
                    AddParam(cmd, "@val", valueAt(i) ?? DBNull.Value);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        private static void DeleteFieldsCore(DbConnection conn, DbTransaction tx, int submissionId)
        {
            string[] tables =
            {
                "MF_SubmissionValueString", "MF_SubmissionValueLongText", "MF_SubmissionValueNumber",
                "MF_SubmissionValueDate", "MF_SubmissionValueBoolean", "MF_SubmissionValueJson",
                "MF_SubmissionFields"
            };
            foreach (var t in tables)
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = tx;
                    cmd.CommandText = "DELETE FROM dbo." + t + " WHERE SubmissionId = @sid;";
                    AddParam(cmd, "@sid", submissionId);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        // ── reads ───────────────────────────────────────────────────────────

        public bool HasFields(int submissionId)
        {
            using (var conn = Open())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT TOP 1 1 FROM dbo.MF_SubmissionFields WHERE SubmissionId = @sid;";
                AddParam(cmd, "@sid", submissionId);
                var r = cmd.ExecuteScalar();
                return r != null && r != DBNull.Value;
            }
        }

        public IReadOnlyList<SubmissionFieldRecord> GetFields(int submissionId)
        {
            using (var conn = Open())
            {
                return ReadFields(conn, null, submissionId);
            }
        }

        private static List<SubmissionFieldRecord> ReadFields(DbConnection conn, DbTransaction tx, int submissionId)
        {
            var list = new List<SubmissionFieldRecord>();
            using (var cmd = conn.CreateCommand())
            {
                if (tx != null) cmd.Transaction = tx;
                cmd.CommandText =
                    "SELECT SubmissionFieldId, SubmissionId, FormId, FormFieldId, FieldKey, FieldId, FieldAlias, " +
                    "FieldType, DataType, LabelSnapshot, PageIndex, FieldOrder, DisplayValue, HasValue, IsSensitive, " +
                    "CreatedOnUtc, UpdatedOnUtc FROM dbo.MF_SubmissionFields WHERE SubmissionId = @sid " +
                    "ORDER BY ISNULL(PageIndex,0), ISNULL(FieldOrder,0), SubmissionFieldId;";
                AddParam(cmd, "@sid", submissionId);
                using (var rd = cmd.ExecuteReader())
                {
                    while (rd.Read())
                    {
                        list.Add(new SubmissionFieldRecord
                        {
                            SubmissionFieldId = rd.GetInt64(0),
                            SubmissionId = rd.GetInt32(1),
                            FormId = rd.GetInt32(2),
                            FormFieldId = rd.IsDBNull(3) ? (long?)null : rd.GetInt64(3),
                            FieldKey = rd.IsDBNull(4) ? null : rd.GetString(4),
                            FieldId = rd.IsDBNull(5) ? null : rd.GetString(5),
                            FieldAlias = rd.IsDBNull(6) ? null : rd.GetString(6),
                            FieldType = rd.IsDBNull(7) ? null : rd.GetString(7),
                            DataType = rd.IsDBNull(8) ? null : rd.GetString(8),
                            LabelSnapshot = rd.IsDBNull(9) ? null : rd.GetString(9),
                            PageIndex = rd.IsDBNull(10) ? (int?)null : rd.GetInt32(10),
                            FieldOrder = rd.IsDBNull(11) ? (int?)null : rd.GetInt32(11),
                            DisplayValue = rd.IsDBNull(12) ? null : rd.GetString(12),
                            HasValue = !rd.IsDBNull(13) && rd.GetBoolean(13),
                            IsSensitive = !rd.IsDBNull(14) && rd.GetBoolean(14),
                            CreatedOnUtc = rd.IsDBNull(15) ? DateTime.UtcNow : rd.GetDateTime(15),
                            UpdatedOnUtc = rd.IsDBNull(16) ? (DateTime?)null : rd.GetDateTime(16)
                        });
                    }
                }
            }
            return list;
        }

        public SubmissionDataDocument GetData(int submissionId)
        {
            using (var conn = Open())
            {
                var fields = ReadFields(conn, null, submissionId);
                var doc = new SubmissionDataDocument
                {
                    SubmissionId = submissionId,
                    FormId = fields.Count > 0 ? fields[0].FormId : 0,
                    Fields = fields,
                    FieldValues = new Dictionary<long, TypedFieldValues>()
                };
                foreach (var f in fields)
                    doc.FieldValues[f.SubmissionFieldId] = ReadTypedValues(conn, f.SubmissionFieldId);
                doc.Data = new SubmissionDataReconstructor().Reconstruct(doc);
                return doc;
            }
        }

        private static TypedFieldValues ReadTypedValues(DbConnection conn, long fieldId)
        {
            var tv = new TypedFieldValues();
            ReadValueColumn(conn, "MF_SubmissionValueString",   fieldId, (rd) => tv.StringValues.Add(rd.IsDBNull(0) ? null : rd.GetString(0)));
            ReadValueColumn(conn, "MF_SubmissionValueLongText", fieldId, (rd) => tv.LongTextValues.Add(rd.IsDBNull(0) ? null : rd.GetString(0)));
            ReadValueColumn(conn, "MF_SubmissionValueNumber",   fieldId, (rd) => tv.NumberValues.Add(rd.IsDBNull(0) ? (decimal?)null : rd.GetDecimal(0)));
            ReadValueColumn(conn, "MF_SubmissionValueDate",     fieldId, (rd) => tv.DateValues.Add(rd.IsDBNull(0) ? (DateTime?)null : rd.GetDateTime(0)));
            ReadValueColumn(conn, "MF_SubmissionValueBoolean",  fieldId, (rd) => tv.BooleanValues.Add(!rd.IsDBNull(0) && rd.GetBoolean(0)));
            ReadValueColumn(conn, "MF_SubmissionValueJson",     fieldId, (rd) => tv.JsonValues.Add(rd.IsDBNull(0) ? null : rd.GetString(0)));
            return tv;
        }

        private static void ReadValueColumn(DbConnection conn, string table, long fieldId, Action<DbDataReader> onRow)
        {
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT Value FROM dbo." + table + " WHERE SubmissionFieldId = @fldid ORDER BY Ordinal;";
                AddParam(cmd, "@fldid", fieldId);
                using (var rd = cmd.ExecuteReader())
                    while (rd.Read()) onRow(rd);
            }
        }

        // The typed value getters are rarely used on DNN (reads go through DataJson today) but are
        // implemented for interface completeness / future reader switch + backfill.
        public IReadOnlyList<SubmissionValueStringRecord> GetStringValues(long submissionFieldId)
        {
            var list = new List<SubmissionValueStringRecord>();
            using (var conn = Open())
                ReadValueColumn(conn, "MF_SubmissionValueString", submissionFieldId, (rd) => list.Add(new SubmissionValueStringRecord
                { SubmissionFieldId = submissionFieldId, Value = rd.IsDBNull(0) ? null : rd.GetString(0), Ordinal = list.Count }));
            return list;
        }

        public IReadOnlyList<SubmissionValueLongTextRecord> GetLongTextValues(long submissionFieldId)
        {
            var list = new List<SubmissionValueLongTextRecord>();
            using (var conn = Open())
                ReadValueColumn(conn, "MF_SubmissionValueLongText", submissionFieldId, (rd) => list.Add(new SubmissionValueLongTextRecord
                { SubmissionFieldId = submissionFieldId, Value = rd.IsDBNull(0) ? null : rd.GetString(0), Ordinal = list.Count }));
            return list;
        }

        public IReadOnlyList<SubmissionValueNumberRecord> GetNumberValues(long submissionFieldId)
        {
            var list = new List<SubmissionValueNumberRecord>();
            using (var conn = Open())
                ReadValueColumn(conn, "MF_SubmissionValueNumber", submissionFieldId, (rd) => list.Add(new SubmissionValueNumberRecord
                { SubmissionFieldId = submissionFieldId, Value = rd.IsDBNull(0) ? (decimal?)null : rd.GetDecimal(0), Ordinal = list.Count }));
            return list;
        }

        public IReadOnlyList<SubmissionValueDateRecord> GetDateValues(long submissionFieldId)
        {
            var list = new List<SubmissionValueDateRecord>();
            using (var conn = Open())
                ReadValueColumn(conn, "MF_SubmissionValueDate", submissionFieldId, (rd) => list.Add(new SubmissionValueDateRecord
                { SubmissionFieldId = submissionFieldId, Value = rd.IsDBNull(0) ? (DateTime?)null : rd.GetDateTime(0), Ordinal = list.Count }));
            return list;
        }

        public IReadOnlyList<SubmissionValueBooleanRecord> GetBooleanValues(long submissionFieldId)
        {
            var list = new List<SubmissionValueBooleanRecord>();
            using (var conn = Open())
                ReadValueColumn(conn, "MF_SubmissionValueBoolean", submissionFieldId, (rd) => list.Add(new SubmissionValueBooleanRecord
                { SubmissionFieldId = submissionFieldId, Value = !rd.IsDBNull(0) && rd.GetBoolean(0), Ordinal = list.Count }));
            return list;
        }

        public IReadOnlyList<SubmissionValueJsonRecord> GetJsonValues(long submissionFieldId)
        {
            var list = new List<SubmissionValueJsonRecord>();
            using (var conn = Open())
                ReadValueColumn(conn, "MF_SubmissionValueJson", submissionFieldId, (rd) => list.Add(new SubmissionValueJsonRecord
                { SubmissionFieldId = submissionFieldId, Value = rd.IsDBNull(0) ? null : rd.GetString(0), Ordinal = list.Count }));
            return list;
        }
    }
}
