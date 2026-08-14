using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using MegaForm.Core.Interfaces;

namespace MegaForm.NopCommerce.Plugin.Services
{
    /// <summary>
    /// File storage implementation for nopCommerce — keeps uploads inside the plugin's App_Data/Uploads folder.
    /// </summary>
    public class NopCommerceStorageService : IStorageService
    {
        private readonly IWebHostEnvironment _hostingEnvironment;

        public NopCommerceStorageService(IWebHostEnvironment hostingEnvironment)
        {
            _hostingEnvironment = hostingEnvironment;
        }

        private string UploadRoot => Path.Combine(
            _hostingEnvironment.ContentRootPath,
            "Plugins",
            "MegaForm.NopCommerce.Plugin",
            "App_Data",
            "Uploads");

        public Task<string> SaveFileAsync(Stream stream, string fileName, string folder)
        {
            var dir = Path.Combine(UploadRoot, folder ?? "");
            Directory.CreateDirectory(dir);
            var unique = Guid.NewGuid().ToString("N");
            var path = Path.Combine(dir, unique + "_" + (fileName ?? "file"));
            using (var fs = System.IO.File.Create(path))
            {
                stream.CopyTo(fs);
            }
            return Task.FromResult(path);
        }

        public Stream GetFile(string filePath)
        {
            var full = ResolvePath(filePath);
            if (!System.IO.File.Exists(full)) return null;
            return System.IO.File.OpenRead(full);
        }

        public void DeleteFile(string filePath)
        {
            var full = ResolvePath(filePath);
            if (System.IO.File.Exists(full))
                System.IO.File.Delete(full);
        }

        public string GetFileUrl(string filePath)
        {
            // Public download URLs require a separate endpoint (not included in v1 scaffold).
            return filePath;
        }

        private string ResolvePath(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath)) return null;
            if (filePath.StartsWith("~/"))
                return Path.Combine(_hostingEnvironment.ContentRootPath, filePath.TrimStart('~', '/').Replace('/', Path.DirectorySeparatorChar));
            return filePath;
        }
    }
}
