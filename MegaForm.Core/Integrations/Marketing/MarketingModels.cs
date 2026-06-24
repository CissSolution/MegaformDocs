using System;
using System.Collections.Generic;

namespace MegaForm.Core.Integrations.Marketing
{
    /// <summary>
    /// Connection settings for a marketing provider instance.
    /// Provider implementations read the fields they understand.
    /// </summary>
    public class MarketingConnectionSettings
    {
        public string ProviderName { get; set; }
        public string ApiKey { get; set; }
        public string ApiSecret { get; set; }
        public string ServerPrefix { get; set; }
        public string BaseUrl { get; set; }
        public string DefaultListId { get; set; }
        public Dictionary<string, string> Extra { get; set; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    }

    public class MarketingContact
    {
        public string Email { get; set; }
        public string FirstName { get; set; }
        public string LastName { get; set; }
        public string Phone { get; set; }
        public Dictionary<string, object> CustomFields { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public MarketingSubscriptionStatus Status { get; set; } = MarketingSubscriptionStatus.Subscribed;
    }

    public enum MarketingSubscriptionStatus
    {
        Subscribed,
        Unsubscribed,
        Pending,
        Cleaned,
        Transactional
    }

    public class MarketingList
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Type { get; set; } // audience, list, tag, segment
        public int? MemberCount { get; set; }
    }

    public class MarketingMessage
    {
        public string Subject { get; set; }
        public string HtmlBody { get; set; }
        public string TextBody { get; set; }
        public string FromEmail { get; set; }
        public string FromName { get; set; }
        public string ReplyTo { get; set; }
        public List<string> ToEmails { get; set; } = new List<string>();
    }

    public class MarketingResult
    {
        public bool Success { get; set; }
        public string ProviderContactId { get; set; }
        public string Message { get; set; }
        public Dictionary<string, object> ResponseData { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public Exception Error { get; set; }

        public static MarketingResult Ok(string providerContactId = null, string message = null)
        {
            return new MarketingResult { Success = true, ProviderContactId = providerContactId, Message = message };
        }

        public static MarketingResult Fail(string message, Exception error = null)
        {
            return new MarketingResult { Success = false, Message = message, Error = error };
        }
    }

    public class MarketingHealthResult
    {
        public bool Healthy { get; set; }
        public string Message { get; set; }
        public Exception Error { get; set; }

        public static MarketingHealthResult Ok(string message = null)
        {
            return new MarketingHealthResult { Healthy = true, Message = message };
        }

        public static MarketingHealthResult Fail(string message, Exception error = null)
        {
            return new MarketingHealthResult { Healthy = false, Message = message, Error = error };
        }
    }

    /// <summary>
    /// Maps a form submission to a marketing provider action.
    /// Stored in form schema / workflow config; platform agnostic.
    /// </summary>
    public class MarketingIntegrationMapping
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string ProviderName { get; set; }
        public string ConnectionSettingsId { get; set; }
        public string TargetListId { get; set; }
        public string EmailFieldKey { get; set; }
        public string FirstNameFieldKey { get; set; }
        public string LastNameFieldKey { get; set; }
        public string PhoneFieldKey { get; set; }
        public Dictionary<string, string> CustomFieldMap { get; set; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        public bool DoubleOptIn { get; set; }
        public bool SendWelcomeEmail { get; set; }
    }
}
