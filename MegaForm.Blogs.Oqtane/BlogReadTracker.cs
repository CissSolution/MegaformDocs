using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using MegaForm.Sdk;

namespace MegaForm.Blogs.Client
{
    /// <summary>
    /// Records that a post was read.
    ///
    /// WHAT THIS DOES NOT DO, AND WHY. It does not increment <c>view_count</c>. That field is not
    /// ours to add up: <c>MegaForm.Core.Services.Blog.BlogAnalyticsRollupService</c> already
    /// **assigns** <c>view_count</c>, <c>unique_readers</c>, <c>share_count</c>, <c>like_count</c>,
    /// <c>bookmark_count</c> and <c>newsletter_clicks</c> to every post by counting rows in the
    /// <c>reader-events</c> form and grouping them on <c>post_uid</c> — and it is already scheduled
    /// on all four hosts (Oqtane Startup, DnnServiceLocator, Umbraco composer, Web Program).
    /// So the counter was never missing. The only thing missing was anybody writing the events.
    ///
    /// Writing an event instead of incrementing a number also removes the whole class of bugs an
    /// increment would have had:
    ///  - no lost update. Two concurrent readers append two rows; a read-modify-write through
    ///    PatchRecordAsync would have had them both read N and both write N+1.
    ///  - no collateral damage. PatchRecordAsync rewrites a record's ENTIRE typed field set; an
    ///    append cannot corrupt the post it is counting.
    ///  - self-healing. The rollup assigns absolute counts, so a duplicated or lost event is
    ///    corrected on the next pass rather than being baked in forever.
    ///
    /// The event contract is fixed by the rollup, not by us:
    ///   post_uid    — the join key. A post with no post_uid can never be counted (the rollup
    ///                 skips it), which is why callers must not bother calling for one.
    ///   event_type  — must be one of read | unique_reader | share | like | bookmark |
    ///                 newsletter_click. Only "read" is emitted here; see the note on
    ///                 unique_readers at the bottom of this file.
    ///
    /// ⭐ The DNN twin of this logic lives in MegaForm.Blogs.DNN/Scripts/MegaFormBlogs.cshtml's
    /// @functions block. Keep the two in step — the whole point is that a read counts the same on
    /// both platforms.
    /// </summary>
    public static class BlogReadTracker
    {
        public const string ReaderEventsAlias = "reader-events";
        public const string EventTypeRead = "read";

        /// <summary>
        /// How long one visitor's view of one post is remembered, so a refresh is not a new read.
        ///
        /// This also absorbs a platform detail that would otherwise DOUBLE every count: the Blogs
        /// module does not override ModuleBase.RenderMode, so it runs Interactive even on a site
        /// configured Static — which means the component renders twice for one visit (prerender,
        /// then again when the circuit connects) and OnParametersSetAsync runs twice.
        /// </summary>
        public static readonly TimeSpan DedupeWindow = TimeSpan.FromMinutes(30);

        /// <summary>
        /// A hard cap on the dedupe cache. It is a rate limiter, never a correctness mechanism —
        /// it is per-process and an app-pool recycle or an Oqtane restart empties it. Bounded so a
        /// stream of unique anonymous visitors cannot turn read tracking into a memory leak.
        /// </summary>
        private const int MaxTrackedEntries = 20000;

        private static readonly ConcurrentDictionary<string, DateTime> Seen =
            new ConcurrentDictionary<string, DateTime>(StringComparer.Ordinal);

        private static readonly ConcurrentDictionary<string, int> FormIdCache =
            new ConcurrentDictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        /// <summary>
        /// Substrings that identify a client we must not count. Crawlers, previewers and uptime
        /// monitors fetch a page without a person reading it, and a blog whose numbers are mostly
        /// robots is worse than a blog with no numbers.
        /// </summary>
        private static readonly string[] BotMarkers =
        {
            "bot", "crawl", "spider", "slurp", "curl", "wget", "python-requests", "httpclient",
            "headlesschrome", "phantomjs", "lighthouse", "pingdom", "uptime", "monitor",
            "facebookexternalhit", "embedly", "preview", "scrapy", "postman", "insomnia",
            "go-http-client", "java/", "okhttp", "libwww", "feedfetcher", "rss"
        };

        /// <summary>
        /// Record one read. Returns true when an event was written.
        ///
        /// Every failure path returns false rather than throwing: a page must never fail to render
        /// because analytics did. The caller is expected to wrap this in its own try/catch anyway
        /// and to keep it out of the branch that sets the page's error state.
        /// </summary>
        public static async Task<bool> TrackReadAsync(
            IMegaFormClient client,
            MegaFormScope scope,
            string appKey,
            string postUid,
            string postSlug,
            string visitorKey,
            int userId,
            string referrer,
            string userAgent)
        {
            if (client == null) return false;
            if (string.IsNullOrWhiteSpace(postUid)) return false;      // unattributable — see class note

            // A NULL user agent means "the caller has no user agent to judge, and has already
            // established this is a real browser" — that is the Oqtane path, where the visitor id
            // came back from a JavaScript call a crawler could never have made. An EMPTY string
            // means "a request arrived with no user agent", which is not a browser: DNN passes the
            // header through verbatim, so empty stays a rejection.
            if (userAgent != null && IsBot(userAgent)) return false;

            var key = postUid.Trim() + "|" + (string.IsNullOrWhiteSpace(visitorKey) ? "anon" : visitorKey);
            if (!ClaimFirstView(key)) return false;

            try
            {
                var formId = await ResolveReaderEventsFormIdAsync(client, scope, appKey);
                if (formId <= 0) return false;

                var data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
                {
                    ["post_uid"] = postUid.Trim(),
                    ["post_slug"] = Clip(postSlug, 200),
                    ["event_type"] = EventTypeRead,
                    ["event_date"] = DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
                };

                // Optional columns. Only send what we actually have: an empty required-looking
                // value is worse than an absent one.
                if (!string.IsNullOrWhiteSpace(visitorKey)) data["visitor_key"] = Clip(visitorKey, 64);
                if (userId > 0) data["cms_user_id"] = userId;
                if (!string.IsNullOrWhiteSpace(referrer)) data["referrer"] = Clip(referrer, 400);

                var result = await client.Submissions.SubmitAsync(formId, data, scope);
                if (result != null && result.Success) return true;

                // The write did not land, so let this visitor be counted again rather than
                // silently losing the read for the whole dedupe window.
                DateTime ignored;
                Seen.TryRemove(key, out ignored);
                return false;
            }
            catch (Exception)
            {
                DateTime ignored;
                Seen.TryRemove(key, out ignored);
                return false;
            }
        }

        /// <summary>
        /// True when this (post, visitor) pair has not been seen inside the dedupe window, and
        /// claims it. Atomic on purpose: two concurrent renders of the same page — which is
        /// exactly what prerender + circuit connect produces — must not both win.
        /// </summary>
        private static bool ClaimFirstView(string key)
        {
            var now = DateTime.UtcNow;

            DateTime previous;
            if (Seen.TryGetValue(key, out previous) && now - previous < DedupeWindow)
                return false;

            var claimed = Seen.AddOrUpdate(
                key,
                now,
                (_, existing) => now - existing < DedupeWindow ? existing : now);

            if (claimed != now) return false;

            if (Seen.Count > MaxTrackedEntries) Prune(now);
            return true;
        }

        private static void Prune(DateTime now)
        {
            foreach (var pair in Seen.ToArray())
            {
                if (now - pair.Value >= DedupeWindow)
                {
                    DateTime ignored;
                    Seen.TryRemove(pair.Key, out ignored);
                }
            }

            // Still over the cap after dropping everything expired: the window is longer than the
            // traffic allows. Drop the oldest half rather than grow without bound.
            if (Seen.Count > MaxTrackedEntries)
            {
                foreach (var pair in Seen.ToArray().OrderBy(p => p.Value).Take(MaxTrackedEntries / 2))
                {
                    DateTime ignored;
                    Seen.TryRemove(pair.Key, out ignored);
                }
            }
        }

        /// <summary>
        /// A stable, non-reversible identifier for one visitor.
        ///
        /// A signed-in user is identified by their id, which is already ours. Everyone else is
        /// identified by a SHA-256 of IP + user agent + a per-portal salt, truncated to 32 hex
        /// characters. The raw IP is never stored, the hash cannot be reversed to one, and the
        /// portal salt stops the same visitor being correlated across sites. It exists to answer
        /// "is this the same reader refreshing?" and nothing else.
        /// </summary>
        public static string VisitorKey(int userId, string ipAddress, string userAgent, int portalId)
        {
            if (userId > 0) return "u" + userId.ToString(CultureInfo.InvariantCulture);

            var material = (ipAddress ?? "") + "|" + (userAgent ?? "") + "|mfb-salt|" +
                           portalId.ToString(CultureInfo.InvariantCulture);
            using (var sha = SHA256.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(material));
                var builder = new StringBuilder(32);
                for (var i = 0; i < 16; i++) builder.Append(bytes[i].ToString("x2", CultureInfo.InvariantCulture));
                return builder.ToString();
            }
        }

        public static bool IsBot(string userAgent)
        {
            if (string.IsNullOrWhiteSpace(userAgent)) return true;   // no UA at all: not a browser
            var agent = userAgent.ToLowerInvariant();
            return BotMarkers.Any(marker => agent.IndexOf(marker, StringComparison.Ordinal) >= 0);
        }

        /// <summary>
        /// The reader-events form for this app. Resolved by alias first, then — because a seeded
        /// manifest can ship an empty Forms list, which is why BlogData.ResolveCommentsFormIdAsync
        /// exists in the same shape — by the schema's own fingerprint.
        /// </summary>
        public static async Task<int> ResolveReaderEventsFormIdAsync(
            IMegaFormClient client, MegaFormScope scope, string appKey)
        {
            var key = (string.IsNullOrWhiteSpace(appKey) ? BlogData.AppKey : appKey) +
                      "|" + (scope?.PortalId ?? 0).ToString(CultureInfo.InvariantCulture);

            int cached;
            if (FormIdCache.TryGetValue(key, out cached) && cached > 0) return cached;

            var resolved = 0;
            var app = await client.Apps.GetAppAsync(
                string.IsNullOrWhiteSpace(appKey) ? BlogData.AppKey : appKey, scope);
            if (app?.Forms != null)
            {
                var bound = app.Forms.FirstOrDefault(f =>
                    string.Equals(f.Alias, ReaderEventsAlias, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(f.Role, ReaderEventsAlias, StringComparison.OrdinalIgnoreCase));
                if (bound != null && bound.FormId > 0) resolved = bound.FormId;
            }

            if (resolved <= 0)
            {
                var forms = await client.Forms.ListFormsAsync(
                    new FormQuery { Page = 1, PageSize = 200 }, scope);
                if (forms?.Items != null)
                {
                    var ordered = forms.Items
                        .OrderByDescending(f => (f.Title ?? "").IndexOf("reader", StringComparison.OrdinalIgnoreCase) >= 0)
                        .ToList();
                    foreach (var form in ordered)
                    {
                        var candidate = form;
                        if (string.IsNullOrWhiteSpace(candidate.SchemaJson))
                            candidate = await client.Forms.GetFormAsync(form.FormId, scope) ?? form;
                        if (string.IsNullOrWhiteSpace(candidate.SchemaJson)) continue;

                        var keys = client.Schema.ParseForm(candidate).Fields
                            .Select(x => x.Key ?? "").ToList();
                        if (keys.Contains("event_type", StringComparer.OrdinalIgnoreCase)
                            && keys.Contains("post_uid", StringComparer.OrdinalIgnoreCase)
                            && keys.Contains("visitor_key", StringComparer.OrdinalIgnoreCase))
                        {
                            resolved = candidate.FormId;
                            break;
                        }
                    }
                }
            }

            if (resolved > 0) FormIdCache[key] = resolved;
            return resolved;
        }

        private static string Clip(string value, int max)
        {
            var text = (value ?? "").Trim();
            if (text.Length == 0) return "";
            return text.Length > max ? text.Substring(0, max) : text;
        }

        // ---- on unique_readers -------------------------------------------------------------
        //
        // The rollup also counts `unique_reader` events into the post's unique_readers field, and
        // this class deliberately does NOT emit them. A truthful "unique reader" needs durable
        // per-visitor state — a cookie or a stored visitor row — because the dedupe cache above is
        // per-process and an app-pool recycle would make the same person unique again. Emitting one
        // on the same condition as `read` would simply make unique_readers a second, identical copy
        // of view_count, which is worse than leaving it alone. visitor_key IS written on every
        // event, so unique readers can be computed properly later from data we are already keeping.
    }
}
