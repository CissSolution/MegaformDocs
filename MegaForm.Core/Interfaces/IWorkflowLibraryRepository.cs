using System.Collections.Generic;
using MegaForm.Core.Workflow;

namespace MegaForm.Core.Interfaces
{
    /// <summary>
    /// Repository contract for reusable workflow templates, versions, and form mappings.
    /// Implementations are additive: if a host does not register this contract,
    /// WorkflowEngineV2 falls back to the legacy per-form WorkflowJson path.
    /// </summary>
    public interface IWorkflowLibraryRepository
    {
        WorkflowRuntimeDefinition GetActiveDefinitionForForm(int formId);

        WorkflowTemplateInfo GetTemplate(int workflowTemplateId);

        WorkflowTemplateInfo GetTemplateByKey(int portalId, string templateKey);

        List<WorkflowTemplateInfo> ListTemplates(int portalId, bool enabledOnly = true);

        int SaveTemplate(WorkflowTemplateInfo template);

        WorkflowTemplateVersionInfo GetVersion(int workflowVersionId);

        List<WorkflowTemplateVersionInfo> ListVersions(int workflowTemplateId);

        int SaveVersion(WorkflowTemplateVersionInfo version);

        void ApplyVersion(int workflowTemplateId, int workflowVersionId, string appliedBy = "system");

        FormWorkflowMappingInfo GetActiveMapping(int formId);

        List<FormWorkflowMappingInfo> ListMappingsForTemplate(int workflowTemplateId, bool activeOnly = true);

        int ApplyToForm(FormWorkflowMappingInfo mapping);
    }
}
