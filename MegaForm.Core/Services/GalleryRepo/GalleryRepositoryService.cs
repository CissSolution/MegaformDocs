using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services.GalleryRepo
{
    /// <summary>
    /// [GalleryRepo v20260723] Fetches + validates content from the MegaForm Gallery
    /// Repository (static HTTPS: GitHub Pages / R2). Two channels:
    ///   templates — manifest.json + templates/*.json (+ optional *-assets.zip)
    ///   kb        — kb/manifest.json + kb/ai-knowledge-seed.json + kb resource files
    ///
    /// Hardening rules (mirrors the plan + SECURITY audit conventions):
    ///   - server-side fetch only (browser never talks to the repo — no CORS, no URL leak)
    ///   - every downloaded file is verified against the sha256 pinned in its manifest
    ///   - repo-relative paths are sanitized (no "..", no absolute, no backslash)
    ///   - hard size caps + timeouts; failures are fail-soft (Offline result, never throw)
    ///   - a static shared HttpClient (DNN net472-safe — no per-request sockets churn)
    ///
    /// This class is platform-agnostic; hosts construct it with the configured repo
    /// URL (module setting or DefaultRepoBaseUrl) and enforce the license gate themselves.
    /// </summary>
    public sealed class GalleryRepositoryService
    {
        /// <summary>
        /// Official repository. Override via host config key "MegaForm:GalleryRepoUrl"
        /// (DNN host setting "MegaForm_GalleryRepoUrl").
        ///
        /// Served from GitHub Pages for the same public repo, CissSolution/megaform-gallery.
        /// Publishing is then just a push: Pages redeploys itself and answers with
        /// `Cache-Control: max-age=600`, so a new template is live within ten minutes.
        ///
        /// [PagesOverCdn v20260801] This used to be the jsDelivr CDN, and moving off it was not a
        /// preference — a branch ref there is unusable for a gallery that changes:
        ///   - jsDelivr's data API listing for @main sat frozen on a SIX-DAY-OLD commit
        ///     (byte-identical to dc53e2a) through several pushes and a full file purge. It hid
        ///     seven published templates, because GetTemplatesManifestAsync reconciles against it.
        ///   - purge.jsdelivr.net clears the FILE cache only; that listing cannot be purged.
        ///     Publishing correctly therefore could not fix it, and neither could waiting.
        /// Pages avoids the whole class of problem twice over: it serves current content, and it
        /// is not a host BuildListingUrl knows how to enumerate, so the reconcile is skipped and
        /// the manifest is authoritative — on every module version ever shipped, including builds
        /// older than the [StaleListing v20260801] repair. Existing installs still pointed at
        /// jsDelivr keep working, just with that repair doing the work.
        ///
        /// NOTE the capital letters. GitHub Pages answers this owner subdomain case-sensitively:
        /// CissSolution.github.io serves, cissolution.github.io returns 404 (measured, 3/3).
        /// </summary>
        public const string DefaultRepoBaseUrl = "https://CissSolution.github.io/megaform-gallery/";

        public const string TemplatesManifestPath = "manifest.json";
        public const string KbManifestPath = "kb/manifest.json";
        public const string KbSeedPath = "kb/ai-knowledge-seed.json";

        public const long MaxManifestBytes = 2L * 1024 * 1024;       // 2 MB
        public const long MaxTemplateBytes = 5L * 1024 * 1024;       // 5 MB
        public const long MaxAssetsBytes = 20L * 1024 * 1024;        // 20 MB
        public const long MaxKbSeedBytes = 20L * 1024 * 1024;        // 20 MB
        public const long MaxKbResourceBytes = 2L * 1024 * 1024;     // 2 MB per md/json

        private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);
        private static readonly TimeSpan HttpTimeout = TimeSpan.FromSeconds(20);

        /// <summary>
        /// How many manifest entries the listing may disagree about before the reconcile in
        /// <see cref="GetTemplatesManifestAsync"/> stops probing and just trusts the manifest.
        /// A handful means "the owner deleted a few files"; dozens means the listing itself is
        /// wrong (stale ref, wrong repo, changed layout) and is not worth one request each.
        /// </summary>
        private const int MaxListingProbes = 12;

        // Prefix so an existence probe cannot collide with the cached BODY of the same URL.
        private const string ProbeCacheKeyPrefix = "HEAD ";

        private static readonly HttpClient _http = CreateClient();

        private static HttpClient CreateClient()
        {
            var c = new HttpClient();
            c.Timeout = HttpTimeout;
            c.DefaultRequestHeaders.UserAgent.ParseAdd("MegaForm-GalleryRepo/1.0");
            return c;
        }

        // Static cache keyed by absolute URL — hosts may construct a service per request,
        // the cache must survive that. Entries keep the raw body so a stale copy can be
        // served when the repo is down (fail-soft).
        private sealed class CacheEntry
        {
            public DateTime ExpiryUtc;
            public string Body;
        }

        private static readonly ConcurrentDictionary<string, CacheEntry> _cache =
            new ConcurrentDictionary<string, CacheEntry>(StringComparer.OrdinalIgnoreCase);

        private readonly string _baseUrl;
        private readonly string _accessToken;

        public GalleryRepositoryService(string repoBaseUrl)
            : this(repoBaseUrl, null) { }

        /// <summary>
        /// [PrivateGalleryRepo 2026-07-28] <paramref name="accessToken"/> is an optional
        /// read-only GitHub token, used ONLY when the repo is private and therefore served
        /// from raw.githubusercontent instead of the jsDelivr CDN. It is host configuration
        /// (never a request value) and never leaves the server.
        /// </summary>
        public GalleryRepositoryService(string repoBaseUrl, string accessToken)
        {
            _baseUrl = NormalizeBaseUrl(repoBaseUrl);
            _accessToken = (accessToken ?? string.Empty).Trim();
        }

        public string RepoBaseUrl => _baseUrl;

        // ── token handling ────────────────────────────────────
        //
        // [PrivateGalleryRepo 2026-07-28] The repo base URL is ADMIN-CONFIGURABLE. Attaching the
        // token by "is this the configured base URL?" would hand it to anyone who can edit that
        // setting: point the URL at their own host and the server posts the shared credential
        // straight to it. SsrfGuard does NOT stop that — it blocks private/loopback targets, not
        // an ordinary public domain.
        //
        // So the token is attached by DESTINATION, against a hard-coded allowlist of the two
        // GitHub hosts that can serve a private repo. A base URL pointing anywhere else still
        // works (public CDN content) but is never sent the credential.
        private static readonly HashSet<string> TokenHosts =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "raw.githubusercontent.com",
                "api.github.com",
            };

        /// <summary>True when <paramref name="url"/> is a GitHub host cleared to receive the token.</summary>
        internal static bool IsTokenAllowedForUrl(string url)
        {
            try
            {
                var u = new Uri(url);
                return string.Equals(u.Scheme, "https", StringComparison.OrdinalIgnoreCase)
                    && TokenHosts.Contains(u.Host);
            }
            catch { return false; }
        }

        public static string NormalizeBaseUrl(string repoBaseUrl)
        {
            var u = (repoBaseUrl ?? string.Empty).Trim();
            if (u.Length == 0) u = DefaultRepoBaseUrl;
            if (!u.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
                && !u.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
                u = "https://" + u;
            if (!u.EndsWith("/", StringComparison.Ordinal)) u += "/";
            return u;
        }

        // ── manifests ─────────────────────────────────────────

        /// <summary>
        /// [FilesAreTruth v20260726] The manifest lists what was PUBLISHED; the repo holds what
        /// actually EXISTS. An owner who deletes templates/&lt;slug&gt;.json by hand on GitHub expects
        /// the card to disappear — but the manifest still names it, so the gallery kept showing a
        /// tile whose install 404s (owner report: festa-italiana + obsidian-member-login).
        /// Reconcile the two: drop every manifest entry whose file is no longer in the repo listing.
        /// The manifest stays authoritative for METADATA and for the sha256 each download is
        /// verified against — dropping it entirely would cost that integrity check and force one
        /// HTTP round-trip per template just to render the grid.
        /// Fail-open: if the listing cannot be read (non-jsDelivr host, API down), the manifest is
        /// returned untouched, i.e. exactly the previous behaviour.
        ///
        /// [StaleListing v20260801] Absent from the listing is NOT proof the file is gone. The two
        /// sources are cached independently and the listing is the slower of the two: on 2026-08-01
        /// the purged manifest already advertised 47 templates while data.jsdelivr.com still
        /// enumerated 41 (`X-Cache: HIT`, `max-age` a year) — so three freshly published templates
        /// were dropped here and never reached the grid, with no error anywhere to explain it.
        /// purge.jsdelivr.net clears the FILE cache, not the data API, so publishing cannot fix it.
        /// A missing entry is now confirmed against the file itself before the card is removed:
        /// a definite 404/410 deletes it, anything else keeps it. Deletions still disappear (one
        /// extra HEAD each), a lagging listing no longer hides new work.
        /// </summary>
        public async Task<GalleryRepoFetchResult<GalleryRepoManifest>> GetTemplatesManifestAsync(bool forceRefresh)
        {
            var res = await FetchJsonAsync<GalleryRepoManifest>(TemplatesManifestPath, forceRefresh).ConfigureAwait(false);
            if (!res.Success || res.Value?.Templates == null || res.Value.Templates.Count == 0) return res;

            var present = await GetRepoFileSetAsync(forceRefresh).ConfigureAwait(false);
            if (present == null || present.Count == 0) return res;   // fail-open

            var disputed = res.Value.Templates
                .Where(t => t != null && !string.IsNullOrWhiteSpace(t.File)
                            && !present.Contains(t.File.Replace('\\', '/').TrimStart('/')))
                .ToList();
            if (disputed.Count == 0) return res;
            if (disputed.Count > MaxListingProbes) return res;        // listing looks wrong, not the manifest

            var gone = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var t in disputed)
            {
                if (!await RepoFileExistsAsync(t.File, forceRefresh).ConfigureAwait(false))
                    gone.Add(t.File);
            }
            if (gone.Count == 0) return res;

            var kept = res.Value.Templates
                .Where(t => t != null && (string.IsNullOrWhiteSpace(t.File) || !gone.Contains(t.File)))
                .ToList();
            if (kept.Count != res.Value.Templates.Count) res.Value.Templates = kept;
            return res;
        }

        /// <summary>
        /// Does one repo-relative file actually exist? Used only to second-guess a listing that
        /// claims it does not, so it is deliberately biased towards keeping the card: only a
        /// definite 404/410 answers false. A blocked, throttled or broken probe answers true —
        /// removing a template from the grid must need evidence, not the absence of it.
        /// </summary>
        private async Task<bool> RepoFileExistsAsync(string relativePath, bool forceRefresh)
        {
            var safe = SanitizeRelativePath(relativePath);
            if (safe == null) return false;                          // unusable path — the card is dead anyway

            var url = _baseUrl + safe;
            var key = ProbeCacheKeyPrefix + url;
            var now = DateTime.UtcNow;

            CacheEntry cached;
            if (!forceRefresh && _cache.TryGetValue(key, out cached) && cached.Body != null && now < cached.ExpiryUtc)
                return cached.Body == "1";

            bool exists;
            try
            {
                exists = await RemoteFileRespondsAsync(url).ConfigureAwait(false);
            }
            catch
            {
                return true;                                         // fail-open, and do not cache a guess
            }

            _cache[key] = new CacheEntry { ExpiryUtc = now.Add(CacheTtl), Body = exists ? "1" : "0" };
            return exists;
        }

        private async Task<bool> RemoteFileRespondsAsync(string url)
        {
            // Same SSRF choke point as every other outbound call here — the base URL is
            // admin-configurable (SECURITY_CODING_RULES §9).
            string ssrfReason;
            if (!SsrfGuard.IsUrlAllowed(url, out ssrfReason))
                throw new InvalidOperationException("Blocked by SSRF guard: " + ssrfReason);

            using (var request = new HttpRequestMessage(HttpMethod.Head, url))
            {
                // Credential on the request, never on the shared client — see DownloadBytesWithCapAsync.
                if (_accessToken.Length > 0 && IsTokenAllowedForUrl(url))
                {
                    request.Headers.Authorization =
                        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _accessToken);
                    request.Headers.Accept.ParseAdd("application/vnd.github.raw");
                }

                using (var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false))
                {
                    return response.StatusCode != System.Net.HttpStatusCode.NotFound
                        && response.StatusCode != System.Net.HttpStatusCode.Gone;
                }
            }
        }

        /// <summary>
        /// Paths (repo-relative, forward slashes) currently in the repo, via the jsDelivr data API
        /// — one call, CDN-backed, same TTL as the manifest. Returns null when the base URL is not
        /// a jsDelivr /gh/ URL or the listing cannot be parsed, so callers fail open.
        /// </summary>
        private async Task<HashSet<string>> GetRepoFileSetAsync(bool forceRefresh)
        {
            var listingUrl = BuildListingUrl(_baseUrl);
            if (listingUrl == null) return null;
            try
            {
                var now = DateTime.UtcNow;
                CacheEntry cached;
                string body = null;
                if (!forceRefresh && _cache.TryGetValue(listingUrl, out cached) && cached.Body != null && now < cached.ExpiryUtc)
                    body = cached.Body;
                if (body == null)
                {
                    body = await DownloadStringWithCapAsync(listingUrl, MaxManifestBytes).ConfigureAwait(false);
                    if (!string.IsNullOrWhiteSpace(body))
                        _cache[listingUrl] = new CacheEntry { ExpiryUtc = now.Add(CacheTtl), Body = body };
                }
                if (string.IsNullOrWhiteSpace(body)) return null;
                var root = JObject.Parse(body);
                var files = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                // [PrivateGalleryRepo 2026-07-28] Two listing shapes: jsDelivr nests
                // {files:[{name,files:[…]}]}, the Git Trees API returns a FLAT
                // {tree:[{path,type}]}. Blobs only — a "tree" entry is a directory.
                var gitTree = root["tree"] as JArray;
                if (gitTree != null)
                {
                    // The Trees API caps a recursive listing and flags it with truncated:true.
                    // A partial listing here is worse than none: the reconcile below deletes
                    // every manifest entry it cannot see, so a big repo would silently empty
                    // the gallery. Fail open — trust the manifest.
                    if (root.Value<bool?>("truncated") == true) return null;
                    foreach (var n in gitTree.OfType<JObject>())
                    {
                        if (!string.Equals((string)n["type"], "blob", StringComparison.OrdinalIgnoreCase)) continue;
                        var p = (string)n["path"];
                        if (!string.IsNullOrEmpty(p)) files.Add(p);
                    }
                }
                else
                {
                    CollectListingPaths(root["files"] as JArray, string.Empty, files);
                }
                return files.Count > 0 ? files : null;
            }
            catch { return null; }
        }

        private static void CollectListingPaths(JArray nodes, string prefix, HashSet<string> into)
        {
            if (nodes == null) return;
            foreach (var n in nodes.OfType<JObject>())
            {
                var name = (string)n["name"];
                if (string.IsNullOrEmpty(name)) continue;
                var path = prefix.Length == 0 ? name : prefix + "/" + name;
                var children = n["files"] as JArray;
                if (children != null) CollectListingPaths(children, path, into);
                else into.Add(path);
            }
        }

        /// <summary>
        /// Listing endpoint for the configured repo, or null when the layout is not recognised
        /// (the caller then falls back to "trust the manifest").
        ///   jsDelivr  `https://cdn.jsdelivr.net/gh/owner/repo@ref/` → data-API package listing
        ///   raw       `https://raw.githubusercontent.com/owner/repo/ref/` → Git Trees API
        /// [PrivateGalleryRepo 2026-07-28] The data API only knows PUBLIC repos, so a private
        /// gallery served from raw.githubusercontent has to be enumerated through the GitHub API
        /// instead — which is also why api.github.com is on the token allowlist.
        ///
        /// Both listings enumerate paths from the REPO ROOT, while manifest entries are relative
        /// to the configured base URL. They only line up when the base URL IS the repo root, so a
        /// base pointing into a subdirectory returns null (trust the manifest) instead of a
        /// listing that matches nothing and would drop every template.
        ///
        /// Returning null for every OTHER host is what makes a self-hosted gallery immune to the
        /// stale-listing problem on EVERY module version ever shipped, including builds older than
        /// the [StaleListing v20260801] fix: with no listing there is no reconcile, so a published
        /// manifest is what the grid shows. Locked by GalleryRepoTokenScopeTests
        /// .ListingUrl_UnknownHost_ReturnsNull — that case is load-bearing, not incidental.
        /// (Stays internal: those tests reach it with BindingFlags.NonPublic.)
        /// </summary>
        internal static string BuildListingUrl(string baseUrl)
        {
            try
            {
                var u = new Uri(baseUrl);
                var segs = u.AbsolutePath.Trim('/').Split('/');

                if (u.Host.EndsWith("jsdelivr.net", StringComparison.OrdinalIgnoreCase))
                {
                    // gh / owner / repo[@ref]
                    if (segs.Length != 3 || !string.Equals(segs[0], "gh", StringComparison.OrdinalIgnoreCase)) return null;
                    return "https://data.jsdelivr.com/v1/packages/gh/" + segs[1] + "/" + segs[2];
                }

                if (string.Equals(u.Host, "raw.githubusercontent.com", StringComparison.OrdinalIgnoreCase))
                {
                    // owner / repo / ref
                    if (segs.Length != 3) return null;
                    return "https://api.github.com/repos/" + segs[0] + "/" + segs[1]
                        + "/git/trees/" + segs[2] + "?recursive=1";
                }

                return null;
            }
            catch { return null; }
        }

        public Task<GalleryRepoFetchResult<KbRepoManifest>> GetKbManifestAsync(bool forceRefresh)
            => FetchJsonAsync<KbRepoManifest>(KbManifestPath, forceRefresh);

        private async Task<GalleryRepoFetchResult<T>> FetchJsonAsync<T>(string relativePath, bool forceRefresh) where T : class
        {
            var url = _baseUrl + relativePath;
            var now = DateTime.UtcNow;
            CacheEntry cached;
            var hasCached = _cache.TryGetValue(url, out cached) && cached.Body != null;

            if (!forceRefresh && hasCached && now < cached.ExpiryUtc)
            {
                var parsedCached = TryParse<T>(cached.Body);
                if (parsedCached != null) return GalleryRepoFetchResult<T>.Ok(parsedCached);
            }

            string body = null;
            string fetchError = null;
            try
            {
                body = await DownloadStringWithCapAsync(url, MaxManifestBytes).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                fetchError = ex.Message;
            }

            if (body != null)
            {
                var parsed = TryParse<T>(body);
                if (parsed != null)
                {
                    _cache[url] = new CacheEntry { ExpiryUtc = now.Add(CacheTtl), Body = body };
                    return GalleryRepoFetchResult<T>.Ok(parsed);
                }
                fetchError = "Repository returned an invalid manifest.";
            }

            // Fail-soft: serve the stale cached copy when the repo is unreachable/broken.
            if (hasCached)
            {
                var stale = TryParse<T>(cached.Body);
                if (stale != null)
                    return GalleryRepoFetchResult<T>.Ok(stale, offline: true,
                        message: "Repository unreachable — serving the cached copy from an earlier fetch.");
            }
            return GalleryRepoFetchResult<T>.Fail("Repository unavailable: " + (fetchError ?? "unknown error"));
        }

        private static T TryParse<T>(string json) where T : class
        {
            try { return JsonConvert.DeserializeObject<T>(json); }
            catch { return null; }
        }

        // ── file download + verify ────────────────────────────

        /// <summary>
        /// Downloads one repo-relative file and verifies it against the sha256 pinned in
        /// the manifest. relativePath is sanitized; expectedSha256 is mandatory (a manifest
        /// entry without a hash is rejected — never download unverifiable content).
        /// </summary>
        public async Task<GalleryRepoDownloadResult> DownloadFileAsync(string relativePath, string expectedSha256, long maxBytes)
        {
            var safe = SanitizeRelativePath(relativePath);
            if (safe == null) return GalleryRepoDownloadResult.Fail("Unsafe repository path.");
            if (string.IsNullOrWhiteSpace(expectedSha256) || expectedSha256.Trim().Length != 64)
                return GalleryRepoDownloadResult.Fail("Missing sha256 for '" + safe + "' — refusing unverifiable download.");

            byte[] bytes;
            try
            {
                bytes = await DownloadBytesWithCapAsync(_baseUrl + safe, maxBytes).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                return GalleryRepoDownloadResult.Fail("Download failed: " + ex.Message);
            }

            var actual = ComputeSha256Hex(bytes);
            if (!string.Equals(actual, expectedSha256.Trim(), StringComparison.OrdinalIgnoreCase))
                return GalleryRepoDownloadResult.Fail("sha256 mismatch for '" + safe + "' — the file does not match the manifest.");

            return GalleryRepoDownloadResult.Ok(bytes);
        }

        // ── validation helpers (static, unit-tested) ─────────

        private static readonly Regex SlugRegex = new Regex(@"^[a-z0-9][a-z0-9-]{0,79}$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

        public static bool IsValidSlug(string slug)
            => !string.IsNullOrWhiteSpace(slug) && SlugRegex.IsMatch(slug.Trim());

        /// <summary>
        /// Accepts only repo-relative paths that stay inside the repo: forward slashes,
        /// no "..", no leading "/", no drive/UNC, no backslash. Returns the normalized
        /// path or null when unsafe.
        /// </summary>
        public static string SanitizeRelativePath(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return null;
            var p = path.Trim().Replace('\\', '/');
            if (p.StartsWith("/", StringComparison.Ordinal)) return null;
            if (p.Contains(":")) return null;                       // drive or scheme
            if (p.IndexOf("//", StringComparison.Ordinal) >= 0) return null;
            var segments = p.Split('/');
            foreach (var seg in segments)
            {
                if (seg.Length == 0 || seg == "." || seg == "..") return null;
            }
            return p;
        }

        public static string ComputeSha256Hex(byte[] bytes)
        {
            using (var sha = SHA256.Create())
            {
                var hash = sha.ComputeHash(bytes ?? new byte[0]);
                var sb = new StringBuilder(hash.Length * 2);
                foreach (var b in hash) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        /// <summary>
        /// Minimal template-JSON gate before a downloaded template enters the catalog:
        /// must parse, carry a valid slug and a fields array. Deep shape is the
        /// TemplateSchemaCanonicalizer's job at serve time.
        /// </summary>
        public static bool ValidateTemplateJson(string json, out string error)
        {
            error = null;
            if (string.IsNullOrWhiteSpace(json)) { error = "Empty template."; return false; }
            JObject root;
            try { root = JObject.Parse(json); }
            catch { error = "Template is not valid JSON."; return false; }

            var slug = (string)(root["slug"] ?? root["Slug"]);
            if (!IsValidSlug(slug)) { error = "Template has no valid slug."; return false; }

            var fields = root["fields"] ?? root["Fields"];
            if (!(fields is JArray)) { error = "Template has no fields array."; return false; }

            return true;
        }

        /// <summary>Extracts the slug from a template JSON (assumes ValidateTemplateJson passed).</summary>
        public static string ReadTemplateSlug(string json)
        {
            try
            {
                var root = JObject.Parse(json);
                return ((string)(root["slug"] ?? root["Slug"]) ?? string.Empty).Trim();
            }
            catch { return string.Empty; }
        }

        // ── http primitives (size-capped) ─────────────────────

        private async Task<string> DownloadStringWithCapAsync(string url, long maxBytes)
        {
            var bytes = await DownloadBytesWithCapAsync(url, maxBytes).ConfigureAwait(false);
            return Encoding.UTF8.GetString(bytes);
        }

        private async Task<byte[]> DownloadBytesWithCapAsync(string url, long maxBytes)
        {
            // [SecFix 2026-07-24] The repo base URL is ADMIN-CONFIGURABLE, so every outbound
            // request here is a user-controlled URL — SECURITY_CODING_RULES §9 requires it to go
            // through SsrfGuard (blocks loopback/link-local/private ranges, non-http(s) schemes,
            // credentials-in-URL...). This is the single choke point for the whole service, so a
            // guard here covers manifests, templates and assets alike.
            string ssrfReason;
            if (!SsrfGuard.IsUrlAllowed(url, out ssrfReason))
                throw new InvalidOperationException("Blocked by SSRF guard: " + ssrfReason);

            using (var request = new HttpRequestMessage(HttpMethod.Get, url))
            {
                // [PrivateGalleryRepo 2026-07-28] Credential goes on the REQUEST, never on the
                // shared static HttpClient: a default header would be sent to every destination
                // this service touches, including an admin-configured one. And it is attached
                // only for the hard-coded GitHub hosts — see IsTokenAllowedForUrl.
                if (_accessToken.Length > 0 && IsTokenAllowedForUrl(url))
                {
                    request.Headers.Authorization =
                        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _accessToken);
                    // Trees API answers JSON; raw.githubusercontent answers the file itself.
                    request.Headers.Accept.ParseAdd(
                        url.IndexOf("//api.github.com/", StringComparison.OrdinalIgnoreCase) >= 0
                            ? "application/vnd.github+json"
                            : "application/vnd.github.raw");
                }

                using (var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false))
                {
                    response.EnsureSuccessStatusCode();
                    if (response.Content.Headers.ContentLength.HasValue
                        && response.Content.Headers.ContentLength.Value > maxBytes)
                        throw new InvalidDataException("Remote file exceeds the " + maxBytes + " byte cap.");

                    using (var stream = await response.Content.ReadAsStreamAsync().ConfigureAwait(false))
                    using (var ms = new MemoryStream())
                    {
                        var buffer = new byte[81920];
                        int read;
                        while ((read = await stream.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false)) > 0)
                        {
                            ms.Write(buffer, 0, read);
                            if (ms.Length > maxBytes)
                                throw new InvalidDataException("Remote file exceeds the " + maxBytes + " byte cap.");
                        }
                        return ms.ToArray();
                    }
                }
            }
        }
    }
}
