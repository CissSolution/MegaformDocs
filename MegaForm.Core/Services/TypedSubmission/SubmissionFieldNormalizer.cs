using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Utilities;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services.TypedSubmission
{
    /// <summary>
    /// Converts submitted form data (Dictionary&lt;string, object&gt;) into platform-agnostic
    /// typed field rows. The host-specific store then persists the decomposed values.
    /// </summary>
    public sealed class SubmissionFieldNormalizer
    {
        /// <summary>
        /// Maps a form field type to the canonical typed storage classification.
        /// </summary>
        public SubmissionDataType ResolveDataType(FormField field)
        {
            if (field == null) return SubmissionDataType.String;
            var t = (field.Type ?? string.Empty).Trim();

            switch (t.ToLowerInvariant())
            {
                case "text":
                case "email":
                case "url":
                case "phone":
                case "phonenumberpro":
                case "phonepro":
                case "select":
                case "radio":
                case "hidden":
                case "password":
                case "color":
                case "colorpicker":
                case "dynamiclabel":
                case "imagechoice":
                case "multicolumncombo":
                    return SubmissionDataType.String;

                case "textarea":
                case "richtext":
                case "signature":
                case "multiselect":
                case "ranking":
                case "usertemplate":
                    return SubmissionDataType.LongText;

                case "number":
                case "currency":
                case "slider":
                case "rating":
                case "opinionscale":
                    return SubmissionDataType.Number;

                case "date":
                case "datetime":
                case "time":
                case "daterange":
                case "appointment":
                    return SubmissionDataType.Date;

                case "checkbox":
                case "switch":
                case "terms":
                    return SubmissionDataType.Boolean;

                case "file":
                case "address":
                case "fullname":
                case "country":
                case "phoneintl":
                case "composite":
                case "razor":
                case "paypal":
                case "stripe":
                case "square":
                case "paymentsummary":
                    return SubmissionDataType.Json;

                default:
                    // Unknown / plugin types: preserve as JSON so no information is lost.
                    return SubmissionDataType.Json;
            }
        }

        /// <summary>
        /// Produces one SubmissionFieldWrite per submitted field, using the schema to
        /// capture metadata snapshots (label, type, order, page) and compute display values.
        /// </summary>
        public IReadOnlyList<SubmissionFieldWrite> Normalize(
            int formId,
            FormSchema schema,
            IDictionary<string, object> data)
        {
            var result = new List<SubmissionFieldWrite>();
            if (schema?.Fields == null) return result;

            var fields = MegaFormUtils.FlattenFields(schema.Fields);
            foreach (var field in fields.OrderBy(f => f.Order))
            {
                if (field == null) continue;
                if (IsNonDataField(field)) continue;

                object raw = null;
                data?.TryGetValue(field.Key ?? string.Empty, out raw);

                var dataType = ResolveDataType(field);
                var displayValue = ComputeDisplayValue(field, raw);

                result.Add(new SubmissionFieldWrite
                {
                    FieldKey = field.Key,
                    FieldId = field.Key, // stable machine key; hosts may replace with a guid if available
                    FieldAlias = field.Key,
                    FieldType = field.Type,
                    DataType = dataType.ToString().ToLowerInvariant(),
                    LabelSnapshot = string.IsNullOrWhiteSpace(field.Label) ? field.Key : field.Label,
                    PageIndex = field.PageIndex > 0 ? field.PageIndex : (int?)null,
                    FieldOrder = field.Order,
                    Value = raw,
                    DisplayValue = displayValue,
                    IsSensitive = IsSensitiveField(field)
                });
            }

            return result;
        }

        /// <summary>
        /// Decomposes a single SubmissionFieldWrite into the typed value lists that the
        /// host store should persist. Multi-value controls produce multiple rows.
        /// </summary>
        public TypedFieldValues ExtractTypedValues(SubmissionFieldWrite write)
        {
            var values = new TypedFieldValues();
            if (write == null) return values;

            var dataType = ParseDataType(write.DataType);
            var parts = SplitRawValue(write.Value);

            switch (dataType)
            {
                case SubmissionDataType.String:
                    foreach (var p in parts.Where(x => x != null))
                        values.StringValues.Add(p);
                    break;

                case SubmissionDataType.LongText:
                    foreach (var p in parts.Where(x => x != null))
                        values.LongTextValues.Add(p);
                    break;

                case SubmissionDataType.Number:
                    foreach (var p in parts)
                    {
                        if (decimal.TryParse(p, NumberStyles.Any, CultureInfo.InvariantCulture, out var d))
                            values.NumberValues.Add(d);
                    }
                    break;

                case SubmissionDataType.Date:
                    foreach (var p in parts)
                    {
                        if (DateTime.TryParse(p, CultureInfo.InvariantCulture,
                            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var dt))
                            values.DateValues.Add(dt);
                    }
                    break;

                case SubmissionDataType.Boolean:
                    foreach (var p in parts)
                        values.BooleanValues.Add(ToBoolean(p));
                    break;

                case SubmissionDataType.Json:
                default:
                    // Store the raw canonical JSON for the field. For multi-value JSON
                    // controls we keep one row per top-level item if it was a collection.
                    var jsonParts = parts.Count > 0 ? parts : new List<string> { "null" };
                    foreach (var p in jsonParts)
                        values.JsonValues.Add(p);
                    break;
            }

            return values;
        }

        private static bool IsNonDataField(FormField field)
        {
            if (field == null) return true;
            var t = (field.Type ?? string.Empty).Trim();
            return string.Equals(t, "Html", StringComparison.OrdinalIgnoreCase)
                || string.Equals(t, "Section", StringComparison.OrdinalIgnoreCase)
                || string.Equals(t, "Captcha", StringComparison.OrdinalIgnoreCase)
                || string.Equals(t, "Row", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsSensitiveField(FormField field)
        {
            if (field == null) return false;
            var t = (field.Type ?? string.Empty).Trim();
            return string.Equals(t, "Password", StringComparison.OrdinalIgnoreCase)
                || string.Equals(t, "Signature", StringComparison.OrdinalIgnoreCase);
        }

        private static SubmissionDataType ParseDataType(string s)
        {
            if (Enum.TryParse<SubmissionDataType>(s, true, out var dt)) return dt;
            return SubmissionDataType.Json;
        }

        private static bool ToBoolean(object raw)
        {
            if (raw == null) return false;
            if (raw is bool b) return b;
            var s = raw.ToString().Trim();
            return string.Equals(s, "true", StringComparison.OrdinalIgnoreCase)
                || string.Equals(s, "on", StringComparison.OrdinalIgnoreCase)
                || string.Equals(s, "yes", StringComparison.OrdinalIgnoreCase)
                || string.Equals(s, "1", StringComparison.OrdinalIgnoreCase);
        }

        private static List<string> SplitRawValue(object raw)
        {
            if (raw == null) return new List<string>();

            // Newtonsoft JTokens
            if (raw is JArray ja)
                return ja.Select(v => v?.ToString()).Where(x => x != null).ToList();

            if (raw is JObject jo)
                return new List<string> { jo.ToString(Formatting.None) };

            if (raw is JValue jv)
                return new List<string> { jv.ToString() };

            // Dictionaries / objects -> serialize as a single JSON blob
            if (raw is System.Collections.IDictionary || raw is JToken)
            {
                try { return new List<string> { JsonConvert.SerializeObject(raw, Formatting.None) }; }
                catch { }
            }

            // Generic dictionaries explicitly
            var rawType = raw.GetType();
            if (rawType.IsGenericType && rawType.GetGenericTypeDefinition() == typeof(Dictionary<,>))
            {
                try { return new List<string> { JsonConvert.SerializeObject(raw, Formatting.None) }; }
                catch { }
            }

            // IEnumerable (but not string or dictionary)
            if (raw is IEnumerable en && !(raw is string))
            {
                var list = new List<string>();
                foreach (var item in en)
                    list.Add(item?.ToString());
                return list.Where(x => x != null).ToList();
            }

            var str = raw.ToString();
            if (string.IsNullOrWhiteSpace(str)) return new List<string>();
            return new List<string> { str };
        }

        private static string ComputeDisplayValue(FormField field, object raw)
        {
            if (raw == null) return string.Empty;

            var parts = SplitRawValue(raw);
            if (parts.Count == 0) return string.Empty;

            // Map option values to labels for select/radio/checkbox.
            if (field?.Options != null && field.Options.Count > 0)
            {
                var labels = parts.Select(v =>
                    field.Options.FirstOrDefault(o => string.Equals(o.Value, v, StringComparison.OrdinalIgnoreCase))?.Label
                    ?? v);
                return string.Join(", ", labels);
            }

            if (parts.Count == 1) return parts[0];
            return string.Join(", ", parts);
        }
    }
}
