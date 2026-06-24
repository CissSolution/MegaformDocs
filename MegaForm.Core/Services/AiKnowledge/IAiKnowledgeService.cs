using System.Collections.Generic;
using MegaForm.Core.Models;

namespace MegaForm.Core.Services.AiKnowledge
{
    /// <summary>
    /// Canonical AI Knowledge service contract — used by both DNN and Oqtane
    /// platform ports so they expose the same shape to the AI Form Assistant.
    ///
    /// Shipped 2026-05-29 with the 01.06.28 schema (Templates / Rules /
    /// Feedback) to support a learning loop: dispatcher rejections are
    /// logged here, admin promotes good rows into Templates, AI fetches a
    /// bundle (entry + templates + rules + recent lessons) per widget.
    /// </summary>
    public interface IAiKnowledgeService
    {
        // ── Entry CRUD ───────────────────────────────────────────────────
        IEnumerable<AiKnowledgeEntry> ListEntries(string kind, string search, int? portalId, int top);
        AiKnowledgeEntry GetEntryBySlug(string slug, int? portalId);
        AiKnowledgeEntry GetEntryById(int id);
        IEnumerable<string> ListKinds(int? portalId);
        int UpsertEntry(AiKnowledgeEntry entry, int? userId);
        void DeleteEntry(int id, int? userId);
        IEnumerable<AiKnowledgeHistory> ListEntryHistory(int knowledgeId, int top);

        // ── Templates ────────────────────────────────────────────────────
        IEnumerable<KbTemplate> ListTemplates(int knowledgeId, string kind, int? portalId);
        KbTemplate GetTemplateById(int id);
        KbTemplate GetTemplateByKey(int knowledgeId, string templateKey, int? portalId);
        int UpsertTemplate(KbTemplate template, int? userId);
        void DeleteTemplate(int id, int? userId);

        // ── Rules ────────────────────────────────────────────────────────
        IEnumerable<KbRule> ListRules(string widgetType, int? knowledgeId, bool? enabled);
        KbRule GetRule(string ruleId);
        void UpsertRule(KbRule rule, int? userId);
        void DeleteRule(string ruleId, int? userId);

        // ── Feedback / learning loop ─────────────────────────────────────
        long LogFeedback(KbFeedback feedback);
        IEnumerable<KbFeedback> ListFeedback(string widgetType, string outcome, bool? promoted, int top);
        KbFeedback GetFeedbackById(long id);
        /// <summary>Admin promotes a captured failure/fix pair into a saved template.</summary>
        int PromoteFeedback(long feedbackId, KbTemplate newTemplate, int reviewedByUserId, string notes);
        void MarkFeedbackReviewed(long feedbackId, int reviewedByUserId, string notes);

        // ── AI fetch bundle ──────────────────────────────────────────────
        /// <summary>
        /// One-shot fetch of entry + templates + rules + the last N promoted
        /// feedback rows for the AI assistant. recentLessonsLimit caps the
        /// lessons list to avoid blowing the model's context window.
        /// </summary>
        WidgetKnowledgeBundle GetWidgetBundle(string slug, int? portalId, int recentLessonsLimit = 5);
    }
}
