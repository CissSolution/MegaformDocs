using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Components;

namespace MegaForm.Blogs.Client
{
    /// <summary>
    /// Shared read/format helpers for the Oqtane blog components. This is the twin of the
    /// duplicated @functions blocks in the DNN Razor Host scripts - Blazor lets the three
    /// screens share one copy, so keep behaviour identical to MegaForm.Blogs.DNN.
    /// Everything here reads typed values only; DataJson is never parsed.
    /// </summary>
    public static class BlogData
    {
        public const string AppKey = "blog-starter";
        public const string PostsQuery = "all-posts";
        public const string PublicQuery = "public-posts";
        public const string FeaturedQuery = "featured-posts";

        public static readonly string[] StatusOrder =
        {
            "draft", "in_review", "seo_review", "legal_review",
            "ready_to_publish", "scheduled", "published", "archived"
        };

        public static string Text(AppRecordDto record, string key, string fallback)
        {
            if (record?.Data == null || !record.Data.ContainsKey(key) || record.Data[key] == null)
                return fallback;
            var value = Convert.ToString(record.Data[key]);
            return string.IsNullOrWhiteSpace(value) ? fallback : value;
        }

        public static int Num(AppRecordDto record, string key)
        {
            return int.TryParse(Text(record, key, "0"), NumberStyles.Any, CultureInfo.InvariantCulture, out var value)
                ? value : 0;
        }

        public static string Initials(string name)
        {
            var parts = (name ?? "").Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0) return "MF";
            return string.Concat(parts.Take(2).Select(x => char.ToUpperInvariant(x[0])));
        }

        public static string Ago(DateTime utc)
        {
            var span = DateTime.UtcNow - utc;
            if (span.TotalMinutes < 1) return "just now";
            if (span.TotalMinutes < 60) return (int)span.TotalMinutes + "m ago";
            if (span.TotalHours < 24) return (int)span.TotalHours + "h ago";
            if (span.TotalDays < 30) return (int)span.TotalDays + "d ago";
            return utc.ToString("MMM d, yyyy", CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Parse a stored date value. Typed storage hands back either a DateTime or the string the
        /// author typed, so try the invariant round-trip shapes first and only then the current
        /// culture. Returns null when the value is not a date at all.
        /// </summary>
        public static DateTime? ParseDate(AppRecordDto record, string key)
        {
            var raw = Text(record, key, "");
            if (raw.Length == 0) return null;
            if (DateTime.TryParse(raw, CultureInfo.InvariantCulture,
                    DateTimeStyles.AdjustToUniversal | DateTimeStyles.AllowWhiteSpaces, out var invariant))
                return invariant;
            if (DateTime.TryParse(raw, CultureInfo.CurrentCulture, DateTimeStyles.AllowWhiteSpaces, out var current))
                return current;
            return null;
        }

        /// <summary>
        /// Human date for a post. A blog reads better relative ("3d ago"); a news desk needs the
        /// absolute dateline. Falls back to the raw stored string so a non-date value still shows
        /// something rather than vanishing.
        /// </summary>
        public static string DateLabel(AppRecordDto record, string key, bool relative)
        {
            var parsed = ParseDate(record, key);
            if (parsed == null) return Text(record, key, "");
            var value = parsed.Value;
            if (relative && value <= DateTime.UtcNow) return Ago(value);
            return value.ToString("MMM d, yyyy", CultureInfo.CurrentCulture);
        }

        /// <summary>The machine-readable value for a &lt;time datetime="…"&gt; attribute.</summary>
        public static string DateAttribute(AppRecordDto record, string key)
        {
            var parsed = ParseDate(record, key);
            return parsed == null
                ? ""
                : parsed.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        public static string Compact(int value)
        {
            if (value >= 1000000) return (value / 1000000d).ToString("0.#", CultureInfo.InvariantCulture) + "M";
            if (value >= 1000) return (value / 1000d).ToString("0.#", CultureInfo.InvariantCulture) + "k";
            return value.ToString(CultureInfo.InvariantCulture);
        }

        public static string StatusKey(AppRecordDto record)
        {
            var value = Text(record, "status", "draft").Trim().ToLowerInvariant().Replace(' ', '_');
            return StatusOrder.Contains(value) ? value : "draft";
        }

        public static string StatusLabel(string status)
        {
            switch ((status ?? "").ToLowerInvariant())
            {
                case "published": return "Published";
                case "in_review": return "Editorial";
                case "seo_review": return "SEO Check";
                case "legal_review": return "Legal";
                case "ready_to_publish": return "Ready";
                case "scheduled": return "Scheduled";
                case "archived": return "Archived";
                default: return "Draft";
            }
        }

        public static string ColumnLabel(string status)
        {
            switch (status)
            {
                case "in_review": return "Editorial Review";
                case "seo_review": return "SEO Check";
                case "legal_review": return "Legal Review";
                case "ready_to_publish": return "Ready to Publish";
                default: return StatusLabel(status);
            }
        }

        public static string ColumnColor(string status)
        {
            switch (status)
            {
                case "draft": return "#62748e";
                case "in_review": return "#fe9a00";
                case "seo_review": return "#2b7fff";
                case "legal_review": return "#ad46ff";
                case "ready_to_publish": return "#00bc7d";
                case "scheduled": return "#00b8db";
                case "published": return "#00c950";
                default: return "#a8a29e";
            }
        }

        public static string PriorityClass(AppRecordDto record)
        {
            switch (Text(record, "editorial_priority", "Normal").Trim().ToLowerInvariant())
            {
                case "launch critical":
                case "high": return "mfba-p-high";
                case "low": return "mfba-p-low";
                default: return "mfba-p-medium";
            }
        }

        public static string ModerationKey(AppRecordDto record)
        {
            var value = Text(record, "moderation_status", "pending").Trim().ToLowerInvariant();
            var known = new[] { "pending", "approved", "spam", "hidden" };
            return known.Contains(value) ? value : "pending";
        }

        public static string ModerationLabel(string key)
        {
            switch (key)
            {
                case "approved": return "Approved";
                case "spam": return "Spam";
                case "hidden": return "Trash";
                default: return "Pending";
            }
        }

        /// <summary>
        /// The persisted app manifest does not carry form bindings on every install (a seeded
        /// blog-starter can ship an empty Forms list), so fall back to identifying the comment
        /// child form by its schema shape rather than by a title string.
        /// </summary>
        public static async Task<int> ResolveCommentsFormIdAsync(
            IMegaFormClient client, MegaFormScope scope, string appKey = AppKey)
        {
            var app = await client.Apps.GetAppAsync(
                string.IsNullOrWhiteSpace(appKey) ? AppKey : appKey, scope);
            if (app?.Forms != null)
            {
                var bound = app.Forms.FirstOrDefault(f =>
                    string.Equals(f.Alias, "comments", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(f.Role, "comments", StringComparison.OrdinalIgnoreCase));
                if (bound != null && bound.FormId > 0) return bound.FormId;
            }

            var forms = await client.Forms.ListFormsAsync(new FormQuery { Page = 1, PageSize = 200 }, scope);
            if (forms?.Items == null) return 0;

            var ordered = forms.Items
                .OrderByDescending(f => (f.Title ?? "").IndexOf("comment", StringComparison.OrdinalIgnoreCase) >= 0)
                .ToList();
            foreach (var form in ordered)
            {
                var candidate = form;
                if (string.IsNullOrWhiteSpace(candidate.SchemaJson))
                    candidate = await client.Forms.GetFormAsync(form.FormId, scope) ?? form;
                if (string.IsNullOrWhiteSpace(candidate.SchemaJson)) continue;

                var keys = client.Schema.ParseForm(candidate).Fields.Select(x => x.Key ?? "").ToList();
                if (keys.Contains("comment_body", StringComparer.OrdinalIgnoreCase)
                    && keys.Contains("post_slug", StringComparer.OrdinalIgnoreCase)
                    && keys.Contains("moderation_status", StringComparer.OrdinalIgnoreCase))
                    return candidate.FormId;
            }
            return 0;
        }

        /// <summary>
        /// The identity a post gets when the server-generated one is missing or already taken.
        ///
        /// 🔴 The "S" is load-bearing. Seeded posts use POST-01001..POST-01024 — a zero-padded
        /// NUMBER — so a bare "POST-" + submissionId would collide with a seeded post the day a
        /// site reaches submission 1001. A submission id is unique per portal forever, so this is.
        /// </summary>
        public static string DerivePostUid(int submissionId)
            => "POST-S" + submissionId.ToString(CultureInfo.InvariantCulture);

        /// <summary>
        /// True when another post already carries this post_uid.
        ///
        /// Why it matters: post_uid is the join key the whole blog app hangs off.
        /// BlogAnalyticsRollupService groups reader-events by it and writes the totals back to
        /// EVERY post carrying that value, so a duplicate makes several posts report one another's
        /// read counts. Measured on :5131: POST-01001 was shared by a seeded post and all four
        /// posts created through the console, so one article's reads landed on five articles.
        /// </summary>
        public static async Task<bool> IsPostUidTakenByAnotherAsync(
            IMegaFormClient client, MegaFormScope scope, string appKey, string postUid, int submissionId)
        {
            if (client == null || string.IsNullOrWhiteSpace(postUid)) return false;

            var request = new AppQueryRequest { Page = 1, PageSize = 5 };
            request.Parameters["post_uid"] = postUid.Trim();
            var existing = await client.Queries.ExecuteAsync(
                string.IsNullOrWhiteSpace(appKey) ? AppKey : appKey, PostsQuery, request, scope);

            var items = existing?.Items;
            if (items == null || items.Count == 0) return false;
            return items.Any(r => r.SubmissionId != submissionId);
        }

        /// <summary>Lucide icon paths, inlined so the module ships no icon font and no CDN.</summary>
        public static MarkupString Icon(string name, string cssClass = "mfba-icon")
        {
            string body;
            switch (name)
            {
                case "chevron-right": body = "<path d='m9 18 6-6-6-6'/>"; break;
                case "plus": body = "<path d='M5 12h14'/><path d='M12 5v14'/>"; break;
                case "search": body = "<circle cx='11' cy='11' r='8'/><path d='m21 21-4.3-4.3'/>"; break;
                case "trending-up": body = "<polyline points='22 7 13.5 15.5 8.5 10.5 2 17'/><polyline points='16 7 22 7 22 13'/>"; break;
                case "trending-down": body = "<polyline points='22 17 13.5 8.5 8.5 13.5 2 7'/><polyline points='16 17 22 17 22 11'/>"; break;
                case "eye": body = "<path d='M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0'/><circle cx='12' cy='12' r='3'/>"; break;
                case "message-circle": body = "<path d='M7.9 20A9 9 0 1 0 4 16.1L2 22Z'/>"; break;
                case "file-text": body = "<path d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'/><path d='M14 2v4a2 2 0 0 0 2 2h4'/><path d='M16 13H8'/><path d='M16 17H8'/><path d='M10 9H8'/>"; break;
                case "users": body = "<path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M22 21v-2a4 4 0 0 0-3-3.87'/><path d='M16 3.13a4 4 0 0 1 0 7.75'/>"; break;
                case "bar-chart": body = "<line x1='18' x2='18' y1='20' y2='10'/><line x1='12' x2='12' y1='20' y2='4'/><line x1='6' x2='6' y1='20' y2='14'/>"; break;
                case "settings": body = "<path d='M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'/><circle cx='12' cy='12' r='3'/>"; break;
                case "bell": body = "<path d='M10.27 21a2 2 0 0 0 3.46 0'/><path d='M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33'/>"; break;
                case "flame": body = "<path d='M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z'/>"; break;
                case "calendar": body = "<path d='M8 2v4'/><path d='M16 2v4'/><rect width='18' height='18' x='3' y='4' rx='2'/><path d='M3 10h18'/>"; break;
                case "clock": body = "<circle cx='12' cy='12' r='10'/><polyline points='12 6 12 12 16 14'/>"; break;
                case "pencil": body = "<path d='M21.17 6.81a1 1 0 0 0-3.98-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.63l4.35-1.33a2 2 0 0 0 .83-.5z'/>"; break;
                case "trash": body = "<path d='M3 6h18'/><path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'/><path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'/>"; break;
                case "check-circle": body = "<circle cx='12' cy='12' r='10'/><path d='m9 12 2 2 4-4'/>"; break;
                case "check": body = "<path d='M20 6 9 17l-5-5'/>"; break;
                case "x": body = "<path d='M18 6 6 18'/><path d='m6 6 12 12'/>"; break;
                case "ban": body = "<circle cx='12' cy='12' r='10'/><path d='m4.9 4.9 14.2 14.2'/>"; break;
                case "flag": body = "<path d='M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z'/><line x1='4' x2='4' y1='22' y2='15'/>"; break;
                case "arrow-right": body = "<path d='M5 12h14'/><path d='m12 5 7 7-7 7'/>"; break;
                case "activity": body = "<path d='M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2'/>"; break;
                case "book-open": body = "<path d='M12 7v14'/><path d='M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'/>"; break;
                case "tag": body = "<path d='M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z'/><circle cx='7.5' cy='7.5' r='.75' fill='currentColor'/>"; break;
                case "layout": body = "<rect width='18' height='18' x='3' y='3' rx='2'/><path d='M3 9h18'/><path d='M9 21V9'/>"; break;
                case "shield": body = "<path d='M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'/>"; break;
                case "rss": body = "<path d='M4 11a9 9 0 0 1 9 9'/><path d='M4 4a16 16 0 0 1 16 16'/><circle cx='5' cy='19' r='1'/>"; break;
                case "grip": body = "<circle cx='9' cy='12' r='1'/><circle cx='9' cy='5' r='1'/><circle cx='9' cy='19' r='1'/><circle cx='15' cy='12' r='1'/><circle cx='15' cy='5' r='1'/><circle cx='15' cy='19' r='1'/>"; break;
                case "thumbs-up": body = "<path d='M7 10v12'/><path d='M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z'/>"; break;
                case "alert": body = "<path d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'/><path d='M12 9v4'/><path d='M12 17h.01'/>"; break;
                default: body = ""; break;
            }
            return new MarkupString("<svg class=\"" + cssClass + "\" viewBox=\"0 0 24 24\" aria-hidden=\"true\">" + body + "</svg>");
        }
    }
}
