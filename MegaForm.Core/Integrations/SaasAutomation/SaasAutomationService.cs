using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Integrations.SaasAutomation
{
    /// <summary>
    /// Platform-agnostic orchestrator for SaaS automation providers.
    /// </summary>
    public class SaasAutomationService : ISaasAutomationService
    {
        private readonly IReadOnlyDictionary<string, ISaasAutomationProvider> _providers;

        public SaasAutomationService(IEnumerable<ISaasAutomationProvider> providers)
        {
            if (providers == null)
                throw new ArgumentNullException(nameof(providers));

            _providers = providers.ToDictionary(p => p.ProviderName, p => p, StringComparer.OrdinalIgnoreCase);
        }

        public Task<IReadOnlyList<string>> GetRegisteredProviderNamesAsync(CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<string>>(_providers.Keys.ToList());
        }

        public async Task<SaasResult> ExecuteMappingAsync(
            SaasAutomationMapping mapping,
            SaasConnectionSettings settings,
            IReadOnlyDictionary<string, object> submissionValues,
            CancellationToken cancellationToken = default)
        {
            if (mapping == null)
                return SaasResult.Fail("Mapping is null.");
            if (settings == null)
                return SaasResult.Fail("Connection settings are null.");
            if (submissionValues == null)
                return SaasResult.Fail("Submission values are null.");

            if (!_providers.TryGetValue(mapping.ProviderName, out var provider))
                return SaasResult.Fail($"Provider '{mapping.ProviderName}' is not registered.");

            var payload = new SaasAutomationPayload
            {
                Action = mapping.Action,
                Channel = GetValueAsString(submissionValues, mapping.ChannelOrToFieldKey) ?? settings.DefaultChannelOrTo,
                Subject = GetValueAsString(submissionValues, mapping.SubjectFieldKey),
                Body = GetValueAsString(submissionValues, mapping.BodyFieldKey)
            };

            if (mapping.MetadataMap != null)
            {
                foreach (var kvp in mapping.MetadataMap)
                {
                    if (submissionValues.TryGetValue(kvp.Key, out var value))
                        payload.Metadata[kvp.Value] = value;
                }
            }

            return await provider.SendAsync(settings, payload, cancellationToken).ConfigureAwait(false);
        }

        public async Task<SaasHealthResult> TestConnectionAsync(
            string providerName,
            SaasConnectionSettings settings,
            CancellationToken cancellationToken = default)
        {
            if (!_providers.TryGetValue(providerName, out var provider))
                return SaasHealthResult.Fail($"Provider '{providerName}' is not registered.");

            return await provider.HealthCheckAsync(settings, cancellationToken).ConfigureAwait(false);
        }

        private static string GetValueAsString(IReadOnlyDictionary<string, object> values, string key)
        {
            if (string.IsNullOrWhiteSpace(key))
                return null;
            if (!values.TryGetValue(key, out var value) || value == null)
                return null;
            return value.ToString();
        }
    }
}
