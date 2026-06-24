using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Integrations.Marketing
{
    /// <summary>
    /// Platform-agnostic orchestrator for marketing provider actions.
    /// Does not depend on UI or host-specific DI wiring.
    /// </summary>
    public class MarketingIntegrationService : IMarketingIntegrationService
    {
        private readonly IReadOnlyDictionary<string, IMarketingProvider> _providers;

        public MarketingIntegrationService(IEnumerable<IMarketingProvider> providers)
        {
            if (providers == null)
                throw new ArgumentNullException(nameof(providers));

            _providers = providers.ToDictionary(p => p.ProviderName, p => p, StringComparer.OrdinalIgnoreCase);
        }

        public Task<IReadOnlyList<string>> GetRegisteredProviderNamesAsync(CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<string>>(_providers.Keys.ToList());
        }

        public async Task<MarketingResult> ExecuteMappingAsync(
            MarketingIntegrationMapping mapping,
            MarketingConnectionSettings settings,
            IReadOnlyDictionary<string, object> submissionValues,
            CancellationToken cancellationToken = default)
        {
            if (mapping == null)
                return MarketingResult.Fail("Mapping is null.");
            if (settings == null)
                return MarketingResult.Fail("Connection settings are null.");
            if (submissionValues == null)
                return MarketingResult.Fail("Submission values are null.");

            if (!_providers.TryGetValue(mapping.ProviderName, out var provider))
                return MarketingResult.Fail($"Provider '{mapping.ProviderName}' is not registered.");

            var email = GetValueAsString(submissionValues, mapping.EmailFieldKey);
            if (string.IsNullOrWhiteSpace(email))
                return MarketingResult.Fail("Email field is required for marketing integration.");

            var contact = new MarketingContact
            {
                Email = email,
                FirstName = GetValueAsString(submissionValues, mapping.FirstNameFieldKey),
                LastName = GetValueAsString(submissionValues, mapping.LastNameFieldKey),
                Phone = GetValueAsString(submissionValues, mapping.PhoneFieldKey),
                Status = mapping.DoubleOptIn ? MarketingSubscriptionStatus.Pending : MarketingSubscriptionStatus.Subscribed
            };

            if (mapping.CustomFieldMap != null)
            {
                foreach (var kvp in mapping.CustomFieldMap)
                {
                    if (submissionValues.TryGetValue(kvp.Key, out var value))
                        contact.CustomFields[kvp.Value] = value;
                }
            }

            var result = await provider.UpsertContactAsync(settings, contact, cancellationToken).ConfigureAwait(false);
            if (!result.Success)
                return result;

            if (!string.IsNullOrWhiteSpace(mapping.TargetListId))
            {
                var listResult = await provider.AddToListAsync(settings, mapping.TargetListId, contact, cancellationToken).ConfigureAwait(false);
                if (!listResult.Success)
                    return listResult;
            }

            if (mapping.SendWelcomeEmail)
            {
                var message = new MarketingMessage
                {
                    ToEmails = new List<string> { contact.Email },
                    Subject = "Welcome",
                    TextBody = "Thank you for subscribing."
                };
                await provider.SendTransactionalAsync(settings, message, cancellationToken).ConfigureAwait(false);
            }

            return MarketingResult.Ok(result.ProviderContactId, "Mapping executed successfully.");
        }

        public async Task<MarketingHealthResult> TestConnectionAsync(
            string providerName,
            MarketingConnectionSettings settings,
            CancellationToken cancellationToken = default)
        {
            if (!_providers.TryGetValue(providerName, out var provider))
                return MarketingHealthResult.Fail($"Provider '{providerName}' is not registered.");

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
