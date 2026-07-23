using System;
using System.IO;
using MegaForm.Core.Integrations.Storage;
using Microsoft.AspNetCore.Hosting;

namespace MegaForm.Web.Services
{
    /// <summary>
    /// [CloudStorage v20260723-01] Opens a previously uploaded submission file for the
    /// post-submit cloud mirror (SubmissionCloudStorageUploader). Reads from the SAME private
    /// root WebStorageService writes to (App_Data/MegaForm/PrivateUploads) with the same
    /// traversal guard as WebStorageService.ResolvePath. Returns null for empty/escaping/
    /// missing paths — the uploader treats null as "skip this file".
    /// </summary>
    public class WebSubmissionFileBlobReader : ISubmissionFileBlobReader
    {
        private readonly string _privateRoot;

        public WebSubmissionFileBlobReader(IWebHostEnvironment env)
        {
            var contentRoot = env.ContentRootPath ?? AppContext.BaseDirectory;
            _privateRoot = Path.Combine(contentRoot, "App_Data", "MegaForm", "PrivateUploads");
        }

        public Stream OpenRead(string storedPath)
        {
            if (string.IsNullOrWhiteSpace(storedPath)) return null;
            try
            {
                var rel = storedPath.Replace('\\', '/').TrimStart('/');
                if (rel.Contains("..")) return null;
                var full = Path.GetFullPath(Path.Combine(_privateRoot, rel));
                var root = Path.GetFullPath(_privateRoot);
                if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) return null;
                return File.Exists(full) ? File.OpenRead(full) : null;
            }
            catch
            {
                return null;
            }
        }
    }
}
