using System;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiKnowledge;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;

namespace MegaForm.Web.Controllers
{
    [Route("api/[controller]")]
    [IgnoreAntiforgeryToken]
    [Authorize(Roles = "Administrator")]
    public class AiKnowledgeFeedbackController : ControllerBase
    {
        private readonly IAiKnowledgeService _svc;
        private readonly IPlatformContext _platform;

        public AiKnowledgeFeedbackController(IAiKnowledgeService svc, IPlatformContext platform)
        {
            _svc = svc;
            _platform = platform;
        }

        private int CurrentUserId => _platform?.UserId > 0 ? _platform.UserId : -1;

        [HttpGet("List")]
        public IActionResult List(string widgetType = null, string outcome = null, bool? promoted = null, int top = 100)
            => Ok(_svc.ListFeedback(widgetType, outcome, promoted, top).Select(ToPayload));

        [HttpGet("Get")]
        public IActionResult Get(long id)
        {
            var f = _svc.GetFeedbackById(id);
            if (f == null) return NotFound(new { error = "Not found" });
            return Ok(ToPayload(f));
        }

        [HttpPost("Promote")]
        public IActionResult Promote([FromBody] JObject body)
        {
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
                KnowledgeId = knowledgeId, TemplateKey = templateKey, Kind = (string)body["kind"] ?? "success",
                Title = (string)body["title"] ?? (fb.WidgetType + " — promoted from feedback #" + fb.Id),
                Summary = (string)body["summary"] ?? fb.RejectionMessage,
                Body = (string)body["body"] ?? fb.FixedJson ?? fb.AttemptedJson,
                Tags = (string)body["tags"], Score = (int?)body["score"] ?? 1, SortOrder = (int?)body["sortOrder"] ?? 100,
                Source = "promoted-from-feedback",
            };
            var tplId = _svc.PromoteFeedback(feedbackId, tpl, CurrentUserId, (string)body["notes"]);
            return Ok(new { ok = true, templateId = tplId });
        }

        [HttpPost("Review")]
        public IActionResult Review([FromBody] JObject body)
        {
            if (body == null) return BadRequest(new { error = "Body required" });
            var feedbackId = (long?)body["feedbackId"] ?? 0;
            if (feedbackId <= 0) return BadRequest(new { error = "feedbackId required" });
            _svc.MarkFeedbackReviewed(feedbackId, CurrentUserId, (string)body["notes"]);
            return Ok(new { ok = true });
        }

        private static object ToPayload(KbFeedback f) => f == null ? null : new
        {
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
