using System;
using System.IO;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;

namespace MegaForm.NopCommerce.Plugin.Controllers
{
    /// <summary>
    /// Serves MegaForm static assets (JS, CSS, fonts, images, i18n) from the plugin folder.
    /// This is a fallback in case the UseStaticFiles registration in NopCommerceStartup
    /// is not early enough in the nopCommerce pipeline to intercept /megaform-assets requests.
    /// </summary>
    [Route("megaform-assets")]
    [AllowAnonymous]
    public class MegaFormAssetController : Controller
    {
        private readonly IWebHostEnvironment _env;

        public MegaFormAssetController(IWebHostEnvironment env)
        {
            _env = env;
        }

        [HttpGet("{*path}")]
        public IActionResult Serve(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return NotFound();

            var safe = path.Replace("..", "")
                .Replace("//", "/")
                .TrimStart('/');

            var file = Path.Combine(
                _env.ContentRootPath,
                "Plugins",
                "MegaForm.NopCommerce.Plugin",
                "Assets",
                safe);

            if (!System.IO.File.Exists(file))
                return NotFound();

            return PhysicalFile(file, GetMimeType(file));
        }

        private static string GetMimeType(string file)
        {
            var ext = Path.GetExtension(file).ToLowerInvariant();
            return ext switch
            {
                ".js" => "application/javascript",
                ".mjs" => "application/javascript",
                ".css" => "text/css",
                ".html" => "text/html",
                ".json" => "application/json",
                ".png" => "image/png",
                ".jpg" or ".jpeg" => "image/jpeg",
                ".gif" => "image/gif",
                ".svg" => "image/svg+xml",
                ".webp" => "image/webp",
                ".woff" => "font/woff",
                ".woff2" => "font/woff2",
                ".ttf" => "font/ttf",
                ".eot" => "application/vnd.ms-fontobject",
                ".otf" => "font/otf",
                _ => "application/octet-stream"
            };
        }
    }
}
