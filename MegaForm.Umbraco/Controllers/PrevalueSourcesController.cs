using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Core.Models.Prevalues;
using MegaForm.Core.Services;
using MegaForm.Core.Services.Prevalues;
using MegaForm.Umbraco.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Web.Common.Controllers;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Admin API for the MegaForm PrevalueSource catalog.
    /// Routes mirror the MegaFormApi shape so the shared TS UI can consume them consistently.
    /// </summary>
    [Route("/umbraco/MegaForm/MegaFormApi/PrevalueSources")]
    [Authorize("MegaFormApi")]
    public class PrevalueSourcesController : UmbracoApiController
    {
        private readonly IPrevalueSourceStore _store;
        private readonly PrevalueProviderRegistry _registry;
        private readonly PrevalueOptionsResolver _resolver;

        public PrevalueSourcesController(
            IPrevalueSourceStore store,
            PrevalueProviderRegistry registry,
            PrevalueOptionsResolver resolver)
        {
            _store = store;
            _registry = registry;
            _resolver = resolver;
        }

        [HttpGet("List")]
        public IActionResult List()
        {
            var items = _store.List().Select(MaskSecrets).ToList();
            return Ok(items);
        }

        [HttpGet("Get/{id}")]
        public IActionResult Get(int id)
        {
            var source = _store.Get(id);
            if (source == null) return NotFound();
            return Ok(MaskSecrets(source));
        }

        [HttpPost("Save")]
        public IActionResult Save([FromBody] PrevalueSource source)
        {
            if (source == null) return BadRequest("Source is required.");
            if (string.IsNullOrWhiteSpace(source.Name)) return BadRequest("Name is required.");
            if (string.IsNullOrWhiteSpace(source.Type)) return BadRequest("Type is required.");

            // Mask round-trip: if the submitted settings still contain ***, restore the stored secret.
            var existing = source.Id > 0 ? _store.Get(source.Id) : null;
            var existingByName = _store.GetByName(source.Name);
            if (existing == null && existingByName != null)
                return BadRequest($"A prevalue source named '{source.Name}' already exists.");
            if (existing != null && existingByName != null && existingByName.Id != existing.Id)
                return BadRequest($"A prevalue source named '{source.Name}' already exists.");

            source.SettingsJson = RestoreMaskedSecrets(source.SettingsJson, existing?.SettingsJson);

            var provider = _registry.Get(source.Type);
            if (provider == null) return BadRequest($"Provider '{source.Type}' is not registered.");

            var validation = provider.ValidateAsync(source).GetAwaiter().GetResult();
            if (!string.IsNullOrWhiteSpace(validation))
                return BadRequest(validation);

            var id = _store.Save(source);
            return Ok(new { id, source = MaskSecrets(_store.Get(id)) });
        }

        [HttpPost("Delete/{id}")]
        public IActionResult Delete(int id)
        {
            _store.Delete(id);
            return Ok(new { success = true });
        }

        [HttpPost("Test")]
        public async Task<IActionResult> Test([FromBody] PrevalueSource source, int pageId = 0)
        {
            if (source == null) return BadRequest("Source is required.");
            var provider = _registry.Get(source.Type);
            if (provider == null) return BadRequest($"Provider '{source.Type}' is not registered.");

            var validation = await provider.ValidateAsync(source);
            if (!string.IsNullOrWhiteSpace(validation))
                return BadRequest(validation);

            // [DynamicRoot 2026-08-18] A relative root only has an answer for a given page, so the
            // editor previews against one — the same way Umbraco Forms warns that its own
            // "use current page" toggle does not work in preview mode. Without a page the source
            // returns nothing, and the editor says so rather than pretending it is broken.
            var context = pageId > 0
                ? new PrevalueProviderContext { CurrentPageId = pageId }
                : PrevalueProviderContext.Empty;
            var options = await provider.GetOptionsAsync(source, context);
            return Ok(new { options = options.Take(50).ToList(), total = options.Count, pageId });
        }

        [HttpGet("Options/{id}")]
        public async Task<IActionResult> Options(int id, int pageId = 0)
        {
            var context = pageId > 0
                ? new PrevalueProviderContext { CurrentPageId = pageId }
                : PrevalueProviderContext.Empty;
            var options = await _resolver.GetOptionsAsync(id, context);
            return Ok(options.Take(500).ToList());
        }

        private static PrevalueSource MaskSecrets(PrevalueSource source)
        {
            if (source == null) return null;
            var masked = new PrevalueSource
            {
                Id = source.Id,
                Name = source.Name,
                Type = source.Type,
                CacheMinutes = source.CacheMinutes,
                Culture = source.Culture,
                CreatedOnUtc = source.CreatedOnUtc,
                UpdatedOnUtc = source.UpdatedOnUtc
            };

            try
            {
                var jobj = JObject.Parse(source.SettingsJson ?? "{}") ?? new JObject();
                MaskProperty(jobj, "connectionString");
                MaskProperty(jobj, "relativePath");
                masked.SettingsJson = jobj.ToString(Formatting.None);
            }
            catch
            {
                masked.SettingsJson = source.SettingsJson;
            }

            return masked;
        }

        private static void MaskProperty(JObject jobj, string key)
        {
            var token = jobj[key];
            if (token?.Type == JTokenType.String && !string.IsNullOrWhiteSpace((string)token))
            {
                jobj[key] = "***";
            }
        }

        private static string RestoreMaskedSecrets(string submitted, string stored)
        {
            if (string.IsNullOrWhiteSpace(submitted) || string.IsNullOrWhiteSpace(stored))
                return submitted;

            try
            {
                var subObj = JObject.Parse(submitted);
                var storedObj = JObject.Parse(stored);
                foreach (var prop in new[] { "connectionString", "relativePath" })
                {
                    var subVal = subObj[prop]?.Value<string>();
                    var storedVal = storedObj[prop]?.Value<string>();
                    if (subVal == "***" && !string.IsNullOrWhiteSpace(storedVal))
                        subObj[prop] = storedVal;
                }
                return subObj.ToString(Formatting.None);
            }
            catch
            {
                return submitted;
            }
        }
    }
}
