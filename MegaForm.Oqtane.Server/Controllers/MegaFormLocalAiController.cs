using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiKnowledge;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Oqtane.Controllers;
using Oqtane.Infrastructure;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Controllers
{
    /// <summary>
    /// MegaForm Local AI Proxy — OpenAI-compatible endpoint that serves
    /// responses from the local Knowledge Base (no external API tokens).
    /// Falls back to Kimi CLI local if available and the user explicitly
    /// asks for creative / non-KB tasks.
    ///
    /// Route: POST /api/MegaFormAi/chat/completions
    /// Format: OpenAI chat.completions request/response
    /// </summary>
    [Route("api/MegaFormAi")]
    [IgnoreAntiforgeryToken]
    [ApiController]
    public class MegaFormLocalAiController : ControllerBase
    {
        private readonly IAiKnowledgeService _kb;
        private readonly ILogger<MegaFormLocalAiController> _localLogger;

        public MegaFormLocalAiController(
            IAiKnowledgeService kb,
            ILogger<MegaFormLocalAiController> localLogger)
        {
            _kb = kb;
            _localLogger = localLogger;
        }

        /// <summary>
        /// OpenAI-compatible chat completions endpoint.
        /// Always returns 200 with a synthetic assistant message.
        /// </summary>
        [HttpGet("ping")]
        [AllowAnonymous]
        public IActionResult Ping()
        {
            return Content("{\"pong\":true,\"time\":" + DateTimeOffset.UtcNow.ToUnixTimeSeconds() + "}", "application/json");
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
                    return Content(JsonConvert.SerializeObject(BuildOpenAiResponse("[Debug] body parse failed. raw: " + raw)), "application/json");
                var messages = (body["messages"] as JArray) ?? new JArray();
                if (messages.Count == 0)
                    return Content(JsonConvert.SerializeObject(BuildOpenAiResponse("[Debug] messages empty. body: " + body.ToString())), "application/json");
                var userMsg = ExtractLastUserMessage(messages);
                var query = (userMsg ?? string.Empty).Trim();

                // 1) Try Knowledge Base search first
                var kbAnswer = await TryKbAnswerAsync(query);
                if (!string.IsNullOrWhiteSpace(kbAnswer))
                {
                    return Content(JsonConvert.SerializeObject(BuildOpenAiResponse(kbAnswer)), "application/json");
                }

                // 2) Fallback: Kimi CLI local (if installed and query is non-empty)
                var kimiAnswer = await TryKimiCliAsync(query);
                if (!string.IsNullOrWhiteSpace(kimiAnswer))
                {
                    return Content(JsonConvert.SerializeObject(BuildOpenAiResponse(kimiAnswer)), "application/json");
                }

                // 3) Final fallback: generic helpful response
                var fallback = BuildFallbackResponse(query);
                return Content(JsonConvert.SerializeObject(BuildOpenAiResponse(fallback)), "application/json");
            }
            catch (Exception ex)
            {
                _localLogger.LogError(ex, "[MegaFormLocalAi] ChatCompletions error");
                return Content(JsonConvert.SerializeObject(BuildOpenAiResponse(
                    "Xin lỗi, Local AI đang gặp lỗi. Vui lòng kiểm tra log server hoặc thử lại sau.\n\n" +
                    "Chi tiết lỗi: " + ex.Message)), "application/json");
            }
        }

        // ── Helpers ───────────────────────────────────────────────────────

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

            // Search by widget type / surface hints embedded in query
            var widgetType = InferWidgetType(query);
            var surface = InferSurface(query);

            try
            {
                var entries = _kb.ListEntries(null, null, null, 50).ToList();
                var scored = entries
                    .Where(e => !string.IsNullOrWhiteSpace(e.Body) || !string.IsNullOrWhiteSpace(e.Summary))
                    .Select(e => new
                    {
                        Entry = e,
                        Score = ScoreEntry(e, query, widgetType, surface)
                    })
                    .Where(x => x.Score > 0)
                    .OrderByDescending(x => x.Score)
                    .Take(3)
                    .ToList();

                if (!scored.Any()) return null;

                var sb = new StringBuilder();
                sb.AppendLine("Dựa trên Knowledge Base của MegaForm, đây là thông tin hỗ trợ:");
                sb.AppendLine();
                foreach (var item in scored)
                {
                    var e = item.Entry;
                    sb.AppendLine($"**{e.Title}** ({e.Kind})");
                    if (!string.IsNullOrWhiteSpace(e.Summary))
                        sb.AppendLine(e.Summary);
                    if (!string.IsNullOrWhiteSpace(e.Body) && e.Body.Length < 2000)
                    {
                        // Try pretty-print JSON body
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
            catch (Exception ex)
            {
                _localLogger.LogWarning(ex, "[MegaFormLocalAi] KB search failed");
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

            // Exact match bonuses
            if (title.Contains(q)) score += 20;
            if (summary.Contains(q)) score += 15;
            if (body.Contains(q)) score += 10;
            if (tags.Contains(q)) score += 12;
            if (slug.Contains(q)) score += 18;

            // Word-by-word scoring
            var words = q.Split(new[] { ' ', ',', '.', '?', '!' }, StringSplitOptions.RemoveEmptyEntries)
                .Where(w => w.Length > 2).ToList();
            foreach (var w in words)
            {
                if (title.Contains(w)) score += 5;
                if (summary.Contains(w)) score += 4;
                if (body.Contains(w)) score += 2;
                if (tags.Contains(w)) score += 3;
                if (slug.Contains(w)) score += 4;
            }

            // Widget / surface boost
            if (!string.IsNullOrEmpty(widgetType) &&
                (e.WidgetType == widgetType || tags.Contains(widgetType)))
                score += 15;
            if (!string.IsNullOrEmpty(surface) &&
                (e.Surface == surface || tags.Contains(surface)))
                score += 10;

            return score;
        }

        private static string InferWidgetType(string query)
        {
            var q = query.ToLowerInvariant();
            if (q.Contains("list view") || q.Contains("listview")) return "listview";
            if (q.Contains("card view") || q.Contains("cardview")) return "card";
            if (q.Contains("list") && !q.Contains("listview")) return "list";
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
            if (q.Contains("builder") || q.Contains("form builder")) return "builder";
            return null;
        }

        private static async Task<string> TryKimiCliAsync(string query)
        {
            if (string.IsNullOrWhiteSpace(query)) return null;
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "kimi",
                    Arguments = $"chat --no-stream \"{query.Replace("\"", "\\\"")}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                using var proc = Process.Start(psi);
                if (proc == null) return null;
                var output = await proc.StandardOutput.ReadToEndAsync();
                var error = await proc.StandardError.ReadToEndAsync();
                await proc.WaitForExitAsync();
                if (proc.ExitCode != 0 && string.IsNullOrWhiteSpace(output))
                    return null;
                return string.IsNullOrWhiteSpace(output) ? null : $"[Kimi CLI] {output.Trim()}";
            }
            catch
            {
                return null;
            }
        }

        private static string BuildFallbackResponse(string query)
        {
            var q = (query ?? string.Empty).ToLowerInvariant();
            if (q.Contains("cấu hình") || q.Contains("config") || q.Contains("setting"))
            {
                return "Bạn đang hỏi về cấu hình. Vui lòng mở **Settings** trong module MegaForm để điều chỉnh:\n\n" +
                       "1. **Bound Form** — chọn form cần hiển thị\n" +
                       "2. **View Mode** — Form / List / Card / ListView\n" +
                       "3. **Display Mode** — Fixed (inline) / Popup / Slide-out\n" +
                       "4. **Theme Preset** — gõ tên preset (ví dụ: `modern-minimal`)\n\n" +
                       "Nếu cần hỗ trợ chi tiết hơn, hãy mô tả rõ bạn muốn làm gì.";
            }
            if (q.Contains("list view") || q.Contains("listview") || q.Contains("card view"))
            {
                return "Bạn đang hỏi về view mode. MegaForm hỗ trợ 3 chế độ hiển thị submissions:\n\n" +
                       "• **List** — bảng đơn giản với row template\n" +
                       "• **Card** — grid card responsive với card template\n" +
                       "• **ListView** — bảng đầy đủ: search, sort, pagination, inline edit/delete\n\n" +
                       "Chuyển đổi trong **Settings → View Mode**. Sau đó nhấn **Design Template** để chỉnh template.";
            }
            if (q.Contains("sample data") || q.Contains("dữ liệu mẫu"))
            {
                return "Để tạo dữ liệu mẫu:\n\n" +
                       "1. Mở **Settings** panel\n" +
                       "2. Nhấn nút **✨ Generate Sample Data** trong mục Sample Data\n" +
                       "3. Hệ thống sẽ tạo 8 bản ghi liên hệ mẫu (tên Việt Nam, email, công ty, SĐT)\n" +
                       "4. Refresh trang để xem kết quả\n\n" +
                       "Lưu ý: chỉ admin mới thấy nút này.";
            }
            return "Chào bạn! Tôi là **MegaForm Local AI** — trợ lý miễn phí dựa trên Knowledge Base.\n\n" +
                   "Bạn có thể hỏi tôi về:\n" +
                   "• Cấu hình module (Settings, View Mode, Theme)\n" +
                   "• Cách dùng List / Card / ListView\n" +
                   "• Tạo dữ liệu mẫu\n" +
                   "• Thiết kế template (Design Template)\n\n" +
                   "Hãy mô tả chi tiết vấn đề bạn gặp phải nhé.";
        }

        private static JObject BuildOpenAiResponse(string content)
        {
            var id = "mf-localai-" + Guid.NewGuid().ToString("N").Substring(0, 12);
            return new JObject
            {
                ["id"] = id,
                ["object"] = "chat.completion",
                ["created"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                ["model"] = "megaform-local-kb",
                ["choices"] = new JArray
                {
                    new JObject
                    {
                        ["index"] = 0,
                        ["message"] = new JObject
                        {
                            ["role"] = "assistant",
                            ["content"] = content,
                        },
                        ["finish_reason"] = "stop",
                    }
                },
                ["usage"] = new JObject
                {
                    ["prompt_tokens"] = 0,
                    ["completion_tokens"] = 0,
                    ["total_tokens"] = 0,
                }
            };
        }
    }
}
