using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.AspNetCore.Hosting;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using MegaForm.Core.Services;

namespace MegaForm.Web.Services
{
    /// <summary>
    /// Allows add-on packages (e.g. MegaForm.Premium.AspNetCore) to contribute
    /// additional builder templates without copying files into the host.
    /// </summary>
    public interface IPremiumTemplateSource
    {
        IEnumerable<BuilderTemplateCatalogService.BuilderTemplateRecord> GetTemplates();
    }

    public sealed class BuilderTemplateUploadResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public List<string> Warnings { get; set; } = new List<string>();
        public int ImportedTemplateCount { get; set; }
        public int SkippedTemplateCount { get; set; }
    }

    public sealed class BuilderTemplateCatalogService
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

        public BuilderTemplateCatalogService(IWebHostEnvironment env, IEnumerable<IPremiumTemplateSource> premiumSources = null)
        {
            _root = Path.Combine(env.ContentRootPath, "App_Data", "MegaForm", "Templates");
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
                    .ThenBy(f => BuilderTemplateNormalizer.GetRelativePathSafe(_root, f), StringComparer.OrdinalIgnoreCase)
                    .ToList();

                foreach (var file in files)
                {
                    try
                    {
                        var json = File.ReadAllText(file);
                        var relativePath = BuilderTemplateNormalizer.GetRelativePathSafe(_root, file);
                        var record = BuilderTemplateNormalizer.Normalize(json, Path.GetFileName(file), relativePath);
                        record.FileName = Path.GetFileName(file);
                        record.RelativePath = relativePath;
                        record.Folder = BuilderTemplateNormalizer.GetFolderFromRelativePath(relativePath);
                        record.UpdatedUtc = File.GetLastWriteTimeUtc(file);
                        list.Add(record);
                    }
                    catch
                    {
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

        /// <summary>
        /// Normalizes a template JSON for use by external template sources.
        /// </summary>
        public BuilderTemplateRecord ParseTemplate(string json, string fileName, string relativePath)
        {
            var record = BuilderTemplateNormalizer.Normalize(json, fileName, relativePath);
            record.FileName = fileName;
            record.RelativePath = relativePath;
            record.Folder = BuilderTemplateNormalizer.GetFolderFromRelativePath(relativePath);
            record.UpdatedUtc = DateTime.UtcNow;
            return record;
        }

        public BuilderTemplateRecord SaveTemplateJson(string originalFileName, string json)
        {
            var record = BuilderTemplateNormalizer.Normalize(json, originalFileName, Path.GetFileName(originalFileName));
            var fileName = record.Slug + ".json";
            var path = Path.Combine(_root, fileName);
            File.WriteAllText(path, BuilderTemplateNormalizer.BuildPersistedJson(record));
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

        // Normalization is shared via BuilderTemplateNormalizer so external
        // template sources (e.g. the premium add-on) do not need to reference
        // the catalog service and create a circular dependency.
    }
}
