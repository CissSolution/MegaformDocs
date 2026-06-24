// ============================================================
// MegaForm.Oqtane.Shared — DTOs exchanged between Client ↔ Server
// These are TRANSPORT models only; EF entities live in Server/Data.
// ============================================================

using System;
using System.Collections.Generic;

namespace MegaForm.Oqtane.Shared.Models
{
    /// <summary>Form definition — sent when admin creates/saves a form.</summary>
    public class FormDto
    {
        public int FormId { get; set; }
        public int ModuleId { get; set; }
        public int SiteId { get; set; }
        public string Title { get; set; }
        public string Description { get; set; }
        public string SchemaJson { get; set; }
        public string SettingsJson { get; set; }
        public string ThemeJson { get; set; }
        public string Status { get; set; } = "Draft";
        public string SubmitButtonText { get; set; } = "Submit";
        public string SuccessMessage { get; set; }
        public string RedirectUrl { get; set; }
        public string ResolvedSchemaJson { get; set; }
        public string ResolvedSettingsJson { get; set; }
        public string ResolverBadge { get; set; }
        public string InitialInlineCss { get; set; }
        public bool EnableCaptcha { get; set; }
        public bool EnableSaveResume { get; set; }
        public bool RequireAuth { get; set; }
        public string AssetSelectionBadge { get; set; }
        public List<string> PluginScripts { get; set; } = new();
        public List<string> PluginStyles { get; set; } = new();
        public string NotifyEmails { get; set; }
        public string WebhookUrl { get; set; }
        /// <summary>Rules JSON — sent by rule-builder-ui module, stored inside SchemaJson on server.</summary>
        public string RulesJson { get; set; }
        public string WorkflowJson { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public DateTime? UpdatedOnUtc { get; set; }
    }

    /// <summary>Submission — sent when a visitor submits a form.</summary>
    public class SubmissionDto
    {
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public string DataJson { get; set; }
        public string Status { get; set; } = "New";
        public bool IsSpam { get; set; }
        public DateTime SubmittedOnUtc { get; set; }
        public string IpAddress { get; set; }
        public string ActiveTaskId { get; set; } = string.Empty;
        public List<SubmissionActionDto> AvailableActions { get; set; } = new();
    }

    public class SubmissionActionDto
    {
        public string Key { get; set; } = string.Empty;
        public string Label { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Tone { get; set; } = "neutral";
        public string TaskId { get; set; } = string.Empty;
        public bool RequiresComment { get; set; }
    }

    /// <summary>Submit request from renderer.</summary>
    public class SubmitRequest
    {
        public int FormId { get; set; }
        public Dictionary<string, object> Data { get; set; }
        public double SubmissionTime { get; set; }
    }

    /// <summary>Submit response.</summary>
    public class SubmitResponse
    {
        public bool Success { get; set; }
        public int SubmissionId { get; set; }
        public string SuccessMessage { get; set; }
        public string RedirectUrl { get; set; }
        public string Error { get; set; }
        // [OQSubmitFieldErrors v20260502-01] Per-field validation errors so the
        // renderer can surface "Required: First Name" etc. instead of just
        // "Validation failed." with no clue which field is wrong.
        public Dictionary<string, string> ValidationErrors { get; set; }
    }

    /// <summary>Schema response for public form rendering.</summary>
    public class SchemaResponse
    {
        public int FormId { get; set; }
        public string Title { get; set; }
        public string Description { get; set; }
        public string Schema { get; set; }
        public string SubmitButtonText { get; set; }
        public bool EnableCaptcha { get; set; }
        public bool EnableSaveResume { get; set; }
        public string ThemeJson { get; set; }
        public string SettingsJson { get; set; }
        public string InitialInlineCss { get; set; }
        public bool RequireAuth { get; set; }
        public string AssetSelectionBadge { get; set; }
        public List<string> PluginScripts { get; set; } = new();
        public List<string> PluginStyles { get; set; } = new();
    }

    /// <summary>Module config — links a module instance to a specific form + view.</summary>
    public class ModuleConfigDto
    {
        public int ModuleId { get; set; }
        public int FormId { get; set; }
        public string ViewType { get; set; } = "submit";
        public string SelectedViewKey { get; set; } = string.Empty;
        public string ViewConfig { get; set; } = "{}";
        public string CssClass { get; set; }
        public int CacheMinutes { get; set; }
        public string Permissions { get; set; }
        // [Recovered 20260615] Surface-role pinning (builder/dashboard/submissions/…)
        // chosen in module settings; consumed by the admin-dock panel-host. Re-added
        // because the panel-host Index.razor references ModuleConfigDto.ModuleRole and
        // it was lost in the April revert. Server may ignore it until persistence is
        // restored; the property keeps the settings-save payload shape intact.
        public string ModuleRole { get; set; } = string.Empty;
        public bool ModuleConfigured { get; set; }
        public string DisplayMode { get; set; } = "fixed";
        public string TriggerType { get; set; } = "time_delay";
        public int DelaySeconds { get; set; } = 5;
        public int ScrollPercent { get; set; } = 50;
        public string ClickSelector { get; set; } = string.Empty;
        // [PopupSize v20260502-12] Popup width preset chosen in module settings.
        // Values: "small" (360px) | "medium" (560px, default) | "large" (820px)
        // | "fullscreen". Renderer reads this to size the popup overlay so
        // admins don't need to write CSS for each form.
        public string PopupSize { get; set; } = "medium";
        // [ModuleViewModes v20260502-13] Per-module view mode replacing the
        // implicit "form-only" assumption. "form" renders the input form (the
        // default — current behaviour). "list" renders submissions as a table-
        // style row list with admin-controlled HTML template. "card" renders
        // submissions as cards. ListFields/CardFields = comma-separated field
        // keys to inject into the template via {{field:key}} tokens.
        public string ViewMode { get; set; } = "form";
        public string ListFields { get; set; } = string.Empty;
        public string ListTemplate { get; set; } = string.Empty;
        public string CardFields { get; set; } = string.Empty;
        public string CardTemplate { get; set; } = string.Empty;
        // [ListViewRouting v20260507-23] When ViewMode == "listview" the JSON
        // here is a MegaForm.Core.ViewModes.ListViewSettings blob (formId,
        // fields, rowTemplate, pageSize, …). Kept as a separate column so the
        // existing list/card configs aren't disturbed during migration.
        public string ListViewSettingsJson { get; set; } = "{}";
        public bool ShowOncePerSession { get; set; } = true;
        public bool CloseOnOverlay { get; set; } = true;
        public string StartAt { get; set; } = string.Empty;
        public string EndAt { get; set; } = string.Empty;
        public bool UseCurrentPageAsRendererHost { get; set; }
        public string CurrentPageUrl { get; set; } = string.Empty;
        public int CurrentPageId { get; set; }
        public string RendererHostUrl { get; set; } = string.Empty;
        public int RendererHostPageId { get; set; }
        public int RendererHostModuleId { get; set; }
    }

    /// <summary>Module config API response.</summary>
    public class ModuleConfigResponse
    {
        public bool Configured { get; set; }
        public bool ModuleConfigured { get; set; }
        public int ModuleId { get; set; }
        public int SiteId { get; set; }
        public List<FormListItem> Forms { get; set; } = new();
        public ModuleConfigDto Config { get; set; }
        public string RendererHostUrl { get; set; } = string.Empty;
        public int RendererHostPageId { get; set; }
        public int RendererHostModuleId { get; set; }
        public List<FieldMeta> Fields { get; set; } = new();
    }

    public class StarterAppSetupResult
    {
        public int AppId { get; set; }
        public string AppKey { get; set; } = string.Empty;
        public string AppScope { get; set; } = string.Empty;
        public int FormId { get; set; }
        public string FormTitle { get; set; } = string.Empty;
        public string DefaultViewKey { get; set; } = string.Empty;
        public string SubmitUrl { get; set; } = string.Empty;
        public string InboxUrl { get; set; } = string.Empty;
        public string BoardUrl { get; set; } = string.Empty;
        public string FinanceBoardUrl { get; set; } = string.Empty;
        public string RegisterUrl { get; set; } = string.Empty;
        public string CardUrl { get; set; } = string.Empty;
        public List<string> ViewKeys { get; set; } = new();
        public Dictionary<string, int> SampleStatusCounts { get; set; } = new();
    }

    public class FormListItem
    {
        public int FormId { get; set; }
        public string Title { get; set; }
        public string Status { get; set; }
    }

    public class FieldMeta
    {
        public string Key { get; set; }
        public string Label { get; set; }
        public string Type { get; set; }
    }

    /// <summary>Paged result wrapper.</summary>
    public class PagedResult<T>
    {
        public List<T> Items { get; set; } = new();
        public int Total { get; set; }
        public int TotalCount { get; set; }
        public int Page { get; set; }
        public int PageIndex { get; set; }
        public int PageSize { get; set; }
    }
}
