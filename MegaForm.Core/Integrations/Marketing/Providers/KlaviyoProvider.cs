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
    public class KlaviyoProvider : HttpMarketingProviderBase
    {
        public KlaviyoProvider(HttpClient httpClient) : base(httpClient) { }

        public override string ProviderName => "Klaviyo";

        protected override string GetDefaultBaseUrl(MarketingConnectionSettings settings)
        {
            return "https://a.klaviyo.com/api";
        }

        public override async Task<MarketingHealthResult> HealthCheckAsync(MarketingConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                // Klaviyo v2 lists endpoint as a lightweight probe.
                var request = CreateRequest(settings, HttpMethod.Get, "/v2/lists?api_key=" + settings.ApiKey);
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                if (response.IsSuccessStatusCode)
                    return MarketingHealthResult.Ok("Connected to Klaviyo.");

                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return MarketingHealthResult.Fail($"Klaviyo health check failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return MarketingHealthResult.Fail("Klaviyo health check error.", ex);
            }
        }

        public override async Task<MarketingResult> UpsertContactAsync(MarketingConnectionSettings settings, MarketingContact contact, CancellationToken cancellationToken = default)
        {
            try
            {
                var attributes = new Dictionary<string, object>
                {
                    ["email"] = contact.Email
                };

                if (!string.IsNullOrWhiteSpace(contact.FirstName))
                    attributes["first_name"] = contact.FirstName;
                if (!string.IsNullOrWhiteSpace(contact.LastName))
                    attributes["last_name"] = contact.LastName;
                if (!string.IsNullOrWhiteSpace(contact.Phone))
                    attributes["phone_number"] = contact.Phone;

                foreach (var kvp in contact.CustomFields)
                    attributes[kvp.Key] = kvp.Value;

                var payload = new
                {
                    data = new
                    {
                        type = "profile",
                        attributes
                    }
                };

                var request = CreateRequest(settings, HttpMethod.Post, "/profile-import/", payload);
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                {
                    var json = JObject.Parse(body);
                    var data = json["data"];
                    var profileId = data != null ? data["id"]?.ToString() : null;
                    return MarketingResult.Ok(profileId, "Profile upserted to Klaviyo.");
                }

                return MarketingResult.Fail($"Klaviyo upsert failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return MarketingResult.Fail("Klaviyo upsert error.", ex);
            }
        }

        public override async Task<MarketingResult> AddToListAsync(MarketingConnectionSettings settings, string listId, MarketingContact contact, CancellationToken cancellationToken = default)
        {
            try
            {
                var payload = new
                {
                    profiles = new[]
                    {
                        new { email = contact.Email }
                    }
                };

                var request = CreateRequest(settings, HttpMethod.Post, $"/v2/list/{listId}/members?api_key={settings.ApiKey}", payload);
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                    return MarketingResult.Ok(null, "Contact added to Klaviyo list.");

                return MarketingResult.Fail($"Klaviyo add to list failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return MarketingResult.Fail("Klaviyo add to list error.", ex);
            }
        }

        public override Task<MarketingResult> RemoveFromListAsync(MarketingConnectionSettings settings, string listId, string email, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(MarketingResult.Fail("Klaviyo remove from list is not implemented in this version."));
        }

        public override Task<MarketingResult> SendTransactionalAsync(MarketingConnectionSettings settings, MarketingMessage message, CancellationToken cancellationToken = default)
        {
            // Klaviyo transactional email requires a separate template-based flow setup.
            return Task.FromResult(MarketingResult.Fail("Klaviyo transactional email requires template setup via flows."));
        }

        public override async Task<IReadOnlyList<MarketingList>> GetListsAsync(MarketingConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var request = CreateRequest(settings, HttpMethod.Get, "/v2/lists?api_key=" + settings.ApiKey);
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                    return new List<MarketingList>();

                var json = JArray.Parse(body);
                var lists = new List<MarketingList>();
                foreach (var item in json)
                {
                    lists.Add(new MarketingList
                    {
                        Id = item["list_id"]?.ToString(),
                        Name = item["list_name"]?.ToString(),
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
            request.Headers.Add("Authorization", "Klaviyo-API-Key " + settings.ApiKey);
            request.Headers.Add("revision", "2023-10-15");

            if (payload != null)
            {
                request.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            }

            return request;
        }
    }
}
