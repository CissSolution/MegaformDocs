using System;
using System.Collections.Generic;

namespace MegaForm.Core.Integrations.SaasAutomation
{
    public class SaasConnectionSettings
    {
        public string ProviderName { get; set; }
        public string ApiKey { get; set; }
        public string ApiSecret { get; set; }
        public string WebhookUrl { get; set; }
        public string BaseUrl { get; set; }
        public string DefaultChannelOrTo { get; set; }
        public Dictionary<string, string> Extra { get; set; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    }

    public class SaasAutomationPayload
    {
        public string Action { get; set; } = "send";
        public string Subject { get; set; }
        public string Body { get; set; }
        public string BodyHtml { get; set; }
        public string To { get; set; }
        public string From { get; set; }
        public string Channel { get; set; }
        public List<string> Attachments { get; set; } = new List<string>();
        public Dictionary<string, object> Metadata { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
    }

    public class SaasAutomationTemplate
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string ProviderName { get; set; }
        public string Description { get; set; }
        public Dictionary<string, string> DefaultFields { get; set; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    }

    public class SaasResult
    {
        public bool Success { get; set; }
        public string ProviderMessageId { get; set; }
        public string Message { get; set; }
        public Dictionary<string, object> ResponseData { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public Exception Error { get; set; }

        public static SaasResult Ok(string providerMessageId = null, string message = null)
        {
            return new SaasResult { Success = true, ProviderMessageId = providerMessageId, Message = message };
        }

        public static SaasResult Fail(string message, Exception error = null)
        {
            return new SaasResult { Success = false, Message = message, Error = error };
        }
    }

    public class SaasHealthResult
    {
        public bool Healthy { get; set; }
        public string Message { get; set; }
        public Exception Error { get; set; }

        public static SaasHealthResult Ok(string message = null)
        {
            return new SaasHealthResult { Healthy = true, Message = message };
        }

        public static SaasHealthResult Fail(string message, Exception error = null)
        {
            return new SaasHealthResult { Healthy = false, Message = message, Error = error };
        }
    }

    public class SaasAutomationMapping
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string ProviderName { get; set; }
        public string ConnectionSettingsId { get; set; }
        public string Action { get; set; } = "send";
        public string ChannelOrToFieldKey { get; set; }
        public string SubjectFieldKey { get; set; }
        public string BodyFieldKey { get; set; }
        public Dictionary<string, string> MetadataMap { get; set; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    }
}
