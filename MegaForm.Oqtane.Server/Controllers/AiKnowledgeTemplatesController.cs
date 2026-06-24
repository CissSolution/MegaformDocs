using System;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiKnowledge;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using Oqtane.Controllers;
using Oqtane.Enums;
using Oqtane.Infrastructure;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Controllers
{
    /// <summary>
    /// Oqtane parity for MF_AI_KB_Templates admin CRUD. Mirrors the DNN
    /// AiKnowledgeTemplatesController surface (List / Get / Upsert / Delete).
    /// </summary>
    [Route("api/[controller]")]
    [IgnoreAntiforgeryToken]
    public class AiKnowledgeTemplatesController : ModuleControllerBase
    {
        private readonly IAiKnowledgeService _svc;

        public AiKnowledgeTemplatesController(IAiKnowledgeService svc, ILogManager logger, IHttpContextAccessor accessor) : base(logger, accessor)
        {
            _svc = svc;
        }

        private int SiteId => AuthEntityId(EntityNames.Site);
        private int CurrentUserId => int.TryParse(User?.FindFirst("sub")?.Value ?? User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var uid) ? uid : -1;
        private bool IsAdmin => User != null && (User.IsInRole(RoleNames.Admin) || User.IsInRole(RoleNames.Host));

        [HttpGet("List")]
        public IActionResult List(int knowledgeId, string kind = null)
        {
            if (!IsAdmin) return Forbid();
            var list = _svc.ListTemplates(knowledgeId, kind, SiteId).Select(ToPayload);
            return Ok(list);
        }

        [HttpGet("Get")]
        public IActionResult Get(int id = 0, int knowledgeId = 0, string templateKey = null)
        {
            if (!IsAdmin) return Forbid();
            KbTemplate t = null;
            if (id > 0) t = _svc.GetTemplateById(id);
            else if (knowledgeId > 0 && !string.IsNullOrWhiteSpace(templateKey))
                t = _svc.GetTemplateByKey(knowledgeId, templateKey, SiteId);
            if (t == null) return NotFound(new { error = "Not found" });
            return Ok(ToPayload(t));
        }

        [HttpPost("Upsert")]
        public IActionResult Upsert([FromBody] JObject body)
        {
            if (!IsAdmin) return Forbid();
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
            if (!IsAdmin) return Forbid();
            if (id <= 0) return BadRequest(new { error = "id required" });
            _svc.DeleteTemplate(id, CurrentUserId);
            return Ok(new { ok = true });
        }

        private static object ToPayload(KbTemplate t) => t == null ? null : new {
            id = t.Id, knowledgeId = t.KnowledgeId, templateKey = t.TemplateKey, kind = t.Kind,
            title = t.Title, summary = t.Summary, body = t.Body, tags = SplitTags(t.Tags),
            score = t.Score, sortOrder = t.SortOrder, portalId = t.PortalId, source = t.Source,
            version = t.Version, createdOnDate = t.CreatedOnDate, updatedOnDate = t.UpdatedOnDate,
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
