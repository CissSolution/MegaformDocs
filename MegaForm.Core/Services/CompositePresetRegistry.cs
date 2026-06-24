using System;
using System.Collections.Generic;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// [Composite server-validate v20260616] One per-part validation rule for a composite
    /// sub-input. Only the fields that matter for SERVER-side validation are carried.
    /// </summary>
    public sealed class CompositePartRule
    {
        public string Key;
        public string Type;            // text|email|tel|number|date|select|password|textarea|url|country
        public bool Required;
        public int? MinLength;
        public int? MaxLength;
        public string Pattern;         // regex
        public string PatternMessage;
        public string PatternMessageKey;  // [i18n v20260616] optional i18n key localizing PatternMessage
        public string Mask;            // e.g. "###-##-####" — length used for completeness check
        public string MatchKey;        // this part must equal sibling[MatchKey] (confirm email/password)
        public string MatchMessage;
        public string MatchMessageKey;    // [i18n v20260616] optional i18n key localizing MatchMessage
        public bool DateAge;           // compute age from sibling day/month/year
        public int? MinAge;
        public int? MaxAge;
        public double? Min;            // numeric VALUE bound
        public double? Max;
    }

    /// <summary>
    /// Server-side mirror of the per-part VALIDATION rules for the built-in composite presets.
    ///
    /// The AUTHORITATIVE source is the TypeScript registry
    /// <c>MegaForm.UI/src/renderer/helpers.ts → COMPOSITE_PRESETS</c> (+ COMPOSITE_PRESET_META).
    /// This table mirrors ONLY the validation-relevant fields so the server can re-enforce the
    /// rules the client checks (a request that bypasses the JS can post only the combined value).
    ///
    /// When a composite field stores explicit <c>widgetProps.parts</c> (the author customised it
    /// in the Composite Designer), those parts are used instead and this table is not consulted.
    ///
    /// ⚠️ Keep in sync with COMPOSITE_PRESETS when a preset's validation rules change. Presets
    /// with no server-critical per-part rules (name, time, address — address is scheme-based and
    /// its presence is covered by the field-level Required check) are intentionally omitted, which
    /// makes per-part validation a no-op (fail-open) for them.
    /// </summary>
    public static class CompositePresetRegistry
    {
        public static readonly Dictionary<string, List<CompositePartRule>> Presets =
            new Dictionary<string, List<CompositePartRule>>(StringComparer.OrdinalIgnoreCase)
        {
            ["phone"] = new List<CompositePartRule>
            {
                new CompositePartRule { Key = "area", MaxLength = 4 },
            },
            ["ssn"] = new List<CompositePartRule>
            {
                new CompositePartRule { Key = "ssn", Type = "tel", Required = true, MaxLength = 11, Mask = "###-##-####", Pattern = @"^\d{3}-\d{2}-\d{4}$", PatternMessage = "Enter a valid 9-digit SSN", PatternMessageKey = "form.ssn_invalid" },
            },
            ["name_plus"] = new List<CompositePartRule>
            {
                new CompositePartRule { Key = "first", Required = true },
                new CompositePartRule { Key = "last", Required = true },
            },
            ["dob"] = new List<CompositePartRule>
            {
                new CompositePartRule { Key = "year", DateAge = true, MinAge = 0, MaxAge = 120 },
            },
            ["email_confirm"] = new List<CompositePartRule>
            {
                new CompositePartRule { Key = "email", Type = "email", Required = true },
                new CompositePartRule { Key = "email_confirm", Type = "email", Required = true, MatchKey = "email", MatchMessage = "Emails do not match", MatchMessageKey = "form.emails_no_match" },
            },
            ["password_confirm"] = new List<CompositePartRule>
            {
                new CompositePartRule { Key = "password", Required = true },
                new CompositePartRule { Key = "password_confirm", Required = true, MatchKey = "password", MatchMessage = "Passwords do not match", MatchMessageKey = "form.passwords_no_match" },
            },
            // ── New Layout-tab field-group widgets (v20260616) ──
            ["date_range"] = new List<CompositePartRule>
            {
                new CompositePartRule { Key = "start", Type = "date", Required = true },
                new CompositePartRule { Key = "end", Type = "date", Required = true },
            },
            ["money"] = new List<CompositePartRule>
            {
                new CompositePartRule { Key = "amount", Type = "number", Required = true, Min = 0 },
            },
            ["measurement"] = new List<CompositePartRule>
            {
                new CompositePartRule { Key = "amount", Type = "number", Required = true },
            },
            ["price_range"] = new List<CompositePartRule>
            {
                new CompositePartRule { Key = "min", Type = "number", Min = 0 },
                new CompositePartRule { Key = "max", Type = "number", Min = 0 },
            },
            ["full_contact"] = new List<CompositePartRule>
            {
                new CompositePartRule { Key = "name", Required = true },
                new CompositePartRule { Key = "email", Type = "email", Required = true },
            },
        };

        /// <summary>Per-part rules for a preset, or null when the preset has none.</summary>
        public static List<CompositePartRule> GetRules(string preset)
        {
            if (string.IsNullOrEmpty(preset)) return null;
            return Presets.TryGetValue(preset, out var rules) ? rules : null;
        }
    }
}
