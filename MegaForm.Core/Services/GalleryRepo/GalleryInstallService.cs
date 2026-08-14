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

        public sealed class AssetsInstallResult
        {
            public bool Success { get; set; }
            public string Error { get; set; }
            public int FilesWritten { get; set; }
            public List<string> Written { get; set; } = new List<string>();
        }

        /// <summary>
        /// Downloads a template's artwork bundle (sha256-verified) and extracts it under
        /// <paramref name="imageRootDir"/> — the host's module image folder
        /// (DNN: DesktopModules/MegaForm/Assets, Oqtane: wwwroot/Modules/MegaForm). Entries are
        /// stored as "img/&lt;rel&gt;" so the absolute /.../img/&lt;rel&gt; URLs baked into the
        /// template keep resolving on both platforms.
        ///
        /// ZIP-SLIP HARDENED: every entry name is sanitized AND the resolved destination must stay
        /// under the root, so a crafted "../../web.config" entry cannot escape. Existing files are
        /// left alone (a template never overwrites artwork already on the site).
        /// </summary>
        public async Task<AssetsInstallResult> InstallAssetsAsync(GalleryRepoTemplateInfo info, string imageRootDir)
        {
            var result = new AssetsInstallResult { Success = true };
            if (info == null || string.IsNullOrWhiteSpace(info.Assets)) return result; // nothing to do
            if (string.IsNullOrWhiteSpace(imageRootDir))
                return new AssetsInstallResult { Success = false, Error = "No image folder configured." };

            var download = await _repo.DownloadFileAsync(info.Assets, info.AssetsSha256, GalleryRepositoryService.MaxAssetsBytes)
                                      .ConfigureAwait(false);
            if (!download.Success)
                return new AssetsInstallResult { Success = false, Error = download.Message ?? "Asset download failed." };

            string rootFull;
            try { rootFull = System.IO.Path.GetFullPath(imageRootDir); }
            catch { return new AssetsInstallResult { Success = false, Error = "Invalid image folder." }; }
            var rootPrefix = rootFull.TrimEnd(System.IO.Path.DirectorySeparatorChar, System.IO.Path.AltDirectorySeparatorChar)
                             + System.IO.Path.DirectorySeparatorChar;

            try
            {
                using (var ms = new System.IO.MemoryStream(download.Bytes))
                using (var zip = new System.IO.Compression.ZipArchive(ms, System.IO.Compression.ZipArchiveMode.Read))
                {
                    foreach (var entry in zip.Entries)
                    {
                        if (string.IsNullOrEmpty(entry.Name)) continue; // directory entry
                        var safeRel = GalleryRepositoryService.SanitizeRelativePath(entry.FullName);
                        if (safeRel == null) continue;                  // rejected traversal/absolute

                        var dest = System.IO.Path.GetFullPath(
                            System.IO.Path.Combine(rootFull, safeRel.Replace('/', System.IO.Path.DirectorySeparatorChar)));
                        // Second gate: the RESOLVED path must still be inside the root.
                        if (!dest.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase)) continue;

                        if (System.IO.File.Exists(dest)) continue;      // never clobber existing artwork
                        var destDir = System.IO.Path.GetDirectoryName(dest);
                        if (!string.IsNullOrEmpty(destDir)) System.IO.Directory.CreateDirectory(destDir);
                        // Manual copy rather than ZipFileExtensions.ExtractToFile: that extension
                        // lives in the separate System.IO.Compression.ZipFile assembly, which is not
                        // referenced on every TFM here (net472 included).
                        using (var src = entry.Open())
                        using (var dst = System.IO.File.Create(dest))
                        {
                            src.CopyTo(dst);
                        }
                        result.FilesWritten++;
                        result.Written.Add(safeRel);
                    }
                }
            }
            catch
            {
                return new AssetsInstallResult { Success = false, Error = "Could not extract the artwork bundle." };
            }

            return result;
        }

        // ══════════════════════════════════════════════════════
        //  PER-TEMPLATE KNOWLEDGE  [KbPerTemplate v20260812]
        // ══════════════════════════════════════════════════════

        /// <summary>
        /// Outcome of installing one template's knowledge. Deliberately NOT a bool: the whole
        /// reason this feature was invisible for a year is that every KB path answered "fine"
        /// whether or not it did anything (DnnKbSeeder swallows, the Oqtane seeder defers, the
        /// gallery never published a kb channel at all). The caller is expected to surface
        /// <see cref="Message"/> — a template that installed WITHOUT its knowledge is a real,
        /// reportable state, not a success.
        /// </summary>
        public sealed class KnowledgeInstallResult
        {
            /// <summary>True only when knowledge rows were actually merged into the store.</summary>
            public bool Installed { get; set; }
            /// <summary>True when the manifest entry carries no KB pointer at all (a template
            /// published before the KB channel existed) — nothing failed, there is nothing to do.</summary>
            public bool NotPublished { get; set; }
            public int Entries { get; set; }
            public int Rules { get; set; }
            public int GuideFiles { get; set; }
            /// <summary>Human-readable state, always set. Never an exception message
            /// (SECURITY_CODING_RULES §10) — the strings here are our own.</summary>
            public string Message { get; set; }

            public static KnowledgeInstallResult Skip(string message)
                => new KnowledgeInstallResult { Installed = false, NotPublished = true, Message = message };

            public static KnowledgeInstallResult Fail(string message)
                => new KnowledgeInstallResult { Installed = false, Message = message };
        }

        /// <summary>Guide resources are markdown + the generated facts map, nothing else. An
        /// extension allowlist keeps a compromised or malformed bundle from writing anything
        /// executable into the module's Resources folder.</summary>
        private static readonly string[] AllowedKbResourceExtensions = { ".md", ".json" };

        /// <summary>
        /// Downloads this template's knowledge bundle (sha256-verified against the manifest),
        /// writes the guide/facts resources into <paramref name="guidesDir"/>, and merges the
        /// seed-shaped rows through <see cref="AiKnowledge.AiKnowledgeSeedMerger"/> — the same
        /// upsert path the bundled seed uses, so re-installing a template is idempotent.
        ///
        /// Ordering matters: resources are written BEFORE the rows are merged. A template_guide
        /// row points at its file with {"guide_file": …}; if the row landed first and the write
        /// then failed, get_template_guide would answer with the literal string
        /// "[guide_file not found: …]" and the AI would take THAT as the design contract.
        ///
        /// Never throws — the template itself is already installed by the time this runs, so a
        /// knowledge failure is reported, not propagated.
        /// </summary>
        public async Task<KnowledgeInstallResult> InstallKnowledgeAsync(
            GalleryRepoTemplateInfo info,
            string guidesDir,
            MegaForm.Core.Services.AiKnowledge.IAiKnowledgeService knowledge,
            int? userId)
        {
            if (info == null || string.IsNullOrWhiteSpace(info.Kb))
                return KnowledgeInstallResult.Skip("This template has no knowledge bundle published yet.");
            if (knowledge == null)
                return KnowledgeInstallResult.Fail("The knowledge store is unavailable on this site, so the template's AI knowledge was not installed.");

            var download = await _repo.DownloadFileAsync(info.Kb, info.KbSha256, GalleryRepositoryService.MaxKbBundleBytes)
                                      .ConfigureAwait(false);
            if (!download.Success)
                return KnowledgeInstallResult.Fail("Knowledge bundle download failed: " + (download.Message ?? "unknown error"));

            KbTemplateBundle bundle;
            try
            {
                var json = new UTF8Encoding(false).GetString(StripBom(download.Bytes));
                bundle = Newtonsoft.Json.JsonConvert.DeserializeObject<KbTemplateBundle>(json);
            }
            catch
            {
                return KnowledgeInstallResult.Fail("The knowledge bundle is not readable.");
            }
            if (bundle?.Seed == null)
                return KnowledgeInstallResult.Fail("The knowledge bundle carries no knowledge.");

            // ── resources first ──────────────────────────────
            var guideFiles = 0;
            var resourceProblem = (string)null;
            foreach (var res in bundle.Resources ?? new List<KbRepoFileInfo>())
            {
                if (res == null || string.IsNullOrWhiteSpace(res.Path)) continue;
                var written = await TryWriteKbResourceAsync(res, guidesDir).ConfigureAwait(false);
                if (written == null) guideFiles++;
                else { resourceProblem = written; break; }
            }
            if (resourceProblem != null)
                return KnowledgeInstallResult.Fail("Design guide not installed: " + resourceProblem);

            // ── then the rows ────────────────────────────────
            MegaForm.Core.Services.AiKnowledge.AiKnowledgeSeedMerger.Result merge;
            try
            {
                merge = MegaForm.Core.Services.AiKnowledge.AiKnowledgeSeedMerger.Merge(
                    bundle.Seed.ToString(Newtonsoft.Json.Formatting.None), knowledge, userId);
            }
            catch
            {
                return KnowledgeInstallResult.Fail("The knowledge store rejected this template's knowledge.");
            }

            // A merge that wrote nothing is a FAILURE, not a quiet success. Row-level errors are
            // collected by the merger rather than thrown, so without this check a bundle whose
            // every row failed would report "installed".
            if (merge.Entries == 0)
                return KnowledgeInstallResult.Fail(
                    "No knowledge rows could be written"
                    + (merge.Errors.Count > 0 ? " (" + merge.Errors.Count + " row error(s))" : "") + ".");

            return new KnowledgeInstallResult
            {
                Installed = true,
                Entries = merge.Entries,
                Rules = merge.Rules,
                GuideFiles = guideFiles,
                Message = "Installed " + merge.Entries + " knowledge entr" + (merge.Entries == 1 ? "y" : "ies")
                    + (guideFiles > 0 ? " and " + guideFiles + " design guide file(s)" : string.Empty)
                    + (merge.Errors.Count > 0 ? " (" + merge.Errors.Count + " row(s) skipped)" : string.Empty) + ".",
            };
        }

        /// <summary>
        /// Writes one guide resource under <paramref name="guidesDir"/>. Returns null on success
        /// or a message describing why not. Hardened the same way as the artwork extractor: the
        /// name is sanitized, the RESOLVED path must still be inside the root, and the extension
        /// must be on the allowlist. Unlike artwork, an existing file IS overwritten — the guide
        /// is versioned with the template, and a stale contract is worse than a replaced one.
        /// </summary>
        private async Task<string> TryWriteKbResourceAsync(KbRepoFileInfo res, string guidesDir)
        {
            if (string.IsNullOrWhiteSpace(guidesDir)) return "no guide folder is configured on this site";

            var safeRel = GalleryRepositoryService.SanitizeRelativePath(res.Path);
            if (safeRel == null) return "unsafe path in the bundle";
            // Resources are published under kb/TemplateGuides/<name>; only the leaf is used, so a
            // bundle cannot choose a subdirectory of the module's Resources folder.
            var name = safeRel.Substring(safeRel.LastIndexOf('/') + 1);
            if (name.Length == 0) return "unnamed resource in the bundle";
            var ext = System.IO.Path.GetExtension(name);
            if (Array.IndexOf(AllowedKbResourceExtensions, (ext ?? string.Empty).ToLowerInvariant()) < 0)
                return "unsupported guide file type '" + ext + "'";

            var download = await _repo.DownloadFileAsync(safeRel, res.Sha256, GalleryRepositoryService.MaxKbResourceBytes)
                                      .ConfigureAwait(false);
            if (!download.Success) return download.Message ?? "download failed";

            try
            {
                var rootFull = System.IO.Path.GetFullPath(guidesDir);
                var rootPrefix = rootFull.TrimEnd(System.IO.Path.DirectorySeparatorChar, System.IO.Path.AltDirectorySeparatorChar)
                                 + System.IO.Path.DirectorySeparatorChar;
                var dest = System.IO.Path.GetFullPath(System.IO.Path.Combine(rootFull, name));
                if (!dest.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase)) return "path escapes the guide folder";
                System.IO.Directory.CreateDirectory(rootFull);
                System.IO.File.WriteAllBytes(dest, download.Bytes);
                return null;
            }
            catch
            {
                return "could not be written to disk";
            }
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
