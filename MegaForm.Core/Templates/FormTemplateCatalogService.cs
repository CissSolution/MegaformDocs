using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Templates
{
    /// <summary>
    /// In-memory form template catalog. Replace with persistent store for production.
    /// </summary>
    public class FormTemplateCatalogService : IFormTemplateCatalogService
    {
        private readonly ConcurrentDictionary<string, FormTemplateCatalogEntry> _templates = new ConcurrentDictionary<string, FormTemplateCatalogEntry>();

        public Task<IReadOnlyList<FormTemplateCatalogEntry>> SearchAsync(TemplateSearchQuery query, CancellationToken cancellationToken = default)
        {
            var queryable = _templates.Values.AsEnumerable();

            if (!string.IsNullOrWhiteSpace(query.SearchText))
            {
                var text = query.SearchText.ToLowerInvariant();
                queryable = queryable.Where(t =>
                    (t.Name != null && t.Name.ToLowerInvariant().Contains(text)) ||
                    (t.Description != null && t.Description.ToLowerInvariant().Contains(text)));
            }

            if (!string.IsNullOrWhiteSpace(query.Category))
                queryable = queryable.Where(t => t.Category != null && t.Category.Equals(query.Category, StringComparison.OrdinalIgnoreCase));

            if (query.Tags != null && query.Tags.Count > 0)
                queryable = queryable.Where(t => t.Tags != null && query.Tags.Any(tag => t.Tags.Contains(tag, StringComparer.OrdinalIgnoreCase)));

            if (query.BuiltInOnly.HasValue)
                queryable = queryable.Where(t => t.IsBuiltIn == query.BuiltInOnly.Value);

            var total = queryable.Count();
            var results = queryable
                .OrderBy(t => t.Name)
                .Skip((query.Page - 1) * query.PageSize)
                .Take(query.PageSize)
                .ToList();

            return Task.FromResult<IReadOnlyList<FormTemplateCatalogEntry>>(results);
        }

        public Task<FormTemplateCatalogEntry> GetByIdAsync(string id, CancellationToken cancellationToken = default)
        {
            _templates.TryGetValue(id, out var entry);
            return Task.FromResult(entry);
        }

        public Task<FormTemplateCatalogEntry> GetBySlugAsync(string slug, CancellationToken cancellationToken = default)
        {
            var entry = _templates.Values.FirstOrDefault(t => string.Equals(t.Slug, slug, StringComparison.OrdinalIgnoreCase));
            return Task.FromResult(entry);
        }

        public Task<TemplateImportResult> ImportFromJsonAsync(string name, string schemaJson, CancellationToken cancellationToken = default)
        {
            try
            {
                var entry = new FormTemplateCatalogEntry
                {
                    Name = name,
                    Slug = GenerateSlug(name),
                    SchemaJson = schemaJson,
                    IsBuiltIn = false
                };

                _templates[entry.Id] = entry;
                return Task.FromResult(TemplateImportResult.Ok(entry.Id, "Template imported successfully."));
            }
            catch (Exception ex)
            {
                return Task.FromResult(TemplateImportResult.Fail("Import failed.", ex));
            }
        }

        public async Task<TemplateImportResult> ImportFromZipAsync(string fileName, Stream zipStream, CancellationToken cancellationToken = default)
        {
            try
            {
                using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Read))
                {
                    var schemaEntry = archive.GetEntry("schema.json") ?? archive.Entries.FirstOrDefault(e => e.Name.EndsWith(".json", StringComparison.OrdinalIgnoreCase));
                    if (schemaEntry == null)
                        return TemplateImportResult.Fail("No JSON schema found in ZIP.");

                    using (var reader = new StreamReader(schemaEntry.Open(), Encoding.UTF8))
                    {
                        var schemaJson = await reader.ReadToEndAsync().ConfigureAwait(false);
                        return await ImportFromJsonAsync(Path.GetFileNameWithoutExtension(fileName), schemaJson, cancellationToken).ConfigureAwait(false);
                    }
                }
            }
            catch (Exception ex)
            {
                return TemplateImportResult.Fail("ZIP import failed.", ex);
            }
        }

        public Task<Stream> ExportToZipAsync(string id, CancellationToken cancellationToken = default)
        {
            if (!_templates.TryGetValue(id, out var entry) || string.IsNullOrWhiteSpace(entry.SchemaJson))
                return Task.FromResult<Stream>(null);

            var stream = new MemoryStream();
            using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, true))
            {
                var zipEntry = archive.CreateEntry("schema.json");
                using (var writer = new StreamWriter(zipEntry.Open(), Encoding.UTF8))
                {
                    writer.Write(entry.SchemaJson);
                }
            }
            stream.Position = 0;
            return Task.FromResult<Stream>(stream);
        }

        public Task SaveAsync(FormTemplateCatalogEntry entry, CancellationToken cancellationToken = default)
        {
            if (entry == null)
                throw new ArgumentNullException(nameof(entry));

            entry.UpdatedAt = DateTime.UtcNow;
            _templates[entry.Id] = entry;
            return Task.CompletedTask;
        }

        public Task DeleteAsync(string id, CancellationToken cancellationToken = default)
        {
            _templates.TryRemove(id, out _);
            return Task.CompletedTask;
        }

        public Task<int> GetBuiltInCountAsync(CancellationToken cancellationToken = default)
        {
            return Task.FromResult(_templates.Values.Count(t => t.IsBuiltIn));
        }

        private static string GenerateSlug(string name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return Guid.NewGuid().ToString("N");

            return name.ToLowerInvariant()
                .Replace(' ', '-')
                .Replace("--", "-")
                .Trim('-');
        }
    }
}
