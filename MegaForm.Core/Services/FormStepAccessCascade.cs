using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// [StepAccess v20260802] Access rules on a step (a tab / page of a multi-step form), expressed
    /// as the rules already carried by the field that opens it.
    ///
    /// There is no Step object to hang a permission on: the runtime derives steps FROM the fields —
    /// a step begins at a Section field whose properties say pageBreak, and runs until the next one.
    /// Anything keyed by step index would rot, because those indices are recomputed whenever a step
    /// is added or removed. So a step's access rule IS the opening Section field's showIf/readOnlyIf,
    /// and this class spreads that one verdict across the fields the step contains.
    ///
    /// It deliberately produces nothing new to enforce: the verdict is folded into the same
    /// <see cref="FieldAccessPolicy"/> that per-field rules already use, so both existing paths keep
    /// doing the enforcing —
    ///   render : FormSchemaVisibilityFilter.Project drops denied keys and marks read-only ones
    ///   submit : ServerSidePermissionEnforcementService rejects writes to them and keeps the
    ///            stored value
    /// A step rule that only held at render time would be decoration; SECURITY_CODING_RULES is
    /// explicit that a client-side-only gate is not a gate.
    ///
    /// Semantics match the per-field ones exactly, tri-state included:
    ///   hidden    when showIf     is an access rule and evaluates to False   (Unknown != denied,
    ///             because the browser still has field-sourced leaves to decide)
    ///   read-only when readOnlyIf is an access rule and evaluates to True
    /// </summary>
    public static class FormStepAccessCascade
    {
        /// <summary>Typed entry point — used by the submit-time enforcement path.</summary>
        public static void Collect(FormSchema schema, RuleEvaluationContext context, FieldAccessPolicy policy)
        {
            if (schema?.Fields == null || policy == null || schema.Fields.Count == 0)
                return;

            context = context ?? new RuleEvaluationContext();

            var denied = false;
            var readOnly = false;

            foreach (var field in schema.Fields)
            {
                if (field == null)
                    continue;

                if (IsStepStart(field))
                {
                    denied = IsHiddenBy(field.ShowIf, context);
                    readOnly = IsLockedBy(field.ReadOnlyIf, context);
                    // The opening Section carries its own rule already; the per-field pass handles it.
                    continue;
                }

                if (!denied && !readOnly)
                    continue;

                foreach (var key in KeysOf(field))
                {
                    if (denied) policy.DeniedFields.Add(key);
                    else policy.ReadOnlyFields.Add(key);
                }
            }
        }

        /// <summary>
        /// JSON entry point — used by the render projection, which never materialises a typed schema.
        /// Only the top-level array is walked: a page break is a top-level construct, and a Section
        /// nested inside a row does not open a step.
        /// </summary>
        public static void Collect(JArray fields, RuleEvaluationContext context, FieldAccessPolicy policy)
        {
            if (fields == null || policy == null)
                return;

            context = context ?? new RuleEvaluationContext();

            var denied = false;
            var readOnly = false;

            foreach (var node in fields.OfType<JObject>())
            {
                if (IsStepStart(node))
                {
                    denied = IsHiddenBy(RuleOf(node, "showIf", "ShowIf"), context);
                    readOnly = IsLockedBy(RuleOf(node, "readOnlyIf", "ReadOnlyIf"), context);
                    continue;
                }

                if (!denied && !readOnly)
                    continue;

                foreach (var key in KeysOf(node))
                {
                    if (denied) policy.DeniedFields.Add(key);
                    else policy.ReadOnlyFields.Add(key);
                }
            }
        }

        // ── step detection ────────────────────────────────────

        /// <summary>
        /// A step opens at a Section field flagged pageBreak. Both casings are accepted and the value
        /// may arrive as a bool, a string or a JSON token depending on which serializer wrote it —
        /// the same tolerance FormHtmlRenderer.IsPageBreak applies when it splits a form into pages.
        /// Reading it more strictly here than the renderer does would put a step's fields outside the
        /// step that visibly contains them.
        /// </summary>
        public static bool IsStepStart(FormField field)
        {
            if (field == null || field.Properties == null)
                return false;
            if (!IsSection(field.Type))
                return false;

            object raw;
            if (!field.Properties.TryGetValue("pageBreak", out raw)
                && !field.Properties.TryGetValue("PageBreak", out raw))
                return false;

            return IsTrue(raw);
        }

        public static bool IsStepStart(JObject field)
        {
            if (field == null)
                return false;
            if (!IsSection((string)(field["type"] ?? field["Type"])))
                return false;

            var props = (field["properties"] ?? field["Properties"]) as JObject;
            if (props == null)
                return false;

            var pb = props["pageBreak"] ?? props["PageBreak"];
            return pb != null && IsTrue(((JValue)pb).Value);
        }

        private static bool IsSection(string type)
        {
            return string.Equals(type, "Section", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsTrue(object raw)
        {
            if (raw is bool b) return b;
            var s = Convert.ToString(raw, System.Globalization.CultureInfo.InvariantCulture);
            bool parsed;
            return bool.TryParse(s, out parsed) && parsed;
        }

        // ── verdicts (identical to the per-field semantics) ────

        private static bool IsHiddenBy(ShowIfCondition showIf, RuleEvaluationContext context)
        {
            return showIf != null
                && RuleStaticEvaluator.IsAccessRule(showIf)
                && RuleStaticEvaluator.Evaluate(showIf, context) == RuleTriState.False;
        }

        private static bool IsLockedBy(ShowIfCondition readOnlyIf, RuleEvaluationContext context)
        {
            return readOnlyIf != null
                && RuleStaticEvaluator.IsAccessRule(readOnlyIf)
                && RuleStaticEvaluator.Evaluate(readOnlyIf, context) == RuleTriState.True;
        }

        private static ShowIfCondition RuleOf(JObject field, params string[] names)
        {
            foreach (var name in names)
            {
                var node = field[name] as JObject;
                if (node == null)
                    continue;
                try { return node.ToObject<ShowIfCondition>(); }
                catch { return null; }   // a rule we cannot read is judged by the per-field pass
            }
            return null;
        }

        // ── keys ──────────────────────────────────────────────

        /// <summary>
        /// The field's own key plus every descendant's. A container must contribute its children: the
        /// projection drops a denied container whole, but submit-time enforcement matches incoming
        /// DATA keys, and data arrives under the leaf keys.
        /// </summary>
        private static IEnumerable<string> KeysOf(FormField field)
        {
            if (field == null)
                yield break;

            if (!string.IsNullOrWhiteSpace(field.Key))
                yield return field.Key.Trim();

            if (field.Columns == null)
                yield break;

            foreach (var column in field.Columns)
            {
                if (column?.Fields == null)
                    continue;
                foreach (var child in column.Fields)
                    foreach (var key in KeysOf(child))
                        yield return key;
            }
        }

        private static IEnumerable<string> KeysOf(JObject field)
        {
            if (field == null)
                yield break;

            var key = (string)(field["key"] ?? field["Key"]);
            if (!string.IsNullOrWhiteSpace(key))
                yield return key.Trim();

            var columns = (field["columns"] ?? field["Columns"]) as JArray;
            if (columns == null)
                yield break;

            foreach (var column in columns.OfType<JObject>())
            {
                foreach (var name in new[] { "fields", "Fields" })
                {
                    var nested = column[name] as JArray;
                    if (nested == null)
                        continue;
                    foreach (var child in nested.OfType<JObject>())
                        foreach (var k in KeysOf(child))
                            yield return k;
                }
            }
        }
    }
}
