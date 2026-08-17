using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using MegaForm.Core.Models.Prevalues;

namespace MegaForm.Core.Services.Prevalues
{
    /// <summary>
    /// Resolves options from a registered PrevalueSource catalog entry.
    /// Wraps the provider registry with a small caching layer.
    /// </summary>
    public sealed class PrevalueOptionsResolver
    {
        private readonly IPrevalueSourceStore _store;
        private readonly PrevalueProviderRegistry _registry;

        public PrevalueOptionsResolver(IPrevalueSourceStore store, PrevalueProviderRegistry registry)
        {
            _store = store;
            _registry = registry;
        }

        public async Task<List<PrevalueOption>> GetOptionsAsync(int sourceId, PrevalueProviderContext context)
        {
            var source = _store.Get(sourceId);
            if (source == null) return new List<PrevalueOption>();
            return await _registry.GetOptionsAsync(source, context ?? PrevalueProviderContext.Empty);
        }

        public async Task<List<PrevalueOption>> GetOptionsAsync(string sourceName, PrevalueProviderContext context)
        {
            var source = _store.GetByName(sourceName);
            if (source == null) return new List<PrevalueOption>();
            return await _registry.GetOptionsAsync(source, context ?? PrevalueProviderContext.Empty);
        }

        public async Task<string> ValidateAsync(PrevalueSource source)
        {
            if (source == null) return "Source is required.";
            var provider = _registry.Get(source.Type);
            if (provider == null) return $"Provider '{source.Type}' is not registered.";
            return await provider.ValidateAsync(source);
        }
    }
}
