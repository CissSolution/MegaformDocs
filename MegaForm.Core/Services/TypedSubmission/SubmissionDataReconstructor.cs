using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services.TypedSubmission
{
    /// <summary>
    /// Reconstructs the canonical submission data dictionary from typed field/value rows.
    /// </summary>
    public sealed class SubmissionDataReconstructor
    {
        /// <summary>
        /// Reconstructs Data from a document. If Data is already populated, returns it directly.
        /// Otherwise rebuilds from Fields + FieldValues.
        /// </summary>
        public Dictionary<string, object> Reconstruct(SubmissionDataDocument document)
        {
            if (document == null) return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (document.Data != null && document.Data.Count > 0) return document.Data;

            var data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (document.Fields == null || document.FieldValues == null) return data;

            foreach (var field in document.Fields)
            {
                if (field == null || string.IsNullOrWhiteSpace(field.FieldKey)) continue;
                if (!document.FieldValues.TryGetValue(field.SubmissionFieldId, out var values)) continue;

                data[field.FieldKey] = ConvertToObject(ParseDataType(field.DataType), values);
            }

            return data;
        }

        private static object ConvertToObject(SubmissionDataType dataType, TypedFieldValues values)
        {
            if (values == null) return null;

            switch (dataType)
            {
                case SubmissionDataType.String:
                    return Collapse(values.StringValues);

                case SubmissionDataType.LongText:
                    return Collapse(values.LongTextValues);

                case SubmissionDataType.Number:
                    return Collapse(values.NumberValues);

                case SubmissionDataType.Date:
                    return Collapse(values.DateValues);

                case SubmissionDataType.Boolean:
                    return Collapse(values.BooleanValues);

                case SubmissionDataType.Json:
                default:
                    return CollapseJson(values.JsonValues);
            }
        }

        private static object Collapse<T>(IReadOnlyList<T> values)
        {
            if (values == null || values.Count == 0) return null;
            if (values.Count == 1) return values[0];
            return values.ToList();
        }

        private static object CollapseJson(IReadOnlyList<string> jsonValues)
        {
            if (jsonValues == null || jsonValues.Count == 0) return null;
            if (jsonValues.Count == 1)
            {
                var single = jsonValues[0];
                if (single == null) return null;
                if (single.StartsWith("{", StringComparison.Ordinal) || single.StartsWith("[", StringComparison.Ordinal))
                {
                    try { return JToken.Parse(single); }
                    catch { }
                }
                return single;
            }

            // Multiple JSON rows -> JArray
            var arr = new JArray();
            foreach (var v in jsonValues.Where(x => x != null))
            {
                try { arr.Add(JToken.Parse(v)); }
                catch { arr.Add(v); }
            }
            return arr;
        }

        private static SubmissionDataType ParseDataType(string s)
        {
            if (Enum.TryParse<SubmissionDataType>(s, true, out var dt)) return dt;
            return SubmissionDataType.Json;
        }
    }
}
