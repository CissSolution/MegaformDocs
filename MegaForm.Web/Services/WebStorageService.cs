using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using MegaForm.Core.Interfaces;

namespace MegaForm.Web.Services
{
    /// <summary>
    /// Stores uploads in App_Data/MegaForm/PrivateUploads (outside public wwwroot).
    /// Files are addressed by internal relative path and only downloaded via API.
    /// </summary>
    public class WebStorageService : IStorageService
    {
        private readonly string _privateRoot;
        private readonly string _baseUrl;

        public WebStorageService(IWebHostEnvironment env, string baseUrl = "")
        {
            var contentRoot = env.ContentRootPath ?? AppContext.BaseDirectory;
            _privateRoot = Path.Combine(contentRoot, "App_Data", "MegaForm", "PrivateUploads");
            Directory.CreateDirectory(_privateRoot);
            _baseUrl = (baseUrl ?? string.Empty).TrimEnd('/');
        }

        public async Task<string> SaveFileAsync(Stream stream, string fileName, string folder)
        {
            var safeFolder = SanitizeFolder(folder);
            var dir = Path.Combine(_privateRoot, safeFolder);
            Directory.CreateDirectory(dir);

            var ext = SanitizeExtension(Path.GetExtension(fileName));
            var unique = $"{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}{ext}";
            var fullPath = Path.Combine(dir, unique);

            using (var fs = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                await stream.CopyToAsync(fs);
            }

            return CombineRelative(safeFolder, unique);
        }

        public Stream GetFile(string filePath)
        {
            var full = ResolvePath(filePath);
            return full != null && File.Exists(full) ? File.OpenRead(full) : null;
        }

        public void DeleteFile(string filePath)
        {
            var full = ResolvePath(filePath);
            if (full != null && File.Exists(full)) File.Delete(full);
        }

        public string GetFileUrl(string filePath)
        {
            var rel = Uri.EscapeDataString((filePath ?? string.Empty).Replace('\\', '/').TrimStart('/'));
            if (string.IsNullOrWhiteSpace(rel)) return string.Empty;
            return $"{_baseUrl}/api/MegaForm/Files/Download?path={rel}";
        }

        private string ResolvePath(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath)) return null;
            var rel = filePath.Replace('\\', '/').TrimStart('/');
            if (rel.Contains("..")) return null;
            var full = Path.GetFullPath(Path.Combine(_privateRoot, rel));
            var root = Path.GetFullPath(_privateRoot);
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) return null;
            return full;
        }

        private static string SanitizeFolder(string folder)
        {
            if (string.IsNullOrWhiteSpace(folder)) return "misc";
            var normalized = folder.Replace('\\', '/').Trim('/');
            var parts = normalized.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            var safeParts = new System.Collections.Generic.List<string>();
            foreach (var part in parts)
            {
                var cleaned = Regex.Replace(part ?? string.Empty, @"[^a-zA-Z0-9_-]", "-").Trim('-');
                if (!string.IsNullOrWhiteSpace(cleaned)) safeParts.Add(cleaned);
            }
            return safeParts.Count > 0 ? string.Join(Path.DirectorySeparatorChar.ToString(), safeParts) : "misc";
        }

        private static string SanitizeExtension(string ext)
        {
            var safe = Regex.Replace((ext ?? string.Empty).Trim(), @"[^a-zA-Z0-9\.]", string.Empty).ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(safe)) return ".bin";
            return safe.StartsWith(".") ? safe : "." + safe;
        }

        private static string CombineRelative(string folder, string fileName)
        {
            var combined = string.IsNullOrWhiteSpace(folder) ? fileName : Path.Combine(folder, fileName);
            return combined.Replace('\\', '/');
        }
    }
}
