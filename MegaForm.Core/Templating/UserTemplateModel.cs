using System.Collections.Generic;

namespace MegaForm.Core.Templating
{
    /// <summary>
    /// Data model handed to every BYOM (Bring-Your-Own-Module) user template processor
    /// (HTML, Razor and ASCX) at render time. The same shape is reused so a single
    /// template authoring guide applies across all three engines.
    /// </summary>
    public sealed class UserTemplateModel
    {
        /// <summary>
        /// Identifier of the form whose context is being rendered (string so that
        /// both numeric DNN form ids and GUID-style Oqtane ids fit).
        /// </summary>
        public string FormId { get; set; }

        /// <summary>
        /// Key of the field/widget that owns this template (for example the
        /// DataRepeater field name). Empty when the template is rendered at form
        /// scope rather than field scope.
        /// </summary>
        public string FieldKey { get; set; }

        /// <summary>
        /// Current row of data when the template is rendered inside a
        /// DataRepeater-like (per-row) context. Null in form-scope rendering.
        /// </summary>
        public IDictionary<string, object> Row { get; set; }

        /// <summary>
        /// Submission / field values for the surrounding form. Lets a widget read
        /// sibling field values (for example a status field on the parent form).
        /// </summary>
        public IDictionary<string, object> Form { get; set; }

        /// <summary>
        /// Merge of SQL parameters and current query-string values, used by HTML
        /// token substitution and exposed to Razor/ASCX templates as @Model.Params.
        /// </summary>
        public IDictionary<string, object> Params { get; set; }

        /// <summary>
        /// All rows when the template is rendered in multi-row (grid/list) mode.
        /// Mutually exclusive with <see cref="Row"/> in practice but both can be
        /// populated when a template wants summary access to the whole set.
        /// </summary>
        public IList<IDictionary<string, object>> Rows { get; set; }

        /// <summary>
        /// Widget-level settings as defined in the form designer (column layout,
        /// pagination size, custom flags etc.).
        /// </summary>
        public IDictionary<string, object> Settings { get; set; }
    }

    /// <summary>
    /// Optional opt-in contract that an ASCX code-behind can implement to receive
    /// the strongly-typed <see cref="UserTemplateModel"/> when the ASCX processor
    /// instantiates it. ASCX files that do not implement this interface still
    /// render, they just do not get the data model handed to them.
    /// </summary>
    public interface IMegaFormUserTemplate
    {
        /// <summary>
        /// Invoked by the ASCX processor after the control is instantiated and
        /// before its lifecycle events run. Implementers should copy the values
        /// they need onto control properties for downstream use.
        /// </summary>
        /// <param name="model">The data model for this render.</param>
        void Bind(UserTemplateModel model);
    }

    /// <summary>
    /// Discrete template kinds recognized by the BYOM pipeline. Anything that is
    /// not HTML/Razor/ASCX resolves to <see cref="Unknown"/> and is rejected by
    /// the dispatcher.
    /// </summary>
    public enum UserTemplateKind
    {
        /// <summary>Plain HTML with MegaForm token substitution.</summary>
        Html,

        /// <summary>Razor (.cshtml) rendered via the Roslyn JIT runtime.</summary>
        Razor,

        /// <summary>ASP.NET Web Forms user control (.ascx).</summary>
        Ascx,

        /// <summary>Unrecognized / unsupported template format.</summary>
        Unknown
    }

    /// <summary>
    /// Helper that classifies a file extension into a <see cref="UserTemplateKind"/>.
    /// Centralized here so the auto-discovery scanner and the runtime dispatcher
    /// agree on which extensions are supported.
    /// </summary>
    public static class UserTemplateKindResolver
    {
        /// <summary>
        /// Resolves a file extension (with or without a leading dot, in any case)
        /// to its <see cref="UserTemplateKind"/>. Returns <see cref="UserTemplateKind.Unknown"/>
        /// for null, whitespace or unsupported extensions.
        /// </summary>
        /// <param name="ext">A file extension such as ".cshtml", "html" or "ASCX".</param>
        public static UserTemplateKind FromExtension(string ext)
        {
            if (string.IsNullOrWhiteSpace(ext)) return UserTemplateKind.Unknown;
            ext = ext.TrimStart('.').ToLowerInvariant();
            switch (ext)
            {
                case "html":
                case "htm":
                    return UserTemplateKind.Html;
                case "cshtml":
                    return UserTemplateKind.Razor;
                case "ascx":
                    return UserTemplateKind.Ascx;
                default:
                    return UserTemplateKind.Unknown;
            }
        }
    }

    /// <summary>
    /// Common contract implemented by each BYOM template engine (HTML token
    /// substituter, Razor JIT renderer, ASCX host). The dispatcher selects a
    /// processor by matching <see cref="Kind"/> against the resolved
    /// <see cref="UserTemplateKind"/> for the file.
    /// </summary>
    public interface IUserTemplateProcessor
    {
        /// <summary>The template family this processor handles.</summary>
        UserTemplateKind Kind { get; }

        /// <summary>
        /// Renders the supplied template source against the given model and
        /// returns the resulting HTML. Implementations may throw on hard errors;
        /// the dispatcher wraps them into <see cref="UserTemplateRenderResult"/>.
        /// </summary>
        /// <param name="templateSource">Raw template content read from disk.</param>
        /// <param name="model">Data model exposed to the template.</param>
        string Render(string templateSource, UserTemplateModel model);
    }

    /// <summary>
    /// Result envelope returned by the BYOM dispatcher. Carries either the
    /// rendered HTML on success, or a human-readable error message when a
    /// processor failed, so callers never have to swallow exceptions themselves.
    /// </summary>
    public sealed class UserTemplateRenderResult
    {
        /// <summary>True when <see cref="Html"/> is safe to emit to the page.</summary>
        public bool Success { get; set; }

        /// <summary>Rendered HTML when <see cref="Success"/> is true.</summary>
        public string Html { get; set; }

        /// <summary>Human-readable error message when <see cref="Success"/> is false.</summary>
        public string Error { get; set; }
    }
}
