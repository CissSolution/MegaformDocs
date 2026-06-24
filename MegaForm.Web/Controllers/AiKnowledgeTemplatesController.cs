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
    public class AiKnowledgeTemplatesController : ControllerBase
    {
        private readonly IAiKnowledgeService _svc;
        private readonly IPlatformContext _platform;

        public AiKnowledgeTemplatesController(IAiKnowledgeService svc, IPlatformContext platform)
        {
            _svc = svc;
            _platform = platform;
        }

        private int PortalId => _platform?.PortalId > 0 ? _platform.PortalId : 0;
        private int CurrentUserId => _platform?.UserId > 0 ? _platform.UserId : -1;

        [HttpGet("List")]
        public IActionResult List(int knowledgeId, string kind = null)
            => Ok(_svc.ListTemplates(knowledgeId, kind, PortalId).Select(ToPayload));

        [HttpGet("Get")]
        public IActionResult Get(int id = 0, int knowledgeId = 0, string templateKey = null)
        {
            KbTemplate t = null;
            if (id > 0) t = _svc.GetTemplateById(id);
            else if (knowledgeId > 0 && !string.IsNullOrWhiteSpace(templateKey))
                t = _svc.GetTemplateByKey(knowledgeId, templateKey, PortalId);
            if (t == null) return NotFound(new { error = "Not found" });
            return Ok(ToPayload(t));
        }

        [HttpPost("Upsert")]
        public IActionResult Upsert([FromBody] JObject body)
        {
            if (body == null) return BadRequest(new { error = "Body required" });
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
                return BadRequest(new { error = "knowledgeId + templateKey are required" });
            var id = _svc.UpsertTemplate(t, CurrentUserId);
            return Ok(ToPayload(_svc.GetTemplateById(id)));
        }

        [HttpPost("Delete")]
        public IActionResult Delete([FromQuery] int id)
        {
            if (id <= 0) return BadRequest(new { error = "id required" });
            _svc.DeleteTemplate(id, CurrentUserId);
            return Ok(new { ok = true });
        }

        private static object ToPayload(KbTemplate t) => t == null ? null : new
        {
            id = t.Id, knowledgeId = t.KnowledgeId, templateKey = t.TemplateKey, kind = t.Kind,
            title = t.Title, summary = t.Summary, body = t.Body, tags = SplitTags(t.Tags),
            score = t.Score, sortOrder = t.SortOrder, portalId = t.PortalId, source = t.Source,
            version = t.Version, createdOnDate = t.CreatedOnDate, updatedOnDate = t.UpdatedOnDate,
        };

        private static string[] SplitTags(string csv) => string.IsNullOrWhiteSpace(csv)
            ? Array.Empty<string>() : csv.Split(',').Select(s => s.Trim()).Where(s => s.Length > 0).ToArray();

        private static string JoinTags(JToken token)
        {
            if (token == null) return null;
            if (token.Type == JTokenType.String) return (string)token;
            if (token is JArray arr) return string.Join(",", arr.Select(t => (string)t).Where(s => !string.IsNullOrWhiteSpace(s)));
            return null;
        }
    }
}
