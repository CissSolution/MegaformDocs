using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Core.Models.Prevalues;

namespace MegaForm.Core.Services.Prevalues
{
    /// <summary>
    /// Dispatches PrevalueSource resolution to the correct IPrevalueProvider implementation.
    /// </summary>
    public sealed class PrevalueProviderRegistry
    {
        private readonly Dictionary<string, IPrevalueProvider> _providers;

        public PrevalueProviderRegistry(IEnumerable<IPrevalueProvider> providers)
        {
            _providers = providers?.ToDictionary(
                p => p.Type?.ToLowerInvariant() ?? string.Empty,
                p => p,
                StringComparer.OrdinalIgnoreCase)
                ?? new Dictionary<string, IPrevalueProvider>(StringComparer.OrdinalIgnoreCase);
        }

        public IPrevalueProvider Get(string type)
        {
            if (string.IsNullOrWhiteSpace(type)) return null;
            _providers.TryGetValue(type, out var provider);
            return provider;
        }

        public IReadOnlyCollection<string> SupportedTypes => _providers.Keys;

        public async Task<List<PrevalueOption>> GetOptionsAsync(PrevalueSource source, PrevalueProviderContext context)
        {
            if (source == null) return new List<PrevalueOption>();
            var provider = Get(source.Type);
            if (provider == null) return new List<PrevalueOption>();
            return await provider.GetOptionsAsync(source, context ?? PrevalueProviderContext.Empty);
        }
    }
}
