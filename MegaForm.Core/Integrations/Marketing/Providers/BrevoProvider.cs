using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Integrations.Marketing.Providers
{
    public class BrevoProvider : HttpMarketingProviderBase
    {
        public BrevoProvider(HttpClient httpClient) : base(httpClient) { }

        public override string ProviderName => "Brevo";

        protected override string GetDefaultBaseUrl(MarketingConnectionSettings settings)
        {
            return "https://api.brevo.com/v3";
        }

        public override async Task<MarketingHealthResult> HealthCheckAsync(MarketingConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var request = CreateRequest(settings, HttpMethod.Get, "/account");
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                if (response.IsSuccessStatusCode)
                    return MarketingHealthResult.Ok("Connected to Brevo.");

                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return MarketingHealthResult.Fail($"Brevo health check failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return MarketingHealthResult.Fail("Brevo health check error.", ex);
            }
        }

        public override async Task<MarketingResult> UpsertContactAsync(MarketingConnectionSettings settings, MarketingContact contact, CancellationToken cancellationToken = default)
        {
            try
            {
                var attributes = new Dictionary<string, object>();
                if (!string.IsNullOrWhiteSpace(contact.FirstName))
                    attributes["FIRSTNAME"] = contact.FirstName;
                if (!string.IsNullOrWhiteSpace(contact.LastName))
                    attributes["LASTNAME"] = contact.LastName;
                if (!string.IsNullOrWhiteSpace(contact.Phone))
                    attributes["SMS"] = contact.Phone;

                foreach (var kvp in contact.CustomFields)
                    attributes[kvp.Key] = kvp.Value;

                var payload = new
                {
                    email = contact.Email,
                    attributes,
                    emailBlacklisted = contact.Status == MarketingSubscriptionStatus.Unsubscribed,
                    smsBlacklisted = contact.Status == MarketingSubscriptionStatus.Unsubscribed,
                    updateEnabled = true
                };

                var request = CreateRequest(settings, HttpMethod.Post, "/contacts", payload);
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode || (int)response.StatusCode == 204)
                    return MarketingResult.Ok(null, "Contact upserted to Brevo.");

                return MarketingResult.Fail($"Brevo upsert failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return MarketingResult.Fail("Brevo upsert error.", ex);
            }
        }

        public override async Task<MarketingResult> AddToListAsync(MarketingConnectionSettings settings, string listId, MarketingContact contact, CancellationToken cancellationToken = default)
        {
            try
            {
                var payload = new
                {
                    emails = new[] { contact.Email }
                };

                var request = CreateRequest(settings, HttpMethod.Post, $"/contacts/lists/{listId}/contacts/add", payload);
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                    return MarketingResult.Ok(null, "Contact added to Brevo list.");

                return MarketingResult.Fail($"Brevo add to list failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return MarketingResult.Fail("Brevo add to list error.", ex);
            }
        }

        public override async Task<MarketingResult> RemoveFromListAsync(MarketingConnectionSettings settings, string listId, string email, CancellationToken cancellationToken = default)
        {
            try
            {
                var payload = new
                {
                    emails = new[] { email }
                };

                var request = CreateRequest(settings, HttpMethod.Post, $"/contacts/lists/{listId}/contacts/remove", payload);
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                    return MarketingResult.Ok(null, "Contact removed from Brevo list.");

                return MarketingResult.Fail($"Brevo remove from list failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return MarketingResult.Fail("Brevo remove from list error.", ex);
            }
        }

        public override async Task<MarketingResult> SendTransactionalAsync(MarketingConnectionSettings settings, MarketingMessage message, CancellationToken cancellationToken = default)
        {
            try
            {
                var payload = new
                {
                    sender = new { email = message.FromEmail, name = message.FromName },
                    to = message.ToEmails.Select(e => new { email = e }).ToList(),
                    subject = message.Subject,
                    htmlContent = message.HtmlBody,
                    textContent = message.TextBody,
                    replyTo = string.IsNullOrWhiteSpace(message.ReplyTo) ? null : new { email = message.ReplyTo }
                };

                var request = CreateRequest(settings, HttpMethod.Post, "/smtp/email", payload);
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                {
                    var json = JObject.Parse(body);
                    return MarketingResult.Ok(json["messageId"]?.ToString(), "Transactional email sent via Brevo.");
                }

                return MarketingResult.Fail($"Brevo send failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return MarketingResult.Fail("Brevo send error.", ex);
            }
        }

        public override async Task<IReadOnlyList<MarketingList>> GetListsAsync(MarketingConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var request = CreateRequest(settings, HttpMethod.Get, "/contacts/lists?limit=1000");
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                    return new List<MarketingList>();

                var json = JObject.Parse(body);
                var lists = new List<MarketingList>();
                foreach (var item in json["lists"] ?? new JArray())
                {
                    lists.Add(new MarketingList
                    {
                        Id = item["id"]?.ToString(),
                        Name = item["name"]?.ToString(),
                        Type = "list"
                    });
                }
                return lists;
            }
            catch
            {
                return new List<MarketingList>();
            }
        }

        private HttpRequestMessage CreateRequest(MarketingConnectionSettings settings, HttpMethod method, string relativeUrl, object payload = null)
        {
            var baseUrl = ResolveBaseUrl(settings);
            var request = new HttpRequestMessage(method, baseUrl + relativeUrl);
            request.Headers.Add("api-key", settings.ApiKey);

            if (payload != null)
            {
                request.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            }

            return request;
        }
    }
}
