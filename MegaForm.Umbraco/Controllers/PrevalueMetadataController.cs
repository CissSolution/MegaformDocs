using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Web.Common.Controllers;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Lists the things a prevalue source can point at, so the editor can offer pickers.
    ///
    /// Umbraco Forms never asks anyone to type an alias into its prevalue source editor: the
    /// root node is a picker, the document type is a list, and the value field is a list of the
    /// standard fields plus that document type's own properties. The MegaForm screen asked for
    /// typed aliases and numeric ids instead, which is how it produced "Test failed (HTTP 400)"
    /// from a perfectly reasonable-looking "Umbraco.DropDown.Flexible".
    ///
    /// The backoffice management API can list most of this, but not in the shape the providers
    /// consume: they store a document type ALIAS and an integer root node id, while the
    /// management API deals in GUIDs. Resolving that here keeps the guesswork out of the browser.
    ///
    /// Read-only, and every route is admin-gated by the same policy as the catalog itself.
    /// </summary>
    [Route("/umbraco/MegaForm/MegaFormApi/PrevalueMeta")]
    [Authorize("MegaFormApi")]
    public class PrevalueMetadataController : UmbracoApiController
    {
        private readonly IDataTypeService _dataTypeService;
        private readonly IContentTypeService _contentTypeService;
        private readonly IContentService _contentService;

        public PrevalueMetadataController(
            IDataTypeService dataTypeService,
            IContentTypeService contentTypeService,
            IContentService contentService)
        {
            _dataTypeService = dataTypeService;
            _contentTypeService = contentTypeService;
            _contentService = contentService;
        }

        /// <summary>Data types that can supply a list of prevalues.</summary>
        [HttpGet("DataTypes")]
        public IActionResult DataTypes()
        {
            var all = _dataTypeService.GetAllAsync().GetAwaiter().GetResult() ?? Enumerable.Empty<IDataType>();
            var items = all
                .Where(dt => dt != null)
                .Select(dt => new
                {
                    key = dt.Key,
                    id = dt.Id,
                    name = dt.Name,
                    editorAlias = dt.EditorAlias,
                })
                .OrderBy(x => x.name, StringComparer.OrdinalIgnoreCase)
                .ToList();
            return Ok(items);
        }

        /// <summary>Document types, by the ALIAS the provider stores.</summary>
        [HttpGet("DocumentTypes")]
        public IActionResult DocumentTypes()
        {
            var items = (_contentTypeService.GetAll() ?? Enumerable.Empty<IContentType>())
                .Where(ct => ct != null && !ct.IsElement)
                .Select(ct => new { alias = ct.Alias, name = ct.Name, icon = ct.Icon })
                .OrderBy(x => x.name, StringComparer.OrdinalIgnoreCase)
                .ToList();
            return Ok(items);
        }

        /// <summary>
        /// The fields available on a document type: the standard ones every node has, then its
        /// own properties — the split Umbraco Forms shows in its Value field picker.
        /// </summary>
        [HttpGet("DocumentTypeFields")]
        public IActionResult DocumentTypeFields(string alias)
        {
            var standard = new[]
            {
                new { alias = "id",   name = "Id",   standard = true },
                new { alias = "key",  name = "Key",  standard = true },
                new { alias = "name", name = "Name", standard = true },
            };

            if (string.IsNullOrWhiteSpace(alias)) return Ok(standard);

            var contentType = _contentTypeService.Get(alias);
            if (contentType == null) return Ok(standard);

            var custom = (contentType.CompositionPropertyTypes ?? Enumerable.Empty<IPropertyType>())
                .Where(p => p != null)
                .Select(p => new { alias = p.Alias, name = p.Name, standard = false })
                .OrderBy(x => x.name, StringComparer.OrdinalIgnoreCase);

            return Ok(standard.Concat(custom).ToList());
        }

        /// <summary>
        /// Candidate root nodes: the content roots and their immediate children, with the INTEGER
        /// id the provider stores. Deep trees are not walked here — a prevalue source points at a
        /// branch, and one level is enough to find it in the sites this ships to.
        /// </summary>
        [HttpGet("ContentRoots")]
        public IActionResult ContentRoots()
        {
            var results = new List<object>();
            var roots = _contentService.GetRootContent() ?? Enumerable.Empty<IContent>();
            foreach (var root in roots.Where(r => r != null))
            {
                results.Add(new { id = root.Id, key = root.Key, name = root.Name, depth = 0 });
                var children = _contentService.GetPagedChildren(root.Id, 0, 200, out _) ?? Enumerable.Empty<IContent>();
                foreach (var child in children.Where(c => c != null))
                {
                    results.Add(new { id = child.Id, key = child.Key, name = child.Name, depth = 1 });
                }
            }
            return Ok(results);
        }
    }
}
