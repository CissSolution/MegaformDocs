using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Workflow
{
    /// <summary>
    /// Lightweight executor for FormField / page-navigation nodes when they appear
    /// in server-side workflow execution or Test Run. This node has no side effects;
    /// it simply passes execution to the default outgoing edge.
    /// </summary>
    public class FormFieldNodeExecutor : INodeExecutor
    {
        public WorkflowNodeType NodeType => WorkflowNodeType.FormField;

        public Task<WorkflowNodeResult> ExecuteAsync(
            WorkflowNode node,
            WorkflowExecutionContext ctx,
            CancellationToken ct)
        {
            var config = TryParseConfig(node) ?? new FormFieldNodeConfig();
            return Task.FromResult(WorkflowNodeResult.Success("handle::default", new
            {
                fieldKey = config.FieldKey ?? string.Empty,
                pageIndex = config.PageIndex,
                isPageBreak = config.IsPageBreak,
                label = node.Label ?? node.Id,
            }));
        }

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            return new WorkflowValidationResult { IsValid = true };
        }

        private FormFieldNodeConfig TryParseConfig(WorkflowNode node)
        {
            try
            {
                if (node == null || node.Config == null || node.Config.Count == 0)
                    return new FormFieldNodeConfig();

                return JsonConvert.DeserializeObject<FormFieldNodeConfig>(
                           JsonConvert.SerializeObject(node.Config))
                       ?? new FormFieldNodeConfig();
            }
            catch
            {
                return new FormFieldNodeConfig();
            }
        }
    }
}
