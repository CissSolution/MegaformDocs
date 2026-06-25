using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

namespace MegaForm.Core.Models
{
    /// <summary>
    /// Complete form schema definition — stored as JSON in MF_Forms.SchemaJson.
    /// Inspired by JotForm's field structure with conditional logic support.
    /// </summary>
    public class FormSchema
    {
        [JsonProperty("version")]
        public string Version { get; set; } = "1.0";

        [JsonProperty("fields")]
        public List<FormField> Fields { get; set; } = new List<FormField>();

        [JsonProperty("pages")]
        public List<FormPage> Pages { get; set; }  // null = single page form

        [JsonProperty("settings")]
        public FormSettings Settings { get; set; } = new FormSettings();

        /// <summary>
        /// Whitelisted inline scripts referenced from {{script:*}} tokens in customHtml.
        /// Kept at the schema root so all hosts serialize the same canonical render payload.
        /// </summary>
        [JsonProperty("customScripts")]
        public Dictionary<string, string> CustomScripts { get; set; } = new Dictionary<string, string>();

        /// <summary>
        /// Form-level translations. Key = locale code.
        /// Translates: title, description, submitButtonText, successMessage.
        /// </summary>
        [JsonProperty("translations")]
        public Dictionary<string, FormTranslation> Translations { get; set; }
    }

    /// <summary>
    /// Form-level translated strings for a specific locale.
    /// </summary>
    public class FormTranslation
    {
        [JsonProperty("title")]
        public string Title { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("submitButtonText")]
        public string SubmitButtonText { get; set; }

        [JsonProperty("successMessage")]
        public string SuccessMessage { get; set; }
    }

    /// <summary>
    /// Individual form field definition.
    /// </summary>
    public class FormField
    {
        [JsonProperty("key")]
        public string Key { get; set; }    // unique machine name, e.g. "first_name"

        [JsonProperty("type")]
        public string Type { get; set; }  // "Text", "Email", "PayPal", or any plugin type name

        [JsonProperty("label")]
        public string Label { get; set; }

        [JsonProperty("placeholder")]
        public string Placeholder { get; set; }

        [JsonProperty("helpText")]
        public string HelpText { get; set; }

        [JsonProperty("defaultValue")]
        public string DefaultValue { get; set; }

        [JsonProperty("required")]
        public bool Required { get; set; }

        [JsonProperty("readOnly")]
        public bool ReadOnly { get; set; }

        [JsonProperty("hidden")]
        public bool Hidden { get; set; }

        [JsonProperty("cssClass")]
        public string CssClass { get; set; }

        [JsonProperty("width")]
        public string Width { get; set; }  // e.g. "50%", "col-6"

        [JsonProperty("order")]
        public int Order { get; set; }

        [JsonProperty("pageIndex")]
        public int PageIndex { get; set; }  // for multi-page forms

        // --- Validation ---
        [JsonProperty("validation")]
        public FieldValidation Validation { get; set; }

        // --- Options (for select, radio, checkbox) ---
        [JsonProperty("options")]
        public List<FieldOption> Options { get; set; }

        // --- Conditional Logic ---
        [JsonProperty("showIf")]
        public ShowIfCondition ShowIf { get; set; }

        // --- File-specific settings ---
        [JsonProperty("fileSettings")]
        public FileFieldSettings FileSettings { get; set; }

        // --- HTML / Section ---
        [JsonProperty("htmlContent")]
        public string HtmlContent { get; set; }  // for type=html or section

        // --- Widget properties (payment, slider, address, etc.) ---
        [JsonProperty("widgetProps")]
        public Dictionary<string, object> WidgetProps { get; set; }

        // --- Prefill / Query string mapping ---
        [JsonProperty("prefillParam")]
        public string PrefillParam { get; set; }  // e.g. "?email=" populates this field

        // --- Translations for multilanguage forms ---
        // Key = locale code (e.g. "vi-VN"), Value = translated strings
        // Example: { "vi-VN": { "label": "Họ tên", "placeholder": "Nhập họ tên" } }
        [JsonProperty("translations")]
        public Dictionary<string, FieldTranslation> Translations { get; set; }

        // --- Properties bag for extensibility ---
        [JsonProperty("properties")]
        public Dictionary<string, object> Properties { get; set; }

        // --- Option layout ---
        /// <summary>
        /// Number of columns for Checkbox/Radio option groups (1-4).
        /// 0 = auto (renderer decides based on option count).
        /// Saved by TS builder as field.optionColumns.
        /// </summary>
        [JsonProperty("optionColumns")]
        public int OptionColumns { get; set; }

        /// <summary>
        /// Display variant for Checkbox/Radio options: default, chips, or cards.
        /// </summary>
        [JsonProperty("optionDisplay")]
        public string OptionDisplay { get; set; }

        /// <summary>
        /// Allows sanitized rich HTML labels in the client renderer.
        /// </summary>
        [JsonProperty("allowOptionHtml")]
        public bool AllowOptionHtml { get; set; }

        // --- Row / Columns layout ---
        /// <summary>
        /// For type="Row": defines column layout.
        /// Each column has a span (grid fraction) and nested fields.
        /// </summary>
        [JsonProperty("columns")]
        public List<RowColumn> Columns { get; set; }

    }

    /// <summary>
    /// A column inside a Row field, containing nested fields.
    /// </summary>
    public class RowColumn
    {
        [JsonProperty("span")]
        public int Span { get; set; } = 6;

        [JsonProperty("fields")]
        public List<FormField> Fields { get; set; } = new List<FormField>();
    }

    public enum FieldType
    {
        // Basic
        Text, Textarea, Email, Number, Date, Select, Radio, Checkbox,
        // Advanced
        File, Html, Section, Hidden, Phone, Url, Password, Rating, Signature, DynamicLabel,
        // Widgets
        FullName, Address, Country, PhoneIntl, Time, DateRange, Slider,
        ColorPicker, ImageChoice, Appointment, Terms, Captcha,
        // Layout
        Row,
        // Payment
        PayPal, Stripe, Square, PaymentSummary,
        // Survey
        OpinionScale, Ranking,
        // [v20260530-Razor-P0] Programmable widget with Razor C# template.
        // Picks from a registry of built-in starter templates + customer
        // override via widgetProps.razorSourceOverride (Roslyn JIT compile).
        // Designed for use cases that proprietary tag-language widgets and
        // legacy template engines cannot express — LINQ aggregation, async,
        // component composition, full Razor + IntelliSense workflow.
        Razor,
        // [v20260602-BYOM-L2] Bring-Your-Own-Module widget hosting customer
        // .cshtml / .html / .ascx files dropped into
        // ~/DesktopModules/MegaForm/Resources/UserTemplates/<name>/. Discovered
        // via UserTemplateScanner and rendered server-side via
        // UserTemplateProcessorDispatcher (Token + Razor) or AscxHostWidget.
        UserTemplate,
        // [v20260603-B54] MultiColumnCombo widget — multi-column dropdown with
        // configurable columns + optional SQL backing. Selection emits the
        // configured `displayKey` value as a flat string into the submission
        // payload. Plugin lives at
        // MegaForm.UI/src/widgets/plugins/megaform-widget-multicolumn-combo.ts.
        MultiColumnCombo
    }

    public class FieldValidation
    {
        [JsonProperty("minLength")]
        public int? MinLength { get; set; }

        [JsonProperty("maxLength")]
        public int? MaxLength { get; set; }

        [JsonProperty("min")]
        public double? Min { get; set; }

        [JsonProperty("max")]
        public double? Max { get; set; }

        [JsonProperty("pattern")]
        public string Pattern { get; set; }   // regex

        [JsonProperty("patternMessage")]
        public string PatternMessage { get; set; }

        [JsonProperty("customMessage")]
        public string CustomMessage { get; set; }
    }

    /// <summary>
    /// Translated strings for a field in a specific locale.
    /// Used for multilanguage form content (labels, placeholders, help text, options).
    /// </summary>
    public class FieldTranslation
    {
        [JsonProperty("label")]
        public string Label { get; set; }

        [JsonProperty("placeholder")]
        public string Placeholder { get; set; }

        [JsonProperty("helpText")]
        public string HelpText { get; set; }

        [JsonProperty("htmlContent")]
        public string HtmlContent { get; set; }

        /// <summary>
        /// Translated option labels, keyed by option value.
        /// Example: { "opt1": "Lựa chọn 1", "opt2": "Lựa chọn 2" }
        /// </summary>
        [JsonProperty("options")]
        public Dictionary<string, string> Options { get; set; }
    }

    public class FieldOption
    {
        [JsonProperty("label")]
        public string Label { get; set; }

        [JsonProperty("value")]
        public string Value { get; set; }

        [JsonProperty("selected")]
        public bool Selected { get; set; }

        [JsonProperty("disabled")]
        public bool Disabled { get; set; }

        [JsonProperty("imageUrl")]
        public string ImageUrl { get; set; }   // for image-based options

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("desc")]
        public string Desc { get; set; }

        [JsonProperty("subLabel")]
        public string SubLabel { get; set; }

        [JsonProperty("meta")]
        public string Meta { get; set; }

        [JsonProperty("icon")]
        public string Icon { get; set; }

        [JsonProperty("badge")]
        public string Badge { get; set; }

        [JsonProperty("richHtml")]
        public string RichHtml { get; set; }

        [JsonProperty("labelHtml")]
        public string LabelHtml { get; set; }

        [JsonProperty("html")]
        public string Html { get; set; }

        [JsonProperty("allowHtml")]
        public bool AllowHtml { get; set; }
    }

    /// <summary>
    /// Conditional show/hide — evaluated client-side.
    /// Supports: equals, notEquals, contains, greaterThan, lessThan, isEmpty, isNotEmpty, and/or.
    /// </summary>
    public class ShowIfCondition
    {
        [JsonProperty("operator")]
        [JsonConverter(typeof(StringEnumConverter))]
        public LogicOperator Operator { get; set; } = LogicOperator.And;

        [JsonProperty("rules")]
        public List<ShowIfRule> Rules { get; set; } = new List<ShowIfRule>();
    }

    public class ShowIfRule
    {
        [JsonProperty("field")]
        public string Field { get; set; }       // key of the triggering field

        [JsonProperty("condition")]
        [JsonConverter(typeof(StringEnumConverter))]
        public ConditionType Condition { get; set; }

        [JsonProperty("value")]
        public string Value { get; set; }
    }

    public enum LogicOperator { And, Or }

    public enum ConditionType
    {
        Equals,
        NotEquals,
        Contains,
        NotContains,
        GreaterThan,
        LessThan,
        IsEmpty,
        IsNotEmpty,
        StartsWith,
        EndsWith
    }

    public class FileFieldSettings
    {
        [JsonProperty("maxSizeMB")]
        public int MaxSizeMB { get; set; } = 10;

        [JsonProperty("allowedExtensions")]
        public List<string> AllowedExtensions { get; set; } = new List<string> { ".pdf", ".jpg", ".png", ".docx" };

        [JsonProperty("maxFiles")]
        public int MaxFiles { get; set; } = 1;
    }

    public class FormPage
    {
        [JsonProperty("index")]
        public int Index { get; set; }

        [JsonProperty("title")]
        public string Title { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("showIf")]
        public ShowIfCondition ShowIf { get; set; }  // page-level skip logic
    }

    public class FormSettings
    {
        [JsonProperty("multiPage")]
        public bool MultiPage { get; set; }

        [JsonProperty("displayOnly")]
        public bool DisplayOnly { get; set; }

        // [HideHeader v20260501-02] form-level toggle to hide title+description
        // wrapper (no blank gap). Renderer adds .mf-hide-header class to wrapper
        // and CSS in megaform-widgets-builtin.css collapses any conventional
        // header element (.mfp-card-header / .mf-form-header / etc).
        [JsonProperty("hideHeader")]
        public bool HideHeader { get; set; }

        [JsonProperty("showProgressBar")]
        public bool ShowProgressBar { get; set; } = true;

        [JsonProperty("showPageTitles")]
        public bool ShowPageTitles { get; set; } = true;

        [JsonProperty("honeypotFieldName")]
        public string HoneypotFieldName { get; set; } = "__mf_hp";

        [JsonProperty("rateLimitWindowMinutes")]
        public int RateLimitWindowMinutes { get; set; } = 5;

        [JsonProperty("rateLimitMaxPerWindow")]
        public int RateLimitMaxPerWindow { get; set; } = 3;

        [JsonProperty("enableAnalytics")]
        public bool EnableAnalytics { get; set; } = true;

        [JsonProperty("labelPosition")]
        public string LabelPosition { get; set; } = "top";  // top | left | floating

        [JsonProperty("formWidth")]
        public string FormWidth { get; set; } = "100%";

        [JsonProperty("saveAndContinueDays")]
        public int SaveAndContinueDays { get; set; } = 30;

        [JsonProperty("submitButtonText")]
        public string SubmitButtonText { get; set; } = "Submit";

        /// <summary>
        /// Custom HTML template for the form. Uses {{field:key}} placeholders for fields.
        /// If not empty, renderer uses this instead of auto-generated fields.
        /// </summary>
        [JsonProperty("customHtml")]
        public string CustomHtml { get; set; }

        /// <summary>
        /// Custom CSS styles for the form. Injected into a &lt;style&gt; block.
        /// </summary>
        [JsonProperty("customCss")]
        public string CustomCss { get; set; }

        [JsonProperty("customContent")]
        public Dictionary<string, string> CustomContent { get; set; } = new Dictionary<string, string>();

        [JsonProperty("customScripts")]
        public Dictionary<string, string> CustomScripts { get; set; } = new Dictionary<string, string>();

        [JsonProperty("theme")]
        public string Theme { get; set; }

        [JsonProperty("themeCssOverrides")]
        public Dictionary<string, string> ThemeCssOverrides { get; set; } = new Dictionary<string, string>();

        /// <summary>
        /// [B269] Inline-only page-theme inheritance. When true the rendered form borrows the host
        /// skin's font (server stamps the .mf-inherit-type wrapper class → font-family:inherit).
        /// Ignored for custom-shell / premium forms and inside iframe embeds (no parent to inherit).
        /// Default false → existing forms render unchanged.
        /// </summary>
        [JsonProperty("inheritPageTypography")]
        public bool InheritPageTypography { get; set; }

        /// <summary>
        /// [B269] Inline-only page-theme inheritance. When true the form blends into the host skin's
        /// colours (transparent outer panel + host --bs-primary accent) via injected scoped vars;
        /// body text stays MegaForm's for contrast. Ignored for custom-shell / premium forms and
        /// iframe embeds. Default false → existing forms render unchanged.
        /// </summary>
        [JsonProperty("inheritPageColors")]
        public bool InheritPageColors { get; set; }

        [JsonProperty("defaultLanguage")]
        public string DefaultLanguage { get; set; }

        [JsonProperty("supportedLanguages")]
        public List<string> SupportedLanguages { get; set; } = new List<string>();

        [JsonProperty("previousButtonText")]
        public string PreviousButtonText { get; set; }

        [JsonProperty("nextButtonText")]
        public string NextButtonText { get; set; }

        /// <summary>
        /// Print layout settings. Null = standard web form only.
        /// </summary>
        [JsonProperty("printSettings")]
        public PrintSettings PrintSettings { get; set; }

        /// <summary>
        /// Post-submission experience shown after a successful submit.
        /// Portable across Web / DNN / Oqtane because it is stored in schema settings.
        /// </summary>
        [JsonProperty("postSubmitExperience")]
        public PostSubmitExperience PostSubmitExperience { get; set; } = new PostSubmitExperience();

        /// <summary>
        /// Canonical trial/production render flag resolved server-side.
        /// Renderer should only READ this value and never infer it locally.
        /// </summary>
        [JsonProperty("productionMode")]
        public bool ProductionMode { get; set; } = true;

        /// <summary>
        /// Optional note rendered under the active submit button in trial mode.
        /// Empty in production mode.
        /// </summary>
        [JsonProperty("trialFooterText")]
        public string TrialFooterText { get; set; } = string.Empty;

        /// <summary>
        /// Optional: also INSERT one row into a custom database after default submission saves.
        /// Configured in Builder Settings → Database panel. Disabled by default → existing forms unaffected.
        /// Executed by FormDatabaseInsertService (badge: FormDatabaseInsert v20260430-01).
        /// </summary>
        [JsonProperty("databaseInsert")]
        public FormDatabaseInsertSettings DatabaseInsert { get; set; }

        /// <summary>
        /// [R2 v20260531-01] CRUD lifecycle hooks — pre/post Insert/Update/Delete
        /// SQL slots that run inside the submit transaction. See
        /// MegaForm.Core.Services.LifecycleRunner.
        /// </summary>
        [JsonProperty("lifecycle")]
        public FormLifecycleSettings Lifecycle { get; set; }
    }

    public class FormDatabaseInsertSettings
    {
        [JsonProperty("enabled")]
        public bool Enabled { get; set; }

        [JsonProperty("connectionKey")]
        public string ConnectionKey { get; set; }

        [JsonProperty("databaseType")]
        public string DatabaseType { get; set; }

        /// <summary>
        /// INSERT statement using :paramName placeholders. Param names should match field keys
        /// (or use ParameterMapping to override).
        /// </summary>
        [JsonProperty("insertSql")]
        public string InsertSql { get; set; }

        /// <summary>
        /// Optional override map: ":paramName" → fieldKey. Empty = auto-bind by matching param name to field key.
        /// </summary>
        [JsonProperty("parameterMapping")]
        public Dictionary<string, string> ParameterMapping { get; set; } = new Dictionary<string, string>();
    }

    public class PostSubmitExperience
    {
        [JsonProperty("enabled")]
        public bool Enabled { get; set; } = true;

        [JsonProperty("mode")]
        public string Mode { get; set; } = "rich"; // rich | redirect-immediate | redirect-timed

        [JsonProperty("title")]
        public string Title { get; set; } = "Submission received";

        [JsonProperty("message")]
        public string Message { get; set; } = "Thank you. We have received your submission.";

        [JsonProperty("showSubmissionId")]
        public bool ShowSubmissionId { get; set; } = true;

        [JsonProperty("submissionIdLabel")]
        public string SubmissionIdLabel { get; set; } = "Submission ID";

        [JsonProperty("showAnswerSummary")]
        public bool ShowAnswerSummary { get; set; }

        [JsonProperty("answerSummaryTitle")]
        public string AnswerSummaryTitle { get; set; } = "Your answers";

        [JsonProperty("hideEmptyAnswers")]
        public bool HideEmptyAnswers { get; set; } = true;

        [JsonProperty("allowFillAgain")]
        public bool AllowFillAgain { get; set; } = true;

        [JsonProperty("fillAgainLabel")]
        public string FillAgainLabel { get; set; } = "Submit another response";

        [JsonProperty("redirectUrl")]
        public string RedirectUrl { get; set; }

        [JsonProperty("redirectDelaySeconds")]
        public int RedirectDelaySeconds { get; set; } = 5;

        [JsonProperty("redirectNotice")]
        public string RedirectNotice { get; set; } = "Redirecting shortly…";

        // [ReviewStep v20260619] Optional pre-submit "review / summary" step. These keys
        // are written by the builder into postSubmitExperience; declaring them here keeps
        // them alive through every (de)serialization path (typed Resolve / SettingsJson
        // overlay) so the renderer reliably sees reviewBeforeSubmit:true. Defaults keep
        // existing forms unchanged (review OFF unless the author opts in).
        [JsonProperty("reviewBeforeSubmit")]
        public bool ReviewBeforeSubmit { get; set; }

        [JsonProperty("reviewTitle")]
        public string ReviewTitle { get; set; } = "Review your answers";

        [JsonProperty("buttons")]
        public List<PostSubmitActionButton> Buttons { get; set; } = new List<PostSubmitActionButton>();
    }

    public class PostSubmitActionButton
    {
        [JsonProperty("label")]
        public string Label { get; set; }

        [JsonProperty("url")]
        public string Url { get; set; }

        [JsonProperty("variant")]
        public string Variant { get; set; } = "secondary"; // primary | secondary | ghost

        [JsonProperty("newTab")]
        public bool NewTab { get; set; }
    }

    // ============================================================
    // Print-Ready Form — Supporting Models
    // ============================================================

    public class PrintSettings
    {
        [JsonProperty("enabled")]          public bool   Enabled        { get; set; }
        [JsonProperty("pageSize")]         public string PageSize       { get; set; } = "A4";
        [JsonProperty("orientation")]      public string Orientation    { get; set; } = "portrait";
        [JsonProperty("headerEnabled")]    public bool   HeaderEnabled  { get; set; } = true;
        [JsonProperty("logoUrl")]          public string LogoUrl        { get; set; }
        [JsonProperty("logoPosition")]     public string LogoPosition   { get; set; } = "left";
        [JsonProperty("logoMaxHeightPx")]  public int    LogoMaxHeightPx { get; set; } = 60;
        [JsonProperty("orgName")]          public string OrgName        { get; set; }
        [JsonProperty("orgAddress")]       public string OrgAddress     { get; set; }
        [JsonProperty("orgPhone")]         public string OrgPhone       { get; set; }
        [JsonProperty("orgEmail")]         public string OrgEmail       { get; set; }
        [JsonProperty("orgWebsite")]       public string OrgWebsite     { get; set; }
        [JsonProperty("headerAccentColor")] public string HeaderAccentColor { get; set; } = "#6366f1";
        [JsonProperty("headerTextColor")]  public string HeaderTextColor { get; set; } = "#1e293b";
        [JsonProperty("printTitle")]       public string PrintTitle     { get; set; }
        [JsonProperty("printSubtitle")]    public string PrintSubtitle  { get; set; }
        [JsonProperty("footerEnabled")]    public bool   FooterEnabled  { get; set; } = true;
        [JsonProperty("footerText")]       public string FooterText     { get; set; }
        [JsonProperty("footerShowPageNumbers")] public bool FooterShowPageNumbers { get; set; } = true;
        [JsonProperty("footerShowDate")]   public bool   FooterShowDate { get; set; } = true;
        [JsonProperty("qrCodeEnabled")]    public bool   QrCodeEnabled  { get; set; }
        [JsonProperty("qrCodeUrl")]        public string QrCodeUrl      { get; set; }
        [JsonProperty("qrCodeLabel")]      public string QrCodeLabel    { get; set; } = "Fill online";
        [JsonProperty("qrCodePosition")]   public string QrCodePosition { get; set; } = "header-right";
        [JsonProperty("qrCodeSizePx")]     public int    QrCodeSizePx   { get; set; } = 80;
        [JsonProperty("signatureAreas")]
        public System.Collections.Generic.List<PrintSignatureArea> SignatureAreas { get; set; }
            = new System.Collections.Generic.List<PrintSignatureArea>();
        [JsonProperty("sectionStyle")]     public string SectionStyle   { get; set; } = "filled-bar";
        [JsonProperty("fieldLineStyle")]   public string FieldLineStyle { get; set; } = "underline";
        [JsonProperty("fieldFontSizePt")]  public int    FieldFontSizePt { get; set; } = 10;
        [JsonProperty("marginsMm")]
        public PrintMargins MarginsMm { get; set; } = new PrintMargins();
        [JsonProperty("showDateField")]    public bool   ShowDateField  { get; set; } = true;
        [JsonProperty("showRefNumber")]    public bool   ShowRefNumber  { get; set; }
        [JsonProperty("refNumberLabel")]   public string RefNumberLabel { get; set; } = "Ref #";
        [JsonProperty("showPhotoPlaceholder")] public bool ShowPhotoPlaceholder { get; set; }
        [JsonProperty("photoPlaceholderLabel")] public string PhotoPlaceholderLabel { get; set; } = "Photo";
        [JsonProperty("photoPlaceholderSizePx")] public int PhotoPlaceholderSizePx { get; set; } = 100;
    }

    public class PrintSignatureArea
    {
        [JsonProperty("label")]    public string Label    { get; set; } = "Signature";
        [JsonProperty("subLabel")] public string SubLabel { get; set; }
        [JsonProperty("showDate")] public bool   ShowDate { get; set; } = true;
        [JsonProperty("showName")] public bool   ShowName { get; set; } = true;
        [JsonProperty("width")]    public string Width    { get; set; } = "50%";
    }

    public class PrintMargins
    {
        [JsonProperty("top")]    public int Top    { get; set; } = 15;
        [JsonProperty("right")]  public int Right  { get; set; } = 15;
        [JsonProperty("bottom")] public int Bottom { get; set; } = 15;
        [JsonProperty("left")]   public int Left   { get; set; } = 15;
    }

    // ============================================================
    // Sample JSON (for documentation / builder)
    // ============================================================
    /*
    {
      "version": "1.0",
      "fields": [
        {
          "key": "full_name",
          "type": "Text",
          "label": "Full Name",
          "placeholder": "Enter your name",
          "required": true,
          "order": 1,
          "validation": { "minLength": 2, "maxLength": 100 }
        },
        {
          "key": "email",
          "type": "Email",
          "label": "Email Address",
          "required": true,
          "order": 2
        },
        {
          "key": "category",
          "type": "Select",
          "label": "Category",
          "required": true,
          "order": 3,
          "options": [
            { "label": "Support", "value": "support" },
            { "label": "Sales", "value": "sales" },
            { "label": "Feedback", "value": "feedback" }
          ]
        },
        {
          "key": "priority",
          "type": "Radio",
          "label": "Priority",
          "order": 4,
          "showIf": {
            "operator": "And",
            "rules": [
              { "field": "category", "condition": "Equals", "value": "support" }
            ]
          },
          "options": [
            { "label": "Low", "value": "low" },
            { "label": "Medium", "value": "medium" },
            { "label": "High", "value": "high" }
          ]
        },
        {
          "key": "message",
          "type": "Textarea",
          "label": "Message",
          "required": true,
          "order": 5,
          "validation": { "minLength": 10, "maxLength": 5000 }
        },
        {
          "key": "attachment",
          "type": "File",
          "label": "Attachment",
          "order": 6,
          "fileSettings": {
            "maxSizeMB": 5,
            "allowedExtensions": [".pdf", ".jpg", ".png"],
            "maxFiles": 3
          }
        },
        {
          "key": "terms",
          "type": "Checkbox",
          "label": "I agree to terms and conditions",
          "required": true,
          "order": 7
        }
      ],
      "settings": {
        "multiPage": false,
        "honeypotFieldName": "__mf_hp",
        "rateLimitWindowMinutes": 5,
        "rateLimitMaxPerWindow": 3
      }
    }
    */
}
