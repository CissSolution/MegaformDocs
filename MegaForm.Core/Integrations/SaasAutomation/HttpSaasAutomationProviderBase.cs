using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Integrations.SaasAutomation
{
    /// <summary>
    /// Base class for HTTP-based SaaS automation providers.
    /// </summary>
    public abstract class HttpSaasAutomationProviderBase : ISaasAutomationProvider
    {
        protected HttpClient HttpClient { get; }

        protected HttpSaasAutomationProviderBase(HttpClient httpClient)
        {
            HttpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        }

        public abstract string ProviderName { get; }

        public abstract Task<SaasHealthResult> HealthCheckAsync(SaasConnectionSettings settings, CancellationToken cancellationToken = default);
        public abstract Task<SaasResult> SendAsync(SaasConnectionSettings settings, SaasAutomationPayload payload, CancellationToken cancellationToken = default);
        public abstract Task<IReadOnlyList<SaasAutomationTemplate>> GetTemplatesAsync(SaasConnectionSettings settings, CancellationToken cancellationToken = default);

        protected virtual string ResolveBaseUrl(SaasConnectionSettings settings)
        {
            if (!string.IsNullOrWhiteSpace(settings.BaseUrl))
                return settings.BaseUrl.TrimEnd('/');
            return GetDefaultBaseUrl(settings);
        }

        protected abstract string GetDefaultBaseUrl(SaasConnectionSettings settings);
    }
}
