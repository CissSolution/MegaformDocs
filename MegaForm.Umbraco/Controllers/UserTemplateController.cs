using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using MegaForm.Core.Templating;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Umbraco.Cms.Core;
using Umbraco.Cms.Web.Common.Authorization;
using MegaForm.Umbraco.Services;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Umbraco parity port of MegaForm BYOM (Bring-Your-Own-Module) UserTemplate controller.
    /// Routes: /umbraco/MegaForm/MegaFormApi/UserTemplate/...
    /// </summary>
    [Authorize(Policy = "MegaFormBackOffice")]
    [Route("umbraco/MegaForm/MegaFormApi/[controller]")]
    public class UserTemplateController : ControllerBase
    {
        private const string TemplatesVirtualRoot = "~/" + MegaFormUmbracoPaths.UserTemplatesRelative;
        private const int MaxSourceFileSizeBytes = 200 * 1024;

        private static readonly string[] SourceFileWhitelist = new[]
        {
            "template.cshtml",
            "template.html",
            "template.htm",
            "widget.xml",
            "template.css",
            "template.js"
        };

        private readonly IWebHostEnvironment _env;
        private readonly ILogger<UserTemplateController> _logger;

        public UserTemplateController(IWebHostEnvironment env, ILogger<UserTemplateController> logger)
        {
            _env = env;
            _logger = logger;
        }

        private bool IsHostOrAdmin()
        {
            if (User?.Identity?.IsAuthenticated != true) return false;
            // Umbraco backoffice admin group aliases vary; accept common ones.
            var adminRoles = new[] { "admin", "Administrators", "Administrator", "umbracoAdmin" };
            return adminRoles.Any(r => User.IsInRole(r))
                || User.HasClaim(c => c.Type == "IsHost" && c.Value == "True");
        }

        private UserTemplateScanner BuildScanner()
        {
            var hostRoot = MegaFormUmbracoPaths.GetUserTemplatesPath(_env);
            return new UserTemplateScanner(hostRoot, TemplatesVirtualRoot);
        }

        private bool HasDevLock()
        {
            try
            {
                var devLock = MegaFormUmbracoPaths.GetDevLockPath(_env);
                if (!string.IsNullOrWhiteSpace(devLock) && System.IO.File.Exists(devLock))
                    return true;
            }
            catch { }
            return false;
        }

        private static bool IsWhitelistedSourceFile(string file)
        {
            if (string.IsNullOrWhiteSpace(file)) return false;
            return SourceFileWhitelist.Any(s => string.Equals(s, file, StringComparison.OrdinalIgnoreCase));
        }

        private static string ResolveSandboxedFilePath(string folderAbsolutePath, string fileName)
        {
            if (string.IsNullOrWhiteSpace(folderAbsolutePath) || string.IsNullOrWhiteSpace(fileName))
                return null;
            if (fileName.IndexOf('/') >= 0 || fileName.IndexOf('\\') >= 0 ||
                fileName.IndexOf("..", StringComparison.Ordinal) >= 0 || fileName.IndexOf(':') >= 0)
                return null;

            try
            {
                var folderFull = Path.GetFullPath(folderAbsolutePath);
                var candidateFull = Path.GetFullPath(Path.Combine(folderFull, fileName));
                var folderWithSep = folderFull.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
                return candidateFull.IndexOf(folderWithSep, StringComparison.OrdinalIgnoreCase) == 0 ? candidateFull : null;
            }
            catch { return null; }
        }

        [HttpGet("list")]
        public IActionResult List()
        {
            try
            {
                var scanner = BuildScanner();
                var descriptors = scanner.Discover() ?? new List<UserTemplateDescriptor>();
                var summaries = descriptors.Select(d => new
                {
                    name = d.Name,
                    displayName = d.DisplayName,
                    kind = d.Kind.ToString(),
                    category = d.Category,
                    description = d.Description,
                    thumbnailVirtualPath = d.ThumbnailVirtualPath,
                    templateVirtualPath = d.TemplateVirtualPath,
                    hasManifest = !string.IsNullOrEmpty(d.ManifestVirtualPath),
                    paramCount = d.Params?.Count ?? 0,
                    requiredFieldCount = d.RequiredFields?.Count ?? 0,
                    error = d.ErrorMessage
                }).ToList();
                return Ok(summaries);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm.Umbraco] UserTemplate List failed");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("detail")]
        public IActionResult Detail([FromQuery] string name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return BadRequest(new { error = "name is required." });
            try
            {
                var scanner = BuildScanner();
                var descriptor = scanner.FindByName(name);
                if (descriptor == null)
                    return NotFound(new { error = "Template '" + name + "' not found." });
                return Ok(descriptor);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm.Umbraco] UserTemplate Detail failed");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("refresh")]
        public IActionResult Refresh()
        {
            if (!IsHostOrAdmin())
                return StatusCode(403, new { error = "Host or Administrator role required to refresh BYOM cache." });
            try
            {
                var scanner = BuildScanner();
                var descriptors = scanner.Discover(forceRefresh: true) ?? new List<UserTemplateDescriptor>();
                return Ok(new { success = true, discovered = descriptors.Count });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm.Umbraco] UserTemplate Refresh failed");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("source")]
        public IActionResult GetSource([FromQuery] string name, [FromQuery] string file = null)
        {
            if (!IsHostOrAdmin())
                return StatusCode(403, new { error = "Host or Administrator role required to read BYOM source." });
            if (string.IsNullOrWhiteSpace(name))
                return BadRequest(new { error = "name is required." });

            try
            {
                var scanner = BuildScanner();
                var descriptor = scanner.FindByName(name);
                if (descriptor == null)
                    return NotFound(new { error = "Template '" + name + "' not found." });

                string resolvedFile = file;
                if (string.IsNullOrWhiteSpace(resolvedFile))
                {
                    if (string.IsNullOrWhiteSpace(descriptor.TemplateFilePath))
                        return BadRequest(new { error = "file is required (descriptor has no primary template file)." });
                    resolvedFile = Path.GetFileName(descriptor.TemplateFilePath);
                }

                if (!IsWhitelistedSourceFile(resolvedFile))
                    return BadRequest(new { error = "File '" + resolvedFile + "' is not in the source-editor whitelist.", allowed = SourceFileWhitelist });

                string physicalPath = ResolveSandboxedFilePath(descriptor.FolderAbsolutePath, resolvedFile);
                if (string.IsNullOrEmpty(physicalPath))
                    return BadRequest(new { error = "Resolved path escapes the widget folder sandbox." });
                if (!System.IO.File.Exists(physicalPath))
                    return NotFound(new { error = "File '" + resolvedFile + "' does not exist in widget '" + name + "'.", name, file = resolvedFile, exists = false });

                var fi = new FileInfo(physicalPath);
                if (fi.Length > MaxSourceFileSizeBytes)
                    return StatusCode(413, new { error = "File exceeds the " + MaxSourceFileSizeBytes + "-byte source-editor limit.", sizeBytes = fi.Length, maxBytes = MaxSourceFileSizeBytes });

                string content = System.IO.File.ReadAllText(physicalPath, Encoding.UTF8);
                return Ok(new
                {
                    name = descriptor.Name,
                    file = resolvedFile,
                    content,
                    sizeBytes = fi.Length,
                    lastWriteUtc = fi.LastWriteTimeUtc,
                    devLock = HasDevLock(),
                    writable = HasDevLock()
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm.Umbraco] UserTemplate GetSource failed");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("source")]
        public IActionResult PutSource([FromBody] PutSourceRequest req)
        {
            if (!IsHostOrAdmin())
                return StatusCode(403, new { error = "Host or Administrator role required to edit BYOM source." });
            if (!HasDevLock())
                return StatusCode(403, new { error = "Live source editing requires dev.lock at the site root." });
            if (req == null)
                return BadRequest(new { error = "Request body is required." });
            if (string.IsNullOrWhiteSpace(req.Name))
                return BadRequest(new { error = "name is required." });
            if (string.IsNullOrWhiteSpace(req.File))
                return BadRequest(new { error = "file is required." });
            if (req.Content == null)
                return BadRequest(new { error = "content is required (may be empty string but not null)." });

            int byteCount = Encoding.UTF8.GetByteCount(req.Content);
            if (byteCount > MaxSourceFileSizeBytes)
                return StatusCode(413, new { error = "Content exceeds the " + MaxSourceFileSizeBytes + "-byte source-editor limit.", sizeBytes = byteCount, maxBytes = MaxSourceFileSizeBytes });
            if (!IsWhitelistedSourceFile(req.File))
                return BadRequest(new { error = "File '" + req.File + "' is not in the source-editor whitelist.", allowed = SourceFileWhitelist });

            try
            {
                var scanner = BuildScanner();
                var descriptor = scanner.FindByName(req.Name);
                if (descriptor == null)
                    return NotFound(new { error = "Template '" + req.Name + "' not found." });

                string physicalPath = ResolveSandboxedFilePath(descriptor.FolderAbsolutePath, req.File);
                if (string.IsNullOrEmpty(physicalPath))
                    return BadRequest(new { error = "Resolved path escapes the widget folder sandbox." });

                string folderDir = Path.GetDirectoryName(physicalPath);
                if (string.IsNullOrEmpty(folderDir) || !Directory.Exists(folderDir))
                    return NotFound(new { error = "Widget folder does not exist on disk: " + folderDir });

                System.IO.File.WriteAllText(physicalPath, req.Content, new UTF8Encoding(false));
                try { scanner.Discover(forceRefresh: true); }
                catch { }

                var fi = new FileInfo(physicalPath);
                return Ok(new { success = true, name = descriptor.Name, file = req.File, sizeBytes = fi.Length, lastWriteUtc = fi.LastWriteTimeUtc });
            }
            catch (UnauthorizedAccessException uaex)
            {
                return StatusCode(403, new { error = "Filesystem denied the write: " + uaex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm.Umbraco] UserTemplate PutSource failed");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("render")]
        [AllowAnonymous]
        public IActionResult Render([FromBody] RenderRequest req)
        {
            if (req == null)
                return BadRequest(new { error = "Request body is required." });
            if (string.IsNullOrWhiteSpace(req.Name))
                return BadRequest(new { error = "name is required." });

            try
            {
                var scanner = BuildScanner();
                if (req.Refresh)
                {
                    try { scanner.Discover(forceRefresh: true); }
                    catch { }
                }

                var descriptor = scanner.FindByName(req.Name);
                if (descriptor == null)
                    return NotFound(new { error = "Template '" + req.Name + "' not found." });
                if (!string.IsNullOrEmpty(descriptor.ErrorMessage))
                    return StatusCode(422, new { error = descriptor.ErrorMessage });
                if (descriptor.Kind == UserTemplateKind.Ascx)
                    return BadRequest(new { error = "ASCX templates are DNN-only and cannot be rendered on Umbraco." });

                string templateFilePath = descriptor.TemplateFilePath;
                if (string.IsNullOrWhiteSpace(templateFilePath) || !System.IO.File.Exists(templateFilePath))
                    return NotFound(new { error = "Template file is missing on disk for widget '" + req.Name + "'.", templateFilePath });

                string templateSource = System.IO.File.ReadAllText(templateFilePath, Encoding.UTF8);
                var model = new UserTemplateModel
                {
                    FormId = req.FormId.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    FieldKey = req.FieldKey,
                    Row = req.Row ?? new Dictionary<string, object>(),
                    Form = req.Form ?? new Dictionary<string, object>(),
                    Params = req.Params ?? new Dictionary<string, object>(),
                    Settings = new Dictionary<string, object>()
                };

                var dispatcher = new UserTemplateProcessorDispatcher(
                    new MegaFormTokenAdapter(),
                    new MegaFormRazorAdapter());

                var result = dispatcher.Render(templateFilePath, templateSource, model);
                return Ok(new { html = result.Html, success = result.Success, error = result.Error, name = descriptor.Name, kind = descriptor.Kind.ToString() });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm.Umbraco] UserTemplate Render failed");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        public sealed class PutSourceRequest
        {
            public string Name { get; set; }
            public string File { get; set; }
            public string Content { get; set; }
        }

        public sealed class RenderRequest
        {
            public string Name { get; set; }
            public int FormId { get; set; }
            public string FieldKey { get; set; }
            public Dictionary<string, object> Row { get; set; }
            public Dictionary<string, object> Form { get; set; }
            public Dictionary<string, object> Params { get; set; }
            public bool Refresh { get; set; }
        }
    }
}
