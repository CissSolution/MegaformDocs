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
            public int Inserts, Updates;

            /// <summary>
            /// [SeedMergeIdempotence v20260812] Keyed on Id, with a unique Slug — because that is
            /// what every real store does (DNN AiKnowledgeRepository.cs:143 `if (id == 0)` INSERT,
            /// Oqtane OqtaneAiKnowledgeService.cs:122, Web WebAiKnowledgeService.cs:203, all behind
            /// UNIQUE(Slug, PortalId)).
            ///
            /// This fake used to upsert BY SLUG, so Merge_IsIdempotent_ViaUpsert below passed while
            /// production did the opposite: the merger handed over a fresh entity with Id 0, the
            /// store INSERTED, and the unique index rejected it. The test was green and the
            /// behaviour it named did not exist. A fake may simplify a dependency; it must not
            /// contradict it.
            /// </summary>
            public int UpsertEntry(AiKnowledgeEntry entry, int? userId)
            {
                if (entry.Id == 0)
                {
                    if (Entries.Any(x => string.Equals(x.Slug, entry.Slug, StringComparison.OrdinalIgnoreCase)
                                         && x.PortalId == entry.PortalId))
                        throw new InvalidOperationException("UNIQUE constraint UQ_MF_AI_Knowledge_Slug violated for '" + entry.Slug + "'.");
                    entry.Id = Entries.Count + 1;
                    Entries.Add(entry);
                    Inserts++;
                    return entry.Id;
                }

                var existing = Entries.FirstOrDefault(x => x.Id == entry.Id);
                if (existing == null) return 0;
                existing.Kind = entry.Kind;
                existing.Title = entry.Title;
                existing.Summary = entry.Summary;
                existing.Body = entry.Body;
                existing.Tags = entry.Tags;
                existing.Examples = entry.Examples;
                existing.Version++;
                Updates++;
                return existing.Id;
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
            var second = AiKnowledgeSeedMerger.Merge(seed.Replace("v1", "v2"), svc, null);

            Assert.True(second.Success, string.Join("; ", second.Errors));
            Assert.Single(svc.Entries);
            Assert.Equal("v2", svc.Entries[0].Body);   // updated in place, not duplicated
            Assert.Equal(1, svc.Inserts);              // the second pass must NOT insert
            Assert.Equal(1, svc.Updates);
        }

        /// <summary>
        /// [KbPerTemplate v20260812] A template's knowledge bundle, shaped as build-gallery.mjs
        /// publishes it: the CREATE corpus and the REFINE contract on SEPARATE slugs, because a
        /// slug holds exactly one row of one Kind and GetTemplateGuide rejects anything whose Kind
        /// is not template_guide.
        /// </summary>
        private const string TemplateKbSeed = @"{
          ""entries"": [
            { ""Slug"": ""gallery-euro-youth-application"", ""Kind"": ""form_template"",
              ""Title"": ""Euro Youth Application"", ""Body"": ""{}"",
              ""Tags"": ""form_template,application"", ""Examples"": ""[{}]"" },
            { ""Slug"": ""tpl-euro-youth-application"", ""Kind"": ""template_guide"",
              ""Title"": ""Euro Youth Application"",
              ""Body"": ""{\""guide_file\"": \""euro-youth-application.guide.md\""}"",
              ""Tags"": ""premium,template-guide"" }
          ], ""templates"": [], ""rules"": [] }";

        [Fact]
        public void Merge_TemplateKb_Reinstall_DoesNotDuplicateOrFail()
        {
            var svc = new FakeKbService();

            var first = AiKnowledgeSeedMerger.Merge(TemplateKbSeed, svc, null);
            var second = AiKnowledgeSeedMerger.Merge(TemplateKbSeed, svc, null);

            // Reinstalling a gallery template merges its knowledge again — that has to be a
            // no-op update, not a unique-constraint failure reported as "0 rows written".
            Assert.True(first.Success, string.Join("; ", first.Errors));
            Assert.True(second.Success, string.Join("; ", second.Errors));
            Assert.Equal(2, second.Entries);
            Assert.Equal(2, svc.Entries.Count);
            Assert.Equal(2, svc.Inserts);
            Assert.Equal(2, svc.Updates);
        }

        /// <summary>
        /// [KbPerTemplate v20260812] The WIRE CONTRACT between tools/gallery/build-gallery.mjs and
        /// GalleryInstallService.InstallKnowledgeAsync. Written in the exact camelCase shape the
        /// publisher emits — if either side is renamed, this fails instead of a template installing
        /// with silently empty knowledge (the bundle would deserialize to a null Seed and the
        /// install would report "carries no knowledge" on a site nobody is watching).
        /// </summary>
        private const string PublishedBundleJson = @"{
          ""kbVersion"": 1,
          ""slug"": ""euro-youth-application"",
          ""seed"": {
            ""entries"": [
              { ""Slug"": ""gallery-euro-youth-application"", ""Kind"": ""form_template"",
                ""Title"": ""Euro Youth Application"", ""Body"": ""{}"", ""Examples"": ""[{}]"" },
              { ""Slug"": ""tpl-euro-youth-application"", ""Kind"": ""template_guide"",
                ""Title"": ""Euro Youth Application"",
                ""Body"": ""{\""guide_file\"": \""euro-youth-application.guide.md\""}"" }
            ],
            ""templates"": [],
            ""rules"": []
          },
          ""resources"": [
            { ""path"": ""kb/TemplateGuides/euro-youth-application.guide.md"",
              ""sha256"": ""c87517b9092faf85b69cdc23549a5cbfa5b0100276164e51c9efa4a0474ae144"",
              ""sizeBytes"": 6973 },
            { ""path"": ""kb/TemplateGuides/euro-youth-application.facts.json"",
              ""sha256"": ""6caf21d0cfa4f2241225382ea395462179de4b77b01a427c0ff2d2c154752e24"",
              ""sizeBytes"": 5657 }
          ]
        }";

        [Fact]
        public void PublishedBundle_Deserializes_AndMergesThroughTheSamePath()
        {
            var bundle = Newtonsoft.Json.JsonConvert.DeserializeObject<KbTemplateBundle>(PublishedBundleJson);

            Assert.NotNull(bundle);
            Assert.Equal(1, bundle.KbVersion);
            Assert.Equal("euro-youth-application", bundle.Slug);
            Assert.NotNull(bundle.Seed);
            Assert.Equal(2, bundle.Resources.Count);

            // Resources must be usable by DownloadFileAsync: a repo-relative path that survives
            // sanitisation, and a 64-char sha256 (it refuses unverifiable downloads outright).
            foreach (var r in bundle.Resources)
            {
                Assert.NotNull(GalleryRepositoryService.SanitizeRelativePath(r.Path));
                Assert.Equal(64, r.Sha256.Length);
                Assert.True(r.SizeBytes > 0);
            }

            // The seed sub-document is handed to the merger verbatim — no bespoke parser.
            var svc = new FakeKbService();
            var result = AiKnowledgeSeedMerger.Merge(
                bundle.Seed.ToString(Newtonsoft.Json.Formatting.None), svc, null);

            Assert.True(result.Success, string.Join("; ", result.Errors));
            Assert.Equal(2, result.Entries);
        }

        [Fact]
        public void PublishedManifestEntry_CarriesTheKbPointer()
        {
            // One entry as manifest.json publishes it, trimmed to the KB fields.
            var json = @"{ ""slug"": ""euro-youth-application"", ""file"": ""templates/euro-youth-application.json"",
                           ""sha256"": ""aa"", ""kb"": ""kb/templates/euro-youth-application.json"",
                           ""kbSha256"": ""4aebb4fafb241ce4f10c7a0363e69ed4b9d49497ef70336d903a3b3564b19b12"",
                           ""kbSizeBytes"": 72116 }";

            var info = Newtonsoft.Json.JsonConvert.DeserializeObject<GalleryRepoTemplateInfo>(json);

            Assert.Equal("kb/templates/euro-youth-application.json", info.Kb);
            Assert.Equal(64, info.KbSha256.Length);
            Assert.Equal(72116, info.KbSizeBytes);
            Assert.NotNull(GalleryRepositoryService.SanitizeRelativePath(info.Kb));
        }

        [Fact]
        public void ManifestWithoutKbPointer_IsNotAFailure()
        {
            // A gallery published before the KB channel existed simply has no pointer; the install
            // must treat that as "nothing to do", never as an error.
            var info = Newtonsoft.Json.JsonConvert.DeserializeObject<GalleryRepoTemplateInfo>(
                @"{ ""slug"": ""old-template"", ""file"": ""templates/old-template.json"" }");

            Assert.Null(info.Kb);
            Assert.Null(info.KbSha256);
        }

        [Fact]
        public void Merge_TemplateKb_KeepsCreateAndGuideOnSeparateSlugs()
        {
            var svc = new FakeKbService();
            AiKnowledgeSeedMerger.Merge(TemplateKbSeed, svc, null);

            var create = svc.GetEntryBySlug("gallery-euro-youth-application", null);
            var guide = svc.GetEntryBySlug("tpl-euro-youth-application", null);
            Assert.Equal("form_template", create.Kind);
            Assert.Equal("template_guide", guide.Kind);
        }

        [Fact]
        public void Merge_OverwritesStaleKnowledgeAlreadyOnTheSite()
        {
            var svc = new FakeKbService();
            svc.UpsertEntry(new AiKnowledgeEntry
            {
                Slug = "gallery-euro-youth-application",
                Kind = "form_template",
                Title = "STALE",
                Body = "{}",
            }, null);

            var result = AiKnowledgeSeedMerger.Merge(TemplateKbSeed, svc, null);

            Assert.True(result.Success, string.Join("; ", result.Errors));
            Assert.Equal("Euro Youth Application", svc.GetEntryBySlug("gallery-euro-youth-application", null).Title);
            Assert.Equal(2, svc.Entries.Count);
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
