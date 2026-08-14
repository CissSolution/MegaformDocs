using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiKnowledge;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Web.Common.Authorization;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// MegaForm AI Knowledge Base rules admin CRUD for Umbraco.
    /// Mirrors MegaForm.Oqtane.Server.Controllers.AiKnowledgeRulesController.
    /// </summary>
    [Route("api/[controller]")]
    [Route("/umbraco/MegaForm/MegaFormApi/[controller]")]
    [IgnoreAntiforgeryToken]
    [Authorize(Policy = "MegaFormBackOffice")]
    public class AiKnowledgeRulesController : ControllerBase
    {
        private readonly IAiKnowledgeService _svc;
        private readonly IPlatformContext _platform;

        public AiKnowledgeRulesController(IAiKnowledgeService svc, IPlatformContext platform)
        {
            _svc = svc;
            _platform = platform;
        }

        private int CurrentUserId => _platform?.UserId > 0 ? _platform.UserId : -1;
        private bool IsAdmin => User != null && (
            User.IsInRole("Administrator") || User.IsInRole("Administrators") || User.IsInRole("Admin") ||
            User.IsInRole("admin") || User.IsInRole("Host") || User.IsInRole("host"));

        [HttpGet("List")]
        public IActionResult List(string widgetType = null, int knowledgeId = 0, bool? enabled = null)
        {
            if (!IsAdmin) return Forbid();
            int? kid = knowledgeId > 0 ? (int?)knowledgeId : null;
            var list = _svc.ListRules(widgetType, kid, enabled).Select(ToPayload);
            return Ok(list);
        }

        [HttpGet("Get")]
        public IActionResult Get(string ruleId)
        {
            if (!IsAdmin) return Forbid();
            var r = _svc.GetRule(ruleId);
            if (r == null) return NotFound(new { error = "Not found" });
            return Ok(ToPayload(r));
        }

        [HttpPost("Upsert")]
        public IActionResult Upsert([FromBody] JObject body)
        {
            if (!IsAdmin) return Forbid();
            if (body == null) return BadRequest(new { error = "Body required" });
            var ruleId = (string)body["ruleId"];
            if (string.IsNullOrWhiteSpace(ruleId)) return BadRequest(new { error = "ruleId is required" });
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
            return Ok(ToPayload(_svc.GetRule(ruleId)));
        }

        [HttpPost("Delete")]
        public IActionResult Delete(string ruleId)
        {
            if (!IsAdmin) return Forbid();
            if (string.IsNullOrWhiteSpace(ruleId)) return BadRequest(new { error = "ruleId required" });
            _svc.DeleteRule(ruleId, CurrentUserId);
            return Ok(new { ok = true });
        }

        private static object ToPayload(KbRule r) => r == null ? null : new
        {
            ruleId = r.RuleId, knowledgeId = r.KnowledgeId, widgetType = r.WidgetType,
            title = r.Title, severity = r.Severity, condition = r.Condition,
            regexPattern = r.RegexPattern, rejectionMessage = r.RejectionMessage, fixHint = r.FixHint,
            source = r.Source, version = r.Version, enabled = r.Enabled, portalId = r.PortalId,
            createdOnDate = r.CreatedOnDate, updatedOnDate = r.UpdatedOnDate,
        };
    }
}
