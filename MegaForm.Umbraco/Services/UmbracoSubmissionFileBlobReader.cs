using System;
using System.IO;
using MegaForm.Core.Integrations.Storage;
using Microsoft.Extensions.Hosting;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// [CloudStorage v20260723-01] Opens a previously uploaded submission file so the
    /// cloud storage mirror (SubmissionCloudStorageUploader) can push it to Drive/S3/Azure.
    /// Uploads land under App_Data/MegaForm/TempUploads (see MegaFormApiController.UploadFile)
    /// and the File field metadata records that ROOT-RELATIVE path ("App_Data/MegaForm/..."),
    /// so this reader maps it back against the content root. Canonical-path containment under
    /// App_Data/MegaForm mirrors UmbracoStorageService.ResolvePath — a stored path can never
    /// escape the MegaForm data folder. Returns null when the file cannot be opened
    /// (the uploader treats null as "skip this file" — fail-soft by contract).
    /// </summary>
    public sealed class UmbracoSubmissionFileBlobReader : ISubmissionFileBlobReader
    {
        private readonly IHostEnvironment _env;

        public UmbracoSubmissionFileBlobReader(IHostEnvironment env)
        {
            _env = env ?? throw new ArgumentNullException(nameof(env));
        }

        public Stream OpenRead(string storedPath)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(storedPath)) return null;
                var rel = storedPath.Replace('\\', '/').TrimStart('/');
                if (rel.Contains("..")) return null;

                var contentRoot = Path.GetFullPath(MegaFormUmbracoPaths.GetContentRoot(_env));
                var megaFormRoot = Path.GetFullPath(Path.Combine(
                    contentRoot, MegaFormUmbracoPaths.AppDataMegaForm.Replace('/', Path.DirectorySeparatorChar)));
                var full = Path.GetFullPath(Path.Combine(contentRoot, rel.Replace('/', Path.DirectorySeparatorChar)));
                var rootWithSep = megaFormRoot.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                if (!full.StartsWith(rootWithSep, StringComparison.OrdinalIgnoreCase)) return null;

                return File.Exists(full)
                    ? new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read)
                    : null;
            }
            catch
            {
                return null;
            }
        }
    }
}
