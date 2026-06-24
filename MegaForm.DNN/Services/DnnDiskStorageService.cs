using System;
using System.IO;
using System.Threading.Tasks;
using System.Web.Hosting;
using MegaForm.Core.Interfaces;

namespace MegaForm.DNN.Services
{
    /// <summary>
    /// Disk-backed <see cref="IStorageService"/> for DNN, rooted at
    /// <c>~/App_Data/MegaForm/PrivateUploads</c> — the SAME location the MegaForm DNN
    /// upload pipeline already writes to (see <c>MegaFormApiController.UploadFile</c>),
    /// so the SDK Files API can stream back files that were uploaded through normal forms.
    /// StoredPath values are relative to that root. Added 2026-06-13 for the SDK Files API.
    /// </summary>
    public sealed class DnnDiskStorageService : IStorageService
    {
        private static string Root()
        {
            var root = HostingEnvironment.MapPath("~/App_Data/MegaForm/PrivateUploads")
                       ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "App_Data", "MegaForm", "PrivateUploads");
            return Path.GetFullPath(root);
        }

        public async Task<string> SaveFileAsync(Stream stream, string fileName, string folder)
        {
            var safeName = Path.GetFileName(fileName ?? "file");
            var rel = string.IsNullOrWhiteSpace(folder)
                ? (Guid.NewGuid().ToString("N") + "_" + safeName)
                : folder.Replace('\\', '/').Trim('/') + "/" + Guid.NewGuid().ToString("N") + "_" + safeName;
            var full = ResolveFull(rel);
            Directory.CreateDirectory(Path.GetDirectoryName(full));
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

        public string GetFileUrl(string filePath) =>
            "/DesktopModules/MegaForm/API/Files/Download?path=" + Uri.EscapeDataString(filePath ?? string.Empty);

        // Keep all access under the PrivateUploads root (prevent path traversal).
        private static string ResolveFull(string relativePath)
        {
            var root = Root();
            var rel = (relativePath ?? string.Empty).TrimStart('/', '\\').Replace('/', Path.DirectorySeparatorChar);
            var full = Path.GetFullPath(Path.Combine(root, rel));
            var prefix = root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Invalid file path.");
            return full;
        }
    }
}
