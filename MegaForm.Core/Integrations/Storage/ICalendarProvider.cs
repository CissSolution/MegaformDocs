using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Integrations.Storage
{
    /// <summary>
    /// Platform-agnostic contract for calendar providers (Google Calendar, Outlook Calendar, ...).
    /// </summary>
    public interface ICalendarProvider
    {
        string ProviderName { get; } // e.g. GoogleCalendar, OutlookCalendar

        Task<CalendarHealthResult> HealthCheckAsync(CalendarConnectionSettings settings, CancellationToken cancellationToken = default);

        Task<CalendarEventResult> CreateEventAsync(CalendarConnectionSettings settings, CalendarEvent evt, CancellationToken cancellationToken = default);

        Task<CalendarEventResult> UpdateEventAsync(CalendarConnectionSettings settings, string eventId, CalendarEvent evt, CancellationToken cancellationToken = default);

        Task DeleteEventAsync(CalendarConnectionSettings settings, string eventId, CancellationToken cancellationToken = default);

        Task<IReadOnlyList<CalendarEvent>> ListEventsAsync(CalendarConnectionSettings settings, CalendarQuery query, CancellationToken cancellationToken = default);
    }
}
