using System;
using System.Collections.Generic;
using MegaForm.Core.Models;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services.AiKnowledge
{
    /// <summary>
    /// [GalleryRepo v20260723] Merges the canonical AI-knowledge seed JSON
    /// (root keys: entries / templates / rules — same shape the Oqtane first-run
    /// seeder consumes) into an existing KB store via <see cref="IAiKnowledgeService"/>
    /// UPSERTS. Unlike the first-run seeder (add-only when the table is empty),
    /// this path is built for the gallery-repository sync channel: running it
    /// repeatedly UPDATES built-in rows in place (the service upsert keys on
    /// slug / (knowledgeId,templateKey) / ruleId) and is idempotent.
    ///
    /// Per-row failures are collected, never thrown — one bad row must not abort
    /// a 400-row sync. The caller is responsible for the license gate + for having
    /// verified the payload (sha256) before calling.
    /// </summary>
    public static class AiKnowledgeSeedMerger
    {
        public sealed class Result
        {
            public int Entries;
            public int Templates;
            public int Rules;
            public List<string> Errors = new List<string>();
            public bool Success => Errors.Count == 0;
            public string Summary =>
                "Synced " + Entries + " entries, " + Templates + " templates, " + Rules + " rules"
                + (Errors.Count > 0 ? " (" + Errors.Count + " row errors)" : "");
        }

        public static Result Merge(string seedJson, IAiKnowledgeService svc, int? userId)
        {
            var result = new Result();
            if (string.IsNullOrWhiteSpace(seedJson)) { result.Errors.Add("Empty seed JSON."); return result; }
            if (svc == null) { result.Errors.Add("No IAiKnowledgeService."); return result; }

            JObject root;
            try { root = JObject.Parse(seedJson); }
            catch (Exception ex) { result.Errors.Add("Seed JSON parse failed: " + ex.Message); return result; }

            // ── 1. entries ───────────────────────────────────────────────
            foreach (var jt in (root["entries"] as JArray) ?? new JArray())
            {
                try
                {
                    var slug = (string)jt["Slug"];
                    if (string.IsNullOrWhiteSpace(slug)) { result.Errors.Add("Entry without slug skipped."); continue; }

                    var portalId = jt["PortalId"]?.Type == JTokenType.Null ? (int?)null : (int?)jt["PortalId"];

                    // [SeedMergeIdempotence v20260812] UpsertEntry keys on entry.Id, NOT on Slug —
                    // `if (entry.Id == 0)` INSERTS on every implementation (DNN
                    // AiKnowledgeRepository.cs:143, Oqtane OqtaneAiKnowledgeService.cs:122, Web
                    // WebAiKnowledgeService.cs:203). Passing Id 0 for a slug that already exists
                    // therefore hit UNIQUE(Slug, PortalId) and was recorded as a row error, so this
                    // merger was never actually idempotent despite the class docs above saying it
                    // "UPSERTS ... keyed on slug". Nobody noticed while the only caller was a
                    // first-run seeder that ran on a near-empty store; it matters now that a
                    // template's knowledge is merged again every time the template is reinstalled.
                    // Resolve the existing row first and carry its Id, which turns the call into
                    // the UPDATE the seed always meant.
                    var existing = ResolveEntry(svc, slug, portalId);

                    svc.UpsertEntry(new AiKnowledgeEntry
                    {
                        Id = existing?.Id ?? 0,
                        Slug = slug,
                        Kind = (string)jt["Kind"],
                        Title = (string)jt["Title"] ?? string.Empty,
                        Summary = (string)jt["Summary"] ?? string.Empty,
                        Body = (string)jt["Body"] ?? string.Empty,
                        Tags = (string)jt["Tags"] ?? string.Empty,
                        // Coalesce like the first-run seeder (SQLite NOT NULL columns).
                        Examples = (string)jt["Examples"] ?? string.Empty,
                        PortalId = portalId,
                        Source = (string)jt["Source"] ?? "megaform-builtin",
                        WidgetType = (string)jt["WidgetType"] ?? string.Empty,
                        Surface = (string)jt["Surface"] ?? string.Empty,
                        Version = (int?)jt["Version"] ?? 1,
                    }, userId);
                    result.Entries++;
                }
                catch (Exception ex) { result.Errors.Add("Entry '" + (string)jt["Slug"] + "': " + ex.Message); }
            }

            // ── 2. templates (KnowledgeSlug → KnowledgeId) ───────────────
            foreach (var jt in (root["templates"] as JArray) ?? new JArray())
            {
                try
                {
                    var slug = (string)jt["KnowledgeSlug"];
                    var kid = ResolveKnowledgeId(svc, slug);
                    if (kid == null) { result.Errors.Add("Template '" + (string)jt["TemplateKey"] + "': unknown KnowledgeSlug '" + slug + "'."); continue; }
                    svc.UpsertTemplate(new KbTemplate
                    {
                        KnowledgeId = kid.Value,
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
                    }, userId);
                    result.Templates++;
                }
                catch (Exception ex) { result.Errors.Add("Template '" + (string)jt["TemplateKey"] + "': " + ex.Message); }
            }

            // ── 3. rules ─────────────────────────────────────────────────
            foreach (var jt in (root["rules"] as JArray) ?? new JArray())
            {
                try
                {
                    var ruleId = (string)jt["RuleId"];
                    if (string.IsNullOrWhiteSpace(ruleId)) { result.Errors.Add("Rule without RuleId skipped."); continue; }
                    svc.UpsertRule(new KbRule
                    {
                        RuleId = ruleId,
                        KnowledgeId = ResolveKnowledgeId(svc, (string)jt["KnowledgeSlug"]),
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
                    }, userId);
                    result.Rules++;
                }
                catch (Exception ex) { result.Errors.Add("Rule '" + (string)jt["RuleId"] + "': " + ex.Message); }
            }

            return result;
        }

        /// <summary>
        /// The stored row for this slug, or null. Tries the seed's own PortalId first and falls
        /// back to the global lookup: the DNN repository's slug query treats a null PortalId as
        /// "any portal", and a mismatch here would silently create a second row for the same slug
        /// on the next merge instead of updating the one already there.
        /// </summary>
        private static AiKnowledgeEntry ResolveEntry(IAiKnowledgeService svc, string slug, int? portalId)
        {
            try
            {
                var hit = svc.GetEntryBySlug(slug, portalId);
                if (hit != null) return hit;
                return portalId.HasValue ? svc.GetEntryBySlug(slug, null) : null;
            }
            catch { return null; }
        }

        private static int? ResolveKnowledgeId(IAiKnowledgeService svc, string slug)
        {
            if (string.IsNullOrWhiteSpace(slug)) return null;
            try { return svc.GetEntryBySlug(slug, null)?.Id; }
            catch { return null; }
        }
    }
}
