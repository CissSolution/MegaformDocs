using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Integrations.SaasAutomation.Providers
{
    public class TwilioProvider : HttpSaasAutomationProviderBase
    {
        public TwilioProvider(HttpClient httpClient) : base(httpClient) { }

        public override string ProviderName => "Twilio";

        protected override string GetDefaultBaseUrl(SaasConnectionSettings settings)
        {
            return "https://api.twilio.com/2010-04-01";
        }

        public override async Task<SaasHealthResult> HealthCheckAsync(SaasConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var request = CreateRequest(settings, HttpMethod.Get, $"/Accounts/{settings.ApiKey}.json");
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                if (response.IsSuccessStatusCode)
                    return SaasHealthResult.Ok("Connected to Twilio.");

                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return SaasHealthResult.Fail($"Twilio health check failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return SaasHealthResult.Fail("Twilio health check error.", ex);
            }
        }

        public override async Task<SaasResult> SendAsync(SaasConnectionSettings settings, SaasAutomationPayload payload, CancellationToken cancellationToken = default)
        {
            try
            {
                var to = payload.To ?? settings.DefaultChannelOrTo;
                var from = payload.From ?? (settings.Extra.ContainsKey("FromPhone") ? settings.Extra["FromPhone"] : null);

                if (string.IsNullOrWhiteSpace(to))
                    return SaasResult.Fail("Twilio requires a 'To' phone number.");
                if (string.IsNullOrWhiteSpace(from))
                    return SaasResult.Fail("Twilio requires a 'From' phone number in Extra['FromPhone'] or payload.From.");

                var body = payload.Body ?? payload.Subject ?? "Notification from MegaForm";
                var content = new FormUrlEncodedContent(new[]
                {
                    new KeyValuePair<string, string>("To", to),
                    new KeyValuePair<string, string>("From", from),
                    new KeyValuePair<string, string>("Body", body)
                });

                var request = new HttpRequestMessage(HttpMethod.Post, $"https://api.twilio.com/2010-04-01/Accounts/{settings.ApiKey}/Messages.json")
                {
                    Content = content
                };

                var credentials = Convert.ToBase64String(Encoding.ASCII.GetBytes($"{settings.ApiKey}:{settings.ApiSecret}"));
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", credentials);

                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var responseBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                {
                    var json = JObject.Parse(responseBody);
                    return SaasResult.Ok(json["sid"]?.ToString(), "SMS sent via Twilio.");
                }

                return SaasResult.Fail($"Twilio send failed: {(int)response.StatusCode} {responseBody}");
            }
            catch (Exception ex)
            {
                return SaasResult.Fail("Twilio send error.", ex);
            }
        }

        public override Task<IReadOnlyList<SaasAutomationTemplate>> GetTemplatesAsync(SaasConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<SaasAutomationTemplate>>(new List<SaasAutomationTemplate>
            {
                new SaasAutomationTemplate { Id = "twilio-sms-notification", Name = "SMS Notification", ProviderName = ProviderName, Description = "Send an SMS when a form is submitted." }
            });
        }

        private HttpRequestMessage CreateRequest(SaasConnectionSettings settings, HttpMethod method, string relativeUrl)
        {
            var baseUrl = ResolveBaseUrl(settings);
            var request = new HttpRequestMessage(method, baseUrl + relativeUrl);
            var credentials = Convert.ToBase64String(Encoding.ASCII.GetBytes($"{settings.ApiKey}:{settings.ApiSecret}"));
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", credentials);
            return request;
        }
    }
}
