using System;
using System.Collections.Generic;
using System.IO;
using System.Xml;

namespace MegaForm.Core.Templating
{
    /// <summary>
    /// Parses a BYOM template's <c>widget.xml</c> manifest into a
    /// <see cref="UserTemplateDescriptor"/>. Cross-platform (uses only
    /// <c>System.Xml</c>) so the same parser runs under DNN (net472) and
    /// Oqtane (net8/9/10).
    /// </summary>
    /// <remarks>
    /// Hardening rules enforced by <see cref="Parse(string, string, string, string)"/>:
    /// <list type="bullet">
    ///   <item>DTD processing prohibited (<c>XmlReaderSettings.DtdProcessing = Prohibit</c>)
    ///         to block billion-laughs and external-entity attacks.</item>
    ///   <item><c>XmlResolver = null</c> so no external references can be resolved.</item>
    ///   <item>Manifests larger than <see cref="MaxManifestBytes"/> (100 KB) are rejected
    ///         outright — BYOM manifests are tiny by design.</item>
    /// </list>
    /// On any parse error the method still returns a descriptor, but with
    /// <see cref="UserTemplateDescriptor.ErrorMessage"/> populated, so the
    /// scanner can list a broken template alongside healthy ones rather than
    /// crashing.
    /// </remarks>
    public static class UserTemplateManifestParser
    {
        /// <summary>
        /// Hard cap on manifest size. BYOM widget.xml files are pure metadata
        /// (a few dozen lines) so anything larger is almost certainly hostile
        /// or a misnamed file. Matches the &quot;reject &gt; 100 KB&quot; rule in
        /// the BYOM L2 scout report.
        /// </summary>
        public const int MaxManifestBytes = 100 * 1024;

        /// <summary>
        /// Parses the supplied <paramref name="xml"/> into a fully-populated
        /// <see cref="UserTemplateDescriptor"/>. The caller is expected to have
        /// already validated that <paramref name="folderAbsolutePath"/> sits
        /// inside the BYOM virtual root sandbox (the parser only inspects file
        /// existence under that folder, it does not re-check the sandbox).
        /// </summary>
        /// <param name="xml">Raw XML content of the <c>widget.xml</c> manifest.</param>
        /// <param name="folderName">Folder name that uniquely identifies the
        /// template (e.g. <c>"blog-card"</c>). Used as the descriptor's
        /// <see cref="UserTemplateDescriptor.Name"/>.</param>
        /// <param name="manifestVirtualPath">Virtual path to the manifest itself
        /// (e.g. <c>~/DesktopModules/MegaForm/Resources/UserTemplates/blog-card/widget.xml</c>).
        /// Stored on the descriptor for diagnostics.</param>
        /// <param name="folderAbsolutePath">Absolute disk path to the template
        /// folder. Used to locate the <c>template.*</c> file on disk when
        /// <c>&lt;kind&gt;</c> is missing or to populate
        /// <see cref="UserTemplateDescriptor.TemplateFilePath"/>.</param>
        /// <returns>Always non-null. Inspect
        /// <see cref="UserTemplateDescriptor.ErrorMessage"/> to detect failures.</returns>
        public static UserTemplateDescriptor Parse(
            string xml,
            string folderName,
            string manifestVirtualPath,
            string folderAbsolutePath)
        {
            // Seed descriptor with the always-known facts so error returns are
            // still useful (caller can still display the folder name + manifest
            // path next to the error message).
            var descriptor = new UserTemplateDescriptor
            {
                Name = folderName ?? string.Empty,
                DisplayName = folderName ?? string.Empty,
                Label = HumanizeFolderName(folderName),
                Kind = UserTemplateKind.Unknown,
                Category = string.Empty,
                Description = string.Empty,
                TemplateFilePath = string.Empty,
                TemplateVirtualPath = string.Empty,
                ThumbnailVirtualPath = null,
                FolderAbsolutePath = folderAbsolutePath ?? string.Empty,
                FolderVirtualPath = DeriveFolderVirtualPath(manifestVirtualPath, folderName),
                RequiresSqlContext = false,
                Params = new List<UserTemplateParam>(),
                RequiredFields = new List<UserTemplateRequiredField>(),
                Scripts = new List<string>(),
                Stylesheets = new List<string>(),
                ManifestVirtualPath = manifestVirtualPath ?? string.Empty,
                ErrorMessage = null
            };

            if (xml == null)
            {
                descriptor.ErrorMessage = "widget.xml content was null.";
                return descriptor;
            }

            // Size guard: reject obviously oversized manifests before we hand
            // them to the XML reader. Use UTF-8 byte count as the conservative
            // upper bound on disk size (most BCL APIs report the same).
            var byteCount = System.Text.Encoding.UTF8.GetByteCount(xml);
            if (byteCount > MaxManifestBytes)
            {
                descriptor.ErrorMessage =
                    "widget.xml exceeds the " + MaxManifestBytes + "-byte limit (" + byteCount + " bytes).";
                return descriptor;
            }

            XmlDocument doc;
            try
            {
                doc = LoadHardened(xml);
            }
            catch (Exception ex)
            {
                // Fail loudly (BYOM convention: visible error rather than
                // silent drop) but keep the descriptor shape valid.
                descriptor.ErrorMessage = "widget.xml is not valid XML: " + ex.Message;
                return descriptor;
            }

            var root = doc.DocumentElement;
            if (root == null || !string.Equals(root.LocalName, "widget", StringComparison.OrdinalIgnoreCase))
            {
                descriptor.ErrorMessage = "widget.xml root element must be <widget>.";
                return descriptor;
            }

            // <name> override (otherwise keep the folder-derived default).
            var nameText = ReadChildText(root, "name");
            if (!string.IsNullOrWhiteSpace(nameText))
            {
                descriptor.DisplayName = nameText.Trim();
            }

            // <category>, <description> — straight text passthroughs.
            descriptor.Category = (ReadChildText(root, "category") ?? string.Empty).Trim();
            descriptor.Description = (ReadChildText(root, "description") ?? string.Empty).Trim();

            // <kind> — explicit override of the file-extension inferred kind.
            var kindText = ReadChildText(root, "kind");
            if (!string.IsNullOrWhiteSpace(kindText))
            {
                descriptor.Kind = ParseKind(kindText.Trim());
            }

            // <requires><sqlContext/></requires>
            var requires = FindChild(root, "requires");
            if (requires != null)
            {
                descriptor.RequiresSqlContext = FindChild(requires, "sqlContext") != null;
            }

            // <params><param name="..." type="..." default="..." label="..." /></params>
            var paramsNode = FindChild(root, "params");
            if (paramsNode != null)
            {
                foreach (XmlNode child in paramsNode.ChildNodes)
                {
                    if (child.NodeType != XmlNodeType.Element) continue;
                    if (!string.Equals(child.LocalName, "param", StringComparison.OrdinalIgnoreCase)) continue;

                    var name = ReadAttribute(child, "name");
                    if (string.IsNullOrWhiteSpace(name)) continue;

                    descriptor.Params.Add(new UserTemplateParam
                    {
                        Name = name.Trim(),
                        Type = (ReadAttribute(child, "type") ?? "text").Trim(),
                        DefaultValue = ReadAttribute(child, "default") ?? string.Empty,
                        Label = (ReadAttribute(child, "label") ?? name).Trim()
                    });
                }
            }

            // <requiredFields><field key="..." type="..." label="..." /></requiredFields>
            var requiredFields = FindChild(root, "requiredFields");
            if (requiredFields != null)
            {
                foreach (XmlNode child in requiredFields.ChildNodes)
                {
                    if (child.NodeType != XmlNodeType.Element) continue;
                    if (!string.Equals(child.LocalName, "field", StringComparison.OrdinalIgnoreCase)) continue;

                    var key = ReadAttribute(child, "key");
                    if (string.IsNullOrWhiteSpace(key)) continue;

                    descriptor.RequiredFields.Add(new UserTemplateRequiredField
                    {
                        Key = key.Trim(),
                        Type = (ReadAttribute(child, "type") ?? "Text").Trim(),
                        Label = (ReadAttribute(child, "label") ?? key).Trim()
                    });
                }
            }

            // <scripts><script>x.js</script></scripts>
            var scripts = FindChild(root, "scripts");
            if (scripts != null)
            {
                foreach (XmlNode child in scripts.ChildNodes)
                {
                    if (child.NodeType != XmlNodeType.Element) continue;
                    if (!string.Equals(child.LocalName, "script", StringComparison.OrdinalIgnoreCase)) continue;

                    var text = (child.InnerText ?? string.Empty).Trim();
                    if (text.Length > 0) descriptor.Scripts.Add(text);
                }
            }

            // <stylesheets><stylesheet>x.css</stylesheet></stylesheets>
            var stylesheets = FindChild(root, "stylesheets");
            if (stylesheets != null)
            {
                foreach (XmlNode child in stylesheets.ChildNodes)
                {
                    if (child.NodeType != XmlNodeType.Element) continue;
                    if (!string.Equals(child.LocalName, "stylesheet", StringComparison.OrdinalIgnoreCase)) continue;

                    var text = (child.InnerText ?? string.Empty).Trim();
                    if (text.Length > 0) descriptor.Stylesheets.Add(text);
                }
            }

            // Auto-detect the template file. If <kind> was explicit we look for
            // that exact filename first; otherwise we probe the supported
            // extensions in priority order (Razor > HTML > ASCX matches the
            // BYOM L2 spec) and infer Kind from whichever is found.
            ResolveTemplateFile(descriptor, folderName, folderAbsolutePath);

            // Optional thumbnail.png lookup — non-fatal if missing.
            ResolveThumbnail(descriptor, folderName, folderAbsolutePath);

            // Late validation: if we still have no template file or no Kind,
            // surface the error so the scanner can show it to the author.
            if (string.IsNullOrEmpty(descriptor.TemplateFilePath))
            {
                descriptor.ErrorMessage =
                    "No template.{cshtml|html|htm|ascx} file found in folder \"" + (folderName ?? "?") + "\".";
            }
            else if (descriptor.Kind == UserTemplateKind.Unknown)
            {
                descriptor.ErrorMessage =
                    "Could not infer <kind> for folder \"" + (folderName ?? "?") +
                    "\" and the manifest did not declare one.";
            }

            return descriptor;
        }

        /// <summary>
        /// Loads <paramref name="xml"/> into an <see cref="XmlDocument"/> via an
        /// XmlReader hardened against DTD attacks (no DTD processing, null
        /// resolver, ignore comments / processing instructions). Cross-platform
        /// — works identically on net472 and modern .NET.
        /// </summary>
        /// <param name="xml">Raw XML text.</param>
        private static XmlDocument LoadHardened(string xml)
        {
            var settings = new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null,
                IgnoreComments = true,
                IgnoreProcessingInstructions = true,
                IgnoreWhitespace = true,
                CloseInput = true
            };

            var doc = new XmlDocument { XmlResolver = null };
            using (var sr = new StringReader(xml))
            using (var reader = XmlReader.Create(sr, settings))
            {
                doc.Load(reader);
            }
            return doc;
        }

        /// <summary>
        /// Returns the first child element of <paramref name="parent"/> with the
        /// given local name (case-insensitive), or null when none exists.
        /// </summary>
        private static XmlNode FindChild(XmlNode parent, string localName)
        {
            if (parent == null) return null;
            foreach (XmlNode child in parent.ChildNodes)
            {
                if (child.NodeType != XmlNodeType.Element) continue;
                if (string.Equals(child.LocalName, localName, StringComparison.OrdinalIgnoreCase))
                {
                    return child;
                }
            }
            return null;
        }

        /// <summary>
        /// Returns the inner text of the first child element with the given
        /// local name, or null when the element is missing.
        /// </summary>
        private static string ReadChildText(XmlNode parent, string localName)
        {
            var node = FindChild(parent, localName);
            return node == null ? null : node.InnerText;
        }

        /// <summary>
        /// Reads an attribute value (case-insensitively), returning null when
        /// the attribute is missing.
        /// </summary>
        private static string ReadAttribute(XmlNode element, string attributeName)
        {
            if (element == null || element.Attributes == null) return null;
            foreach (XmlAttribute attr in element.Attributes)
            {
                if (string.Equals(attr.LocalName, attributeName, StringComparison.OrdinalIgnoreCase))
                {
                    return attr.Value;
                }
            }
            return null;
        }

        /// <summary>
        /// Maps a manifest <c>&lt;kind&gt;</c> string to a
        /// <see cref="UserTemplateKind"/>. Recognises <c>"razor"</c>,
        /// <c>"html"</c> and <c>"ascx"</c> (case-insensitive). Unknown values
        /// fall back to <see cref="UserTemplateKind.Unknown"/> so the caller
        /// can decide whether to surface an error.
        /// </summary>
        private static UserTemplateKind ParseKind(string kindText)
        {
            if (string.IsNullOrWhiteSpace(kindText)) return UserTemplateKind.Unknown;
            switch (kindText.Trim().ToLowerInvariant())
            {
                case "razor":
                case "cshtml":
                    return UserTemplateKind.Razor;
                case "html":
                case "htm":
                    return UserTemplateKind.Html;
                case "ascx":
                case "webform":
                case "usercontrol":
                    return UserTemplateKind.Ascx;
                default:
                    return UserTemplateKind.Unknown;
            }
        }

        /// <summary>
        /// Locates the on-disk <c>template.*</c> file inside
        /// <paramref name="folderAbsolutePath"/> and populates
        /// <see cref="UserTemplateDescriptor.TemplateFilePath"/> +
        /// <see cref="UserTemplateDescriptor.TemplateVirtualPath"/> +
        /// (when <c>&lt;kind&gt;</c> was missing) <see cref="UserTemplateDescriptor.Kind"/>.
        /// </summary>
        /// <remarks>
        /// When <see cref="UserTemplateDescriptor.Kind"/> is already set from
        /// an explicit <c>&lt;kind&gt;</c> we only look for that engine's file.
        /// Otherwise we probe Razor → HTML → ASCX in that order and adopt the
        /// first match, matching the BYOM L2 priority list.
        /// </remarks>
        private static void ResolveTemplateFile(
            UserTemplateDescriptor descriptor,
            string folderName,
            string folderAbsolutePath)
        {
            if (string.IsNullOrEmpty(folderAbsolutePath) || !Directory.Exists(folderAbsolutePath))
            {
                // Without a real disk folder we cannot infer the file. Leave
                // TemplateFilePath empty — the caller will set ErrorMessage.
                return;
            }

            string[] candidates;
            switch (descriptor.Kind)
            {
                case UserTemplateKind.Razor:
                    candidates = new[] { "template.cshtml" };
                    break;
                case UserTemplateKind.Html:
                    candidates = new[] { "template.html", "template.htm" };
                    break;
                case UserTemplateKind.Ascx:
                    candidates = new[] { "template.ascx" };
                    break;
                default:
                    // Unknown: probe all supported engines in priority order.
                    candidates = new[]
                    {
                        "template.cshtml",
                        "template.html",
                        "template.htm",
                        "template.ascx"
                    };
                    break;
            }

            foreach (var candidate in candidates)
            {
                var diskPath = Path.Combine(folderAbsolutePath, candidate);
                if (!File.Exists(diskPath)) continue;

                descriptor.TemplateFilePath = diskPath;
                descriptor.TemplateVirtualPath = BuildVirtualPath(folderName, candidate);

                if (descriptor.Kind == UserTemplateKind.Unknown)
                {
                    var ext = Path.GetExtension(candidate);
                    descriptor.Kind = UserTemplateKindResolver.FromExtension(ext);
                }

                return;
            }
        }

        /// <summary>
        /// Sets <see cref="UserTemplateDescriptor.ThumbnailVirtualPath"/> when a
        /// <c>thumbnail.png</c> exists alongside the manifest. Missing thumbnail
        /// is not an error.
        /// </summary>
        private static void ResolveThumbnail(
            UserTemplateDescriptor descriptor,
            string folderName,
            string folderAbsolutePath)
        {
            if (string.IsNullOrEmpty(folderAbsolutePath) || !Directory.Exists(folderAbsolutePath))
            {
                return;
            }

            // Probe the common image extensions in author-preferred order.
            string[] candidates = { "thumbnail.png", "thumbnail.jpg", "thumbnail.jpeg", "thumbnail.gif" };
            foreach (var candidate in candidates)
            {
                var diskPath = Path.Combine(folderAbsolutePath, candidate);
                if (File.Exists(diskPath))
                {
                    descriptor.ThumbnailVirtualPath = BuildVirtualPath(folderName, candidate);
                    return;
                }
            }
        }

        /// <summary>
        /// Builds the DNN-shape virtual path
        /// <c>~/DesktopModules/MegaForm/Resources/UserTemplates/&lt;folderName&gt;/&lt;file&gt;</c>.
        /// The Oqtane scanner is expected to rewrite the prefix if needed.
        /// </summary>
        private static string BuildVirtualPath(string folderName, string fileName)
        {
            return "~/DesktopModules/MegaForm/Resources/UserTemplates/" +
                   (folderName ?? string.Empty) + "/" + fileName;
        }

        /// <summary>
        /// Derives the template folder's virtual path from the manifest
        /// virtual path when available, otherwise falls back to the DNN-shape
        /// default. Used to populate <see cref="UserTemplateDescriptor.FolderVirtualPath"/>
        /// so the scanner does not have to compute it twice.
        /// </summary>
        private static string DeriveFolderVirtualPath(string manifestVirtualPath, string folderName)
        {
            if (!string.IsNullOrWhiteSpace(manifestVirtualPath))
            {
                // Strip "/widget.xml" suffix (case-insensitive) to get the folder.
                const string suffix = "/widget.xml";
                if (manifestVirtualPath.Length > suffix.Length &&
                    manifestVirtualPath.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                {
                    return manifestVirtualPath.Substring(0, manifestVirtualPath.Length - suffix.Length);
                }
            }
            return "~/DesktopModules/MegaForm/Resources/UserTemplates/" + (folderName ?? string.Empty);
        }

        /// <summary>
        /// Converts a folder name into a builder-friendly label
        /// (<c>blog-card</c> → <c>Blog Card</c>). Used as a sensible default
        /// for <see cref="UserTemplateDescriptor.Label"/> so descriptors that
        /// fail to parse still surface a readable name in the gallery.
        /// </summary>
        private static string HumanizeFolderName(string folderName)
        {
            if (string.IsNullOrWhiteSpace(folderName)) return string.Empty;
            var chars = folderName.ToCharArray();
            var sb = new System.Text.StringBuilder(chars.Length);
            bool capitalizeNext = true;
            for (int i = 0; i < chars.Length; i++)
            {
                char c = chars[i];
                if (c == '-' || c == '_' || c == '.')
                {
                    sb.Append(' ');
                    capitalizeNext = true;
                    continue;
                }
                if (capitalizeNext)
                {
                    sb.Append(char.ToUpperInvariant(c));
                    capitalizeNext = false;
                }
                else
                {
                    sb.Append(c);
                }
            }
            return sb.ToString();
        }
    }
}
