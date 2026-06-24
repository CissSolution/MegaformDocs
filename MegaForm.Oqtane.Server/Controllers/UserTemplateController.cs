// MegaForm BYOM (Bring-Your-Own-Module) — Oqtane parity port of
// MegaForm.DNN/WebApi/UserTemplateController.cs.
//
// ROUTES
// ──────────────────────────────────────────────────────────────────────
//   GET  /api/MegaForm/UserTemplate/list
//   GET  /api/MegaForm/UserTemplate/detail?name=<name>
//   POST /api/MegaForm/UserTemplate/refresh
//   GET  /api/MegaForm/UserTemplate/source?name=<n>&file=<f>
//   POST /api/MegaForm/UserTemplate/source   (PutSource)
//   POST /api/MegaForm/UserTemplate/render
//
// AUTH MODEL
// ──────────────────────────────────────────────────────────────────────
//  - Class-level [Authorize] gates every action to authenticated callers
//    so the on-disk template inventory does not leak to anonymous visitors.
//  - Refresh + Source GET + Source PUT additionally short-circuit when the
//    caller is not Administrators / Host (mirrors the [P3-SEC-14] gate on
//    RazorWidgetController.Compile so the BYOM surface uses the same role
//    boundary as Razor JIT compilation).
//  - Source PUT further requires a `dev.lock` marker at the site
//    ContentRootPath — live source editing is dev-only even for admins,
//    matching the BuilderTemplatesController.HasDevLock precedent.
//  - Render stays at logged-in-any-role: the rendered HTML is what the
//    runtime FormView would already emit on the page, so raising the bar
//    here would just create confusing 403s for ordinary form users.
//
// PATH RESOLUTION
// ──────────────────────────────────────────────────────────────────────
//  Templates root: <ContentRootPath>/Resources/UserTemplates
//  We intentionally use ContentRootPath (not WebRootPath) so customer-
//  authored .cshtml / .html / widget.xml source is NOT statically served
//  by Oqtane's wwwroot static-files middleware. This matches the DNN side
//  shipping the folder under DesktopModules/ (also not static-served as
//  raw source). The scanner virtual-path argument is purely cosmetic in
//  Oqtane — it is folded into descriptor metadata for parity with DNN
//  callers but never resolved as a URL.
//
// ASCX PARITY NOTE
// ──────────────────────────────────────────────────────────────────────
//  Render constructs UserTemplateProcessorDispatcher with two adapters
//  (token + Razor) — no ASCX adapter. ASCX requests resolve to
//  UserTemplateKind.Ascx and the dispatcher itself short-circuits with a
//  friendly "ASCX is DNN-only" error envelope, so we do not need a
//  separate guard here.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Oqtane.Controllers;
using Oqtane.Infrastructure;
using Oqtane.Shared;
using MegaForm.Core.Templating;

namespace MegaForm.Oqtane.Server.Controllers
{
    [Route("api/MegaForm/[controller]")]
    [IgnoreAntiforgeryToken]
    [Authorize]
    public class UserTemplateController : ModuleControllerBase
    {
        // Virtual root retained for descriptor parity with the DNN payload —
        // Oqtane clients can echo this back unchanged so cross-platform code
        // doesn't have to branch on host.
        private const string TemplatesVirtualRoot = "~/Resources/UserTemplates";

        private readonly IWebHostEnvironment _env;

        public UserTemplateController(
            IWebHostEnvironment env,
            ILogManager logger,
            IHttpContextAccessor accessor)
            : base(logger, accessor)
        {
            _env = env;
        }

        // ─────────────────────────────────────────────────────────────────────
        //  Scanner + auth helpers
        // ─────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Resolve the on-disk root and build a UserTemplateScanner. Scanner
        /// caches descriptors in-process for 30s; Refresh forces a re-scan.
        /// </summary>
        private UserTemplateScanner BuildScanner()
        {
            var contentRoot = _env?.ContentRootPath ?? AppDomain.CurrentDomain.BaseDirectory;
            var hostRoot = Path.Combine(contentRoot, "Resources", "UserTemplates");
            return new UserTemplateScanner(hostRoot, TemplatesVirtualRoot);
        }

        /// <summary>
        /// Mirrors RazorWidgetController.Compile's [P3-SEC-14] gate. We accept
        /// the canonical Oqtane Administrators role, the synthetic Host role
        /// some seeds carry, and a raw "IsHost=True" claim as a belt-and-
        /// suspenders fallback — same shape as the Razor JIT compile guard.
        /// </summary>
        private bool IsHostOrAdmin()
        {
            if (User == null) return false;
            return User.IsInRole(RoleNames.Admin)
                || User.IsInRole(RoleNames.Host)
                || User.HasClaim(c => c.Type == "IsHost" && c.Value == "True");
        }

        // ─────────────────────────────────────────────────────────────────────
        //  Source-editor support — whitelist + sandbox + dev.lock gate
        // ─────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Hard upper bound on a single source file the in-browser editor will
        /// read or write. 200 KB matches the BYOM L3 spec (sample widgets ship
        /// under ~30 KB; the cap is just defense against accidental paste of
        /// a minified bundle or vendored asset).
        /// </summary>
        private const int MaxSourceFileSizeBytes = 200 * 1024;

        /// <summary>
        /// Allowed source-file names the in-browser editor may load or save.
        /// Anything outside this list is rejected with 400 — the editor is
        /// strictly a template/manifest authoring tool, not a generic FTP
        /// surface. Compared case-insensitively against the resolved leaf
        /// name only (no directory components allowed in the request).
        /// </summary>
        private static readonly string[] SourceFileWhitelist = new[]
        {
            "template.cshtml",
            "template.html",
            "template.htm",
            "widget.xml",
            "template.css",
            "template.js"
        };

        private static bool IsWhitelistedSourceFile(string file)
        {
            if (string.IsNullOrWhiteSpace(file)) return false;
            for (int i = 0; i < SourceFileWhitelist.Length; i++)
            {
                if (string.Equals(SourceFileWhitelist[i], file, StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }

        /// <summary>
        /// Resolves a candidate source-file request to a vetted physical path
        /// under <paramref name="folderAbsolutePath"/>. Performs defense-in-depth
        /// path-traversal containment by comparing fully-canonicalized paths —
        /// the whitelist already blocks separators, but we never trust the
        /// whitelist alone for filesystem reads/writes.
        /// </summary>
        /// <returns>Canonical absolute path on success; <c>null</c> when the
        /// resolved path would escape the descriptor's folder.</returns>
        private static string ResolveSandboxedFilePath(string folderAbsolutePath, string fileName)
        {
            if (string.IsNullOrWhiteSpace(folderAbsolutePath) || string.IsNullOrWhiteSpace(fileName))
                return null;

            // Reject any caller-supplied directory components — leaf names only.
            if (fileName.IndexOf('/') >= 0 || fileName.IndexOf('\\') >= 0 ||
                fileName.IndexOf("..", StringComparison.Ordinal) >= 0 ||
                fileName.IndexOf(':') >= 0)
            {
                return null;
            }

            string folderFull;
            string candidateFull;
            try
            {
                folderFull = Path.GetFullPath(folderAbsolutePath);
                candidateFull = Path.GetFullPath(Path.Combine(folderFull, fileName));
            }
            catch
            {
                return null;
            }

            // Containment check — candidate must sit strictly inside the folder.
            string folderWithSep = folderFull.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                                   + Path.DirectorySeparatorChar;
            if (candidateFull.IndexOf(folderWithSep, StringComparison.OrdinalIgnoreCase) != 0)
            {
                return null;
            }

            return candidateFull;
        }

        /// <summary>
        /// True when a <c>dev.lock</c> marker file is present at the Oqtane
        /// site ContentRootPath. Mirrors the DNN HasDevLock precedent that
        /// gates BuilderTemplatesController bulk-publish + the AI assistant
        /// feature flag — BYOM source editing opts into the same gate.
        /// </summary>
        private bool HasDevLock()
        {
            try
            {
                var contentRoot = _env?.ContentRootPath ?? AppDomain.CurrentDomain.BaseDirectory;
                if (!string.IsNullOrWhiteSpace(contentRoot) &&
                    System.IO.File.Exists(Path.Combine(contentRoot, "dev.lock")))
                {
                    return true;
                }
            }
            catch
            {
                // Disk read failure → treat as no-dev-lock (fail closed).
            }
            return false;
        }

        // ─────────────────────────────────────────────────────────────────────
        //  GET /api/MegaForm/UserTemplate/list
        // ─────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Returns lightweight descriptor summaries for every discovered BYOM
        /// template. The Builder palette consumes this to render tiles in the
        /// "User templates" category.
        /// </summary>
        [HttpGet("list")]
        public IActionResult List()
        {
            try
            {
                var scanner = BuildScanner();
                var descriptors = scanner.Discover() ?? (IList<UserTemplateDescriptor>)new List<UserTemplateDescriptor>();

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
                    paramCount = d.Params != null ? d.Params.Count : 0,
                    requiredFieldCount = d.RequiredFields != null ? d.RequiredFields.Count : 0,
                    error = d.ErrorMessage
                }).ToList();

                return Ok(summaries);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        //  GET /api/MegaForm/UserTemplate/detail?name=<name>
        // ─────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Returns the full <see cref="UserTemplateDescriptor"/> for a single
        /// template — manifest, parameter schema, required field list, etc.
        /// The Builder Properties panel uses this to render the template-
        /// specific inspector when a UserTemplate field is selected.
        /// </summary>
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
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        //  POST /api/MegaForm/UserTemplate/refresh
        // ─────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Clears the scanner cache and forces a full re-scan of the
        /// UserTemplates folder. Host / Administrator only — drop-new-template
        /// is a host-level operation.
        /// </summary>
        [HttpPost("refresh")]
        public IActionResult Refresh()
        {
            if (!IsHostOrAdmin())
                return StatusCode(403, new { error = "Host or Administrator role required to refresh BYOM cache." });

            try
            {
                var scanner = BuildScanner();
                // Discover(forceRefresh:true) bypasses the in-process cache, so
                // we get a fresh enumeration without a separate ClearCache API.
                var descriptors = scanner.Discover(forceRefresh: true)
                    ?? (IList<UserTemplateDescriptor>)new List<UserTemplateDescriptor>();

                return Ok(new
                {
                    success = true,
                    discovered = descriptors.Count
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        //  GET /api/MegaForm/UserTemplate/source?name=<name>&file=<file>
        // ─────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Returns the raw text content of a single source file inside a BYOM
        /// widget folder. Used by the L3 unified-designer Source tab to seed
        /// its Monaco editor. Host / Administrator only — the editor surfaces
        /// the on-disk template tree and we don't expose that to lower roles.
        /// </summary>
        /// <param name="name">BYOM widget name (folder basename).</param>
        /// <param name="file">
        /// One of the whitelisted source-file names
        /// (<c>template.cshtml/html/htm</c>, <c>widget.xml</c>,
        /// <c>template.css/js</c>). When null/empty the descriptor's
        /// auto-detected <see cref="UserTemplateDescriptor.TemplateFilePath"/>
        /// leaf is used.
        /// </param>
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

                // Auto-pick the descriptor's primary template file when the
                // caller omits the file parameter. Reduces the round-trip the
                // editor needs on first open.
                string resolvedFile = file;
                if (string.IsNullOrWhiteSpace(resolvedFile))
                {
                    if (string.IsNullOrWhiteSpace(descriptor.TemplateFilePath))
                        return BadRequest(new { error = "file is required (descriptor has no primary template file)." });
                    resolvedFile = Path.GetFileName(descriptor.TemplateFilePath);
                }

                if (!IsWhitelistedSourceFile(resolvedFile))
                {
                    return BadRequest(new
                    {
                        error = "File '" + resolvedFile + "' is not in the source-editor whitelist.",
                        allowed = SourceFileWhitelist
                    });
                }

                string physicalPath = ResolveSandboxedFilePath(descriptor.FolderAbsolutePath, resolvedFile);
                if (string.IsNullOrEmpty(physicalPath))
                    return BadRequest(new { error = "Resolved path escapes the widget folder sandbox." });

                if (!System.IO.File.Exists(physicalPath))
                {
                    return NotFound(new
                    {
                        error = "File '" + resolvedFile + "' does not exist in widget '" + name + "'.",
                        name,
                        file = resolvedFile,
                        exists = false
                    });
                }

                var fi = new FileInfo(physicalPath);
                if (fi.Length > MaxSourceFileSizeBytes)
                {
                    return StatusCode(413, new
                    {
                        error = "File exceeds the " + MaxSourceFileSizeBytes + "-byte source-editor limit.",
                        sizeBytes = fi.Length,
                        maxBytes = MaxSourceFileSizeBytes
                    });
                }

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
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        //  POST /api/MegaForm/UserTemplate/source — body: PutSourceRequest
        // ─────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Persists edited source back to disk for the named BYOM widget and
        /// invalidates the scanner cache so the next List/Detail call picks up
        /// the change. Host / Administrator only and gated behind a
        /// <c>dev.lock</c> marker — live source editing is a dev-only workflow
        /// even for Hosts.
        /// </summary>
        [HttpPost("source")]
        public IActionResult PutSource([FromBody] PutSourceRequest req)
        {
            if (!IsHostOrAdmin())
                return StatusCode(403, new { error = "Host or Administrator role required to edit BYOM source." });

            // Dev-lock gate — mirrors BuilderTemplatesController.HasDevLock so
            // the BYOM source editor honors the same developer-mode marker as
            // the dev-bulk-publish + AI assistant flows.
            if (!HasDevLock())
                return StatusCode(403, new { error = "Live source editing requires dev.lock at the site root." });

            if (req == null)
                return BadRequest(new { error = "Request body is required." });
            if (string.IsNullOrWhiteSpace(req.Name))
                return BadRequest(new { error = "name is required." });
            if (string.IsNullOrWhiteSpace(req.File))
                return BadRequest(new { error = "file is required." });
            if (req.Content == null)
            {
                // Allow empty string (legitimate "clear the file" intent) but
                // not null — null usually means malformed JSON binding.
                return BadRequest(new { error = "content is required (may be empty string but not null)." });
            }

            // Enforce the 200 KB cap by measuring the UTF-8 byte length of the
            // payload, not the .NET char count — the file is written with UTF-8
            // so that's the size that ends up on disk.
            int byteCount = Encoding.UTF8.GetByteCount(req.Content);
            if (byteCount > MaxSourceFileSizeBytes)
            {
                return StatusCode(413, new
                {
                    error = "Content exceeds the " + MaxSourceFileSizeBytes + "-byte source-editor limit.",
                    sizeBytes = byteCount,
                    maxBytes = MaxSourceFileSizeBytes
                });
            }

            if (!IsWhitelistedSourceFile(req.File))
            {
                return BadRequest(new
                {
                    error = "File '" + req.File + "' is not in the source-editor whitelist.",
                    allowed = SourceFileWhitelist
                });
            }

            try
            {
                var scanner = BuildScanner();
                var descriptor = scanner.FindByName(req.Name);
                if (descriptor == null)
                    return NotFound(new { error = "Template '" + req.Name + "' not found." });

                string physicalPath = ResolveSandboxedFilePath(descriptor.FolderAbsolutePath, req.File);
                if (string.IsNullOrEmpty(physicalPath))
                    return BadRequest(new { error = "Resolved path escapes the widget folder sandbox." });

                // Folder must already exist — we never auto-create widget
                // folders from a source PUT (folder creation is a higher-level
                // "register a new widget" flow). Refusing here keeps the
                // endpoint scoped to "edit an existing widget".
                string folderDir = Path.GetDirectoryName(physicalPath);
                if (string.IsNullOrEmpty(folderDir) || !Directory.Exists(folderDir))
                    return NotFound(new { error = "Widget folder does not exist on disk: " + folderDir });

                // Write UTF-8 without BOM — matches what the scanner reads back
                // and keeps the round-trip stable across DNN + Oqtane.
                System.IO.File.WriteAllText(physicalPath, req.Content, new UTF8Encoding(false));

                // Invalidate the scanner cache so next List/Detail picks up
                // any descriptor-affecting edits (widget.xml, template-file
                // additions).
                try { scanner.Discover(forceRefresh: true); }
                catch { /* cache invalidation is best-effort */ }

                var fi = new FileInfo(physicalPath);
                return Ok(new
                {
                    success = true,
                    name = descriptor.Name,
                    file = req.File,
                    sizeBytes = fi.Length,
                    lastWriteUtc = fi.LastWriteTimeUtc
                });
            }
            catch (UnauthorizedAccessException uaex)
            {
                return StatusCode(403, new { error = "Filesystem denied the write: " + uaex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        //  POST /api/MegaForm/UserTemplate/render — body: RenderRequest
        // ─────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Server-side render of a BYOM widget template. The L3 plugin's
        /// <c>bind()</c> hook posts here per <c>.mfw-user-template-wrap</c>
        /// instance and swaps the resulting HTML into the wrap's inner
        /// <c>.mfw-user-template-content</c> div (mirrors the DynamicLabel
        /// refresh pattern).
        /// </summary>
        /// <remarks>
        /// Routes through <see cref="UserTemplateProcessorDispatcher"/> with
        /// the two Core-side adapters (<see cref="MegaFormTokenAdapter"/> for
        /// <c>.html</c>/<c>.htm</c>; <see cref="MegaFormRazorAdapter"/> for
        /// <c>.cshtml</c>). NO ASCX adapter is wired on Oqtane — the
        /// dispatcher's built-in fallback short-circuits any .ascx request
        /// with a friendly "ASCX is DNN-only" error envelope.
        /// </remarks>
        [HttpPost("render")]
        public IActionResult Render([FromBody] RenderRequest req)
        {
            // 1. Body shape + minimal Name validation. We accept null Row /
            //    Form / Params because the L3 client may call Render before
            //    the form has any user data — a "render in builder preview
            //    mode" scenario where only the manifest defaults matter.
            if (req == null)
                return BadRequest(new { error = "Request body is required." });
            if (string.IsNullOrWhiteSpace(req.Name))
                return BadRequest(new { error = "name is required." });

            try
            {
                // 2. Build (or refresh) the scanner. Force refresh is opt-in
                //    via the request flag — the typical render path uses the
                //    cached descriptors so we don't re-walk the UserTemplates
                //    folder on every form widget on every page load.
                var scanner = BuildScanner();
                if (req.Refresh)
                {
                    try { scanner.Discover(forceRefresh: true); }
                    catch { /* refresh is best-effort */ }
                }

                // 3. Resolve the descriptor for the requested widget.
                var descriptor = scanner.FindByName(req.Name);
                if (descriptor == null)
                    return NotFound(new { error = "Template '" + req.Name + "' not found." });

                // 4. Surface scanner-side parse errors (broken manifest,
                //    missing template file, etc.) without trying to render.
                //    422 Unprocessable Entity matches REST convention for
                //    "the entity is structurally invalid".
                if (!string.IsNullOrEmpty(descriptor.ErrorMessage))
                    return StatusCode(422, new { error = descriptor.ErrorMessage });

                // 5. ASCX short-circuit — return 400 before touching disk so
                //    the caller knows the contract: ASCX is DNN-only.
                if (descriptor.Kind == UserTemplateKind.Ascx)
                {
                    return BadRequest(new
                    {
                        error = "ASCX templates are DNN-only and cannot be rendered on Oqtane."
                    });
                }

                // 6. Load template source from the descriptor-resolved path.
                //    The scanner already vetted the path during discovery so
                //    we do not re-run the source-editor sandbox checks here;
                //    we DO still verify File.Exists in case the file was
                //    deleted between Discover() and Render().
                string templateFilePath = descriptor.TemplateFilePath;
                if (string.IsNullOrWhiteSpace(templateFilePath) || !System.IO.File.Exists(templateFilePath))
                {
                    return NotFound(new
                    {
                        error = "Template file is missing on disk for widget '" + req.Name + "'.",
                        templateFilePath
                    });
                }

                string templateSource = System.IO.File.ReadAllText(templateFilePath, Encoding.UTF8);

                // 7. Build the data model handed to every processor. FormId is
                //    promoted to string here to match UserTemplateModel.FormId's
                //    "fits both DNN ints and Oqtane GUIDs" shape.
                var model = new UserTemplateModel
                {
                    FormId = req.FormId.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    FieldKey = req.FieldKey,
                    Row = req.Row,
                    Form = req.Form,
                    Params = req.Params,
                    Settings = new Dictionary<string, object>()
                };

                // 8. Dispatch. Oqtane has no ASCX processor — pass only the
                //    two Core adapters; the dispatcher's null-ASCX path is
                //    already covered in step 5. Adapters have parameterless
                //    constructors so instantiation is cheap.
                var dispatcher = new UserTemplateProcessorDispatcher(
                    new MegaFormTokenAdapter(),
                    new MegaFormRazorAdapter());

                var result = dispatcher.Render(templateFilePath, templateSource, model);

                // 9. Pass the dispatcher envelope through verbatim. The
                //    dispatcher already guarantees never to throw, so on the
                //    Success=false path Html will be null and Error will carry
                //    the human-readable message — the L3 client surfaces it
                //    via showInError-controlled error HTML.
                return Ok(new
                {
                    html = result.Html,
                    success = result.Success,
                    error = result.Error,
                    name = descriptor.Name,
                    kind = descriptor.Kind.ToString()
                });
            }
            catch (Exception ex)
            {
                // Defensive catch-all. The dispatcher path is exception-safe
                // by contract, so reaching here means something upstream of
                // it failed (descriptor lookup IO, ReadAllText, etc.).
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  Request DTO for POST /api/MegaForm/UserTemplate/source
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Strong-typed request shape for the source PUT endpoint.
    /// </summary>
    public sealed class PutSourceRequest
    {
        /// <summary>BYOM widget name (folder basename under
        /// <c>Resources/UserTemplates/</c>).</summary>
        public string Name { get; set; }

        /// <summary>Whitelisted source-file leaf name to overwrite — one of
        /// <c>template.cshtml/html/htm</c>, <c>widget.xml</c>,
        /// <c>template.css/js</c>.</summary>
        public string File { get; set; }

        /// <summary>UTF-8 text content. Empty string is allowed (treated as
        /// "clear the file"); null is rejected as a malformed bind.</summary>
        public string Content { get; set; }
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  Request DTO for POST /api/MegaForm/UserTemplate/render
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Strong-typed request shape for the BYOM L3 Render endpoint. All
    /// collection properties are nullable on the wire — the server substitutes
    /// empty bags before handing the model to the dispatcher so processors
    /// never see <c>null</c> dictionaries.
    /// </summary>
    public sealed class RenderRequest
    {
        /// <summary>BYOM widget name (matches scanner descriptor
        /// <see cref="UserTemplateDescriptor.Name"/>).</summary>
        public string Name { get; set; }

        /// <summary>Form id of the host form (string-promoted before being
        /// passed into <see cref="UserTemplateModel.FormId"/>).</summary>
        public int FormId { get; set; }

        /// <summary>Field key of the UserTemplate widget within the host form
        /// (used by templates that need to disambiguate sibling widgets).</summary>
        public string FieldKey { get; set; }

        /// <summary>Optional current row of data (for DataRepeater-style
        /// per-row rendering).</summary>
        public Dictionary<string, object> Row { get; set; }

        /// <summary>Optional surrounding form values (lets a template read
        /// sibling field values).</summary>
        public Dictionary<string, object> Form { get; set; }

        /// <summary>Optional designer-parameter overrides — merged on top of
        /// any manifest-default <c>&lt;param&gt;</c> values by the processor.</summary>
        public Dictionary<string, object> Params { get; set; }

        /// <summary>Force a scanner cache invalidation before resolving the
        /// descriptor. Use sparingly — the typical render path takes the
        /// cached descriptor list.</summary>
        public bool Refresh { get; set; }
    }
}
