using System.Collections.Generic;
using MegaForm.Core.Models;

namespace MegaForm.DNN.ViewModels
{
    /// <summary>
    /// ViewModel for the form builder (admin Edit view).
    /// </summary>
    public class FormBuilderViewModel
    {
        public int ModuleId { get; set; }
        public int PortalId { get; set; }
        public int TabId { get; set; }
        public FormInfo Form { get; set; }
        public FormSchema Schema { get; set; }
        public FormStatsInfo Stats { get; set; }
        public string ApiBaseUrl { get; set; }
        public string AntiForgeryToken { get; set; }
        public List<string> PluginScripts { get; set; } = new List<string>();
        public List<string> PluginStyles { get; set; } = new List<string>();

        /// <summary>
        /// Serialized field type definitions for the drag-and-drop builder UI.
        /// </summary>
        public List<FieldTypeDefinition> AvailableFieldTypes { get; set; } = GetDefaultFieldTypes();

        private static List<FieldTypeDefinition> GetDefaultFieldTypes()
        {
            return new List<FieldTypeDefinition>
            {
                new FieldTypeDefinition { Type = "Text", Label = "Short Text", Icon = "fa-font", Category = "Basic" },
                new FieldTypeDefinition { Type = "Textarea", Label = "Long Text", Icon = "fa-align-left", Category = "Basic" },
                new FieldTypeDefinition { Type = "Email", Label = "Email", Icon = "fa-envelope", Category = "Basic" },
                new FieldTypeDefinition { Type = "Number", Label = "Number", Icon = "fa-hashtag", Category = "Basic" },
                new FieldTypeDefinition { Type = "Date", Label = "Date", Icon = "fa-calendar", Category = "Basic" },
                new FieldTypeDefinition { Type = "Select", Label = "Dropdown", Icon = "fa-caret-square-down", Category = "Basic" },
                new FieldTypeDefinition { Type = "Radio", Label = "Radio Buttons", Icon = "fa-dot-circle", Category = "Basic" },
                new FieldTypeDefinition { Type = "Checkbox", Label = "Checkboxes", Icon = "fa-check-square", Category = "Basic" },
                new FieldTypeDefinition { Type = "File", Label = "File Upload", Icon = "fa-paperclip", Category = "Advanced" },
                new FieldTypeDefinition { Type = "Phone", Label = "Phone", Icon = "fa-phone", Category = "Advanced" },
                new FieldTypeDefinition { Type = "Url", Label = "Website URL", Icon = "fa-link", Category = "Advanced" },
                new FieldTypeDefinition { Type = "Rating", Label = "Rating", Icon = "fa-star", Category = "Advanced" },
                new FieldTypeDefinition { Type = "Signature", Label = "Signature", Icon = "fa-signature", Category = "Advanced" },
                new FieldTypeDefinition { Type = "FullName", Label = "Full Name", Icon = "fa-user", Category = "Composite" },
                new FieldTypeDefinition { Type = "Address", Label = "Address", Icon = "fa-map-marker-alt", Category = "Composite" },
                new FieldTypeDefinition { Type = "Html", Label = "HTML Content", Icon = "fa-code", Category = "Layout" },
                new FieldTypeDefinition { Type = "Section", Label = "Section Break", Icon = "fa-minus", Category = "Layout" },
                new FieldTypeDefinition { Type = "Hidden", Label = "Hidden Field", Icon = "fa-eye-slash", Category = "Layout" },
            };
        }
    }

    public class FieldTypeDefinition
    {
        public string Type { get; set; }
        public string Label { get; set; }
        public string Icon { get; set; }
        public string Category { get; set; }
    }

    /// <summary>
    /// ViewModel for the public form rendering view.
    /// </summary>
    public class FormRenderViewModel
    {
        public int FormId { get; set; }
        public string Title { get; set; }
        public string Description { get; set; }
        public FormSchema Schema { get; set; }
        public string SubmitButtonText { get; set; }
        public bool EnableCaptcha { get; set; }
        public bool EnableSaveResume { get; set; }
        public bool RequireAuth { get; set; }
        public bool IsAuthenticated { get; set; }
        public string ThemeJson { get; set; }
        public string SettingsJson { get; set; }
        public string ApiBaseUrl { get; set; }
        public string CaptchaBadgeVersion { get; set; }
        public string ReCaptchaSiteKey { get; set; }
        public string HCaptchaSiteKey { get; set; }
        public string ResumeToken { get; set; }
        public string PrefilledDataJson { get; set; }

        // Anti-spam
        public string HoneypotFieldName { get; set; }
        public long FormLoadTimestamp { get; set; }

        // Plugin files auto-detected from /plugins/ folder
        public List<string> PluginScripts { get; set; } = new List<string>();
        public List<string> PluginStyles { get; set; } = new List<string>();

        // Multi-view support
        public string ActiveViewType { get; set; }       // list, detail, card, edit (null=edit)
        public string ActiveViewConfigJson { get; set; }  // JSON config for the active view
        public string ActiveQueryKey { get; set; }        // named app query bound to the active view
        public int ActiveRecordId { get; set; }           // submission ID for detail/edit views

        // AppScope — inter-instance communication
        public string AppScope { get; set; }              // data isolation scope (articles, forum...)
        public string BusChannel { get; set; }            // event bus channel (defaults to AppScope)
        public string DetailModuleId { get; set; }        // target module for detail on click

        // Style / Theme
        public string ThemeClass { get; set; }            // CSS theme class applied to form wrapper (e.g. mf-theme-dark-elegance)
        public string CssOverride { get; set; }           // inline CSS variable overrides
        public string SelectedThemePresetKey { get; set; } // module-saved preset theme key for standardized template selectors
        public string InitialInlineCss { get; set; }        // first-paint scoped preset CSS rendered server-side
        public string ModuleCss { get; set; }               // [SingleSource B260] full composed CSS (preset+scoped+customCss+compat+override) — the ONE server block
        public string WrapperRuntimeClasses { get; set; }   // [SingleSource B260] mf-theme-*/mf-style-*/mf-hide-header classes for the wrapper
        public bool AutoQrCodeEnabled { get; set; }         // module setting: auto-inject QR corner on live/public render
        public string AutoQrCodeHtml { get; set; }          // prebuilt QR corner markup injected by host when AutoQrCodeEnabled=true

        // Configuration Panel
        public bool ShowConfigPanel { get; set; }         // true = show config UI instead of form
        public bool IsAdmin { get; set; }                 // current user is admin
        public bool IsInEditMode { get; set; }            // DNN page is in Edit mode (PortalModuleBase.IsEditable)
        public int ModuleId { get; set; }                 // DNN module ID
        public int TabId { get; set; }                    // DNN tab ID
        public string FormsJson { get; set; }             // available forms for dropdown
        public string ModuleConfigJson { get; set; }      // current module view config
        public string ModuleMode { get; set; }            // render | renderer_host | admin_dashboard
        public bool IsAdminDashboardMode { get; set; }    // DNN admin dashboard mode keeps dock/dashboard alive for admins outside Edit mode

        // Builder support (used when ShowConfigPanel = true → full-screen builder)
        public string SchemaJson { get; set; }            // raw schema JSON for data-schema-json attribute
        public string FormStatus { get; set; }            // "draft" | "published" for builder badge
        public bool LiveRenderMode { get; set; }         // query-string public render host mode
        public bool EmbedMode { get; set; }              // minimal iframe/embed host mode

        // Resolved schema JSON (raw string from RenderModelResolver — preserves all TS field
        // properties including those not modelled in FormField C# class, e.g. optionColumns).
        // Use this for MegaFormRenderer.init({ schema }) instead of JsonConvert.SerializeObject(Schema).
        public string ResolvedSchemaJson { get; set; }
    }

    /// <summary>
    /// ViewModel for submissions list (admin).
    /// </summary>
    public class SubmissionsListViewModel
    {
        public int FormId { get; set; }
        public string FormsJson { get; set; }
        public FormInfo Form { get; set; }
        public FormSchema Schema { get; set; }
        public List<SubmissionInfo> Submissions { get; set; }
        public int TotalCount { get; set; }
        public int FormsCount { get; set; }
        public int PageIndex { get; set; }
        public int PageSize { get; set; }
        public string ApiBaseUrl { get; set; }
        public string WorkflowInboxUrl { get; set; }
    }

    /// <summary>
    /// ViewModel for "My Forms" dashboard (admin).
    /// </summary>
    public class FormListViewModel
    {
        public int ModuleId { get; set; }
        public int PortalId { get; set; }
        public int TabId { get; set; }
        public string ApiBaseUrl { get; set; }
        public List<FormInfo> Forms { get; set; } = new List<FormInfo>();
        public Dictionary<int, FormStatsInfo> Stats { get; set; } = new Dictionary<int, FormStatsInfo>();
    }
}
