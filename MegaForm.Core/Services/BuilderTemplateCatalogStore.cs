using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using Newtonsoft.Json;
using System.Text;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    public sealed class BuilderTemplateCatalogStore
    {
        public sealed class BuilderTemplateRecord
        {
            public string Id { get; set; }
            public string Slug { get; set; }
            public string Title { get; set; }
            public string Description { get; set; }
            public string Category { get; set; }
            public string[] Categories { get; set; } = Array.Empty<string>();
            public string Icon { get; set; }
            public JArray Fields { get; set; } = new JArray();
            public string SubmitButtonText { get; set; }
            public string SuccessMessage { get; set; }
            public string CustomHtml { get; set; }
            public string CustomCss { get; set; }
            public JToken Rules { get; set; } = new JArray();
            public JToken Workflow { get; set; }
            public JObject Settings { get; set; } = new JObject();
            public string TemplateGuideSlug { get; set; }
            public string FileName { get; set; }
            public string RelativePath { get; set; }
            public string Folder { get; set; }
            public DateTime UpdatedUtc { get; set; }
        }

        public sealed class BuilderTemplateUploadResult
        {
            public bool Success { get; set; }
            public bool IsArchive { get; set; }
            public string Message { get; set; }
            public int ImportedTemplateCount { get; set; }
            public int ExtractedFileCount { get; set; }
            public int SkippedTemplateCount { get; set; }
            public BuilderTemplateRecord Saved { get; set; }
            public IReadOnlyList<BuilderTemplateRecord> Templates { get; set; } = Array.Empty<BuilderTemplateRecord>();
            public IReadOnlyList<string> Warnings { get; set; } = Array.Empty<string>();
        }

        // [TemplateListCache v20260507-13] Cache the parsed list keyed by an
        // mtime fingerprint of all JSON files. List() previously did N file
        // reads + N JSON parses on EVERY gallery open (admin filter clicks
        // each fire a fresh List call) — measured ~1.5–3 s for 59 templates
        // on first paint. Cache returns instantly on cache hit; invalidates
        // only when any *.json file is added/modified/removed.
        public const string TemplateListCacheBadge = "TemplateListCache v20260507-13";
        private readonly string _root;
        private IReadOnlyList<BuilderTemplateRecord> _listCache;
        private string _listCacheStamp;
        private readonly object _listCacheLock = new object();

        public BuilderTemplateCatalogStore(string root)
        {
            _root = root ?? throw new ArgumentNullException(nameof(root));
            Directory.CreateDirectory(_root);
        }

        public IReadOnlyList<BuilderTemplateRecord> List()
        {
            if (!Directory.Exists(_root)) return Array.Empty<BuilderTemplateRecord>();

            // Build a cheap fingerprint: count + sum of last-write ticks of all
            // JSON files. Any add / delete / modify changes the fingerprint.
            // Fingerprint computation is ONE directory scan (fast); avoids the
            // N file reads + JSON parses unless content actually changed.
            var allFiles = Directory.GetFiles(_root, "*.json", SearchOption.AllDirectories);
            long stampSum = 0;
            for (int i = 0; i < allFiles.Length; i++)
            {
                try { stampSum += File.GetLastWriteTimeUtc(allFiles[i]).Ticks; } catch { }
            }
            string stamp = allFiles.Length.ToString() + ":" + stampSum.ToString();

            lock (_listCacheLock)
            {
                if (_listCache != null && _listCacheStamp == stamp) return _listCache;
            }

            var files = allFiles
                .OrderByDescending(File.GetLastWriteTimeUtc)
                .ThenBy(f => GetRelativePathSafe(_root, f), StringComparer.OrdinalIgnoreCase)
                .ToList();

            var list = new List<BuilderTemplateRecord>();
            foreach (var file in files)
            {
                try
                {
                    var json = File.ReadAllText(file);
                    var relativePath = GetRelativePathSafe(_root, file);
                    var record = Normalize(json, Path.GetFileName(file), relativePath);
                    record.FileName = Path.GetFileName(file);
                    record.RelativePath = relativePath;
                    record.Folder = GetFolderFromRelativePath(relativePath);
                    record.UpdatedUtc = File.GetLastWriteTimeUtc(file);
                    list.Add(record);
                }
                catch
                {
                }
            }

            lock (_listCacheLock)
            {
                _listCache = list;
                _listCacheStamp = stamp;
            }
            return list;
        }

        /// <summary>
        /// Invalidate the in-memory list cache (called by Save/Delete paths
        /// inside this store so the next List() reflects the change without
        /// waiting on filesystem mtime granularity).
        /// </summary>
        private void InvalidateListCache()
        {
            lock (_listCacheLock)
            {
                _listCache = null;
                _listCacheStamp = null;
            }
        }

        public BuilderTemplateRecord SaveTemplateJson(string originalFileName, string json)
        {
            return SaveTemplateJsonInternal(originalFileName, json, GetSafeUploadRelativePath(originalFileName), false);
        }

        public BuilderTemplateUploadResult SaveUploadedTemplate(string originalFileName, Stream fileStream, string templateJson = null)
        {
            var extension = Path.GetExtension(originalFileName ?? string.Empty);
            if (string.Equals(extension, ".zip", StringComparison.OrdinalIgnoreCase))
            {
                if (fileStream == null) throw new InvalidOperationException("ZIP file stream is required.");
                return ImportZip(originalFileName, fileStream);
            }

            string json = templateJson;
            if (string.IsNullOrWhiteSpace(json))
            {
                if (fileStream == null) throw new InvalidOperationException("Template file or JSON payload is required.");
                using (var reader = new StreamReader(fileStream, Encoding.UTF8, true, 8192, true))
                {
                    json = reader.ReadToEnd();
                }
            }

            var saved = SaveTemplateJson(originalFileName, json);
            return new BuilderTemplateUploadResult
            {
                Success = true,
                IsArchive = false,
                Message = "Template uploaded.",
                ImportedTemplateCount = 1,
                ExtractedFileCount = 1,
                SkippedTemplateCount = 0,
                Saved = saved,
                Templates = new[] { saved },
                Warnings = Array.Empty<string>()
            };
        }

        public BuilderTemplateUploadResult ImportZip(string originalFileName, Stream zipStream)
        {
            if (zipStream == null) throw new InvalidOperationException("ZIP file stream is required.");
            if (zipStream.CanSeek) zipStream.Position = 0;

            var imported = new List<BuilderTemplateRecord>();
            var extractedFileCount = 0;
            var skippedTemplateCount = 0;
            var warnings = new List<string>();

            using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Read, leaveOpen: true))
            {
                foreach (var entry in archive.Entries)
                {
                    if (entry == null) continue;
                    if (string.IsNullOrWhiteSpace(entry.Name))
                    {
                        if (!string.IsNullOrWhiteSpace(entry.FullName))
                        {
                            var dirRelative = NormalizeRelativePath(entry.FullName);
                            if (!string.IsNullOrWhiteSpace(dirRelative))
                            {
                                Directory.CreateDirectory(Path.Combine(_root, dirRelative.Replace('/', Path.DirectorySeparatorChar)));
                            }
                        }
                        continue;
                    }

                    var relativePath = NormalizeRelativePath(entry.FullName);
                    if (string.IsNullOrWhiteSpace(relativePath)) continue;

                    extractedFileCount++;
                    var extension = Path.GetExtension(entry.Name ?? string.Empty);
                    if (string.Equals(extension, ".json", StringComparison.OrdinalIgnoreCase))
                    {
                        try
                        {
                            using (var reader = new StreamReader(entry.Open()))
                            {
                                var json = reader.ReadToEnd();
                                var record = SaveTemplateJsonInternal(entry.Name, json, relativePath, true);
                                imported.Add(record);
                            }
                        }
                        catch (Exception ex)
                        {
                            skippedTemplateCount++;
                            warnings.Add(BuildZipEntryWarning(entry.FullName, ex));
                        }
                        continue;
                    }

                    try
                    {
                        SaveRawFile(entry, relativePath);
                    }
                    catch (Exception ex)
                    {
                        warnings.Add(BuildZipEntryWarning(entry.FullName, ex));
                    }
                }
            }

            var success = imported.Count > 0 || warnings.Count == 0;
            var message = imported.Count > 0
                ? ("ZIP imported: " + imported.Count + " template(s), " + extractedFileCount + " file(s).")
                : (warnings.Count > 0
                    ? ("ZIP processed with errors: 0 template(s) imported, " + extractedFileCount + " file(s) scanned.")
                    : ("ZIP extracted: " + extractedFileCount + " file(s)."));
            if (skippedTemplateCount > 0)
            {
                message += " Skipped " + skippedTemplateCount + " invalid template file" + (skippedTemplateCount == 1 ? string.Empty : "s") + ".";
            }
            if (warnings.Count > 0)
            {
                var preview = string.Join(" | ", warnings.Take(3));
                if (!string.IsNullOrWhiteSpace(preview)) message += " " + preview;
            }

            return new BuilderTemplateUploadResult
            {
                Success = success,
                IsArchive = true,
                Message = message,
                ImportedTemplateCount = imported.Count,
                ExtractedFileCount = extractedFileCount,
                SkippedTemplateCount = skippedTemplateCount,
                Saved = imported.Count == 1 ? imported[0] : null,
                Templates = imported,
                Warnings = warnings
            };
        }

        private static string BuildZipEntryWarning(string entryName, Exception ex)
        {
            var safeName = string.IsNullOrWhiteSpace(entryName) ? "(unknown entry)" : entryName.Replace('\\', '/');
            var message = (ex?.Message ?? "invalid or unsupported template file").Trim();
            return safeName + ": " + message;
        }

        private BuilderTemplateRecord SaveTemplateJsonInternal(string fileName, string json, string relativePathHint, bool preserveRelativeFileName)
        {
            var safeRelativeHint = NormalizeRelativePath(relativePathHint);
            var record = Normalize(json, fileName, safeRelativeHint);
            var folder = GetFolderFromRelativePath(safeRelativeHint);
            var desiredRelativePath = preserveRelativeFileName
                ? safeRelativeHint
                : CombineRelativePath(folder, record.Slug + ".json");

            var finalRelativePath = EnsureUniqueRelativePath(desiredRelativePath);
            var fullPath = Path.Combine(_root, finalRelativePath.Replace('/', Path.DirectorySeparatorChar));
            var fullDir = Path.GetDirectoryName(fullPath);
            if (!string.IsNullOrWhiteSpace(fullDir)) Directory.CreateDirectory(fullDir);

            File.WriteAllText(fullPath, BuildPersistedJson(record));
            InvalidateListCache();

            record.FileName = Path.GetFileName(fullPath);
            record.RelativePath = finalRelativePath;
            record.Folder = GetFolderFromRelativePath(finalRelativePath);
            record.UpdatedUtc = File.GetLastWriteTimeUtc(fullPath);
            record.Id = "file-" + Slugify((record.RelativePath ?? record.FileName ?? record.Slug).Replace("\\", "/"));
            return record;
        }

        private void SaveRawFile(ZipArchiveEntry entry, string relativePath)
        {
            var finalRelativePath = EnsureUniqueRelativePath(relativePath);
            var fullPath = Path.Combine(_root, finalRelativePath.Replace('/', Path.DirectorySeparatorChar));
            var fullDir = Path.GetDirectoryName(fullPath);
            if (!string.IsNullOrWhiteSpace(fullDir)) Directory.CreateDirectory(fullDir);
            using (var source = entry.Open())
            using (var target = File.Create(fullPath))
            {
                source.CopyTo(target);
            }
            InvalidateListCache();
        }

        private static BuilderTemplateRecord Normalize(string json, string fileName, string relativePath)
        {
            var raw = TemplateSchemaCanonicalizer.Canonicalize(JObject.Parse(json ?? "{}"));
            var settings = raw["settings"] as JObject ?? new JObject();
            var title = (string)raw["title"] ?? Path.GetFileNameWithoutExtension(fileName) ?? "Uploaded Template";
            var slug = Slugify((string)raw["slug"] ?? title);
            var folder = GetFolderFromRelativePath(relativePath);

            var submitButtonText = (string)raw["submitButtonText"] ?? (string)settings["submitButtonText"] ?? "Submit";
            var successMessage = (string)raw["successMessage"] ?? (string)settings["successMessage"] ?? string.Empty;
            var customHtml = (string)raw["customHtml"] ?? (string)settings["customHtml"] ?? string.Empty;
            var customCss = (string)raw["customCss"] ?? (string)settings["customCss"] ?? string.Empty;
            var rules = raw["rules"] != null ? raw["rules"].DeepClone() : (settings["rules"] != null ? settings["rules"].DeepClone() : new JArray());
            var workflow = raw["workflow"] != null ? raw["workflow"].DeepClone() : (settings["workflowTemplate"] != null ? settings["workflowTemplate"].DeepClone() : null);
            var fields = raw["fields"] as JArray ?? new JArray();
            var templateGuideSlug = (string)raw["templateGuideSlug"] ?? (string)settings["templateGuideSlug"] ?? string.Empty;

            var mergedSettings = new JObject(settings);
            var categories = NormalizeCategories(raw["categories"], (string)raw["category"]);
            mergedSettings["submitButtonText"] = submitButtonText;
            mergedSettings["successMessage"] = successMessage;
            mergedSettings["customHtml"] = customHtml;
            mergedSettings["customCss"] = customCss;
            mergedSettings["rules"] = rules ?? new JArray();
            mergedSettings["workflowTemplate"] = workflow;
            mergedSettings["templateGuideSlug"] = templateGuideSlug;

            // [ContentRootMerge v20260501-04] Some authored templates put content
            // keys at the root under "content" (or "Content") instead of nesting them
            // under settings.customContent. Merge them so {{content:xxx}} resolution
            // works at runtime regardless of authoring style. Existing customContent
            // entries always win on key collision.
            var rootContent = raw["content"] as JObject ?? raw["Content"] as JObject;
            if (rootContent != null)
            {
                var existingCustomContent = mergedSettings["customContent"] as JObject ?? mergedSettings["CustomContent"] as JObject ?? new JObject();
                foreach (var prop in rootContent.Properties())
                {
                    if (existingCustomContent[prop.Name] == null)
                    {
                        existingCustomContent[prop.Name] = prop.Value?.DeepClone();
                    }
                }
                mergedSettings["customContent"] = existingCustomContent;
            }

            return new BuilderTemplateRecord
            {
                Id = "file-" + Slugify((relativePath ?? fileName ?? slug).Replace("\\", "/")),
                Slug = slug,
                Title = title,
                Description = (string)raw["description"] ?? "Uploaded template",
                Category = categories.FirstOrDefault() ?? "general",
                Categories = categories,
                Icon = (string)raw["icon"] ?? "📂",
                Fields = new JArray(fields.Select(f => f.DeepClone())),
                SubmitButtonText = submitButtonText,
                SuccessMessage = successMessage,
                CustomHtml = customHtml,
                CustomCss = customCss,
                Rules = rules ?? new JArray(),
                Workflow = workflow,
                TemplateGuideSlug = templateGuideSlug,
                Settings = mergedSettings,
                RelativePath = relativePath,
                Folder = folder,
            };
        }

        private string EnsureUniqueRelativePath(string relativePath)
        {
            var normalized = NormalizeRelativePath(relativePath);
            if (string.IsNullOrWhiteSpace(normalized)) normalized = "uploaded-template.json";

            var folder = GetFolderFromRelativePath(normalized);
            var extension = Path.GetExtension(normalized);
            var baseName = Path.GetFileNameWithoutExtension(normalized);
            var candidate = normalized;
            var counter = 2;

            while (File.Exists(Path.Combine(_root, candidate.Replace('/', Path.DirectorySeparatorChar))))
            {
                var name = baseName + "-" + counter + extension;
                candidate = CombineRelativePath(folder, name);
                counter++;
            }

            return candidate;
        }

        private static string GetSafeUploadRelativePath(string originalFileName)
        {
            var fileName = Path.GetFileName(string.IsNullOrWhiteSpace(originalFileName) ? "uploaded-template.json" : originalFileName);
            return NormalizeRelativePath(fileName);
        }

        private static string NormalizeRelativePath(string relativePath)
        {
            var path = (relativePath ?? string.Empty).Replace('\\', '/').Trim();
            if (string.IsNullOrWhiteSpace(path)) return string.Empty;
            while (path.StartsWith("./", StringComparison.Ordinal)) path = path.Substring(2);
            path = path.Trim('/');
            if (string.IsNullOrWhiteSpace(path)) return string.Empty;

            var parts = path.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            var safeParts = new List<string>();
            foreach (var part in parts)
            {
                var token = (part ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(token)) continue;
                if (token == "." || token == "..") continue;
                if (token.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
                {
                    token = new string(token.Where(ch => Array.IndexOf(Path.GetInvalidFileNameChars(), ch) < 0).ToArray());
                }
                if (string.IsNullOrWhiteSpace(token)) continue;
                safeParts.Add(token);
            }
            return string.Join("/", safeParts);
        }

        private static string CombineRelativePath(string folder, string fileName)
        {
            var safeFolder = NormalizeRelativePath(folder);
            var safeFileName = Path.GetFileName(fileName ?? string.Empty);
            safeFileName = NormalizeRelativePath(safeFileName);
            if (string.IsNullOrWhiteSpace(safeFolder)) return safeFileName;
            if (string.IsNullOrWhiteSpace(safeFileName)) return safeFolder;
            return safeFolder + "/" + safeFileName;
        }

        private static string GetRelativePathSafe(string root, string file)
        {
            var normalizedRoot = (root ?? string.Empty).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            var full = (file ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(full)) return string.Empty;
            if (!string.IsNullOrWhiteSpace(normalizedRoot) && full.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase))
            {
                full = full.Substring(normalizedRoot.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            }
            return full.Replace('\\', '/');
        }

        private static string GetFolderFromRelativePath(string relativePath)
        {
            var path = (relativePath ?? string.Empty).Replace('\\', '/').Trim('/');
            var slash = path.LastIndexOf('/');
            return slash <= 0 ? string.Empty : path.Substring(0, slash);
        }

        private static string BuildPersistedJson(BuilderTemplateRecord record)
        {
            var obj = new JObject
            {
                ["version"] = "1.0",
                ["slug"] = record.Slug,
                ["title"] = record.Title,
                ["description"] = record.Description,
                ["category"] = record.Category,
                ["categories"] = new JArray((record.Categories != null && record.Categories.Length > 0 ? record.Categories : new[] { record.Category ?? "general" }).Distinct(StringComparer.OrdinalIgnoreCase)),
                ["icon"] = record.Icon,
                ["fields"] = record.Fields != null ? new JArray(record.Fields.Select(f => f.DeepClone())) : new JArray(),
                ["submitButtonText"] = record.SubmitButtonText ?? "Submit",
                ["successMessage"] = record.SuccessMessage ?? string.Empty,
                ["customHtml"] = record.CustomHtml ?? string.Empty,
                ["customCss"] = record.CustomCss ?? string.Empty,
                ["rules"] = record.Rules != null ? record.Rules.DeepClone() : new JArray(),
                ["workflow"] = record.Workflow != null ? record.Workflow.DeepClone() : null,
                ["settings"] = record.Settings != null ? new JObject(record.Settings) : new JObject()
            };
            return obj.ToString(Formatting.Indented);
        }


        private static string[] NormalizeCategories(JToken categoriesToken, string category)
        {
            var list = new List<string>();

            if (categoriesToken is JArray arr)
            {
                foreach (var item in arr)
                {
                    var normalized = NormalizeCategoryValue((string)item);
                    if (!string.IsNullOrWhiteSpace(normalized) && !list.Contains(normalized, StringComparer.OrdinalIgnoreCase))
                    {
                        list.Add(normalized);
                    }
                }
            }

            var primary = NormalizeCategoryValue(category);
            if (!string.IsNullOrWhiteSpace(primary) && !list.Contains(primary, StringComparer.OrdinalIgnoreCase))
            {
                list.Insert(0, primary);
            }

            if (list.Count == 0) list.Add("general");
            return list.ToArray();
        }

        private static string NormalizeCategoryValue(string value)
        {
            var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
            return string.IsNullOrWhiteSpace(normalized) ? string.Empty : normalized;
        }

        private static string Slugify(string input)
        {
            var value = (input ?? string.Empty).Trim().ToLowerInvariant();
            var chars = value.Select(ch => char.IsLetterOrDigit(ch) ? ch : '-').ToArray();
            var raw = new string(chars);
            while (raw.Contains("--")) raw = raw.Replace("--", "-");
            raw = raw.Trim('-');
            return string.IsNullOrWhiteSpace(raw) ? ("template-" + DateTime.UtcNow.Ticks) : raw;
        }
    }
}

