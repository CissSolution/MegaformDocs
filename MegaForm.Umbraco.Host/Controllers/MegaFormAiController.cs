using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiAssistant;
using MegaForm.Core.Services.AiKnowledge;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Core;

namespace MegaForm.Umbraco.Host.Controllers
{
    /// <summary>
    /// Minimal Umbraco-host parity for the MegaForm Local AI proxy.
    /// OpenAI-compatible chat completions endpoint served from the Knowledge Base.
    /// </summary>
    [Route("api/[controller]")]
    [Route("umbraco/MegaForm/MegaFormApi/AiAssistant")]
    [ApiController]
    public class MegaFormAiController : ControllerBase
    {
        private readonly IAiKnowledgeService _kb;

        public MegaFormAiController(IAiKnowledgeService kb)
        {
            _kb = kb;
        }

        [HttpGet("ping")]
        public IActionResult Ping()
        {
            return Content("{\"pong\":true,\"time\":" + DateTimeOffset.UtcNow.ToUnixTimeSeconds() + "}", "application/json");
        }

        [HttpGet("DefaultConfig")]
        [HttpGet("/DesktopModules/MegaForm/API/AiAssistant/DefaultConfig")]
        [Authorize(AuthenticationSchemes = Constants.Security.BackOfficeAuthenticationType)]
        public IActionResult GetDefaultConfig(int portalId = 0)
        {
            // Local demo ships with AI assistant dark by default. A real install can
            // override via POST DefaultConfig or host settings.
            return Ok(new
            {
                provider = "megaform-local",
                baseUrl = "/api/MegaFormAi",
                model = "megaform-local-kb",
                apiKey = string.Empty,
                enabled = false,
                trial = false,
            });
        }

        [HttpPost("DefaultConfig")]
        [HttpPost("/DesktopModules/MegaForm/API/AiAssistant/DefaultConfig")]
        [Authorize(AuthenticationSchemes = Constants.Security.BackOfficeAuthenticationType)]
        public IActionResult SaveDefaultConfig([FromBody] AiClientDefaultConfig config)
        {
            if (!User.Identity.IsAuthenticated) return StatusCode(403, new { error = "Admin required" });
            // Persisting settings is not implemented for the local demo; accept the
            // request so the dashboard UI does not show an error.
            return Ok(new { ok = true, persisted = false });
        }

        [HttpPost("chat/completions")]
        [AllowAnonymous]
        public async Task<IActionResult> ChatCompletions()
        {
            try
            {
                string raw;
                using (var reader = new StreamReader(Request.Body))
                    raw = await reader.ReadToEndAsync();

                JObject body;
                try { body = JObject.Parse(raw); }
                catch { body = null; }

                if (body == null)
                    return Content(JsonConvert.SerializeObject(BuildResponse("[Debug] body parse failed.")), "application/json");

                var messages = (body["messages"] as JArray) ?? new JArray();
                if (messages.Count == 0)
                    return Content(JsonConvert.SerializeObject(BuildResponse("[Debug] messages empty.")), "application/json");

                var query = ExtractLastUserMessage(messages) ?? "";
                var kbAnswer = await TryKbAnswerAsync(query);
                if (!string.IsNullOrWhiteSpace(kbAnswer))
                    return Content(JsonConvert.SerializeObject(BuildResponse(kbAnswer)), "application/json");

                return Content(JsonConvert.SerializeObject(BuildResponse(
                    "I don't have a specific answer in the MegaForm knowledge base. Try asking about fields, validation, workflows, or theming.")), "application/json");
            }
            catch (Exception ex)
            {
                return Content(JsonConvert.SerializeObject(BuildResponse(
                    "Local AI error: " + ex.Message)), "application/json");
            }
        }

        private static string ExtractLastUserMessage(JArray messages)
        {
            foreach (var m in messages.Reverse())
            {
                var role = (string)m["role"];
                var content = (string)m["content"];
                if (string.Equals(role, "user", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(content))
                    return content;
            }
            return null;
        }

        private async Task<string> TryKbAnswerAsync(string query)
        {
            if (string.IsNullOrWhiteSpace(query)) return null;
            try
            {
                var entries = _kb.ListEntries(null, null, null, 50).ToList();
                var scored = entries
                    .Where(e => !string.IsNullOrWhiteSpace(e.Body) || !string.IsNullOrWhiteSpace(e.Summary))
                    .Select(e => new { Entry = e, Score = ScoreEntry(e, query) })
                    .Where(x => x.Score > 0)
                    .OrderByDescending(x => x.Score)
                    .Take(3)
                    .ToList();

                if (!scored.Any()) return null;

                var sb = new StringBuilder();
                sb.AppendLine("Based on the MegaForm knowledge base:");
                sb.AppendLine();
                foreach (var item in scored)
                {
                    var e = item.Entry;
                    sb.AppendLine($"**{e.Title}** ({e.Kind})");
                    if (!string.IsNullOrWhiteSpace(e.Summary))
                        sb.AppendLine(e.Summary);
                    if (!string.IsNullOrWhiteSpace(e.Body) && e.Body.Length < 2000)
                    {
                        try
                        {
                            var parsed = JToken.Parse(e.Body);
                            sb.AppendLine("```json");
                            sb.AppendLine(parsed.ToString(Formatting.Indented));
                            sb.AppendLine("```");
                        }
                        catch
                        {
                            sb.AppendLine(e.Body);
                        }
                    }
                    sb.AppendLine();
                }
                return sb.ToString().Trim();
            }
            catch
            {
                return null;
            }
        }

        private static double ScoreEntry(AiKnowledgeEntry e, string query)
        {
            double score = 0;
            var q = query.ToLowerInvariant();
            var title = (e.Title ?? "").ToLowerInvariant();
            var summary = (e.Summary ?? "").ToLowerInvariant();
            var body = (e.Body ?? "").ToLowerInvariant();
            var tags = (e.Tags ?? "").ToLowerInvariant();

            if (title.Contains(q)) score += 20;
            if (summary.Contains(q)) score += 15;
            if (body.Contains(q)) score += 10;
            if (tags.Contains(q)) score += 12;

            var tokens = q.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var t in tokens)
            {
                if (title.Contains(t)) score += 5;
                if (summary.Contains(t)) score += 3;
                if (body.Contains(t)) score += 2;
                if (tags.Contains(t)) score += 2;
            }
            return score;
        }

        private static object BuildResponse(string content)
        {
            var id = "chatcmpl-" + Guid.NewGuid().ToString("N").Substring(0, 10);
            return new
            {
                id,
                @object = "chat.completion",
                created = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                model = "megaform-local-kb",
                choices = new[]
                {
                    new
                    {
                        index = 0,
                        message = new { role = "assistant", content },
                        finish_reason = "stop"
                    }
                },
                usage = new { prompt_tokens = 0, completion_tokens = 0, total_tokens = 0 }
            };
        }
    }
}
