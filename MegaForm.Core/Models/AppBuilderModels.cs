using System;
using System.Collections.Generic;

namespace MegaForm.Core.Models
{
    /// <summary>
    /// Canonical persisted app definition shared across hosts.
    /// Forms keep their own schema/workflow, while the app record groups
    /// forms/views/queries/settings into a reusable business app package.
    /// </summary>
    public class AppDefinitionInfo
    {
        public int AppId { get; set; }
        public int PortalId { get; set; }
        public string AppKey { get; set; }
        public string AppName { get; set; }
        public string Description { get; set; }
        public string AppScope { get; set; }
        public string Icon { get; set; }
        public string AccentColor { get; set; }
        public string ManifestJson { get; set; }
        public string SettingsJson { get; set; }
        public string ResourcesJson { get; set; }
        public bool IsEnabled { get; set; }
        public int SortOrder { get; set; }
        public int CreatedByUserId { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public int ModifiedByUserId { get; set; }
        public DateTime? ModifiedOnUtc { get; set; }
    }

    /// <summary>
    /// Shared manifest payload describing the logical shape of an app.
    /// Persisted as JSON in AppDefinitionInfo.ManifestJson.
    /// </summary>
    public class AppManifestDefinition
    {
        public AppProfileDefinition Profile { get; set; } = new AppProfileDefinition();
        public List<AppManifestFormRef> Forms { get; set; } = new List<AppManifestFormRef>();
        public List<AppManifestViewRef> Views { get; set; } = new List<AppManifestViewRef>();
        public List<AppManifestQueryRef> Queries { get; set; } = new List<AppManifestQueryRef>();
        public Dictionary<string, string> Settings { get; set; } = new Dictionary<string, string>();
        public Dictionary<string, string> Resources { get; set; } = new Dictionary<string, string>();
    }

    public class AppManifestFormRef
    {
        public int FormId { get; set; }
        public string Alias { get; set; }
        public string Role { get; set; }
        public string Title { get; set; }
        public bool IsPrimary { get; set; }
    }

    public class AppManifestViewRef
    {
        public int FormId { get; set; }
        public int ViewId { get; set; }
        public string ViewKey { get; set; }
        public string ViewType { get; set; }
        public string Alias { get; set; }
        public string QueryKey { get; set; }
        public bool IsDefault { get; set; }
    }

    public class AppManifestQueryRef
    {
        public int QueryId { get; set; }
        public int FormId { get; set; }
        public string QueryKey { get; set; }
        public string QueryType { get; set; }
        public string Alias { get; set; }
    }

    /// <summary>
    /// Persisted named query definition. The actual resolver/runtime can evolve
    /// later while keeping this shared storage contract stable.
    /// </summary>
    public class AppQueryDefinitionInfo
    {
        public int QueryId { get; set; }
        public int AppId { get; set; }
        public int FormId { get; set; }
        public string QueryKey { get; set; }
        public string QueryName { get; set; }
        public string Description { get; set; }
        public string QueryType { get; set; }
        public string DefinitionJson { get; set; }
        public bool IsSystem { get; set; }
        public int SortOrder { get; set; }
        public int CreatedByUserId { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public int ModifiedByUserId { get; set; }
        public DateTime? ModifiedOnUtc { get; set; }
    }

    public class AppDefinitionBundle
    {
        public AppDefinitionInfo App { get; set; }
        public AppManifestDefinition Manifest { get; set; } = new AppManifestDefinition();
        public List<FormInfo> Forms { get; set; } = new List<FormInfo>();
        public List<FormViewInfo> Views { get; set; } = new List<FormViewInfo>();
        public List<AppQueryDefinitionInfo> Queries { get; set; } = new List<AppQueryDefinitionInfo>();
    }

    public class AppQueryBindingInfo
    {
        public bool HasBinding { get; set; }
        public string AppScope { get; set; }
        public AppDefinitionInfo App { get; set; }
        public AppQueryDefinitionInfo Query { get; set; }
        public FormInfo Form { get; set; }
        public FormViewInfo View { get; set; }
        public string Error { get; set; }
    }

    public class AppQueryValidationResult
    {
        public bool IsValid { get; set; }
        public string Error { get; set; } = string.Empty;
        public string NormalizedQueryKey { get; set; } = string.Empty;
        public AppDefinitionInfo App { get; set; }
        public AppQueryDefinitionInfo Query { get; set; }
    }
}
