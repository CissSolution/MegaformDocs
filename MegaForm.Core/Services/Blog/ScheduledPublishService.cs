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
    public class ScheduledPublishService : IScheduledPublishService
    {
        private readonly ISubmissionRepository _subRepo;
        private readonly IPhase2Repository _phase2Repo;
        private readonly SubmissionDataResolver _dataResolver;
        private readonly IFormRepository _forms;

        public ScheduledPublishService(ISubmissionRepository subRepo, IPhase2Repository phase2Repo, SubmissionDataResolver dataResolver = null, IFormRepository forms = null)
        {
            _subRepo = subRepo ?? throw new ArgumentNullException(nameof(subRepo));
            _phase2Repo = phase2Repo ?? throw new ArgumentNullException(nameof(phase2Repo));
            _dataResolver = dataResolver ?? new SubmissionDataResolver(null);
            _forms = forms;
        }

        public async Task<int> ProcessScheduledPostsAsync(int portalId, CancellationToken ct = default)
        {
            var app = _phase2Repo.GetAppDefinition(portalId, "blog-starter");
            if (app == null)
                return 0;

            // ResolveFormIdMap: the persisted manifest can carry no form binding at all
            // (see BlogManifestHelper). Without the fallback a scheduled post never publishes.
            int postsFormId;
            if (!BlogManifestHelper.ResolveFormIdMap(app, _forms).TryGetValue("posts", out postsFormId)
                || postsFormId <= 0)
                return 0;

            var page = _subRepo.List(postsFormId, status: "scheduled", pageSize: 10000);
            var scheduledPosts = page.Items ?? new List<SubmissionInfo>();
            int publishedCount = 0;
            var now = DateTime.UtcNow;

            foreach (var post in scheduledPosts)
            {
                if (ct.IsCancellationRequested)
                    break;

                var dataDict = _dataResolver.GetData(post.SubmissionId, post.DataJson);
                if (dataDict.Count == 0)
                    continue;

                try
                {
                    var data = JObject.Parse(JsonConvert.SerializeObject(dataDict));
                    var publishDateToken = data["publish_date"];
                    var embargoUntilToken = data["embargo_until"];

                    DateTime? publishDate = ParseDateTime(publishDateToken);
                    DateTime? embargoUntil = ParseDateTime(embargoUntilToken);

                    bool shouldPublish = publishDate.HasValue
                        && publishDate.Value <= now
                        && (!embargoUntil.HasValue || embargoUntil.Value <= now);

                    if (shouldPublish)
                    {
                        _subRepo.UpdateStatus(post.SubmissionId, "published");
                        publishedCount++;
                    }
                }
                catch
                {
                    // Skip malformed submissions
                }
            }

            return await Task.FromResult(publishedCount);
        }

        private static DateTime? ParseDateTime(JToken token)
        {
            if (token == null || token.Type == JTokenType.Null)
                return null;

            if (token.Type == JTokenType.Date)
                return token.Value<DateTime>().ToUniversalTime();

            if (DateTime.TryParse(token.ToString(), out var dt))
                return dt.ToUniversalTime();

            return null;
        }
    }
}
