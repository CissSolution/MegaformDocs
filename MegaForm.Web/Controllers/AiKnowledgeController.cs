using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiKnowledge;
using MegaForm.Web.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json.Linq;

namespace MegaForm.Web.Controllers
{
    /// <summary>
    /// MegaForm AI Knowledge Base admin API for ASP.NET Core hosts.
    /// Mirrors the Oqtane/DNN surface: List / Kinds / Get / Upsert / Delete / History / SearchScoped / SeedViewModes.
    /// </summary>
    [Route("api/[controller]")]
    [IgnoreAntiforgeryToken]
    [Authorize(Roles = "Administrator")]
    public class AiKnowledgeController : ControllerBase
    {
        private readonly IAiKnowledgeService _svc;
        private readonly IPlatformContext _platform;
        private readonly MegaFormDbContext _db;

        public AiKnowledgeController(IAiKnowledgeService svc, IPlatformContext platform, MegaFormDbContext db)
        {
            _svc = svc;
            _platform = platform;
            _db = db;
        }

        private int PortalId => _platform?.PortalId > 0 ? _platform.PortalId : 0;
        private int CurrentUserId => _platform?.UserId > 0 ? _platform.UserId : -1;

        [HttpGet("Ping")]
        [AllowAnonymous]
        public IActionResult Ping() => Ok(new { pong = true, now = DateTime.UtcNow });

        [HttpGet("List")]
        public IActionResult List(string kind = null, string search = null, int top = 200)
        {
            try
            {
                var entries = _svc.ListEntries(kind, search, PortalId, top).ToList();
                return Ok(new { count = entries.Count, firstSlug = entries.FirstOrDefault()?.Slug });
            }
            catch (Exception ex) { return Ok(new { error = ex.Message, stack = ex.StackTrace }); }
        }

        [HttpGet("Kinds")]
        public IActionResult Kinds() => Ok(_svc.ListKinds(PortalId));

        public class SearchScopedRequest
        {
            public string WidgetType { get; set; }
            public string Surface { get; set; }
            public string Query { get; set; }
            public int Limit { get; set; } = 5;
        }

        [HttpPost("SearchScoped")]
        public IActionResult SearchScoped([FromBody] SearchScopedRequest req)
        {
            if (req == null) return BadRequest(new { error = "Body required" });
            var widgetType = (req.WidgetType ?? string.Empty).Trim();
            var surface = (req.Surface ?? string.Empty).Trim();
            var query = (req.Query ?? string.Empty).Trim();
            var limit = Math.Max(1, Math.Min(req.Limit > 0 ? req.Limit : 5, 25));
            try
            {
                IQueryable<AiKnowledgeEntry> q = _db.AiKnowledgeEntries.AsNoTracking();
                var p = PortalId;
                q = q.Where(e => e.PortalId == null || e.PortalId == p);
                if (!string.IsNullOrEmpty(widgetType))
                    q = q.Where(e => e.WidgetType == null || e.WidgetType == widgetType || (e.Tags != null && EF.Functions.Like(e.Tags, "%widget:" + widgetType + "%")));
                if (!string.IsNullOrEmpty(surface))
                    q = q.Where(e => e.Surface == null || e.Surface == surface || (e.Tags != null && EF.Functions.Like(e.Tags, "%surface:" + surface + "%")));
                if (!string.IsNullOrEmpty(query))
                {
                    var s = query;
                    q = q.Where(e =>
                        (e.Title != null && EF.Functions.Like(e.Title, "%" + s + "%")) ||
                        (e.Summary != null && EF.Functions.Like(e.Summary, "%" + s + "%")) ||
                        (e.Body != null && EF.Functions.Like(e.Body, "%" + s + "%")) ||
                        (e.Tags != null && EF.Functions.Like(e.Tags, "%" + s + "%")) ||
                        (e.Slug != null && EF.Functions.Like(e.Slug, "%" + s + "%")));
                }
                var rows = q
                    .OrderBy(e => e.WidgetType == widgetType ? 0 : 1)
                    .ThenBy(e => e.Surface == surface ? 0 : 1)
                    .ThenBy(e => e.PortalId == p ? 0 : 1)
                    .ThenBy(e => e.Kind)
                    .ThenBy(e => e.Slug)
                    .Take(limit).ToList();
                return Ok(new
                {
                    results = rows.Select(e => new { id = e.Id, slug = e.Slug, kind = e.Kind, title = e.Title, summary = e.Summary, tags = SplitTags(e.Tags), widgetType = e.WidgetType, surface = e.Surface }),
                    widgetType, surface, query, count = rows.Count
                });
            }
            catch (Exception ex)
            {
                return Ok(new { results = Array.Empty<object>(), warning = "KB SearchScoped fell back to empty: " + ex.Message });
            }
        }

        [HttpGet("Get")]
        public IActionResult Get(string slug = null, int id = 0)
        {
            AiKnowledgeEntry e = null;
            if (id > 0) e = _svc.GetEntryById(id);
            else if (!string.IsNullOrWhiteSpace(slug)) e = _svc.GetEntryBySlug(slug, PortalId);
            if (e == null) return NotFound(new { error = "Not found" });
            return Ok(ToFullPayload(e));
        }

        [HttpPost("Upsert")]
        public IActionResult Upsert([FromBody] JObject body)
        {
            if (body == null) return BadRequest(new { error = "Body required" });
            var slug = (string)body["slug"] ?? string.Empty;
            if (string.IsNullOrWhiteSpace(slug)) return BadRequest(new { error = "slug is required" });
            var existing = _svc.GetEntryBySlug(slug, PortalId);
            string source = (string)body["source"];
            if (string.IsNullOrWhiteSpace(source))
                source = (existing != null && existing.Source == "megaform-builtin") ? "customer-overridden" : "customer";
            var entry = new AiKnowledgeEntry
            {
                Id = (int?)body["id"] ?? (existing?.Id ?? 0),
                Slug = slug,
                Kind = (string)body["kind"] ?? "system_arch",
                Title = (string)body["title"] ?? slug,
                Summary = (string)body["summary"],
                Body = (string)body["body"],
                Tags = JoinTags(body["tags"]),
                Examples = body["examples"]?.ToString(),
                PortalId = body["portalId"]?.Type == JTokenType.Null ? (int?)null : (int?)body["portalId"],
                Source = source,
                WidgetType = (string)body["widgetType"],
                Surface = (string)body["surface"],
            };
            var id = _svc.UpsertEntry(entry, CurrentUserId);
            entry = _svc.GetEntryById(id);
            return Ok(ToFullPayload(entry));
        }

        [HttpPost("Delete")]
        public IActionResult Delete([FromQuery] int id)
        {
            if (id <= 0) return BadRequest(new { error = "id required" });
            _svc.DeleteEntry(id, CurrentUserId);
            return Ok(new { ok = true });
        }

        [HttpPost("SeedViewModes")]
        public IActionResult SeedViewModes()
        {
            try
            {
                var seeded = 0; var updated = 0;
                foreach (var entry in GetViewModeEntries())
                {
                    var existing = _svc.GetEntryBySlug(entry.Slug, PortalId);
                    if (existing == null)
                    {
                        entry.Source = "megaform-builtin"; entry.Version = 1; entry.CreatedOnDate = DateTime.UtcNow;
                        _svc.UpsertEntry(entry, CurrentUserId); seeded++;
                    }
                    else
                    {
                        bool changed = false;
                        if (existing.WidgetType != entry.WidgetType) { existing.WidgetType = entry.WidgetType; changed = true; }
                        if (existing.Surface != entry.Surface) { existing.Surface = entry.Surface; changed = true; }
                        if (existing.Kind != entry.Kind) { existing.Kind = entry.Kind; changed = true; }
                        if (existing.Title != entry.Title) { existing.Title = entry.Title; changed = true; }
                        if (existing.Summary != entry.Summary) { existing.Summary = entry.Summary; changed = true; }
                        if (existing.Body != entry.Body) { existing.Body = entry.Body; changed = true; }
                        if (existing.Tags != entry.Tags) { existing.Tags = entry.Tags; changed = true; }
                        if (changed) { _svc.UpsertEntry(existing, CurrentUserId); updated++; }
                    }
                }
                return Ok(new { ok = true, seeded, updated });
            }
            catch (Exception ex) { return Ok(new { ok = false, error = ex.Message, stack = ex.StackTrace }); }
        }

        [HttpGet("History")]
        public IActionResult History(int id, int top = 50)
        {
            var list = _svc.ListEntryHistory(id, top).Select(h => new
            {
                historyId = h.HistoryId, knowledgeId = h.KnowledgeId, slug = h.Slug, title = h.Title,
                action = h.ChangeAction, version = h.Version, changedOnDate = h.ChangedOnDate, changedByUserId = h.ChangedByUserId,
            });
            return Ok(list);
        }

        private static List<AiKnowledgeEntry> GetViewModeEntries() => new()
        {
            new AiKnowledgeEntry { Slug = "designer-list-view", Kind = "designer", Title = "List View Designer", Summary = "Configure submission list view: pick visible fields, set row template tokens, enable search/sort/pagination.", Body = "{}", Tags = "designer,listview,view-mode,submission-display", Examples = "", WidgetType = "list", Surface = "designer" },
            new AiKnowledgeEntry { Slug = "designer-card-view", Kind = "designer", Title = "Card View Designer", Summary = "Configure submission card view: set card width, image field, title field, body template, and responsive grid columns.", Body = "{}", Tags = "designer,cardview,view-mode,submission-display", Examples = "", WidgetType = "card", Surface = "designer" },
            new AiKnowledgeEntry { Slug = "designer-listview-runtime", Kind = "designer", Title = "ListView Runtime Designer", Summary = "Configure the full-featured ListView: columns, inline actions, search, sort, pagination, and row click handlers.", Body = "{}", Tags = "designer,listview,view-mode,submission-display", Examples = "", WidgetType = "listview", Surface = "designer" },
            new AiKnowledgeEntry { Slug = "view-template-list-row", Kind = "row_template", Title = "List View Row Template", Summary = "Default row template for the List view.", Body = "<tr><td>{{submission:id}}</td><td>{{field:Name}}</td><td>{{field:Email}}</td><td>{{submission:date}}</td><td>{{submission:status}}</td></tr>", Tags = "template,list,row,submission-display", Examples = "", WidgetType = "list", Surface = "designer" },
            new AiKnowledgeEntry { Slug = "view-template-card-item", Kind = "row_template", Title = "Card View Item Template", Summary = "Default card template for the Card view.", Body = "<div class=\"mf-card-item\"><h4>{{field:Name}}</h4><p>{{field:Email}}</p><small>{{submission:date}}</small></div>", Tags = "template,card,row,submission-display", Examples = "", WidgetType = "card", Surface = "designer" },
        };

        private static object ToFullPayload(AiKnowledgeEntry e) => new
        {
            id = e.Id, slug = e.Slug, kind = e.Kind, title = e.Title, summary = e.Summary,
            body = e.Body, tags = SplitTags(e.Tags), examples = e.Examples,
            portalId = e.PortalId, source = e.Source, version = e.Version,
            widgetType = e.WidgetType, surface = e.Surface,
            createdOnDate = e.CreatedOnDate, updatedOnDate = e.UpdatedOnDate,
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
