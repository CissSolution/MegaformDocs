using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services.AiAssistant
{
    /// <summary>Result of <see cref="DesignPreservationGate.Inspect"/>.</summary>
    public sealed class DesignGateResult
    {
        /// <summary>True when the save is safe (no protected design field is being blanked).</summary>
        public bool Ok { get; set; }
        /// <summary>The design field names that would be wiped (empty when Ok).</summary>
        public List<string> Violations { get; set; }
        /// <summary>Human-readable rejection message (null when Ok).</summary>
        public string Message { get; set; }

        public DesignGateResult() { Ok = true; Violations = new List<string>(); }
    }

    /// <summary>
    /// [P1-4] SERVER-SIDE design-preservation gate. The client has guards
    /// (ASK-DESIGN + scrubPreserveDesign in ops.ts) but a raw op / direct POST
    /// to the save endpoint bypasses every one of them — so the persist path
    /// must re-check on the server (the source of truth).
    ///
    /// Rule: when an UPDATE save (existing form) would turn a previously
    /// non-empty custom-design field (customHtml / customCss / customScripts /
    /// theme / themeCssOverrides) into empty/missing, REJECT — unless the
    /// caller passes an explicit, audited <c>allowDesignReset=true</c>.
    ///
    /// Only BLANKING is blocked. Changing a design field to a different
    /// non-empty value is always allowed (that's a normal edit), and creating
    /// a brand-new form (no existing schema) is always allowed. Design edits in
    /// the builder flow through the dedicated SaveTheme endpoint, so the main
    /// save path blanking design is, by construction, suspect.
    ///
    /// Design fields live under <c>schema.settings.&lt;field&gt;</c> (camel from
    /// the JS builder or Pascal from C#); a couple are mirrored at the schema
    /// root. We treat a field as "present" if EITHER location holds a non-empty
    /// value, so a save can't sneak a wipe past us by clearing only one copy.
    /// </summary>
    /// <summary>Lightweight contract parsed from a template guide markdown frontmatter.</summary>
    public sealed class TemplateGuideContract
    {
        public string TemplateGuideSlug { get; set; }
        public List<string> ImmutableRules { get; set; } = new List<string>();
        public FieldLayoutMap FieldLayoutMap { get; set; }
        public CompositeWidgetPolicy CompositeWidgetPolicy { get; set; }
    }

    public sealed class FieldLayoutMap
    {
        public string DefaultAppendPanel { get; set; }
        public List<string> LockedKeys { get; set; } = new List<string>();
        public List<string> RequiredKeys { get; set; } = new List<string>();
    }

    public sealed class CompositeWidgetPolicy
    {
        public List<string> ForbiddenFieldTypes { get; set; } = new List<string>();
    }

    public static class DesignPreservationGate
    {
        private static readonly string[] Fields =
            { "customHtml", "customCss", "customScripts", "theme", "themeCssOverrides" };

        public static DesignGateResult Inspect(string existingSchemaJson, string incomingSchemaJson, bool allowDesignReset)
            => Inspect(existingSchemaJson, incomingSchemaJson, allowDesignReset, guideMarkdown: null);

        public static DesignGateResult Inspect(string existingSchemaJson, string incomingSchemaJson, bool allowDesignReset, string guideMarkdown)
        {
            var r = new DesignGateResult();
            if (allowDesignReset) return r;                              // explicit, audited override
            if (string.IsNullOrWhiteSpace(existingSchemaJson)) return r; // create / nothing to protect

            JObject existing = TryParse(existingSchemaJson);
            if (existing == null) return r;                             // can't read prior design → don't block
            JObject incoming = TryParse(incomingSchemaJson) ?? new JObject();

            foreach (var f in Fields)
            {
                bool hadDesign = IsNonEmpty(GetField(existing, f));
                bool stillHas  = IsNonEmpty(GetField(incoming, f));
                if (hadDesign && !stillHas) r.Violations.Add(f);
            }

            TemplateGuideContract guide = null;
            if (!string.IsNullOrWhiteSpace(guideMarkdown))
                guide = TryParseGuide(guideMarkdown);

            if (guide != null)
            {
                CheckGuideDesignMutations(r, guide, existing, incoming);
                CheckGuideLockedKeys(r, guide, existing, incoming);
                CheckGuideForbiddenTypes(r, guide, incoming);
            }

            if (r.Violations.Count > 0)
            {
                r.Ok = false;
                r.Message = "Refusing to save: this would violate the template design contract for field(s) [" +
                            string.Join(", ", r.Violations.Distinct()) +
                            "]. If overriding the template guide is intentional, resend with allowDesignReset=true.";
            }
            return r;
        }

        private static void CheckGuideDesignMutations(DesignGateResult r, TemplateGuideContract guide, JObject existing, JObject incoming)
        {
            var text = string.Join(" ", guide.ImmutableRules ?? new List<string>()).ToLowerInvariant();
            if (text.Contains("customhtml") || text.Contains("custom html"))
                AddIfChanged(r, "customHtml", existing, incoming);
            if (text.Contains("customcss") || text.Contains("custom css"))
                AddIfChanged(r, "customCss", existing, incoming);
            if (text.Contains("theme"))
                AddIfChanged(r, "theme", existing, incoming);
            if (text.Contains("customscripts") || text.Contains("custom scripts"))
                AddIfChanged(r, "customScripts", existing, incoming);
        }

        private static void AddIfChanged(DesignGateResult r, string field, JObject existing, JObject incoming)
        {
            var before = GetField(existing, field);
            var after = GetField(incoming, field);
            if (!IsNonEmpty(before)) return; // nothing to protect
            var beforeStr = before.Type == JTokenType.String ? (string)before : before?.ToString();
            var afterStr = after?.Type == JTokenType.String ? (string)after : after?.ToString();
            if (!string.Equals(Normalize(beforeStr), Normalize(afterStr), StringComparison.OrdinalIgnoreCase))
                r.Violations.Add(field);
        }

        private static string Normalize(string s) => s == null ? string.Empty : s.Trim().Replace("\r\n", "\n").Replace("\r", "\n");

        private static void CheckGuideLockedKeys(DesignGateResult r, TemplateGuideContract guide, JObject existing, JObject incoming)
        {
            var locked = new List<string>();
            if (guide.FieldLayoutMap?.LockedKeys != null) locked.AddRange(guide.FieldLayoutMap.LockedKeys);
            if (guide.FieldLayoutMap?.RequiredKeys != null) locked.AddRange(guide.FieldLayoutMap.RequiredKeys);
            if (!locked.Any()) return;

            var existingKeys = new HashSet<string>(GetFieldKeys(existing), StringComparer.OrdinalIgnoreCase);
            var incomingKeys = new HashSet<string>(GetFieldKeys(incoming), StringComparer.OrdinalIgnoreCase);
            foreach (var key in locked.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                if (existingKeys.Contains(key) && !incomingKeys.Contains(key))
                    r.Violations.Add("lockedKey:" + key);
            }
        }

        private static void CheckGuideForbiddenTypes(DesignGateResult r, TemplateGuideContract guide, JObject incoming)
        {
            var forbidden = guide.CompositeWidgetPolicy?.ForbiddenFieldTypes;
            if (forbidden == null || !forbidden.Any()) return;
            var fields = incoming["fields"] as JArray ?? incoming["Fields"] as JArray ?? new JArray();
            foreach (var f in fields.OfType<JObject>())
            {
                var t = (string)(f["type"] ?? f["Type"]);
                if (string.IsNullOrWhiteSpace(t)) continue;
                if (forbidden.Any(b => string.Equals(b, t, StringComparison.OrdinalIgnoreCase)))
                    r.Violations.Add("forbiddenType:" + t);
            }
        }

        private static IEnumerable<string> GetFieldKeys(JObject schema)
        {
            var fields = schema["fields"] as JArray ?? schema["Fields"] as JArray;
            if (fields == null) return Enumerable.Empty<string>();
            return fields.OfType<JObject>()
                         .Select(f => (string)(f["key"] ?? f["Key"]))
                         .Where(k => !string.IsNullOrWhiteSpace(k));
        }

        private static TemplateGuideContract TryParseGuide(string markdown)
        {
            if (string.IsNullOrWhiteSpace(markdown)) return null;
            var m = System.Text.RegularExpressions.Regex.Match(markdown, "^---\\n([\\s\\S]*?)\\n---\\n");
            if (!m.Success) return null;
            try
            {
                var json = JObject.Parse(m.Groups[1].Value);
                return new TemplateGuideContract
                {
                    TemplateGuideSlug = (string)json["templateGuideSlug"],
                    ImmutableRules = json["immutableRules"] is JArray arr
                        ? arr.Select(x => (string)x).Where(s => s != null).ToList()
                        : new List<string>(),
                    FieldLayoutMap = json["fieldLayoutMap"] is JObject flm
                        ? new FieldLayoutMap
                        {
                            DefaultAppendPanel = (string)flm["defaultAppendPanel"],
                            LockedKeys = flm["lockedKeys"] is JArray lk
                                ? lk.Select(x => (string)x).Where(s => s != null).ToList()
                                : new List<string>(),
                            RequiredKeys = flm["requiredKeys"] is JArray rk
                                ? rk.Select(x => (string)x).Where(s => s != null).ToList()
                                : new List<string>(),
                        }
                        : null,
                    CompositeWidgetPolicy = json["compositeWidgetPolicy"] is JObject cwp
                        ? new CompositeWidgetPolicy
                        {
                            ForbiddenFieldTypes = cwp["forbiddenFieldTypes"] is JArray ft
                                ? ft.Select(x => (string)x).Where(s => s != null).ToList()
                                : new List<string>(),
                        }
                        : null,
                };
            }
            catch { return null; }
        }

        private static JObject TryParse(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return null;
            try { return JObject.Parse(s); } catch { return null; }
        }

        // schema.settings.<field> (camel | Pascal) → schema.<field> (root, camel | Pascal)
        private static JToken GetField(JObject schema, string field)
        {
            var settings = (schema["settings"] as JObject) ?? (schema["Settings"] as JObject);
            if (settings != null)
            {
                var v = settings[field] ?? settings[Pascal(field)];
                if (v != null) return v;
            }
            return schema[field] ?? schema[Pascal(field)];
        }

        private static string Pascal(string camel)
        {
            if (string.IsNullOrEmpty(camel)) return camel;
            return char.ToUpperInvariant(camel[0]) + camel.Substring(1);
        }

        private static bool IsNonEmpty(JToken t)
        {
            if (t == null || t.Type == JTokenType.Null) return false;
            if (t.Type == JTokenType.String) return (((string)t) ?? string.Empty).Trim().Length > 0;
            if (t.Type == JTokenType.Object) return ((JObject)t).HasValues;
            if (t.Type == JTokenType.Array) return ((JArray)t).Count > 0;
            return true; // any other non-null scalar counts as present
        }
    }
}
