// MegaForm.Core.Templating.UserTemplateProcessorDispatcher
// -----------------------------------------------------------------------------
// Single entry-point that takes a user-supplied template file (BYOM — Bring Your
// Own Module) and routes it to the correct rendering engine based on the file
// extension. The dispatcher itself does NOT know how to render anything; it just
// classifies the file via UserTemplateKindResolver and forwards the call to the
// IUserTemplateProcessor that handles that template kind.
//
// HOW THIS FITS INTO THE BYOM PIPELINE
// -----------------------------------------------------------------------------
//  1. Auto-discovery scans Resources/UserTemplates/ and indexes every .html /
//     .cshtml / .ascx file it finds.
//  2. When MegaForm has to render one of those templates at runtime it builds a
//     UserTemplateModel (form id, current row, params, settings, ...) and calls
//     UserTemplateProcessorDispatcher.Render(filePath, source, model).
//  3. The dispatcher classifies the extension, picks the right processor and
//     wraps the result in a UserTemplateRenderResult so callers never have to
//     try/catch around platform engines themselves.
//
// PLATFORM SPLIT
// -----------------------------------------------------------------------------
// MegaForm.Core is platform-agnostic and ships to BOTH DNN (net472) and Oqtane
// (net8.0 / net9.0 / net10.0). The HTML token processor and the Razor subset
// interpreter both live in Core. The ASCX engine, by contrast, only exists on
// the DNN side because it needs System.Web.UI. The dispatcher therefore:
//   - accepts an optional third constructor argument so the DNN-side wiring code
//     can inject its IUserTemplateProcessor for UserTemplateKind.Ascx;
//   - returns Success=false with an explanatory Error when an .ascx file is
//     handed to a build that did NOT inject the ASCX processor (typically
//     Oqtane), so the caller can surface a clean message instead of swallowing
//     a NullReferenceException.
//
// MULTI-TARGET NOTES
// -----------------------------------------------------------------------------
// The file compiles against net472 (C# 7.3, Nullable disabled) and net8/9/10
// (Nullable enabled). Intentionally avoids:
//   - target-typed `new` (C# 9)
//   - switch expressions (C# 8)
//   - nullable reference annotations (incompatible with C# 7.3)
// All processor invocations are wrapped in a try/catch and turned into
// UserTemplateRenderResult.Error strings, so a malformed template never crashes
// the host page.

using System;
using System.IO;

namespace MegaForm.Core.Templating
{
    /// <summary>
    /// Routes a BYOM (Bring-Your-Own-Module) user template to the correct
    /// rendering engine based on file extension and returns the rendered HTML
    /// inside a <see cref="UserTemplateRenderResult"/> envelope.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The dispatcher is intentionally tiny: it classifies the file extension via
    /// <see cref="UserTemplateKindResolver"/> and forwards the call to the
    /// matching <see cref="IUserTemplateProcessor"/>. The two processors that
    /// live in MegaForm.Core today are <c>MegaFormTokenProcessor</c>
    /// (<see cref="UserTemplateKind.Html"/>) and <c>MegaFormRazorInterpreter</c>
    /// (<see cref="UserTemplateKind.Razor"/>).
    /// </para>
    /// <para>
    /// The third (optional) ASCX processor is DNN-specific and is therefore
    /// passed via the secondary constructor overload from the DNN wiring code.
    /// Oqtane builds simply use the two-argument constructor and any attempt to
    /// render an .ascx will short-circuit with <c>Success=false</c> and a
    /// friendly error message rather than throwing.
    /// </para>
    /// <para>
    /// All processor calls are wrapped in a try/catch and converted into
    /// <see cref="UserTemplateRenderResult.Error"/> so a malformed template
    /// cannot bring down the host page.
    /// </para>
    /// </remarks>
    public sealed class UserTemplateProcessorDispatcher
    {
        // -------------------------------------------------------------------------
        // Backing processors
        // -------------------------------------------------------------------------
        // The two Core-side processors are required (HTML + Razor); the ASCX
        // processor is optional and only injected on DNN. We keep them as the
        // IUserTemplateProcessor abstraction so that the dispatcher does not need
        // to reference DNN- or Oqtane-specific types directly.

        private readonly IUserTemplateProcessor _tokenProcessor;
        private readonly IUserTemplateProcessor _razorInterpreter;
        private readonly IUserTemplateProcessor _ascxProcessor; // may be null (Oqtane)

        /// <summary>
        /// Creates a dispatcher that can render HTML and Razor user templates.
        /// Use this constructor in Oqtane / platform-agnostic builds.
        /// </summary>
        /// <param name="tokenProcessor">
        /// Processor responsible for <see cref="UserTemplateKind.Html"/> templates
        /// (MegaForm token substitution / DDR-style XSLT pipeline). Required.
        /// </param>
        /// <param name="razorInterpreter">
        /// Processor responsible for <see cref="UserTemplateKind.Razor"/>
        /// (.cshtml) templates (the MegaForm Razor subset interpreter).
        /// Required.
        /// </param>
        /// <exception cref="ArgumentNullException">
        /// Thrown if either processor reference is null. We fail fast on
        /// construction so a misconfigured DI container does not silently
        /// hand back a half-working dispatcher.
        /// </exception>
        public UserTemplateProcessorDispatcher(
            IUserTemplateProcessor tokenProcessor,
            IUserTemplateProcessor razorInterpreter)
            : this(tokenProcessor, razorInterpreter, null)
        {
        }

        /// <summary>
        /// Creates a dispatcher that can render HTML, Razor and ASCX user
        /// templates. Use this overload from the DNN wiring layer to inject the
        /// DNN-only ASCX host processor; on Oqtane pass <c>null</c> (or use the
        /// two-argument constructor instead).
        /// </summary>
        /// <param name="tokenProcessor">HTML token processor. Required.</param>
        /// <param name="razorInterpreter">Razor subset interpreter. Required.</param>
        /// <param name="ascxProcessor">
        /// DNN-only ASCX host processor, or <c>null</c> when the dispatcher
        /// must reject .ascx requests with a friendly error.
        /// </param>
        /// <exception cref="ArgumentNullException">
        /// Thrown if either <paramref name="tokenProcessor"/> or
        /// <paramref name="razorInterpreter"/> is null. The ASCX processor is
        /// allowed to be null because not every host can supply it.
        /// </exception>
        public UserTemplateProcessorDispatcher(
            IUserTemplateProcessor tokenProcessor,
            IUserTemplateProcessor razorInterpreter,
            IUserTemplateProcessor ascxProcessor)
        {
            if (tokenProcessor == null) throw new ArgumentNullException(nameof(tokenProcessor));
            if (razorInterpreter == null) throw new ArgumentNullException(nameof(razorInterpreter));

            _tokenProcessor = tokenProcessor;
            _razorInterpreter = razorInterpreter;
            _ascxProcessor = ascxProcessor; // optional
        }

        /// <summary>
        /// Renders the supplied template source against the model, picking the
        /// processor by the extension of <paramref name="templateFilePath"/>.
        /// </summary>
        /// <param name="templateFilePath">
        /// Full or relative path of the template on disk. Only the file
        /// extension is inspected here; the dispatcher does NOT re-read the
        /// file. Callers are responsible for reading the bytes off disk and
        /// handing them in via <paramref name="templateSource"/>. The path may
        /// be empty (the result is <see cref="UserTemplateKind.Unknown"/>, i.e.
        /// rejected) but must not be null.
        /// </param>
        /// <param name="templateSource">Raw template content read from disk.</param>
        /// <param name="model">
        /// The data model exposed to the template (see
        /// <see cref="UserTemplateModel"/>). May be null when the template has
        /// no row/form context; processors are expected to tolerate that.
        /// </param>
        /// <returns>
        /// A populated <see cref="UserTemplateRenderResult"/>. Success carries
        /// the rendered HTML in <see cref="UserTemplateRenderResult.Html"/>;
        /// failure carries a human-readable message in
        /// <see cref="UserTemplateRenderResult.Error"/>. The dispatcher never
        /// throws — every exception path is converted into an Error string.
        /// </returns>
        public UserTemplateRenderResult Render(
            string templateFilePath,
            string templateSource,
            UserTemplateModel model)
        {
            // --- 1. Defensive null/empty handling for the path -------------------
            // We treat a null/empty path the same as "unknown extension" so the
            // caller gets a consistent error envelope instead of a NullReference
            // somewhere deeper. The path itself is only used for classification;
            // we never touch the file system here.
            string ext;
            try
            {
                ext = string.IsNullOrEmpty(templateFilePath)
                    ? null
                    : Path.GetExtension(templateFilePath);
            }
            catch (ArgumentException)
            {
                // Path.GetExtension throws on illegal chars on net472. Treat the
                // same way as an unknown extension so we surface a clean error.
                ext = null;
            }

            var kind = UserTemplateKindResolver.FromExtension(ext);

            // --- 2. Route to the matching processor -----------------------------
            switch (kind)
            {
                case UserTemplateKind.Html:
                    return Invoke(_tokenProcessor, templateSource, model, "HTML token");

                case UserTemplateKind.Razor:
                    return Invoke(_razorInterpreter, templateSource, model, "Razor");

                case UserTemplateKind.Ascx:
                    // ASCX is DNN-only. If the DNN wiring code injected a
                    // processor, use it; otherwise return a friendly error so
                    // the Oqtane caller knows exactly why nothing rendered.
                    if (_ascxProcessor == null)
                    {
                        return Fail("ASCX templates can only be rendered on DNN. Use the DNN-side AscxHostWidget.");
                    }
                    return Invoke(_ascxProcessor, templateSource, model, "ASCX");

                case UserTemplateKind.Unknown:
                default:
                    return Fail("Unknown template extension");
            }
        }

        // -------------------------------------------------------------------------
        // Internal helpers
        // -------------------------------------------------------------------------

        /// <summary>
        /// Invokes the supplied processor inside a try/catch so any exception is
        /// converted into a populated <see cref="UserTemplateRenderResult"/>
        /// with a human-readable error message. The dispatcher contract
        /// guarantees that it never propagates exceptions to its caller — that
        /// way a single broken template cannot blow up a whole MegaForm page.
        /// </summary>
        /// <param name="processor">The IUserTemplateProcessor to delegate to.</param>
        /// <param name="templateSource">Raw template content.</param>
        /// <param name="model">Data model for the render.</param>
        /// <param name="kindLabel">
        /// Short human-readable label (e.g. "HTML token", "Razor", "ASCX") used
        /// to prefix any error message returned by this method.
        /// </param>
        private static UserTemplateRenderResult Invoke(
            IUserTemplateProcessor processor,
            string templateSource,
            UserTemplateModel model,
            string kindLabel)
        {
            // A null processor at this point indicates a wiring bug, not a user
            // template problem — but we still convert it to an Error rather than
            // throw so the page renders something useful.
            if (processor == null)
            {
                return Fail(kindLabel + " processor is not configured.");
            }

            try
            {
                var html = processor.Render(templateSource ?? string.Empty, model);
                return Success(html ?? string.Empty);
            }
            catch (Exception ex)
            {
                // We collapse to ex.Message rather than ex.ToString() — the result
                // is rendered to a HTML page and we do not want stack traces
                // bleeding into customer pages. Logging the full exception is the
                // host's responsibility, not the dispatcher's.
                return Fail(kindLabel + " template render failed: " + ex.Message);
            }
        }

        /// <summary>
        /// Builds a successful <see cref="UserTemplateRenderResult"/> envelope.
        /// </summary>
        private static UserTemplateRenderResult Success(string html)
        {
            return new UserTemplateRenderResult
            {
                Success = true,
                Html = html,
                Error = null
            };
        }

        /// <summary>
        /// Builds a failed <see cref="UserTemplateRenderResult"/> envelope.
        /// </summary>
        private static UserTemplateRenderResult Fail(string error)
        {
            return new UserTemplateRenderResult
            {
                Success = false,
                Html = null,
                Error = error
            };
        }
    }
}
