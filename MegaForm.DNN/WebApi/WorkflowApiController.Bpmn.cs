using System;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Web.Api;
using MegaForm.Core.Workflow;
using MegaForm.Core.Workflow.Bpmn;
using MegaForm.DNN.Data;
using Newtonsoft.Json;

// ══════════════════════════════════════════════════════════════════════════════
//  BPMN import — HTTP surface (DNN)   [BpmnImport B2 v20260807]
//  Twin of MegaFormController.WorkflowBpmn.cs (Oqtane) and WorkflowBpmnController
//  (Web host). Same action names, same request body, same response shape, so the
//  shared TypeScript client does not branch per platform.
//
//  Preview parses and reports; ImportBpmn additionally writes the result to the
//  form's workflow DRAFT. Neither applies — an imported definition is incomplete by
//  construction and applying one would put a workflow that cannot run into the
//  submit path.
// ══════════════════════════════════════════════════════════════════════════════

namespace MegaForm.WebApi
{
    public partial class WorkflowController
    {
        /// <summary>
        /// Upper bound on an accepted BPMN document. Real diagrams are tens of kilobytes; a
        /// megabyte of XML is either a mistake or an attempt to make the parser allocate.
        /// </summary>
        private const int MaxBpmnBytes = 2 * 1024 * 1024;

        [HttpPost]
        [ActionName("PreviewBpmn")]
        [DnnModuleAuthorize(AccessLevel = DotNetNuke.Security.SecurityAccessLevel.Edit)]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage PreviewBpmn([FromBody] BpmnImportRequest req)
        {
            string refusal;
            if (!IsUsable(req, out refusal))
                return Request.CreateResponse(HttpStatusCode.BadRequest, Refusal(refusal));

            return Request.CreateResponse(HttpStatusCode.OK, BpmnImportResponse.From(RunImporter(req), false));
        }

        [HttpPost]
        [ActionName("ImportBpmn")]
        [DnnModuleAuthorize(AccessLevel = DotNetNuke.Security.SecurityAccessLevel.Edit)]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage ImportBpmn([FromBody] BpmnImportRequest req)
        {
            string refusal;
            if (!IsUsable(req, out refusal))
                return Request.CreateResponse(HttpStatusCode.BadRequest, Refusal(refusal));

            var result = RunImporter(req);
            var response = BpmnImportResponse.From(result, false);
            if (!response.Success || result.Definition == null)
            {
                // 422 by number: net472's HttpStatusCode enum predates UnprocessableEntity, but the
                // Oqtane and Web twins return 422 and the shared client keys off the status.
                return Request.CreateResponse((HttpStatusCode)422, response);
            }

            if (req.FormId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    Refusal("formId is required to save the imported workflow as a draft."));

            var form = FormRepository.GetForm(req.FormId);
            if (form == null)
                return Request.CreateResponse(HttpStatusCode.NotFound, Refusal("Form not found."));

            // formId comes from the client and DnnModuleAuthorize checks the MODULE, not the form,
            // so without this an editor on one portal could write a draft onto another portal's
            // form. 404 rather than 403 — the response must not confirm the form exists.
            if (PortalSettings != null && form.PortalId != PortalSettings.PortalId)
                return Request.CreateResponse(HttpStatusCode.NotFound, Refusal("Form not found."));

            try
            {
                var env = ReadEnvelope(req.FormId);
                result.Definition.FormId = req.FormId;

                env.DraftWorkflow  = result.Definition;
                env.DraftUpdatedAt = DateTime.UtcNow;

                // Not SaveDraftEnvelope: that seeds AppliedWorkflow when a form has none, which
                // would put a half-configured import straight into the submit path. An import is
                // not a decision to run.
                WriteWorkflowJson(req.FormId, JsonConvert.SerializeObject(env));
            }
            catch (Exception)
            {
                // The definition parsed; only persistence failed. Never hand the exception text out.
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    Refusal("The workflow was imported but could not be saved as a draft."));
            }

            response.SavedAsDraft = true;
            return Request.CreateResponse(HttpStatusCode.OK, response);
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
                    ? "Administrators"
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

    /// <summary>Body of both BPMN endpoints on DNN. Mirrors the Oqtane and Web twins.</summary>
    public class BpmnImportRequest
    {
        public int FormId { get; set; }
        public string Xml { get; set; }
        public bool Strict { get; set; }
        public string Name { get; set; }
        public string FallbackApproverRole { get; set; }
    }
}
