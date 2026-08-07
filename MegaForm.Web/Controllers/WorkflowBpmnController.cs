using System;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using MegaForm.Core.Workflow.Bpmn;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;

namespace MegaForm.Web.Controllers
{
    // ══════════════════════════════════════════════════════════════════════════
    //  BPMN import — HTTP surface (standalone Web host)   [BpmnImport B2 v20260807]
    //  Twin of MegaFormController.WorkflowBpmn.cs on Oqtane and WorkflowApiController
    //  on DNN. Same routes, same request body, same response shape — one TypeScript
    //  client talks to all three.
    //
    //  Preview parses and reports; Import additionally writes the result to the form's
    //  workflow DRAFT. Neither applies: an imported definition is incomplete by
    //  construction (BPMN has no webhook URL, no field to switch on), so applying one
    //  would put a workflow that cannot run into the submit path.
    //
    //  Administrator-only. Plain [Authorize] would be any signed-in user, and this
    //  writes to a form chosen by id.
    // ══════════════════════════════════════════════════════════════════════════

    [ApiController]
    [Route("api/MegaForm/Workflow")]
    [Authorize(Roles = "Administrator")]
    public class WorkflowBpmnController : ControllerBase
    {
        /// <summary>
        /// Upper bound on an accepted BPMN document. Real diagrams are tens of kilobytes; a
        /// megabyte of XML is either a mistake or an attempt to make the parser allocate.
        /// </summary>
        private const int MaxBpmnBytes = 2 * 1024 * 1024;

        private readonly IFormRepository _formRepo;
        private readonly IPlatformContext _ctx;

        public WorkflowBpmnController(IFormRepository formRepo, IPlatformContext ctx)
        {
            _formRepo = formRepo;
            _ctx = ctx;
        }

        [HttpPost("ImportBpmn/Preview")]
        public IActionResult PreviewBpmnImport([FromBody] BpmnImportRequest req)
        {
            string refusal;
            if (!IsUsable(req, out refusal)) return BadRequest(Refusal(refusal));

            return Ok(BpmnImportResponse.From(RunImporter(req), false));
        }

        [HttpPost("ImportBpmn")]
        public IActionResult ImportBpmn([FromBody] BpmnImportRequest req)
        {
            string refusal;
            if (!IsUsable(req, out refusal)) return BadRequest(Refusal(refusal));

            var result = RunImporter(req);
            var response = BpmnImportResponse.From(result, false);
            if (!response.Success || result.Definition == null) return UnprocessableEntity(response);

            if (req.FormId <= 0)
                return BadRequest(Refusal("formId is required to save the imported workflow as a draft."));

            var form = _formRepo.GetForm(req.FormId);
            if (form == null) return NotFound(Refusal("Form not found."));

            // formId comes from the client, so the Administrator role alone would let an admin on
            // one portal write onto another portal's form. 404 rather than 403 — the response must
            // not confirm that the form exists.
            var callerPortalId = _ctx != null ? _ctx.PortalId : 0;
            if (callerPortalId > 0 && form.PortalId > 0 && form.PortalId != callerPortalId)
                return NotFound(Refusal("Form not found."));

            try
            {
                var env = WorkflowEnvelope.ParseOrMigrate(form.WorkflowJson);
                result.Definition.FormId = req.FormId;

                env.DraftWorkflow  = result.Definition;
                env.DraftUpdatedAt = DateTime.UtcNow;

                // AppliedWorkflow is deliberately left alone. An import is not a decision to run.
                form.WorkflowJson = JsonConvert.SerializeObject(env);
                _formRepo.SaveForm(form);
            }
            catch (Exception)
            {
                // The definition parsed; only persistence failed. Never hand the exception text out.
                return StatusCode(500, Refusal("The workflow was imported but could not be saved as a draft."));
            }

            response.SavedAsDraft = true;
            return Ok(response);
        }

        // ── Shared ───────────────────────────────────────────────────────────

        private static bool IsUsable(BpmnImportRequest req, out string refusal)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Xml))
            {
                refusal = "A BPMN document is required.";
                return false;
            }
            if (req.Xml.Length > MaxBpmnBytes)
            {
                refusal = "The BPMN document is too large (limit " + (MaxBpmnBytes / 1024 / 1024) + " MB).";
                return false;
            }
            refusal = null;
            return true;
        }

        private static BpmnImportResult RunImporter(BpmnImportRequest req)
        {
            return new BpmnImporter().Import(req.Xml, new BpmnImportOptions
            {
                Strict               = req.Strict,
                FormId               = req.FormId,
                WorkflowName         = req.Name,
                FallbackApproverRole = string.IsNullOrWhiteSpace(req.FallbackApproverRole)
                    ? "Administrator"
                    : req.FallbackApproverRole,
            });
        }

        private static BpmnImportResponse Refusal(string message)
        {
            var response = new BpmnImportResponse { Success = false, Message = message };
            response.Errors.Add(message);
            return response;
        }
    }

    /// <summary>Body of both BPMN endpoints on the Web host. Mirrors the Oqtane and DNN twins.</summary>
    public class BpmnImportRequest
    {
        public int FormId { get; set; }
        public string Xml { get; set; }
        public bool Strict { get; set; }
        public string Name { get; set; }
        public string FallbackApproverRole { get; set; }
    }
}
