using System;
using System.Collections.Concurrent;
using System.IO;
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
        /// <summary>Official repository. Override via host config key "MegaForm:GalleryRepoUrl".</summary>
        public const string DefaultRepoBaseUrl = "https://cissolution.github.io/megaform-gallery/";

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

        public GalleryRepositoryService(string repoBaseUrl)
        {
            _baseUrl = NormalizeBaseUrl(repoBaseUrl);
        }

        public string RepoBaseUrl => _baseUrl;

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

        public Task<GalleryRepoFetchResult<GalleryRepoManifest>> GetTemplatesManifestAsync(bool forceRefresh)
            => FetchJsonAsync<GalleryRepoManifest>(TemplatesManifestPath, forceRefresh);

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

        private static async Task<string> DownloadStringWithCapAsync(string url, long maxBytes)
        {
            var bytes = await DownloadBytesWithCapAsync(url, maxBytes).ConfigureAwait(false);
            return Encoding.UTF8.GetString(bytes);
        }

        private static async Task<byte[]> DownloadBytesWithCapAsync(string url, long maxBytes)
        {
            // [SecFix 2026-07-24] The repo base URL is ADMIN-CONFIGURABLE, so every outbound
            // request here is a user-controlled URL — SECURITY_CODING_RULES §9 requires it to go
            // through SsrfGuard (blocks loopback/link-local/private ranges, non-http(s) schemes,
            // credentials-in-URL...). This is the single choke point for the whole service, so a
            // guard here covers manifests, templates and assets alike.
            string ssrfReason;
            if (!SsrfGuard.IsUrlAllowed(url, out ssrfReason))
                throw new InvalidOperationException("Blocked by SSRF guard: " + ssrfReason);

            using (var response = await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false))
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
