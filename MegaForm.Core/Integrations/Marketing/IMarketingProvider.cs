using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Integrations.Marketing
{
    /// <summary>
    /// Platform-agnostic contract for a marketing-automation provider
    /// (Mailchimp, ConvertKit, Klaviyo, Brevo, MailerLite, ...).
    /// Implementations are host-specific and registered in DI.
    /// </summary>
    public interface IMarketingProvider
    {
        string ProviderName { get; }

        /// <summary>
        /// Validate that the stored credentials/API key can connect.
        /// </summary>
        Task<MarketingHealthResult> HealthCheckAsync(MarketingConnectionSettings settings, CancellationToken cancellationToken = default);

        /// <summary>
        /// Subscribe or update a contact on the provider.
        /// </summary>
        Task<MarketingResult> UpsertContactAsync(MarketingConnectionSettings settings, MarketingContact contact, CancellationToken cancellationToken = default);

        /// <summary>
        /// Add a contact to a list/audience/segment/tag.
        /// </summary>
        Task<MarketingResult> AddToListAsync(MarketingConnectionSettings settings, string listId, MarketingContact contact, CancellationToken cancellationToken = default);

        /// <summary>
        /// Remove a contact from a list/audience/segment/tag.
        /// </summary>
        Task<MarketingResult> RemoveFromListAsync(MarketingConnectionSettings settings, string listId, string email, CancellationToken cancellationToken = default);

        /// <summary>
        /// Send a single triggered email / newsletter form submission.
        /// </summary>
        Task<MarketingResult> SendTransactionalAsync(MarketingConnectionSettings settings, MarketingMessage message, CancellationToken cancellationToken = default);

        /// <summary>
        /// Return available lists/audiences/tags for mapping in the form builder.
        /// </summary>
        Task<IReadOnlyList<MarketingList>> GetListsAsync(MarketingConnectionSettings settings, CancellationToken cancellationToken = default);
    }
}
