using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Web;
using System.Web.Http;
using DotNetNuke.Web.Api;
using MegaForm.Core.Templating;

namespace MegaForm.WebApi
{
    // ══════════════════════════════════════════════════════════════════════════
    //  UserTemplateController — BYOM (Bring-Your-Own-Module) palette feed
    //
    //  Routes (auto-mapped via MegaFormRouteMapper's default convention):
    //    GET  /DesktopModules/MegaForm/API/UserTemplate/List
    //    GET  /DesktopModules/MegaForm/API/UserTemplate/Detail?name=<name>
    //    POST /DesktopModules/MegaForm/API/UserTemplate/Refresh
    //    GET  /DesktopModules/MegaForm/API/UserTemplate/Source?name=<n>&file=<f>
    //    POST /DesktopModules/MegaForm/API/UserTemplate/Source     (PutSource)
    //    POST /DesktopModules/MegaForm/API/UserTemplate/Render
    //
    //  Auth model
    //  -----------
    //  Class-level [DnnAuthorize] gates every action to logged-in users (we
    //  reject anonymous because BYOM enumeration must not leak the on-disk
    //  template inventory to public form runtime callers). Refresh + Source
    //  GET/PUT additionally short-circuit inside the action when the caller is
    //  not a SuperUser / Administrator — there is no host-only DnnAuthorize
    //  variant so we do it in code, matching DesignerController /
    //  SubformController precedent. Render stays at logged-in-any-role: the
    //  rendered HTML is exactly what the runtime FormView would already emit
    //  on the page, so adding a privilege check that the runtime itself does
    //  not enforce would just create confusing 403s for ordinary form users.
    //
    //  Scanner root
    //  -------------
    //  ~/DesktopModules/MegaForm/Resources/UserTemplates/
    //  Mapped to a physical path via HttpContext.Server.MapPath at request time
    //  and handed to UserTemplateScanner (caches descriptors in-process — call
    //  Refresh after a customer drops new templates on disk).
    //
    //  v20260602-B40 — BYOM L2 palette endpoint
    //  v20260602-B41 — BYOM L3 Source GET/PUT (sandboxed file edit) + Render
    //                  (server-side dispatch via UserTemplateProcessorDispatcher
    //                  with MegaFormTokenAdapter + MegaFormRazorAdapter). ASCX
    //                  is rejected with 400 because AscxHostWidget hydrates
    //                  ASCX controls in-place during FormView's ASP.NET life-
    //                  cycle and cannot be serialised back through a Web API
    //                  response stream.
    // ══════════════════════════════════════════════════════════════════════════

    [DnnAuthorize]
    public class UserTemplateController : DnnApiController
    {
        // Virtual + physical root constants. Keeping the virtual root literal here
        // mirrors AscxHostWidget.TemplatesVirtualRoot — when that constant gets
        // promoted to UserTemplatePaths.VirtualRoot in MegaForm.Core/Templating/
        // this controller should import it instead of redeclaring.
        private const string TemplatesVirtualRoot = "~/DesktopModules/MegaForm/Resources/UserTemplates";

        /// <summary>
        /// Resolve the on-disk root and build a UserTemplateScanner. The scanner
        /// itself caches descriptors so repeat List calls are cheap; Refresh
        /// invalidates that cache.
        /// </summary>
        private static UserTemplateScanner BuildScanner()
        {
            // Single global root for v1. Per-portal sandbox roots can layer on later
            // via PortalController.Instance.GetCurrentPortalSettings() (concrete type)
            // when needed — kept out of the v1 path to avoid the DotNetNuke.Abstractions
            // assembly reference.
            var hostRoot = HttpContext.Current != null
                ? HttpContext.Current.Server.MapPath(TemplatesVirtualRoot)
                : null;

            return new UserTemplateScanner(hostRoot, TemplatesVirtualRoot);
        }

        private bool IsHostOrAdmin()
        {
            var caller = UserInfo;
            return caller != null && (caller.IsSuperUser || caller.IsInRole("Administrators"));
        }

        // ─────────────────────────────────────────────────────────────────────
        //  Source-editor support — whitelist + sandbox + dev.lock gate
        // ─────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Hard upper bound on a single source file the in-browser editor will
        /// read or write. 200 KB matches the BYOM L3 spec (sample widgets ship
        /// under ~30 KB; the cap is just defense against accidental paste of a
        /// minified bundle or vendored asset).
        /// </summary>
        private const int MaxSourceFileSizeBytes = 200 * 1024;

        /// <summary>
        /// Hard upper bound on the rendered HTML body returned by the Render
        /// endpoint. A malicious or accidentally-pathological template (large
        /// foreach over a wide row set, runaway string concat) could produce
        /// megabytes of HTML; capping at 1 MB keeps a single widget from
        /// flooding the wire / browser. Output beyond the cap is truncated and
        /// a visible warning marker is appended.
        /// </summary>
        private const int MaxRenderHtmlBytes = 1 * 1024 * 1024;

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
            "template.ascx",
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
        /// True when a <c>dev.lock</c> marker file is present at the portal
        /// HomeDirectory or the app root. Mirrors
        /// <c>BuilderTemplatesController.HasDevLock</c> so the BYOM source
        /// editor opts into the same developer-mode gate as the bulk-publish
        /// flow and the AI assistant feature gate.
        /// </summary>
        private bool HasDevLock()
        {
            try
            {
                var portalHome = PortalSettings != null ? PortalSettings.HomeDirectoryMapPath : null;
                if (!string.IsNullOrWhiteSpace(portalHome) &&
                    File.Exists(Path.Combine(portalHome, "dev.lock")))
                {
                    return true;
                }

                var appPath = System.Web.Hosting.HostingEnvironment.MapPath("~/");
                if (!string.IsNullOrWhiteSpace(appPath) &&
                    File.Exists(Path.Combine(appPath, "dev.lock")))
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
        //  GET /API/UserTemplate/List
        // ─────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Returns lightweight descriptor summaries for every discovered BYOM
        /// template. The Builder palette consumes this to render tiles in the
        /// "User templates" category.
        /// </summary>
        [HttpGet]
        [ActionName("List")]
        public HttpResponseMessage List()
        {
            try
            {
                var scanner = BuildScanner();
                var descriptors = scanner.Discover() ?? (System.Collections.Generic.IList<UserTemplateDescriptor>)
                    new System.Collections.Generic.List<UserTemplateDescriptor>();

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

                return Request.CreateResponse(HttpStatusCode.OK, summaries);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        //  GET /API/UserTemplate/Detail?name=<name>
        // ─────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Returns the full <see cref="UserTemplateDescriptor"/> for a single
        /// template — including the parsed manifest, parameter schema, required
        /// field list, etc. The Builder Properties panel uses this to render
        /// the template-specific inspector when a UserTemplate field is
        /// selected.
        /// </summary>
        [HttpGet]
        [ActionName("Detail")]
        public HttpResponseMessage Detail(string name)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "name is required." });
            }

            try
            {
                var scanner = BuildScanner();
                var descriptor = scanner.FindByName(name);

                if (descriptor == null)
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound,
                        new { error = "Template '" + name + "' not found." });
                }

                return Request.CreateResponse(HttpStatusCode.OK, descriptor);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        //  POST /API/UserTemplate/Refresh
        // ─────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Clears the scanner cache and forces a full re-scan of the
        /// UserTemplates folder. Host / Administrator only — drop-new-template
        /// is a host-level operation.
        /// </summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("Refresh")]
        public HttpResponseMessage Refresh()
        {
            if (!IsHostOrAdmin())
            {
                return Request.CreateResponse(HttpStatusCode.Forbidden,
                    new { error = "Host or Administrator role required to refresh BYOM cache." });
            }

            try
            {
                var scanner = BuildScanner();
                // Discover(forceRefresh:true) bypasses the in-process cache, so we
                // get a fresh enumeration without needing a separate ClearCache API.
                var descriptors = scanner.Discover(forceRefresh: true)
                    ?? (System.Collections.Generic.IList<UserTemplateDescriptor>)
                       new System.Collections.Generic.List<UserTemplateDescriptor>();
                var count = descriptors.Count;

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    discovered = count
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        //  GET /API/UserTemplate/Source?name=<name>&file=<file>
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
        /// (<c>template.cshtml/html/htm/ascx</c>, <c>widget.xml</c>,
        /// <c>template.css/js</c>). When null/empty the descriptor's
        /// auto-detected <see cref="UserTemplateDescriptor.TemplateFilePath"/>
        /// leaf is used.
        /// </param>
        [HttpGet]
        [ActionName("Source")]
        public HttpResponseMessage GetSource(string name, string file = null)
        {
            if (!IsHostOrAdmin())
            {
                return Request.CreateResponse(HttpStatusCode.Forbidden,
                    new { error = "Host or Administrator role required to read BYOM source." });
            }

            if (string.IsNullOrWhiteSpace(name))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "name is required." });
            }

            try
            {
                var scanner = BuildScanner();
                var descriptor = scanner.FindByName(name);
                if (descriptor == null)
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound,
                        new { error = "Template '" + name + "' not found." });
                }

                // Auto-pick the descriptor's primary template file when the
                // caller omits the file parameter. Reduces the round-trip the
                // editor needs on first open ("which file?" → "the one you
                // already told me about").
                string resolvedFile = file;
                if (string.IsNullOrWhiteSpace(resolvedFile))
                {
                    if (string.IsNullOrWhiteSpace(descriptor.TemplateFilePath))
                    {
                        return Request.CreateResponse(HttpStatusCode.BadRequest,
                            new { error = "file is required (descriptor has no primary template file)." });
                    }
                    resolvedFile = Path.GetFileName(descriptor.TemplateFilePath);
                }

                if (!IsWhitelistedSourceFile(resolvedFile))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new
                    {
                        error = "File '" + resolvedFile + "' is not in the source-editor whitelist.",
                        allowed = SourceFileWhitelist
                    });
                }

                string physicalPath = ResolveSandboxedFilePath(descriptor.FolderAbsolutePath, resolvedFile);
                if (string.IsNullOrEmpty(physicalPath))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest,
                        new { error = "Resolved path escapes the widget folder sandbox." });
                }

                if (!File.Exists(physicalPath))
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound, new
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
                    return Request.CreateResponse(HttpStatusCode.RequestEntityTooLarge, new
                    {
                        error = "File exceeds the " + MaxSourceFileSizeBytes + "-byte source-editor limit.",
                        sizeBytes = fi.Length,
                        maxBytes = MaxSourceFileSizeBytes
                    });
                }

                string content = File.ReadAllText(physicalPath, Encoding.UTF8);

                return Request.CreateResponse(HttpStatusCode.OK, new
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
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        //  POST /API/UserTemplate/Source — body: PutSourceRequest
        // ─────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Persists edited source back to disk for the named BYOM widget and
        /// invalidates the scanner cache so the next List/Detail call picks up
        /// the change. Host / Administrator only, AntiForgery-protected, and
        /// gated behind a <c>dev.lock</c> marker — live source editing is a
        /// dev-only workflow even for Hosts.
        /// </summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("Source")]
        public HttpResponseMessage PutSource([FromBody] PutSourceRequest req)
        {
            if (!IsHostOrAdmin())
            {
                return Request.CreateResponse(HttpStatusCode.Forbidden,
                    new { error = "Host or Administrator role required to edit BYOM source." });
            }

            // Dev-lock gate — mirrors BuilderTemplatesController.HasDevLock so
            // the BYOM source editor honors the same developer-mode marker as
            // the dev-bulk-publish + AI assistant flows.
            if (!HasDevLock())
            {
                return Request.CreateResponse(HttpStatusCode.Forbidden,
                    new { error = "Live source editing requires dev.lock at the site root." });
            }

            if (req == null)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "Request body is required." });
            }
            if (string.IsNullOrWhiteSpace(req.Name))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "name is required." });
            }
            if (string.IsNullOrWhiteSpace(req.File))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "file is required." });
            }
            if (req.Content == null)
            {
                // Allow empty string (legitimate "clear the file" intent) but
                // not null — null usually means malformed JSON binding.
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "content is required (may be empty string but not null)." });
            }

            // Enforce the 200 KB cap by measuring the UTF-8 byte length of the
            // payload, not the .NET char count — the file is written with UTF-8
            // so that's the size that ends up on disk.
            int byteCount = Encoding.UTF8.GetByteCount(req.Content);
            if (byteCount > MaxSourceFileSizeBytes)
            {
                return Request.CreateResponse(HttpStatusCode.RequestEntityTooLarge, new
                {
                    error = "Content exceeds the " + MaxSourceFileSizeBytes + "-byte source-editor limit.",
                    sizeBytes = byteCount,
                    maxBytes = MaxSourceFileSizeBytes
                });
            }

            if (!IsWhitelistedSourceFile(req.File))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
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
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound,
                        new { error = "Template '" + req.Name + "' not found." });
                }

                string physicalPath = ResolveSandboxedFilePath(descriptor.FolderAbsolutePath, req.File);
                if (string.IsNullOrEmpty(physicalPath))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest,
                        new { error = "Resolved path escapes the widget folder sandbox." });
                }

                // Folder must already exist — we never auto-create widget
                // folders from a source PUT (folder creation is a higher-level
                // "register a new widget" flow). Refusing here keeps the
                // endpoint scoped to "edit an existing widget".
                string folderDir = Path.GetDirectoryName(physicalPath);
                if (string.IsNullOrEmpty(folderDir) || !Directory.Exists(folderDir))
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound,
                        new { error = "Widget folder does not exist on disk: " + folderDir });
                }

                // Write the file. UTF-8 without BOM matches what the scanner
                // and AscxHostWidget read back — keeps round-trip stable.
                File.WriteAllText(physicalPath, req.Content, new UTF8Encoding(false));

                // Invalidate the scanner cache so next List/Detail picks up
                // any descriptor-affecting edits (widget.xml, template-file
                // additions). For ASCX edits, ASP.NET BuildProvider auto-
                // recompiles on next Page.LoadControl — no extra step.
                try { scanner.Discover(forceRefresh: true); }
                catch { /* cache invalidation is best-effort */ }

                var fi = new FileInfo(physicalPath);
                return Request.CreateResponse(HttpStatusCode.OK, new
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
                return Request.CreateResponse(HttpStatusCode.Forbidden,
                    new { error = "Filesystem denied the write: " + uaex.Message });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        //  POST /API/UserTemplate/Render — body: RenderRequest
        // ─────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Server-side render of a BYOM widget template. The L3 plugin's
        /// <c>bind()</c> hook posts here per <c>.mfw-user-template-wrap</c>
        /// instance and swaps the resulting HTML into the wrap's inner
        /// <c>.mfw-user-template-content</c> div (mirrors the DynamicLabel
        /// refresh pattern at <c>megaform-widget-dynamic-label.ts:477</c>).
        /// </summary>
        /// <remarks>
        /// <para>
        /// Routes through <see cref="UserTemplateProcessorDispatcher"/> with the
        /// two Core-side adapters (<see cref="MegaFormTokenAdapter"/> for
        /// <c>.html</c>/<c>.htm</c>; <see cref="MegaFormRazorAdapter"/> for
        /// <c>.cshtml</c>). ASCX is explicitly NOT supported by this endpoint —
        /// ASCX user controls are rendered in-place by
        /// <c>AscxHostWidget.HostUserAscx</c> during the FormView ASP.NET
        /// lifecycle and we cannot synthesize a meaningful <c>Page</c> /
        /// <c>HttpContext</c> from a Web API request.
        /// </para>
        /// <para>
        /// Auth: logged-in users (class-level <c>[DnnAuthorize]</c>). The
        /// rendered HTML is what the runtime FormView would already produce so
        /// we do not raise the bar above ordinary form callers; widget source
        /// editing is still gated behind Host/Admin + dev.lock via the Source
        /// endpoints above.
        /// </para>
        /// </remarks>
        [HttpPost]
        [ActionName("Render")]
        public HttpResponseMessage Render([FromBody] RenderRequest req)
        {
            // 1. Body shape + minimal Name validation. We accept null Row/Form/
            //    Params (they're declared as nullable dictionaries on the DTO)
            //    because the L3 client may call Render before the form has any
            //    user data — a "render in builder preview mode" scenario where
            //    only the manifest defaults matter.
            if (req == null)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "Request body is required." });
            }
            if (string.IsNullOrWhiteSpace(req.Name))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "name is required." });
            }

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
                    catch { /* refresh is best-effort — fall through to FindByName */ }
                }

                // 3. Resolve the descriptor for the requested widget.
                var descriptor = scanner.FindByName(req.Name);
                if (descriptor == null)
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound,
                        new { error = "Template '" + req.Name + "' not found." });
                }

                // 4. Surface scanner-side parse errors (broken manifest,
                //    missing template file, etc.) without trying to render.
                //    422 Unprocessable Entity matches REST convention for
                //    "the entity is structurally invalid".
                if (!string.IsNullOrEmpty(descriptor.ErrorMessage))
                {
                    return Request.CreateResponse((HttpStatusCode)422,
                        new { error = descriptor.ErrorMessage });
                }

                // 5. ASCX short-circuit — return 400 before touching disk so
                //    the caller knows the contract: ASCX has its own host.
                if (descriptor.Kind == UserTemplateKind.Ascx)
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new
                    {
                        error = "ASCX templates are rendered in-place by AscxHostWidget, not via this endpoint."
                    });
                }

                // 6. Load template source from the descriptor-resolved path.
                //    The scanner already vetted the path during discovery so
                //    we do not re-run the source-editor sandbox checks here;
                //    we DO still verify File.Exists in case the file was
                //    deleted between Discover() and Render().
                string templateFilePath = descriptor.TemplateFilePath;
                if (string.IsNullOrWhiteSpace(templateFilePath) || !File.Exists(templateFilePath))
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound, new
                    {
                        error = "Template file is missing on disk for widget '" + req.Name + "'.",
                        templateFilePath
                    });
                }

                string templateSource = File.ReadAllText(templateFilePath, Encoding.UTF8);

                // 7. Build the data model handed to every processor. FormId is
                //    promoted to string here to match UserTemplateModel.FormId's
                //    "fits both DNN ints and Oqtane GUIDs" shape. Settings is
                //    intentionally an empty bag for v1 — the descriptor's
                //    declared params live in Params, and widget-level designer
                //    settings will plug in via this slot in a later iteration.
                var model = new UserTemplateModel
                {
                    FormId = req.FormId.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    FieldKey = req.FieldKey,
                    Row = req.Row,
                    Form = req.Form,
                    Params = req.Params,
                    Settings = new Dictionary<string, object>()
                };

                // 8. Dispatch. We pass null for the ASCX processor because
                //    ASCX is handled out-of-band (step 5) — if we ever decide
                //    to wire a Web-API-friendly ASCX renderer it would be
                //    injected here. The Core adapters have parameterless
                //    constructors so instantiation is cheap; if profile data
                //    later shows allocation pressure we can cache a static
                //    dispatcher field.
                var dispatcher = new UserTemplateProcessorDispatcher(
                    new MegaFormTokenAdapter(),
                    new MegaFormRazorAdapter());

                var result = dispatcher.Render(templateFilePath, templateSource, model);

                // 8b. Response-size cap. Truncate ridiculously large HTML
                //     payloads BEFORE shipping them to the client so a single
                //     pathological widget cannot saturate the wire. We measure
                //     by UTF-8 byte length (what actually goes on the wire) and
                //     append a visible HTML-comment marker so the L3 client +
                //     authors can both see that truncation occurred. The cap
                //     applies on Success path only — Error responses are tiny
                //     by construction.
                string outputHtml = result.Html;
                bool truncated = false;
                long originalBytes = 0;
                if (result.Success && !string.IsNullOrEmpty(outputHtml))
                {
                    originalBytes = Encoding.UTF8.GetByteCount(outputHtml);
                    if (originalBytes > MaxRenderHtmlBytes)
                    {
                        // Char-based truncation is approximate vs the byte cap
                        // but conservative — UTF-8 chars are >=1 byte so we
                        // never overshoot. Cheaper than re-encoding to bytes
                        // and slicing on a code-point boundary.
                        if (outputHtml.Length > MaxRenderHtmlBytes)
                        {
                            outputHtml = outputHtml.Substring(0, MaxRenderHtmlBytes);
                        }
                        outputHtml += "\n<!-- mf-byom: render output truncated at " +
                                      MaxRenderHtmlBytes + " bytes (was " +
                                      originalBytes + " bytes). -->";
                        truncated = true;
                    }
                }

                // 9. Pass the dispatcher envelope through verbatim. The
                //    dispatcher already guarantees never to throw, so on the
                //    Success=false path Html will be null and Error will carry
                //    the human-readable message — the L3 client surfaces it
                //    via showInError-controlled error HTML.
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    html = outputHtml,
                    success = result.Success,
                    error = result.Error,
                    name = descriptor.Name,
                    kind = descriptor.Kind.ToString(),
                    truncated,
                    sizeBytes = originalBytes,
                    maxBytes = MaxRenderHtmlBytes
                });
            }
            catch (Exception ex)
            {
                // Defensive catch-all. The dispatcher path is exception-safe
                // by contract, so reaching here means something upstream of
                // it failed (descriptor lookup IO, ReadAllText, etc.). We
                // mirror the other actions' 500 shape so the client error
                // handler can stay uniform.
                // TODO [MEDIUM][SECURITY] Render is reachable by any logged-in
                // user (class-level [DnnAuthorize] only). The raw ex.Message
                // could leak filesystem paths from a ReadAllText IOException
                // or descriptor lookup. Consider scrubbing/redacting to a
                // generic "render failed" message for non-Host callers, and
                // logging the full ex via EventLogController for diagnosis.
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = ex.Message });
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  Request DTO for POST /API/UserTemplate/Source
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Strong-typed request shape for the source PUT endpoint. Lives in the
    /// same namespace so the Web API binder picks it up without extra
    /// configuration. Property casing matches MVC binder conventions (PascalCase
    /// on the server, camelCase on the wire — both bind correctly with
    /// default <c>Newtonsoft.Json</c> settings used by DNN Web API).
    /// </summary>
    public sealed class PutSourceRequest
    {
        /// <summary>BYOM widget name (folder basename under
        /// <c>Resources/UserTemplates/</c>).</summary>
        public string Name { get; set; }

        /// <summary>Whitelisted source-file leaf name to overwrite — one of
        /// <c>template.cshtml/html/htm/ascx</c>, <c>widget.xml</c>,
        /// <c>template.css/js</c>.</summary>
        public string File { get; set; }

        /// <summary>UTF-8 text content. Empty string is allowed (treated as
        /// "clear the file"); null is rejected as a malformed bind.</summary>
        public string Content { get; set; }
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  Request DTO for POST /API/UserTemplate/Render
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Strong-typed request shape for the BYOM L3 Render endpoint. Lives in the
    /// same namespace so the Web API binder picks it up via the default model
    /// binder. All collection properties are nullable on the wire — the server
    /// substitutes empty bags before handing the model to the dispatcher so
    /// processors never see <c>null</c> dictionaries.
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
