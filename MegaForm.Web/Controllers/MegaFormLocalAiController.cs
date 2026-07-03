using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiKnowledge;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Web.Controllers
{
    /// <summary>
    /// OpenAI-compatible local AI proxy for ASP.NET Core hosts.
    /// Serves responses from the MegaForm Knowledge Base; falls back to Kimi CLI when available.
    /// Route: POST /api/MegaFormAi/chat/completions
    /// </summary>
    [Route("api/MegaFormAi")]
    [IgnoreAntiforgeryToken]
    [ApiController]
    public class MegaFormLocalAiController : ControllerBase
    {
        private readonly IAiKnowledgeService _kb;
        private readonly ILogger<MegaFormLocalAiController> _logger;

        public MegaFormLocalAiController(IAiKnowledgeService kb, ILogger<MegaFormLocalAiController> logger)
        {
            _kb = kb;
            _logger = logger;
        }

        [HttpGet("ping")]
        [AllowAnonymous]
        public IActionResult Ping() => Content("{\"pong\":true,\"time\":" + DateTimeOffset.UtcNow.ToUnixTimeSeconds() + "}", "application/json");

        // [SecFix 2026-07-03 P0-3] Was [AllowAnonymous]. The Local AI assistant is a builder
        // (admin) surface and can fall through to a local `kimi` process spawn, so it must not be
        // reachable unauthenticated — require a logged-in user. Removes the unauthenticated RCE
        // surface (the kimi fallback stays env-gated + argv-array on top of this).
        [HttpPost("chat/completions")]
        [Authorize]
        public async Task<IActionResult> ChatCompletions()
        {
            try
            {
                string raw;
                using (var reader = new StreamReader(Request.Body)) raw = await reader.ReadToEndAsync();
                JObject body;
                try { body = JObject.Parse(raw); }
                catch { body = null; }
                if (body == null)
                    return Content(JsonConvert.SerializeObject(BuildOpenAiResponse("[Debug] body parse failed. raw: " + raw)), "application/json");
                var messages = (body["messages"] as JArray) ?? new JArray();
                if (messages.Count == 0)
                    return Content(JsonConvert.SerializeObject(BuildOpenAiResponse("[Debug] messages empty. body: " + body.ToString())), "application/json");
                var userMsg = ExtractLastUserMessage(messages);
                var query = (userMsg ?? string.Empty).Trim();

                var kbAnswer = await TryKbAnswerAsync(query);
                if (!string.IsNullOrWhiteSpace(kbAnswer))
                    return Content(JsonConvert.SerializeObject(BuildOpenAiResponse(kbAnswer)), "application/json");

                var kimiAnswer = await TryKimiCliAsync(query);
                if (!string.IsNullOrWhiteSpace(kimiAnswer))
                    return Content(JsonConvert.SerializeObject(BuildOpenAiResponse(kimiAnswer)), "application/json");

                return Content(JsonConvert.SerializeObject(BuildOpenAiResponse(BuildFallbackResponse(query))), "application/json");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaFormLocalAi] ChatCompletions error");
                return Content(JsonConvert.SerializeObject(BuildOpenAiResponse(
                    "Xin lỗi, Local AI đang gặp lỗi. Vui lòng kiểm tra log server hoặc thử lại sau.\n\nChi tiết lỗi: " + ex.Message)), "application/json");
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
            var widgetType = InferWidgetType(query);
            var surface = InferSurface(query);
            try
            {
                var entries = _kb.ListEntries(null, null, null, 50).ToList();
                var scored = entries
                    .Where(e => !string.IsNullOrWhiteSpace(e.Body) || !string.IsNullOrWhiteSpace(e.Summary))
                    .Select(e => new { Entry = e, Score = ScoreEntry(e, query, widgetType, surface) })
                    .Where(x => x.Score > 0)
                    .OrderByDescending(x => x.Score)
                    .Take(3).ToList();
                if (!scored.Any()) return null;
                var sb = new StringBuilder();
                sb.AppendLine("Dựa trên Knowledge Base của MegaForm, đây là thông tin hỗ trợ:");
                sb.AppendLine();
                foreach (var item in scored)
                {
                    var e = item.Entry;
                    sb.AppendLine($"**{e.Title}** ({e.Kind})");
                    if (!string.IsNullOrWhiteSpace(e.Summary)) sb.AppendLine(e.Summary);
                    if (!string.IsNullOrWhiteSpace(e.Body) && e.Body.Length < 2000)
                    {
                        try { sb.AppendLine("```json"); sb.AppendLine(JToken.Parse(e.Body).ToString(Formatting.Indented)); sb.AppendLine("```"); }
                        catch { sb.AppendLine(e.Body); }
                    }
                    sb.AppendLine();
                }
                return sb.ToString().Trim();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[MegaFormLocalAi] KB search failed");
                return null;
            }
        }

        private static double ScoreEntry(AiKnowledgeEntry e, string query, string widgetType, string surface)
        {
            double score = 0;
            var q = query.ToLowerInvariant();
            var title = (e.Title ?? string.Empty).ToLowerInvariant();
            var summary = (e.Summary ?? string.Empty).ToLowerInvariant();
            var body = (e.Body ?? string.Empty).ToLowerInvariant();
            var tags = (e.Tags ?? string.Empty).ToLowerInvariant();
            var slug = (e.Slug ?? string.Empty).ToLowerInvariant();
            if (title.Contains(q)) score += 20;
            if (summary.Contains(q)) score += 15;
            if (body.Contains(q)) score += 10;
            if (tags.Contains(q)) score += 12;
            if (slug.Contains(q)) score += 18;
            var words = q.Split(new[] { ' ', ',', '.', '?', '!' }, StringSplitOptions.RemoveEmptyEntries).Where(w => w.Length > 2).ToList();
            foreach (var w in words)
            {
                if (title.Contains(w)) score += 5;
                if (summary.Contains(w)) score += 4;
                if (body.Contains(w)) score += 2;
                if (tags.Contains(w)) score += 3;
                if (slug.Contains(w)) score += 4;
            }
            if (!string.IsNullOrEmpty(widgetType) && (e.WidgetType == widgetType || tags.Contains(widgetType))) score += 15;
            if (!string.IsNullOrEmpty(surface) && (e.Surface == surface || tags.Contains(surface))) score += 10;
            return score;
        }

        private static string InferWidgetType(string query)
        {
            var q = query.ToLowerInvariant();
            if (q.Contains("list view") || q.Contains("listview")) return "listview";
            if (q.Contains("card view") || q.Contains("cardview")) return "card";
            if (q.Contains("list")) return "list";
            if (q.Contains("datagrid") || q.Contains("grid")) return "datagrid";
            if (q.Contains("datarepeater") || q.Contains("repeater")) return "datarepeater";
            if (q.Contains("dynamiclabel") || q.Contains("label")) return "dynamiclabel";
            return null;
        }

        private static string InferSurface(string query)
        {
            var q = query.ToLowerInvariant();
            if (q.Contains("designer") || q.Contains("template")) return "designer";
            if (q.Contains("runtime") || q.Contains("render")) return "runtime";
            if (q.Contains("builder")) return "builder";
            return null;
        }

        private static async Task<string> TryKimiCliAsync(string query)
        {
            if (string.IsNullOrWhiteSpace(query)) return null;
            if (!string.Equals(Environment.GetEnvironmentVariable("MEGAFORM_ALLOW_LOCAL_AI_CLI"), "1", StringComparison.Ordinal))
                return null;
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "kimi",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                psi.ArgumentList.Add("chat");
                psi.ArgumentList.Add("--no-stream");
                psi.ArgumentList.Add(query.Length > 4000 ? query.Substring(0, 4000) : query);
                using var proc = Process.Start(psi);
                if (proc == null) return null;
                var output = await proc.StandardOutput.ReadToEndAsync();
                await proc.WaitForExitAsync();
                if (proc.ExitCode != 0 && string.IsNullOrWhiteSpace(output)) return null;
                return string.IsNullOrWhiteSpace(output) ? null : $"[Kimi CLI] {output.Trim()}";
            }
            catch { return null; }
        }

        private static string BuildFallbackResponse(string query)
        {
            var q = (query ?? string.Empty).ToLowerInvariant();
            if (q.Contains("cấu hình") || q.Contains("config") || q.Contains("setting"))
                return "Bạn đang hỏi về cấu hình. Vui lòng mở **Settings** trong MegaForm để điều chỉnh Bound Form, View Mode, Display Mode, Theme Preset.";
            if (q.Contains("list view") || q.Contains("listview") || q.Contains("card view"))
                return "MegaForm hỗ trợ 3 chế độ hiển thị submissions: List, Card, ListView. Chuyển đổi trong Settings → View Mode.";
            if (q.Contains("sample data") || q.Contains("dữ liệu mẫu"))
                return "Tạo dữ liệu mẫu: mở Settings panel → nhấn **✨ Generate Sample Data**.";
            return "Chào bạn! Tôi là **MegaForm Local AI** — trợ lý dựa trên Knowledge Base. Bạn có thể hỏi về cấu hình module, view mode, template, hoặc dữ liệu mẫu.";
        }

        private static JObject BuildOpenAiResponse(string content)
        {
            var id = "mf-localai-" + Guid.NewGuid().ToString("N")[..12];
            return new JObject
            {
                ["id"] = id,
                ["object"] = "chat.completion",
                ["created"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                ["model"] = "megaform-local-kb",
                ["choices"] = new JArray { new JObject { ["index"] = 0, ["message"] = new JObject { ["role"] = "assistant", ["content"] = content }, ["finish_reason"] = "stop" } },
                ["usage"] = new JObject { ["prompt_tokens"] = 0, ["completion_tokens"] = 0, ["total_tokens"] = 0 }
            };
        }
    }
}
