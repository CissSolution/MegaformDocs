using System;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Integrations.Marketing
{
    /// <summary>
    /// Base class for HTTP-based marketing providers.
    /// Hosts supply a named/typed HttpClient through the constructor.
    /// </summary>
    public abstract class HttpMarketingProviderBase : IMarketingProvider
    {
        protected HttpClient HttpClient { get; }

        protected HttpMarketingProviderBase(HttpClient httpClient)
        {
            HttpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        }

        public abstract string ProviderName { get; }

        public abstract Task<MarketingHealthResult> HealthCheckAsync(MarketingConnectionSettings settings, CancellationToken cancellationToken = default);
        public abstract Task<MarketingResult> UpsertContactAsync(MarketingConnectionSettings settings, MarketingContact contact, CancellationToken cancellationToken = default);
        public abstract Task<MarketingResult> AddToListAsync(MarketingConnectionSettings settings, string listId, MarketingContact contact, CancellationToken cancellationToken = default);
        public abstract Task<MarketingResult> RemoveFromListAsync(MarketingConnectionSettings settings, string listId, string email, CancellationToken cancellationToken = default);
        public abstract Task<MarketingResult> SendTransactionalAsync(MarketingConnectionSettings settings, MarketingMessage message, CancellationToken cancellationToken = default);
        public abstract Task<System.Collections.Generic.IReadOnlyList<MarketingList>> GetListsAsync(MarketingConnectionSettings settings, CancellationToken cancellationToken = default);

        protected virtual string ResolveBaseUrl(MarketingConnectionSettings settings)
        {
            if (!string.IsNullOrWhiteSpace(settings.BaseUrl))
                return settings.BaseUrl.TrimEnd('/');
            return GetDefaultBaseUrl(settings);
        }

        protected abstract string GetDefaultBaseUrl(MarketingConnectionSettings settings);

        protected static string SafeToString(object value)
        {
            return value?.ToString();
        }
    }
}
