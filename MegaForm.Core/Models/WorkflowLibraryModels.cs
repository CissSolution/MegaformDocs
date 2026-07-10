using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace MegaForm.Core.Workflow
{
    /// <summary>
    /// Reusable workflow template header. Versions carry the actual WorkflowDefinition JSON.
    /// A template can be applied to many forms through FormWorkflowMappingInfo.
    /// </summary>
    public class WorkflowTemplateInfo
    {
        public int WorkflowTemplateId { get; set; }
        public int PortalId { get; set; }
        public string TemplateKey { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public string Category { get; set; }
        public bool IsEnabled { get; set; }
        public int? CurrentVersionId { get; set; }
        public int? CreatedByUserId { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public DateTime? UpdatedOnUtc { get; set; }

        public WorkflowTemplateInfo()
        {
            TemplateKey = string.Empty;
            Name = string.Empty;
            Description = string.Empty;
            Category = string.Empty;
            IsEnabled = true;
            CreatedOnUtc = DateTime.UtcNow;
        }
    }

    /// <summary>
    /// Immutable-ish template version. Applying a version pins runtime to this DefinitionJson.
    /// </summary>
    public class WorkflowTemplateVersionInfo
    {
        public int WorkflowVersionId { get; set; }
        public int WorkflowTemplateId { get; set; }
        public string Version { get; set; }
        public string DefinitionJson { get; set; }
        public string Notes { get; set; }
        public bool IsApplied { get; set; }
        public int? CreatedByUserId { get; set; }
        public DateTime CreatedOnUtc { get; set; }

        public WorkflowTemplateVersionInfo()
        {
            Version = "1.0.0";
            DefinitionJson = string.Empty;
            Notes = string.Empty;
            CreatedOnUtc = DateTime.UtcNow;
        }
    }

    /// <summary>
    /// Links a form to a reusable workflow template/version with per-form field mappings.
    /// FieldMappingsJson stores List&lt;WorkflowFieldMappingInfo&gt;.
    /// WorkflowVersionId null = follow the template's CurrentVersionId (auto-update);
    /// non-null = pinned to that exact version.
    /// </summary>
    public class FormWorkflowMappingInfo
    {
        public int MappingId { get; set; }
        public int FormId { get; set; }
        public int WorkflowTemplateId { get; set; }
        public int? WorkflowVersionId { get; set; }
        public string FieldMappingsJson { get; set; }

        /// <summary>
        /// Per-form overrides for the template's workflow variables, stored as a flat
        /// JSON object: { "approverEmail": "a@x.com", "thresholdAmount": 5000 }.
        /// Merged over WorkflowDefinition.Variables[].DefaultValue at execution time,
        /// which is what makes one shared template behave differently per form.
        /// </summary>
        public string VariableOverridesJson { get; set; }

        public string TriggerType { get; set; }
        public bool IsActive { get; set; }
        public int? AppliedByUserId { get; set; }
        public string AppliedBy { get; set; }
        public DateTime AppliedOnUtc { get; set; }

        public FormWorkflowMappingInfo()
        {
            FieldMappingsJson = "[]";
            VariableOverridesJson = "{}";
            TriggerType = "on_submit";
            IsActive = true;
            AppliedBy = string.Empty;
            AppliedOnUtc = DateTime.UtcNow;
        }
    }

    /// <summary>
    /// Maps a canonical workflow field key to a concrete form field key.
    /// Example: workflow "customer_email" -> form "email".
    /// </summary>
    public class WorkflowFieldMappingInfo
    {
        [JsonProperty("workflowFieldKey")]
        public string WorkflowFieldKey { get; set; }

        [JsonProperty("formFieldKey")]
        public string FormFieldKey { get; set; }

        [JsonProperty("required")]
        public bool Required { get; set; }

        public WorkflowFieldMappingInfo()
        {
            WorkflowFieldKey = string.Empty;
            FormFieldKey = string.Empty;
        }
    }

    /// <summary>
    /// Runtime binding resolved for a form. Source is "library" or "legacy-form".
    /// </summary>
    public class WorkflowRuntimeDefinition
    {
        public string Source { get; set; }
        public WorkflowDefinition Definition { get; set; }
        public WorkflowTemplateInfo Template { get; set; }
        public WorkflowTemplateVersionInfo Version { get; set; }
        public FormWorkflowMappingInfo Mapping { get; set; }
        public List<WorkflowFieldMappingInfo> FieldMappings { get; set; }

        /// <summary>
        /// Resolved per-form variable overrides. Empty for legacy-form workflows.
        /// </summary>
        public Dictionary<string, object> VariableOverrides { get; set; }

        public WorkflowRuntimeDefinition()
        {
            Source = "legacy-form";
            FieldMappings = new List<WorkflowFieldMappingInfo>();
            VariableOverrides = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        }
    }
}
