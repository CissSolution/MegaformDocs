using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using MegaForm.Core.Models;

namespace MegaForm.DNN.Data
{
    public static partial class FormRepository
    {
        public static (List<SubmissionInfo> Items, int TotalCount) ListSubmissionsTyped(SubmissionListQuery query)
        {
            if (query == null) throw new ArgumentNullException(nameof(query));

            var pageIndex = Math.Max(0, query.PageIndex);
            var pageSize = query.PageSize > 0 ? Math.Min(query.PageSize, 5000) : 50;
            var where = new List<string> { "1 = 1" };
            var parameters = new List<SqlParameter>();

            if (query.FormId > 0)
            {
                where.Add("s.FormId = @FormId");
                parameters.Add(new SqlParameter("@FormId", SqlDbType.Int) { Value = query.FormId });
            }
            if (query.UserId.HasValue && query.UserId.Value > 0)
            {
                where.Add("s.UserId = @UserId");
                parameters.Add(new SqlParameter("@UserId", SqlDbType.Int) { Value = query.UserId.Value });
            }
            if (!string.IsNullOrWhiteSpace(query.Status))
            {
                where.Add("s.[Status] = @Status");
                parameters.Add(new SqlParameter("@Status", SqlDbType.NVarChar, 64) { Value = query.Status.Trim() });
            }
            if (query.DateFrom.HasValue)
            {
                where.Add("s.SubmittedOnUtc >= @DateFrom");
                parameters.Add(new SqlParameter("@DateFrom", SqlDbType.DateTime2) { Value = query.DateFrom.Value });
            }
            if (query.DateTo.HasValue)
            {
                var endExclusive = query.DateTo.Value.Date.AddDays(1);
                where.Add("s.SubmittedOnUtc < @DateTo");
                parameters.Add(new SqlParameter("@DateTo", SqlDbType.DateTime2) { Value = endExclusive });
            }

            AddTypedFreeTextPredicate(query.Search, where, parameters);
            var filters = query.FieldFilters ?? new List<SubmissionFieldFilter>();
            for (var i = 0; i < filters.Count; i++)
                where.Add(BuildTypedFieldPredicate(filters[i], i, parameters));

            var whereSql = string.Join(" AND ", where);
            var listSql = "SELECT s.* FROM dbo.MF_Submissions s WHERE " + whereSql
                + " ORDER BY s.SubmittedOnUtc DESC, s.SubmissionId DESC"
                + " OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;";
            var countSql = "SELECT COUNT(*) FROM dbo.MF_Submissions s WHERE " + whereSql + ";";
            var items = new List<SubmissionInfo>();

            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SqlCommand(listSql, conn))
                {
                    AddClonedParameters(cmd, parameters);
                    cmd.Parameters.Add(new SqlParameter("@Offset", SqlDbType.Int) { Value = pageIndex * pageSize });
                    cmd.Parameters.Add(new SqlParameter("@PageSize", SqlDbType.Int) { Value = pageSize });
                    using (var reader = cmd.ExecuteReader())
                        while (reader.Read()) items.Add(MapSubmission(reader));
                }

                using (var cmd = new SqlCommand(countSql, conn))
                {
                    AddClonedParameters(cmd, parameters);
                    return (items, Convert.ToInt32(cmd.ExecuteScalar() ?? 0));
                }
            }
        }

        private static void AddTypedFreeTextPredicate(string search, List<string> where, List<SqlParameter> parameters)
        {
            if (string.IsNullOrWhiteSpace(search)) return;

            var term = search.Trim();
            var parts = new List<string>
            {
                "ISNULL(s.IpAddress, '') LIKE @TypedSearch ESCAPE '~'",
                "ISNULL(s.[Status], '') LIKE @TypedSearch ESCAPE '~'",
                "EXISTS (SELECT 1 FROM dbo.MF_SubmissionFields f WHERE f.SubmissionId = s.SubmissionId AND f.IsSensitive = 0 AND (ISNULL(f.FieldKey, '') LIKE @TypedSearch ESCAPE '~' OR ISNULL(f.DisplayValue, '') LIKE @TypedSearch ESCAPE '~'))",
                "EXISTS (SELECT 1 FROM dbo.MF_SubmissionValueString v INNER JOIN dbo.MF_SubmissionFields f ON f.SubmissionFieldId = v.SubmissionFieldId AND f.IsSensitive = 0 WHERE v.SubmissionId = s.SubmissionId AND ISNULL(v.Value, '') LIKE @TypedSearch ESCAPE '~')",
                "EXISTS (SELECT 1 FROM dbo.MF_SubmissionValueLongText v INNER JOIN dbo.MF_SubmissionFields f ON f.SubmissionFieldId = v.SubmissionFieldId AND f.IsSensitive = 0 WHERE v.SubmissionId = s.SubmissionId AND ISNULL(v.Value, '') LIKE @TypedSearch ESCAPE '~')"
            };

            if (int.TryParse(term, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id) && id > 0)
            {
                parts.Add("s.SubmissionId = @TypedSubmissionId");
                parameters.Add(new SqlParameter("@TypedSubmissionId", SqlDbType.Int) { Value = id });
            }
            if (decimal.TryParse(term, NumberStyles.Number, CultureInfo.InvariantCulture, out var number))
            {
                parts.Add("EXISTS (SELECT 1 FROM dbo.MF_SubmissionValueNumber v INNER JOIN dbo.MF_SubmissionFields f ON f.SubmissionFieldId = v.SubmissionFieldId AND f.IsSensitive = 0 WHERE v.SubmissionId = s.SubmissionId AND v.Value = @TypedSearchNumber)");
                parameters.Add(new SqlParameter("@TypedSearchNumber", SqlDbType.Decimal) { Precision = 18, Scale = 6, Value = number });
            }
            if (DateTime.TryParse(term, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var date))
            {
                parts.Add("EXISTS (SELECT 1 FROM dbo.MF_SubmissionValueDate v INNER JOIN dbo.MF_SubmissionFields f ON f.SubmissionFieldId = v.SubmissionFieldId AND f.IsSensitive = 0 WHERE v.SubmissionId = s.SubmissionId AND v.Value = @TypedSearchDate)");
                parameters.Add(new SqlParameter("@TypedSearchDate", SqlDbType.DateTime2) { Value = date });
            }
            if (bool.TryParse(term, out var boolean))
            {
                parts.Add("EXISTS (SELECT 1 FROM dbo.MF_SubmissionValueBoolean v INNER JOIN dbo.MF_SubmissionFields f ON f.SubmissionFieldId = v.SubmissionFieldId AND f.IsSensitive = 0 WHERE v.SubmissionId = s.SubmissionId AND v.Value = @TypedSearchBoolean)");
                parameters.Add(new SqlParameter("@TypedSearchBoolean", SqlDbType.Bit) { Value = boolean });
            }

            where.Add("(" + string.Join(" OR ", parts) + ")");
            parameters.Add(new SqlParameter("@TypedSearch", SqlDbType.NVarChar, 1100)
            {
                Value = "%" + EscapeSqlLike(term) + "%"
            });
        }

        private static string BuildTypedFieldPredicate(SubmissionFieldFilter filter, int index, List<SqlParameter> parameters)
        {
            var keyName = "@TypedFieldKey" + index;
            parameters.Add(new SqlParameter(keyName, SqlDbType.NVarChar, 256) { Value = filter.FieldKey.Trim() });

            if (filter.Operator == SubmissionFieldFilterOperator.IsEmpty || filter.Operator == SubmissionFieldFilterOperator.IsNotEmpty)
            {
                var expected = filter.Operator == SubmissionFieldFilterOperator.IsNotEmpty ? 1 : 0;
                return "EXISTS (SELECT 1 FROM dbo.MF_SubmissionFields f WHERE f.SubmissionId = s.SubmissionId AND f.FieldKey = "
                    + keyName + " AND f.HasValue = " + expected + ")";
            }

            var dataType = ResolveFilterDataType(filter);
            var table = TypedValueTable(dataType);
            var valueName = "@TypedFieldValue" + index;
            SqlParameter valueParameter;
            string valuePredicate;

            if (dataType == SubmissionDataType.String || dataType == SubmissionDataType.LongText)
            {
                var value = filter.TextValue ?? string.Empty;
                valuePredicate = BuildTextComparison("v.Value", valueName, filter.Operator);
                valueParameter = new SqlParameter(valueName, SqlDbType.NVarChar, dataType == SubmissionDataType.String ? 1024 : -1)
                {
                    Value = BuildLikeValue(value, filter.Operator)
                };
            }
            else if (dataType == SubmissionDataType.Number)
            {
                valuePredicate = BuildScalarComparison("v.Value", valueName, filter.Operator);
                valueParameter = new SqlParameter(valueName, SqlDbType.Decimal) { Precision = 18, Scale = 6, Value = filter.NumberValue.Value };
            }
            else if (dataType == SubmissionDataType.Date)
            {
                valuePredicate = BuildScalarComparison("v.Value", valueName, filter.Operator);
                valueParameter = new SqlParameter(valueName, SqlDbType.DateTime2) { Value = filter.DateValue.Value };
            }
            else if (dataType == SubmissionDataType.Boolean)
            {
                valuePredicate = "v.Value = " + valueName;
                valueParameter = new SqlParameter(valueName, SqlDbType.Bit) { Value = filter.BooleanValue.Value };
            }
            else
            {
                throw new NotSupportedException("JSON values cannot be compared as strings. Use a normalized typed field.");
            }

            parameters.Add(valueParameter);
            var matchingValue = "EXISTS (SELECT 1 FROM dbo." + table + " v WHERE v.SubmissionId = s.SubmissionId AND v.FieldKey = "
                + keyName + " AND " + valuePredicate + ")";

            if (filter.Operator != SubmissionFieldFilterOperator.NotEquals) return matchingValue;
            return "EXISTS (SELECT 1 FROM dbo.MF_SubmissionFields f WHERE f.SubmissionId = s.SubmissionId AND f.FieldKey = "
                + keyName + ") AND NOT " + matchingValue;
        }

        private static SubmissionDataType ResolveFilterDataType(SubmissionFieldFilter filter)
        {
            if (filter.DataType.HasValue) return filter.DataType.Value;
            if (filter.NumberValue.HasValue) return SubmissionDataType.Number;
            if (filter.DateValue.HasValue) return SubmissionDataType.Date;
            if (filter.BooleanValue.HasValue) return SubmissionDataType.Boolean;
            return SubmissionDataType.String;
        }

        private static string TypedValueTable(SubmissionDataType dataType)
        {
            switch (dataType)
            {
                case SubmissionDataType.String: return "MF_SubmissionValueString";
                case SubmissionDataType.LongText: return "MF_SubmissionValueLongText";
                case SubmissionDataType.Number: return "MF_SubmissionValueNumber";
                case SubmissionDataType.Date: return "MF_SubmissionValueDate";
                case SubmissionDataType.Boolean: return "MF_SubmissionValueBoolean";
                default: return "MF_SubmissionValueJson";
            }
        }

        private static string BuildTextComparison(string column, string parameter, SubmissionFieldFilterOperator op)
        {
            if (op == SubmissionFieldFilterOperator.Equals || op == SubmissionFieldFilterOperator.NotEquals)
                return column + " = " + parameter;
            return column + " LIKE " + parameter + " ESCAPE '~'";
        }

        private static string BuildScalarComparison(string column, string parameter, SubmissionFieldFilterOperator op)
        {
            switch (op)
            {
                case SubmissionFieldFilterOperator.Equals:
                case SubmissionFieldFilterOperator.NotEquals: return column + " = " + parameter;
                case SubmissionFieldFilterOperator.GreaterThan: return column + " > " + parameter;
                case SubmissionFieldFilterOperator.GreaterThanOrEqual: return column + " >= " + parameter;
                case SubmissionFieldFilterOperator.LessThan: return column + " < " + parameter;
                case SubmissionFieldFilterOperator.LessThanOrEqual: return column + " <= " + parameter;
                default: throw new NotSupportedException("The selected operator is not valid for scalar typed values.");
            }
        }

        private static string BuildLikeValue(string value, SubmissionFieldFilterOperator op)
        {
            var escaped = EscapeSqlLike(value ?? string.Empty);
            switch (op)
            {
                case SubmissionFieldFilterOperator.Contains: return "%" + escaped + "%";
                case SubmissionFieldFilterOperator.StartsWith: return escaped + "%";
                case SubmissionFieldFilterOperator.EndsWith: return "%" + escaped;
                default: return value ?? string.Empty;
            }
        }

        private static string EscapeSqlLike(string value)
        {
            return (value ?? string.Empty).Replace("~", "~~").Replace("%", "~%").Replace("_", "~_").Replace("[", "~[");
        }

        private static void AddClonedParameters(SqlCommand command, IEnumerable<SqlParameter> parameters)
        {
            foreach (var parameter in parameters)
                command.Parameters.Add((SqlParameter)((ICloneable)parameter).Clone());
        }
    }
}
