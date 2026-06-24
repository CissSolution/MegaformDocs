using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiKnowledge;
using MegaForm.DNN.Data;

namespace MegaForm.DNN.Services
{
    /// <summary>
    /// DNN-side implementation of the canonical IAiKnowledgeService. Thin
    /// wrapper that dispatches to four static repositories — Knowledge,
    /// Templates, Rules, Feedback. Single entry point for controllers so
    /// the controllers themselves stay small and testable.
    /// </summary>
    public class DnnAiKnowledgeService : IAiKnowledgeService
    {
        // ── Entry ───────────────────────────────────────────────────────
        public IEnumerable<AiKnowledgeEntry> ListEntries(string kind, string search, int? portalId, int top)
            => AiKnowledgeRepository.List(kind, search, portalId, top);

        public AiKnowledgeEntry GetEntryBySlug(string slug, int? portalId)
            => AiKnowledgeRepository.GetBySlug(slug, portalId);

        public AiKnowledgeEntry GetEntryById(int id)
            => AiKnowledgeRepository.GetById(id);

        public IEnumerable<string> ListKinds(int? portalId)
            => AiKnowledgeRepository.ListKinds();

        public int UpsertEntry(AiKnowledgeEntry entry, int? userId)
            => AiKnowledgeRepository.Upsert(entry, userId ?? -1);

        public void DeleteEntry(int id, int? userId)
            => AiKnowledgeRepository.Delete(id, userId ?? -1);

        public IEnumerable<AiKnowledgeHistory> ListEntryHistory(int knowledgeId, int top)
            => AiKnowledgeRepository.ListHistory(knowledgeId, top);

        // ── Templates ───────────────────────────────────────────────────
        public IEnumerable<KbTemplate> ListTemplates(int knowledgeId, string kind, int? portalId)
            => AiKbTemplatesRepository.List(knowledgeId, kind, portalId);

        public KbTemplate GetTemplateById(int id)
            => AiKbTemplatesRepository.GetById(id);

        public KbTemplate GetTemplateByKey(int knowledgeId, string templateKey, int? portalId)
            => AiKbTemplatesRepository.GetByKey(knowledgeId, templateKey, portalId);

        public int UpsertTemplate(KbTemplate template, int? userId)
            => AiKbTemplatesRepository.Upsert(template, userId ?? -1);

        public void DeleteTemplate(int id, int? userId)
            => AiKbTemplatesRepository.Delete(id);

        // ── Rules ───────────────────────────────────────────────────────
        public IEnumerable<KbRule> ListRules(string widgetType, int? knowledgeId, bool? enabled)
            => AiKbRulesRepository.List(widgetType, knowledgeId, enabled);

        public KbRule GetRule(string ruleId)
            => AiKbRulesRepository.Get(ruleId);

        public void UpsertRule(KbRule rule, int? userId)
            => AiKbRulesRepository.Upsert(rule, userId ?? -1);

        public void DeleteRule(string ruleId, int? userId)
            => AiKbRulesRepository.Delete(ruleId);

        // ── Feedback ────────────────────────────────────────────────────
        public long LogFeedback(KbFeedback feedback)
            => AiKbFeedbackRepository.Log(feedback);

        public IEnumerable<KbFeedback> ListFeedback(string widgetType, string outcome, bool? promoted, int top)
            => AiKbFeedbackRepository.List(widgetType, outcome, promoted, top);

        public KbFeedback GetFeedbackById(long id)
            => AiKbFeedbackRepository.GetById(id);

        public int PromoteFeedback(long feedbackId, KbTemplate newTemplate, int reviewedByUserId, string notes)
        {
            // Create the template first, then mark the feedback row as
            // promoted with the new template's id. Best-effort transactional
            // semantics — if MarkPromoted throws after Upsert, the admin will
            // see the template anyway and can re-mark the feedback.
            var tplId = AiKbTemplatesRepository.Upsert(newTemplate, reviewedByUserId);
            AiKbFeedbackRepository.MarkPromoted(feedbackId, tplId, reviewedByUserId, notes);
            return tplId;
        }

        public void MarkFeedbackReviewed(long feedbackId, int reviewedByUserId, string notes)
            => AiKbFeedbackRepository.MarkReviewed(feedbackId, reviewedByUserId, notes);

        // ── Bundle ──────────────────────────────────────────────────────
        public WidgetKnowledgeBundle GetWidgetBundle(string slug, int? portalId, int recentLessonsLimit = 5)
        {
            var entry = AiKnowledgeRepository.GetBySlug(slug, portalId);
            if (entry == null) return null;

            var templates = AiKbTemplatesRepository.List(entry.Id, null, portalId);
            // WidgetType used by rules matches the type_id in widget plugin
            // registration — not the slug. Convention: rules.KnowledgeId
            // back-refs to the entry, so look up by KnowledgeId AND by
            // WidgetType so customer-authored rules (not back-ref'd) still
            // surface.
            var rulesByKnowledge = AiKbRulesRepository.List(null, entry.Id, true);
            var widgetType = TryResolveWidgetType(entry);
            var rulesByType = string.IsNullOrEmpty(widgetType)
                ? new List<KbRule>()
                : AiKbRulesRepository.List(widgetType, null, true)
                    .Where(r => !r.KnowledgeId.HasValue).ToList();
            var allRules = rulesByKnowledge.Concat(rulesByType)
                .GroupBy(r => r.RuleId).Select(g => g.First()).ToList();

            var recentLessons = AiKbFeedbackRepository
                .List(widgetType, "fixed", true, recentLessonsLimit)
                .ToList();

            return new WidgetKnowledgeBundle
            {
                Entry = entry,
                Templates = templates.ToList(),
                Rules = allRules,
                RecentLessons = recentLessons,
            };
        }

        /// <summary>
        /// Pull `WidgetType` (e.g. "DynamicLabel") out of the entry body or
        /// derive it from the slug ("widget-dynamiclabel" → "DynamicLabel").
        /// Used when joining rules by widget rather than by KnowledgeId.
        /// </summary>
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
            if (!string.IsNullOrEmpty(entry.Slug) && entry.Slug.StartsWith("widget-", System.StringComparison.OrdinalIgnoreCase))
            {
                var s = entry.Slug.Substring("widget-".Length);
                // 'dynamic-label' → 'DynamicLabel'
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
