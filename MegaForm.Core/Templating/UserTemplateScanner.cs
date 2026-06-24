using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace MegaForm.Core.Templating
{
    /// <summary>
    /// BYOM (Bring-Your-Own-Module) auto-discovery scanner.
    /// <para>
    /// Enumerates the top-level subdirectories under a sandboxed
    /// <c>UserTemplates</c> root and emits one <see cref="UserTemplateDescriptor"/>
    /// per discovered widget folder. The customer-facing contract is simply
    /// "drop a folder under <c>Resources/UserTemplates/</c> containing a
    /// <c>template.cshtml</c>, <c>template.html</c> or <c>template.ascx</c>
    /// (optionally a <c>widget.xml</c> manifest) and MegaForm will pick it up".
    /// </para>
    /// <para>
    /// The scanner is platform-agnostic: the caller resolves the physical root
    /// path (DNN uses <c>Server.MapPath("~/DesktopModules/MegaForm/Resources/UserTemplates/")</c>;
    /// Oqtane uses <c>IWebHostEnvironment.WebRootPath + "/Modules/MegaForm/Resources/UserTemplates/"</c>)
    /// and hands it in via <see cref="UserTemplateScanner(string, string)"/>.
    /// </para>
    /// <para>
    /// Results are cached in-memory for 30 seconds to avoid hammering the file
    /// system on every form render. Pass <c>forceRefresh:true</c> to bypass the
    /// cache (typically used by the Builder right-pane "Reload" button).
    /// </para>
    /// </summary>
    public sealed class UserTemplateScanner
    {
        // -------------------------------------------------------------------
        // Hardening limits.
        // -------------------------------------------------------------------

        /// <summary>Maximum number of widget folders the scanner will report
        /// in a single discovery pass. Anything beyond this is silently
        /// truncated so a runaway directory cannot exhaust memory.</summary>
        private const int MaxDiscoveredWidgets = 200;

        /// <summary>Maximum byte size of a <c>widget.xml</c> manifest the
        /// scanner will read. Larger files are treated as missing and the
        /// stub-descriptor fallback path runs instead.</summary>
        private const int MaxManifestFileSizeBytes = 100 * 1024;

        /// <summary>Cache TTL: <see cref="Discover"/> calls that arrive within
        /// this window after the previous successful scan return the cached
        /// list (unless <c>forceRefresh:true</c>).</summary>
        private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(30);

        /// <summary>Allowed folder-name shape. Letters / digits / dash /
        /// underscore only — this is the sandbox guard that rejects folders
        /// like <c>"../etc"</c>, <c>"foo bar"</c> or <c>"a:b"</c>.</summary>
        private static readonly Regex SafeFolderName =
            new Regex(@"^[A-Za-z0-9_\-]+$", RegexOptions.Compiled);

        // -------------------------------------------------------------------
        // Instance state.
        // -------------------------------------------------------------------

        private readonly string _rootAbsolutePath;
        private readonly string _rootVirtualPath;
        private readonly object _cacheLock = new object();

        private List<UserTemplateDescriptor> _cache;
        private DateTime _cacheStampUtc;

        /// <summary>
        /// Creates a new scanner bound to a single sandboxed root.
        /// </summary>
        /// <param name="rootAbsolutePath">
        /// Fully resolved physical path to the <c>UserTemplates</c> folder
        /// (for example <c>C:\inetpub\wwwroot\DNN\DesktopModules\MegaForm\Resources\UserTemplates</c>).
        /// May be null/empty/missing — the scanner just returns an empty list.
        /// </param>
        /// <param name="rootVirtualPath">
        /// Virtual path prefix to embed in each descriptor's manifest URL
        /// (for example <c>~/DesktopModules/MegaForm/Resources/UserTemplates</c>).
        /// Used by the dispatcher / AscxHostWidget path-sandbox layer.
        /// </param>
        public UserTemplateScanner(string rootAbsolutePath, string rootVirtualPath)
        {
            _rootAbsolutePath = rootAbsolutePath ?? string.Empty;
            _rootVirtualPath = NormalizeVirtualRoot(rootVirtualPath);
            _cache = null;
            _cacheStampUtc = DateTime.MinValue;
        }

        /// <summary>
        /// Enumerates the widget folders under the configured root and returns
        /// one <see cref="UserTemplateDescriptor"/> per candidate.
        /// </summary>
        /// <param name="forceRefresh">
        /// When false (default) the cached result is returned if it is younger
        /// than <see cref="CacheTtl"/>. When true the cache is bypassed and a
        /// fresh disk scan runs.
        /// </param>
        /// <returns>
        /// A new list (callers may freely mutate it without affecting the
        /// cache). Never null; empty when the root is missing or invalid.
        /// </returns>
        public IList<UserTemplateDescriptor> Discover(bool forceRefresh = false)
        {
            // Cache hit fast-path — no lock contention when warm.
            if (!forceRefresh)
            {
                List<UserTemplateDescriptor> snapshot = _cache;
                if (snapshot != null &&
                    DateTime.UtcNow - _cacheStampUtc < CacheTtl)
                {
                    return new List<UserTemplateDescriptor>(snapshot);
                }
            }

            // Hard-fail guards: missing config or missing folder → empty.
            if (string.IsNullOrWhiteSpace(_rootAbsolutePath) ||
                !Directory.Exists(_rootAbsolutePath))
            {
                lock (_cacheLock)
                {
                    _cache = new List<UserTemplateDescriptor>();
                    _cacheStampUtc = DateTime.UtcNow;
                    return new List<UserTemplateDescriptor>();
                }
            }

            List<UserTemplateDescriptor> results = new List<UserTemplateDescriptor>();
            string[] subdirs;

            try
            {
                subdirs = Directory.GetDirectories(_rootAbsolutePath);
            }
            catch
            {
                // Disk read failure (permissions, transient I/O) — degrade to
                // empty rather than throwing into the form-render pipeline.
                lock (_cacheLock)
                {
                    _cache = new List<UserTemplateDescriptor>();
                    _cacheStampUtc = DateTime.UtcNow;
                    return new List<UserTemplateDescriptor>();
                }
            }

            // Stable alphabetical ordering for predictable Builder UX.
            Array.Sort(subdirs, StringComparer.OrdinalIgnoreCase);

            for (int i = 0; i < subdirs.Length; i++)
            {
                if (results.Count >= MaxDiscoveredWidgets) break;

                string folderPath = subdirs[i];
                try
                {
                    UserTemplateDescriptor descriptor = ScanFolder(folderPath);
                    if (descriptor != null) results.Add(descriptor);
                }
                catch (Exception ex)
                {
                    // Per-folder failure must not poison the rest of the scan
                    // — emit a stub descriptor that surfaces the message in
                    // the Builder so the author can fix it.
                    try
                    {
                        string folderName = SafeBaseName(folderPath);
                        results.Add(new UserTemplateDescriptor
                        {
                            Name = folderName,
                            FolderAbsolutePath = folderPath,
                            FolderVirtualPath = CombineVirtual(_rootVirtualPath, folderName),
                            ErrorMessage = "Scan failed: " + ex.Message
                        });
                    }
                    catch
                    {
                        // Truly unrecoverable — swallow at the outermost layer
                        // so the rest of the discovery still completes.
                    }
                }
            }

            lock (_cacheLock)
            {
                _cache = results;
                _cacheStampUtc = DateTime.UtcNow;
            }

            return new List<UserTemplateDescriptor>(results);
        }

        /// <summary>
        /// Looks up a single descriptor by folder name (case-insensitive).
        /// Honors the cache the same way <see cref="Discover"/> does — call
        /// <c>Discover(forceRefresh:true)</c> first if you need a fresh read.
        /// </summary>
        /// <param name="name">Folder name as returned in
        /// <see cref="UserTemplateDescriptor.Name"/>.</param>
        /// <returns>The matching descriptor or null when none was found.</returns>
        public UserTemplateDescriptor FindByName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return null;

            IList<UserTemplateDescriptor> list = Discover(false);
            for (int i = 0; i < list.Count; i++)
            {
                UserTemplateDescriptor d = list[i];
                if (d != null && !string.IsNullOrEmpty(d.Name) &&
                    string.Equals(d.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    return d;
                }
            }
            return null;
        }

        // -------------------------------------------------------------------
        // Per-folder scan.
        // -------------------------------------------------------------------

        private UserTemplateDescriptor ScanFolder(string folderPath)
        {
            string folderName = SafeBaseName(folderPath);

            // Sandbox guard: reject anything that didn't enumerate as a clean
            // single-segment alphanumeric name. This blocks junctions whose
            // resolved name carries volume separators, traversal sequences or
            // shell metacharacters.
            if (string.IsNullOrEmpty(folderName) ||
                !SafeFolderName.IsMatch(folderName))
            {
                return null;
            }

            string folderVirtualPath = CombineVirtual(_rootVirtualPath, folderName);
            string manifestPath = Path.Combine(folderPath, "widget.xml");
            string manifestVirtualPath = CombineVirtual(folderVirtualPath, "widget.xml");

            UserTemplateDescriptor descriptor = null;

            // ---- Manifest branch: widget.xml present + within size limit ---
            if (File.Exists(manifestPath))
            {
                try
                {
                    FileInfo fi = new FileInfo(manifestPath);
                    if (fi.Length <= MaxManifestFileSizeBytes)
                    {
                        string xml = File.ReadAllText(manifestPath);
                        descriptor = UserTemplateManifestParser.Parse(
                            xml,
                            folderName,
                            manifestVirtualPath,
                            folderPath);
                    }
                    // else: oversized manifest → silently fall through to stub.
                }
                catch (Exception ex)
                {
                    descriptor = new UserTemplateDescriptor
                    {
                        Name = folderName,
                        FolderAbsolutePath = folderPath,
                        FolderVirtualPath = folderVirtualPath,
                        ManifestVirtualPath = manifestVirtualPath,
                        ErrorMessage = "widget.xml parse failed: " + ex.Message
                    };
                }
            }

            // ---- Stub branch: no manifest / oversized / parser returned null
            if (descriptor == null)
            {
                descriptor = BuildStubDescriptor(folderName, folderPath, folderVirtualPath);
            }

            // ---- Auto-detect TemplateFilePath when manifest left it blank --
            if (string.IsNullOrWhiteSpace(descriptor.TemplateFilePath))
            {
                string autoTemplate = AutoDetectTemplateFile(folderPath);
                if (!string.IsNullOrEmpty(autoTemplate))
                {
                    descriptor.TemplateFilePath = autoTemplate;
                }
            }
            else if (!Path.IsPathRooted(descriptor.TemplateFilePath))
            {
                // Manifests typically declare a relative path like
                // "template.cshtml"; promote to absolute for the dispatcher.
                descriptor.TemplateFilePath =
                    Path.Combine(folderPath, descriptor.TemplateFilePath);
            }

            // ---- Validate the resolved template file exists on disk -------
            if (string.IsNullOrWhiteSpace(descriptor.TemplateFilePath))
            {
                if (string.IsNullOrEmpty(descriptor.ErrorMessage))
                {
                    descriptor.ErrorMessage =
                        "No template file found (looked for template.cshtml, template.html, template.ascx).";
                }
            }
            else if (!File.Exists(descriptor.TemplateFilePath))
            {
                if (string.IsNullOrEmpty(descriptor.ErrorMessage))
                {
                    descriptor.ErrorMessage =
                        "Declared template file does not exist: " + descriptor.TemplateFilePath;
                }
            }

            // Always backfill the structural fields so downstream consumers
            // (Builder UI, dispatcher, AscxHostWidget) never have to null-check.
            if (string.IsNullOrEmpty(descriptor.Name)) descriptor.Name = folderName;
            if (string.IsNullOrEmpty(descriptor.FolderAbsolutePath)) descriptor.FolderAbsolutePath = folderPath;
            if (string.IsNullOrEmpty(descriptor.FolderVirtualPath)) descriptor.FolderVirtualPath = folderVirtualPath;

            return descriptor;
        }

        // -------------------------------------------------------------------
        // Helpers.
        // -------------------------------------------------------------------

        /// <summary>Scans <c>folderPath</c> for the first supported template
        /// file, preferring <c>.cshtml &gt; .html &gt; .ascx</c>.</summary>
        private static string AutoDetectTemplateFile(string folderPath)
        {
            // Priority order documented in spec: cshtml > html > ascx.
            string[] candidates = new[]
            {
                "template.cshtml",
                "template.html",
                "template.htm",
                "template.ascx"
            };

            for (int i = 0; i < candidates.Length; i++)
            {
                string full = Path.Combine(folderPath, candidates[i]);
                if (File.Exists(full)) return full;
            }
            return null;
        }

        /// <summary>Builds the minimal descriptor used when no manifest is
        /// present, so the Builder still surfaces the widget with a sensible
        /// label and the auto-detected template file.</summary>
        private static UserTemplateDescriptor BuildStubDescriptor(
            string folderName,
            string folderAbsolutePath,
            string folderVirtualPath)
        {
            return new UserTemplateDescriptor
            {
                Name = folderName,
                Label = HumanizeName(folderName),
                FolderAbsolutePath = folderAbsolutePath,
                FolderVirtualPath = folderVirtualPath
            };
        }

        /// <summary>Turns <c>"blog-card_v2"</c> into <c>"Blog Card V2"</c> so
        /// stub descriptors display nicely in the Builder gallery.</summary>
        private static string HumanizeName(string folderName)
        {
            if (string.IsNullOrEmpty(folderName)) return folderName;
            string spaced = folderName.Replace('-', ' ').Replace('_', ' ');
            string[] parts = spaced.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < parts.Length; i++)
            {
                string p = parts[i];
                if (p.Length == 0) continue;
                parts[i] = char.ToUpperInvariant(p[0]) + (p.Length > 1 ? p.Substring(1) : string.Empty);
            }
            return string.Join(" ", parts);
        }

        /// <summary>Returns the last path segment of <paramref name="path"/>
        /// without throwing on edge-case input (junctions, trailing
        /// separators, etc.).</summary>
        private static string SafeBaseName(string path)
        {
            if (string.IsNullOrEmpty(path)) return string.Empty;
            try
            {
                string trimmed = path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                return Path.GetFileName(trimmed) ?? string.Empty;
            }
            catch
            {
                return string.Empty;
            }
        }

        /// <summary>Normalizes a virtual root so we can append child segments
        /// without doubling or dropping the trailing slash.</summary>
        private static string NormalizeVirtualRoot(string virtualRoot)
        {
            if (string.IsNullOrWhiteSpace(virtualRoot)) return string.Empty;
            string vr = virtualRoot.Replace('\\', '/').TrimEnd('/');
            return vr;
        }

        /// <summary>Joins a virtual root with a child segment using forward
        /// slashes regardless of the host OS.</summary>
        private static string CombineVirtual(string root, string child)
        {
            if (string.IsNullOrEmpty(child)) return root ?? string.Empty;
            if (string.IsNullOrEmpty(root)) return child;
            return root.TrimEnd('/') + "/" + child.TrimStart('/');
        }
    }
}
