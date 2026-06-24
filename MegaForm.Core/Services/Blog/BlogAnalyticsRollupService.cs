using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services.Blog
{
    public class BlogAnalyticsRollupService : IAnalyticsRollupService
    {
        private readonly ISubmissionRepository _subRepo;
        private readonly IPhase2Repository _phase2Repo;

        public BlogAnalyticsRollupService(ISubmissionRepository subRepo, IPhase2Repository phase2Repo)
        {
            _subRepo = subRepo ?? throw new ArgumentNullException(nameof(subRepo));
            _phase2Repo = phase2Repo ?? throw new ArgumentNullException(nameof(phase2Repo));
        }

        public async Task<int> RollupBlogAnalyticsAsync(int portalId, CancellationToken ct = default)
        {
            var app = _phase2Repo.GetAppDefinition(portalId, "blog-starter");
            if (app == null)
                return 0;

            var formIds = BlogManifestHelper.GetFormIdMap(app);
            if (!formIds.TryGetValue("posts", out var postsFormId) || postsFormId <= 0)
                return 0;
            if (!formIds.TryGetValue("reader-events", out var readerEventsFormId) || readerEventsFormId <= 0)
                return 0;

            // Load all reader events
            var eventsPage = _subRepo.List(readerEventsFormId, pageSize: 10000);
            var events = eventsPage.Items ?? new List<SubmissionInfo>();

            var aggregates = new Dictionary<string, PostAnalytics>(StringComparer.OrdinalIgnoreCase);

            foreach (var evt in events)
            {
                if (ct.IsCancellationRequested)
                    break;

                if (string.IsNullOrWhiteSpace(evt.DataJson))
                    continue;

                try
                {
                    var data = JObject.Parse(evt.DataJson);
                    var postUid = data["post_uid"]?.ToString();
                    var eventType = data["event_type"]?.ToString();

                    if (string.IsNullOrWhiteSpace(postUid) || string.IsNullOrWhiteSpace(eventType))
                        continue;

                    if (!aggregates.TryGetValue(postUid, out var analytics))
                    {
                        analytics = new PostAnalytics();
                        aggregates[postUid] = analytics;
                    }

                    switch (eventType.ToLowerInvariant())
                    {
                        case "read":
                            analytics.ViewCount++;
                            break;
                        case "unique_reader":
                            analytics.UniqueReaders++;
                            break;
                        case "share":
                            analytics.ShareCount++;
                            break;
                        case "like":
                            analytics.LikeCount++;
                            break;
                        case "bookmark":
                            analytics.BookmarkCount++;
                            break;
                        case "newsletter_click":
                            analytics.NewsletterClicks++;
                            break;
                    }
                }
                catch
                {
                    // Skip malformed events
                }
            }

            if (aggregates.Count == 0)
                return 0;

            // Load all posts and update
            var postsPage = _subRepo.List(postsFormId, pageSize: 10000);
            var posts = postsPage.Items ?? new List<SubmissionInfo>();
            int updatedCount = 0;

            foreach (var post in posts)
            {
                if (ct.IsCancellationRequested)
                    break;

                if (string.IsNullOrWhiteSpace(post.DataJson))
                    continue;

                try
                {
                    var data = JObject.Parse(post.DataJson);
                    var postUid = data["post_uid"]?.ToString();

                    if (string.IsNullOrWhiteSpace(postUid))
                        continue;

                    if (!aggregates.TryGetValue(postUid, out var analytics))
                        continue;

                    data["view_count"] = analytics.ViewCount;
                    data["unique_readers"] = analytics.UniqueReaders;
                    data["share_count"] = analytics.ShareCount;
                    data["like_count"] = analytics.LikeCount;
                    data["bookmark_count"] = analytics.BookmarkCount;
                    data["newsletter_clicks"] = analytics.NewsletterClicks;

                    _subRepo.UpdateData(post.SubmissionId, data.ToString(Formatting.None));
                    updatedCount++;
                }
                catch
                {
                    // Skip malformed posts
                }
            }

            return await Task.FromResult(updatedCount);
        }

        private class PostAnalytics
        {
            public int ViewCount { get; set; }
            public int UniqueReaders { get; set; }
            public int ShareCount { get; set; }
            public int LikeCount { get; set; }
            public int BookmarkCount { get; set; }
            public int NewsletterClicks { get; set; }
        }
    }
}
