// MegaForm Razor Widget — runtime API contract
// ──────────────────────────────────────────────────────────────────────
// Razor widget templates ship as .razor files under MegaForm.Oqtane.Server/
// RazorWidgets/. Each template subclasses MfRazorWidgetBase and gets these
// services injected via Blazor [Inject] or constructor.
//
// On the DNN side, the server-render endpoint instantiates a static
// IHttpContextAccessor-backed proxy of each service so the same template
// code works without Blazor circuit.
//
// Architecture goal: cover the use cases of legacy proprietary tag-language
// modules (the typical [[Token]]/templated-HTML surface) AND go beyond them
// with full Razor C# + LINQ + IntelliSense + Roslyn JIT compile workflow.
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MegaForm.Core.Interfaces
{
    /// <summary>
    /// Form-level context: the values currently in formData (live), submission
    /// metadata, form metadata. Reading from this auto-subscribes the widget
    /// to re-render when listed fields in widgetProps.dependsOn change.
    /// </summary>
    public interface IMfFormContext
    {
        /// <summary>Get current value of any field by key (snake_case).</summary>
        object GetField(string key);

        /// <summary>Typed accessor — throws if conversion fails.</summary>
        T GetField<T>(string key);

        /// <summary>Try-get pattern for nullable fields.</summary>
        bool TryGetField<T>(string key, out T value);

        /// <summary>Entire formData snapshot as a dictionary.</summary>
        IReadOnlyDictionary<string, object> GetAllFields();

        /// <summary>Submission metadata (id, createdOnUtc, userId). Null when previewing inside Builder.</summary>
        MfSubmissionInfo Submission { get; }

        /// <summary>Form metadata (formId, title, theme, settings).</summary>
        MfFormInfo Form { get; }

        /// <summary>URL query parameters at form-view time.</summary>
        IReadOnlyDictionary<string, string> UrlQuery { get; }
    }

    /// <summary>Current user identity + roles.</summary>
    public interface IMfUserContext
    {
        int Id { get; }
        string Email { get; }
        string DisplayName { get; }
        IReadOnlyList<string> Roles { get; }
        bool IsAuthenticated { get; }
        bool IsHost { get; }
        bool IsAdmin { get; }
        bool IsInRole(string roleName);
    }

    /// <summary>Site / portal context: settings, connection registry.</summary>
    public interface IMfSiteContext
    {
        int PortalId { get; }
        int SiteId { get; }
        string Locale { get; }
        string GetSetting(string key, string defaultValue = "");
    }

    /// <summary>
    /// Ad-hoc SQL access. Widget code can run additional queries beyond the
    /// declarative widgetProps.masterQuery. Parameter binding is safe (named
    /// parameters, no string concat).
    /// </summary>
    public interface IMfSqlExecutor
    {
        /// <summary>Run a query and return rows as dynamic objects.</summary>
        Task<IEnumerable<dynamic>> QueryAsync(string sql, object parameters = null, string connectionKey = "DashboardDatabase");

        /// <summary>Run a query and return a single scalar value.</summary>
        Task<T> ExecuteScalarAsync<T>(string sql, object parameters = null, string connectionKey = "DashboardDatabase");

        /// <summary>Run a stored procedure.</summary>
        Task<IEnumerable<dynamic>> StoredProcAsync(string name, object parameters = null, string connectionKey = "DashboardDatabase");
    }

    /// <summary>
    /// Output channel — widget reports its computed value(s) back to the form.
    /// Renderer writes the emitted object into formData[widgetKey] so the
    /// value persists across re-renders + lands in the submission JSON.
    /// </summary>
    public interface IMfRazorEmitter
    {
        /// <summary>
        /// Write a value into formData[widgetKey]. Convention for object
        /// shape: at minimum {displayValue, rawValue}. Listview shows
        /// displayValue, exports use rawValue, downstream rules can test
        /// either via dot-path (e.g. "calc.rawValue > 1000").
        /// </summary>
        Task EmitValueAsync(object value);

        /// <summary>
        /// Dispatch a named event into the form's rule engine.
        /// Example: chart bar click → DispatchEventAsync("drilldown",
        /// new {month="Jun"}) → form rules can react via when:event=drilldown.
        /// </summary>
        Task DispatchEventAsync(string eventName, object payload = null);

        /// <summary>
        /// Force another field to re-render (e.g. after this widget changes
        /// a value other widgets depend on).
        /// </summary>
        Task RefreshFieldAsync(string fieldKey);
    }

    public class MfSubmissionInfo
    {
        public long Id { get; set; }
        public System.DateTime CreatedOnUtc { get; set; }
        public int? UserId { get; set; }
        public string Status { get; set; }
    }

    public class MfFormInfo
    {
        public long FormId { get; set; }
        public string Title { get; set; }
        public string Theme { get; set; }
        public IReadOnlyDictionary<string, object> Settings { get; set; }
    }

    /// <summary>
    /// Attribute placed on each .razor template to surface metadata to
    /// the registry: display name, description, default widgetProps,
    /// whether it emits a submission value, supports SQL, etc.
    /// </summary>
    [System.AttributeUsage(System.AttributeTargets.Class)]
    public class RazorTemplateAttribute : System.Attribute
    {
        public string Name { get; }
        public string Category { get; set; } = "Display";
        public string Description { get; set; } = "";
        public bool EmitsValue { get; set; } = false;
        public string ValueShape { get; set; } = "object"; // "scalar" | "object"
        public bool SupportsSql { get; set; } = false;
        public bool RequiresInteractive { get; set; } = false; // true → hidden on platforms without .NET runtime

        // [v20260601-recipe] Recipe-tier metadata. Drives the new tile-based
        // Recipe gallery in Studio. IsRecipe=true → surfaces in the gallery;
        // false → still callable but hidden (used for internal helper renders).
        public string Icon { get; set; } = "fa-cube";    // FontAwesome class for tile
        public bool IsRecipe { get; set; } = true;
        public string WhenToUse { get; set; } = "";       // one-line guidance for AI + humans

        public RazorTemplateAttribute(string name)
        {
            Name = name;
        }
    }

    /// <summary>
    /// [v20260601-recipe] Per-parameter metadata for the Recipe gallery
    /// auto-generated params form. Read by RazorWidgetRegistry to enrich
    /// the /List endpoint. Backwards compatible — properties without this
    /// attribute fall back to defaults (text widget, no group, untyped).
    /// </summary>
    [System.AttributeUsage(System.AttributeTargets.Property)]
    public class RazorParamAttribute : System.Attribute
    {
        public string Label { get; set; } = "";        // human-readable label
        public string Hint { get; set; } = "";          // help text under input
        public bool Required { get; set; } = false;
        public string Group { get; set; } = "General"; // section header in form
        public string Widget { get; set; } = "text";   // text|number|textarea|select|sql-column|sql|color|bool
        public string Options { get; set; } = "";       // for select widget: csv of values
        public string Placeholder { get; set; } = "";
        public string DefaultText { get; set; } = "";  // string representation of default
        public int Order { get; set; } = 100;
    }
}
