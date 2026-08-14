using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using MegaForm.Sdk;

namespace MegaForm.Blogs.Client
{
    /// <summary>
    /// The URL state a blog surface reads. Parsed once per render so no component has to
    /// hand-roll query-string handling (three copies of that had already drifted).
    /// </summary>
    public sealed class BlogUrlState
    {
        public string Slug { get; set; } = "";
        public string Category { get; set; } = "";
        public string Tag { get; set; } = "";
        public string Author { get; set; } = "";
        public string Search { get; set; } = "";
        public int Page { get; set; } = 1;

        /// <summary>
        /// Read the recognised keys out of a full URI. Values are length-capped: they end up in
        /// equality filters and in rel="canonical"-style links, and an unbounded query value is
        /// just free memory for an anonymous caller.
        /// </summary>
        public static BlogUrlState Parse(string uri, BlogInstanceConfig config)
        {
            var state = new BlogUrlState();
            var slugParam = config?.SlugParam ?? "slug";

            state.Slug = Read(uri, slugParam, 200);
            state.Category = Read(uri, "category", 128);
            state.Tag = Read(uri, "tag", 128);
            state.Author = Read(uri, "author", 128);
            state.Search = Read(uri, "q", 128);

            var page = Read(uri, "page", 8);
            state.Page = int.TryParse(page, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
                ? Math.Max(1, parsed)
                : 1;
            return state;
        }

        /// <summary>
        /// Read a positive record id from the query string. Anything else — absent, negative,
        /// not a number, padded past a plausible length — reads as 0, which every caller treats
        /// as "no record selected" rather than as record zero.
        /// </summary>
        public static int ReadId(string uri, string key)
        {
            var raw = Read(uri, key, 12);
            if (raw.Length == 0) return 0;
            return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id) && id > 0
                ? id : 0;
        }

        public static string Read(string uri, string key, int maxLength)
        {
            if (string.IsNullOrEmpty(uri) || string.IsNullOrEmpty(key)) return "";
            var index = uri.IndexOf('?');
            if (index < 0) return "";
            foreach (var part in uri.Substring(index + 1)
                         .Split(new[] { '&' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var pair = part.Split(new[] { '=' }, 2);
                if (pair.Length != 2) continue;
                if (!pair[0].Equals(key, StringComparison.OrdinalIgnoreCase)) continue;
                string value;
                try { value = Uri.UnescapeDataString(pair[1]); }
                catch (UriFormatException) { return ""; }
                value = value.Trim();
                return value.Length > maxLength ? value.Substring(0, maxLength) : value;
            }
            return "";
        }
    }

    /// <summary>
    /// Turns (Mode, settings, URL) into exactly one named query plus one AppQueryRequest.
    ///
    /// This is the single place the equality-filter guard lives: a parameter is added ONLY when
    /// both the field and the value are non-empty after Trim. That matters because
    /// AppRecordQueryService.Matches returns false for a record that has no such field, so an
    /// empty filter value does not mean "no filter" — it silently empties the listing.
    /// </summary>
    public sealed class BlogQueryPlan
    {
        public string QueryKey { get; private set; } = "public-posts";
        public AppQueryRequest Request { get; private set; } = new AppQueryRequest();

        /// <summary>True when this surface is showing one post rather than a list.</summary>
        public bool IsDetail { get; private set; }

        /// <summary>Detail mode with no slug supplied — render not-found, do not query.</summary>
        public bool DetailWithoutSlug { get; private set; }

        /// <summary>
        /// The narrowing filter worth showing the reader (a category, tag or author) — as opposed to
        /// the profile's own content_type, which is structural and not news to anyone.
        /// </summary>
        public string FilterField { get; private set; } = "";
        public string FilterValue { get; private set; } = "";

        /// <summary>Every filter applied, including the structural ones. For diagnostics.</summary>
        public IReadOnlyDictionary<string, string> AppliedFilters => _applied;

        private readonly Dictionary<string, string> _applied =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        public string Search { get; private set; } = "";
        public int Page { get; private set; } = 1;

        public bool HasFilter => FilterField.Length > 0 && FilterValue.Length > 0;

        /// <summary>
        /// Add one equality filter. THE GUARD lives here: a parameter is written only when both the
        /// field and the value survive Trim, and only for a whitelisted field. An empty value is
        /// NOT "no filter" — AppRecordQueryService.Matches returns false for a record with no such
        /// field, so an empty value silently empties the listing.
        /// </summary>
        private void Apply(AppQueryRequest request, string field, string value, bool primary)
        {
            if (field == null || value == null) return;
            if (field.Length == 0 || value.Length == 0) return;
            if (!BlogInstanceConfig.FilterFields.Contains(field)) return;

            request.Parameters[field] = value;
            _applied[field] = value;

            if (primary)
            {
                FilterField = field;
                FilterValue = value;
            }
        }

        public static BlogQueryPlan Build(BlogInstanceConfig config, BlogUrlState url)
        {
            config = config ?? new BlogInstanceConfig();
            url = url ?? new BlogUrlState();

            var plan = new BlogQueryPlan
            {
                QueryKey = config.EffectiveQueryKey(),
                Page = Math.Max(1, url.Page),
                Search = Clean(url.Search)
            };

            // A "detail" instance always shows one post. A LIST instance shows one too when a slug
            // is present and no separate detail page is configured - that is what DetailPageId = 0
            // ("self-detail") means, and it is how a single instance serves both surfaces. Without
            // this, every card on a self-detail listing would link back to the listing.
            var slugPresent = Clean(url.Slug).Length > 0;
            plan.IsDetail = config.Mode == "detail"
                            || (slugPresent && config.DetailPageId == 0 && config.Mode != "featured"
                                && config.Mode != "console");

            var request = new AppQueryRequest
            {
                Page = plan.Page,
                PageSize = Math.Max(1, Math.Min(BlogInstanceConfig.MaxPageSize, config.PageSize))
            };

            if (plan.IsDetail)
            {
                // Look the post up by slug against the plain published feed. The listing's own
                // query must not be reused here: popular-home-posts, for instance, also requires
                // is_featured = false, which would hide the very post that was asked for.
                if (string.IsNullOrWhiteSpace(config.QueryKey)) plan.QueryKey = "public-posts";

                var slug = Clean(url.Slug);
                if (slug.Length == 0)
                {
                    plan.DetailWithoutSlug = true;
                    plan.Request = request;
                    return plan;
                }
                request.Page = 1;
                request.PageSize = 1;
                request.Parameters["slug"] = slug;
                plan.Request = request;
                return plan;
            }

            // ---- resolve the effective filters -----------------------------------------------
            // Parameters is a dictionary and ApplyParameters loops every pair, so filters COMPOSE.
            // That is what lets one instance be "News, in the Product category": the profile
            // contributes content_type and the page contributes category, as two parameters.
            //
            // Precedence, weakest first: profile implication -> pinned setting -> URL. The URL may
            // only write whitelisted fields, so a crafted query string cannot probe arbitrary
            // typed fields, and it is ignored entirely when the instance is locked.

            // 1. A News instance means News content. Documented in the settings pane; an explicit
            //    content_type filter below overrides it rather than fighting it.
            if (config.IsNews) plan.Apply(request, "content_type", "News", primary: false);

            // 2. The pinned filter for this instance.
            plan.Apply(request, Clean(config.FilterField), Clean(config.FilterValue), primary: true);

            // 3. The URL, when this instance is not locked.
            if (config.AllowUrlFilter)
            {
                plan.Apply(request, "category", Clean(url.Category), primary: true);
                plan.Apply(request, "tags", Clean(url.Tag), primary: true);
                plan.Apply(request, "author_name", Clean(url.Author), primary: true);
            }

            if (plan.Search.Length > 0) request.Search = plan.Search;

            plan.Request = request;
            return plan;
        }

        /// <summary>The request for the hero/featured strip that sits above a listing.</summary>
        public static AppQueryRequest FeaturedRequest()
            => new AppQueryRequest { Page = 1, PageSize = 1 };

        public int TotalPages(int totalCount)
        {
            var size = Math.Max(1, Request?.PageSize ?? 1);
            if (totalCount <= 0) return 1;
            return (int)Math.Ceiling(totalCount / (double)size);
        }

        private static string Clean(string value)
            => (value ?? "").Trim();
    }
}
