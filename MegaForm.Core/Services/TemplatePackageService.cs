using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.RegularExpressions;
using MegaForm.Core.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Manages template packages: install from ZIP, export to ZIP, JS security scanning, asset resolution.
    /// </summary>
    public class TemplatePackageService
    {
        private readonly string _templatesRoot;

        public TemplatePackageService(string desktopModulePath)
        {
            _templatesRoot = Path.Combine(desktopModulePath, "Templates");
            if (!Directory.Exists(_templatesRoot))
                Directory.CreateDirectory(_templatesRoot);
        }

        // ============================================================
        // JS SECURITY SCANNER
        // ============================================================

        private static readonly (string Pattern, string Category, string Severity)[] BlockedPatterns = new[]
        {
            // Network / Data Exfiltration
            (@"\bfetch\s*\(", "network", "critical"),
            (@"\bXMLHttpRequest\b", "network", "critical"),
            (@"\$\.\s*(ajax|get|post|getJSON)\s*\(", "network", "critical"),
            (@"\bnavigator\.sendBeacon\b", "network", "critical"),
            (@"\bnew\s+WebSocket\b", "network", "critical"),
            (@"\bnew\s+EventSource\b", "network", "critical"),
            (@"\bnew\s+Image\s*\(\s*\)\s*\.\s*src\s*=", "network", "critical"),

            // Cookie / Storage theft
            (@"\bdocument\.cookie\b", "storage", "critical"),
            (@"\blocalStorage\b", "storage", "critical"),
            (@"\bsessionStorage\b", "storage", "critical"),
            (@"\bindexedDB\b", "storage", "critical"),

            // DOM Injection / Code Execution
            (@"\bdocument\.write\b", "dom_injection", "critical"),
            (@"\beval\s*\(", "dom_injection", "critical"),
            (@"\bFunction\s*\(", "dom_injection", "critical"),
            (@"\bsetTimeout\s*\(\s*['""]", "dom_injection", "critical"),
            (@"\bsetInterval\s*\(\s*['""]", "dom_injection", "critical"),
            (@"\bimport\s*\(", "dom_injection", "critical"),

            // External Resources
            (@"<script\s[^>]*src\s*=", "external", "critical"),
            (@"<link\s[^>]*href\s*=\s*['""]https?://", "external", "critical"),
            (@"@import\s+url\s*\(\s*['""]?https?://", "external", "critical"),

            // Backlinks / Navigation hijack
            (@"\bwindow\.location\s*=", "backlink", "critical"),
            (@"\bwindow\.open\s*\(", "backlink", "critical"),
            (@"\btop\.location\b", "backlink", "critical"),
            (@"\bparent\.location\b", "backlink", "critical"),

            // Iframe / Embed
            (@"<iframe\b", "iframe", "critical"),
            (@"<embed\b", "iframe", "critical"),
            (@"<object\b", "iframe", "critical"),

            // innerHTML outside scoped container (warning level)
            (@"\.innerHTML\s*=", "dom_injection", "warning"),

            // External links in HTML
            (@"<a\s[^>]*href\s*=\s*['""]https?://", "backlink", "warning"),
        };

        public JsScanResult ScanJavaScript(string jsContent)
        {
            var result = new JsScanResult { Passed = true };
            if (string.IsNullOrWhiteSpace(jsContent)) return result;

            var lines = jsContent.Split('\n');
            for (int i = 0; i < lines.Length; i++)
            {
                var line = lines[i];
                // Skip single-line comments
                var trimmed = line.TrimStart();
                if (trimmed.StartsWith("//")) continue;

                foreach (var (pattern, category, severity) in BlockedPatterns)
                {
                    if (Regex.IsMatch(line, pattern, RegexOptions.IgnoreCase))
                    {
                        result.Violations.Add(new JsScanViolation
                        {
                            Line = i + 1,
                            Pattern = pattern,
                            Category = category,
                            Severity = severity,
                            Snippet = line.Trim().Substring(0, Math.Min(line.Trim().Length, 120))
                        });
                        if (severity == "critical") result.Passed = false;
                    }
                }
            }
            return result;
        }

        public JsScanResult ScanHtmlForInjection(string htmlContent)
        {
            var result = new JsScanResult { Passed = true };
            if (string.IsNullOrWhiteSpace(htmlContent)) return result;

            // Check for inline scripts
            if (Regex.IsMatch(htmlContent, @"<script\b", RegexOptions.IgnoreCase))
            {
                result.Passed = false;
                result.Violations.Add(new JsScanViolation
                {
                    Line = 0, Pattern = "<script>", Category = "dom_injection",
                    Severity = "critical", Snippet = "Inline <script> tags not allowed in template HTML"
                });
            }

            // Check for on* event handlers
            var onEvents = Regex.Matches(htmlContent, @"\bon\w+\s*=\s*['""]", RegexOptions.IgnoreCase);
            foreach (Match m in onEvents)
            {
                result.Passed = false;
                result.Violations.Add(new JsScanViolation
                {
                    Line = 0, Pattern = "on*=", Category = "dom_injection",
                    Severity = "critical", Snippet = m.Value
                });
            }

            return result;
        }

        // ============================================================
        // INSTALL TEMPLATE FROM ZIP
        // ============================================================

        public class InstallResult
        {
            public bool Success { get; set; }
            public string Slug { get; set; }
            public string Error { get; set; }
            public TemplateInfo Template { get; set; }
            public JsScanResult JsScanResult { get; set; }
        }

        public InstallResult InstallFromZip(Stream zipStream, int portalId, int userId)
        {
            var result = new InstallResult();
            string tempDir = null;

            try
            {
                // Extract to temp directory
                tempDir = Path.Combine(Path.GetTempPath(), "mf_tpl_" + Guid.NewGuid().ToString("N").Substring(0, 8));
                Directory.CreateDirectory(tempDir);

                using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Read))
                {
                    archive.ExtractToDirectory(tempDir);
                }

                // Look for template.json (may be in root or in a subdirectory)
                string metaPath = FindFile(tempDir, "template.json");
                if (metaPath == null)
                {
                    result.Error = "template.json not found in ZIP package";
                    return result;
                }

                string baseDir = Path.GetDirectoryName(metaPath);
                var meta = JObject.Parse(File.ReadAllText(metaPath));

                // Validate required metadata
                string name = meta["name"]?.ToString() ?? meta["meta"]?["name"]?.ToString();
                if (string.IsNullOrWhiteSpace(name))
                {
                    result.Error = "Template name is required in template.json";
                    return result;
                }

                string slug = meta["slug"]?.ToString()
                    ?? Regex.Replace(name.ToLower(), @"[^a-z0-9]+", "-").Trim('-');

                // Security scan JS if present
                string jsPath = Path.Combine(baseDir, "template.js");
                JsScanResult jsScan = new JsScanResult { Passed = true };
                if (File.Exists(jsPath))
                {
                    jsScan = ScanJavaScript(File.ReadAllText(jsPath));
                    result.JsScanResult = jsScan;
                    if (!jsScan.Passed)
                    {
                        result.Error = $"JS security scan failed: {jsScan.Violations.Count(v => v.Severity == "critical")} critical violations";
                        return result;
                    }
                }

                // Security scan HTML
                string htmlPath = Path.Combine(baseDir, "template.html");
                if (File.Exists(htmlPath))
                {
                    var htmlScan = ScanHtmlForInjection(File.ReadAllText(htmlPath));
                    if (!htmlScan.Passed)
                    {
                        result.Error = $"HTML security scan failed: {htmlScan.Violations.Count} violations";
                        result.JsScanResult = htmlScan;
                        return result;
                    }
                }

                // Create target directory
                string targetDir = Path.Combine(_templatesRoot, slug);
                if (Directory.Exists(targetDir))
                    Directory.Delete(targetDir, true); // overwrite existing

                Directory.CreateDirectory(targetDir);

                // Copy files
                CopyDirectory(baseDir, targetDir);

                // Count fields
                int fieldCount = 0;
                var fields = meta["fields"] ?? meta["form"]?["fields"];
                if (fields is JArray fArr) fieldCount = fArr.Count;

                // Build template info
                var template = new TemplateInfo
                {
                    PortalId = portalId,
                    Slug = slug,
                    Name = name,
                    Description = meta["description"]?.ToString() ?? meta["meta"]?["description"]?.ToString() ?? "",
                    Category = meta["category"]?.ToString() ?? meta["meta"]?["category"]?.ToString() ?? "general",
                    Icon = meta["icon"]?.ToString() ?? meta["meta"]?["icon"]?.ToString() ?? "📋",
                    Version = meta["version"]?.ToString() ?? "1.0",
                    Author = meta["author"]?.ToString() ?? "",
                    FieldCount = fieldCount,
                    HasCustomHtml = File.Exists(Path.Combine(targetDir, "template.html")),
                    HasCustomJs = File.Exists(Path.Combine(targetDir, "template.js")),
                    ThumbnailPath = File.Exists(Path.Combine(targetDir, "thumbnail.png"))
                        ? $"Templates/{slug}/thumbnail.png" : null,
                    FolderPath = $"Templates/{slug}",
                    MetadataJson = File.ReadAllText(Path.Combine(targetDir, "template.json")),
                    JsScanResult = JsonConvert.SerializeObject(jsScan),
                    IsEnabled = true,
                    InstalledBy = userId
                };

                result.Success = true;
                result.Slug = slug;
                result.Template = template;
                result.JsScanResult = jsScan;
            }
            catch (Exception ex)
            {
                result.Error = $"Installation failed: {ex.Message}";
            }
            finally
            {
                if (tempDir != null && Directory.Exists(tempDir))
                {
                    try { Directory.Delete(tempDir, true); } catch { }
                }
            }

            return result;
        }

        // ============================================================
        // EXPORT FORM AS ZIP TEMPLATE PACKAGE
        // ============================================================

        public byte[] ExportToZip(FormInfo form, FormSchema schema, string desktopModulePath)
        {
            using (var ms = new MemoryStream())
            {
                using (var archive = new ZipArchive(ms, ZipArchiveMode.Create, true))
                {
                    string slug = Regex.Replace(form.Title.ToLower(), @"[^a-z0-9]+", "-").Trim('-');

                    // template.json
                    var meta = new
                    {
                        name = form.Title,
                        slug = slug,
                        description = form.Description ?? "",
                        category = "general",
                        icon = "📋",
                        version = "1.0",
                        templateVersion = "2.0",
                        fields = schema.Fields,
                        settings = new
                        {
                            multiPage = schema.Settings?.MultiPage ?? false,
                            submitButtonText = form.SubmitButtonText ?? "Submit"
                        },
                        translations = schema.Translations
                    };

                    WriteEntry(archive, "template.json",
                        JsonConvert.SerializeObject(meta, Formatting.Indented));

                    // template.html (if customHtml)
                    string customHtml = schema.Settings?.CustomHtml;
                    if (!string.IsNullOrWhiteSpace(customHtml))
                    {
                        WriteEntry(archive, "template.html", customHtml);
                    }

                    // template.css (if customCss)
                    string customCss = schema.Settings?.CustomCss;
                    if (!string.IsNullOrWhiteSpace(customCss))
                    {
                        WriteEntry(archive, "template.css", customCss);
                    }
                }

                return ms.ToArray();
            }
        }

        // ============================================================
        // ASSET RESOLUTION
        // ============================================================

        /// <summary>
        /// Resolves {{asset:filename}} placeholders in HTML/CSS to local template paths.
        /// </summary>
        public string ResolveAssets(string content, string slug, string moduleVirtualPath)
        {
            if (string.IsNullOrWhiteSpace(content)) return content;

            string basePath = $"{moduleVirtualPath}/Templates/{slug}/assets/";

            return Regex.Replace(content, @"\{\{asset:([^}]+)\}\}", m =>
            {
                string filename = m.Groups[1].Value.Trim();
                // Sanitize: no path traversal
                filename = Path.GetFileName(filename);
                return basePath + filename;
            });
        }

        // ============================================================
        // HELPERS
        // ============================================================

        private string FindFile(string dir, string filename)
        {
            var found = Directory.GetFiles(dir, filename, SearchOption.AllDirectories);
            return found.Length > 0 ? found[0] : null;
        }

        private void CopyDirectory(string source, string target)
        {
            foreach (var file in Directory.GetFiles(source))
            {
                string dest = Path.Combine(target, Path.GetFileName(file));
                File.Copy(file, dest, true);
            }

            foreach (var subDir in Directory.GetDirectories(source))
            {
                string dirName = Path.GetFileName(subDir);
                string destDir = Path.Combine(target, dirName);
                Directory.CreateDirectory(destDir);
                CopyDirectory(subDir, destDir);
            }
        }

        private void WriteEntry(ZipArchive archive, string path, string content)
        {
            var entry = archive.CreateEntry(path, CompressionLevel.Optimal);
            using (var writer = new StreamWriter(entry.Open()))
            {
                writer.Write(content);
            }
        }
    }
}
