using System;
using System.Collections.Generic;

namespace MegaForm.Core.Integrations.Storage
{
    public class CalendarConnectionSettings
    {
        public string ProviderName { get; set; }
        public string AccessToken { get; set; }
        public string RefreshToken { get; set; }
        public string ClientId { get; set; }
        public string ClientSecret { get; set; }
        public string CalendarId { get; set; } = "primary";
        public string TimeZone { get; set; } = "UTC";
        public Dictionary<string, string> Extra { get; set; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    }

    public class CalendarEvent
    {
        public string Id { get; set; }
        public string Summary { get; set; }
        public string Description { get; set; }
        public string Location { get; set; }
        public DateTime Start { get; set; }
        public DateTime End { get; set; }
        public bool AllDay { get; set; }
        public List<string> Attendees { get; set; } = new List<string>();
        public string RecurrenceRule { get; set; }
        public Dictionary<string, string> ExtendedProperties { get; set; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    }

    public class CalendarQuery
    {
        public DateTime? TimeMin { get; set; }
        public DateTime? TimeMax { get; set; }
        public int MaxResults { get; set; } = 250;
        public string SearchText { get; set; }
    }

    public class CalendarEventResult
    {
        public bool Success { get; set; }
        public CalendarEvent Event { get; set; }
        public string Message { get; set; }
        public Exception Error { get; set; }

        public static CalendarEventResult Ok(CalendarEvent evt, string message = null)
        {
            return new CalendarEventResult { Success = true, Event = evt, Message = message };
        }

        public static CalendarEventResult Fail(string message, Exception error = null)
        {
            return new CalendarEventResult { Success = false, Message = message, Error = error };
        }
    }

    public class CalendarHealthResult
    {
        public bool Healthy { get; set; }
        public string Message { get; set; }
        public Exception Error { get; set; }

        public static CalendarHealthResult Ok(string message = null)
        {
            return new CalendarHealthResult { Healthy = true, Message = message };
        }

        public static CalendarHealthResult Fail(string message, Exception error = null)
        {
            return new CalendarHealthResult { Healthy = false, Message = message, Error = error };
        }
    }

    public class CalendarIntegrationMapping
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string ProviderName { get; set; }
        public string ConnectionSettingsId { get; set; }
        public string CalendarId { get; set; }
        public string TitleFieldKey { get; set; }
        public string DescriptionFieldKey { get; set; }
        public string StartFieldKey { get; set; }
        public string EndFieldKey { get; set; }
        public string LocationFieldKey { get; set; }
        public string AttendeesFieldKey { get; set; }
    }
}
