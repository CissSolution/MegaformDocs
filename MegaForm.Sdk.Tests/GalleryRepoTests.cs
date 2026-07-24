using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiKnowledge;
using MegaForm.Core.Services.GalleryRepo;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    public class GalleryRepoTests
    {
        // ── slug / path safety ───────────────────────────────────────────

        [Theory]
        [InlineData("event-registration-rsvp", true)]
        [InlineData("tpl-x", true)]
        [InlineData("", false)]
        [InlineData("Has Space", false)]
        [InlineData("UPPER-ok", true)]            // case-insensitive slug allowed
        [InlineData("../escape", false)]
        [InlineData("a/b", false)]                 // slug is single segment
        public void Slug_Validation(string slug, bool expected)
            => Assert.Equal(expected, GalleryRepositoryService.IsValidSlug(slug));

        [Theory]
        [InlineData("templates/a.json", "templates/a.json")]
        [InlineData("kb/PromptRecipes/x.md", "kb/PromptRecipes/x.md")]
        [InlineData("kb\\PromptRecipes\\x.md", "kb/PromptRecipes/x.md")] // backslash normalized
        [InlineData("../secret", null)]
        [InlineData("a/../b", null)]
        [InlineData("/abs/path", null)]
        [InlineData("C:/windows", null)]
        [InlineData("https://evil/x", null)]
        [InlineData("a//b", null)]
        [InlineData("", null)]
        public void Path_Sanitize(string input, string expected)
            => Assert.Equal(expected, GalleryRepositoryService.SanitizeRelativePath(input));

        // ── sha256 ───────────────────────────────────────────────────────

        [Fact]
        public void Sha256_KnownVector()
        {
            var hex = GalleryRepositoryService.ComputeSha256Hex(Encoding.UTF8.GetBytes("abc"));
            Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", hex);
        }

        // ── template validation ──────────────────────────────────────────

        [Fact]
        public void ValidateTemplateJson_AcceptsMinimalValid()
        {
            var ok = GalleryRepositoryService.ValidateTemplateJson(
                "{\"slug\":\"demo-form\",\"title\":\"Demo\",\"fields\":[]}", out var err);
            Assert.True(ok);
            Assert.Null(err);
            Assert.Equal("demo-form", GalleryRepositoryService.ReadTemplateSlug("{\"slug\":\"demo-form\",\"fields\":[]}"));
        }

        [Theory]
        [InlineData("not json", "Template is not valid JSON.")]
        [InlineData("{\"fields\":[]}", "Template has no valid slug.")]
        [InlineData("{\"slug\":\"x\"}", "Template has no fields array.")]
        [InlineData("", "Empty template.")]
        public void ValidateTemplateJson_Rejects(string json, string expectedError)
        {
            var ok = GalleryRepositoryService.ValidateTemplateJson(json, out var err);
            Assert.False(ok);
            Assert.Equal(expectedError, err);
        }

        // ── manifest parse ───────────────────────────────────────────────

        [Fact]
        public void Manifest_Parses()
        {
            var json = @"{ ""repoVersion"": 1, ""generatedUtc"": ""2026-07-23T00:00:00Z"",
                ""templates"": [ { ""slug"": ""demo"", ""title"": ""Demo"", ""file"": ""templates/demo.json"",
                    ""sha256"": ""abc"", ""sizeBytes"": 123, ""premium"": true, ""categories"": [""premium""] } ] }";
            var m = Newtonsoft.Json.JsonConvert.DeserializeObject<GalleryRepoManifest>(json);
            Assert.Equal(1, m.RepoVersion);
            Assert.Single(m.Templates);
            Assert.Equal("demo", m.Templates[0].Slug);
            Assert.True(m.Templates[0].Premium);
        }

        [Fact]
        public void BaseUrl_Normalization()
        {
            // null/empty falls back to the shipped default (jsDelivr CDN over the public gallery repo).
            Assert.Equal(GalleryRepositoryService.DefaultRepoBaseUrl, GalleryRepositoryService.NormalizeBaseUrl(null));
            Assert.EndsWith("/", GalleryRepositoryService.DefaultRepoBaseUrl);
            Assert.Equal("https://example.com/repo/", GalleryRepositoryService.NormalizeBaseUrl("example.com/repo"));
            Assert.Equal("https://example.com/repo/", GalleryRepositoryService.NormalizeBaseUrl("https://example.com/repo/"));
        }
    }

    public class AiKnowledgeSeedMergerTests
    {
        private sealed class FakeKbService : IAiKnowledgeService
        {
            public List<AiKnowledgeEntry> Entries = new List<AiKnowledgeEntry>();
            public List<KbTemplate> Templates = new List<KbTemplate>();
            public List<KbRule> Rules = new List<KbRule>();

            public IEnumerable<AiKnowledgeEntry> ListEntries(string kind, string search, int? portalId, int top) => Entries;
            public AiKnowledgeEntry GetEntryBySlug(string slug, int? portalId)
            {
                var e = Entries.FirstOrDefault(x => string.Equals(x.Slug, slug, StringComparison.OrdinalIgnoreCase));
                if (e != null && e.Id == 0) e.Id = Entries.IndexOf(e) + 1;
                return e;
            }
            public AiKnowledgeEntry GetEntryById(int id) => Entries.FirstOrDefault(x => x.Id == id);
            public IEnumerable<string> ListKinds(int? portalId) => Entries.Select(x => x.Kind).Distinct();
            public int UpsertEntry(AiKnowledgeEntry entry, int? userId)
            {
                var existing = Entries.FirstOrDefault(x => x.Slug == entry.Slug);
                if (existing != null) { existing.Body = entry.Body; existing.Version++; return existing.Id; }
                entry.Id = Entries.Count + 1;
                Entries.Add(entry);
                return entry.Id;
            }
            public void DeleteEntry(int id, int? userId) { }
            public IEnumerable<AiKnowledgeHistory> ListEntryHistory(int knowledgeId, int top) => new AiKnowledgeHistory[0];
            public IEnumerable<KbTemplate> ListTemplates(int knowledgeId, string kind, int? portalId) => Templates;
            public KbTemplate GetTemplateById(int id) => null;
            public KbTemplate GetTemplateByKey(int knowledgeId, string templateKey, int? portalId) => null;
            public int UpsertTemplate(KbTemplate template, int? userId) { Templates.Add(template); return Templates.Count; }
            public void DeleteTemplate(int id, int? userId) { }
            public IEnumerable<KbRule> ListRules(string widgetType, int? knowledgeId, bool? enabled) => Rules;
            public KbRule GetRule(string ruleId) => null;
            public void UpsertRule(KbRule rule, int? userId) { Rules.Add(rule); }
            public void DeleteRule(string ruleId, int? userId) { }
            public long LogFeedback(KbFeedback feedback) => 0;
            public IEnumerable<KbFeedback> ListFeedback(string widgetType, string outcome, bool? promoted, int top) => new KbFeedback[0];
            public KbFeedback GetFeedbackById(long id) => null;
            public int PromoteFeedback(long feedbackId, KbTemplate newTemplate, int reviewedByUserId, string notes) => 0;
            public void MarkFeedbackReviewed(long feedbackId, int reviewedByUserId, string notes) { }
            public WidgetKnowledgeBundle GetWidgetBundle(string slug, int? portalId, int recentLessonsLimit = 5) => null;
        }

        [Fact]
        public void Merge_AllSections_WithKnowledgeIdMapping()
        {
            var seed = @"{
              ""entries"": [ { ""Slug"": ""widget-select"", ""Kind"": ""widget"", ""Title"": ""Select"", ""Body"": ""b"" } ],
              ""templates"": [ { ""KnowledgeSlug"": ""widget-select"", ""TemplateKey"": ""t1"", ""Kind"": ""widget"", ""Body"": ""x"" } ],
              ""rules"": [ { ""RuleId"": ""SEL-001"", ""KnowledgeSlug"": ""widget-select"", ""WidgetType"": ""Select"" } ] }";

            var svc = new FakeKbService();
            var result = AiKnowledgeSeedMerger.Merge(seed, svc, 7);

            Assert.True(result.Success, string.Join("; ", result.Errors));
            Assert.Equal(1, result.Entries);
            Assert.Equal(1, result.Templates);
            Assert.Equal(1, result.Rules);
            Assert.Equal(1, svc.Templates[0].KnowledgeId);   // resolved via slug → entry Id
            Assert.Equal(1, svc.Rules[0].KnowledgeId);
        }

        [Fact]
        public void Merge_IsIdempotent_ViaUpsert()
        {
            var seed = @"{ ""entries"": [ { ""Slug"": ""a"", ""Kind"": ""widget"", ""Body"": ""v1"" } ] }";
            var svc = new FakeKbService();
            AiKnowledgeSeedMerger.Merge(seed, svc, null);
            AiKnowledgeSeedMerger.Merge(seed.Replace("v1", "v2"), svc, null);

            Assert.Single(svc.Entries);
            Assert.Equal("v2", svc.Entries[0].Body);   // updated in place, not duplicated
        }

        [Fact]
        public void Merge_RowFailure_DoesNotAbort()
        {
            var seed = @"{
              ""entries"": [ { ""Slug"": ""ok"", ""Kind"": ""widget"" } ],
              ""templates"": [ { ""KnowledgeSlug"": ""missing"", ""TemplateKey"": ""t"" } ],
              ""rules"": [] }";
            var svc = new FakeKbService();
            var result = AiKnowledgeSeedMerger.Merge(seed, svc, null);

            Assert.Equal(1, result.Entries);
            Assert.Equal(0, result.Templates);
            Assert.Single(result.Errors);            // unknown KnowledgeSlug collected
            Assert.False(result.Success);
        }

        [Fact]
        public void Merge_RejectsGarbage()
        {
            var result = AiKnowledgeSeedMerger.Merge("not json", new FakeKbService(), null);
            Assert.False(result.Success);
            Assert.Single(result.Errors);
        }
    }
}
