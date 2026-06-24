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
    /// Admin endpoints for MF_AI_KB_Rules — dispatcher rules indexed by
    /// stable RuleId ('DL-001' …). Edit + bulk-enable from the Dashboard.
    ///
    /// Route prefix: /DesktopModules/MegaForm/API/AiKnowledgeRules/{action}
    /// </summary>
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class AiKnowledgeRulesController : DnnApiController
    {
        private readonly DnnAiKnowledgeService _svc = new DnnAiKnowledgeService();
        private int CurrentUserId => UserInfo?.UserID ?? 0;

        private HttpResponseMessage Gate()
            => AiFeatureGate.IsEnabled(PortalSettings?.HomeDirectoryMapPath)
                ? null
                : Request.CreateResponse(HttpStatusCode.NotFound, new { error = "AI knowledge disabled (no dev.lock)" });

        [HttpGet]
        [ActionName("List")]
        public HttpResponseMessage List(string widgetType = null, int knowledgeId = 0, bool? enabled = null)
        {
            var gate = Gate(); if (gate != null) return gate;
            int? kid = knowledgeId > 0 ? (int?)knowledgeId : null;
            var list = _svc.ListRules(widgetType, kid, enabled);
            return Request.CreateResponse(HttpStatusCode.OK, list.Select(ToPayload));
        }

        [HttpGet]
        [ActionName("Get")]
        public HttpResponseMessage Get(string ruleId)
        {
            var gate = Gate(); if (gate != null) return gate;
            var r = _svc.GetRule(ruleId);
            if (r == null) return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Not found" });
            return Request.CreateResponse(HttpStatusCode.OK, ToPayload(r));
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("Upsert")]
        public HttpResponseMessage Upsert(JObject body)
        {
            var gate = Gate(); if (gate != null) return gate;
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Body required" });
            var ruleId = (string)body["ruleId"];
            if (string.IsNullOrWhiteSpace(ruleId))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "ruleId is required" });
            var rule = new KbRule
            {
                RuleId = ruleId,
                KnowledgeId = body["knowledgeId"]?.Type == JTokenType.Null ? (int?)null : (int?)body["knowledgeId"],
                WidgetType = (string)body["widgetType"],
                Title = (string)body["title"] ?? ruleId,
                Severity = (string)body["severity"] ?? "hard_reject",
                Condition = (string)body["condition"] ?? string.Empty,
                RegexPattern = (string)body["regexPattern"],
                RejectionMessage = (string)body["rejectionMessage"] ?? string.Empty,
                FixHint = (string)body["fixHint"] ?? string.Empty,
                Source = (string)body["source"] ?? "customer",
                Enabled = body["enabled"]?.Type == JTokenType.Boolean ? (bool)body["enabled"] : true,
                PortalId = body["portalId"]?.Type == JTokenType.Null ? (int?)null : (int?)body["portalId"],
            };
            _svc.UpsertRule(rule, CurrentUserId);
            return Request.CreateResponse(HttpStatusCode.OK, ToPayload(_svc.GetRule(ruleId)));
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("Delete")]
        public HttpResponseMessage Delete(string ruleId)
        {
            var gate = Gate(); if (gate != null) return gate;
            if (string.IsNullOrWhiteSpace(ruleId))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "ruleId required" });
            _svc.DeleteRule(ruleId, CurrentUserId);
            return Request.CreateResponse(HttpStatusCode.OK, new { ok = true });
        }

        private static object ToPayload(KbRule r) => r == null ? null : new
        {
            ruleId = r.RuleId,
            knowledgeId = r.KnowledgeId,
            widgetType = r.WidgetType,
            title = r.Title,
            severity = r.Severity,
            condition = r.Condition,
            regexPattern = r.RegexPattern,
            rejectionMessage = r.RejectionMessage,
            fixHint = r.FixHint,
            source = r.Source,
            version = r.Version,
            enabled = r.Enabled,
            portalId = r.PortalId,
            createdOnDate = r.CreatedOnDate,
            updatedOnDate = r.UpdatedOnDate,
        };
    }
}
