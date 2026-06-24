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
    public class SlackProvider : HttpSaasAutomationProviderBase
    {
        public SlackProvider(HttpClient httpClient) : base(httpClient) { }

        public override string ProviderName => "Slack";

        protected override string GetDefaultBaseUrl(SaasConnectionSettings settings)
        {
            return "https://slack.com/api";
        }

        public override async Task<SaasHealthResult> HealthCheckAsync(SaasConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var request = CreateRequest(settings, HttpMethod.Get, "/auth.test");
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                var json = JObject.Parse(body);
                if (json["ok"]?.Value<bool>() == true)
                    return SaasHealthResult.Ok("Connected to Slack workspace.");

                return SaasHealthResult.Fail($"Slack health check failed: {body}");
            }
            catch (Exception ex)
            {
                return SaasHealthResult.Fail("Slack health check error.", ex);
            }
        }

        public override async Task<SaasResult> SendAsync(SaasConnectionSettings settings, SaasAutomationPayload payload, CancellationToken cancellationToken = default)
        {
            try
            {
                // If a webhook URL is provided, use incoming webhook. Otherwise use chat.postMessage.
                if (!string.IsNullOrWhiteSpace(settings.WebhookUrl))
                {
                    var webhookPayload = new
                    {
                        text = payload.Body,
                        channel = payload.Channel
                    };

                    var request = new HttpRequestMessage(HttpMethod.Post, settings.WebhookUrl)
                    {
                        Content = new StringContent(JsonConvert.SerializeObject(webhookPayload), Encoding.UTF8, "application/json")
                    };

                    var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                    var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                    if (response.IsSuccessStatusCode)
                        return SaasResult.Ok(null, "Message posted to Slack via webhook.");

                    return SaasResult.Fail($"Slack webhook failed: {(int)response.StatusCode} {body}");
                }

                var apiPayload = new
                {
                    channel = payload.Channel ?? settings.DefaultChannelOrTo,
                    text = payload.Body,
                    username = payload.From
                };

                var apiRequest = CreateRequest(settings, HttpMethod.Post, "/chat.postMessage", apiPayload);
                var apiResponse = await HttpClient.SendAsync(apiRequest, cancellationToken).ConfigureAwait(false);
                var apiBody = await apiResponse.Content.ReadAsStringAsync().ConfigureAwait(false);

                var json = JObject.Parse(apiBody);
                if (apiResponse.IsSuccessStatusCode && json["ok"]?.Value<bool>() == true)
                    return SaasResult.Ok(json["ts"]?.ToString(), "Message posted to Slack.");

                return SaasResult.Fail($"Slack API failed: {apiBody}");
            }
            catch (Exception ex)
            {
                return SaasResult.Fail("Slack send error.", ex);
            }
        }

        public override Task<IReadOnlyList<SaasAutomationTemplate>> GetTemplatesAsync(SaasConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<SaasAutomationTemplate>>(new List<SaasAutomationTemplate>
            {
                new SaasAutomationTemplate { Id = "slack-form-submit", Name = "Form Submit Notification", ProviderName = ProviderName, Description = "Post a message to a channel when a form is submitted." }
            });
        }

        private HttpRequestMessage CreateRequest(SaasConnectionSettings settings, HttpMethod method, string relativeUrl, object payload = null)
        {
            var baseUrl = ResolveBaseUrl(settings);
            var request = new HttpRequestMessage(method, baseUrl + relativeUrl);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", settings.ApiKey);

            if (payload != null)
            {
                request.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            }

            return request;
        }
    }
}
