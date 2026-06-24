using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using MegaForm.Core.Interfaces;

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// Disk-backed <see cref="IStorageService"/> for Oqtane, rooted at
    /// <c>{ContentRootPath}/App_Data/MegaForm/PrivateUploads</c> — the SAME location the
    /// MegaForm upload pipeline already writes to (see <c>MegaFormController.UploadFile</c>),
    /// so the SDK Files API can stream back files uploaded through normal forms. StoredPath
    /// values are relative to that root (e.g. <c>form-7/field-cv/abc.pdf</c>, the upload's
    /// <c>tempPath</c>). Aligned 2026-06-16 (was Data/MegaFormFiles, which the upload path
    /// never wrote to → GetFile always missed). Mirrors DNN's <c>DnnDiskStorageService</c>.
    /// </summary>
    public sealed class OqtaneStorageService : IStorageService
    {
        private readonly string _baseDir;

        public OqtaneStorageService(IWebHostEnvironment env)
        {
            var root = env?.ContentRootPath ?? Directory.GetCurrentDirectory();
            _baseDir = Path.Combine(root, "App_Data", "MegaForm", "PrivateUploads");
        }

        public async Task<string> SaveFileAsync(Stream stream, string fileName, string folder)
        {
            var safeName = Path.GetFileName(fileName ?? "file");
            var rel = string.IsNullOrWhiteSpace(folder)
                ? Guid.NewGuid().ToString("N") + "_" + safeName
                : folder.Replace('\\', '/').Trim('/') + "/" + Guid.NewGuid().ToString("N") + "_" + safeName;
            var full = ResolveFull(rel);
            Directory.CreateDirectory(Path.GetDirectoryName(full)!);
            using (var fs = new FileStream(full, FileMode.Create, FileAccess.Write))
            {
                await stream.CopyToAsync(fs).ConfigureAwait(false);
            }
            return rel;
        }

        public Stream GetFile(string filePath)
        {
            var full = ResolveFull(filePath);
            return File.Exists(full) ? new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read) : null;
        }

        public void DeleteFile(string filePath)
        {
            var full = ResolveFull(filePath);
            if (File.Exists(full)) File.Delete(full);
        }

        public string GetFileUrl(string filePath) => "/api/MegaForm/SdkDemo/Download?path=" + Uri.EscapeDataString(filePath ?? string.Empty);

        // Keep all access inside _baseDir (prevent path traversal).
        private string ResolveFull(string relativePath)
        {
            var rel = (relativePath ?? string.Empty).Replace('\\', '/').TrimStart('/');
            var full = Path.GetFullPath(Path.Combine(_baseDir, rel));
            var baseFull = Path.GetFullPath(_baseDir);
            // Compare with a trailing separator so a sibling dir whose name is a prefix of the
            // base (…/PrivateUploads_x) can't slip past the StartsWith containment check.
            var baseWithSep = baseFull.EndsWith(Path.DirectorySeparatorChar) ? baseFull : baseFull + Path.DirectorySeparatorChar;
            if (!full.Equals(baseFull, StringComparison.OrdinalIgnoreCase) &&
                !full.StartsWith(baseWithSep, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Invalid file path.");
            return full;
        }
    }
}
