using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Sdk;
using MegaForm.Umbraco.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Web.Common.Authorization;
using MegaForm.Umbraco.Permissions;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Upload/SDK parity endpoints for the Umbraco host.
    /// Mirrors MegaForm.Web.Controllers.MegaFormController.UploadAndSdk so the
    /// shared admin UI (image gallery, PDF template upload, SDK demo download)
    /// works unchanged on Umbraco.
    /// </summary>
    public partial class MegaFormApiController
    {
        private static readonly HashSet<string> _imageUploadExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"
        };

        private string ImagesPublicRoot()
        {
            var webRoot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath ?? AppContext.BaseDirectory, "wwwroot");
            return Path.Combine(webRoot, "megaform", "images");
        }

        private string PdfTemplatesPublicRoot()
        {
            var webRoot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath ?? AppContext.BaseDirectory, "wwwroot");
            return Path.Combine(webRoot, "megaform", "pdf-templates");
        }

        // ═══════════════════════════════════════════════════════════════════
        //  IMAGE UPLOAD + GALLERY
        // ═══════════════════════════════════════════════════════════════════

        [HttpPost]
        [MegaFormAuthorize(MegaFormPermissionConstants.TemplatesLetter)]
        [Route("Upload/Image")]
        [Route("/umbraco/MegaForm/MegaFormApi/Upload/Image")]
        [Route("/api/MegaForm/Upload/Image")]
        public async Task<IActionResult> UploadImage(IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "No file uploaded" });

            var originalName = Path.GetFileName(file.FileName ?? string.Empty);
            var ext = (Path.GetExtension(originalName) ?? string.Empty).Trim().ToLowerInvariant();
            if (!_imageUploadExtensions.Contains(ext))
                return BadRequest(new { error = "File type not allowed. Accepted: JPEG, PNG, GIF, WebP, SVG, BMP." });

            const long MaxBytes = 5L * 1024L * 1024L;
            if (file.Length > MaxBytes)
                return BadRequest(new { error = "Image must be under 5 MB." });

            try
            {
                var monthFolder = DateTime.UtcNow.ToString("yyyy-MM");
                var root = ImagesPublicRoot();
                var folder = Path.Combine(root, monthFolder);
                Directory.CreateDirectory(folder);

                var safeName = Guid.NewGuid().ToString("N") + ext;
                var fullPath = Path.Combine(folder, safeName);
                using (var stream = file.OpenReadStream())
                {
                    using var fileStream = System.IO.File.Create(fullPath);
                    await stream.CopyToAsync(fileStream);
                }

                var url = "/megaform/images/" + monthFolder + "/" + safeName;
                return Ok(new
                {
                    url = url,
                    fileName = safeName,
                    size = file.Length,
                    type = file.ContentType ?? "application/octet-stream"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Upload failed: " + ex.Message });
            }
        }

        [HttpGet]
        [MegaFormAuthorize(MegaFormPermissionConstants.TemplatesLetter)]
        [Route("Upload/List")]
        [Route("/umbraco/MegaForm/MegaFormApi/Upload/List")]
        [Route("/api/MegaForm/Upload/List")]
        public IActionResult UploadImageList()
        {
            try
            {
                var root = ImagesPublicRoot();
                var items = new List<object>();
                if (Directory.Exists(root))
                {
                    var files = Directory.EnumerateFiles(root, "*.*", SearchOption.AllDirectories)
                        .Where(p => _imageUploadExtensions.Contains(Path.GetExtension(p) ?? string.Empty))
                        .Select(p => new FileInfo(p))
                        .OrderByDescending(fi => fi.LastWriteTimeUtc)
                        .Take(200)
                        .Select(fi =>
                        {
                            var relative = fi.FullName.Substring(root.Length).Replace('\\', '/').TrimStart('/');
                            return new
                            {
                                url = "/megaform/images/" + relative,
                                fileName = fi.Name,
                                size = fi.Length,
                                modified = fi.LastWriteTimeUtc
                            };
                        })
                        .ToList();
                    items.AddRange(files);
                }
                return Ok(new { items });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Gallery list failed: " + ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        //  PDF FORM TEMPLATES
        // ═══════════════════════════════════════════════════════════════════

        [HttpPost]
        [MegaFormAuthorize(MegaFormPermissionConstants.TemplatesLetter)]
        [Route("PdfForm/UploadTemplate")]
        [Route("/umbraco/MegaForm/MegaFormApi/PdfForm/UploadTemplate")]
        [Route("/api/MegaForm/PdfForm/UploadTemplate")]
        public async Task<IActionResult> UploadPdfTemplate(IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "No file uploaded" });

            var originalName = Path.GetFileName(file.FileName ?? string.Empty);
            var ext = (Path.GetExtension(originalName) ?? string.Empty).Trim().ToLowerInvariant();
            if (!string.Equals(ext, ".pdf", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { error = "Only .pdf files are accepted" });

            const long MaxBytes = 50L * 1024L * 1024L;
            if (file.Length > MaxBytes)
                return BadRequest(new { error = "PDF template must be under 50 MB." });

            try
            {
                var root = PdfTemplatesPublicRoot();
                Directory.CreateDirectory(root);

                var safeName = Guid.NewGuid().ToString("N") + ".pdf";
                var fullPath = Path.Combine(root, safeName);
                using (var stream = file.OpenReadStream())
                {
                    using var fileStream = System.IO.File.Create(fullPath);
                    await stream.CopyToAsync(fileStream);
                }

                var url = "/megaform/pdf-templates/" + safeName;
                return Ok(new
                {
                    url = url,
                    fileName = originalName,
                    size = file.Length,
                    type = "application/pdf"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "PDF template upload failed: " + ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        //  SDK FILES DEMO DOWNLOAD
        // ═══════════════════════════════════════════════════════════════════

        [HttpGet]
        [Authorize]
        [Route("SdkDemo/Download")]
        [Route("/umbraco/MegaForm/MegaFormApi/SdkDemo/Download")]
        [Route("/api/MegaForm/SdkDemo/Download")]
        public async Task<IActionResult> SdkDemoDownload([FromQuery] int submissionId, [FromQuery] int fileId, [FromQuery] string path)
        {
            if (!string.IsNullOrWhiteSpace(path))
                return ServePrivateUploadByPath(path);

            if (submissionId <= 0 || fileId <= 0) return NotFound();

            var sub = _subRepo.Get(submissionId);
            if (sub == null) return NotFound();
            var actor = BuildUserContext();
            var isOwner = sub.UserId.HasValue && sub.UserId.Value > 0 && sub.UserId.Value == actor.UserId;
            if (!IsSubmissionAdmin(actor) && !isOwner) return NotFound();

            var sdk = HttpContext?.RequestServices?.GetService(typeof(IMegaFormClient)) as IMegaFormClient;
            if (sdk == null)
                return ServeFileBySubmissionFallback(submissionId, fileId);

            var content = await sdk.Files.OpenAsync(submissionId, fileId);
            if (content == null || content.Content == null)
                return ServeFileBySubmissionFallback(submissionId, fileId);

            var ct = string.IsNullOrWhiteSpace(content.ContentType) ? "application/octet-stream" : content.ContentType;
            return File(content.Content, ct, string.IsNullOrWhiteSpace(content.FileName) ? ("file-" + fileId) : content.FileName);
        }

        private IActionResult ServePrivateUploadByPath(string relativePath)
        {
            if (string.IsNullOrWhiteSpace(relativePath)) return NotFound();

            var safePath = relativePath.Replace("..", string.Empty).TrimStart('/', '\\').Replace('/', Path.DirectorySeparatorChar);
            var appDataRoot = MegaFormUmbracoPaths.GetPrivateUploadsPath(_env);
            var fullPath = Path.GetFullPath(Path.Combine(appDataRoot, safePath));
            var rootWithSep = appDataRoot.EndsWith(Path.DirectorySeparatorChar) ? appDataRoot : appDataRoot + Path.DirectorySeparatorChar;
            if (!fullPath.StartsWith(rootWithSep, StringComparison.OrdinalIgnoreCase) || !System.IO.File.Exists(fullPath))
                return NotFound();

            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(fullPath, out var contentType))
                contentType = "application/octet-stream";

            return PhysicalFile(fullPath, contentType, Path.GetFileName(fullPath));
        }

        private IActionResult ServeFileBySubmissionFallback(int submissionId, int fileId)
        {
            var fileRepo = HttpContext?.RequestServices?.GetService(typeof(Core.Interfaces.IFileRepository)) as Core.Interfaces.IFileRepository;
            if (fileRepo == null) return NotFound();
            var row = fileRepo.GetBySubmission(submissionId)?.FirstOrDefault(f => f.FileId == fileId);
            if (row == null || string.IsNullOrWhiteSpace(row.StoredPath)) return NotFound();
            return ServePrivateUploadByPath(row.StoredPath);
        }

        private bool IsSubmissionAdmin(Core.Services.UserContext actor)
        {
            return actor != null && (actor.IsAdmin || actor.IsSuperUser);
        }

    }
}
