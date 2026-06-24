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
    /// Admin endpoints for MF_AI_KB_Templates — many concrete templates per
    /// knowledge entry (preset / pattern / success / failure).
    ///
    /// Route prefix: /DesktopModules/MegaForm/API/AiKnowledgeTemplates/{action}
    /// All endpoints require Administrators role and dev.lock gating.
    /// </summary>
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class AiKnowledgeTemplatesController : DnnApiController
    {
        private readonly DnnAiKnowledgeService _svc = new DnnAiKnowledgeService();
        private int CurrentPortalId => PortalSettings?.PortalId ?? 0;
        private int CurrentUserId => UserInfo?.UserID ?? 0;

        private HttpResponseMessage Gate()
            => AiFeatureGate.IsEnabled(PortalSettings?.HomeDirectoryMapPath)
                ? null
                : Request.CreateResponse(HttpStatusCode.NotFound, new { error = "AI knowledge disabled (no dev.lock)" });

        [HttpGet]
        [ActionName("List")]
        public HttpResponseMessage List(int knowledgeId, string kind = null)
        {
            var gate = Gate(); if (gate != null) return gate;
            var list = _svc.ListTemplates(knowledgeId, kind, CurrentPortalId);
            return Request.CreateResponse(HttpStatusCode.OK, list.Select(ToPayload));
        }

        [HttpGet]
        [ActionName("Get")]
        public HttpResponseMessage Get(int id = 0, int knowledgeId = 0, string templateKey = null)
        {
            var gate = Gate(); if (gate != null) return gate;
            KbTemplate t = null;
            if (id > 0) t = _svc.GetTemplateById(id);
            else if (knowledgeId > 0 && !string.IsNullOrWhiteSpace(templateKey))
                t = _svc.GetTemplateByKey(knowledgeId, templateKey, CurrentPortalId);
            if (t == null) return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Not found" });
            return Request.CreateResponse(HttpStatusCode.OK, ToPayload(t));
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("Upsert")]
        public HttpResponseMessage Upsert(JObject body)
        {
            var gate = Gate(); if (gate != null) return gate;
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Body required" });
            var t = new KbTemplate
            {
                Id = (int?)body["id"] ?? 0,
                KnowledgeId = (int?)body["knowledgeId"] ?? 0,
                TemplateKey = (string)body["templateKey"],
                Kind = (string)body["kind"] ?? "preset",
                Title = (string)body["title"],
                Summary = (string)body["summary"],
                Body = body["body"]?.ToString() ?? string.Empty,
                Tags = JoinTags(body["tags"]),
                Score = (int?)body["score"] ?? 0,
                SortOrder = (int?)body["sortOrder"] ?? 100,
                PortalId = body["portalId"]?.Type == JTokenType.Null ? (int?)null : (int?)body["portalId"],
                Source = (string)body["source"] ?? "customer",
            };
            if (t.KnowledgeId <= 0 || string.IsNullOrWhiteSpace(t.TemplateKey))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "knowledgeId + templateKey are required" });
            var id = _svc.UpsertTemplate(t, CurrentUserId);
            return Request.CreateResponse(HttpStatusCode.OK, ToPayload(_svc.GetTemplateById(id)));
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("Delete")]
        public HttpResponseMessage Delete([FromUri] int id)
        {
            var gate = Gate(); if (gate != null) return gate;
            if (id <= 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "id required" });
            _svc.DeleteTemplate(id, CurrentUserId);
            return Request.CreateResponse(HttpStatusCode.OK, new { ok = true });
        }

        private static object ToPayload(KbTemplate t) => t == null ? null : new
        {
            id = t.Id,
            knowledgeId = t.KnowledgeId,
            templateKey = t.TemplateKey,
            kind = t.Kind,
            title = t.Title,
            summary = t.Summary,
            body = t.Body,
            tags = SplitTags(t.Tags),
            score = t.Score,
            sortOrder = t.SortOrder,
            portalId = t.PortalId,
            source = t.Source,
            version = t.Version,
            createdOnDate = t.CreatedOnDate,
            updatedOnDate = t.UpdatedOnDate,
        };

        private static string[] SplitTags(string csv) => string.IsNullOrWhiteSpace(csv)
            ? Array.Empty<string>()
            : csv.Split(',').Select(s => s.Trim()).Where(s => s.Length > 0).ToArray();

        private static string JoinTags(JToken token)
        {
            if (token == null) return null;
            if (token.Type == JTokenType.String) return (string)token;
            if (token is JArray arr) return string.Join(",", arr.Select(t => (string)t).Where(s => !string.IsNullOrWhiteSpace(s)));
            return null;
        }
    }
}
