using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiKnowledge;
using MegaForm.Umbraco.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Web.Common.Authorization;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// MegaForm AI Knowledge Base admin CRUD for Umbraco.
    /// Mirrors MegaForm.Oqtane.Server.Controllers.AiKnowledgeController.
    /// </summary>
    [Route("api/[controller]")]
    [Route("/umbraco/MegaForm/MegaFormApi/[controller]")]
    [IgnoreAntiforgeryToken]
    [Authorize(Policy = "MegaFormBackOffice")]
    public class AiKnowledgeController : ControllerBase
    {
        private readonly IAiKnowledgeService _svc;
        private readonly MegaFormDbContext _db;
        private readonly IPlatformContext _platform;

        public AiKnowledgeController(IAiKnowledgeService svc, MegaFormDbContext db, IPlatformContext platform)
        {
            _svc = svc;
            _db = db;
            _platform = platform;
        }

        private int SiteId => _platform?.PortalId > 0 ? _platform.PortalId : 0;
        private int CurrentUserId => _platform?.UserId > 0 ? _platform.UserId : -1;
        private bool IsAdmin => User != null && (
            User.IsInRole("Administrator") || User.IsInRole("Administrators") || User.IsInRole("Admin") ||
            User.IsInRole("admin") || User.IsInRole("Host") || User.IsInRole("host"));

        [HttpGet("Ping")]
        public IActionResult Ping() => Ok(new { pong = true, now = DateTime.UtcNow });

        [HttpGet("List")]
        public IActionResult List(string kind = null, string search = null, int top = 200)
        {
            if (!IsAdmin) return Forbid();
            try
            {
                var entries = _svc.ListEntries(kind, search, SiteId, top).ToList();
                return Ok(new { count = entries.Count, firstSlug = entries.FirstOrDefault()?.Slug });
            }
            catch (Exception ex)
            {
                return Ok(new { error = ex.Message, stack = ex.StackTrace });
            }
        }

        [HttpGet("Kinds")]
        public IActionResult Kinds()
        {
            if (!IsAdmin) return Forbid();
            return Ok(_svc.ListKinds(SiteId));
        }

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
            if (!IsAdmin) return Forbid();
            if (req == null) return BadRequest(new { error = "Body required" });

            var widgetType = (req.WidgetType ?? string.Empty).Trim();
            var surface = (req.Surface ?? string.Empty).Trim();
            var query = (req.Query ?? string.Empty).Trim();
            var limit = req.Limit > 0 ? req.Limit : 5;
            limit = Math.Max(1, Math.Min(limit, 25));

            try
            {
                var p = SiteId;
                IQueryable<AiKnowledgeEntry> q = _db.AiKnowledgeEntries.AsNoTracking();
                q = q.Where(e => e.PortalId == null || e.PortalId == p);

                if (!string.IsNullOrEmpty(widgetType))
                {
                    q = q.Where(e =>
                        e.WidgetType == null
                        || e.WidgetType == widgetType
                        || (e.Tags != null && EF.Functions.Like(e.Tags, "%widget:" + widgetType + "%")));
                }
                if (!string.IsNullOrEmpty(surface))
                {
                    q = q.Where(e =>
                        e.Surface == null
                        || e.Surface == surface
                        || (e.Tags != null && EF.Functions.Like(e.Tags, "%surface:" + surface + "%")));
                }
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

                q = q
                    .OrderBy(e => e.WidgetType == widgetType ? 0 : 1)
                    .ThenBy(e => e.Surface == surface ? 0 : 1)
                    .ThenBy(e => e.PortalId == p ? 0 : 1)
                    .ThenBy(e => e.Kind)
                    .ThenBy(e => e.Slug);

                var rows = q.Take(limit).ToList();
                var results = rows.Select(e => new
                {
                    id = e.Id,
                    slug = e.Slug,
                    kind = e.Kind,
                    title = e.Title,
                    summary = e.Summary,
                    tags = SplitTags(e.Tags),
                    widgetType = e.WidgetType,
                    surface = e.Surface,
                }).ToList<object>();

                return Ok(new { results, widgetType, surface, query, count = results.Count });
            }
            catch (Exception ex)
            {
                return Ok(new { results = Array.Empty<object>(), warning = "KB SearchScoped fell back to empty: " + ex.Message });
            }
        }

        [HttpGet("Get")]
        public IActionResult Get(string slug = null, int id = 0)
        {
            if (!IsAdmin) return Forbid();
            AiKnowledgeEntry e = null;
            if (id > 0) e = _svc.GetEntryById(id);
            else if (!string.IsNullOrWhiteSpace(slug)) e = _svc.GetEntryBySlug(slug, SiteId);
            if (e == null) return NotFound(new { error = "Not found" });
            return Ok(ToFullPayload(e));
        }

        [HttpPost("Upsert")]
        public IActionResult Upsert([FromBody] JObject body)
        {
            if (!IsAdmin) return Forbid();
            if (body == null) return BadRequest(new { error = "Body required" });
            var slug = (string)body["slug"] ?? string.Empty;
            if (string.IsNullOrWhiteSpace(slug)) return BadRequest(new { error = "slug is required" });
            var existing = _svc.GetEntryBySlug(slug, SiteId);
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
            };
            var resultId = _svc.UpsertEntry(entry, CurrentUserId);
            entry = _svc.GetEntryById(resultId);
            return Ok(ToFullPayload(entry));
        }

        [HttpPost("Delete")]
        public IActionResult Delete([FromQuery] int id)
        {
            if (!IsAdmin) return Forbid();
            if (id <= 0) return BadRequest(new { error = "id required" });
            _svc.DeleteEntry(id, CurrentUserId);
            return Ok(new { ok = true });
        }

        [HttpPost("SeedViewModes")]
        public IActionResult SeedViewModes()
        {
            if (!IsAdmin) return Forbid();
            try
            {
                var seeded = 0;
                var updated = 0;
                foreach (var entry in GetViewModeEntries())
                {
                    var existing = _svc.GetEntryBySlug(entry.Slug, SiteId);
                    if (existing == null)
                    {
                        entry.Source = "megaform-builtin";
                        entry.Version = 1;
                        entry.CreatedOnDate = DateTime.UtcNow;
                        _svc.UpsertEntry(entry, CurrentUserId);
                        seeded++;
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
                        if (changed)
                        {
                            existing.Source = existing.Source == "megaform-builtin" ? "megaform-builtin" : "customer-overridden";
                            _svc.UpsertEntry(existing, CurrentUserId);
                            updated++;
                        }
                    }
                }
                return Ok(new { ok = true, seeded, updated });
            }
            catch (Exception ex)
            {
                return Ok(new { ok = false, error = ex.Message, stack = ex.StackTrace });
            }
        }

        [HttpGet("History")]
        public IActionResult History(int id, int top = 50)
        {
            if (!IsAdmin) return Forbid();
            var list = _svc.ListEntryHistory(id, top).Select(h => new
            {
                historyId = h.HistoryId, knowledgeId = h.KnowledgeId, slug = h.Slug,
                title = h.Title, action = h.ChangeAction, version = h.Version,
                changedOnDate = h.ChangedOnDate, changedByUserId = h.ChangedByUserId,
            });
            return Ok(list);
        }

        private static List<AiKnowledgeEntry> GetViewModeEntries()
        {
            return new List<AiKnowledgeEntry>
            {
                new AiKnowledgeEntry
                {
                    Slug = "designer-list-view",
                    Kind = "designer",
                    Title = "List View Designer",
                    Summary = "Configure submission list view: pick visible fields, set row template tokens ({{field:Name}}), enable search/sort/pagination.",
                    Body = "{\"trigger\":\"Module settings → List view\",\"widgetType\":\"list\",\"tokens\":[\"{{field:KEY}}\",\"{{submission:id}}\",\"{{submission:date}}\",\"{{submission:status}}\"],\"tips\":[\"Use {{field:Name}} to show a form field\",\"Use {{submission:id}} for the submission number\",\"Add HTML around tokens for custom layout\"]}",
                    Tags = "designer,listview,view-mode,submission-display",
                    Examples = "",
                    WidgetType = "list",
                    Surface = "designer",
                },
                new AiKnowledgeEntry
                {
                    Slug = "designer-card-view",
                    Kind = "designer",
                    Title = "Card View Designer",
                    Summary = "Configure submission card view: set card width, image field, title field, body template, and responsive grid columns.",
                    Body = "{\"trigger\":\"Module settings → Card view\",\"widgetType\":\"card\",\"tokens\":[\"{{field:KEY}}\",\"{{submission:id}}\",\"{{submission:date}}\",\"{{submission:status}}\"],\"tips\":[\"Set imageField to a field key for card thumbnails\",\"Use gridColumns to control responsive layout\",\"Card width auto-adjusts to container\"]}",
                    Tags = "designer,cardview,view-mode,submission-display",
                    Examples = "",
                    WidgetType = "card",
                    Surface = "designer",
                },
                new AiKnowledgeEntry
                {
                    Slug = "designer-listview-runtime",
                    Kind = "designer",
                    Title = "ListView Runtime Designer",
                    Summary = "Configure the full-featured ListView: columns, inline actions (add/edit/delete), search, sort, pagination, and row click handlers.",
                    Body = "{\"trigger\":\"Module settings → ListView\",\"widgetType\":\"listview\",\"features\":[\"search\",\"sort\",\"pagination\",\"inline-edit\",\"inline-delete\",\"inline-add\"],\"tips\":[\"Enable showRowActions for edit/delete buttons\",\"Set pageSize to control rows per page\",\"Use columnTemplates for custom cell rendering\"]}",
                    Tags = "designer,listview,view-mode,submission-display",
                    Examples = "",
                    WidgetType = "listview",
                    Surface = "designer",
                },
                new AiKnowledgeEntry
                {
                    Slug = "view-template-list-row",
                    Kind = "row_template",
                    Title = "List View Row Template",
                    Summary = "Default row template for the List view. Displays field values in a table row using token substitution.",
                    Body = "<tr>\n  <td>{{submission:id}}</td>\n  <td>{{field:Name}}</td>\n  <td>{{field:Email}}</td>\n  <td>{{submission:date}}</td>\n  <td>{{submission:status}}</td>\n</tr>",
                    Tags = "template,list,row,submission-display",
                    Examples = "",
                    WidgetType = "list",
                    Surface = "designer",
                },
                new AiKnowledgeEntry
                {
                    Slug = "view-template-card-item",
                    Kind = "row_template",
                    Title = "Card View Item Template",
                    Summary = "Default card template for the Card view. Displays a responsive card with field values.",
                    Body = "<div class=\"mf-card-item\">\n  <h4>{{field:Name}}</h4>\n  <p>{{field:Email}}</p>\n  <small>{{submission:date}}</small>\n</div>",
                    Tags = "template,card,row,submission-display",
                    Examples = "",
                    WidgetType = "card",
                    Surface = "designer",
                },
                new AiKnowledgeEntry
                {
                    Slug = "view-sample-data-guide",
                    Kind = "system_arch",
                    Title = "Submission Sample Data Guide",
                    Summary = "How to generate sample submission data for testing List, Card, and ListView display modes.",
                    Body = "{\"steps\":[\"Open module Settings panel\",\"Click Generate Sample Data button\",\"8 realistic submissions are created automatically\",\"Refresh the page to see them in the view\"],\"note\":\"Sample data creates Vietnamese contact entries with name, email, phone, company, and message fields.\"}",
                    Tags = "sample-data,submission,testing,view-mode",
                    Examples = "",
                    WidgetType = null,
                    Surface = "designer",
                },
            };
        }

        private static object ToFullPayload(AiKnowledgeEntry e) => new
        {
            id = e.Id, slug = e.Slug, kind = e.Kind, title = e.Title, summary = e.Summary,
            body = e.Body, tags = SplitTags(e.Tags), examples = e.Examples,
            portalId = e.PortalId, source = e.Source, version = e.Version,
            createdOnDate = e.CreatedOnDate, updatedOnDate = e.UpdatedOnDate,
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
