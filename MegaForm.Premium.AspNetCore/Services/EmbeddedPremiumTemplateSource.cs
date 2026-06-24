using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using MegaForm.Web.Services;

namespace MegaForm.Premium.AspNetCore.Services
{
    /// <summary>
    /// Contributes the premium form templates embedded inside this package.
    /// </summary>
    public sealed class EmbeddedPremiumTemplateSource : IPremiumTemplateSource
    {
        private const string TemplateResourcePrefix = "MegaForm.Premium.AspNetCore.Templates.";

        public IEnumerable<BuilderTemplateCatalogService.BuilderTemplateRecord> GetTemplates()
        {
            var assembly = typeof(EmbeddedPremiumTemplateSource).Assembly;
            foreach (var name in assembly.GetManifestResourceNames()
                .Where(n => n.StartsWith(TemplateResourcePrefix, StringComparison.OrdinalIgnoreCase))
                .OrderBy(n => n, StringComparer.OrdinalIgnoreCase))
            {
                BuilderTemplateCatalogService.BuilderTemplateRecord record = null;
                try
                {
                    var fileName = name.Substring(TemplateResourcePrefix.Length);
                    if (!fileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                        continue;

                    using var stream = assembly.GetManifestResourceStream(name);
                    if (stream == null) continue;
                    using var reader = new StreamReader(stream);
                    var json = reader.ReadToEnd();
                    var relativePath = $"premium/{fileName}";
                    record = BuilderTemplateNormalizer.Normalize(json, fileName, relativePath);
                    record.FileName = fileName;
                    record.RelativePath = relativePath;
                    record.Folder = "premium";
                    record.UpdatedUtc = DateTime.UtcNow;
                }
                catch
                {
                    continue;
                }
                if (record != null)
                    yield return record;
            }
        }
    }
}
