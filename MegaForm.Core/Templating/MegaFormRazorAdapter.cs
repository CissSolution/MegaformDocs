// MegaForm.Core.Templating.MegaFormRazorAdapter
// -----------------------------------------------------------------------------
// Adapter that lets the BYOM (Bring-Your-Own-Module) UserTemplateProcessorDispatcher
// drive the existing MegaFormRazorInterpreter without modifying the interpreter
// itself.
//
// WHY AN ADAPTER
// -----------------------------------------------------------------------------
// MegaFormRazorInterpreter ships with a static Render(string, IDictionary<string,
// object>) entry point inherited from the CISS.SideMenu DDR port. It does not
// implement IUserTemplateProcessor (which is BYOM-specific) and we explicitly
// do NOT want to retrofit the interpreter — keeping the engine untouched lets
// us keep importing fixes/changes from the CISS source. The dispatcher author
// therefore picked strategy (b): thin adapters that re-expose the engines via
// the new contract.
//
// MODEL FLATTENING
// -----------------------------------------------------------------------------
// MegaFormRazorInterpreter's @model is hard-wired to an IDictionary<string,
// object> row. UserTemplateModel however carries Row, Form, Settings and Params
// dictionaries separately so templates can read sibling form fields and widget
// settings without per-engine plumbing. This adapter performs a single
// "namespace-prefix" flatten so the interpreter still sees one dictionary:
//   Form_FieldName     ← model.Form[FieldName]
//   Settings_OptionKey ← model.Settings[OptionKey]
//   Params_QueryKey    ← model.Params[QueryKey]
// The original row keys are passed through untouched so existing templates
// (which only use @Field syntax against the row) stay 100% compatible. Prefix
// collisions are avoided by ONLY copying entries that are not already present
// in the row dictionary, so an explicit Row override always wins.
//
// MULTI-TARGET NOTES
// -----------------------------------------------------------------------------
// Compiles clean against net472 (C# 7.3, Nullable disabled) and net8/9/10
// (Nullable enabled). Intentionally avoids target-typed `new` (C# 9), records
// (C# 9), init-only setters (C# 9) and switch expressions (C# 8).

using System.Collections.Generic;

namespace MegaForm.Core.Templating
{
    /// <summary>
    /// Adapts <see cref="MegaFormRazorInterpreter"/> to the
    /// <see cref="IUserTemplateProcessor"/> contract consumed by the BYOM
    /// <see cref="UserTemplateProcessorDispatcher"/>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The adapter is intentionally stateless and thread-safe: each render call
    /// constructs a fresh merged dictionary from the supplied
    /// <see cref="UserTemplateModel"/> and forwards to
    /// <c>MegaFormRazorInterpreter.Render(string, IDictionary&lt;string, object&gt;)</c>.
    /// The interpreter itself is not modified — the BYOM contract sits next to
    /// the engine rather than inside it, so CISS source updates can keep being
    /// imported verbatim.
    /// </para>
    /// <para>
    /// The interpreter expects a single flat row dictionary. To preserve the
    /// richer BYOM model (Row + Form + Settings + Params) without changing the
    /// engine, this adapter merges the auxiliary dictionaries into the row
    /// under deterministic prefixes (Form_, Settings_, Params_). Row entries
    /// always win against prefixed copies — if a template explicitly wants the
    /// Form scope it must use <c>@Form_FieldName</c>, not <c>@FieldName</c>.
    /// </para>
    /// </remarks>
    public sealed class MegaFormRazorAdapter : IUserTemplateProcessor
    {
        /// <summary>
        /// Identifies this adapter as the Razor processor for the dispatcher.
        /// </summary>
        public UserTemplateKind Kind
        {
            get { return UserTemplateKind.Razor; }
        }

        /// <summary>
        /// Renders <paramref name="templateSource"/> against
        /// <paramref name="model"/> by delegating to
        /// <see cref="MegaFormRazorInterpreter.Render(string, IDictionary{string, object})"/>.
        /// </summary>
        /// <param name="templateSource">
        /// Raw .cshtml content. Null or whitespace returns the empty string —
        /// the BYOM dispatcher relies on this short-circuit so an empty
        /// template file renders as empty HTML instead of throwing.
        /// </param>
        /// <param name="model">
        /// The BYOM data model. May be null; treated as an empty model with no
        /// row context. The Row dictionary is the primary source of values;
        /// Form / Settings / Params are mixed in under prefixed keys so a
        /// template can read sibling scopes without engine changes.
        /// </param>
        /// <returns>
        /// The HTML produced by the Razor interpreter. Never null — the
        /// adapter coalesces a null interpreter result to the empty string for
        /// the dispatcher contract.
        /// </returns>
        public string Render(string templateSource, UserTemplateModel model)
        {
            // --- 1. Empty-source short-circuit ----------------------------------
            // We treat null / empty / whitespace template source as an empty
            // render. This matches the dispatcher's behaviour for missing files
            // and avoids running the Razor parser over an empty buffer.
            if (string.IsNullOrEmpty(templateSource))
            {
                return string.Empty;
            }

            // --- 2. Resolve / clone the row dictionary --------------------------
            // We never mutate model.Row in place — a caller may reuse the same
            // model across multiple renders, and stamping Form_/Settings_/
            // Params_ entries onto the original would be a surprising side
            // effect. Copy into a fresh dictionary instead.
            IDictionary<string, object> row;
            if (model != null && model.Row != null)
            {
                row = new Dictionary<string, object>(model.Row.Count + 16);
                foreach (var kv in model.Row)
                {
                    row[kv.Key] = kv.Value;
                }
            }
            else
            {
                row = new Dictionary<string, object>(16);
            }

            // --- 3. Merge Form / Settings / Params under prefixed keys ----------
            // Row entries are authoritative — only prefixed copies that do NOT
            // collide with an existing row key are added. That way an existing
            // template using @FieldName keeps working unchanged while a new
            // template can opt into @Form_FieldName / @Settings_X / @Params_Y.
            if (model != null)
            {
                MergeScope(row, model.Form, "Form_");
                MergeScope(row, model.Settings, "Settings_");
                MergeScope(row, model.Params, "Params_");
            }

            // --- 4. Delegate to the interpreter ---------------------------------
            // The interpreter is a static method (CISS-style) so no instance
            // setup is required. A null return is coalesced to empty so the
            // dispatcher never has to special-case it.
            var html = MegaFormRazorInterpreter.Render(templateSource, row);
            return html ?? string.Empty;
        }

        /// <summary>
        /// Copies entries from <paramref name="scope"/> into <paramref name="target"/>
        /// under the supplied <paramref name="prefix"/>, skipping any key that
        /// already exists in <paramref name="target"/> (so the original row
        /// always wins).
        /// </summary>
        /// <param name="target">Destination row dictionary (mutated in place).</param>
        /// <param name="scope">Source dictionary (Form / Settings / Params). May be null.</param>
        /// <param name="prefix">
        /// String prefix added to every source key (for example "Form_"). Empty
        /// prefix would clobber the row scope so callers must always pass a
        /// non-empty value; this helper does not validate that.
        /// </param>
        private static void MergeScope(
            IDictionary<string, object> target,
            IDictionary<string, object> scope,
            string prefix)
        {
            if (scope == null) return;
            foreach (var kv in scope)
            {
                if (string.IsNullOrEmpty(kv.Key)) continue;
                var key = prefix + kv.Key;
                if (!target.ContainsKey(key))
                {
                    target[key] = kv.Value;
                }
            }
        }
    }
}
