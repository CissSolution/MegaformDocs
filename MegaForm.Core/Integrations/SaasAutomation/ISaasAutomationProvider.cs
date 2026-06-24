using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Integrations.SaasAutomation
{
    /// <summary>
    /// Platform-agnostic contract for SaaS automation providers
    /// (Slack, Twilio, Notion, Zapier, Make, n8n).
    /// </summary>
    public interface ISaasAutomationProvider
    {
        string ProviderName { get; }

        Task<SaasHealthResult> HealthCheckAsync(SaasConnectionSettings settings, CancellationToken cancellationToken = default);

        /// <summary>
        /// Send a generic automation payload. Semantics depend on the provider
        /// (Slack message, Twilio SMS, Notion page, Zapier webhook, ...).
        /// </summary>
        Task<SaasResult> SendAsync(SaasConnectionSettings settings, SaasAutomationPayload payload, CancellationToken cancellationToken = default);

        Task<IReadOnlyList<SaasAutomationTemplate>> GetTemplatesAsync(SaasConnectionSettings settings, CancellationToken cancellationToken = default);
    }
}
