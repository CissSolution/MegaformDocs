using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Integrations.Marketing
{
    /// <summary>
    /// High-level entry point for marketing integrations.
    /// </summary>
    public interface IMarketingIntegrationService
    {
        Task<IReadOnlyList<string>> GetRegisteredProviderNamesAsync(CancellationToken cancellationToken = default);

        Task<MarketingResult> ExecuteMappingAsync(
            MarketingIntegrationMapping mapping,
            MarketingConnectionSettings settings,
            IReadOnlyDictionary<string, object> submissionValues,
            CancellationToken cancellationToken = default);

        Task<MarketingHealthResult> TestConnectionAsync(
            string providerName,
            MarketingConnectionSettings settings,
            CancellationToken cancellationToken = default);
    }
}
