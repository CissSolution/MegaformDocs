using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using MegaForm.Core.Templating;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;

namespace MegaForm.Web.Controllers
{
    [Route("api/MegaForm/[controller]")]
    [Route("DesktopModules/MegaForm/API/[controller]")]
    [IgnoreAntiforgeryToken]
    [Authorize]
    public class UserTemplateController : ControllerBase
    {
        private const string TemplatesVirtualRoot = "~/Resources/UserTemplates";
        private readonly IWebHostEnvironment _env;

        public UserTemplateController(IWebHostEnvironment env) { _env = env; }

        private UserTemplateScanner BuildScanner()
        {
            var contentRoot = _env?.ContentRootPath ?? AppDomain.CurrentDomain.BaseDirectory;
            var hostRoot = Path.Combine(contentRoot, "Resources", "UserTemplates");
            return new UserTemplateScanner(hostRoot, TemplatesVirtualRoot);
        }

        private bool IsHostOrAdmin() => User?.Identity?.IsAuthenticated == true &&
            (User.IsInRole("Administrator") || User.HasClaim(c => c.Type == "IsHost" && c.Value == "True"));

        private const int MaxSourceFileSizeBytes = 200 * 1024;
        private static readonly string[] SourceFileWhitelist = new[] { "template.cshtml", "template.html", "template.htm", "widget.xml", "template.css", "template.js" };

        private static bool IsWhitelistedSourceFile(string file)
        {
            if (string.IsNullOrWhiteSpace(file)) return false;
            return SourceFileWhitelist.Any(w => string.Equals(w, file, StringComparison.OrdinalIgnoreCase));
        }

        private static string ResolveSandboxedFilePath(string folderAbsolutePath, string fileName)
        {
            if (string.IsNullOrWhiteSpace(folderAbsolutePath) || string.IsNullOrWhiteSpace(fileName)) return null;
            if (fileName.IndexOf('/') >= 0 || fileName.IndexOf('\\') >= 0 || fileName.IndexOf("..", StringComparison.Ordinal) >= 0 || fileName.IndexOf(':') >= 0) return null;
            string folderFull, candidateFull;
            try
            {
                folderFull = Path.GetFullPath(folderAbsolutePath);
                candidateFull = Path.GetFullPath(Path.Combine(folderFull, fileName));
            }
            catch { return null; }
            string folderWithSep = folderFull.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (candidateFull.IndexOf(folderWithSep, StringComparison.OrdinalIgnoreCase) != 0) return null;
            return candidateFull;
        }

        private bool HasDevLock()
        {
            try
            {
                var contentRoot = _env?.ContentRootPath ?? AppDomain.CurrentDomain.BaseDirectory;
                if (!string.IsNullOrWhiteSpace(contentRoot) && System.IO.File.Exists(Path.Combine(contentRoot, "dev.lock"))) return true;
            }
            catch { }
            return false;
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
                    name = d.Name, displayName = d.DisplayName, kind = d.Kind.ToString(), category = d.Category,
                    description = d.Description, thumbnailVirtualPath = d.ThumbnailVirtualPath, templateVirtualPath = d.TemplateVirtualPath,
                    hasManifest = !string.IsNullOrEmpty(d.ManifestVirtualPath),
                    paramCount = d.Params != null ? d.Params.Count : 0,
                    requiredFieldCount = d.RequiredFields != null ? d.RequiredFields.Count : 0,
                    error = d.ErrorMessage
                }).ToList();
                return Ok(summaries);
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpGet("detail")]
        public IActionResult Detail([FromQuery] string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return BadRequest(new { error = "name is required." });
            try
            {
                var scanner = BuildScanner();
                var descriptor = scanner.FindByName(name);
                if (descriptor == null) return NotFound(new { error = "Template '" + name + "' not found." });
                return Ok(descriptor);
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("refresh")]
        public IActionResult Refresh()
        {
            if (!IsHostOrAdmin()) return StatusCode(403, new { error = "Host or Administrator role required to refresh BYOM cache." });
            try
            {
                var scanner = BuildScanner();
                var descriptors = scanner.Discover(forceRefresh: true) ?? new List<UserTemplateDescriptor>();
                return Ok(new { success = true, discovered = descriptors.Count });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpGet("source")]
        public IActionResult GetSource([FromQuery] string name, [FromQuery] string file = null)
        {
            if (!IsHostOrAdmin()) return StatusCode(403, new { error = "Host or Administrator role required to read BYOM source." });
            if (string.IsNullOrWhiteSpace(name)) return BadRequest(new { error = "name is required." });
            try
            {
                var scanner = BuildScanner();
                var descriptor = scanner.FindByName(name);
                if (descriptor == null) return NotFound(new { error = "Template '" + name + "' not found." });
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
                return Ok(new { name = descriptor.Name, file = resolvedFile, content, sizeBytes = fi.Length, lastWriteUtc = fi.LastWriteTimeUtc, devLock = HasDevLock(), writable = HasDevLock() });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("source")]
        public IActionResult PutSource([FromBody] PutSourceRequest req)
        {
            if (!IsHostOrAdmin()) return StatusCode(403, new { error = "Host or Administrator role required to edit BYOM source." });
            if (!HasDevLock()) return StatusCode(403, new { error = "Live source editing requires dev.lock at the site root." });
            if (req == null) return BadRequest(new { error = "Request body is required." });
            if (string.IsNullOrWhiteSpace(req.Name)) return BadRequest(new { error = "name is required." });
            if (string.IsNullOrWhiteSpace(req.File)) return BadRequest(new { error = "file is required." });
            if (req.Content == null) return BadRequest(new { error = "content is required (may be empty string but not null)." });
            int byteCount = Encoding.UTF8.GetByteCount(req.Content);
            if (byteCount > MaxSourceFileSizeBytes)
                return StatusCode(413, new { error = "Content exceeds the " + MaxSourceFileSizeBytes + "-byte source-editor limit.", sizeBytes = byteCount, maxBytes = MaxSourceFileSizeBytes });
            if (!IsWhitelistedSourceFile(req.File))
                return BadRequest(new { error = "File '" + req.File + "' is not in the source-editor whitelist.", allowed = SourceFileWhitelist });
            try
            {
                var scanner = BuildScanner();
                var descriptor = scanner.FindByName(req.Name);
                if (descriptor == null) return NotFound(new { error = "Template '" + req.Name + "' not found." });
                string physicalPath = ResolveSandboxedFilePath(descriptor.FolderAbsolutePath, req.File);
                if (string.IsNullOrEmpty(physicalPath))
                    return BadRequest(new { error = "Resolved path escapes the widget folder sandbox." });
                string folderDir = Path.GetDirectoryName(physicalPath);
                if (string.IsNullOrEmpty(folderDir) || !Directory.Exists(folderDir))
                    return NotFound(new { error = "Widget folder does not exist on disk: " + folderDir });
                System.IO.File.WriteAllText(physicalPath, req.Content, new UTF8Encoding(false));
                try { scanner.Discover(forceRefresh: true); } catch { }
                var fi = new FileInfo(physicalPath);
                return Ok(new { success = true, name = descriptor.Name, file = req.File, sizeBytes = fi.Length, lastWriteUtc = fi.LastWriteTimeUtc });
            }
            catch (UnauthorizedAccessException uaex) { return StatusCode(403, new { error = "Filesystem denied the write: " + uaex.Message }); }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("render")]
        public IActionResult Render([FromBody] RenderRequest req)
        {
            if (req == null) return BadRequest(new { error = "Request body is required." });
            if (string.IsNullOrWhiteSpace(req.Name)) return BadRequest(new { error = "name is required." });
            try
            {
                var scanner = BuildScanner();
                if (req.Refresh) { try { scanner.Discover(forceRefresh: true); } catch { } }
                var descriptor = scanner.FindByName(req.Name);
                if (descriptor == null) return NotFound(new { error = "Template '" + req.Name + "' not found." });
                if (!string.IsNullOrEmpty(descriptor.ErrorMessage)) return StatusCode(422, new { error = descriptor.ErrorMessage });
                if (descriptor.Kind == UserTemplateKind.Ascx) return BadRequest(new { error = "ASCX templates are DNN-only and cannot be rendered on ASP.NET Core." });
                string templateFilePath = descriptor.TemplateFilePath;
                if (string.IsNullOrWhiteSpace(templateFilePath) || !System.IO.File.Exists(templateFilePath))
                    return NotFound(new { error = "Template file is missing on disk for widget '" + req.Name + "'.", templateFilePath });
                string templateSource = System.IO.File.ReadAllText(templateFilePath, Encoding.UTF8);
                var model = new UserTemplateModel
                {
                    FormId = req.FormId.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    FieldKey = req.FieldKey,
                    Row = req.Row,
                    Form = req.Form,
                    Params = req.Params,
                    Settings = new Dictionary<string, object>()
                };
                var dispatcher = new UserTemplateProcessorDispatcher(new MegaFormTokenAdapter(), new MegaFormRazorAdapter());
                var result = dispatcher.Render(templateFilePath, templateSource, model);
                return Ok(new { html = result.Html, success = result.Success, error = result.Error, name = descriptor.Name, kind = descriptor.Kind.ToString() });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
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
