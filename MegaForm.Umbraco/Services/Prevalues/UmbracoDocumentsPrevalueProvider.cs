using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Core.Models.Prevalues;
using MegaForm.Core.Services.Prevalues;
using Newtonsoft.Json;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.Services;
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
        private readonly IContentService _contentService;

        public UmbracoDocumentsPrevalueProvider(
            IUmbracoContextAccessor umbracoContextAccessor,
            IContentService contentService)
        {
            _umbracoContextAccessor = umbracoContextAccessor;
            _contentService = contentService;
        }

        public Task<List<PrevalueOption>> GetOptionsAsync(PrevalueSource source, PrevalueProviderContext context)
        {
            var result = new List<PrevalueOption>();
            if (source == null) return Task.FromResult(result);

            var settings = source.ReadSettings<DocumentSettings>();
            if (settings == null) return Task.FromResult(result);

            try
            {
                if (!_umbracoContextAccessor.TryGetUmbracoContext(out var umbracoContext)) return Task.FromResult(result);
                var root = ResolveRoot(umbracoContext, settings, context);
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
            var hasRelativeRoot = settings.UseCurrentPageAsRoot
                || (settings.DynamicRoot != null && !string.IsNullOrWhiteSpace(settings.DynamicRoot.OriginAlias));
            if (settings.RootNodeId <= 0 && !hasRelativeRoot)
                return Task.FromResult("Pick a root node, or use the current page / a dynamic root.");
            return Task.FromResult<string>(null);
        }

        /// <summary>
        /// [DynamicRoot 2026-08-18] Where this source starts listing, which may depend on the page
        /// the form is rendered on.
        ///
        /// Three ways, in the order they win:
        ///   1. "Use the current page as root" - the page itself.
        ///   2. A dynamic root: an ORIGIN relative to the current page, then STEPS that walk up or
        ///      down to the nearest/furthest node of a given document type. This is the shape
        ///      Umbraco Forms uses, and it is the only way to configure "the section this page
        ///      belongs to" once and have it mean something different on every page.
        ///   3. The fixed node picked in the editor.
        ///
        /// A relative root has no answer without a page context, so it resolves to null and the
        /// source returns nothing. Falling back to another branch would list the wrong content
        /// while looking like it had worked.
        /// </summary>
        private IPublishedContent ResolveRoot(IUmbracoContext umbracoContext, DocumentSettings settings, PrevalueProviderContext context)
        {
            var content = umbracoContext.Content;
            if (content == null) return null;

            var current = context != null && context.CurrentPageId > 0
                ? content.GetById(context.CurrentPageId)
                : null;

            if (settings.UseCurrentPageAsRoot) return current;

            var dynamicRoot = settings.DynamicRoot;
            if (dynamicRoot != null && !string.IsNullOrWhiteSpace(dynamicRoot.OriginAlias))
            {
                var node = ResolveOrigin(umbracoContext, dynamicRoot, current);
                foreach (var step in dynamicRoot.Steps ?? new List<DynamicRootStep>())
                {
                    if (node == null) break;
                    node = ApplyStep(node, step);
                }
                return node;
            }

            return settings.RootNodeId > 0 ? content.GetById(settings.RootNodeId) : null;
        }

        private IPublishedContent ResolveOrigin(IUmbracoContext umbracoContext, DynamicRootSettings dynamicRoot, IPublishedContent current)
        {
            switch ((dynamicRoot.OriginAlias ?? string.Empty).Trim().ToLowerInvariant())
            {
                case "contentroot":
                {
                    // IPublishedContentCache has no GetAtRoot on this build; the content service
                    // knows the top of the tree, and the published cache turns that id into the
                    // published node the rest of this provider works with.
                    var first = _contentService.GetRootContent()?.OrderBy(c => c.SortOrder).FirstOrDefault();
                    return first == null ? null : umbracoContext.Content?.GetById(first.Id);
                }
                case "root":
                    // The root of the tree the current page belongs to.
                    return current?.AncestorOrSelf(1);
                case "site":
                    // Nearest ancestor that starts a site. With no domain service to ask here, the
                    // level-1 ancestor IS the site root on the tree shapes this ships to; saying so
                    // beats pretending the two are different things.
                    return current?.AncestorOrSelf(1);
                case "parent":
                    return current?.Parent;
                case "current":
                    return current;
                case "specificnode":
                    return dynamicRoot.OriginKey != Guid.Empty ? umbracoContext.Content?.GetById(dynamicRoot.OriginKey) : null;
                default:
                    return current;
            }
        }

        private static IPublishedContent ApplyStep(IPublishedContent node, DynamicRootStep step)
        {
            if (step == null) return node;
            var types = (step.DocumentTypeAliases ?? new List<string>())
                .Where(a => !string.IsNullOrWhiteSpace(a))
                .ToList();

            bool Matches(IPublishedContent candidate) =>
                types.Count == 0 || types.Any(a => string.Equals(a, candidate.ContentType.Alias, StringComparison.OrdinalIgnoreCase));

            switch ((step.Alias ?? string.Empty).Trim().ToLowerInvariant())
            {
                case "nearestancestororself":
                    for (var n = node; n != null; n = n.Parent)
                        if (Matches(n)) return n;
                    return null;

                case "furthestancestororself":
                {
                    IPublishedContent found = null;
                    for (var n = node; n != null; n = n.Parent)
                        if (Matches(n)) found = n;
                    return found;
                }

                case "nearestdescendantorself":
                {
                    if (Matches(node)) return node;
                    // Breadth first: "nearest" is fewest levels down, not first in document order.
                    var queue = new Queue<IPublishedContent>(node.Children ?? Enumerable.Empty<IPublishedContent>());
                    while (queue.Count > 0)
                    {
                        var candidate = queue.Dequeue();
                        if (Matches(candidate)) return candidate;
                        foreach (var child in candidate.Children ?? Enumerable.Empty<IPublishedContent>()) queue.Enqueue(child);
                    }
                    return null;
                }

                case "furthestdescendantorself":
                {
                    var deepest = Matches(node) ? node : null;
                    foreach (var candidate in node.Descendants())
                        if (Matches(candidate) && (deepest == null || candidate.Level > deepest.Level)) deepest = candidate;
                    return deepest;
                }

                default:
                    return node;
            }
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

            /// <summary>The page the form is on becomes the root. Needs a page context.</summary>
            [JsonProperty("useCurrentPageAsRoot")]
            public bool UseCurrentPageAsRoot { get; set; }

            [JsonProperty("dynamicRoot")]
            public DynamicRootSettings DynamicRoot { get; set; }
        }

        /// <summary>An origin relative to the current page, then steps that walk to the real root.</summary>
        public class DynamicRootSettings
        {
            /// <summary>ContentRoot | Root | Site | Parent | Current | SpecificNode</summary>
            [JsonProperty("originAlias")]
            public string OriginAlias { get; set; }

            /// <summary>The picked node, when the origin is SpecificNode.</summary>
            [JsonProperty("originKey")]
            public Guid OriginKey { get; set; }

            [JsonProperty("steps")]
            public List<DynamicRootStep> Steps { get; set; }
        }

        public class DynamicRootStep
        {
            /// <summary>NearestAncestorOrSelf | FurthestAncestorOrSelf | NearestDescendantOrSelf | FurthestDescendantOrSelf</summary>
            [JsonProperty("alias")]
            public string Alias { get; set; }

            [JsonProperty("documentTypeAliases")]
            public List<string> DocumentTypeAliases { get; set; }
        }
    }
}
