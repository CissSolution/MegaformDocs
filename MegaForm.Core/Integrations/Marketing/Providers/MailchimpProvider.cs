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
    public class MailchimpProvider : HttpMarketingProviderBase
    {
        public MailchimpProvider(HttpClient httpClient) : base(httpClient) { }

        public override string ProviderName => "Mailchimp";

        protected override string GetDefaultBaseUrl(MarketingConnectionSettings settings)
        {
            var prefix = string.IsNullOrWhiteSpace(settings.ServerPrefix) ? "us1" : settings.ServerPrefix;
            return $"https://{prefix}.api.mailchimp.com/3.0";
        }

        public override async Task<MarketingHealthResult> HealthCheckAsync(MarketingConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var request = CreateRequest(settings, HttpMethod.Get, "/");
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                if (response.IsSuccessStatusCode)
                    return MarketingHealthResult.Ok("Connected to Mailchimp.");

                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return MarketingHealthResult.Fail($"Mailchimp health check failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return MarketingHealthResult.Fail("Mailchimp health check error.", ex);
            }
        }

        public override async Task<MarketingResult> UpsertContactAsync(MarketingConnectionSettings settings, MarketingContact contact, CancellationToken cancellationToken = default)
        {
            try
            {
                var listId = settings.DefaultListId;
                if (string.IsNullOrWhiteSpace(listId))
                    return MarketingResult.Fail("Mailchimp requires a default list/audience id.");

                var subscriberHash = ComputeMd5Hash(contact.Email.ToLowerInvariant());
                var url = $"/lists/{listId}/members/{subscriberHash}";
                var payload = new
                {
                    email_address = contact.Email,
                    status = MapStatus(contact.Status),
                    merge_fields = BuildMergeFields(contact),
                    status_if_new = MapStatus(contact.Status)
                };

                var request = CreateRequest(settings, HttpMethod.Put, url, payload);
                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                {
                    var json = JObject.Parse(body);
                    return MarketingResult.Ok(json["id"]?.ToString(), "Contact upserted to Mailchimp.");
                }

                return MarketingResult.Fail($"Mailchimp upsert failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return MarketingResult.Fail("Mailchimp upsert error.", ex);
            }
        }

        public override async Task<MarketingResult> AddToListAsync(MarketingConnectionSettings settings, string listId, MarketingContact contact, CancellationToken cancellationToken = default)
        {
            return await UpsertContactAsync(settings, contact, cancellationToken).ConfigureAwait(false);
        }

        public override Task<MarketingResult> RemoveFromListAsync(MarketingConnectionSettings settings, string listId, string email, CancellationToken cancellationToken = default)
        {
            return UpsertContactAsync(settings, new MarketingContact { Email = email, Status = MarketingSubscriptionStatus.Unsubscribed }, cancellationToken);
        }

        public override async Task<MarketingResult> SendTransactionalAsync(MarketingConnectionSettings settings, MarketingMessage message, CancellationToken cancellationToken = default)
        {
            try
            {
                var payload = new
                {
                    key = settings.ApiKey,
                    message = new
                    {
                        subject = message.Subject,
                        html = message.HtmlBody,
                        text = message.TextBody,
                        from_email = message.FromEmail,
                        from_name = message.FromName,
                        to = message.ToEmails.Select(e => new { email = e }).ToList()
                    }
                };

                var request = new HttpRequestMessage(HttpMethod.Post, "https://mandrillapp.com/api/1.0/messages/send")
                {
                    Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json")
                };

                var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                    return MarketingResult.Ok(null, "Transactional email sent via Mailchimp Mandrill.");

                return MarketingResult.Fail($"Mailchimp Mandrill send failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return MarketingResult.Fail("Mailchimp Mandrill send error.", ex);
            }
        }

        public override async Task<IReadOnlyList<MarketingList>> GetListsAsync(MarketingConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var request = CreateRequest(settings, HttpMethod.Get, "/lists?count=1000");
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
                        Type = "audience",
                        MemberCount = item["stats"] != null ? (int?)item["stats"]["member_count"] : null
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
            var credentials = Convert.ToBase64String(Encoding.ASCII.GetBytes($"anystring:{settings.ApiKey}"));
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", credentials);

            if (payload != null)
            {
                request.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            }

            return request;
        }

        private static string MapStatus(MarketingSubscriptionStatus status)
        {
            switch (status)
            {
                case MarketingSubscriptionStatus.Unsubscribed: return "unsubscribed";
                case MarketingSubscriptionStatus.Pending: return "pending";
                case MarketingSubscriptionStatus.Cleaned: return "cleaned";
                case MarketingSubscriptionStatus.Transactional: return "transactional";
                default: return "subscribed";
            }
        }

        private static Dictionary<string, object> BuildMergeFields(MarketingContact contact)
        {
            var fields = new Dictionary<string, object>();
            if (!string.IsNullOrWhiteSpace(contact.FirstName))
                fields["FNAME"] = contact.FirstName;
            if (!string.IsNullOrWhiteSpace(contact.LastName))
                fields["LNAME"] = contact.LastName;
            if (!string.IsNullOrWhiteSpace(contact.Phone))
                fields["PHONE"] = contact.Phone;

            foreach (var kvp in contact.CustomFields)
            {
                fields[kvp.Key] = kvp.Value;
            }

            return fields;
        }

        private static string ComputeMd5Hash(string input)
        {
            using (var md5 = System.Security.Cryptography.MD5.Create())
            {
                var bytes = Encoding.UTF8.GetBytes(input);
                var hash = md5.ComputeHash(bytes);
                return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
            }
        }
    }
}
