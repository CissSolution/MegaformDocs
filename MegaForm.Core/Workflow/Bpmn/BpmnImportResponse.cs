using System;
using System.Collections.Generic;
using MegaForm.Core.Services;

namespace MegaForm.Core.Workflow.Bpmn
{
    // ══════════════════════════════════════════════════════════════════════════
    //  BpmnImportResponse  [BpmnImport B2 v20260807]
    //  The shape every host returns from its import endpoint.
    //
    //  It lives in Core rather than in each controller because DNN, Oqtane and the
    //  Web host each have their own copy of the workflow surface, and one shared
    //  TypeScript client reads all three. Three hand-rolled anonymous objects drift
    //  within a release; one POCO cannot.
    //
    //  A POCO, specifically — Oqtane serializes with System.Text.Json and mangles a
    //  raw JObject, so nothing here may be a Newtonsoft type.
    // ══════════════════════════════════════════════════════════════════════════

    public class BpmnImportResponse
    {
        public bool Success { get; set; }

        /// <summary>One line for the UI to show above the detail.</summary>
        public string Message { get; set; }

        /// <summary>Present only when the import succeeded.</summary>
        public BpmnImportSummary Summary { get; set; }

        public List<BpmnImportWarning> Warnings { get; set; }

        public List<string> Unsupported { get; set; }

        public List<string> Errors { get; set; }

        /// <summary>
        /// Validation of the imported definition in Draft mode. Errors here are expected on a
        /// fresh import — BPMN carries no webhook URL or switch field — and are what the editor
        /// shows as the to-do list. The caller must NOT treat them as an import failure.
        /// </summary>
        public List<BpmnValidationIssue> Validation { get; set; }

        /// <summary>True when the definition was written to the form's workflow draft.</summary>
        public bool SavedAsDraft { get; set; }

        public BpmnImportResponse()
        {
            Warnings    = new List<BpmnImportWarning>();
            Unsupported = new List<string>();
            Errors      = new List<string>();
            Validation  = new List<BpmnValidationIssue>();
        }

        /// <summary>
        /// Builds the response from an import result. Runs Draft-mode validation when the import
        /// succeeded so the caller does not have to remember to, and so all three hosts report
        /// the same issues in the same order.
        /// </summary>
        public static BpmnImportResponse From(BpmnImportResult result, bool savedAsDraft)
        {
            var response = new BpmnImportResponse();
            if (result == null)
            {
                response.Success = false;
                response.Message = "The import produced no result.";
                return response;
            }

            response.Success      = result.Success;
            response.SavedAsDraft = savedAsDraft;
            response.Warnings     = result.Warnings ?? new List<BpmnImportWarning>();
            response.Unsupported  = result.UnsupportedElements ?? new List<string>();
            response.Errors       = result.Errors ?? new List<string>();

            if (!result.Success || result.Definition == null)
            {
                response.Message = response.Errors.Count > 0
                    ? response.Errors[0]
                    : "The BPMN file could not be imported.";
                return response;
            }

            response.Summary = BpmnImportSummary.Of(result.Definition);

            try
            {
                var validation = new WorkflowEvaluator().ValidateDefinition(result.Definition, ValidationMode.Draft);
                if (validation != null && validation.Errors != null)
                {
                    foreach (var error in validation.Errors)
                    {
                        response.Validation.Add(new BpmnValidationIssue
                        {
                            NodeId   = error.NodeId,
                            Field    = error.Field,
                            Severity = error.Severity,
                            Message  = error.Message,
                        });
                    }
                }
            }
            catch (Exception)
            {
                // Validation is advisory here. A definition that cannot even be validated is still
                // worth handing back with its warnings — the editor will validate again on save.
            }

            response.Message = BuildMessage(response);
            return response;
        }

        private static string BuildMessage(BpmnImportResponse response)
        {
            var summary = response.Summary;
            var message = "Imported " + summary.NodeCount + " node(s) and " + summary.EdgeCount + " connection(s).";

            if (response.Unsupported.Count > 0)
                message += " " + response.Unsupported.Count + " element(s) could not be represented.";
            if (response.Warnings.Count > 0)
                message += " " + response.Warnings.Count + " item(s) need review.";
            if (response.Validation.Count > 0)
                message += " " + response.Validation.Count + " node(s) still need configuration before this can be applied.";

            return message;
        }
    }

    public class BpmnImportSummary
    {
        public string WorkflowName { get; set; }
        public string StartNodeId { get; set; }
        public int NodeCount { get; set; }
        public int EdgeCount { get; set; }

        /// <summary>Node type name → how many were created. Lets the UI show what it got at a glance.</summary>
        public Dictionary<string, int> NodeTypes { get; set; }

        /// <summary>Nodes imported disabled — unsupported placeholders and untranslated scripts.</summary>
        public int DisabledNodeCount { get; set; }

        public BpmnImportSummary()
        {
            NodeTypes = new Dictionary<string, int>(StringComparer.Ordinal);
        }

        public static BpmnImportSummary Of(WorkflowDefinition definition)
        {
            var summary = new BpmnImportSummary();
            if (definition == null) return summary;

            summary.WorkflowName = definition.Name;
            summary.StartNodeId  = definition.StartNodeId;
            summary.NodeCount    = definition.Nodes != null ? definition.Nodes.Count : 0;
            summary.EdgeCount    = definition.Edges != null ? definition.Edges.Count : 0;

            if (definition.Nodes == null) return summary;
            foreach (var node in definition.Nodes)
            {
                if (node == null) continue;
                var key = node.Type.ToString();
                int count;
                summary.NodeTypes[key] = summary.NodeTypes.TryGetValue(key, out count) ? count + 1 : 1;
                if (node.IsDisabled) summary.DisabledNodeCount++;
            }
            return summary;
        }
    }

    /// <summary>Flattened WorkflowValidationError — a POCO the STJ and Newtonsoft paths agree on.</summary>
    public class BpmnValidationIssue
    {
        public string NodeId { get; set; }
        public string Field { get; set; }
        public string Severity { get; set; }
        public string Message { get; set; }
    }
}
