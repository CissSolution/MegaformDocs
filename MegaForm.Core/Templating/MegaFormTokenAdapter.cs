// MegaForm.Core.Templating.MegaFormTokenAdapter
// -----------------------------------------------------------------------------
// Adapter that lets the BYOM (Bring-Your-Own-Module) UserTemplateProcessorDispatcher
// drive the existing MegaFormTokenProcessor without modifying the processor
// itself.
//
// WHY AN ADAPTER
// -----------------------------------------------------------------------------
// MegaFormTokenProcessor implements the CISS-shaped ITemplateProcessor
// interface (LoadDefinition(TemplateDefinition) + Render(object,
// TemplateDefinition)). The new BYOM pipeline talks IUserTemplateProcessor
// (Render(string, UserTemplateModel)). Rather than retrofit the engine — which
// is a near-verbatim port of the CISS TokenTemplateProcessor we still want to
// re-sync from upstream — this adapter bridges the two contracts.
//
// THE "TEMPLATE PATH" PROBLEM
// -----------------------------------------------------------------------------
// MegaFormTokenProcessor.LoadDefinition only accepts an on-disk .txt file:
// it checks the extension, calls File.Exists and reads the bytes itself, all to
// preserve compatibility with the original DDR template-distribution model.
// BYOM, however, hands raw template SOURCE to the dispatcher (the file may live
// inside Resources/UserTemplates and have already been read into memory, or it
// may have come from a database column). We therefore:
//   1. Allocate a deterministic temp file name under Path.GetTempPath() using a
//      static Interlocked counter so concurrent renders never collide.
//   2. Write the template source there with a .txt extension so
//      LoadDefinition's extension guard accepts it.
//   3. Build a minimal TemplateDefinition pointing at the temp file.
//   4. Run LoadDefinition + Render normally.
//   5. ALWAYS delete the temp file inside a finally block, even when the
//      processor throws.
// The cost is one disk write + one disk delete per render. Acceptable for a
// developer-extension hook that runs at design time / low frequency. If this
// ever becomes hot-path, the right fix is to teach MegaFormTokenProcessor to
// load from a string (an upstream-friendly change) rather than make this
// adapter cleverer.
//
// MULTI-TARGET NOTES
// -----------------------------------------------------------------------------
// Compiles clean against net472 (C# 7.3, Nullable disabled) and net8/9/10
// (Nullable enabled). Intentionally avoids target-typed `new` (C# 9), records
// (C# 9), init-only setters (C# 9) and switch expressions (C# 8).

using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Threading;

namespace MegaForm.Core.Templating
{
    /// <summary>
    /// Adapts <see cref="MegaFormTokenProcessor"/> to the
    /// <see cref="IUserTemplateProcessor"/> contract consumed by the BYOM
    /// <see cref="UserTemplateProcessorDispatcher"/>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The token engine insists on loading templates from a physical
    /// <c>.txt</c> file. Each render call therefore writes the template
    /// source to a deterministic temp file under
    /// <see cref="Path.GetTempPath"/>, drives the processor as normal and
    /// deletes the temp file in a <c>finally</c> block — even on exceptions.
    /// </para>
    /// <para>
    /// Concurrent renders are isolated via a process-wide
    /// <see cref="Interlocked.Increment(ref int)"/> counter mixed into the
    /// filename, so multiple BYOM requests in flight at the same time never
    /// collide on the same temp file.
    /// </para>
    /// <para>
    /// The adapter never throws — any exception from <c>LoadDefinition</c> or
    /// <c>Render</c> is converted into an HTML comment carrying the message,
    /// which the dispatcher then surfaces in the
    /// <see cref="UserTemplateRenderResult"/> envelope. The error message is
    /// HTML-encoded so a malicious template cannot smuggle markup out of the
    /// comment.
    /// </para>
    /// </remarks>
    public sealed class MegaFormTokenAdapter : IUserTemplateProcessor
    {
        // -------------------------------------------------------------------------
        // Process-wide temp-file counter
        // -------------------------------------------------------------------------
        // Interlocked.Increment guarantees a unique value per call across all
        // threads in the AppDomain. We pair the counter with Path.GetTempPath so
        // the file lives under the OS-managed temp directory (which the host can
        // safely clean if we ever leak one despite the finally block).

        private static int _tempFileCounter;

        /// <summary>
        /// Identifies this adapter as the HTML token processor for the
        /// dispatcher. (The BYOM file-extension resolver maps .html and .htm
        /// to <see cref="UserTemplateKind.Html"/>.)
        /// </summary>
        public UserTemplateKind Kind
        {
            get { return UserTemplateKind.Html; }
        }

        /// <summary>
        /// Renders <paramref name="templateSource"/> against
        /// <paramref name="model"/> by writing the source to a temp .txt file
        /// and driving <see cref="MegaFormTokenProcessor"/> against it.
        /// </summary>
        /// <param name="templateSource">
        /// Raw token-template content (the same syntax as a DDR menu template,
        /// e.g. <c>[=NAME]</c>, <c>[*ROW]…[/*]</c>, <c>[?STATUS]…[/?]</c>).
        /// Null or empty returns the empty string — matching the dispatcher's
        /// behaviour for missing files.
        /// </param>
        /// <param name="model">
        /// BYOM data model. Forwarded to the token processor's
        /// <c>Render(object, TemplateDefinition)</c> entry point — the
        /// processor's <c>MegaFormRowXmlSerializer</c> is responsible for
        /// projecting the model into the <c>&lt;Root&gt;&lt;root&gt;&lt;node&gt;…&lt;/node&gt;&lt;/root&gt;&lt;/Root&gt;</c>
        /// XML envelope the compiled XSLT expects. May be null; we substitute
        /// an empty <see cref="UserTemplateModel"/> so the engine still has
        /// something to project.
        /// </param>
        /// <returns>
        /// Rendered HTML on success, or an HTML-encoded
        /// <c>&lt;!-- mf-token error: ... --&gt;</c> comment when
        /// <c>LoadDefinition</c> rejects the template or the processor
        /// throws. The adapter never propagates exceptions to its caller —
        /// the dispatcher wraps them in its own envelope anyway, but
        /// surfacing the message as an HTML comment also lets developers
        /// inspect the output directly in the browser.
        /// </returns>
        public string Render(string templateSource, UserTemplateModel model)
        {
            // --- 1. Empty-source short-circuit ----------------------------------
            // Mirrors the Razor adapter: a null/empty template renders as the
            // empty string. We deliberately do NOT treat whitespace-only as
            // empty here because a token template that emits a literal space is
            // still a valid template.
            if (string.IsNullOrEmpty(templateSource))
            {
                return string.Empty;
            }

            // --- 2. Build a deterministic temp path -----------------------------
            // Interlocked.Increment + AppDomain-wide counter keeps the filename
            // unique even under concurrent renders. We always use .txt because
            // MegaFormTokenProcessor.LoadDefinition explicitly checks the
            // extension and rejects anything else.
            // TODO [LOW][SECURITY] Counter resets on AppDomain restart, so a
            // hostile co-tenant on the same temp folder could pre-create
            // mf_token_1.txt with a symlink and steal/poison the next render.
            // Mitigation: prefix the filename with Guid.NewGuid().ToString("N")
            // so the path is unguessable. Counter alone is fine on Windows
            // (single-tenant temp ACLs) but not on shared-temp Linux hosts.
            var counter = Interlocked.Increment(ref _tempFileCounter);
            var tempPath = Path.Combine(
                Path.GetTempPath(),
                "mf_token_" + counter.ToString(System.Globalization.CultureInfo.InvariantCulture) + ".txt");

            try
            {
                // --- 3. Materialise the template on disk ------------------------
                // The processor reads the file inside LoadDefinition; we cannot
                // hand it the bytes directly without modifying the engine.
                File.WriteAllText(tempPath, templateSource);

                // --- 4. Build a minimal definition ------------------------------
                // Only TemplatePath + FolderUrl are actually consumed by the
                // BYOM path through the processor; the optional argument /
                // client-option lists default to empty in the POCO and the
                // engine tolerates that.
                var def = new TemplateDefinition
                {
                    TemplatePath = tempPath,
                    FolderUrl = string.Empty
                };

                // --- 4b. Flatten the BYOM data bags into xsl:param declarations
                // The token processor compiles `[=NAME]` references to xsl
                // params only when NAME is in the validParams set built inside
                // LoadDefinition from def.DefaultTemplateArguments (plus the
                // 6 hardcoded standard params). Render-time values are read
                // from def.TemplateArguments. Both lists MUST be populated
                // BEFORE LoadDefinition runs, and names MUST be lower-case
                // because the processor lowercases at both compile and bind
                // sites. Names that fail XSL QName rules are filtered so a
                // hostile or auto-generated key cannot make the XSLT compile
                // step throw.
                //
                // Precedence (first-wins) — Row > Params > Form > Settings.
                // Per-row scope dominates so per-row renders cannot have a
                // form-scope key shadow the live row value the template
                // author is asking for.
                def.DefaultTemplateArguments = new List<TemplateArgument>();
                def.TemplateArguments = new List<TemplateArgument>();

                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                var bags = new IDictionary<string, object>[]
                {
                    model == null ? null : model.Row,
                    model == null ? null : model.Params,
                    model == null ? null : model.Form,
                    model == null ? null : model.Settings
                };

                foreach (var bag in bags)
                {
                    if (bag == null) continue;
                    foreach (var kv in bag)
                    {
                        var name = (kv.Key ?? string.Empty).Trim();
                        if (name.Length == 0) continue;
                        if (!IsValidXslParamName(name)) continue;
                        var lc = name.ToLowerInvariant();
                        if (seen.Contains(lc)) continue;
                        seen.Add(lc);
                        def.DefaultTemplateArguments.Add(new TemplateArgument { Name = lc, Value = string.Empty });
                        var valueText = kv.Value == null ? string.Empty : kv.Value.ToString();
                        def.TemplateArguments.Add(new TemplateArgument { Name = lc, Value = valueText });
                    }
                }

                // --- 5. Drive the processor -------------------------------------
                // LoadDefinition compiles the token template into an XSLT
                // stylesheet; a false return means the template was rejected
                // (wrong extension or missing file — neither should happen
                // here, but we honour the contract anyway).
                var proc = new MegaFormTokenProcessor();
                if (!proc.LoadDefinition(def))
                {
                    return string.Empty;
                }

                // The processor's Render signature is (object source,
                // TemplateDefinition); UserTemplateModel is the source. A null
                // model would still work (the serializer treats it as an empty
                // row), but we substitute an empty model to keep the contract
                // explicit.
                return proc.Render(model ?? new UserTemplateModel(), def) ?? string.Empty;
            }
            catch (Exception ex)
            {
                // Surface the message as an HTML comment so developers can
                // inspect it in the rendered page. HTML-encoding the message
                // prevents a hostile template from breaking out of the
                // comment with "-->" or smuggling markup.
                return "<!-- mf-token error: " + WebUtility.HtmlEncode(ex.Message) + " -->";
            }
            finally
            {
                // --- 6. Always clean up the temp file ---------------------------
                // We swallow any IO error from the delete — the file lives in
                // the OS temp directory anyway, and propagating a cleanup
                // failure on top of the actual rendered output would be
                // strictly worse than leaving a stale .txt behind.
                try
                {
                    if (File.Exists(tempPath))
                    {
                        File.Delete(tempPath);
                    }
                }
                catch
                {
                    // ignored — best-effort cleanup
                }
            }
        }

        // -------------------------------------------------------------------
        // XSL QName guard
        // -------------------------------------------------------------------
        // XslCompiledTransform refuses param names that are not valid XML
        // QNames; even worse, the failure surfaces from inside
        // XslCompiledTransform.Load with a fairly opaque error. We therefore
        // pre-filter the BYOM bag keys to the conservative subset
        //   first char: letter or underscore
        //   subsequent: letter, digit, underscore or hyphen
        // which is strictly narrower than the full XML QName grammar but
        // covers every realistic form field / SQL column / query string key
        // BYOM templates will reference via [=NAME]. Anything outside this
        // shape is dropped silently — a template that asked for the key gets
        // an empty substitution instead of crashing the whole render.
        private static bool IsValidXslParamName(string s)
        {
            if (string.IsNullOrEmpty(s)) return false;
            var c0 = s[0];
            if (!(c0 == '_' || char.IsLetter(c0))) return false;
            for (int i = 1; i < s.Length; i++)
            {
                var c = s[i];
                if (!(c == '_' || c == '-' || char.IsLetterOrDigit(c))) return false;
            }
            return true;
        }
    }
}
