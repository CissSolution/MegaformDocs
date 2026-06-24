using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Integrations.SaasAutomation
{
    public interface ISaasAutomationService
    {
        Task<IReadOnlyList<string>> GetRegisteredProviderNamesAsync(CancellationToken cancellationToken = default);

        Task<SaasResult> ExecuteMappingAsync(
            SaasAutomationMapping mapping,
            SaasConnectionSettings settings,
            IReadOnlyDictionary<string, object> submissionValues,
            CancellationToken cancellationToken = default);

        Task<SaasHealthResult> TestConnectionAsync(
            string providerName,
            SaasConnectionSettings settings,
            CancellationToken cancellationToken = default);
    }
}
