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
            // Canonicalize aliases first (FileUpload -> File, DateTimePicker -> Date) so a
            // field never falls through to the JSON default just because of its spelling.
            var t = SubmissionFieldTypeSemantics.Canonicalize(field.Type);

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
                    // A "Checkbox" WITH options is a multi-select checkbox GROUP — its value is
                    // an array of selected option values (e.g. ["analytics","security"]), which must
                    // be stored as (multi-value) strings, NOT coerced through ToBoolean (that would
                    // turn every selected value into `false` and lose the data). A "Checkbox" with no
                    // options is a single boolean toggle → Boolean.
                    return (field.Options != null && field.Options.Count > 0)
                        ? SubmissionDataType.String
                        : SubmissionDataType.Boolean;

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

                // Display-only widgets (DataRepeater, QRCode) render output but submit no
                // value. When they carry nothing, skip them so typed storage isn't polluted
                // with empty field / "null" JSON rows. Guarded on raw == null so we never
                // silently drop data if a widget's collect() contract ever changes.
                if (raw == null && SubmissionFieldTypeSemantics.IsDisplayOnly(field.Type)) continue;

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
                        else if (!string.IsNullOrWhiteSpace(p))
                            // Lossless fallback: an unparseable numeric value must NEVER be dropped,
                            // otherwise the reconstructed dictionary loses it once DataJson is off.
                            values.StringValues.Add(p);
                    }
                    break;

                case SubmissionDataType.Date:
                    foreach (var p in parts)
                    {
                        if (DateTime.TryParse(p, CultureInfo.InvariantCulture,
                            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var dt))
                            values.DateValues.Add(dt);
                        else if (!string.IsNullOrWhiteSpace(p))
                            // Lossless fallback (see Number above).
                            values.StringValues.Add(p);
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
                    // An EMPTY value writes no row (symmetric with the scalar branches): a
                    // literal "null" row would reconstruct to the string "null" and show as
                    // garbage in dashboards.
                    foreach (var p in parts.Where(x => x != null))
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

            // IEnumerable (but not string or dictionary): one part per item. Complex items
            // (repeater/grid rows arriving as CLR List<Dictionary>/POCOs — e.g. when Submit
            // deserializes a JSON array into CLR types) MUST be serialized as JSON, never
            // item.ToString() — that yields "System.Collections.Generic.Dictionary`2..." and
            // destroys the shape. Primitives keep their invariant string form (checkbox
            // groups, multi-selects).
            if (raw is IEnumerable en && !(raw is string))
            {
                var list = new List<string>();
                foreach (var item in en)
                    list.Add(StringifyItem(item));
                return list.Where(x => x != null).ToList();
            }

            var str = raw.ToString();
            if (string.IsNullOrWhiteSpace(str)) return new List<string>();
            return new List<string> { str };
        }

        // Renders one enumerated value: primitives -> invariant string; complex objects ->
        // compact JSON (so repeater/grid rows survive round-trip). See SplitRawValue.
        private static string StringifyItem(object item)
        {
            if (item == null) return null;
            if (item is string s) return s;
            if (item is JToken jt) return jt.ToString(Formatting.None);

            var type = item.GetType();
            if (type.IsPrimitive || type.IsEnum
                || item is decimal || item is DateTime || item is DateTimeOffset || item is Guid)
                return Convert.ToString(item, CultureInfo.InvariantCulture);

            try { return JsonConvert.SerializeObject(item, Formatting.None); }
            catch { return item.ToString(); }
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
