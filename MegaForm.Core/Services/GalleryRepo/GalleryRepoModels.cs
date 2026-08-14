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
        /// <summary>[KbPerTemplate v20260812] Repo-relative path of this template's AI-knowledge
        /// bundle ("kb/templates/&lt;slug&gt;.json"); null on a manifest published before the KB
        /// channel existed. The bundle carries a seed-shaped document
        /// (AiKnowledgeSeedMerger.Merge consumes it verbatim) plus the hashes of the guide files
        /// it references — so a template and its knowledge share one version and one push.</summary>
        public string Kb { get; set; }
        /// <summary>sha256 of the KB bundle. MANDATORY when <see cref="Kb"/> is set:
        /// DownloadFileAsync refuses unverifiable downloads, so a bundle without its own hash
        /// could never install.</summary>
        public string KbSha256 { get; set; }
        public long KbSizeBytes { get; set; }
        public bool Premium { get; set; }
        /// <summary>Number of fields, straight from the manifest — lets the gallery caption a card
        /// ("Events · 20 fields") without first downloading the template document.</summary>
        public int FieldCount { get; set; }
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
        /// <summary>The canonical AI-knowledge seed JSON (entries + templates + rules).
        /// Null since [KbPerTemplate v20260812]: template knowledge is published PER TEMPLATE
        /// (see <see cref="Templates"/>) and the module's own core knowledge still ships in the
        /// package, so there is no whole-KB blob to sync.</summary>
        public KbRepoFileInfo Seed { get; set; }
        /// <summary>Resource files mirrored to the host's module Resources folder
        /// (PromptRecipes/*.md, TemplateGuides/*) — AI tools resolve them from disk.</summary>
        public List<KbRepoFileInfo> Files { get; set; } = new List<KbRepoFileInfo>();
        /// <summary>[KbPerTemplate v20260812] One knowledge bundle per published template.
        /// This is a channel INDEX (what knowledge exists, pinned by hash) — an install resolves
        /// a single bundle from the template manifest's Kb/KbSha256 pointer and never reads this,
        /// so a stale copy here cannot break an install.</summary>
        public List<KbRepoTemplateInfo> Templates { get; set; } = new List<KbRepoTemplateInfo>();
    }

    /// <summary>[KbPerTemplate v20260812] One template's knowledge bundle in kb/manifest.json.</summary>
    public sealed class KbRepoTemplateInfo
    {
        public string Slug { get; set; }
        /// <summary>Repo-relative path ("kb/templates/&lt;slug&gt;.json").</summary>
        public string Path { get; set; }
        public string Sha256 { get; set; }
        public long SizeBytes { get; set; }
    }

    /// <summary>
    /// [KbPerTemplate v20260812] One template's knowledge bundle, as published.
    /// <see cref="Seed"/> is handed to AiKnowledgeSeedMerger.Merge verbatim; <see cref="Resources"/>
    /// are the guide/facts files that seed's rows point at through {"guide_file": …} and are
    /// written into the host's Resources/TemplateGuides folder.
    /// </summary>
    public sealed class KbTemplateBundle
    {
        public int KbVersion { get; set; }
        public string Slug { get; set; }
        public Newtonsoft.Json.Linq.JObject Seed { get; set; }
        public List<KbRepoFileInfo> Resources { get; set; } = new List<KbRepoFileInfo>();
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
