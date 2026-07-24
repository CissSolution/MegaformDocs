using System;
using System.Collections.Generic;

namespace MegaForm.Core.Services.GalleryRepo
{
    /// <summary>
    /// [GalleryRepo v20260723] Models for the MegaForm Gallery Repository — a static
    /// HTTPS repository (GitHub Pages / R2) hosting downloadable premium form
    /// templates AND the AI Knowledge payload (seed JSON + PromptRecipes +
    /// TemplateGuides). The module downloads/updates these only on activated
    /// (licensed) installs; the gate is enforced host-side (LicenseService.IsTrial),
    /// never here — this layer is pure fetch/validate.
    /// </summary>
    public sealed class GalleryRepoTemplateInfo
    {
        public string Slug { get; set; }
        public string Title { get; set; }
        public string Description { get; set; }
        public string Category { get; set; }
        public string[] Categories { get; set; } = new string[0];
        public string Icon { get; set; }
        public string Version { get; set; }
        public string UpdatedUtc { get; set; }
        /// <summary>Repo-relative path of the template JSON (e.g. "templates/<slug>.json").</summary>
        public string File { get; set; }
        /// <summary>Optional repo-relative assets zip (hero images...); null when none.</summary>
        public string Assets { get; set; }
        /// <summary>[GalleryAssets v20260724] sha256 of the assets zip. MANDATORY when
        /// <see cref="Assets"/> is set — DownloadFileAsync refuses unverifiable downloads, so an
        /// assets zip without its own hash could never be installed.</summary>
        public string AssetsSha256 { get; set; }
        public long AssetsSizeBytes { get; set; }
        /// <summary>Repo-relative image paths carried by the assets zip, relative to the module
        /// image root (e.g. "img/euro-youth/euro-youth-hero.png"). Informational — the zip is the
        /// source of truth; hosts extract it with zip-slip protection.</summary>
        public string[] AssetFiles { get; set; } = new string[0];
        public string Sha256 { get; set; }
        public long SizeBytes { get; set; }
        public bool Premium { get; set; }
        public string MinModuleVersion { get; set; }
    }

    public sealed class GalleryRepoManifest
    {
        public int RepoVersion { get; set; }
        public string GeneratedUtc { get; set; }
        public List<GalleryRepoTemplateInfo> Templates { get; set; } = new List<GalleryRepoTemplateInfo>();
    }

    public sealed class KbRepoFileInfo
    {
        /// <summary>Repo-relative path ("kb/ai-knowledge-seed.json", "kb/PromptRecipes/x.md", ...).</summary>
        public string Path { get; set; }
        public string Sha256 { get; set; }
        public long SizeBytes { get; set; }
    }

    public sealed class KbRepoManifest
    {
        public int RepoVersion { get; set; }
        public string GeneratedUtc { get; set; }
        /// <summary>The canonical AI-knowledge seed JSON (entries + templates + rules).</summary>
        public KbRepoFileInfo Seed { get; set; }
        /// <summary>Resource files mirrored to the host's module Resources folder
        /// (PromptRecipes/*.md, TemplateGuides/*) — AI tools resolve them from disk.</summary>
        public List<KbRepoFileInfo> Files { get; set; } = new List<KbRepoFileInfo>();
    }

    /// <summary>Fetch result with offline fail-soft semantics: when the repo is
    /// unreachable but a (stale) cached copy exists, Success stays true and Offline is set.</summary>
    public sealed class GalleryRepoFetchResult<T>
    {
        public bool Success { get; set; }
        public bool Offline { get; set; }
        public string Message { get; set; }
        public T Value { get; set; }

        public static GalleryRepoFetchResult<T> Ok(T value, bool offline = false, string message = null)
            => new GalleryRepoFetchResult<T> { Success = true, Offline = offline, Message = message, Value = value };

        public static GalleryRepoFetchResult<T> Fail(string message)
            => new GalleryRepoFetchResult<T> { Success = false, Message = message };
    }

    public sealed class GalleryRepoDownloadResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public byte[] Bytes { get; set; }

        public static GalleryRepoDownloadResult Ok(byte[] bytes)
            => new GalleryRepoDownloadResult { Success = true, Bytes = bytes };

        public static GalleryRepoDownloadResult Fail(string message)
            => new GalleryRepoDownloadResult { Success = false, Message = message };
    }
}
