using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiKnowledge;
using MegaForm.Web.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace MegaForm.Web.Services
{
    /// <summary>
    /// ASP.NET Core (MegaForm.Web) EF implementation of <see cref="IAiKnowledgeService"/>.
    /// Uses the scoped <see cref="MegaFormDbContext"/> directly because the Web host
    /// registers the context per-request, unlike Oqtane which needs a factory.
    /// </summary>
    public class WebAiKnowledgeService : IAiKnowledgeService
    {
        private readonly MegaFormDbContext _db;
        private readonly ILogger<WebAiKnowledgeService> _logger;

        public WebAiKnowledgeService(MegaFormDbContext db, ILogger<WebAiKnowledgeService> logger = null)
        {
            _db = db;
            _logger = logger;
        }

        // Lazy seed on first read. Web can seed at startup via a hosted service,
        // but this guard ensures the KB is never empty even if startup seeding is skipped.
        private static volatile bool _seedEnsured;
        private static readonly object _seedGate = new object();
        private void EnsureSeeded()
        {
            if (_seedEnsured) return;
            lock (_seedGate)
            {
                if (_seedEnsured) return;
                try
                {
                    if (!_db.AiKnowledgeEntries.AsNoTracking().Any())
                        SeedEntries(_db, _logger);
                    _seedEnsured = true;
                }
                catch (Exception ex)
                {
                    _logger?.LogWarning(ex, "[WebAiKnowledgeService] Lazy seed deferred");
                }
            }
        }

        public static void SeedEntries(MegaFormDbContext ctx, ILogger logger)
        {
            const string ResourceName = "MegaForm.Web.Seed.ai-knowledge-seed.json";
            var asm = typeof(WebAiKnowledgeService).GetTypeInfo().Assembly;
            using var stream = asm.GetManifestResourceStream(ResourceName);
            if (stream == null) { logger?.LogWarning("[KbSeeder] Resource {Resource} not found", ResourceName); return; }
            string json;
            using (var reader = new StreamReader(stream)) json = reader.ReadToEnd();
            if (string.IsNullOrWhiteSpace(json)) { logger?.LogWarning("[KbSeeder] Empty seed JSON"); return; }

            JObject root;
            try { root = JObject.Parse(json); }
            catch (Exception ex) { logger?.LogError(ex, "[KbSeeder] Parse seed JSON failed"); return; }

            var slugToId = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var entryCount = 0;
            foreach (var jt in (root["entries"] as JArray) ?? new JArray())
            {
                ctx.AiKnowledgeEntries.Add(new AiKnowledgeEntry
                {
                    Slug = (string)jt["Slug"],
                    Kind = (string)jt["Kind"],
                    Title = (string)jt["Title"] ?? string.Empty,
                    Summary = (string)jt["Summary"] ?? string.Empty,
                    Body = (string)jt["Body"] ?? string.Empty,
                    Tags = (string)jt["Tags"] ?? string.Empty,
                    Examples = (string)jt["Examples"] ?? string.Empty,
                    PortalId = jt["PortalId"]?.Type == JTokenType.Null ? (int?)null : (int?)jt["PortalId"],
                    Source = (string)jt["Source"] ?? "megaform-builtin",
                    WidgetType = (string)jt["WidgetType"] ?? string.Empty,
                    Surface = (string)jt["Surface"] ?? string.Empty,
                    Version = (int?)jt["Version"] ?? 1,
                    CreatedOnDate = DateTime.UtcNow,
                });
                entryCount++;
            }
            ctx.SaveChanges();

            foreach (var e in ctx.AiKnowledgeEntries.AsNoTracking().Where(x => x.Source == "megaform-builtin"))
                slugToId[e.Slug] = e.Id;

            var templateCount = 0;
            foreach (var jt in (root["templates"] as JArray) ?? new JArray())
            {
                var slug = (string)jt["KnowledgeSlug"];
                if (string.IsNullOrEmpty(slug) || !slugToId.TryGetValue(slug, out var kid)) continue;
                ctx.KbTemplates.Add(new KbTemplate
                {
                    KnowledgeId = kid,
                    TemplateKey = (string)jt["TemplateKey"],
                    Kind = (string)jt["Kind"],
                    Title = (string)jt["Title"] ?? string.Empty,
                    Summary = (string)jt["Summary"] ?? string.Empty,
                    Body = (string)jt["Body"] ?? string.Empty,
                    Tags = (string)jt["Tags"] ?? string.Empty,
                    Score = (int?)jt["Score"] ?? 0,
                    SortOrder = (int?)jt["SortOrder"] ?? 100,
                    PortalId = jt["PortalId"]?.Type == JTokenType.Null ? (int?)null : (int?)jt["PortalId"],
                    Source = (string)jt["Source"] ?? "megaform-builtin",
                    Version = (int?)jt["Version"] ?? 1,
                    CreatedOnDate = DateTime.UtcNow,
                });
                templateCount++;
            }

            var ruleCount = 0;
            foreach (var jt in (root["rules"] as JArray) ?? new JArray())
            {
                var slug = (string)jt["KnowledgeSlug"];
                int? kid = !string.IsNullOrEmpty(slug) && slugToId.TryGetValue(slug, out var k) ? (int?)k : null;
                ctx.KbRules.Add(new KbRule
                {
                    RuleId = (string)jt["RuleId"],
                    KnowledgeId = kid,
                    WidgetType = (string)jt["WidgetType"] ?? string.Empty,
                    Title = (string)jt["Title"] ?? string.Empty,
                    Severity = (string)jt["Severity"] ?? string.Empty,
                    Condition = (string)jt["Condition"] ?? string.Empty,
                    RegexPattern = (string)jt["RegexPattern"] ?? string.Empty,
                    RejectionMessage = (string)jt["RejectionMessage"] ?? string.Empty,
                    FixHint = (string)jt["FixHint"] ?? string.Empty,
                    Source = (string)jt["Source"] ?? "megaform-builtin",
                    Version = (int?)jt["Version"] ?? 1,
                    Enabled = jt["Enabled"]?.Type == JTokenType.Boolean ? (bool)jt["Enabled"] : true,
                    PortalId = jt["PortalId"]?.Type == JTokenType.Null ? (int?)null : (int?)jt["PortalId"],
                    CreatedOnDate = DateTime.UtcNow,
                });
                ruleCount++;
            }
            ctx.SaveChanges();
            logger?.LogInformation("[KbSeeder] Imported {EntryCount} entries, {TemplateCount} templates, {RuleCount} rules", entryCount, templateCount, ruleCount);
        }

        public IEnumerable<AiKnowledgeEntry> ListEntries(string kind, string search, int? portalId, int top)
        {
            EnsureSeeded();
            top = Math.Max(1, Math.Min(top, 500));
            IQueryable<AiKnowledgeEntry> q = _db.AiKnowledgeEntries.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(kind)) q = q.Where(e => e.Kind == kind);
            if (portalId.HasValue) q = q.Where(e => e.PortalId == null || e.PortalId == portalId.Value);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search;
                q = q.Where(e =>
                    (e.Title != null && EF.Functions.Like(e.Title, "%" + s + "%")) ||
                    (e.Summary != null && EF.Functions.Like(e.Summary, "%" + s + "%")) ||
                    (e.Tags != null && EF.Functions.Like(e.Tags, "%" + s + "%")) ||
                    (e.Slug != null && EF.Functions.Like(e.Slug, "%" + s + "%")));
            }
            if (portalId.HasValue)
            {
                var p = portalId.Value;
                q = q.OrderBy(e => e.PortalId == p ? 0 : 1).ThenBy(e => e.Kind).ThenBy(e => e.Slug);
            }
            else
            {
                q = q.OrderBy(e => e.Kind).ThenBy(e => e.Slug);
            }
            return q.Take(top).ToList();
        }

        public AiKnowledgeEntry GetEntryBySlug(string slug, int? portalId)
        {
            if (string.IsNullOrWhiteSpace(slug)) return null;
            EnsureSeeded();
            var q = _db.AiKnowledgeEntries.AsNoTracking()
                .Where(e => e.Slug == slug && (e.PortalId == null || (portalId.HasValue && e.PortalId == portalId.Value)));
            if (portalId.HasValue)
            {
                var p = portalId.Value;
                q = q.OrderBy(e => e.PortalId == p ? 0 : 1);
            }
            return q.FirstOrDefault();
        }

        public AiKnowledgeEntry GetEntryById(int id)
        {
            return _db.AiKnowledgeEntries.AsNoTracking().FirstOrDefault(e => e.Id == id);
        }

        public IEnumerable<string> ListKinds(int? portalId)
        {
            EnsureSeeded();
            return _db.AiKnowledgeEntries.AsNoTracking().Select(e => e.Kind).Distinct().OrderBy(k => k).ToList();
        }

        public int UpsertEntry(AiKnowledgeEntry entry, int? userId)
        {
            string action;
            if (entry.Id == 0)
            {
                action = "create";
                entry.Source ??= "customer";
                entry.Version = 1;
                entry.CreatedByUserId = userId;
                entry.CreatedOnDate = DateTime.UtcNow;
                _db.AiKnowledgeEntries.Add(entry);
                _db.SaveChanges();
            }
            else
            {
                action = "update";
                var existing = _db.AiKnowledgeEntries.FirstOrDefault(e => e.Id == entry.Id);
                if (existing == null) return 0;
                existing.Slug = entry.Slug;
                existing.Kind = entry.Kind;
                existing.Title = entry.Title;
                existing.Summary = entry.Summary;
                existing.Body = entry.Body;
                existing.Tags = entry.Tags;
                existing.Examples = entry.Examples;
                existing.PortalId = entry.PortalId;
                existing.Source = entry.Source ?? existing.Source;
                existing.Version = existing.Version + 1;
                existing.WidgetType = entry.WidgetType;
                existing.Surface = entry.Surface;
                existing.UpdatedByUserId = userId;
                existing.UpdatedOnDate = DateTime.UtcNow;
                entry.Version = existing.Version;
                _db.SaveChanges();
            }
            _db.AiKnowledgeHistories.Add(new AiKnowledgeHistory
            {
                KnowledgeId = entry.Id,
                Slug = entry.Slug,
                Kind = entry.Kind,
                Title = entry.Title,
                Summary = entry.Summary,
                Body = entry.Body,
                Tags = entry.Tags,
                Examples = entry.Examples,
                Source = entry.Source ?? "customer",
                Version = entry.Version,
                ChangedByUserId = userId,
                ChangedOnDate = DateTime.UtcNow,
                ChangeAction = action,
            });
            _db.SaveChanges();
            return entry.Id;
        }

        public void DeleteEntry(int id, int? userId)
        {
            var e = _db.AiKnowledgeEntries.FirstOrDefault(x => x.Id == id);
            if (e == null) return;
            _db.AiKnowledgeHistories.Add(new AiKnowledgeHistory
            {
                KnowledgeId = id, Slug = e.Slug, Kind = e.Kind, Title = e.Title, Summary = e.Summary,
                Body = e.Body, Tags = e.Tags, Examples = e.Examples, Source = e.Source ?? "customer",
                Version = e.Version, ChangedByUserId = userId, ChangedOnDate = DateTime.UtcNow, ChangeAction = "delete",
            });
            _db.AiKnowledgeEntries.Remove(e);
            _db.SaveChanges();
        }

        public IEnumerable<AiKnowledgeHistory> ListEntryHistory(int knowledgeId, int top)
        {
            return _db.AiKnowledgeHistories.AsNoTracking()
                .Where(h => h.KnowledgeId == knowledgeId)
                .OrderByDescending(h => h.ChangedOnDate).ThenByDescending(h => h.HistoryId)
                .Take(Math.Max(1, Math.Min(top, 200))).ToList();
        }

        public IEnumerable<KbTemplate> ListTemplates(int knowledgeId, string kind, int? portalId)
        {
            var q = _db.KbTemplates.AsNoTracking().Where(t => t.KnowledgeId == knowledgeId);
            if (!string.IsNullOrWhiteSpace(kind)) q = q.Where(t => t.Kind == kind);
            if (portalId.HasValue) q = q.Where(t => t.PortalId == null || t.PortalId == portalId.Value);
            if (portalId.HasValue)
            {
                var p = portalId.Value;
                q = q.OrderBy(t => t.PortalId == p ? 0 : 1).ThenBy(t => t.SortOrder).ThenByDescending(t => t.Score).ThenBy(t => t.TemplateKey);
            }
            else
            {
                q = q.OrderBy(t => t.SortOrder).ThenByDescending(t => t.Score).ThenBy(t => t.TemplateKey);
            }
            return q.ToList();
        }

        public KbTemplate GetTemplateById(int id)
        {
            return _db.KbTemplates.AsNoTracking().FirstOrDefault(t => t.Id == id);
        }

        public KbTemplate GetTemplateByKey(int knowledgeId, string templateKey, int? portalId)
        {
            var q = _db.KbTemplates.AsNoTracking()
                .Where(t => t.KnowledgeId == knowledgeId && t.TemplateKey == templateKey
                            && (t.PortalId == null || (portalId.HasValue && t.PortalId == portalId.Value)));
            if (portalId.HasValue)
            {
                var p = portalId.Value;
                q = q.OrderBy(t => t.PortalId == p ? 0 : 1);
            }
            return q.FirstOrDefault();
        }

        public int UpsertTemplate(KbTemplate template, int? userId)
        {
            if (template.Id == 0)
            {
                template.Source ??= "customer";
                template.Version = 1;
                template.SortOrder = template.SortOrder == 0 ? 100 : template.SortOrder;
                template.CreatedByUserId = userId;
                template.CreatedOnDate = DateTime.UtcNow;
                _db.KbTemplates.Add(template);
                _db.SaveChanges();
                return template.Id;
            }
            var existing = _db.KbTemplates.FirstOrDefault(t => t.Id == template.Id);
            if (existing == null) return 0;
            existing.KnowledgeId = template.KnowledgeId;
            existing.TemplateKey = template.TemplateKey;
            existing.Kind = template.Kind;
            existing.Title = template.Title;
            existing.Summary = template.Summary;
            existing.Body = template.Body;
            existing.Tags = template.Tags;
            existing.Score = template.Score;
            existing.SortOrder = template.SortOrder == 0 ? existing.SortOrder : template.SortOrder;
            existing.PortalId = template.PortalId;
            existing.Source = template.Source ?? existing.Source;
            existing.Version = existing.Version + 1;
            existing.UpdatedByUserId = userId;
            existing.UpdatedOnDate = DateTime.UtcNow;
            _db.SaveChanges();
            return existing.Id;
        }

        public void DeleteTemplate(int id, int? userId)
        {
            var t = _db.KbTemplates.FirstOrDefault(x => x.Id == id);
            if (t == null) return;
            _db.KbTemplates.Remove(t);
            _db.SaveChanges();
        }

        public IEnumerable<KbRule> ListRules(string widgetType, int? knowledgeId, bool? enabled)
        {
            IQueryable<KbRule> q = _db.KbRules.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(widgetType)) q = q.Where(r => r.WidgetType == widgetType);
            if (knowledgeId.HasValue) q = q.Where(r => r.KnowledgeId == knowledgeId.Value);
            if (enabled.HasValue) q = q.Where(r => r.Enabled == enabled.Value);
            return q.OrderBy(r => r.WidgetType).ThenBy(r => r.RuleId).ToList();
        }

        public KbRule GetRule(string ruleId)
        {
            return _db.KbRules.AsNoTracking().FirstOrDefault(r => r.RuleId == ruleId);
        }

        public void UpsertRule(KbRule rule, int? userId)
        {
            var existing = _db.KbRules.FirstOrDefault(r => r.RuleId == rule.RuleId);
            if (existing == null)
            {
                rule.Source ??= "customer";
                rule.Version = 1;
                rule.CreatedByUserId = userId;
                rule.CreatedOnDate = DateTime.UtcNow;
                _db.KbRules.Add(rule);
            }
            else
            {
                existing.KnowledgeId = rule.KnowledgeId;
                existing.WidgetType = rule.WidgetType;
                existing.Title = rule.Title;
                existing.Severity = rule.Severity;
                existing.Condition = rule.Condition;
                existing.RegexPattern = rule.RegexPattern;
                existing.RejectionMessage = rule.RejectionMessage;
                existing.FixHint = rule.FixHint;
                existing.Source = rule.Source ?? existing.Source;
                existing.Enabled = rule.Enabled;
                existing.PortalId = rule.PortalId;
                existing.Version = existing.Version + 1;
                existing.UpdatedByUserId = userId;
                existing.UpdatedOnDate = DateTime.UtcNow;
            }
            _db.SaveChanges();
        }

        public void DeleteRule(string ruleId, int? userId)
        {
            var r = _db.KbRules.FirstOrDefault(x => x.RuleId == ruleId);
            if (r == null) return;
            _db.KbRules.Remove(r);
            _db.SaveChanges();
        }

        public long LogFeedback(KbFeedback feedback)
        {
            feedback.Outcome ??= "rejected";
            feedback.AttemptedJson ??= "";
            feedback.CreatedOnDate = DateTime.UtcNow;
            _db.KbFeedbacks.Add(feedback);
            _db.SaveChanges();
            return feedback.Id;
        }

        public IEnumerable<KbFeedback> ListFeedback(string widgetType, string outcome, bool? promoted, int top)
        {
            IQueryable<KbFeedback> q = _db.KbFeedbacks.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(widgetType)) q = q.Where(f => f.WidgetType == widgetType);
            if (!string.IsNullOrWhiteSpace(outcome)) q = q.Where(f => f.Outcome == outcome);
            if (promoted.HasValue) q = q.Where(f => f.Promoted == promoted.Value);
            return q.OrderByDescending(f => f.CreatedOnDate).ThenByDescending(f => f.Id)
                .Take(Math.Max(1, Math.Min(top, 500))).ToList();
        }

        public KbFeedback GetFeedbackById(long id)
        {
            return _db.KbFeedbacks.AsNoTracking().FirstOrDefault(f => f.Id == id);
        }

        public int PromoteFeedback(long feedbackId, KbTemplate newTemplate, int reviewedByUserId, string notes)
        {
            var tplId = UpsertTemplate(newTemplate, reviewedByUserId);
            var fb = _db.KbFeedbacks.FirstOrDefault(f => f.Id == feedbackId);
            if (fb != null)
            {
                fb.Promoted = true;
                fb.PromotedTemplateId = tplId;
                fb.ReviewedByUserId = reviewedByUserId;
                fb.ReviewedOnDate = DateTime.UtcNow;
                fb.ReviewNotes = notes;
                _db.SaveChanges();
            }
            return tplId;
        }

        public void MarkFeedbackReviewed(long feedbackId, int reviewedByUserId, string notes)
        {
            var fb = _db.KbFeedbacks.FirstOrDefault(f => f.Id == feedbackId);
            if (fb == null) return;
            fb.ReviewedByUserId = reviewedByUserId;
            fb.ReviewedOnDate = DateTime.UtcNow;
            fb.ReviewNotes = notes;
            _db.SaveChanges();
        }

        public WidgetKnowledgeBundle GetWidgetBundle(string slug, int? portalId, int recentLessonsLimit = 5)
        {
            var entry = GetEntryBySlug(slug, portalId);
            if (entry == null) return null;
            var templates = ListTemplates(entry.Id, null, portalId).ToList();
            var rulesByKnowledge = ListRules(null, entry.Id, true).ToList();
            var widgetType = TryResolveWidgetType(entry);
            var rulesByType = string.IsNullOrEmpty(widgetType)
                ? new List<KbRule>()
                : ListRules(widgetType, null, true).Where(r => !r.KnowledgeId.HasValue).ToList();
            var allRules = rulesByKnowledge.Concat(rulesByType).GroupBy(r => r.RuleId).Select(g => g.First()).ToList();
            var recentLessons = ListFeedback(widgetType, "fixed", true, recentLessonsLimit).ToList();
            return new WidgetKnowledgeBundle
            {
                Entry = entry,
                Templates = templates,
                Rules = allRules,
                RecentLessons = recentLessons,
            };
        }

        private static string TryResolveWidgetType(AiKnowledgeEntry entry)
        {
            if (entry == null) return null;
            if (!string.IsNullOrEmpty(entry.Body))
            {
                try
                {
                    var obj = JObject.Parse(entry.Body);
                    var t = (string)obj["widgetType"] ?? (string)obj["type_id"] ?? (string)obj["typeId"];
                    if (!string.IsNullOrEmpty(t)) return t;
                }
                catch { /* body may not be JSON */ }
            }
            if (!string.IsNullOrEmpty(entry.Slug) && entry.Slug.StartsWith("widget-", StringComparison.OrdinalIgnoreCase))
            {
                var s = entry.Slug.Substring("widget-".Length);
                var parts = s.Split('-');
                var sb = new StringBuilder();
                foreach (var p in parts)
                {
                    if (p.Length == 0) continue;
                    sb.Append(char.ToUpperInvariant(p[0]));
                    if (p.Length > 1) sb.Append(p.Substring(1));
                }
                return sb.ToString();
            }
            return null;
        }
    }
}
