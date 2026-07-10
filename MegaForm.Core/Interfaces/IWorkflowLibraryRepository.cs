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

        /// <summary>Deactivate every mapping for a form. The form reverts to its legacy per-form WorkflowJson.</summary>
        void ClearMapping(int formId);

        /// <summary>Delete a template with its versions. Forms mapped to it are unbound first.</summary>
        void DeleteTemplate(int workflowTemplateId);

        /// <summary>Count of forms currently bound to a template — shown before delete.</summary>
        int CountFormsUsingTemplate(int workflowTemplateId);
    }
}
