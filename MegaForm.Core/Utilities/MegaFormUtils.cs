using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using MegaForm.Core.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Utilities
{
    /// <summary>
    /// Utility methods shared across the module.
    /// </summary>
    public static class MegaFormUtils
    {
        public const string PdfFormSubmissionExpandBadge = "PdfFormSubmissionExpand v20260506-08";

        private sealed class PdfFormSubmissionPayload
        {
            [JsonProperty("pdfFile")]
            public PdfFormSubmissionFile PdfFile { get; set; }

            [JsonProperty("values")]
            public Dictionary<string, object> Values { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

            // Old widget (v20260505-xx) wrote "fieldMeta" — small structured list.
            [JsonProperty("fieldMeta")]
            public List<PdfFormSubmissionFieldMeta> FieldMeta { get; set; } = new List<PdfFormSubmissionFieldMeta>();

            // New v6 widget (v20260506-xx) writes "fields" — full layout objects
            // ({id, kind, page, x, y, width, height, ...}). Server treats them
            // as a fall-back source of FieldMeta when FieldMeta is empty.
            [JsonProperty("fields")]
            public List<PdfFormSubmissionFieldMeta> Fields { get; set; } = new List<PdfFormSubmissionFieldMeta>();

            [JsonProperty("font")]
            public string Font { get; set; }
        }

        private sealed class PdfFormSubmissionFile
        {
            [JsonProperty("fileName")]
            public string FileName { get; set; }

            [JsonProperty("fileSize")]
            public long? FileSize { get; set; }

            [JsonProperty("fileUrl")]
            public string FileUrl { get; set; }

            [JsonProperty("tempPath")]
            public string TempPath { get; set; }

            [JsonProperty("storedIn")]
            public string StoredIn { get; set; }

            [JsonProperty("contentType")]
            public string ContentType { get; set; }
        }

        private sealed class PdfFormSubmissionFieldMeta
        {
            [JsonProperty("id")]
            public string Id { get; set; }

            [JsonProperty("name")]
            public string Name { get; set; }

            [JsonProperty("label")]
            public string Label { get; set; }

            [JsonProperty("kind")]
            public string Kind { get; set; }

            [JsonProperty("required")]
            public bool Required { get; set; }

            [JsonProperty("page")]
            public int Page { get; set; }

            [JsonProperty("options")]
            public List<PdfFormSubmissionOption> Options { get; set; } = new List<PdfFormSubmissionOption>();
        }

        private sealed class PdfFormSubmissionOption
        {
            [JsonProperty("label")]
            public string Label { get; set; }

            [JsonProperty("value")]
            public string Value { get; set; }
        }

        /// <summary>
        /// Generate a secure random token (for Save & Continue, webhook secrets, etc.)
        /// </summary>
        public static string GenerateToken(int length = 32)
        {
            using (var rng = new RNGCryptoServiceProvider())
            {
                var bytes = new byte[length];
                rng.GetBytes(bytes);
                return Convert.ToBase64String(bytes)
                    .Replace("+", "")
                    .Replace("/", "")
                    .Replace("=", "")
                    .Substring(0, Math.Min(length, 43));
            }
        }

        /// <summary>
        /// Generate a new HMAC webhook secret.
        /// </summary>
        public static string GenerateWebhookSecret()
        {
            return "whsec_" + GenerateToken(40);
        }

        /// <summary>
        /// Flatten a submission's data JSON + schema into a label/value dictionary.
        /// Useful for email templates, CSV export, PDF generation.
        /// </summary>
        public static List<KeyValuePair<string, string>> FlattenSubmission(FormSchema schema, string dataJson)
        {
            var result = new List<KeyValuePair<string, string>>();
            var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(dataJson)
                       ?? new Dictionary<string, object>();

            if (schema?.Fields == null) return result;

            foreach (var field in schema.Fields.OrderBy(f => f.Order))
            {
                if (field.Type == "Html" || field.Type == "Section")
                    continue;

                string label = field.Label ?? field.Key;
                string value = "";

                if (data.ContainsKey(field.Key))
                {
                    var raw = data[field.Key];
                    if (IsPdfFormField(field) && TryParsePdfFormPayload(raw, out var pdfPayload))
                    {
                        result.AddRange(ExpandPdfFormFlattened(field, pdfPayload));
                        continue;
                    }
                    if (raw is JArray arr)
                        value = string.Join(", ", arr.Select(v => v.ToString()));
                    else
                        value = raw?.ToString() ?? "";

                    // Map option values to labels for select/radio/checkbox
                    if (field.Options != null && field.Options.Count > 0)
                    {
                        var values = value.Split(',').Select(v => v.Trim());
                        var labels = values.Select(v =>
                            field.Options.FirstOrDefault(o => o.Value == v)?.Label ?? v);
                        value = string.Join(", ", labels);
                    }
                }

                result.Add(new KeyValuePair<string, string>(label, value));
            }

            return result;
        }

        /// <summary>
        /// Sanitize HTML content (basic — strip script tags).
        /// For html-type fields and admin templates.
        /// </summary>
        public static string SanitizeHtml(string html)
        {
            if (string.IsNullOrEmpty(html)) return html;

            // Remove script tags
            html = System.Text.RegularExpressions.Regex.Replace(html,
                @"<script[^>]*>[\s\S]*?</script>", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            // Remove event handlers
            html = System.Text.RegularExpressions.Regex.Replace(html,
                @"\son\w+\s*=\s*""[^""]*""", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            html = System.Text.RegularExpressions.Regex.Replace(html,
                @"\son\w+\s*=\s*'[^']*'", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            // Remove javascript: URIs
            html = System.Text.RegularExpressions.Regex.Replace(html,
                @"javascript\s*:", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            return html;
        }

        public static List<SubmissionFieldSnapshot> BuildSubmissionSnapshots(FormSchema schema, IDictionary<string, object> data, bool isLegacyFallback = false)
        {
            var result = new List<SubmissionFieldSnapshot>();
            var fields = FlattenFields(schema != null ? schema.Fields : null);
            if (fields == null || fields.Count == 0) return result;

            foreach (var field in fields.OrderBy(f => f.Order))
            {
                if (field == null) continue;
                if (field.Type == "Html" || field.Type == "Section" || field.Type == "Captcha") continue;

                object raw = null;
                data?.TryGetValue(field.Key ?? string.Empty, out raw);
                if (IsPdfFormField(field) && TryParsePdfFormPayload(raw, out var pdfPayload))
                {
                    result.AddRange(ExpandPdfFormSnapshots(field, pdfPayload, isLegacyFallback));
                    continue;
                }
                string rawValue = ToRawString(raw);
                string displayValue = ToDisplayString(field, raw);

                result.Add(new SubmissionFieldSnapshot
                {
                    FieldKey = field.Key,
                    FieldLabel = string.IsNullOrWhiteSpace(field.Label) ? field.Key : field.Label,
                    FieldType = field.Type,
                    RawValue = rawValue,
                    DisplayValue = displayValue,
                    SortOrder = field.Order,
                    IsLegacyFallback = isLegacyFallback
                });
            }

            return result;
        }

        public static List<SubmissionFieldSnapshot> BuildSubmissionSnapshots(FormSchema schema, string dataJson, bool isLegacyFallback = false)
        {
            Dictionary<string, object> data;
            try
            {
                data = JsonConvert.DeserializeObject<Dictionary<string, object>>(string.IsNullOrWhiteSpace(dataJson) ? "{}" : dataJson)
                    ?? new Dictionary<string, object>();
            }
            catch
            {
                data = new Dictionary<string, object>();
            }

            return BuildSubmissionSnapshots(schema, data, isLegacyFallback);
        }

        private static string ToRawString(object raw)
        {
            if (raw == null) return string.Empty;
            if (raw is JValue jv) return jv.ToString();
            if (raw is JArray ja) return ja.ToString(Formatting.None);
            if (raw is JObject jo) return jo.ToString(Formatting.None);
            return raw.ToString();
        }

        private static bool IsPdfFormField(FormField field)
        {
            return field != null && string.Equals(field.Type, "PdfForm", StringComparison.OrdinalIgnoreCase);
        }

        private static bool TryParsePdfFormPayload(object raw, out PdfFormSubmissionPayload payload)
        {
            payload = null;
            if (raw == null) return false;

            try
            {
                if (raw is JObject rawObject)
                {
                    payload = rawObject.ToObject<PdfFormSubmissionPayload>();
                }
                else if (raw is JValue rawValue && rawValue.Type == JTokenType.String)
                {
                    payload = JsonConvert.DeserializeObject<PdfFormSubmissionPayload>(rawValue.ToString());
                }
                else if (raw is string rawText)
                {
                    if (string.IsNullOrWhiteSpace(rawText) || rawText.TrimStart().FirstOrDefault() != '{')
                        return false;
                    payload = JsonConvert.DeserializeObject<PdfFormSubmissionPayload>(rawText);
                }
                else
                {
                    payload = JsonConvert.DeserializeObject<PdfFormSubmissionPayload>(JsonConvert.SerializeObject(raw));
                }
            }
            catch
            {
                payload = null;
                return false;
            }

            if (payload == null) return false;
            if (payload.Values == null) payload.Values = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            else payload.Values = new Dictionary<string, object>(payload.Values, StringComparer.OrdinalIgnoreCase);
            if (payload.FieldMeta == null) payload.FieldMeta = new List<PdfFormSubmissionFieldMeta>();
            // v6 widget writes "fields" (layout). Promote to FieldMeta if FieldMeta empty.
            if (payload.FieldMeta.Count == 0 && payload.Fields != null && payload.Fields.Count > 0)
            {
                payload.FieldMeta = payload.Fields;
            }
            return payload.PdfFile != null || payload.FieldMeta.Count > 0 || payload.Values.Count > 0;
        }

        private static IEnumerable<KeyValuePair<string, string>> ExpandPdfFormFlattened(FormField field, PdfFormSubmissionPayload payload)
        {
            var expanded = new List<KeyValuePair<string, string>>();
            var baseLabel = string.IsNullOrWhiteSpace(field?.Label) ? field?.Key : field.Label;

            if (payload.PdfFile != null && !string.IsNullOrWhiteSpace(payload.PdfFile.FileName))
            {
                expanded.Add(new KeyValuePair<string, string>((baseLabel ?? "PdfForm") + " PDF", payload.PdfFile.FileName));
            }

            foreach (var snapshot in ExpandPdfFormSnapshots(field, payload, false))
            {
                if (string.Equals(snapshot.FieldType, "File", StringComparison.OrdinalIgnoreCase))
                    continue;
                expanded.Add(new KeyValuePair<string, string>(snapshot.FieldLabel ?? snapshot.FieldKey, snapshot.DisplayValue ?? string.Empty));
            }

            return expanded;
        }

        private static List<SubmissionFieldSnapshot> ExpandPdfFormSnapshots(FormField field, PdfFormSubmissionPayload payload, bool isLegacyFallback)
        {
            var result = new List<SubmissionFieldSnapshot>();
            var baseLabel = string.IsNullOrWhiteSpace(field?.Label) ? field?.Key : field.Label;
            var baseKey = string.IsNullOrWhiteSpace(field?.Key) ? "pdfForm" : field.Key;
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            if (payload.PdfFile != null && !string.IsNullOrWhiteSpace(payload.PdfFile.FileName))
            {
                result.Add(new SubmissionFieldSnapshot
                {
                    FieldKey = baseKey + "__pdf",
                    FieldLabel = (baseLabel ?? baseKey) + " PDF",
                    FieldType = "File",
                    RawValue = JsonConvert.SerializeObject(payload.PdfFile),
                    DisplayValue = payload.PdfFile.FileName ?? string.Empty,
                    SortOrder = field?.Order ?? 0,
                    IsLegacyFallback = isLegacyFallback
                });
            }

            int metaIdx = 0;
            foreach (var meta in payload.FieldMeta ?? new List<PdfFormSubmissionFieldMeta>())
            {
                var kind = (meta?.Kind ?? string.Empty).Trim().ToLowerInvariant();
                if (kind == "label" || kind == "whiteout") { metaIdx++; continue; }

                var stableKey = !string.IsNullOrWhiteSpace(meta?.Name)
                    ? meta.Name.Trim()
                    : (!string.IsNullOrWhiteSpace(meta?.Id) ? meta.Id.Trim() : string.Empty);
                if (string.IsNullOrWhiteSpace(stableKey) || !seen.Add(stableKey)) { metaIdx++; continue; }

                // [SubmissionPdfForm v20260506-08] Friendly label fallback: explicit
                // Label → Name (if non-id) → "PDF Field N (kind)". Avoid raw `fld_xxx`
                // ids leaking to the submission viewer when admin didn't set name/label.
                string label;
                if (!string.IsNullOrWhiteSpace(meta?.Label))
                {
                    label = meta.Label.Trim();
                }
                else if (!string.IsNullOrWhiteSpace(meta?.Name))
                {
                    label = meta.Name.Trim();
                }
                else
                {
                    label = "PDF Field " + (metaIdx + 1)
                          + (string.IsNullOrWhiteSpace(kind) ? string.Empty : " (" + kind + ")");
                }

                var rawValue = ResolvePdfPayloadValue(payload, meta);
                result.Add(new SubmissionFieldSnapshot
                {
                    FieldKey = baseKey + "__" + stableKey,
                    FieldLabel = label,
                    FieldType = MapPdfFieldKindToFieldType(meta?.Kind),
                    RawValue = ToRawString(rawValue),
                    DisplayValue = MapPdfPayloadDisplayValue(meta, rawValue),
                    SortOrder = field?.Order ?? 0,
                    IsLegacyFallback = isLegacyFallback
                });
                metaIdx++;
            }

            return result;
        }

        private static object ResolvePdfPayloadValue(PdfFormSubmissionPayload payload, PdfFormSubmissionFieldMeta meta)
        {
            if (payload?.Values == null || meta == null) return null;

            var keys = new[] { meta.Name, meta.Id }
                .Where(k => !string.IsNullOrWhiteSpace(k))
                .Select(k => k.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase);

            foreach (var key in keys)
            {
                if (payload.Values.TryGetValue(key, out var direct)) return direct;
                var match = payload.Values.Keys.FirstOrDefault(existing => string.Equals(existing, key, StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrWhiteSpace(match) && payload.Values.TryGetValue(match, out var matched)) return matched;
            }

            return null;
        }

        private static string MapPdfFieldKindToFieldType(string kind)
        {
            switch ((kind ?? string.Empty).Trim().ToLowerInvariant())
            {
                case "textarea": return "Textarea";
                case "checkbox": return "Checkbox";
                case "dropdown": return "Select";
                case "radio": return "Radio";
                case "number": return "Number";
                case "date": return "Date";
                default: return "Text";
            }
        }

        private static string MapPdfPayloadDisplayValue(PdfFormSubmissionFieldMeta meta, object rawValue)
        {
            if (rawValue == null) return string.Empty;

            var kind = (meta?.Kind ?? string.Empty).Trim().ToLowerInvariant();
            if (kind == "checkbox")
            {
                return IsTruthyPdfValue(rawValue) ? "Checked" : string.Empty;
            }

            if ((kind == "dropdown" || kind == "radio") && meta?.Options != null && meta.Options.Count > 0)
            {
                var rawText = ToRawString(rawValue);
                var match = meta.Options.FirstOrDefault(option => string.Equals(option?.Value ?? string.Empty, rawText, StringComparison.OrdinalIgnoreCase));
                return !string.IsNullOrWhiteSpace(match?.Label) ? match.Label : rawText;
            }

            if (rawValue is JArray jarr)
            {
                return string.Join(", ", jarr.Select(token => token?.ToString() ?? string.Empty).Where(value => !string.IsNullOrWhiteSpace(value)));
            }

            if (rawValue is IEnumerable<object> enumerable && !(rawValue is string))
            {
                return string.Join(", ", enumerable.Select(item => item?.ToString() ?? string.Empty).Where(value => !string.IsNullOrWhiteSpace(value)));
            }

            return ToRawString(rawValue);
        }

        private static bool IsTruthyPdfValue(object value)
        {
            if (value == null) return false;
            if (value is bool flag) return flag;
            if (value is JValue jv)
            {
                if (jv.Type == JTokenType.Boolean) return jv.Value<bool>();
                value = jv.ToString();
            }

            var text = (value.ToString() ?? string.Empty).Trim().ToLowerInvariant();
            return text == "true" || text == "1" || text == "yes" || text == "on" || text == "checked";
        }

        private static string ToDisplayString(FormField field, object raw)
        {
            if (raw == null) return string.Empty;

            if (raw is JArray jarr)
            {
                var values = jarr.Select(v => v == null ? string.Empty : v.ToString()).ToList();
                return MapOptionLabels(field, values);
            }

            if (raw is IEnumerable<object> rawEnumerable && !(raw is string))
            {
                var values = rawEnumerable.Select(v => v == null ? string.Empty : v.ToString()).ToList();
                return MapOptionLabels(field, values);
            }

            if (raw is JObject jobj)
            {
                return jobj.ToString(Formatting.None);
            }

            return MapOptionLabels(field, new[] { raw.ToString() });
        }

        private static string MapOptionLabels(FormField field, IEnumerable<string> values)
        {
            var list = (values ?? Enumerable.Empty<string>()).Where(v => !string.IsNullOrWhiteSpace(v)).Select(v => v.Trim()).ToList();
            if (list.Count == 0) return string.Empty;

            if (field != null && field.Options != null && field.Options.Count > 0)
            {
                list = list.Select(v => field.Options.FirstOrDefault(o => o.Value == v)?.Label ?? v).ToList();
            }

            return string.Join(", ", list);
        }

        /// <summary>
        /// Build a summary string from submission data (for notifications, search).
        /// </summary>
        public static string BuildSubmissionSummary(FormSchema schema, string dataJson, int maxLength = 200)
        {
            var pairs = FlattenSubmission(schema, dataJson);
            var summary = string.Join("; ", pairs.Where(p => !string.IsNullOrEmpty(p.Value))
                .Select(p => $"{p.Key}: {p.Value}"));

            if (summary.Length > maxLength)
                summary = summary.Substring(0, maxLength) + "...";

            return summary;
        }

        /// <summary>
        /// Merge query-string prefill values into existing data.
        /// </summary>
        public static Dictionary<string, object> MergePrefill(
            Dictionary<string, object> existing,
            Dictionary<string, string> prefill)
        {
            if (prefill == null) return existing ?? new Dictionary<string, object>();
            var merged = existing ?? new Dictionary<string, object>();

            foreach (var kv in prefill)
            {
                if (!merged.ContainsKey(kv.Key))
                    merged[kv.Key] = kv.Value;
            }

            return merged;
        }

        /// <summary>
        /// Validate that the schema JSON is well-formed.
        /// </summary>
        public static (bool IsValid, string Error) ValidateSchemaJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
                return (false, "Schema JSON is empty.");

            try
            {
                var schema = JsonConvert.DeserializeObject<FormSchema>(json);
                if (schema?.Fields == null || schema.Fields.Count == 0)
                    return (false, "Schema must contain at least one field.");

                // Check for duplicate keys
                var keys = schema.Fields.Select(f => f.Key).ToList();
                var dupes = keys.GroupBy(k => k).Where(g => g.Count() > 1).Select(g => g.Key).ToList();
                if (dupes.Count > 0)
                    return (false, $"Duplicate field keys: {string.Join(", ", dupes)}");

                // Check all keys are valid identifiers
                foreach (var key in keys)
                {
                    if (string.IsNullOrWhiteSpace(key) || !System.Text.RegularExpressions.Regex.IsMatch(key, @"^[a-zA-Z_][a-zA-Z0-9_]*$"))
                        return (false, $"Invalid field key: '{key}'. Keys must be alphanumeric with underscores.");
                }

                return (true, null);
            }
            catch (Exception ex)
            {
                return (false, $"Invalid JSON: {ex.Message}");
            }
        }

        /// <summary>
        /// Flatten a field list: extract nested fields from Row columns
        /// so all input fields are returned in a flat list.
        /// Row fields themselves are excluded from the result.
        /// </summary>
        public static List<FormField> FlattenFields(List<FormField> fields)
        {
            var result = new List<FormField>();
            if (fields == null) return result;

            foreach (var f in fields)
            {
                if (f.Type == "Row" && f.Columns != null)
                {
                    foreach (var col in f.Columns)
                    {
                        if (col.Fields != null)
                            result.AddRange(FlattenFields(col.Fields));
                    }
                }
                else
                {
                    result.Add(f);
                }
            }
            return result;
        }
    }
}
