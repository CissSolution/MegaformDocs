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
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Web.Common.Authorization;
using MegaForm.Umbraco.Permissions;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Core.Services.GalleryRepo;

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
        [Authorize(Policy = "MegaFormApi")]
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

        // ══════════════════════════════════════════════════════
        //  REMOTE GALLERY (static HTTPS repo — GitHub Pages)
        //  Ported from MegaForm.Oqtane.Server for Umbraco parity.
        // ══════════════════════════════════════════════════════

        private GalleryInstallService BuildGalleryService()
        {
            var url = _configuration?["MegaForm:GalleryRepoUrl"];
            var token = _configuration?["MegaForm:GalleryRepoToken"];
            return new GalleryInstallService(new GalleryRepositoryService(url, token));
        }

        private string ResolveGalleryImageRoot()
        {
            try
            {
                var web = _env?.WebRootPath;
                if (string.IsNullOrWhiteSpace(web)) return null;
                return Path.Combine(web, "Modules", "MegaForm");
            }
            catch { return null; }
        }

        private string ResolveGalleryGuidesRoot()
        {
            try
            {
                var web = _env?.WebRootPath;
                if (string.IsNullOrWhiteSpace(web)) return null;
                return Path.Combine(web, "Modules", "MegaForm", "Resources", "TemplateGuides");
            }
            catch { return null; }
        }

        private int? ResolveGalleryAuditUserId()
        {
            var id = _platform?.UserId ?? -1;
            return id > 0 ? (int?)id : null;
        }

        private IActionResult GalleryDownloadTrialGate()
        {
            if (!LicenseService.IsTrial()) return null;
            return StatusCode(402, new
            {
                error = "trial_remote_gallery",
                message = "Installing templates from the online gallery is available on a paid license.",
                upgradeUrl = LicenseService.UpgradeUrl
            });
        }

        [HttpGet]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        [Route("BuilderTemplates/RemoteGalleryList")]
        [Route("/umbraco/MegaForm/MegaFormApi/BuilderTemplates/RemoteGalleryList")]
        [Route("/api/MegaForm/BuilderTemplates/RemoteGalleryList")]
        public async Task<IActionResult> RemoteGalleryList(bool refresh = false)
        {
            var svc = BuildGalleryService();
            var res = await svc.GetManifestAsync(refresh);
            if (!res.Success || res.Value == null)
                return StatusCode(503, new { error = "gallery_unavailable", message = res.Message });

            var localTemplates = _templateCatalog.List() ?? new List<UmbracoBuilderTemplateCatalogService.BuilderTemplateRecord>();
            var installed = new HashSet<string>(
                localTemplates.Select(t => (t?.Slug ?? string.Empty).Trim()),
                StringComparer.OrdinalIgnoreCase);

            var items = (res.Value.Templates ?? new List<GalleryRepoTemplateInfo>())
                .Where(t => t != null && !string.IsNullOrWhiteSpace(t.Slug))
                .Select(t => new
                {
                    slug = t.Slug,
                    title = t.Title,
                    description = t.Description,
                    category = t.Category,
                    categories = t.Categories,
                    icon = t.Icon,
                    version = t.Version,
                    sizeBytes = t.SizeBytes,
                    premium = t.Premium,
                    fieldCount = t.FieldCount,
                    installed = installed.Contains((t.Slug ?? string.Empty).Trim())
                })
                .ToList();

            return Ok(new
            {
                repoUrl = svc.RepoBaseUrl,
                offline = res.Offline,
                message = res.Message,
                trial = LicenseService.IsTrial(),
                templates = items
            });
        }

        [HttpGet]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        [Route("BuilderTemplates/RemoteGalleryPreview")]
        [Route("/umbraco/MegaForm/MegaFormApi/BuilderTemplates/RemoteGalleryPreview")]
        [Route("/api/MegaForm/BuilderTemplates/RemoteGalleryPreview")]
        public async Task<IActionResult> RemoteGalleryPreview(string slug)
        {
            var svc = BuildGalleryService();
            var fetch = await svc.FetchTemplateAsync(slug, forceRefresh: false);
            if (!fetch.Success)
                return BadRequest(new { error = "preview_failed", message = fetch.Error });

            try { await svc.InstallAssetsAsync(fetch.Info, ResolveGalleryImageRoot()); }
            catch { /* preview must still work without artwork */ }

            return Content(fetch.Json, "application/json");
        }

        [HttpPost]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        [Route("BuilderTemplates/RemoteGalleryInstall")]
        [Route("/umbraco/MegaForm/MegaFormApi/BuilderTemplates/RemoteGalleryInstall")]
        [Route("/api/MegaForm/BuilderTemplates/RemoteGalleryInstall")]
        public async Task<IActionResult> RemoteGalleryInstall([FromBody] System.Text.Json.JsonElement body)
        {
            var gate = GalleryDownloadTrialGate();
            if (gate != null) return gate;

            string slug = null;
            bool createForm = false;
            if (body.ValueKind == System.Text.Json.JsonValueKind.Object)
            {
                System.Text.Json.JsonElement slugEl;
                if (body.TryGetProperty("slug", out slugEl) || body.TryGetProperty("Slug", out slugEl))
                    slug = slugEl.ValueKind == System.Text.Json.JsonValueKind.String ? slugEl.GetString() : null;

                System.Text.Json.JsonElement createEl;
                if (body.TryGetProperty("createForm", out createEl))
                    createForm = createEl.ValueKind == System.Text.Json.JsonValueKind.True ||
                                 (createEl.ValueKind == System.Text.Json.JsonValueKind.String &&
                                  string.Equals(createEl.GetString(), "true", StringComparison.OrdinalIgnoreCase));
            }

            var svc = BuildGalleryService();
            var fetch = await svc.FetchTemplateAsync(slug, forceRefresh: false);
            if (!fetch.Success)
                return BadRequest(new { error = "install_failed", message = fetch.Error });

            try
            {
                var record = _templateCatalog.SaveTemplateJson(fetch.FileName, fetch.Json);
                var assets = await svc.InstallAssetsAsync(fetch.Info, ResolveGalleryImageRoot());

                var knowledge = new GalleryInstallService.KnowledgeInstallResult
                {
                    Installed = false,
                    NotPublished = true,
                    Message = "Knowledge service not available."
                };
                if (_knowledge != null)
                {
                    knowledge = await svc.InstallKnowledgeAsync(
                        fetch.Info, ResolveGalleryGuidesRoot(), _knowledge, ResolveGalleryAuditUserId());
                }

                int? formId = null;
                if (createForm)
                {
                    formId = CreateFormFromTemplateRecord(record);
                }

                // NewtonsoftJson vì `record` mang JArray/JObject — xem ghi chú ở helper.
                return NewtonsoftJson(new
                {
                    success = true,
                    slug = fetch.Slug,
                    template = record,
                    formId = formId,
                    assetsInstalled = assets.FilesWritten,
                    assetsError = assets.Success ? null : assets.Error,
                    knowledgeInstalled = knowledge.Installed,
                    knowledgeEntries = knowledge.Entries,
                    knowledgeGuides = knowledge.GuideFiles,
                    knowledgeError = knowledge.Installed || knowledge.NotPublished ? null : knowledge.Message,
                    knowledgeMessage = knowledge.Message
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "MegaForm gallery install failed for slug {Slug}", fetch.Slug);
                return StatusCode(500, new { error = "install_failed", message = "Could not save the downloaded template." });
            }
        }

        private int CreateFormFromTemplateRecord(Services.UmbracoBuilderTemplateCatalogService.BuilderTemplateRecord record)
        {
            var settings = record.Settings ?? new JObject();
            settings["customHtml"] = record.CustomHtml ?? settings["customHtml"] ?? string.Empty;
            settings["customCss"] = record.CustomCss ?? settings["customCss"] ?? string.Empty;
            settings["rules"] = record.Rules ?? settings["rules"] ?? new JArray();
            settings["workflowTemplate"] = record.Workflow ?? settings["workflowTemplate"];

            var schemaObj = new JObject
            {
                ["version"] = "1.0",
                ["fields"] = record.Fields ?? new JArray(),
                ["settings"] = settings
            };

            var form = new FormInfo
            {
                Title = record.Title ?? record.Slug,
                Description = record.Description,
                SchemaJson = schemaObj.ToString(Formatting.None),
                SettingsJson = settings.ToString(Formatting.None),
                RulesJson = record.Rules?.ToString(Formatting.None),
                WorkflowJson = record.Workflow?.ToString(Formatting.None),
                ModuleId = _platform.ModuleId,
                PortalId = _platform.PortalId,
                CreatedByUserId = _platform.UserId,
                CreatedOnUtc = DateTime.UtcNow,
                Status = "Draft"
            };

            return _formRepo.SaveForm(form);
        }

    }
}
