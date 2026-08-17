using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Core.Models.Prevalues;
using MegaForm.Core.Services.Prevalues;
using Newtonsoft.Json;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.Web;
using Umbraco.Extensions;

namespace MegaForm.Umbraco.Services.Prevalues
{
    /// <summary>
    /// Resolves PrevalueSource options from Umbraco content nodes.
    /// </summary>
    public sealed class UmbracoDocumentsPrevalueProvider : IPrevalueProvider
    {
        public const string ProviderType = "umbracoDocuments";

        public string Type => ProviderType;

        private readonly IUmbracoContextAccessor _umbracoContextAccessor;

        public UmbracoDocumentsPrevalueProvider(IUmbracoContextAccessor umbracoContextAccessor)
        {
            _umbracoContextAccessor = umbracoContextAccessor;
        }

        public Task<List<PrevalueOption>> GetOptionsAsync(PrevalueSource source, PrevalueProviderContext context)
        {
            var result = new List<PrevalueOption>();
            if (source == null) return Task.FromResult(result);

            var settings = source.ReadSettings<DocumentSettings>();
            if (settings == null || settings.RootNodeId <= 0) return Task.FromResult(result);

            try
            {
                if (!_umbracoContextAccessor.TryGetUmbracoContext(out var umbracoContext)) return Task.FromResult(result);
                var root = umbracoContext.Content?.GetById(settings.RootNodeId);
                if (root == null) return Task.FromResult(result);

                var candidates = new List<IPublishedContent> { root };
                if (settings.IncludeDescendants)
                {
                    // Descendants(this IPublishedContent, string culture = null) — the predicate
                    // overload does not exist, so a lambda binds to `culture` and fails to compile.
                    candidates.AddRange(root.Descendants());
                }

                foreach (var node in candidates)
                {
                    if (!string.IsNullOrWhiteSpace(settings.DocumentTypeAlias)
                        && !string.Equals(node.ContentType.Alias, settings.DocumentTypeAlias, StringComparison.OrdinalIgnoreCase))
                        continue;

                    var value = GetPropertyValue(node, settings.ValuePropertyAlias) ?? node.Key.ToString("D");
                    var label = GetPropertyValue(node, settings.LabelPropertyAlias) ?? node.Name;

                    result.Add(new PrevalueOption
                    {
                        Value = value,
                        Label = label ?? value
                    });
                }

                if (string.Equals(settings.SortBy, "name", StringComparison.OrdinalIgnoreCase))
                {
                    result = result.OrderBy(o => o.Label, StringComparer.OrdinalIgnoreCase).ToList();
                }
                else if (!string.IsNullOrWhiteSpace(settings.SortBy))
                {
                    // default: preserve traversal order; no sort
                }
            }
            catch { /* fail-soft */ }

            return Task.FromResult(result);
        }

        public Task<string> ValidateAsync(PrevalueSource source)
        {
            var settings = source?.ReadSettings<DocumentSettings>();
            if (settings == null) return Task.FromResult("Settings missing.");
            if (settings.RootNodeId <= 0) return Task.FromResult("Root node id is required.");
            return Task.FromResult<string>(null);
        }

        private static string GetPropertyValue(IPublishedContent node, string alias)
        {
            if (string.IsNullOrWhiteSpace(alias)) return null;
            var value = node.Value(alias);
            if (value == null) return null;
            if (value is IPublishedContent content) return content.Key.ToString("D");
            return Convert.ToString(value);
        }

        public class DocumentSettings
        {
            [JsonProperty("rootNodeId")]
            public int RootNodeId { get; set; }

            [JsonProperty("documentTypeAlias")]
            public string DocumentTypeAlias { get; set; }

            [JsonProperty("valuePropertyAlias")]
            public string ValuePropertyAlias { get; set; }

            [JsonProperty("labelPropertyAlias")]
            public string LabelPropertyAlias { get; set; }

            [JsonProperty("includeDescendants")]
            public bool IncludeDescendants { get; set; }

            [JsonProperty("sortBy")]
            public string SortBy { get; set; }
        }
    }
}
