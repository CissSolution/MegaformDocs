using System.Collections.Generic;

namespace MegaForm.Core.Templating
{
    /// <summary>
    /// Self-describing manifest of a single BYOM (Bring-Your-Own-Module) user
    /// template living under <c>~/DesktopModules/MegaForm/Resources/UserTemplates/&lt;Name&gt;/</c>
    /// (DNN) or the equivalent Oqtane path. One descriptor corresponds to one
    /// <c>widget.xml</c> file and the sibling <c>template.{html|cshtml|ascx}</c>
    /// it points at.
    /// </summary>
    /// <remarks>
    /// Produced by <see cref="UserTemplateManifestParser"/> during auto-discovery
    /// and consumed by:
    /// <list type="bullet">
    ///   <item>the BYOM auto-discovery scanner (lists templates in the builder UI),</item>
    ///   <item>the <c>UserTemplateController</c> Web API (returns this shape as JSON),</item>
    ///   <item>the runtime dispatcher (uses <see cref="Kind"/> + <see cref="TemplateFilePath"/>
    ///         to select the matching <see cref="IUserTemplateProcessor"/>).</item>
    /// </list>
    /// On parse failure the descriptor is still returned with <see cref="ErrorMessage"/>
    /// populated so the scanner can surface broken templates to the author
    /// rather than silently dropping them.
    /// </remarks>
    public sealed class UserTemplateDescriptor
    {
        /// <summary>
        /// Folder name that contains the template; doubles as the unique
        /// per-portal identifier (e.g. <c>"blog-card"</c>). Never null after a
        /// successful parse.
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// Human-friendly name as declared by the manifest's <c>&lt;name&gt;</c>
        /// element. Falls back to <see cref="Name"/> when the element is missing
        /// or whitespace-only.
        /// </summary>
        public string DisplayName { get; set; }

        /// <summary>
        /// Builder-facing label used when no manifest is present (stub
        /// descriptors). Distinct from <see cref="DisplayName"/> because the
        /// scanner derives it by humanizing the folder name even when the
        /// manifest is broken or missing.
        /// </summary>
        public string Label { get; set; }

        /// <summary>
        /// Absolute disk path to the template folder
        /// (e.g. <c>C:\inetpub\.../UserTemplates/blog-card</c>). Populated by
        /// the scanner so callers (dispatcher, asset URL helpers) do not have
        /// to recompute it from the manifest path.
        /// </summary>
        public string FolderAbsolutePath { get; set; }

        /// <summary>
        /// Virtual path to the template folder
        /// (<c>~/DesktopModules/MegaForm/Resources/UserTemplates/blog-card</c>).
        /// Doubles as the base href when emitting <c>&lt;script&gt;</c> /
        /// <c>&lt;link&gt;</c> tags for the template's companion assets.
        /// </summary>
        public string FolderVirtualPath { get; set; }

        /// <summary>
        /// Discrete template engine (<see cref="UserTemplateKind.Razor"/>,
        /// <see cref="UserTemplateKind.Html"/> or <see cref="UserTemplateKind.Ascx"/>).
        /// When <c>&lt;kind&gt;</c> is absent the parser infers the value from the
        /// existing <c>template.*</c> file in the folder.
        /// </summary>
        public UserTemplateKind Kind { get; set; }

        /// <summary>
        /// Optional grouping label used by the builder gallery
        /// (e.g. <c>"Cards"</c>, <c>"Reports"</c>). Comes from the manifest's
        /// <c>&lt;category&gt;</c> element.
        /// </summary>
        public string Category { get; set; }

        /// <summary>
        /// Free-form description shown in the builder tooltip / details pane.
        /// Comes from the manifest's <c>&lt;description&gt;</c> element.
        /// </summary>
        public string Description { get; set; }

        /// <summary>
        /// Absolute disk path to the resolved <c>template.cshtml</c> /
        /// <c>template.html</c> / <c>template.ascx</c>. Used by the in-process
        /// processors when reading the source. Empty when the parser could not
        /// locate any template file in the folder.
        /// </summary>
        public string TemplateFilePath { get; set; }

        /// <summary>
        /// Virtual path to the template file in the form
        /// <c>~/DesktopModules/MegaForm/Resources/UserTemplates/&lt;Name&gt;/template.&lt;ext&gt;</c>.
        /// Used by the ASCX host (<c>Page.LoadControl</c>) and by the asset URL
        /// helpers for HTML/Razor.
        /// </summary>
        public string TemplateVirtualPath { get; set; }

        /// <summary>
        /// Optional virtual path to a thumbnail image
        /// (<c>~/.../thumbnail.png</c>) used by the builder gallery. Null when
        /// the folder does not ship a thumbnail.
        /// </summary>
        public string ThumbnailVirtualPath { get; set; }

        /// <summary>
        /// True when the manifest declares <c>&lt;requires&gt;&lt;sqlContext/&gt;&lt;/requires&gt;</c>,
        /// meaning the host form must expose a SQL data context (Rows / Row
        /// populated) before this template can render.
        /// </summary>
        public bool RequiresSqlContext { get; set; }

        /// <summary>
        /// Designer-exposed parameters declared under
        /// <c>&lt;params&gt;&lt;param ... /&gt;&lt;/params&gt;</c>. Always non-null
        /// (empty list when the manifest has no params block) so callers do not
        /// need to null-check.
        /// </summary>
        public IList<UserTemplateParam> Params { get; set; }

        /// <summary>
        /// Fields the host form must define for this template to work
        /// (declared under <c>&lt;requiredFields&gt;&lt;field ... /&gt;&lt;/requiredFields&gt;</c>).
        /// Always non-null.
        /// </summary>
        public IList<UserTemplateRequiredField> RequiredFields { get; set; }

        /// <summary>
        /// Optional JavaScript files the template needs at runtime, declared as
        /// <c>&lt;scripts&gt;&lt;script&gt;x.js&lt;/script&gt;&lt;/scripts&gt;</c>.
        /// Paths are stored as-authored; the runtime resolves them against the
        /// template folder when emitting <c>&lt;script&gt;</c> tags. Always non-null.
        /// </summary>
        public IList<string> Scripts { get; set; }

        /// <summary>
        /// Optional CSS files the template needs at runtime, declared as
        /// <c>&lt;stylesheets&gt;&lt;stylesheet&gt;x.css&lt;/stylesheet&gt;&lt;/stylesheets&gt;</c>.
        /// Always non-null.
        /// </summary>
        public IList<string> Stylesheets { get; set; }

        /// <summary>
        /// Virtual path to the <c>widget.xml</c> manifest that produced this
        /// descriptor. Used for cache-keying and for surfacing the source file
        /// in error messages.
        /// </summary>
        public string ManifestVirtualPath { get; set; }

        /// <summary>
        /// Non-null when the descriptor failed to load fully (XML invalid,
        /// template file missing, etc.). The scanner displays this message
        /// inline in the builder gallery instead of swallowing the error.
        /// </summary>
        public string ErrorMessage { get; set; }
    }

    /// <summary>
    /// A single designer-exposed parameter declared in
    /// <c>&lt;params&gt;&lt;param ... /&gt;&lt;/params&gt;</c>. The builder
    /// inspector renders one input per param using <see cref="Type"/>.
    /// </summary>
    public sealed class UserTemplateParam
    {
        /// <summary>
        /// Identifier used as the property key when the value is passed to the
        /// template engine (e.g. <c>"accentColor"</c>).
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// Input type the builder inspector should render. Supported values:
        /// <c>"color"</c>, <c>"bool"</c>, <c>"int"</c>, <c>"text"</c>,
        /// <c>"enum"</c>. Unknown types fall back to a plain text input.
        /// </summary>
        public string Type { get; set; }

        /// <summary>
        /// Default value emitted into the form definition when the author has
        /// not customised the param. Stored as the raw manifest string; the
        /// runtime converts to the appropriate CLR type based on <see cref="Type"/>.
        /// </summary>
        public string DefaultValue { get; set; }

        /// <summary>
        /// Human-friendly label shown next to the input in the builder
        /// inspector. Falls back to <see cref="Name"/> when not supplied.
        /// </summary>
        public string Label { get; set; }
    }

    /// <summary>
    /// A field the host MegaForm form must define for the template to render
    /// correctly (declared under <c>&lt;requiredFields&gt;</c>). The auto-repair
    /// flow consults this list when wiring a template into a new form.
    /// </summary>
    public sealed class UserTemplateRequiredField
    {
        /// <summary>
        /// Field key as it must appear on the host form (e.g. <c>"customerId"</c>).
        /// </summary>
        public string Key { get; set; }

        /// <summary>
        /// MegaForm <c>FieldType</c> name (e.g. <c>"Text"</c>, <c>"Select"</c>).
        /// Stored as a string so the parser stays decoupled from the
        /// <c>MegaForm.Core.Models.FieldType</c> enum.
        /// </summary>
        public string Type { get; set; }

        /// <summary>
        /// Optional human-friendly label suggested to the author when the
        /// auto-repair flow adds the field to a form.
        /// </summary>
        public string Label { get; set; }
    }
}
