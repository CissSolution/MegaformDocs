using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace MegaForm.Core.Services.GalleryRepo
{
    /// <summary>
    /// [GalleryRepo v20260724] Host-agnostic glue between <see cref="GalleryRepositoryService"/>
    /// (fetch + sha256 verify) and a host's local template catalog.
    ///
    /// Deliberately does NOT touch the catalog store itself: each host owns its own catalog
    /// directory + service wrapper, so this returns the verified template JSON and lets the
    /// caller persist it (DNN/Oqtane both end up calling
    /// <c>BuilderTemplateCatalogStore.SaveTemplateJson(fileName, json)</c>).
    ///
    /// The LICENSE gate is the host's job (LicenseService.IsTrial → 402): the remote gallery is
    /// a licensed feature, and gating here would hide the reason from the endpoint's response.
    /// </summary>
    public sealed class GalleryInstallService
    {
        private readonly GalleryRepositoryService _repo;

        public GalleryInstallService(GalleryRepositoryService repo)
        {
            _repo = repo ?? throw new ArgumentNullException(nameof(repo));
        }

        public string RepoBaseUrl => _repo.RepoBaseUrl;

        public Task<GalleryRepoFetchResult<GalleryRepoManifest>> GetManifestAsync(bool forceRefresh)
            => _repo.GetTemplatesManifestAsync(forceRefresh);

        public sealed class TemplateFetch
        {
            public bool Success { get; set; }
            public string Error { get; set; }
            public string Slug { get; set; }
            public string Json { get; set; }
            /// <summary>Suggested catalog file name, e.g. "my-template.json".</summary>
            public string FileName { get; set; }
            public GalleryRepoTemplateInfo Info { get; set; }

            public static TemplateFetch Fail(string error) => new TemplateFetch { Success = false, Error = error };
        }

        /// <summary>
        /// Resolves a slug against the manifest, downloads the pinned file (sha256-verified by
        /// <see cref="GalleryRepositoryService.DownloadFileAsync"/>), and validates the JSON shape
        /// before handing it back. Any failure is returned as a message — never thrown — so the
        /// endpoint can answer without leaking exception detail.
        /// </summary>
        public async Task<TemplateFetch> FetchTemplateAsync(string slug, bool forceRefresh)
        {
            var wanted = (slug ?? string.Empty).Trim();
            if (!GalleryRepositoryService.IsValidSlug(wanted))
                return TemplateFetch.Fail("Invalid template slug.");

            var manifest = await GetManifestAsync(forceRefresh).ConfigureAwait(false);
            if (!manifest.Success || manifest.Value == null)
                return TemplateFetch.Fail(manifest.Message ?? "Gallery repository unavailable.");

            var info = (manifest.Value.Templates ?? new List<GalleryRepoTemplateInfo>())
                .FirstOrDefault(t => t != null && string.Equals((t.Slug ?? string.Empty).Trim(), wanted, StringComparison.OrdinalIgnoreCase));
            if (info == null)
                return TemplateFetch.Fail("Template '" + wanted + "' is not in the gallery manifest.");

            var download = await _repo.DownloadFileAsync(info.File, info.Sha256, GalleryRepositoryService.MaxTemplateBytes)
                                      .ConfigureAwait(false);
            if (!download.Success)
                return TemplateFetch.Fail(download.Message ?? "Download failed.");

            string json;
            try { json = new UTF8Encoding(false).GetString(StripBom(download.Bytes)); }
            catch { return TemplateFetch.Fail("Downloaded template is not valid UTF-8."); }

            string validationError;
            if (!GalleryRepositoryService.ValidateTemplateJson(json, out validationError))
                return TemplateFetch.Fail(validationError ?? "Downloaded template failed validation.");

            // Trust the FILE's slug (it is what the catalog will key on), not the manifest's.
            var actualSlug = GalleryRepositoryService.ReadTemplateSlug(json);
            if (!GalleryRepositoryService.IsValidSlug(actualSlug))
                return TemplateFetch.Fail("Downloaded template has no valid slug.");

            return new TemplateFetch
            {
                Success = true,
                Slug = actualSlug,
                Json = json,
                FileName = actualSlug + ".json",
                Info = info,
            };
        }

        private static byte[] StripBom(byte[] b)
        {
            if (b != null && b.Length >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF)
            {
                var t = new byte[b.Length - 3];
                Array.Copy(b, 3, t, 0, t.Length);
                return t;
            }
            return b ?? new byte[0];
        }
    }
}
