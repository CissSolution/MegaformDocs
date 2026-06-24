using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using MegaForm.Core.Services;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Web.Services
{
    /// <summary>
    /// Shared template normalization logic used by the builder catalog and by
    /// external template sources (e.g. the premium add-on).
    /// </summary>
    public static class BuilderTemplateNormalizer
    {
        public static BuilderTemplateCatalogService.BuilderTemplateRecord Normalize(string json, string fileName, string relativePath)
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

            var mergedSettings = new JObject(settings);
            var categories = NormalizeCategories(raw["categories"], (string)raw["category"]);
            mergedSettings["submitButtonText"] = submitButtonText;
            mergedSettings["successMessage"] = successMessage;
            mergedSettings["customHtml"] = customHtml;
            mergedSettings["customCss"] = customCss;
            mergedSettings["rules"] = rules ?? new JArray();
            mergedSettings["workflowTemplate"] = workflow;

            return new BuilderTemplateCatalogService.BuilderTemplateRecord
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
                Settings = mergedSettings,
                RelativePath = relativePath,
                Folder = folder,
            };
        }

        public static string BuildPersistedJson(BuilderTemplateCatalogService.BuilderTemplateRecord record)
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

        public static string GetRelativePathSafe(string root, string file)
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

        public static string GetFolderFromRelativePath(string relativePath)
        {
            var path = (relativePath ?? string.Empty).Replace('\\', '/').Trim('/');
            var slash = path.LastIndexOf('/');
            return slash <= 0 ? string.Empty : path.Substring(0, slash);
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
