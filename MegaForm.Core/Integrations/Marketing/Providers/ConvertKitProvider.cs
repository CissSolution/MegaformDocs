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
    public class ConvertKitProvider : HttpMarketingProviderBase
    {
        public ConvertKitProvider(HttpClient httpClient) : base(httpClient) { }

        public override string ProviderName => "ConvertKit";

        protected override string GetDefaultBaseUrl(MarketingConnectionSettings settings)
        {
            return "https://api.convertkit.com/v3";
        }

        public override async Task<MarketingHealthResult> HealthCheckAsync(MarketingConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var request = CreateRequest(settings, HttpMethod.Get, "/account");
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                if (response.IsSuccessStatusCode)
                    return MarketingHealthResult.Ok("Connected to ConvertKit.");

                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return MarketingHealthResult.Fail($"ConvertKit health check failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return MarketingHealthResult.Fail("ConvertKit health check error.", ex);
            }
        }

        public override async Task<MarketingResult> UpsertContactAsync(MarketingConnectionSettings settings, MarketingContact contact, CancellationToken cancellationToken = default)
        {
            try
            {
                var payload = new
                {
                    api_key = settings.ApiKey,
                    email = contact.Email,
                    first_name = contact.FirstName,
                    fields = contact.CustomFields
                };

                var request = CreateRequest(settings, HttpMethod.Post, "/subscribers", payload);
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                {
                    var json = JObject.Parse(body);
                    var subscriber = json["subscriber"];
                    var subscriberId = subscriber != null ? subscriber["id"]?.ToString() : null;
                    return MarketingResult.Ok(subscriberId, "Contact upserted to ConvertKit.");
                }

                return MarketingResult.Fail($"ConvertKit upsert failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return MarketingResult.Fail("ConvertKit upsert error.", ex);
            }
        }

        public override async Task<MarketingResult> AddToListAsync(MarketingConnectionSettings settings, string listId, MarketingContact contact, CancellationToken cancellationToken = default)
        {
            try
            {
                var payload = new
                {
                    api_key = settings.ApiKey,
                    email = contact.Email,
                    first_name = contact.FirstName,
                    tags = new[] { listId }
                };

                var request = CreateRequest(settings, HttpMethod.Post, $"/tags/{listId}/subscribe", payload);
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                    return MarketingResult.Ok(null, "Contact added to ConvertKit tag.");

                return MarketingResult.Fail($"ConvertKit tag subscribe failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return MarketingResult.Fail("ConvertKit tag subscribe error.", ex);
            }
        }

        public override Task<MarketingResult> RemoveFromListAsync(MarketingConnectionSettings settings, string listId, string email, CancellationToken cancellationToken = default)
        {
            // ConvertKit v3 public API does not support unsubscribing from a single tag via email without subscriber id.
            return Task.FromResult(MarketingResult.Fail("ConvertKit remove from tag is not supported in this implementation."));
        }

        public override Task<MarketingResult> SendTransactionalAsync(MarketingConnectionSettings settings, MarketingMessage message, CancellationToken cancellationToken = default)
        {
            // ConvertKit focuses on sequences/broadcasts; transactional email is not a first-class feature.
            return Task.FromResult(MarketingResult.Fail("ConvertKit does not support direct transactional email. Use sequences instead."));
        }

        public override async Task<IReadOnlyList<MarketingList>> GetListsAsync(MarketingConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var request = CreateRequest(settings, HttpMethod.Get, $"/tags?api_key={settings.ApiKey}");
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                    return new List<MarketingList>();

                var json = JObject.Parse(body);
                var lists = new List<MarketingList>();
                foreach (var item in json["tags"] ?? new JArray())
                {
                    lists.Add(new MarketingList
                    {
                        Id = item["id"]?.ToString(),
                        Name = item["name"]?.ToString(),
                        Type = "tag"
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

            if (payload != null)
            {
                request.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            }

            return request;
        }
    }
}
