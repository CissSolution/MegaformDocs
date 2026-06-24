using System;
using System.Collections.Generic;

namespace MegaForm.Core.Models
{
    /// <summary>
    /// MegaForm AI Knowledge Base entry. Backs the MF_AI_Knowledge table.
    /// Used by the AI Form Assistant tool-use loop — AI calls list_knowledge / get_knowledge
    /// instead of having the entire catalog stuffed into its system prompt.
    /// </summary>
    public class AiKnowledgeEntry
    {
        public int Id { get; set; }
        /// <summary>Unique slug per (Slug, PortalId) — e.g. "widget-datarepeater".</summary>
        public string Slug { get; set; }
        /// <summary>widget | sql_sample | row_template | pager_template | form_pattern | designer | cascade_pattern | system_arch.</summary>
        public string Kind { get; set; }
        public string Title { get; set; }
        public string Summary { get; set; }
        public string Body { get; set; }
        public string Tags { get; set; }
        public string Examples { get; set; }
        /// <summary>NULL = global; non-null = portal-specific override.</summary>
        public int? PortalId { get; set; }
        /// <summary>megaform-builtin | customer | customer-overridden. Future upgrades preserve non-builtin rows.</summary>
        public string Source { get; set; }
        public int Version { get; set; }
        /// <summary>[B53] Stable widget identifier — e.g. 'razor' | 'dynlabel' | 'datagrid' | 'datarepeater'. NULL = applies to all widgets.</summary>
        public string WidgetType { get; set; }
        /// <summary>[B53] Surface where the entry applies — e.g. 'designer' | 'runtime' | 'studio' | 'theme'. NULL = applies anywhere.</summary>
        public string Surface { get; set; }
        public int? CreatedByUserId { get; set; }
        public DateTime CreatedOnDate { get; set; }
        public int? UpdatedByUserId { get; set; }
        public DateTime? UpdatedOnDate { get; set; }
    }

    public class AiKnowledgeHistory
    {
        public int HistoryId { get; set; }
        public int KnowledgeId { get; set; }
        public string Slug { get; set; }
        public string Kind { get; set; }
        public string Title { get; set; }
        public string Summary { get; set; }
        public string Body { get; set; }
        public string Tags { get; set; }
        public string Examples { get; set; }
        public string Source { get; set; }
        public int Version { get; set; }
        public int? ChangedByUserId { get; set; }
        public DateTime ChangedOnDate { get; set; }
        /// <summary>create | update | delete.</summary>
        public string ChangeAction { get; set; }
    }

    // ════════════════════════════════════════════════════════════════════
    //  v20260530-13 — Templates / Rules / Feedback loop models (01.06.28)
    // ════════════════════════════════════════════════════════════════════

    /// <summary>
    /// One concrete saved template / preset / pattern attached to a Knowledge
    /// entry. Lets each widget carry many tagged shapes (card-grid, table-list,
    /// cascade-2level, golf-scorecard…) without bloating the parent Body.
    /// Backed by MF_AI_KB_Templates.
    /// </summary>
    public class KbTemplate
    {
        public int Id { get; set; }
        public int KnowledgeId { get; set; }
        /// <summary>Stable key inside the parent entry — e.g. 'card-grid'.</summary>
        public string TemplateKey { get; set; }
        /// <summary>preset | pattern | success | failure</summary>
        public string Kind { get; set; }
        public string Title { get; set; }
        public string Summary { get; set; }
        /// <summary>JSON payload — typically an ops[] array or a widgetProps shape.</summary>
        public string Body { get; set; }
        public string Tags { get; set; }
        /// <summary>Promotion score from admin curation / AI upvote.</summary>
        public int Score { get; set; }
        public int SortOrder { get; set; }
        public int? PortalId { get; set; }
        public string Source { get; set; }
        public int Version { get; set; }
        public int? CreatedByUserId { get; set; }
        public DateTime CreatedOnDate { get; set; }
        public int? UpdatedByUserId { get; set; }
        public DateTime? UpdatedOnDate { get; set; }
    }

    /// <summary>
    /// Dispatcher rule indexed by stable RuleId (e.g. "DL-001"). Replaces the
    /// hand-coded reject strings in ops.ts — ops.ts now looks rules up by id
    /// and uses RejectionMessage when emitting ok:false, and chat.ts surfaces
    /// FixHint in the system prompt. Backed by MF_AI_KB_Rules.
    /// </summary>
    public class KbRule
    {
        public string RuleId { get; set; }
        public int? KnowledgeId { get; set; }
        public string WidgetType { get; set; }
        public string Title { get; set; }
        /// <summary>hard_reject | warning | normalize</summary>
        public string Severity { get; set; }
        public string Condition { get; set; }
        public string RegexPattern { get; set; }
        public string RejectionMessage { get; set; }
        public string FixHint { get; set; }
        public string Source { get; set; }
        public int Version { get; set; }
        public bool Enabled { get; set; }
        public int? PortalId { get; set; }
        public int? CreatedByUserId { get; set; }
        public DateTime CreatedOnDate { get; set; }
        public int? UpdatedByUserId { get; set; }
        public DateTime? UpdatedOnDate { get; set; }
    }

    /// <summary>
    /// One log row per dispatcher rejection (or AI-self-reported failure).
    /// Admin reviews + promotes good rows into Templates so the AI learns
    /// from the live loop. Backed by MF_AI_KB_Feedback.
    /// </summary>
    public class KbFeedback
    {
        public long Id { get; set; }
        public string SessionId { get; set; }
        public string RuleId { get; set; }
        public int? KnowledgeId { get; set; }
        public string WidgetType { get; set; }
        public string Op { get; set; }
        public string AttemptedJson { get; set; }
        public string RejectionMessage { get; set; }
        public string FixedJson { get; set; }
        /// <summary>rejected | fixed | abandoned | reported</summary>
        public string Outcome { get; set; }
        public bool Promoted { get; set; }
        public int? PromotedTemplateId { get; set; }
        public int? PortalId { get; set; }
        public int? FormId { get; set; }
        public int? UserId { get; set; }
        public DateTime CreatedOnDate { get; set; }
        public int? ReviewedByUserId { get; set; }
        public DateTime? ReviewedOnDate { get; set; }
        public string ReviewNotes { get; set; }
    }

    /// <summary>
    /// Bundled payload returned by GetWidgetBundle — one fetch gives the AI
    /// the entry + all templates + all rules + recent promoted feedback
    /// patterns for that widget. Replaces N round-trips.
    /// </summary>
    public class WidgetKnowledgeBundle
    {
        public AiKnowledgeEntry Entry { get; set; }
        public List<KbTemplate> Templates { get; set; }
        public List<KbRule> Rules { get; set; }
        /// <summary>Recent admin-promoted feedback patterns that taught a fix.</summary>
        public List<KbFeedback> RecentLessons { get; set; }
    }
}
