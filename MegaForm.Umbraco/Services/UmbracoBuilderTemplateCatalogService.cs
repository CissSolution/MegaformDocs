using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.AspNetCore.Hosting;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using MegaForm.Core.Services;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// Allows add-on packages to contribute additional builder templates
    /// without copying files into the host. Mirrors the Web host implementation.
    /// </summary>
    public interface IPremiumTemplateSource
    {
        IEnumerable<UmbracoBuilderTemplateCatalogService.BuilderTemplateRecord> GetTemplates();
    }

    public sealed class BuilderTemplateUploadResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public List<string> Warnings { get; set; } = new List<string>();
        public int ImportedTemplateCount { get; set; }
        public int SkippedTemplateCount { get; set; }
    }

    public sealed class UmbracoBuilderTemplateCatalogService
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
            public string FileName { get; set; }
            public string RelativePath { get; set; }
            public string Folder { get; set; }
            public DateTime UpdatedUtc { get; set; }
        }

        private readonly string _root;
        private readonly IEnumerable<IPremiumTemplateSource> _premiumSources;

        public UmbracoBuilderTemplateCatalogService(IWebHostEnvironment env, IEnumerable<IPremiumTemplateSource> premiumSources = null)
        {
            _root = MegaFormUmbracoPaths.GetBuilderTemplatesPath(env);
            Directory.CreateDirectory(_root);
            _premiumSources = premiumSources ?? Array.Empty<IPremiumTemplateSource>();
        }

        public string TemplatesRoot => _root;

        public IReadOnlyList<BuilderTemplateRecord> List()
        {
            var list = new List<BuilderTemplateRecord>();

            if (Directory.Exists(_root))
            {
                var files = Directory.GetFiles(_root, "*.json", SearchOption.AllDirectories)
                    .OrderByDescending(File.GetLastWriteTimeUtc)
                    .ThenBy(f => UmbracoBuilderTemplateNormalizer.GetRelativePathSafe(_root, f), StringComparer.OrdinalIgnoreCase)
                    .ToList();

                foreach (var file in files)
                {
                    try
                    {
                        var json = File.ReadAllText(file);
                        var relativePath = UmbracoBuilderTemplateNormalizer.GetRelativePathSafe(_root, file);
                        var record = UmbracoBuilderTemplateNormalizer.Normalize(json, Path.GetFileName(file), relativePath);
                        record.FileName = Path.GetFileName(file);
                        record.RelativePath = relativePath;
                        record.Folder = UmbracoBuilderTemplateNormalizer.GetFolderFromRelativePath(relativePath);
                        record.UpdatedUtc = File.GetLastWriteTimeUtc(file);
                        list.Add(record);
                    }
                    catch
                    {
                        // ignore malformed templates
                    }
                }
            }

            foreach (var source in _premiumSources)
            {
                try
                {
                    var extras = source.GetTemplates();
                    if (extras != null)
                        list.AddRange(extras);
                }
                catch
                {
                    // ignore misbehaving add-on sources
                }
            }

            return list;
        }

        public BuilderTemplateRecord ParseTemplate(string json, string fileName, string relativePath)
        {
            var record = UmbracoBuilderTemplateNormalizer.Normalize(json, fileName, relativePath);
            record.FileName = fileName;
            record.RelativePath = relativePath;
            record.Folder = UmbracoBuilderTemplateNormalizer.GetFolderFromRelativePath(relativePath);
            record.UpdatedUtc = DateTime.UtcNow;
            return record;
        }

        public BuilderTemplateRecord SaveTemplateJson(string originalFileName, string json)
        {
            var record = UmbracoBuilderTemplateNormalizer.Normalize(json, originalFileName, Path.GetFileName(originalFileName));
            var fileName = record.Slug + ".json";
            var path = Path.Combine(_root, fileName);
            File.WriteAllText(path, UmbracoBuilderTemplateNormalizer.BuildPersistedJson(record));
            record.FileName = fileName;
            record.UpdatedUtc = File.GetLastWriteTimeUtc(path);
            return record;
        }

        public BuilderTemplateUploadResult SaveUploadedTemplate(string originalFileName, Stream stream, string templateJson)
        {
            var result = new BuilderTemplateUploadResult();
            try
            {
                string json = templateJson;
                if (stream != null)
                {
                    using (var reader = new StreamReader(stream))
                        json = reader.ReadToEnd();
                }
                if (string.IsNullOrWhiteSpace(json))
                {
                    result.Message = "No template JSON provided.";
                    return result;
                }
                var record = SaveTemplateJson(originalFileName, json);
                result.Success = true;
                result.ImportedTemplateCount = 1;
                result.Message = $"Template '{record.Title}' uploaded as {record.Slug}.json";
            }
            catch (Exception ex)
            {
                result.Message = ex.Message;
                result.Warnings.Add(ex.Message);
            }
            return result;
        }
    }
}
