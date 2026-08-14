using System;
using Microsoft.AspNetCore.Mvc;
using MegaForm.Core.Workflow;
using MegaForm.Core.Workflow.Bpmn;
using MegaForm.Umbraco.Permissions;
using Newtonsoft.Json;

// ══════════════════════════════════════════════════════════════════════════════
//  BPMN import — HTTP surface (Umbraco)   [BpmnImport B2 v20260807 parity]
//
//  Mirrors MegaForm.Oqtane.Server MegaFormController.WorkflowBpmn.
//  Two endpoints, and the difference between them is the whole point:
//    Preview — parse and report, touch nothing.
//    Import  — parse and write the result to the form's workflow DRAFT.
//
//  Neither ever applies. An imported definition is incomplete by construction — BPMN
//  carries no webhook URL, no field to switch on, no database binding — so applying one
//  would put a workflow into production that cannot run. The author reviews the draft in
//  the editor, fills in what the warnings point at, and applies it themselves.
//
//  Both require the workflow permission letter: the XML is parsed server-side, and
//  preview is a designer tool, not a public one. Oqtane's extra same-site formId check
//  is dropped — Umbraco currently runs as a single-site host (forms stored PortalId -1),
//  so the permission letter is the scoping mechanism here.
// ══════════════════════════════════════════════════════════════════════════════

namespace MegaForm.Umbraco.Controllers
{
    public partial class MegaFormApiController
    {
        /// <summary>
        /// Upper bound on an accepted BPMN document. Real diagrams are tens of kilobytes; a
        /// megabyte of XML is either a mistake or an attempt to make the parser allocate.
        /// </summary>
        private const int MaxBpmnBytes = 2 * 1024 * 1024;

        [HttpPost]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter)]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/ImportBpmn/Preview")]
        public IActionResult PreviewBpmnImport([FromBody] BpmnImportRequest req)
        {
            BpmnImportResponse response;
            if (!TryRunBpmnImport(req, out response)) return BadRequest(response);
            return JsonOk(response);
        }

        [HttpPost]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter)]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/ImportBpmn")]
        public IActionResult ImportBpmn([FromBody] BpmnImportRequest req)
        {
            BpmnImportResponse response;
            if (!TryRunBpmnImport(req, out response)) return BadRequest(response);
            if (!response.Success) return UnprocessableEntity(response);

            if (req.FormId <= 0)
                return BadRequest(BpmnRefusal("formId is required to save the imported workflow as a draft."));

            var form = _formRepo.GetForm(req.FormId);
            if (form == null) return NotFound(BpmnRefusal("Form not found."));

            var result = RunBpmnImporter(req);
            if (result == null || result.Definition == null)
                return UnprocessableEntity(response);

            try
            {
                var env = WorkflowEnvelope.ParseOrMigrate(form.WorkflowJson);
                result.Definition.FormId = req.FormId;

                env.DraftWorkflow  = result.Definition;
                env.DraftUpdatedAt = DateTime.UtcNow;
                env.DraftVersion   = NextDraftVersion(env.AppliedVersion, env.DraftVersion);

                // Deliberately does NOT seed AppliedWorkflow the way SaveDraft does for a form that
                // has never had one. An import is not a decision to run — leaving Applied empty
                // keeps a half-configured import out of the submit path until the author applies it.
                form.WorkflowJson = JsonConvert.SerializeObject(env);
                _formRepo.SaveForm(form);
            }
            catch (Exception)
            {
                // The definition parsed; only persistence failed. Say that, without leaking the
                // exception text to the client.
                return StatusCode(500, BpmnRefusal("The workflow was imported but could not be saved as a draft."));
            }

            response.SavedAsDraft = true;
            return JsonOk(response);
        }

        // ── Shared ───────────────────────────────────────────────────────────

        /// <summary>
        /// Validates the request and runs the importer. Returns false when the request itself is
        /// unusable (missing or oversized XML), with the refusal already shaped for the client.
        /// </summary>
        private bool TryRunBpmnImport(BpmnImportRequest req, out BpmnImportResponse response)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Xml))
            {
                response = BpmnRefusal("A BPMN document is required.");
                return false;
            }

            if (req.Xml.Length > MaxBpmnBytes)
            {
                response = BpmnRefusal("The BPMN document is too large (limit " + (MaxBpmnBytes / 1024 / 1024) + " MB).");
                return false;
            }

            var result = RunBpmnImporter(req);
            response = BpmnImportResponse.From(result, false);
            return true;
        }

        private BpmnImportResult RunBpmnImporter(BpmnImportRequest req)
        {
            return new BpmnImporter().Import(req.Xml, new BpmnImportOptions
            {
                Strict               = req.Strict,
                FormId               = req.FormId,
                WorkflowName         = req.Name,
                FallbackApproverRole = string.IsNullOrWhiteSpace(req.FallbackApproverRole)
                    ? "Administrators"
                    : req.FallbackApproverRole,
            });
        }

        private static BpmnImportResponse BpmnRefusal(string message)
        {
            var response = new BpmnImportResponse { Success = false, Message = message };
            response.Errors.Add(message);
            return response;
        }
    }

    /// <summary>Body of both BPMN endpoints.</summary>
    public class BpmnImportRequest
    {
        public int FormId { get; set; }

        /// <summary>The BPMN 2.0 XML itself.</summary>
        public string Xml { get; set; }

        /// <summary>Refuse the whole file if anything cannot be represented, instead of leaving placeholders.</summary>
        public bool Strict { get; set; }

        /// <summary>Overrides the process name from the file.</summary>
        public string Name { get; set; }

        /// <summary>Role given to imported approvals that name no assignee.</summary>
        public string FallbackApproverRole { get; set; }
    }
}
