using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services.TypedSubmission;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services.Blog
{
    public class BlogAnalyticsRollupService : IAnalyticsRollupService
    {
        private readonly ISubmissionRepository _subRepo;
        private readonly IPhase2Repository _phase2Repo;
        private readonly SubmissionDataResolver _dataResolver;
        private readonly TypedSubmissionResyncService _typedResync;
        private readonly IFormRepository _forms;

        public BlogAnalyticsRollupService(ISubmissionRepository subRepo, IPhase2Repository phase2Repo, SubmissionDataResolver dataResolver = null, TypedSubmissionResyncService typedResync = null, IFormRepository forms = null)
        {
            _subRepo = subRepo ?? throw new ArgumentNullException(nameof(subRepo));
            _phase2Repo = phase2Repo ?? throw new ArgumentNullException(nameof(phase2Repo));
            _dataResolver = dataResolver ?? new SubmissionDataResolver(null);
            _typedResync = typedResync;
            _forms = forms;
        }

        public async Task<int> RollupBlogAnalyticsAsync(int portalId, CancellationToken ct = default)
        {
            var app = _phase2Repo.GetAppDefinition(portalId, "blog-starter");
            if (app == null)
                return 0;

            // ResolveFormIdMap, not GetFormIdMap: a seeded app persists "Forms": [] and binds its
            // forms through AppScope instead, which used to make this service a silent no-op.
            var formIds = BlogManifestHelper.ResolveFormIdMap(app, _forms);
            if (!formIds.TryGetValue("posts", out var postsFormId) || postsFormId <= 0)
                return 0;
            if (!formIds.TryGetValue("reader-events", out var readerEventsFormId) || readerEventsFormId <= 0)
                return 0;
            int commentsFormId;
            if (!formIds.TryGetValue("comments", out commentsFormId) || commentsFormId <= 0)
                commentsFormId = 0;

            // Load all reader events
            var eventsPage = _subRepo.List(readerEventsFormId, pageSize: 10000);
            var events = eventsPage.Items ?? new List<SubmissionInfo>();

            var aggregates = new Dictionary<string, PostAnalytics>(StringComparer.OrdinalIgnoreCase);

            foreach (var evt in events)
            {
                if (ct.IsCancellationRequested)
                    break;

                var evtDataDict = _dataResolver.GetData(evt.SubmissionId, evt.DataJson);
                if (evtDataDict.Count == 0)
                    continue;

                try
                {
                    var data = JObject.Parse(JsonConvert.SerializeObject(evtDataDict));
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

            // ---- approved comments per post -------------------------------------------------
            // comment_count is what every card on the public list renders, and nothing was ever
            // computing it: the field kept whatever a seed wrote, so a post with real comments
            // still advertised "0 comments". Counted here from the comment child form itself, so
            // approving or un-approving a comment is reflected on the next rollup tick.
            // A uid present in the form but with no approved rows gets an explicit 0 — that is how
            // un-approving the last comment brings the number back down.
            var commentCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            if (commentsFormId > 0)
            {
                var commentsPage = _subRepo.List(commentsFormId, pageSize: 10000);
                foreach (var comment in commentsPage.Items ?? new List<SubmissionInfo>())
                {
                    if (ct.IsCancellationRequested)
                        break;

                    var commentData = _dataResolver.GetData(comment.SubmissionId, comment.DataJson);
                    if (commentData.Count == 0)
                        continue;

                    try
                    {
                        var parsed = JObject.Parse(JsonConvert.SerializeObject(commentData));
                        var commentPostUid = parsed["post_uid"]?.ToString();
                        if (string.IsNullOrWhiteSpace(commentPostUid))
                            continue;

                        commentPostUid = commentPostUid.Trim();
                        if (!commentCounts.ContainsKey(commentPostUid))
                            commentCounts[commentPostUid] = 0;

                        var moderation = (parsed["moderation_status"]?.ToString() ?? string.Empty).Trim();
                        if (string.Equals(moderation, "approved", StringComparison.OrdinalIgnoreCase))
                            commentCounts[commentPostUid]++;
                    }
                    catch
                    {
                        // Skip malformed comments
                    }
                }
            }

            if (aggregates.Count == 0 && commentCounts.Count == 0)
                return 0;

            // Load all posts and update
            var postsPage = _subRepo.List(postsFormId, pageSize: 10000);
            var posts = postsPage.Items ?? new List<SubmissionInfo>();
            int updatedCount = 0;

            foreach (var post in posts)
            {
                if (ct.IsCancellationRequested)
                    break;

                var postDataDict = _dataResolver.GetData(post.SubmissionId, post.DataJson);
                if (postDataDict.Count == 0)
                    continue;

                try
                {
                    var data = JObject.Parse(JsonConvert.SerializeObject(postDataDict));
                    var postUid = data["post_uid"]?.ToString();

                    if (string.IsNullOrWhiteSpace(postUid))
                        continue;

                    postUid = postUid.Trim();
                    PostAnalytics analytics;
                    var hasReaderEvents = aggregates.TryGetValue(postUid, out analytics);
                    int approvedComments;
                    var hasComments = commentCounts.TryGetValue(postUid, out approvedComments);

                    // A post nobody has read and nobody has commented on is left exactly as it is.
                    // Writing zeros over every untouched post would wipe seeded demo numbers on
                    // rows this rollup has no evidence about.
                    if (!hasReaderEvents && !hasComments)
                        continue;

                    if (hasReaderEvents)
                    {
                        data["view_count"] = analytics.ViewCount;
                        data["unique_readers"] = analytics.UniqueReaders;
                        data["share_count"] = analytics.ShareCount;
                        data["like_count"] = analytics.LikeCount;
                        data["bookmark_count"] = analytics.BookmarkCount;
                        data["newsletter_clicks"] = analytics.NewsletterClicks;
                    }

                    if (hasComments)
                        data["comment_count"] = approvedComments;

                    var updatedJson = data.ToString(Formatting.None);
                    _subRepo.UpdateData(post.SubmissionId, updatedJson);
                    _typedResync?.Resync(post.SubmissionId, post.FormId, updatedJson);
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
