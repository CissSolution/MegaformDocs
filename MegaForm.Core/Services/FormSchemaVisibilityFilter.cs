using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    public sealed class SchemaProjectionResult
    {
        /// <summary>Schema safe to hand to this actor. Reference-equal to the input when nothing was withheld.</summary>
        public string SchemaJson { get; set; }

        public List<string> HiddenFields { get; set; }
        public List<string> ReadOnlyFields { get; set; }

        /// <summary>True when the schema could not be parsed and an empty form was substituted.</summary>
        public bool FailedClosed { get; set; }

        public SchemaProjectionResult()
        {
            HiddenFields = new List<string>();
            ReadOnlyFields = new List<string>();
        }

        public bool Changed
        {
            get { return FailedClosed || HiddenFields.Count > 0 || ReadOnlyFields.Count > 0; }
        }
    }

    /// <summary>
    /// Removes fields an actor may not see from the schema *before* it reaches the browser, and locks
    /// the ones they may only read. Hiding a field with CSS is not access control: the public render
    /// page re-fetches the full schema over the API and rebuilds the form from it, so anything left in
    /// the schema is readable with curl regardless of what the HTML shows.
    ///
    /// Works on the raw JObject rather than a deserialized <see cref="FormSchema"/> on purpose. The
    /// schema in the database carries properties the typed model does not know about (mirrored
    /// casings, widget props, plugin payloads); a round-trip through FormSchema would silently drop
    /// them. Everything not touched here comes out byte-identical.
    /// </summary>
    public static class FormSchemaVisibilityFilter
    {
        private const string EmptyFieldsSchema = "{\"fields\":[]}";

        /// <summary>
        /// Projects <paramref name="schemaJson"/> down to what <paramref name="context"/>'s actor may see.
        /// <paramref name="policy"/> carries the static per-role rules from MF_Permissions.FieldRestrictions;
        /// the dynamic part comes from each field's showIf rule.
        /// </summary>
        public static SchemaProjectionResult Project(
            string schemaJson,
            RuleEvaluationContext context,
            FieldAccessPolicy policy = null)
        {
            var result = new SchemaProjectionResult { SchemaJson = schemaJson };

            var hasPolicy = policy != null && !policy.IsEmpty;

            if (string.IsNullOrWhiteSpace(schemaJson))
                return result;

            // A rule can only gate access if one of its leaves reads something other than a field
            // answer, and such a leaf always carries an explicit sourceType. No sourceType and no
            // per-role policy means there is nothing to enforce, so skip the parse entirely and hand
            // back the exact string the caller already has. This keeps the common public form on the
            // allocation profile it had before, and guarantees its HTML cannot shift by a byte.
            if (!hasPolicy && schemaJson.IndexOf("sourceType", StringComparison.OrdinalIgnoreCase) < 0)
                return result;

            JObject schema;
            try
            {
                schema = JObject.Parse(schemaJson);
            }
            catch
            {
                // We know there is something to enforce but cannot read the schema to enforce it.
                // Serving the unfiltered original would leak exactly what we were asked to withhold.
                result.SchemaJson = EmptyFieldsSchema;
                result.FailedClosed = true;
                return result;
            }

            context = context ?? new RuleEvaluationContext();

            var changed = false;
            foreach (var fields in FieldArrays(schema))
                changed |= ProjectFieldArray(fields, context, policy, result);

            if (changed)
                result.SchemaJson = schema.ToString(Formatting.None);

            return result;
        }

        /// <summary>
        /// Every field array hanging off this node. RenderModelResolver mirrors the schema's casing, so a
        /// live form carries BOTH "fields" and "Fields" holding the same five fields. Filtering only the
        /// first one leaves the withheld field sitting in the other, which is still shipped to the browser.
        /// </summary>
        private static IEnumerable<JArray> FieldArrays(JObject node)
        {
            var camel = node["fields"] as JArray;
            if (camel != null)
                yield return camel;

            var pascal = node["Fields"] as JArray;
            if (pascal != null && !ReferenceEquals(pascal, camel))
                yield return pascal;
        }

        /// <summary>Returns true when any element of the array was removed or rewritten.</summary>
        private static bool ProjectFieldArray(
            JArray fields,
            RuleEvaluationContext context,
            FieldAccessPolicy policy,
            SchemaProjectionResult result)
        {
            if (fields == null)
                return false;

            var changed = false;

            // Reverse so removals do not shift the indices we have yet to visit.
            for (var i = fields.Count - 1; i >= 0; i--)
            {
                var field = fields[i] as JObject;
                if (field == null)
                    continue;

                var key = FieldKey(field);
                bool unreadableRule;
                var showIf = ReadShowIf(field, out unreadableRule);

                // A rule we cannot deserialize is only fatal when it was trying to gate access. Judge
                // that from the raw JSON, because the typed parse is exactly what failed: a pure field
                // rule with a misspelled operator is presentation logic that predates us and must keep
                // rendering as it always has, while a malformed role rule must not silently open up.
                var unenforceable = unreadableRule && LooksLikeAccessRule(ShowIfNode(field));

                var isContainer = Columns(field).Any();

                if (unenforceable || IsDenied(key, showIf, context, policy, isContainer))
                {
                    CollectKeys(field, result.HiddenFields);
                    fields.RemoveAt(i);
                    changed = true;
                    continue;
                }

                if (policy != null && policy.IsReadOnly(key))
                {
                    field["readOnly"] = true;
                    result.ReadOnlyFields.Add(key);
                    changed = true;
                }

                // A role/permission readOnlyIf rule that holds for this visitor locks the field. It is
                // always resolved and stripped here: the field stays in the schema (the visitor may see
                // it) but the client never re-evaluates the rule, and submit re-checks it independently.
                changed |= ApplyReadOnlyIf(field, key, context, result);

                if (showIf != null && RuleStaticEvaluator.IsAccessRule(showIf))
                    changed |= RewriteEnforcedRule(field, showIf, context);

                foreach (var column in Columns(field))
                    foreach (var nested in FieldArrays(column))
                        changed |= ProjectFieldArray(nested, context, policy, result);
            }

            return changed;
        }

        private static bool IsDenied(string key, ShowIfCondition showIf, RuleEvaluationContext context, FieldAccessPolicy policy, bool isContainer)
        {
            if (policy != null && !string.IsNullOrEmpty(key))
            {
                if (policy.DeniedFields.Contains(key))
                    return true;

                // An allow-list names the data fields a role may touch, not the rows and sections that
                // hold them. Applying it to a layout container would drop the container and take its
                // allowed children with it, so containers are judged only by an explicit deny.
                if (!isContainer && policy.IsHidden(key))
                    return true;
            }

            return showIf != null
                && RuleStaticEvaluator.IsAccessRule(showIf)
                && RuleStaticEvaluator.Evaluate(showIf, context) == RuleTriState.False;
        }

        /// <summary>
        /// Strips the leaves the server has already settled, so the browser never re-decides an access
        /// question against a rule context it may not have. Kleene logic makes this safe: reaching here
        /// means the rule is True (every static leaf agreed, so the whole condition already holds) or
        /// Unknown (no static leaf was decisive, which under AND means they all passed and under OR
        /// means they all failed, so in both cases dropping them leaves the field leaves to decide
        /// exactly as they would have).
        /// </summary>
        private static bool RewriteEnforcedRule(JObject field, ShowIfCondition showIf, RuleEvaluationContext context)
        {
            if (RuleStaticEvaluator.Evaluate(showIf, context) == RuleTriState.True)
            {
                field.Remove("showIf");
                field.Remove("ShowIf");
                return true;
            }

            var leaves = Leaves(ShowIfNode(field));
            if (leaves == null)
                return false;

            var removed = false;
            for (var i = leaves.Count - 1; i >= 0; i--)
            {
                if (!IsFieldSourced(leaves[i] as JObject))
                {
                    leaves.RemoveAt(i);
                    removed = true;
                }
            }

            if (removed && leaves.Count == 0)
            {
                field.Remove("showIf");
                field.Remove("ShowIf");
            }

            return removed;
        }

        private static bool IsFieldSourced(JObject leaf)
        {
            if (leaf == null)
                return false;

            var source = (leaf["sourceType"] ?? leaf["SourceType"])?.ToString();
            return string.IsNullOrWhiteSpace(source)
                || string.Equals(source, "field", StringComparison.OrdinalIgnoreCase);
        }

        private static JObject ShowIfNode(JObject field)
        {
            return field["showIf"] as JObject ?? field["ShowIf"] as JObject;
        }

        private static JArray Leaves(JObject showIfNode)
        {
            if (showIfNode == null)
                return null;

            return showIfNode["conditions"] as JArray
                ?? showIfNode["Conditions"] as JArray
                ?? showIfNode["rules"] as JArray
                ?? showIfNode["Rules"] as JArray;
        }

        /// <summary>
        /// String-only view of <see cref="RuleStaticEvaluator.IsAccessRule"/>, usable when the typed parse
        /// has already failed. Any leaf naming a source other than a field answer is an access decision.
        /// </summary>
        private static bool LooksLikeAccessRule(JObject showIfNode)
        {
            var leaves = Leaves(showIfNode);
            return leaves != null && leaves.OfType<JObject>().Any(leaf => !IsFieldSourced(leaf));
        }

        /// <summary>
        /// Applies a field's readOnlyIf role/permission rule. If it holds for this visitor the field is
        /// marked read-only; either way the resolved rule is removed so the client never sees the role
        /// condition. A readOnlyIf we cannot read locks the field (fail-closed) rather than leaving it
        /// editable. Non-access (field-only) readOnlyIf is left untouched.
        /// </summary>
        private static bool ApplyReadOnlyIf(JObject field, string key, RuleEvaluationContext context, SchemaProjectionResult result)
        {
            var node = field["readOnlyIf"] as JObject ?? field["ReadOnlyIf"] as JObject;
            if (node == null)
                return false;

            ShowIfCondition rule = null;
            var unreadable = false;
            try { rule = node.ToObject<ShowIfCondition>(); }
            catch { unreadable = true; }

            var lockIt = unreadable
                ? LooksLikeAccessRule(node)
                : rule != null && RuleStaticEvaluator.IsAccessRule(rule) && RuleStaticEvaluator.Evaluate(rule, context) == RuleTriState.True;

            // Not an access rule and readable → leave it for whoever authored it (inert on the client
            // today, but we do not silently drop authored data we do not own).
            if (!unreadable && rule != null && !RuleStaticEvaluator.IsAccessRule(rule))
                return false;

            field.Remove("readOnlyIf");
            field.Remove("ReadOnlyIf");
            if (lockIt)
            {
                field["readOnly"] = true;
                if (!string.IsNullOrEmpty(key)) result.ReadOnlyFields.Add(key);
            }
            return true;
        }

        /// <summary>
        /// Reads a field's showIf. <paramref name="unreadable"/> is set when the rule is present but cannot
        /// be deserialized; a rule we cannot read is a rule we cannot honour, so the caller withholds the
        /// field rather than treating the rule as decoration.
        /// </summary>
        private static ShowIfCondition ReadShowIf(JObject field, out bool unreadable)
        {
            unreadable = false;

            var node = field["showIf"] ?? field["ShowIf"];
            if (node == null || node.Type != JTokenType.Object)
                return null;

            try
            {
                return node.ToObject<ShowIfCondition>();
            }
            catch
            {
                unreadable = true;
                return null;
            }
        }

        private static IEnumerable<JObject> Columns(JObject field)
        {
            var columns = field["columns"] as JArray ?? field["Columns"] as JArray;
            if (columns == null)
                yield break;

            foreach (var column in columns.OfType<JObject>())
                yield return column;
        }

        /// <summary>Records the field's key and every nested child key, so callers can audit what was withheld.</summary>
        private static void CollectKeys(JObject field, List<string> into)
        {
            var key = FieldKey(field);
            if (!string.IsNullOrEmpty(key))
                into.Add(key);

            foreach (var column in Columns(field))
                foreach (var nested in FieldArrays(column))
                    foreach (var child in nested.OfType<JObject>())
                        CollectKeys(child, into);
        }

        private static string FieldKey(JObject field)
        {
            return (field["key"] ?? field["Key"])?.ToString() ?? string.Empty;
        }
    }
}
