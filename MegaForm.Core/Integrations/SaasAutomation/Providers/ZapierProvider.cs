using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Integrations.SaasAutomation.Providers
{
    public class ZapierProvider : HttpSaasAutomationProviderBase
    {
        public ZapierProvider(HttpClient httpClient) : base(httpClient) { }

        public override string ProviderName => "Zapier";

        protected override string GetDefaultBaseUrl(SaasConnectionSettings settings)
        {
            return settings.WebhookUrl ?? "https://hooks.zapier.com";
        }

        public override async Task<SaasHealthResult> HealthCheckAsync(SaasConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(settings.WebhookUrl))
                return SaasHealthResult.Fail("Zapier requires a WebhookUrl.");

            try
            {
                var request = new HttpRequestMessage(HttpMethod.Post, settings.WebhookUrl)
                {
                    Content = new StringContent(JsonConvert.SerializeObject(new { ping = true }), Encoding.UTF8, "application/json")
                };

                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                    return SaasHealthResult.Ok("Zapier webhook responded.");

                return SaasHealthResult.Fail($"Zapier webhook health check failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return SaasHealthResult.Fail("Zapier health check error.", ex);
            }
        }

        public override async Task<SaasResult> SendAsync(SaasConnectionSettings settings, SaasAutomationPayload payload, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(settings.WebhookUrl))
                return SaasResult.Fail("Zapier requires a WebhookUrl.");

            try
            {
                var data = new Dictionary<string, object>(payload.Metadata, StringComparer.OrdinalIgnoreCase)
                {
                    ["subject"] = payload.Subject,
                    ["body"] = payload.Body,
                    ["channel"] = payload.Channel,
                    ["to"] = payload.To,
                    ["from"] = payload.From,
                    ["action"] = payload.Action,
                    ["timestamp"] = DateTime.UtcNow
                };

                var request = new HttpRequestMessage(HttpMethod.Post, settings.WebhookUrl)
                {
                    Content = new StringContent(JsonConvert.SerializeObject(data), Encoding.UTF8, "application/json")
                };

                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                    return SaasResult.Ok(null, "Payload sent to Zapier webhook.");

                return SaasResult.Fail($"Zapier webhook failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return SaasResult.Fail("Zapier send error.", ex);
            }
        }

        public override Task<IReadOnlyList<SaasAutomationTemplate>> GetTemplatesAsync(SaasConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<SaasAutomationTemplate>>(new List<SaasAutomationTemplate>
            {
                new SaasAutomationTemplate { Id = "zapier-form-submit", Name = "Form Submit Trigger", ProviderName = ProviderName, Description = "Trigger a Zap when a form is submitted." }
            });
        }
    }
}
