using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;

namespace MegaForm.Web.Controllers
{
    // [WebUploadSdk v20260710] Image upload/list, PDF form template upload,
    // and SDK demo download endpoints for the standalone Web host.
    // Mirrors Oqtane/DNN shapes so the shared frontend works unchanged.
    public partial class MegaFormController
    {
        private static readonly HashSet<string> _imageUploadExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp" };

        private string ImagesPublicRoot()
        {
            var webRoot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath ?? AppDomain.CurrentDomain.BaseDirectory, "wwwroot");
            return Path.Combine(webRoot, "megaform", "images");
        }

        private string PdfTemplatesPublicRoot()
        {
            var webRoot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath ?? AppDomain.CurrentDomain.BaseDirectory, "wwwroot");
            return Path.Combine(webRoot, "megaform", "pdf-templates");
        }

        // ═══════════════════════════════════════════════════════════════════
        //  IMAGE UPLOAD + GALLERY (HTML Token Designer)
        // ═══════════════════════════════════════════════════════════════════

        [HttpPost("Upload/Image")]
        [Authorize(Roles = "Administrator")]
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

        [HttpGet("Upload/List")]
        [Authorize(Roles = "Administrator")]
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
                        .Select(p => new System.IO.FileInfo(p))
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

        [HttpPost("PdfForm/UploadTemplate")]
        [Authorize(Roles = "Administrator")]
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

        [HttpGet("SdkDemo/Download")]
        [Authorize]
        public async Task<IActionResult> SdkDemoDownload([FromQuery] int submissionId, [FromQuery] int fileId, [FromQuery] string path)
        {
            if (!string.IsNullOrWhiteSpace(path))
                return ServePrivateUploadByPath(path);

            if (submissionId <= 0 || fileId <= 0) return NotFound();

            var sub = _subRepo.Get(submissionId);
            if (sub == null) return NotFound();
            var actor = GetCurrentUserContext();
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
            var appDataRoot = Path.GetFullPath(Path.Combine(_env.ContentRootPath ?? AppDomain.CurrentDomain.BaseDirectory, "App_Data", "MegaForm", "PrivateUploads"));
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
            var row = _fileRepo.GetBySubmission(submissionId)?.FirstOrDefault(f => f.FileId == fileId);
            if (row == null || string.IsNullOrWhiteSpace(row.StoredPath)) return NotFound();
            return ServePrivateUploadByPath(row.StoredPath);
        }

        private bool IsSubmissionAdmin(UserContext actor)
        {
            return actor != null && (actor.IsAdmin || actor.IsSuperUser);
        }
    }
}
