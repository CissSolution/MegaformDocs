using System.Collections.Generic;
using MegaForm.Core.Models;

namespace MegaForm.Core.Workflow.Bpmn
{
    // ══════════════════════════════════════════════════════════════════════════
    //  BPMN import — inputs and outputs  [BpmnImport B1 v20260807]
    //  C# 7.3-safe: MegaForm.Core still builds for net472.
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>How much the importer is allowed to guess, and what to guess with.</summary>
    public class BpmnImportOptions
    {
        /// <summary>
        /// Strict: any element the mapper cannot represent fails the whole import, with the
        /// full list in <see cref="BpmnImportResult.UnsupportedElements"/>. Lenient (default):
        /// each one becomes a disabled placeholder node so the shape of the diagram survives
        /// and the author can see exactly what needs replacing.
        /// </summary>
        public bool Strict { get; set; }

        /// <summary>Role put on an imported Approval when the BPMN names no assignee.</summary>
        public string FallbackApproverRole { get; set; }

        /// <summary>Form the imported workflow belongs to. 0 leaves it unbound.</summary>
        public int FormId { get; set; }

        /// <summary>Overrides the process name from the XML.</summary>
        public string WorkflowName { get; set; }

        public BpmnImportOptions()
        {
            FallbackApproverRole = "Administrator";
        }
    }

    /// <summary>
    /// One thing the importer decided that the author should look at. A warning never
    /// blocks an import — it is the record of a guess, so nothing is dropped in silence.
    /// </summary>
    public class BpmnImportWarning
    {
        /// <summary>BPMN id of the element the warning is about (may be null).</summary>
        public string ElementId { get; set; }

        /// <summary>BPMN local name, e.g. "serviceTask".</summary>
        public string ElementType { get; set; }

        public string Message { get; set; }

        public BpmnImportWarning() { }

        public BpmnImportWarning(string elementId, string elementType, string message)
        {
            ElementId   = elementId;
            ElementType = elementType;
            Message     = message;
        }
    }

    /// <summary>Result of one import attempt. Check <see cref="Success"/> before using Definition.</summary>
    public class BpmnImportResult
    {
        public bool Success { get; set; }

        /// <summary>Null when Success is false.</summary>
        public WorkflowDefinition Definition { get; set; }

        public List<BpmnImportWarning> Warnings { get; set; }

        /// <summary>"boundaryEvent (Escalation) [Event_1a2b3c]" — one entry per element the mapper does not model.</summary>
        public List<string> UnsupportedElements { get; set; }

        /// <summary>Only populated when the import failed.</summary>
        public List<string> Errors { get; set; }

        public BpmnImportResult()
        {
            Warnings            = new List<BpmnImportWarning>();
            UnsupportedElements = new List<string>();
            Errors              = new List<string>();
        }

        public static BpmnImportResult Failed(string error)
        {
            var result = new BpmnImportResult();
            result.Success = false;
            result.Errors.Add(error);
            return result;
        }

        public void Warn(string elementId, string elementType, string message)
        {
            Warnings.Add(new BpmnImportWarning(elementId, elementType, message));
        }
    }
}
