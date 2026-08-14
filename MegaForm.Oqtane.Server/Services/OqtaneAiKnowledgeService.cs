using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiKnowledge;
using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore;
using Oqtane.Enums;          // LogFunction
using Oqtane.Infrastructure; // ILogManager
using Oqtane.Modules;
using Oqtane.Shared;         // LogLevel — ILogManager.Log takes OQTANE's LogLevel, not
                             // Microsoft.Extensions.Logging's. Importing both makes every
                             // call site ambiguous, so this file deliberately imports only this one.

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// Oqtane-side EF implementation of <see cref="IAiKnowledgeService"/>.
    /// Mirrors <c>DnnAiKnowledgeService</c> method-for-method so the AI Form
    /// Assistant gets the same surface on either platform.
    ///
    /// All reads use a fresh DbContext from the factory so this is safe to
    /// register as transient. Writes wrap entry mutations + history insert
    /// in a single SaveChanges call so they land together.
    /// </summary>
    public class OqtaneAiKnowledgeService : IAiKnowledgeService, ITransientService
    {
        private readonly IDbContextFactory<MegaFormDbContext> _dbContextFactory;
        /// <summary>[KbSeedVisibility v20260812] Site event log. Optional so the service still
        /// activates on a host that has not registered ILogManager — seeding then still works,
        /// it just cannot report itself.</summary>
        private readonly ILogManager _logger;

        public OqtaneAiKnowledgeService(IDbContextFactory<MegaFormDbContext> dbContextFactory, ILogManager logger = null)
        {
            _dbContextFactory = dbContextFactory;
            _logger = logger;
        }

        // [KbLazySeed 2026-06-12] On Oqtane the startup KbSeeder cannot seed: MegaFormDbContext
        // (DBContextBase) resolves its provider/connection PER-REQUEST from the active tenant,
        // so a context created at host startup has no provider and every query throws. We seed
        // LAZILY on the first KB read instead — in THIS request scope, where the tenant
        // connection IS resolved. Guarded so it imports at most once per process; if it throws
        // (scope/tenant not ready) the flag stays false and a later request retries.
        private static volatile bool _seedEnsured;
        private static readonly object _seedGate = new object();

        /// <summary>
        /// [KbSeedVisibility v20260812] Outcome of the last seed attempt in this process, so an
        /// admin can be told why the KB looks empty instead of having to guess. Mirrors
        /// DnnKbSeeder.LastRun.
        /// </summary>
        public sealed class SeedOutcome
        {
            public bool Ran { get; set; }
            public bool Succeeded { get; set; }
            public int Imported { get; set; }
            public int MissingBefore { get; set; }
            public int SeedTotal { get; set; }
            public string Message { get; set; }
        }

        private static volatile SeedOutcome _lastRun =
            new SeedOutcome { Message = "The knowledge seeder has not run yet in this application." };

        public static SeedOutcome LastRun => _lastRun;

        private void EnsureSeeded()
        {
            if (_seedEnsured) return;
            lock (_seedGate)
            {
                if (_seedEnsured) return;
                try
                {
                    using var ctx = _dbContextFactory.CreateDbContext();
                    var json = OqtaneKbSeederHostedService.ReadSeedJson();
                    if (string.IsNullOrWhiteSpace(json))
                    {
                        // Not transient: the resource is either embedded in this assembly or it
                        // never will be. Stop retrying and say so.
                        _seedEnsured = true;
                        Record(false, 0, 0, 0, "The bundled knowledge seed is not embedded in this build.");
                        _logger?.Log(LogLevel.Error, this, LogFunction.Other,
                            "[MegaForm KbSeed] bundled seed resource missing from the assembly — the AI has no built-in knowledge.");
                        return;
                    }

                    var seedSlugs = ReadSeedSlugs(json);
                    if (!ctx.AiKnowledgeEntries.AsNoTracking().Any())
                    {
                        OqtaneKbSeederHostedService.SeedEntries(ctx, null);
                        var after = ctx.AiKnowledgeEntries.AsNoTracking().Count();
                        _seedEnsured = true;
                        Record(after > 0, after, seedSlugs.Count, seedSlugs.Count,
                            after > 0 ? "Imported " + after + " knowledge entries from the bundled seed."
                                      : "The bundled seed produced no rows.");
                    }
                    else
                    {
                        // [KbSeedGate v20260812] The table being non-empty used to end the story,
                        // which became a real hole once knowledge started arriving PER TEMPLATE
                        // from the gallery: install one template first and its one row would block
                        // the entire bundled seed, permanently and silently. Catch up by SLUG
                        // instead, through the upsert merger (safe to run repeatedly).
                        var existing = new HashSet<string>(
                            ctx.AiKnowledgeEntries.AsNoTracking().Select(e => e.Slug),
                            StringComparer.OrdinalIgnoreCase);
                        var missing = seedSlugs.Count(s => !existing.Contains(s));
                        if (missing == 0)
                        {
                            _seedEnsured = true;
                            Record(true, 0, 0, seedSlugs.Count,
                                "Up to date — all " + seedSlugs.Count + " bundled knowledge entries are already installed.");
                        }
                        else
                        {
                            var result = MegaForm.Core.Services.AiKnowledge.AiKnowledgeSeedMerger.Merge(json, this, null);
                            _seedEnsured = result.Entries > 0;
                            Record(result.Entries > 0, result.Entries, missing, seedSlugs.Count,
                                result.Entries > 0
                                    ? result.Summary + " (" + missing + " of " + seedSlugs.Count + " entries were missing)"
                                    : "Could not write any of the " + missing + " missing knowledge entries.");
                            _logger?.Log(result.Entries > 0 ? LogLevel.Information : LogLevel.Error, this, LogFunction.Other,
                                "[MegaForm KbSeed] {Message}", _lastRun.Message);
                        }
                    }
                }
                catch (Exception ex)
                {
                    // Tenant/provider not ready in this scope — a later request retries, and the
                    // flag deliberately stays false. This used to append the stack trace to
                    // %TEMP%\mf_kbseed_err.txt, where no administrator has ever looked; it now
                    // goes to the site's own event log.
                    Record(false, 0, 0, 0, "The knowledge seeder could not run yet; it will retry on a later request.");
                    try
                    {
                        _logger?.Log(LogLevel.Warning, this, LogFunction.Other, ex,
                            "[MegaForm KbSeed] deferred — {Reason}", ex.GetType().Name);
                    }
                    catch { /* logging must never break a KB read */ }
                }
            }
        }

        private static void Record(bool ok, int imported, int missing, int total, string message)
        {
            _lastRun = new SeedOutcome
            {
                Ran = true,
                Succeeded = ok,
                Imported = imported,
                MissingBefore = missing,
                SeedTotal = total,
                Message = message,
            };
        }

        private static List<string> ReadSeedSlugs(string json)
        {
            var slugs = new List<string>();
            try
            {
                var arr = Newtonsoft.Json.Linq.JObject.Parse(json)["entries"] as Newtonsoft.Json.Linq.JArray;
                if (arr == null) return slugs;
                foreach (var jt in arr)
                {
                    var slug = ((string)jt["Slug"] ?? string.Empty).Trim();
                    if (slug.Length > 0) slugs.Add(slug);
                }
            }
            catch { slugs.Clear(); }
            return slugs;
        }

        // ── Entry CRUD ──────────────────────────────────────────────────
        public IEnumerable<AiKnowledgeEntry> ListEntries(string kind, string search, int? portalId, int top)
        {
            EnsureSeeded();
            using var ctx = _dbContextFactory.CreateDbContext();
            top = Math.Max(1, Math.Min(top, 500));
            IQueryable<AiKnowledgeEntry> q = ctx.AiKnowledgeEntries.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(kind)) q = q.Where(e => e.Kind == kind);
            if (portalId.HasValue) q = q.Where(e => e.PortalId == null || e.PortalId == portalId.Value);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search;
                q = q.Where(e =>
                    (e.Title   != null && EF.Functions.Like(e.Title,   "%" + s + "%")) ||
                    (e.Summary != null && EF.Functions.Like(e.Summary, "%" + s + "%")) ||
                    (e.Tags    != null && EF.Functions.Like(e.Tags,    "%" + s + "%")) ||
                    (e.Slug    != null && EF.Functions.Like(e.Slug,    "%" + s + "%")));
            }
            // Portal-override priority: rows whose PortalId matches caller first.
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
            using var ctx = _dbContextFactory.CreateDbContext();
            var q = ctx.AiKnowledgeEntries.AsNoTracking()
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
            using var ctx = _dbContextFactory.CreateDbContext();
            return ctx.AiKnowledgeEntries.AsNoTracking().FirstOrDefault(e => e.Id == id);
        }

        public IEnumerable<string> ListKinds(int? portalId)
        {
            EnsureSeeded();
            using var ctx = _dbContextFactory.CreateDbContext();
            return ctx.AiKnowledgeEntries.AsNoTracking().Select(e => e.Kind).Distinct().OrderBy(k => k).ToList();
        }

        public int UpsertEntry(AiKnowledgeEntry entry, int? userId)
        {
            using var ctx = _dbContextFactory.CreateDbContext();
            string action;
            if (entry.Id == 0)
            {
                action = "create";
                entry.Source ??= "customer";
                entry.Version = 1;
                entry.CreatedByUserId = userId;
                entry.CreatedOnDate = DateTime.UtcNow;
                ctx.AiKnowledgeEntries.Add(entry);
                ctx.SaveChanges();
            }
            else
            {
                action = "update";
                var existing = ctx.AiKnowledgeEntries.FirstOrDefault(e => e.Id == entry.Id);
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
                existing.UpdatedByUserId = userId;
                existing.UpdatedOnDate = DateTime.UtcNow;
                entry.Version = existing.Version;
                ctx.SaveChanges();
            }
            // History
            ctx.AiKnowledgeHistories.Add(new AiKnowledgeHistory
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
            ctx.SaveChanges();
            return entry.Id;
        }

        public void DeleteEntry(int id, int? userId)
        {
            using var ctx = _dbContextFactory.CreateDbContext();
            var e = ctx.AiKnowledgeEntries.FirstOrDefault(x => x.Id == id);
            if (e == null) return;
            ctx.AiKnowledgeHistories.Add(new AiKnowledgeHistory
            {
                KnowledgeId = id, Slug = e.Slug, Kind = e.Kind, Title = e.Title, Summary = e.Summary,
                Body = e.Body, Tags = e.Tags, Examples = e.Examples, Source = e.Source ?? "customer",
                Version = e.Version, ChangedByUserId = userId, ChangedOnDate = DateTime.UtcNow, ChangeAction = "delete",
            });
            ctx.AiKnowledgeEntries.Remove(e);
            ctx.SaveChanges();
        }

        public IEnumerable<AiKnowledgeHistory> ListEntryHistory(int knowledgeId, int top)
        {
            using var ctx = _dbContextFactory.CreateDbContext();
            return ctx.AiKnowledgeHistories.AsNoTracking()
                .Where(h => h.KnowledgeId == knowledgeId)
                .OrderByDescending(h => h.ChangedOnDate).ThenByDescending(h => h.HistoryId)
                .Take(Math.Max(1, Math.Min(top, 200))).ToList();
        }

        // ── Templates ───────────────────────────────────────────────────
        public IEnumerable<KbTemplate> ListTemplates(int knowledgeId, string kind, int? portalId)
        {
            using var ctx = _dbContextFactory.CreateDbContext();
            var q = ctx.KbTemplates.AsNoTracking().Where(t => t.KnowledgeId == knowledgeId);
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
            using var ctx = _dbContextFactory.CreateDbContext();
            return ctx.KbTemplates.AsNoTracking().FirstOrDefault(t => t.Id == id);
        }

        public KbTemplate GetTemplateByKey(int knowledgeId, string templateKey, int? portalId)
        {
            using var ctx = _dbContextFactory.CreateDbContext();
            var q = ctx.KbTemplates.AsNoTracking()
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
            using var ctx = _dbContextFactory.CreateDbContext();
            if (template.Id == 0)
            {
                template.Source ??= "customer";
                template.Version = 1;
                template.SortOrder = template.SortOrder == 0 ? 100 : template.SortOrder;
                template.CreatedByUserId = userId;
                template.CreatedOnDate = DateTime.UtcNow;
                ctx.KbTemplates.Add(template);
                ctx.SaveChanges();
                return template.Id;
            }
            var existing = ctx.KbTemplates.FirstOrDefault(t => t.Id == template.Id);
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
            ctx.SaveChanges();
            return existing.Id;
        }

        public void DeleteTemplate(int id, int? userId)
        {
            using var ctx = _dbContextFactory.CreateDbContext();
            var t = ctx.KbTemplates.FirstOrDefault(x => x.Id == id);
            if (t == null) return;
            ctx.KbTemplates.Remove(t);
            ctx.SaveChanges();
        }

        // ── Rules ───────────────────────────────────────────────────────
        public IEnumerable<KbRule> ListRules(string widgetType, int? knowledgeId, bool? enabled)
        {
            using var ctx = _dbContextFactory.CreateDbContext();
            IQueryable<KbRule> q = ctx.KbRules.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(widgetType)) q = q.Where(r => r.WidgetType == widgetType);
            if (knowledgeId.HasValue) q = q.Where(r => r.KnowledgeId == knowledgeId.Value);
            if (enabled.HasValue) q = q.Where(r => r.Enabled == enabled.Value);
            return q.OrderBy(r => r.WidgetType).ThenBy(r => r.RuleId).ToList();
        }

        public KbRule GetRule(string ruleId)
        {
            using var ctx = _dbContextFactory.CreateDbContext();
            return ctx.KbRules.AsNoTracking().FirstOrDefault(r => r.RuleId == ruleId);
        }

        public void UpsertRule(KbRule rule, int? userId)
        {
            using var ctx = _dbContextFactory.CreateDbContext();
            var existing = ctx.KbRules.FirstOrDefault(r => r.RuleId == rule.RuleId);
            if (existing == null)
            {
                rule.Source ??= "customer";
                rule.Version = 1;
                rule.CreatedByUserId = userId;
                rule.CreatedOnDate = DateTime.UtcNow;
                ctx.KbRules.Add(rule);
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
            ctx.SaveChanges();
        }

        public void DeleteRule(string ruleId, int? userId)
        {
            using var ctx = _dbContextFactory.CreateDbContext();
            var r = ctx.KbRules.FirstOrDefault(x => x.RuleId == ruleId);
            if (r == null) return;
            ctx.KbRules.Remove(r);
            ctx.SaveChanges();
        }

        // ── Feedback / learning loop ────────────────────────────────────
        public long LogFeedback(KbFeedback feedback)
        {
            using var ctx = _dbContextFactory.CreateDbContext();
            feedback.Outcome ??= "rejected";
            feedback.AttemptedJson ??= "";
            feedback.CreatedOnDate = DateTime.UtcNow;
            ctx.KbFeedbacks.Add(feedback);
            ctx.SaveChanges();
            return feedback.Id;
        }

        public IEnumerable<KbFeedback> ListFeedback(string widgetType, string outcome, bool? promoted, int top)
        {
            using var ctx = _dbContextFactory.CreateDbContext();
            IQueryable<KbFeedback> q = ctx.KbFeedbacks.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(widgetType)) q = q.Where(f => f.WidgetType == widgetType);
            if (!string.IsNullOrWhiteSpace(outcome))    q = q.Where(f => f.Outcome == outcome);
            if (promoted.HasValue)                       q = q.Where(f => f.Promoted == promoted.Value);
            return q.OrderByDescending(f => f.CreatedOnDate).ThenByDescending(f => f.Id)
                .Take(Math.Max(1, Math.Min(top, 500))).ToList();
        }

        public KbFeedback GetFeedbackById(long id)
        {
            using var ctx = _dbContextFactory.CreateDbContext();
            return ctx.KbFeedbacks.AsNoTracking().FirstOrDefault(f => f.Id == id);
        }

        public int PromoteFeedback(long feedbackId, KbTemplate newTemplate, int reviewedByUserId, string notes)
        {
            var tplId = UpsertTemplate(newTemplate, reviewedByUserId);
            using var ctx = _dbContextFactory.CreateDbContext();
            var fb = ctx.KbFeedbacks.FirstOrDefault(f => f.Id == feedbackId);
            if (fb != null)
            {
                fb.Promoted = true;
                fb.PromotedTemplateId = tplId;
                fb.ReviewedByUserId = reviewedByUserId;
                fb.ReviewedOnDate = DateTime.UtcNow;
                fb.ReviewNotes = notes;
                ctx.SaveChanges();
            }
            return tplId;
        }

        public void MarkFeedbackReviewed(long feedbackId, int reviewedByUserId, string notes)
        {
            using var ctx = _dbContextFactory.CreateDbContext();
            var fb = ctx.KbFeedbacks.FirstOrDefault(f => f.Id == feedbackId);
            if (fb == null) return;
            fb.ReviewedByUserId = reviewedByUserId;
            fb.ReviewedOnDate = DateTime.UtcNow;
            fb.ReviewNotes = notes;
            ctx.SaveChanges();
        }

        // ── Bundle ──────────────────────────────────────────────────────
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
            var allRules = rulesByKnowledge.Concat(rulesByType)
                .GroupBy(r => r.RuleId).Select(g => g.First()).ToList();
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
                    var obj = Newtonsoft.Json.Linq.JObject.Parse(entry.Body);
                    var t = (string)obj["widgetType"] ?? (string)obj["type_id"] ?? (string)obj["typeId"];
                    if (!string.IsNullOrEmpty(t)) return t;
                }
                catch { /* body may not be JSON */ }
            }
            if (!string.IsNullOrEmpty(entry.Slug) && entry.Slug.StartsWith("widget-", StringComparison.OrdinalIgnoreCase))
            {
                var s = entry.Slug.Substring("widget-".Length);
                var parts = s.Split('-');
                var sb = new System.Text.StringBuilder();
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
