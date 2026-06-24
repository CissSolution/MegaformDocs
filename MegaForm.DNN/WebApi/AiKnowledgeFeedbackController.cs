using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Web.Api;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiAssistant;
using MegaForm.DNN.Services;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    /// <summary>
    /// Admin inbox for MF_AI_KB_Feedback — review rejections and promote
    /// good fix patterns into MF_AI_KB_Templates so the AI learns from
    /// production failures.
    ///
    /// Route prefix: /DesktopModules/MegaForm/API/AiKnowledgeFeedback/{action}
    /// </summary>
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class AiKnowledgeFeedbackController : DnnApiController
    {
        private readonly DnnAiKnowledgeService _svc = new DnnAiKnowledgeService();
        private int CurrentUserId => UserInfo?.UserID ?? 0;

        private HttpResponseMessage Gate()
            => AiFeatureGate.IsEnabled(PortalSettings?.HomeDirectoryMapPath)
                ? null
                : Request.CreateResponse(HttpStatusCode.NotFound, new { error = "AI knowledge disabled (no dev.lock)" });

        [HttpGet]
        [ActionName("List")]
        public HttpResponseMessage List(string widgetType = null, string outcome = null, bool? promoted = null, int top = 100)
        {
            var gate = Gate(); if (gate != null) return gate;
            top = Math.Max(1, Math.Min(top, 500));
            var list = _svc.ListFeedback(widgetType, outcome, promoted, top);
            return Request.CreateResponse(HttpStatusCode.OK, list.Select(ToPayload));
        }

        [HttpGet]
        [ActionName("Get")]
        public HttpResponseMessage Get(long id)
        {
            var gate = Gate(); if (gate != null) return gate;
            var f = _svc.GetFeedbackById(id);
            if (f == null) return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Not found" });
            return Request.CreateResponse(HttpStatusCode.OK, ToPayload(f));
        }

        /// <summary>
        /// Promote a captured failure / fix into a saved template attached
        /// to a Knowledge entry. Body: { feedbackId, knowledgeId, templateKey,
        /// title?, summary?, body?, tags?, notes? }. Falls back to the
        /// feedback row's FixedJson if `body` not supplied.
        /// </summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("Promote")]
        public HttpResponseMessage Promote(JObject body)
        {
            var gate = Gate(); if (gate != null) return gate;
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Body required" });

            var feedbackId = (long?)body["feedbackId"] ?? 0;
            var knowledgeId = (int?)body["knowledgeId"] ?? 0;
            var templateKey = (string)body["templateKey"];
            if (feedbackId <= 0 || knowledgeId <= 0 || string.IsNullOrWhiteSpace(templateKey))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "feedbackId, knowledgeId, templateKey are all required" });

            var fb = _svc.GetFeedbackById(feedbackId);
            if (fb == null) return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Feedback row not found" });

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
            return Request.CreateResponse(HttpStatusCode.OK, new { ok = true, templateId = tplId });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("Review")]
        public HttpResponseMessage Review(JObject body)
        {
            var gate = Gate(); if (gate != null) return gate;
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Body required" });
            var feedbackId = (long?)body["feedbackId"] ?? 0;
            if (feedbackId <= 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "feedbackId required" });
            _svc.MarkFeedbackReviewed(feedbackId, CurrentUserId, (string)body["notes"]);
            return Request.CreateResponse(HttpStatusCode.OK, new { ok = true });
        }

        private static object ToPayload(KbFeedback f) => f == null ? null : new
        {
            id = f.Id,
            sessionId = f.SessionId,
            ruleId = f.RuleId,
            knowledgeId = f.KnowledgeId,
            widgetType = f.WidgetType,
            op = f.Op,
            attemptedJson = f.AttemptedJson,
            rejectionMessage = f.RejectionMessage,
            fixedJson = f.FixedJson,
            outcome = f.Outcome,
            promoted = f.Promoted,
            promotedTemplateId = f.PromotedTemplateId,
            portalId = f.PortalId,
            formId = f.FormId,
            userId = f.UserId,
            createdOnDate = f.CreatedOnDate,
            reviewedByUserId = f.ReviewedByUserId,
            reviewedOnDate = f.ReviewedOnDate,
            reviewNotes = f.ReviewNotes,
        };
    }
}
