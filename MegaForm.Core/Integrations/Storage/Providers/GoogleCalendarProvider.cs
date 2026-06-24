using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Integrations.Storage.Providers
{
    public class GoogleCalendarProvider : ICalendarProvider
    {
        private readonly HttpClient _httpClient;
        private const string BaseUrl = "https://www.googleapis.com/calendar/v3";

        public GoogleCalendarProvider(HttpClient httpClient)
        {
            _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        }

        public string ProviderName => "GoogleCalendar";

        public async Task<CalendarHealthResult> HealthCheckAsync(CalendarConnectionSettings settings, CancellationToken cancellationToken = default)
        {
            try
            {
                var request = CreateRequest(settings, HttpMethod.Get, $"/calendars/{settings.CalendarId}");
                var response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                if (response.IsSuccessStatusCode)
                    return CalendarHealthResult.Ok("Connected to Google Calendar.");

                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return CalendarHealthResult.Fail($"Google Calendar health check failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return CalendarHealthResult.Fail("Google Calendar health check error.", ex);
            }
        }

        public async Task<CalendarEventResult> CreateEventAsync(CalendarConnectionSettings settings, CalendarEvent evt, CancellationToken cancellationToken = default)
        {
            try
            {
                var payload = BuildEventPayload(evt, settings.TimeZone);
                var request = CreateRequest(settings, HttpMethod.Post, $"/calendars/{settings.CalendarId}/events", payload);
                var response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                {
                    var json = JObject.Parse(body);
                    evt.Id = json["id"]?.ToString();
                    return CalendarEventResult.Ok(evt, "Event created in Google Calendar.");
                }

                return CalendarEventResult.Fail($"Google Calendar create event failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return CalendarEventResult.Fail("Google Calendar create event error.", ex);
            }
        }

        public async Task<CalendarEventResult> UpdateEventAsync(CalendarConnectionSettings settings, string eventId, CalendarEvent evt, CancellationToken cancellationToken = default)
        {
            try
            {
                var payload = BuildEventPayload(evt, settings.TimeZone);
                var request = CreateRequest(settings, HttpMethod.Put, $"/calendars/{settings.CalendarId}/events/{eventId}", payload);
                var response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                {
                    var json = JObject.Parse(body);
                    evt.Id = json["id"]?.ToString();
                    return CalendarEventResult.Ok(evt, "Event updated in Google Calendar.");
                }

                return CalendarEventResult.Fail($"Google Calendar update event failed: {(int)response.StatusCode} {body}");
            }
            catch (Exception ex)
            {
                return CalendarEventResult.Fail("Google Calendar update event error.", ex);
            }
        }

        public async Task DeleteEventAsync(CalendarConnectionSettings settings, string eventId, CancellationToken cancellationToken = default)
        {
            var request = CreateRequest(settings, HttpMethod.Delete, $"/calendars/{settings.CalendarId}/events/{eventId}");
            var response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new Exception($"Google Calendar delete event failed: {(int)response.StatusCode} {body}");
            }
        }

        public async Task<IReadOnlyList<CalendarEvent>> ListEventsAsync(CalendarConnectionSettings settings, CalendarQuery query, CancellationToken cancellationToken = default)
        {
            try
            {
                var queryParams = new List<string>();
                if (query.TimeMin.HasValue)
                    queryParams.Add($"timeMin={Uri.EscapeDataString(query.TimeMin.Value.ToString("o"))}");
                if (query.TimeMax.HasValue)
                    queryParams.Add($"timeMax={Uri.EscapeDataString(query.TimeMax.Value.ToString("o"))}");
                if (query.MaxResults > 0)
                    queryParams.Add($"maxResults={query.MaxResults}");
                if (!string.IsNullOrWhiteSpace(query.SearchText))
                    queryParams.Add($"q={Uri.EscapeDataString(query.SearchText)}");

                var queryString = queryParams.Count > 0 ? "?" + string.Join("&", queryParams) : string.Empty;
                var request = CreateRequest(settings, HttpMethod.Get, $"/calendars/{settings.CalendarId}/events{queryString}");
                var response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                    return new List<CalendarEvent>();

                var json = JObject.Parse(body);
                var events = new List<CalendarEvent>();
                foreach (var item in json["items"] ?? new JArray())
                {
                    events.Add(ParseEvent(item));
                }
                return events;
            }
            catch
            {
                return new List<CalendarEvent>();
            }
        }

        private static object BuildEventPayload(CalendarEvent evt, string timeZone)
        {
            var payload = new Dictionary<string, object>
            {
                ["summary"] = evt.Summary,
                ["description"] = evt.Description,
                ["location"] = evt.Location
            };

            if (evt.AllDay)
            {
                payload["start"] = new { date = evt.Start.ToString("yyyy-MM-dd") };
                payload["end"] = new { date = evt.End.ToString("yyyy-MM-dd") };
            }
            else
            {
                payload["start"] = new { dateTime = evt.Start.ToString("o"), timeZone = timeZone };
                payload["end"] = new { dateTime = evt.End.ToString("o"), timeZone = timeZone };
            }

            if (evt.Attendees != null && evt.Attendees.Count > 0)
            {
                payload["attendees"] = evt.Attendees.Select(a => new { email = a }).ToList();
            }

            if (!string.IsNullOrWhiteSpace(evt.RecurrenceRule))
            {
                payload["recurrence"] = new[] { evt.RecurrenceRule };
            }

            if (evt.ExtendedProperties != null && evt.ExtendedProperties.Count > 0)
            {
                payload["extendedProperties"] = new { shared = evt.ExtendedProperties };
            }

            return payload;
        }

        private static CalendarEvent ParseEvent(JToken item)
        {
            var evt = new CalendarEvent
            {
                Id = item["id"]?.ToString(),
                Summary = item["summary"]?.ToString(),
                Description = item["description"]?.ToString(),
                Location = item["location"]?.ToString(),
            };

            if (item["start"] != null)
            {
                if (item["start"]["dateTime"] != null)
                {
                    evt.Start = item["start"]["dateTime"].Value<DateTime>();
                    evt.AllDay = false;
                }
                else if (item["start"]["date"] != null)
                {
                    evt.Start = item["start"]["date"].Value<DateTime>();
                    evt.AllDay = true;
                }
            }

            if (item["end"] != null)
            {
                if (item["end"]["dateTime"] != null)
                    evt.End = item["end"]["dateTime"].Value<DateTime>();
                else if (item["end"]["date"] != null)
                    evt.End = item["end"]["date"].Value<DateTime>();
            }

            if (item["attendees"] != null)
            {
                evt.Attendees = item["attendees"].Select(a => a["email"]?.ToString()).Where(e => !string.IsNullOrWhiteSpace(e)).ToList();
            }

            return evt;
        }

        private HttpRequestMessage CreateRequest(CalendarConnectionSettings settings, HttpMethod method, string relativeUrl, object payload = null)
        {
            var request = new HttpRequestMessage(method, BaseUrl + relativeUrl);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", settings.AccessToken);

            if (payload != null)
            {
                request.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            }

            return request;
        }
    }
}
