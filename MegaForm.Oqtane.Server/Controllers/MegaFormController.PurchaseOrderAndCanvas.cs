using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Oqtane.Shared;
using MegaForm.Core.Models;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;
using NewtonJsonConvert = Newtonsoft.Json.JsonConvert;

namespace MegaForm.Oqtane.Server.Controllers
{
    // Partial: Phase B (Purchase Order starter) + Phase C (workflow canvas view).
    // Badge: PoStarter + WorkflowCanvasView v20260516-08
    public partial class MegaFormController
    {
        // ════════════════════════════════════════════════════════════════════
        //  PHASE B — POST /api/megaform/Starter/PurchaseOrder/Setup
        //  Seeds the "Purchase Order Approval (Sample)" form, applies its
        //  7-step / 5-role BPMN workflow, and inserts 5 sample submissions
        //  spread across the workflow stages. Idempotent.
        // ════════════════════════════════════════════════════════════════════
        [HttpPost("Starter/PurchaseOrder/Setup")]
        [Authorize]
        public IActionResult SetupPurchaseOrderStarter([FromBody] JsonElement bodyElement)
        {
            var actor = GetCurrentUserContextWithRoles();
            if (!actor.IsAuthenticated || (!actor.IsAdmin && !actor.IsSuperUser))
                return Forbid();

            var portalId = AuthEntityId(EntityNames.Site);
            if (portalId <= 0 && int.TryParse(Request.Query["siteId"], out var qSiteId) && qSiteId > 0)
                portalId = qSiteId;
            if (portalId <= 0)
                portalId = ParsePositiveInt(Request?.Headers["X-OQTANE-SITEID"].FirstOrDefault());

            var moduleId = AuthEntityId(EntityNames.Module);
            try
            {
                var result = _purchaseOrderStarter.EnsureStarter(portalId, moduleId, actor.UserId);
                return JsonOk(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════
        //  PHASE C — GET /api/megaform/Workflow/CanvasView?formId=N
        //  Returns the workflow definition + per-node runtime stats so the
        //  dashboard canvas can render a single source of truth: nodes show
        //  pending count badges + a side-panel can list the actual submissions
        //  waiting at each step.
        //
        //  Response shape:
        //  {
        //    formId, formTitle,
        //    workflow: { nodes:[{id, type, label, position, config, runtimeStats:{pendingCount, claimedCount, completedCount}}], edges:[...] },
        //    pendingSubmissions: [{ submissionId, nodeId, status, assignedUserName, createdAt }]
        //  }
        // ════════════════════════════════════════════════════════════════════
        // [SecFix 20260715] Was ANONYMOUS (class has no [Authorize]; auth is per-action here and this
        // action had none) — it returned workflow task counts + pending submissions (submissionId,
        // assignee, dueAt) to any caller. It is an admin/builder view, so gate it EditModule like the
        // other management reads (SECURITY_CODING_RULES §1/§7 — never expose submission data un-authed).
        [Authorize(Policy = "EditModule")]
        [HttpGet("Workflow/CanvasView")]
        public IActionResult GetWorkflowCanvasView([FromQuery] int formId)
        {
            if (formId <= 0) return BadRequest(new { error = "formId required" });
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound(new { error = "form not found" });

            // Workflow definition (latest applied version)
            var def = _workflowRepo.GetByFormId(formId);
            var nodes = new List<object>();
            var pendingByNode = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var claimedByNode = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var completedByNode = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            // Aggregate task counts per node from the DB.
            using (var db = _dbContextFactory.CreateDbContext())
            {
                var tasks = db.WorkflowTasks.Where(t => t.FormId == formId).ToList();
                foreach (var t in tasks)
                {
                    var key = t.NodeId ?? string.Empty;
                    var status = (t.Status ?? string.Empty).ToLowerInvariant();
                    if (status == "pending")        { pendingByNode[key]   = (pendingByNode.ContainsKey(key)   ? pendingByNode[key]   : 0) + 1; }
                    else if (status == "claimed")    { claimedByNode[key]   = (claimedByNode.ContainsKey(key)   ? claimedByNode[key]   : 0) + 1; }
                    else if (status == "completed")  { completedByNode[key] = (completedByNode.ContainsKey(key) ? completedByNode[key] : 0) + 1; }
                }

                if (def != null)
                {
                    foreach (var n in def.Nodes ?? new List<WorkflowNode>())
                    {
                        var p = pendingByNode.TryGetValue(n.Id, out var pc) ? pc : 0;
                        var c = claimedByNode.TryGetValue(n.Id, out var cc) ? cc : 0;
                        var d = completedByNode.TryGetValue(n.Id, out var dc) ? dc : 0;
                        nodes.Add(new
                        {
                            id = n.Id,
                            type = n.Type.ToString(),
                            label = n.Label,
                            position = n.Position,
                            zoneType = n.ZoneType.ToString(),
                            config = n.Config,
                            isDisabled = n.IsDisabled,
                            runtimeStats = new { pendingCount = p, claimedCount = c, completedCount = d }
                        });
                    }
                }

                var pendingSubmissions = tasks
                    .Where(t => string.Equals(t.Status, "Pending", StringComparison.OrdinalIgnoreCase)
                             || string.Equals(t.Status, "Claimed", StringComparison.OrdinalIgnoreCase))
                    .OrderByDescending(t => t.CreatedAt)
                    .Take(50)
                    .Select(t => new
                    {
                        taskId = t.TaskId,
                        submissionId = t.SubmissionId,
                        nodeId = t.NodeId,
                        nodeLabel = t.NodeLabel,
                        status = t.Status,
                        candidateRoles = SafeJsonArray(t.CandidateRolesJson),
                        candidateUsers = SafeJsonArray(t.CandidateUsersJson),
                        assignedUserName = t.AssignedUserName,
                        assignedDisplayName = t.AssignedDisplayName,
                        createdAt = t.CreatedAt,
                        dueAt = t.DueAt
                    })
                    .ToList();

                return JsonOk(new
                {
                    formId = formId,
                    formTitle = form.Title,
                    workflow = def == null ? null : new
                    {
                        id = def.Id,
                        name = def.Name,
                        startNodeId = def.StartNodeId,
                        nodes = nodes,
                        edges = (def.Edges ?? new List<WorkflowEdge>()).Select(e => new
                        {
                            id = e.Id,
                            sourceNodeId = e.SourceNodeId,
                            sourceHandle = e.SourceHandle,
                            targetNodeId = e.TargetNodeId,
                            targetHandle = e.TargetHandle,
                            label = e.Label
                        })
                    },
                    pendingSubmissions = pendingSubmissions
                });
            }
        }

        private static List<string> SafeJsonArray(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new List<string>();
            try { return NewtonJsonConvert.DeserializeObject<List<string>>(json) ?? new List<string>(); }
            catch { return new List<string>(); }
        }
    }
}
