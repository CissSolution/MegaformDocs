using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services.Blog;
using MegaForm.Core.Services.TypedSubmission;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// The blog counters. Every case here is a failure that was measured on a live portal
    /// (dnndefender.com, 2026-08-09): 244 reader events recorded, every post reading "0 reads",
    /// every card reading "0 comments", and the five-minute scheduler reporting success.
    /// </summary>
    public class BlogAnalyticsRollupTests
    {
        private const int PortalId = 7;
        private const int PostsFormId = 378;
        private const int CommentsFormId = 380;
        private const int ReaderEventsFormId = 381;

        /// <summary>
        /// THE BUG. A seeded blog-starter persists <c>"Forms": []</c> and binds its forms through
        /// MF_Forms.AppScope instead, so the manifest map came back empty and the rollup returned
        /// on its second line — silently, because having no work is not an error.
        /// </summary>
        [Fact]
        public async Task Rollup_counts_reads_when_the_manifest_binds_no_forms()
        {
            var forms = BlogForms();
            var submissions = new InMemorySubmissionRepository();
            SeedPost(submissions, "POST-01027", viewCount: 0);

            // Three reads from two distinct visitors.
            SeedReadEvent(submissions, "POST-01027", "visitor-a");
            SeedReadEvent(submissions, "POST-01027", "visitor-a");
            SeedReadEvent(submissions, "POST-01027", "visitor-b");

            var rollup = new BlogAnalyticsRollupService(
                submissions, Phase2(EmptyFormsManifest), null, null, forms);

            var updated = await rollup.RollupBlogAnalyticsAsync(PortalId);

            Assert.Equal(1, updated);
            Assert.Equal(3, PostValue<int>(submissions, "view_count"));
        }

        /// <summary>Without the form repository there is nothing to fall back to: still a no-op.</summary>
        [Fact]
        public async Task Rollup_without_a_form_repository_still_does_nothing_on_an_unbound_manifest()
        {
            var submissions = new InMemorySubmissionRepository();
            SeedPost(submissions, "POST-01027", viewCount: 0);
            SeedReadEvent(submissions, "POST-01027", "visitor-a");

            var rollup = new BlogAnalyticsRollupService(submissions, Phase2(EmptyFormsManifest));

            Assert.Equal(0, await rollup.RollupBlogAnalyticsAsync(PortalId));
            Assert.Equal(0, PostValue<int>(submissions, "view_count"));
        }

        /// <summary>An explicit manifest binding must still win over the title-matched fallback.</summary>
        [Fact]
        public async Task Manifest_binding_wins_over_the_form_title_fallback()
        {
            var forms = BlogForms();
            // A decoy the title matcher would pick if the manifest were ignored.
            forms.SaveForm(new FormInfo { FormId = 999, PortalId = PortalId, AppScope = "blog", Title = "Blog Reader Events (archive)" });

            var map = BlogManifestHelper.ResolveFormIdMap(
                new AppDefinitionInfo
                {
                    PortalId = PortalId,
                    AppKey = "blog-starter",
                    AppScope = "blog",
                    ManifestJson = "{\"Forms\":[{\"FormId\":4242,\"Alias\":\"reader-events\"}]}"
                },
                forms);

            Assert.Equal(4242, map["reader-events"]);
            Assert.Equal(PostsFormId, map["posts"]);       // the rest still come from the fallback
            Assert.Equal(CommentsFormId, map["comments"]);
        }

        /// <summary>
        /// "Blog Reader Events" and "Blog Comments" both contain "blog", so the catch-all posts
        /// match has to be tested last or all four forms resolve to "posts".
        /// </summary>
        [Fact]
        public void Fallback_maps_each_blog_child_form_to_its_own_key()
        {
            var map = BlogManifestHelper.ResolveFormIdMap(App(EmptyFormsManifest), BlogForms());

            Assert.Equal(PostsFormId, map["posts"]);
            Assert.Equal(379, map["categories"]);
            Assert.Equal(CommentsFormId, map["comments"]);
            Assert.Equal(ReaderEventsFormId, map["reader-events"]);
        }

        /// <summary>
        /// comment_count was never computed by anything, so a post with real approved comments
        /// still advertised whatever a seed wrote — usually 0 — on every card of the public list.
        /// </summary>
        [Fact]
        public async Task Rollup_writes_the_approved_comment_count()
        {
            var submissions = new InMemorySubmissionRepository();
            SeedPost(submissions, "POST-01027", viewCount: 0);
            SeedComment(submissions, "POST-01027", "approved");
            SeedComment(submissions, "POST-01027", "approved");
            SeedComment(submissions, "POST-01027", "pending");   // not public yet: not counted
            SeedComment(submissions, "POST-01027", "spam");

            var rollup = new BlogAnalyticsRollupService(
                submissions, Phase2(EmptyFormsManifest), null, null, BlogForms());

            Assert.Equal(1, await rollup.RollupBlogAnalyticsAsync(PortalId));
            Assert.Equal(2, PostValue<int>(submissions, "comment_count"));
        }

        /// <summary>Un-approving the last comment has to bring the number back down.</summary>
        [Fact]
        public async Task Rollup_writes_zero_when_every_comment_on_a_post_is_unapproved()
        {
            var submissions = new InMemorySubmissionRepository();
            SeedPost(submissions, "POST-01027", viewCount: 0, commentCount: 4);
            SeedComment(submissions, "POST-01027", "pending");

            var rollup = new BlogAnalyticsRollupService(
                submissions, Phase2(EmptyFormsManifest), null, null, BlogForms());

            await rollup.RollupBlogAnalyticsAsync(PortalId);
            Assert.Equal(0, PostValue<int>(submissions, "comment_count"));
        }

        /// <summary>
        /// A post with no reader events and no comments is evidence-free: leave it alone rather
        /// than stamping zeros over the seeded demo numbers a starter install ships with.
        /// </summary>
        [Fact]
        public async Task Rollup_leaves_a_post_with_no_evidence_untouched()
        {
            var submissions = new InMemorySubmissionRepository();
            SeedPost(submissions, "POST-01001", viewCount: 15420, commentCount: 3);
            // Events belong to a different post.
            SeedPost(submissions, "POST-01027", viewCount: 0);
            SeedReadEvent(submissions, "POST-01027", "visitor-a");

            var rollup = new BlogAnalyticsRollupService(
                submissions, Phase2(EmptyFormsManifest), null, null, BlogForms());

            Assert.Equal(1, await rollup.RollupBlogAnalyticsAsync(PortalId));

            var seeded = PostByUid(submissions, "POST-01001");
            Assert.Equal(15420, seeded.Value<int>("view_count"));
            Assert.Equal(3, seeded.Value<int>("comment_count"));
        }

        /// <summary>
        /// The rollup runs on a scheduler thread, which has no portal locale — it formats with
        /// whatever the machine runs. A date written back culture-formatted cannot be re-parsed by
        /// the typed normaliser (InvariantCulture only) and falls into the string table, which is
        /// how a vi-VN box once blanked a whole blog: every query sorting on publish_date stopped
        /// matching.
        /// </summary>
        [Theory]
        [InlineData("vi-VN")]
        [InlineData("de-DE")]
        [InlineData("en-US")]
        public void Typed_values_are_culture_independent(string culture)
        {
            var previous = System.Threading.Thread.CurrentThread.CurrentCulture;
            try
            {
                System.Threading.Thread.CurrentThread.CurrentCulture = new CultureInfo(culture);

                var schema = JsonConvert.DeserializeObject<FormSchema>(
                    "{\"fields\":[{\"key\":\"publish_date\",\"type\":\"Date\",\"label\":\"Publish date\"}," +
                    "{\"key\":\"view_count\",\"type\":\"Number\",\"label\":\"Views\"}]}");

                // Exactly the shape TypedSubmissionResyncService hands over: DataJson parsed into
                // object values, so an ISO date arrives as a real DateTime.
                var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(
                    "{\"publish_date\":\"2026-07-29T00:00:00\",\"view_count\":1234.5}");

                var normalizer = new SubmissionFieldNormalizer();
                var fields = normalizer.Normalize(PostsFormId, schema, data);

                var date = normalizer.ExtractTypedValues(fields.Single(f => f.FieldKey == "publish_date"));
                Assert.Single(date.DateValues);      // culture-formatted text lands in the string table instead
                Assert.Equal(new DateTime(2026, 7, 29), date.DateValues[0].GetValueOrDefault().Date);

                var views = normalizer.ExtractTypedValues(fields.Single(f => f.FieldKey == "view_count"));
                Assert.Single(views.NumberValues);
                Assert.Equal(1234.5m, views.NumberValues[0]);
            }
            finally
            {
                System.Threading.Thread.CurrentThread.CurrentCulture = previous;
            }
        }

        // ---- fixtures ---------------------------------------------------------------------

        private const string EmptyFormsManifest =
            "{\"Profile\":{\"Scope\":\"blog\"},\"Forms\":[],\"Views\":[],\"Queries\":[]}";

        private static InMemoryFormRepository BlogForms()
        {
            var forms = new InMemoryFormRepository();
            forms.SaveForm(new FormInfo { FormId = PostsFormId, PortalId = PortalId, AppScope = "blog", Title = "Blog Publishing Starter" });
            forms.SaveForm(new FormInfo { FormId = 379, PortalId = PortalId, AppScope = "blog", Title = "Blog Categories" });
            forms.SaveForm(new FormInfo { FormId = CommentsFormId, PortalId = PortalId, AppScope = "blog", Title = "Blog Comments" });
            forms.SaveForm(new FormInfo { FormId = ReaderEventsFormId, PortalId = PortalId, AppScope = "blog", Title = "Blog Reader Events" });
            return forms;
        }

        private static AppDefinitionInfo App(string manifestJson) => new AppDefinitionInfo
        {
            AppId = 1,
            PortalId = PortalId,
            AppKey = "blog-starter",
            AppName = "Blog Publishing Starter",
            AppScope = "blog",
            IsEnabled = true,
            ManifestJson = manifestJson
        };

        private static IPhase2Repository Phase2(string manifestJson)
        {
            var proxy = DispatchProxy.Create<IPhase2Repository, BlogPhase2Proxy>();
            ((BlogPhase2Proxy)(object)proxy).App = App(manifestJson);
            return proxy;
        }

        private static void SeedPost(InMemorySubmissionRepository submissions, string postUid,
                                     int viewCount, int commentCount = 0)
        {
            submissions.Insert(new SubmissionInfo
            {
                FormId = PostsFormId,
                Status = "Submitted",
                DataJson = JsonConvert.SerializeObject(new Dictionary<string, object>
                {
                    ["post_uid"] = postUid,
                    ["title"] = "Post " + postUid,
                    ["status"] = "published",
                    ["view_count"] = viewCount,
                    ["comment_count"] = commentCount
                })
            });
        }

        private static void SeedReadEvent(InMemorySubmissionRepository submissions, string postUid, string visitorKey)
        {
            submissions.Insert(new SubmissionInfo
            {
                FormId = ReaderEventsFormId,
                Status = "Submitted",
                DataJson = JsonConvert.SerializeObject(new Dictionary<string, object>
                {
                    ["post_uid"] = postUid,
                    ["event_type"] = "read",
                    ["visitor_key"] = visitorKey
                })
            });
        }

        private static void SeedComment(InMemorySubmissionRepository submissions, string postUid, string moderation)
        {
            submissions.Insert(new SubmissionInfo
            {
                FormId = CommentsFormId,
                Status = "Submitted",
                DataJson = JsonConvert.SerializeObject(new Dictionary<string, object>
                {
                    ["post_uid"] = postUid,
                    ["comment_body"] = "hello",
                    ["moderation_status"] = moderation
                })
            });
        }

        private static JObject PostByUid(InMemorySubmissionRepository submissions, string postUid)
        {
            var post = submissions.List(PostsFormId, pageSize: 100).Items
                .Select(s => JObject.Parse(s.DataJson))
                .Single(d => (string)d["post_uid"] == postUid);
            return post;
        }

        private static T PostValue<T>(InMemorySubmissionRepository submissions, string key)
        {
            var post = submissions.List(PostsFormId, pageSize: 100).Items
                .Select(s => JObject.Parse(s.DataJson))
                .First(d => d[key] != null);
            return post.Value<T>(key);
        }

        private class BlogPhase2Proxy : DispatchProxy
        {
            public AppDefinitionInfo App { get; set; } = null!;

            protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
            {
                switch (targetMethod?.Name)
                {
                    case nameof(IPhase2Repository.GetAppDefinition):
                        return string.Equals((string?)args![1], App.AppKey, StringComparison.OrdinalIgnoreCase) ? App : null;
                    case nameof(IPhase2Repository.ListAppDefinitions):
                        return new List<AppDefinitionInfo> { App };
                    default:
                        return targetMethod != null && targetMethod.ReturnType.IsValueType
                            ? Activator.CreateInstance(targetMethod.ReturnType)
                            : null;
                }
            }
        }
    }
}
