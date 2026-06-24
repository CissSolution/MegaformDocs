using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Mail;
using System.Text.RegularExpressions;
using MegaForm.Core.Models;
using MegaForm.Core.Utilities;
using MegaForm.Core.i18n;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Server-side validation of form submissions against the form schema.
    /// Mirrors what the client-side should also enforce.
    /// </summary>
    public static class FormValidationService
    {
        // [i18n whole-validator v20260616] Optional localization provider. When supplied (and it is
        // a REAL platform/translated provider — not the inline English default), every validation
        // message is localized via the same i18n keys the client renderer uses (form.required_field,
        // form.invalid_email, form.min_value, form.incomplete, …). When loc is null or the inline
        // DefaultLocalizationProvider, the English fallback passed at each call site is returned
        // VERBATIM, so English output is byte-identical to before this change (zero regression).
        public static ValidationResult Validate(FormSchema schema, Dictionary<string, object> data, ILocalizationProvider loc = null)
        {
            var result = new ValidationResult();

            if (schema?.Fields == null)
            {
                result.Errors.Add("_form", "Invalid form schema");
                return result;
            }

            // Flatten fields: include nested fields inside Row columns
            var allFields = MegaFormUtils.FlattenFields(schema.Fields);

            foreach (var field in allFields)
            {
                // Skip non-input fields
                if (field.Type == "Html" || field.Type == "Section" || field.Type == "UniqueId" || field.Type == "Row")
                    continue;

                // Check if field should be visible (basic conditional logic server-side)
                if (field.ShowIf != null && !EvaluateShowIf(field.ShowIf, data))
                    continue;  // field is hidden, skip validation

                string value = null;
                if (data.ContainsKey(field.Key) && data[field.Key] != null)
                {
                    var raw = data[field.Key];
                    // Handle JArray (from JSON deserialization of checkbox arrays)
                    if (raw is Newtonsoft.Json.Linq.JArray jArr)
                    {
                        value = string.Join(",", jArr.Select(j => j.ToString().Trim()));
                    }
                    else if (raw is System.Collections.IEnumerable enumerable && !(raw is string))
                    {
                        var items = new System.Collections.Generic.List<string>();
                        foreach (var item in enumerable) items.Add(item?.ToString()?.Trim() ?? "");
                        value = string.Join(",", items);
                    }
                    else
                    {
                        value = raw.ToString().Trim();
                    }
                }
                bool isEmpty = string.IsNullOrWhiteSpace(value);

                // Required check
                if (field.Required && isEmpty)
                {
                    string reqLabel = field.Label ?? field.Key;
                    result.Errors.Add(field.Key, Loc(loc, "form.field_required", $"{reqLabel} is required.", new { field = reqLabel }));
                    continue;
                }

                if (isEmpty) continue;  // optional & empty, nothing more to check

                // Type-specific validation
                switch (field.Type)
                {
                    case "Email":
                        if (!IsValidEmail(value))
                            result.Errors.Add(field.Key, Loc(loc, "form.invalid_email", "Please enter a valid email address."));
                        break;

                    case "Number":
                        if (!double.TryParse(value, out double numVal))
                        {
                            result.Errors.Add(field.Key, Loc(loc, "form.invalid_number", "Please enter a valid number."));
                        }
                        else
                        {
                            if (field.Validation?.Min.HasValue == true && numVal < field.Validation.Min.Value)
                                result.Errors.Add(field.Key, Loc(loc, "form.min_value", $"Minimum value is {field.Validation.Min.Value}.", new { min = field.Validation.Min.Value, n = field.Validation.Min.Value }));
                            if (field.Validation?.Max.HasValue == true && numVal > field.Validation.Max.Value)
                                result.Errors.Add(field.Key, Loc(loc, "form.max_value", $"Maximum value is {field.Validation.Max.Value}.", new { max = field.Validation.Max.Value, n = field.Validation.Max.Value }));
                        }
                        break;

                    case "Date":
                        if (!DateTime.TryParse(value, out _))
                            result.Errors.Add(field.Key, Loc(loc, "form.invalid_date", "Please enter a valid date."));
                        break;

                    case "Url":
                        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
                            (uri.Scheme != "http" && uri.Scheme != "https"))
                            result.Errors.Add(field.Key, Loc(loc, "form.invalid_url", "Please enter a valid URL."));
                        break;

                    case "Phone":
                        if (!Regex.IsMatch(value, @"^[\d\s\-\+\(\)\.]{7,20}$"))
                            result.Errors.Add(field.Key, Loc(loc, "form.invalid_phone", "Please enter a valid phone number."));
                        break;

                    case "Select":
                    case "Radio":
                        // Skip strict option-match when the field's options are populated from a SQL/sproc source
                        // (FieldOptionsService v20260516-02). The static `field.Options` list only contains the
                        // placeholder, so any real SQL-derived value would falsely fail. The SQL execution itself
                        // bounds the value space; downstream INSERT/sproc enforces actual referential integrity.
                        if (!IsDynamicOptionsField(field) && field.Options != null && field.Options.Count > 0)
                        {
                            if (!field.Options.Any(o => o.Value == value))
                                result.Errors.Add(field.Key, Loc(loc, "form.invalid_option", "Please select a valid option."));
                        }
                        break;

                    case "Checkbox":
                        // [CheckboxValidate v20260502-04] Two adjustments:
                        //   1. Skip strict option-value match for SINGLE-option
                        //      checkboxes (Terms, agree, opt-in style). They
                        //      are boolean acknowledgements — the Required
                        //      check above already enforces the user ticked
                        //      the box. Strict match was rejecting valid
                        //      submissions when the option's stored Value
                        //      diverged from what the renderer emitted (e.g.
                        //      legacy schemas with empty/different value).
                        //   2. For multi-option checkbox groups, accept match
                        //      against EITHER Value OR Label (case-insensitive)
                        //      so older schemas that stored only Label still
                        //      validate correctly.
                        if (!IsDynamicOptionsField(field) && field.Options != null && field.Options.Count > 1)
                        {
                            var selectedValues = value.Split(',').Select(v => v.Trim()).Where(v => !string.IsNullOrEmpty(v));
                            foreach (var sv in selectedValues)
                            {
                                if (!field.Options.Any(o =>
                                        string.Equals(o.Value, sv, StringComparison.OrdinalIgnoreCase) ||
                                        string.Equals(o.Label, sv, StringComparison.OrdinalIgnoreCase)))
                                {
                                    result.Errors.Add(field.Key, Loc(loc, "form.invalid_option_selected", "Invalid option selected."));
                                    break;
                                }
                            }
                        }
                        break;

                    case "Captcha":
                        if (!string.Equals(value, "__captcha_verified__", StringComparison.Ordinal))
                            result.Errors.Add(field.Key, Loc(loc, "form.captcha_incomplete", "Please complete the CAPTCHA verification."));
                        break;

                    case "Composite":
                        // [Composite server-validate v20260616] Re-enforce per-part rules
                        // (required/mask/pattern/matchKey/dateAge/min/max) using the raw parts
                        // the client sends in __mf_parts. The combined hidden value alone can't
                        // express these, so a request bypassing the JS could otherwise skip them.
                        // Fail-OPEN: any exception is swallowed so a bug never blocks a legit submit.
                        try { ValidateComposite(field, data, result, loc); } catch { }
                        // [Unify v2 2026-06-18] The scalar-preset composites (email/url/number) carry
                        // their format contract on the COMBINED value. Validate it here so a raw/SDK
                        // POST (no __mf_parts, where ValidateComposite no-ops) still gets the SAME
                        // format check the native Email/Number/Url types enforced before unification.
                        // `value` is the combined scalar == the field value.
                        if (!result.Errors.ContainsKey(field.Key))
                        {
                            string cPreset = null;
                            if (field.WidgetProps != null && field.WidgetProps.TryGetValue("preset", out var prRaw) && prRaw != null)
                                cPreset = prRaw.ToString();
                            if (cPreset == "email")
                            {
                                if (!IsValidEmail(value))
                                    result.Errors.Add(field.Key, Loc(loc, "form.invalid_email", "Please enter a valid email address."));
                            }
                            else if (cPreset == "url")
                            {
                                if (!Uri.TryCreate(value, UriKind.Absolute, out var cUri) || (cUri.Scheme != "http" && cUri.Scheme != "https"))
                                    result.Errors.Add(field.Key, Loc(loc, "form.invalid_url", "Please enter a valid URL."));
                            }
                            else if (cPreset == "number")
                            {
                                if (!double.TryParse(value, out double cNum))
                                    result.Errors.Add(field.Key, Loc(loc, "form.invalid_number", "Please enter a valid number."));
                                else if (field.Validation?.Min.HasValue == true && cNum < field.Validation.Min.Value)
                                    result.Errors.Add(field.Key, Loc(loc, "form.min_value", $"Minimum value is {field.Validation.Min.Value}.", new { min = field.Validation.Min.Value, n = field.Validation.Min.Value }));
                                else if (field.Validation?.Max.HasValue == true && cNum > field.Validation.Max.Value)
                                    result.Errors.Add(field.Key, Loc(loc, "form.max_value", $"Maximum value is {field.Validation.Max.Value}.", new { max = field.Validation.Max.Value, n = field.Validation.Max.Value }));
                            }
                        }
                        break;
                }

                // Generic validation rules
                if (field.Validation != null && !result.Errors.ContainsKey(field.Key))
                {
                    if (field.Validation.MinLength.HasValue && value.Length < field.Validation.MinLength.Value)
                        result.Errors.Add(field.Key, field.Validation.CustomMessage ?? Loc(loc, "form.min_length", $"Minimum length is {field.Validation.MinLength.Value} characters.", new { min = field.Validation.MinLength.Value, n = field.Validation.MinLength.Value }));

                    if (field.Validation.MaxLength.HasValue && value.Length > field.Validation.MaxLength.Value)
                        result.Errors.Add(field.Key, field.Validation.CustomMessage ?? Loc(loc, "form.max_length", $"Maximum length is {field.Validation.MaxLength.Value} characters.", new { max = field.Validation.MaxLength.Value, n = field.Validation.MaxLength.Value }));

                    if (!string.IsNullOrEmpty(field.Validation.Pattern))
                    {
                        try
                        {
                            if (!Regex.IsMatch(value, field.Validation.Pattern))
                                result.Errors.Add(field.Key, field.Validation.PatternMessage ?? field.Validation.CustomMessage ?? Loc(loc, "form.invalid_format", "Invalid format."));
                        }
                        catch { /* invalid regex pattern, skip */ }
                    }
                }
            }

            return result;
        }

        // ── [i18n whole-validator v20260616] fail-soft localization helpers ──────────────
        /// <summary>
        /// Resolve a validation message: returns the localized string for <paramref name="key"/>
        /// when a REAL translated provider is supplied, otherwise the verbatim English
        /// <paramref name="englishFallback"/>. Fail-soft: never throws.
        ///
        /// The inline <see cref="DefaultLocalizationProvider"/> (en-US) is short-circuited to the
        /// English fallback so that English output stays byte-identical to the pre-i18n behaviour
        /// (the per-call fallback IS the original hardcoded string). Only a platform/translated
        /// provider — or one that returns a non-key string for the key — overrides it.
        /// </summary>
        private static string Loc(ILocalizationProvider loc, string key, string englishFallback, object args = null)
        {
            if (loc == null || loc is DefaultLocalizationProvider || string.IsNullOrEmpty(key))
                return englishFallback;
            try
            {
                var s = loc.L(key, args);
                if (!string.IsNullOrEmpty(s) && !string.Equals(s, key, StringComparison.Ordinal))
                    return s;
            }
            catch { /* provider misbehaved → English fallback */ }
            return englishFallback;
        }

        /// <summary>
        /// An author/preset-supplied per-part message, optionally localized by its key. Returns null
        /// when no message is set so callers can fall through to a generic key
        /// (e.g. <c>PartMsg(...) ?? Loc(loc, "form.match", "does not match")</c>).
        /// </summary>
        private static string PartMsg(ILocalizationProvider loc, string key, string message)
            => string.IsNullOrEmpty(message) ? null : Loc(loc, key, message);

        /// <summary>
        /// True when the field's option list is populated dynamically (SQL/sproc/etc.)
        /// rather than from the static schema list. In that case the static Options array
        /// only carries a placeholder, so strict value-membership checks would always fail.
        /// Mirrors the renderer's check on properties.optionsSource === 'sql'.
        /// </summary>
        private static bool IsDynamicOptionsField(FormField field)
        {
            if (field?.Properties == null || field.Properties.Count == 0) return false;
            if (!field.Properties.TryGetValue("optionsSource", out var raw) || raw == null) return false;
            return string.Equals(Convert.ToString(raw), "sql", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Evaluate ShowIf conditions server-side.
        /// Returns true if the field SHOULD be shown.
        /// </summary>
        public static bool EvaluateShowIf(ShowIfCondition showIf, Dictionary<string, object> data)
        {
            if (showIf?.Rules == null || showIf.Rules.Count == 0)
                return true;

            bool isAnd = showIf.Operator == LogicOperator.And;
            bool result = isAnd;  // AND starts true, OR starts false

            foreach (var rule in showIf.Rules)
            {
                bool ruleResult = EvaluateRule(rule, data);

                if (isAnd)
                    result = result && ruleResult;
                else
                    result = result || ruleResult;
            }

            return result;
        }

        private static bool EvaluateRule(ShowIfRule rule, Dictionary<string, object> data)
        {
            string fieldValue = data.ContainsKey(rule.Field) ? data[rule.Field]?.ToString() ?? "" : "";
            string compareValue = rule.Value ?? "";

            switch (rule.Condition)
            {
                case ConditionType.Equals:
                    return string.Equals(fieldValue, compareValue, StringComparison.OrdinalIgnoreCase);

                case ConditionType.NotEquals:
                    return !string.Equals(fieldValue, compareValue, StringComparison.OrdinalIgnoreCase);

                case ConditionType.Contains:
                    return fieldValue.IndexOf(compareValue, StringComparison.OrdinalIgnoreCase) >= 0;

                case ConditionType.NotContains:
                    return fieldValue.IndexOf(compareValue, StringComparison.OrdinalIgnoreCase) < 0;

                case ConditionType.GreaterThan:
                    return double.TryParse(fieldValue, out var a) && double.TryParse(compareValue, out var b) && a > b;

                case ConditionType.LessThan:
                    return double.TryParse(fieldValue, out var c) && double.TryParse(compareValue, out var d) && c < d;

                case ConditionType.IsEmpty:
                    return string.IsNullOrWhiteSpace(fieldValue);

                case ConditionType.IsNotEmpty:
                    return !string.IsNullOrWhiteSpace(fieldValue);

                case ConditionType.StartsWith:
                    return fieldValue.StartsWith(compareValue, StringComparison.OrdinalIgnoreCase);

                case ConditionType.EndsWith:
                    return fieldValue.EndsWith(compareValue, StringComparison.OrdinalIgnoreCase);

                default:
                    return true;
            }
        }

        private static bool IsValidEmail(string email)
        {
            try
            {
                var addr = new MailAddress(email);
                return addr.Address == email;
            }
            catch { return false; }
        }

        // ── [Composite server-validate v20260616] ───────────────────────────────────────
        // Validate a Composite field's per-part rules against the raw parts the client sent in
        // data["__mf_parts"][field.Key]. Mirrors renderer/validation.ts (the composite branch):
        // required → length → email/number → mask → pattern → matchKey → dateAge. First failing
        // part wins the field-level error. Fail-OPEN: if parts/rules are missing we skip silently.
        private static void ValidateComposite(FormField field, Dictionary<string, object> data, ValidationResult result, ILocalizationProvider loc = null)
        {
            if (field == null || result.Errors.ContainsKey(field.Key)) return;

            var parts = ExtractRawParts(data, field.Key);
            if (parts == null || parts.Count == 0) return;        // nothing to check

            var rules = ResolveCompositeRules(field);
            if (rules == null || rules.Count == 0) return;        // preset has no server-critical rules

            foreach (var rule in rules)
            {
                if (rule == null || string.IsNullOrEmpty(rule.Key)) continue;
                string pv = parts.TryGetValue(rule.Key, out var v) ? (v ?? "") : "";
                string lbl = HumanizePartKey(rule.Key);
                string err = null;

                // [i18n v20260616] Part-level messages share the SAME i18n keys as the client
                // composite branch (validation.ts) so one translation covers both layers. English
                // output is unchanged (Loc returns the verbatim fallback under the default provider).
                if (rule.Required && string.IsNullOrWhiteSpace(pv))
                {
                    err = Loc(loc, "form.required_field", "is required");
                }
                else if (!string.IsNullOrWhiteSpace(pv))
                {
                    if (rule.MinLength.HasValue && pv.Length < rule.MinLength.Value) err = Loc(loc, "form.min_length", $"minimum {rule.MinLength.Value} characters", new { min = rule.MinLength.Value, n = rule.MinLength.Value });
                    else if (rule.MaxLength.HasValue && pv.Length > rule.MaxLength.Value) err = Loc(loc, "form.max_length", $"maximum {rule.MaxLength.Value} characters", new { max = rule.MaxLength.Value, n = rule.MaxLength.Value });
                    else if (rule.Type == "email" && !IsValidEmail(pv)) err = Loc(loc, "form.invalid_email", "invalid email address");
                    else if (rule.Type == "number" || rule.Min.HasValue || rule.Max.HasValue)
                    {
                        if (!double.TryParse(pv, out var num)) err = Loc(loc, "form.invalid_number", "must be a number");
                        else if (rule.Min.HasValue && num < rule.Min.Value) err = Loc(loc, "form.min_value", $"minimum {rule.Min.Value}", new { min = rule.Min.Value, n = rule.Min.Value });
                        else if (rule.Max.HasValue && num > rule.Max.Value) err = Loc(loc, "form.max_value", $"maximum {rule.Max.Value}", new { max = rule.Max.Value, n = rule.Max.Value });
                    }
                    else if (!string.IsNullOrEmpty(rule.Mask) && pv.Length < rule.Mask.Length)
                    {
                        err = PartMsg(loc, rule.PatternMessageKey, rule.PatternMessage) ?? Loc(loc, "form.incomplete", "incomplete");
                    }
                    else if (!string.IsNullOrEmpty(rule.Pattern))
                    {
                        try { if (!Regex.IsMatch(pv, rule.Pattern)) err = PartMsg(loc, rule.PatternMessageKey, rule.PatternMessage) ?? Loc(loc, "form.invalid_format", "invalid format"); }
                        catch { /* bad regex, skip */ }
                    }
                }

                // Cross-part match (Confirm Email / Confirm Password). Runs even when pv empty so a
                // required confirm reports "is required" first (handled above), else the mismatch.
                if (err == null && !string.IsNullOrEmpty(rule.MatchKey))
                {
                    string other = parts.TryGetValue(rule.MatchKey, out var ov) ? (ov ?? "") : "";
                    if (!string.Equals(pv, other, StringComparison.Ordinal))
                        err = PartMsg(loc, rule.MatchMessageKey, rule.MatchMessage) ?? Loc(loc, "form.match", "does not match");
                }

                // DOB age (uses sibling day/month/year).
                if (err == null && rule.DateAge)
                {
                    int age = CalculateAge(
                        parts.TryGetValue("day", out var d) ? d : "",
                        parts.TryGetValue("month", out var m) ? m : "",
                        parts.TryGetValue("year", out var y) ? y : "");
                    if (age >= 0)
                    {
                        if (rule.MinAge.HasValue && age < rule.MinAge.Value) err = Loc(loc, "form.min_age", $"must be at least {rule.MinAge.Value} years old", new { n = rule.MinAge.Value, min = rule.MinAge.Value });
                        else if (rule.MaxAge.HasValue && age > rule.MaxAge.Value) err = Loc(loc, "form.max_age", $"must be at most {rule.MaxAge.Value} years old", new { n = rule.MaxAge.Value, max = rule.MaxAge.Value });
                    }
                }

                if (err != null)
                {
                    result.Errors[field.Key] = (lbl != null ? lbl + ": " : "") + err + ".";
                    return;   // first failing part wins
                }
            }
        }

        /// <summary>Read data["__mf_parts"][fieldKey] into a flat partKey→value map (or null).</summary>
        private static Dictionary<string, string> ExtractRawParts(Dictionary<string, object> data, string fieldKey)
        {
            if (data == null || !data.TryGetValue("__mf_parts", out var mpRaw) || mpRaw == null) return null;
            Newtonsoft.Json.Linq.JObject mp = mpRaw as Newtonsoft.Json.Linq.JObject;
            if (mp == null)
            {
                try { mp = Newtonsoft.Json.Linq.JObject.FromObject(mpRaw); } catch { return null; }
            }
            var fieldTok = mp[fieldKey] as Newtonsoft.Json.Linq.JObject;
            if (fieldTok == null) return null;
            var outDict = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var kv in fieldTok)
                outDict[kv.Key] = kv.Value?.ToString() ?? "";
            return outDict;
        }

        /// <summary>
        /// Resolve a composite field's per-part rules: author's explicit widgetProps.parts take
        /// precedence, otherwise the built-in CompositePresetRegistry by preset key.
        /// </summary>
        private static List<CompositePartRule> ResolveCompositeRules(FormField field)
        {
            var wp = field?.WidgetProps;
            if (wp != null && wp.TryGetValue("parts", out var partsRaw) && partsRaw != null)
            {
                var arr = partsRaw as Newtonsoft.Json.Linq.JArray;
                if (arr == null) { try { arr = Newtonsoft.Json.Linq.JArray.FromObject(partsRaw); } catch { arr = null; } }
                if (arr != null && arr.Count > 0)
                {
                    var list = new List<CompositePartRule>();
                    foreach (var pt in arr)
                    {
                        if (!(pt is Newtonsoft.Json.Linq.JObject o)) continue;
                        if ((bool?)o["hidden"] == true) continue;
                        list.Add(new CompositePartRule
                        {
                            Key = (string)o["key"],
                            Type = (string)o["type"],
                            Required = (bool?)o["required"] ?? false,
                            MinLength = (int?)o["minLength"],
                            MaxLength = (int?)o["maxLength"],
                            Pattern = (string)o["pattern"],
                            PatternMessage = (string)o["patternMsg"],
                            Mask = (string)o["mask"],
                            MatchKey = (string)o["matchKey"],
                            MatchMessage = (string)o["matchMsg"],
                            DateAge = (bool?)o["dateAge"] ?? false,
                            MinAge = (int?)o["minAge"],
                            MaxAge = (int?)o["maxAge"],
                            Min = (double?)o["min"],
                            Max = (double?)o["max"],
                        });
                    }
                    if (list.Count > 0) return list;
                }
            }
            string preset = null;
            if (wp != null && wp.TryGetValue("preset", out var pr) && pr != null) preset = pr.ToString();
            return CompositePresetRegistry.GetRules(preset);
        }

        private static string HumanizePartKey(string key)
        {
            if (string.IsNullOrEmpty(key)) return "Field";
            var s = key.Replace('_', ' ').Replace('-', ' ');
            return char.ToUpperInvariant(s[0]) + (s.Length > 1 ? s.Substring(1) : "");
        }

        /// <summary>Age in whole years from day/month/year strings, or -1 when invalid.</summary>
        private static int CalculateAge(string day, string month, string year)
        {
            if (!int.TryParse(day, out var d) || !int.TryParse(month, out var m) || !int.TryParse(year, out var y)) return -1;
            if (d <= 0 || m <= 0 || y <= 0) return -1;
            var today = DateTime.UtcNow;
            int age = today.Year - y;
            if (m > today.Month || (m == today.Month && d > today.Day)) age--;
            return age < 0 ? -1 : age;
        }
    }

    public class ValidationResult
    {
        public Dictionary<string, string> Errors { get; set; } = new Dictionary<string, string>();
        public bool IsValid => Errors.Count == 0;
    }
}
