using System;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiKnowledge;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using Oqtane.Controllers;
using Oqtane.Infrastructure;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Controllers
{
    /// <summary>
    /// Oqtane parity for MF_AI_KB_Feedback admin inbox (review + promote
    /// captured failures into Templates).
    /// </summary>
    [Route("api/[controller]")]
    [IgnoreAntiforgeryToken]
    public class AiKnowledgeFeedbackController : ModuleControllerBase
    {
        private readonly IAiKnowledgeService _svc;

        public AiKnowledgeFeedbackController(IAiKnowledgeService svc, ILogManager logger, IHttpContextAccessor accessor) : base(logger, accessor)
        {
            _svc = svc;
        }

        private int CurrentUserId => int.TryParse(User?.FindFirst("sub")?.Value ?? User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var uid) ? uid : -1;
        private bool IsAdmin => User != null && (User.IsInRole(RoleNames.Admin) || User.IsInRole(RoleNames.Host));

        [HttpGet("List")]
        public IActionResult List(string widgetType = null, string outcome = null, bool? promoted = null, int top = 100)
        {
            if (!IsAdmin) return Forbid();
            var list = _svc.ListFeedback(widgetType, outcome, promoted, top).Select(ToPayload);
            return Ok(list);
        }

        [HttpGet("Get")]
        public IActionResult Get(long id)
        {
            if (!IsAdmin) return Forbid();
            var f = _svc.GetFeedbackById(id);
            if (f == null) return NotFound(new { error = "Not found" });
            return Ok(ToPayload(f));
        }

        [HttpPost("Promote")]
        public IActionResult Promote([FromBody] JObject body)
        {
            if (!IsAdmin) return Forbid();
            if (body == null) return BadRequest(new { error = "Body required" });
            var feedbackId = (long?)body["feedbackId"] ?? 0;
            var knowledgeId = (int?)body["knowledgeId"] ?? 0;
            var templateKey = (string)body["templateKey"];
            if (feedbackId <= 0 || knowledgeId <= 0 || string.IsNullOrWhiteSpace(templateKey))
                return BadRequest(new { error = "feedbackId, knowledgeId, templateKey are all required" });
            var fb = _svc.GetFeedbackById(feedbackId);
            if (fb == null) return NotFound(new { error = "Feedback row not found" });

            var tpl = new KbTemplate
            {
                KnowledgeId = knowledgeId,
                TemplateKey = templateKey,
                Kind = (string)body["kind"] ?? "success",
                Title = (string)body["title"] ?? (fb.WidgetType + " — promoted from feedback #" + fb.Id),
                Summary = (string)body["summary"] ?? fb.RejectionMessage,
                Body = (string)body["body"] ?? fb.FixedJson ?? fb.AttemptedJson,
                Tags = (string)body["tags"],
                Score = (int?)body["score"] ?? 1,
                SortOrder = (int?)body["sortOrder"] ?? 100,
                Source = "promoted-from-feedback",
            };
            var notes = (string)body["notes"];
            var tplId = _svc.PromoteFeedback(feedbackId, tpl, CurrentUserId, notes);
            return Ok(new { ok = true, templateId = tplId });
        }

        [HttpPost("Review")]
        public IActionResult Review([FromBody] JObject body)
        {
            if (!IsAdmin) return Forbid();
            if (body == null) return BadRequest(new { error = "Body required" });
            var feedbackId = (long?)body["feedbackId"] ?? 0;
            if (feedbackId <= 0) return BadRequest(new { error = "feedbackId required" });
            _svc.MarkFeedbackReviewed(feedbackId, CurrentUserId, (string)body["notes"]);
            return Ok(new { ok = true });
        }

        private static object ToPayload(KbFeedback f) => f == null ? null : new {
            id = f.Id, sessionId = f.SessionId, ruleId = f.RuleId, knowledgeId = f.KnowledgeId,
            widgetType = f.WidgetType, op = f.Op, attemptedJson = f.AttemptedJson,
            rejectionMessage = f.RejectionMessage, fixedJson = f.FixedJson, outcome = f.Outcome,
            promoted = f.Promoted, promotedTemplateId = f.PromotedTemplateId,
            portalId = f.PortalId, formId = f.FormId, userId = f.UserId,
            createdOnDate = f.CreatedOnDate, reviewedByUserId = f.ReviewedByUserId,
            reviewedOnDate = f.ReviewedOnDate, reviewNotes = f.ReviewNotes,
        };
    }
}
