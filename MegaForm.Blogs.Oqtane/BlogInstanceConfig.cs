using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace MegaForm.Blogs.Client
{
    /// <summary>
    /// Per-instance configuration for the MegaForm Blogs module, read from and written to Oqtane
    /// module settings under the <c>MegaFormBlogs:</c> prefix.
    ///
    /// This is what makes ONE module definition able to be a blog listing, a news desk, a post
    /// detail page, a category or author page, an archive, a hero strip, or the editorial console.
    ///
    /// Rules this type enforces, deliberately, on BOTH read and save:
    ///  - every enumerated value is whitelisted and unknown input FAILS CLOSED to the default
    ///    (same shape as MegaForm's own NormalizeModuleRole);
    ///  - integers are clamped to the ranges the engine actually supports
    ///    (AppRecordQueryService.MaxPageSize = 100);
    ///  - free text that reaches markup is sanitised here, not at the call site;
    ///  - a URL setting may never carry a javascript:/data: scheme.
    ///
    /// Nothing here talks to Oqtane services, so Settings/Index/Edit can all share one copy.
    /// </summary>
    public sealed class BlogInstanceConfig
    {
        public const string Prefix = "MegaFormBlogs:";

        // ---- whitelists ---------------------------------------------------------------------

        /// <summary>Which surface this instance renders.</summary>
        public static readonly string[] Modes =
        {
            "listing", "detail", "category", "author", "archive", "featured", "console"
        };

        /// <summary>Which editorial preset: a blog or a news desk.</summary>
        public static readonly string[] Profiles = { "blog", "news" };

        public static readonly string[] Layouts = { "grid", "list", "magazine", "compact" };

        public static readonly string[] ThemeVariants = { "default", "dark", "brand" };

        /// <summary>
        /// Fields an instance may be pinned to. Restricted on purpose: the value becomes an
        /// equality filter over typed data, so an arbitrary field name is a data-shape probe.
        /// </summary>
        public static readonly string[] FilterFields =
        {
            "category", "tags", "author_name", "author_email", "content_type", "audience"
        };

        public static readonly string[] SlugSources = { "query", "urlparameters" };

        /// <summary>Screens that may be chosen as an instance's DEFAULT console view.</summary>
        public static readonly string[] ConsoleViews = { "dashboard", "editorial", "comments" };

        /// <summary>
        /// Screens reachable by <c>?view=</c>. Wider than <see cref="ConsoleViews"/> because "new"
        /// and "edit" are actions you navigate to, not sensible landing screens — "edit" in
        /// particular is meaningless without an <c>?id=</c> beside it.
        /// </summary>
        public static readonly string[] ConsoleRoutes = { "dashboard", "editorial", "comments", "new", "edit" };

        public const string DefaultAppKey = "blog-starter";
        public const string DefaultFeaturedQueryKey = "featured-posts";
        public const int DefaultPageSize = 12;
        public const int MaxPageSize = 100;   // AppRecordQueryService.MaxPageSize

        /// <summary>
        /// Mirrors AppRecordQueryService.MaxSourceRecords. The engine scans at most this many
        /// submissions and then filters in memory, so a result can be short without being wrong.
        /// The listing surfaces this number when the engine reports IsBounded.
        /// </summary>
        public const int MaxSourceRecords = 500;

        public const int MaxCacheMinutes = 60;

        public const string DefaultPlaceholderImageUrl =
            "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1400&h=900&fit=crop";

        public static readonly string[] DefaultConsoleRoles =
        {
            "Administrators", "Host", "Blog Authors", "Blog Editors",
            "SEO Reviewers", "Content Legal Reviewers", "Blog Publishers"
        };

        // ---- values -------------------------------------------------------------------------

        public string Mode { get; set; } = "listing";
        public string Profile { get; set; } = "blog";
        public string AppKey { get; set; } = DefaultAppKey;
        public string QueryKey { get; set; } = "";
        public string FeaturedQueryKey { get; set; } = DefaultFeaturedQueryKey;
        public int PageSize { get; set; } = DefaultPageSize;
        public string FilterField { get; set; } = "";
        public string FilterValue { get; set; } = "";
        public bool AllowUrlFilter { get; set; } = true;
        public string Layout { get; set; } = "grid";
        public string CssClass { get; set; } = "";
        public string ThemeVariant { get; set; } = "default";

        public bool ShowHero { get; set; } = true;

        /// <summary>
        /// The module's own eyebrow + H1 + strapline. OFF by default since 1.4.0: both hosts
        /// already print a title directly above the module (Oqtane's container renders
        /// ModuleState.Title), so a second, larger heading underneath is duplicated chrome that
        /// pushes the content down a screen. Turn it on for a standalone magazine page.
        /// </summary>
        public bool ShowHeroText { get; set; }
        public string HeroEyebrow { get; set; } = "";
        public string HeroTitle { get; set; } = "";
        public string HeroSubtitle { get; set; } = "";
        public string SectionHeading { get; set; } = "";
        public string EmptyMessage { get; set; } = "";
        public string PlaceholderImageUrl { get; set; } = DefaultPlaceholderImageUrl;

        public bool ShowReadingTime { get; set; } = true;
        public bool ShowMetrics { get; set; } = true;
        public bool ShowAuthor { get; set; } = true;
        public bool ShowTags { get; set; } = true;
        public bool ShowAttachments { get; set; } = true;

        public int DetailPageId { get; set; }
        public int DetailModuleId { get; set; }
        public string SlugSource { get; set; } = "query";
        public string SlugParam { get; set; } = "slug";

        /// <summary>
        /// The page carrying the PUBLIC blog surface. Only a console instance needs it: the
        /// console lives on its own admin page, so without this it has no way to name the page a
        /// reader would land on, and every "view the post" link would point back at itself.
        /// 0 keeps the old behaviour (fall back to DetailPageId, then to this page).
        /// </summary>
        public int PublicPageId { get; set; }

        /// <summary>
        /// Whether opening a post records a read.
        ///
        /// This writes a row to the blog app's <c>reader-events</c> form; the Core rollup service
        /// then assigns <c>view_count</c> from those rows. It is per-instance so a preview or a
        /// staging instance pointed at live data does not inflate the numbers, and so a site can
        /// switch counting off entirely without uninstalling anything.
        /// </summary>
        public bool TrackReads { get; set; } = true;

        public string ConsoleRoles { get; set; } = string.Join(",", DefaultConsoleRoles);
        public string ConsoleView { get; set; } = "dashboard";
        public int CacheMinutes { get; set; }

        // ---- derived ------------------------------------------------------------------------

        public bool IsNews => Profile == "news";
        public bool IsConsole => Mode == "console";

        /// <summary>
        /// The named query for this Mode. An explicit QueryKey always wins; otherwise the
        /// per-Mode default. Every key here was verified to exist in MF_AppQueries for
        /// blog-starter — there is no "published-posts", despite what older handoffs claimed.
        /// </summary>
        public string EffectiveQueryKey()
        {
            if (!string.IsNullOrWhiteSpace(QueryKey)) return QueryKey.Trim();
            switch (Mode)
            {
                case "console": return "all-posts";
                case "category":
                case "archive": return "blog-archive";
                case "featured": return FeaturedQueryKey.Length > 0 ? FeaturedQueryKey : "featured-posts";
                case "listing":
                    // public-posts for both profiles. NOT popular-home-posts, even though it is
                    // the "blog home" query: it filters is_featured = false, and the engine's
                    // Matches() returns false for a record that has no such field at all, so every
                    // post created without an explicit is_featured would silently vanish from the
                    // home page. Admins who want the most-read ordering can set QueryKey instead.
                    return "public-posts";
                default: return "public-posts";   // detail, author
            }
        }

        /// <summary>Roles allowed into the console, already split and cleaned.</summary>
        public List<string> ConsoleRoleList()
            => SplitCsv(ConsoleRoles, 24, 64);

        /// <summary>
        /// The wrapper classes for this instance. Kept here so Index.razor never string-builds
        /// a class attribute out of raw setting text.
        /// </summary>
        public string WrapperClass()
        {
            var parts = new List<string>
            {
                "mfb",
                "mfb-profile-" + Profile,
                "mfb-mode-" + Mode,
                "mfb-layout-" + Layout
            };
            if (ThemeVariant != "default") parts.Add("mfb-theme-" + ThemeVariant);
            if (!string.IsNullOrWhiteSpace(CssClass)) parts.Add(CssClass);
            return string.Join(" ", parts);
        }

        // ---- read -----------------------------------------------------------------------------

        /// <summary>
        /// Build a config from Oqtane module settings. Everything is normalised on the way in, so
        /// a hand-edited or legacy setting row can never produce an invalid render.
        /// </summary>
        public static BlogInstanceConfig Read(IDictionary<string, string> settings)
        {
            var c = new BlogInstanceConfig();
            if (settings == null) return c;

            c.Mode = Pick(settings, "Mode", Modes, "listing");
            c.Profile = Pick(settings, "Profile", Profiles, "blog");
            c.AppKey = TextOr(settings, "AppKey", DefaultAppKey, 128);
            c.QueryKey = QueryKeyOr(settings, "QueryKey", "");
            c.FeaturedQueryKey = QueryKeyOr(settings, "FeaturedQueryKey", DefaultFeaturedQueryKey);
            c.PageSize = Clamp(Int(settings, "PageSize", DefaultPageSize), 1, MaxPageSize);

            c.FilterField = Pick(settings, "FilterField", FilterFields, "");
            c.FilterValue = TextOr(settings, "FilterValue", "", 256);
            c.AllowUrlFilter = Bool(settings, "AllowUrlFilter", true);

            c.Layout = Pick(settings, "Layout", Layouts, "grid");
            c.CssClass = SanitizeCssClass(Raw(settings, "CssClass"));
            c.ThemeVariant = Pick(settings, "ThemeVariant", ThemeVariants, "default");

            c.ShowHero = Bool(settings, "ShowHero", true);
            c.ShowHeroText = Bool(settings, "ShowHeroText", false);
            c.HeroEyebrow = TextOr(settings, "HeroEyebrow", "", 120);
            c.HeroTitle = TextOr(settings, "HeroTitle", "", 200);
            c.HeroSubtitle = TextOr(settings, "HeroSubtitle", "", 400);
            c.SectionHeading = TextOr(settings, "SectionHeading", "", 200);
            c.EmptyMessage = TextOr(settings, "EmptyMessage", "", 400);
            c.PlaceholderImageUrl = SanitizeImageUrl(Raw(settings, "PlaceholderImageUrl"));

            c.ShowReadingTime = Bool(settings, "ShowReadingTime", true);
            c.ShowMetrics = Bool(settings, "ShowMetrics", true);
            c.ShowAuthor = Bool(settings, "ShowAuthor", true);
            c.ShowTags = Bool(settings, "ShowTags", true);
            c.ShowAttachments = Bool(settings, "ShowAttachments", true);

            c.DetailPageId = Math.Max(0, Int(settings, "DetailPageId", 0));
            c.DetailModuleId = Math.Max(0, Int(settings, "DetailModuleId", 0));
            c.PublicPageId = Math.Max(0, Int(settings, "PublicPageId", 0));
            c.SlugSource = Pick(settings, "SlugSource", SlugSources, "query");
            c.SlugParam = SanitizeSlugParam(Raw(settings, "SlugParam"));

            c.TrackReads = Bool(settings, "TrackReads", true);

            var roles = SplitCsv(Raw(settings, "ConsoleRoles"), 24, 64);
            c.ConsoleRoles = roles.Count > 0
                ? string.Join(",", roles)
                : string.Join(",", DefaultConsoleRoles);
            c.ConsoleView = Pick(settings, "ConsoleView", ConsoleViews, "dashboard");
            c.CacheMinutes = Clamp(Int(settings, "CacheMinutes", 0), 0, MaxCacheMinutes);

            return c;
        }

        // ---- write ----------------------------------------------------------------------------

        /// <summary>
        /// The rows to persist, already normalised. Settings.razor loops this into
        /// ISettingService.SetSetting so the same whitelists apply on save as on load — an
        /// invalid value can never reach the database in the first place.
        /// </summary>
        public IEnumerable<KeyValuePair<string, string>> ToSettings()
        {
            yield return Row("Mode", Norm(Mode, Modes, "listing"));
            yield return Row("Profile", Norm(Profile, Profiles, "blog"));
            yield return Row("AppKey", Trim(AppKey, 128, DefaultAppKey));
            yield return Row("QueryKey", NormQueryKey(QueryKey, ""));
            yield return Row("FeaturedQueryKey", NormQueryKey(FeaturedQueryKey, DefaultFeaturedQueryKey));
            yield return Row("PageSize", Clamp(PageSize, 1, MaxPageSize).ToString(CultureInfo.InvariantCulture));

            yield return Row("FilterField", Norm(FilterField, FilterFields, ""));
            yield return Row("FilterValue", Trim(FilterValue, 256, ""));
            yield return Row("AllowUrlFilter", B(AllowUrlFilter));

            yield return Row("Layout", Norm(Layout, Layouts, "grid"));
            yield return Row("CssClass", SanitizeCssClass(CssClass));
            yield return Row("ThemeVariant", Norm(ThemeVariant, ThemeVariants, "default"));

            yield return Row("ShowHero", B(ShowHero));
            yield return Row("ShowHeroText", B(ShowHeroText));
            yield return Row("HeroEyebrow", Trim(HeroEyebrow, 120, ""));
            yield return Row("HeroTitle", Trim(HeroTitle, 200, ""));
            yield return Row("HeroSubtitle", Trim(HeroSubtitle, 400, ""));
            yield return Row("SectionHeading", Trim(SectionHeading, 200, ""));
            yield return Row("EmptyMessage", Trim(EmptyMessage, 400, ""));
            yield return Row("PlaceholderImageUrl", SanitizeImageUrl(PlaceholderImageUrl));

            yield return Row("ShowReadingTime", B(ShowReadingTime));
            yield return Row("ShowMetrics", B(ShowMetrics));
            yield return Row("ShowAuthor", B(ShowAuthor));
            yield return Row("ShowTags", B(ShowTags));
            yield return Row("ShowAttachments", B(ShowAttachments));

            yield return Row("DetailPageId", Math.Max(0, DetailPageId).ToString(CultureInfo.InvariantCulture));
            yield return Row("DetailModuleId", Math.Max(0, DetailModuleId).ToString(CultureInfo.InvariantCulture));
            yield return Row("PublicPageId", Math.Max(0, PublicPageId).ToString(CultureInfo.InvariantCulture));
            yield return Row("SlugSource", Norm(SlugSource, SlugSources, "query"));
            yield return Row("SlugParam", SanitizeSlugParam(SlugParam));

            yield return Row("TrackReads", B(TrackReads));

            var roles = SplitCsv(ConsoleRoles, 24, 64);
            yield return Row("ConsoleRoles", roles.Count > 0
                ? string.Join(",", roles)
                : string.Join(",", DefaultConsoleRoles));
            yield return Row("ConsoleView", Norm(ConsoleView, ConsoleViews, "dashboard"));
            yield return Row("CacheMinutes", Clamp(CacheMinutes, 0, MaxCacheMinutes).ToString(CultureInfo.InvariantCulture));
        }

        private static KeyValuePair<string, string> Row(string key, string value)
            => new KeyValuePair<string, string>(Prefix + key, value ?? "");

        // ---- primitives -----------------------------------------------------------------------

        private static string Raw(IDictionary<string, string> settings, string key)
            => settings != null && settings.TryGetValue(Prefix + key, out var value) ? (value ?? "") : "";

        private static string Pick(IDictionary<string, string> settings, string key, string[] allowed, string fallback)
            => Norm(Raw(settings, key), allowed, fallback);

        /// <summary>Whitelist check. Unknown input fails closed to <paramref name="fallback"/>.</summary>
        private static string Norm(string value, string[] allowed, string fallback)
        {
            var candidate = (value ?? "").Trim().ToLowerInvariant();
            if (candidate.Length == 0) return fallback;
            return allowed.Contains(candidate) ? candidate : fallback;
        }

        private static string TextOr(IDictionary<string, string> settings, string key, string fallback, int max)
            => Trim(Raw(settings, key), max, fallback);

        private static string Trim(string value, int max, string fallback)
        {
            var text = (value ?? "").Trim();
            if (text.Length == 0) return fallback;
            return text.Length > max ? text.Substring(0, max) : text;
        }

        /// <summary>
        /// A query key is an identifier we hand to the engine, never markup. Keep it to the
        /// shape the seeded rows actually use so a typo cannot become an injection attempt.
        /// </summary>
        private static string QueryKeyOr(IDictionary<string, string> settings, string key, string fallback)
            => NormQueryKey(Raw(settings, key), fallback);

        private static string NormQueryKey(string value, string fallback)
        {
            var text = (value ?? "").Trim().ToLowerInvariant();
            if (text.Length == 0) return fallback;
            return Regex.IsMatch(text, "^[a-z0-9][a-z0-9-]{0,63}$") ? text : fallback;
        }

        private static int Int(IDictionary<string, string> settings, string key, int fallback)
            => int.TryParse(Raw(settings, key), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
                ? value : fallback;

        private static int Clamp(int value, int min, int max)
            => value < min ? min : (value > max ? max : value);

        private static bool Bool(IDictionary<string, string> settings, string key, bool fallback)
        {
            var text = Raw(settings, key).Trim();
            if (text.Length == 0) return fallback;
            if (bool.TryParse(text, out var parsed)) return parsed;
            return text == "1" || text.Equals("yes", StringComparison.OrdinalIgnoreCase);
        }

        private static string B(bool value) => value ? "true" : "false";

        /// <summary>
        /// CSS classes are emitted into a class attribute, so allow only characters that cannot
        /// terminate the attribute or start a new one.
        /// </summary>
        private static string SanitizeCssClass(string value)
        {
            var text = (value ?? "").Trim();
            if (text.Length == 0) return "";
            var kept = new StringBuilder(text.Length);
            foreach (var ch in text)
            {
                if (char.IsLetterOrDigit(ch) && ch < 128) kept.Append(ch);
                else if (ch == '-' || ch == '_' || ch == ' ') kept.Append(ch);
            }
            var cleaned = Regex.Replace(kept.ToString(), @"\s+", " ").Trim();
            return cleaned.Length > 128 ? cleaned.Substring(0, 128) : cleaned;
        }

        /// <summary>
        /// Only absolute http/https or a single-slash site-relative path. Rejects javascript:,
        /// data: and protocol-relative "//host" (which would silently leave the site).
        /// </summary>
        private static string SanitizeImageUrl(string value)
        {
            var text = (value ?? "").Trim();
            if (text.Length == 0) return DefaultPlaceholderImageUrl;
            if (text.Length > 500) return DefaultPlaceholderImageUrl;
            if (text.StartsWith("//", StringComparison.Ordinal)) return DefaultPlaceholderImageUrl;
            if (text.StartsWith("/", StringComparison.Ordinal)) return text;
            if (Uri.TryCreate(text, UriKind.Absolute, out var uri)
                && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
                return text;
            return DefaultPlaceholderImageUrl;
        }

        private static string SanitizeSlugParam(string value)
        {
            var text = (value ?? "").Trim().ToLowerInvariant();
            if (text.Length == 0) return "slug";
            return Regex.IsMatch(text, "^[a-z0-9_-]{1,32}$") ? text : "slug";
        }

        private static List<string> SplitCsv(string value, int maxItems, int maxLength)
        {
            var list = new List<string>();
            if (string.IsNullOrWhiteSpace(value)) return list;
            foreach (var part in value.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var item = part.Trim();
                if (item.Length == 0 || item.Length > maxLength) continue;
                if (list.Contains(item, StringComparer.OrdinalIgnoreCase)) continue;
                list.Add(item);
                if (list.Count >= maxItems) break;
            }
            return list;
        }
    }
}
