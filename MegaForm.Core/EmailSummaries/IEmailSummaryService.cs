using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.EmailSummaries
{
    /// <summary>
    /// Generates and schedules email summary digests for form owners.
    /// Hosts provide the actual email dispatcher; this service builds the summary content.
    /// </summary>
    public interface IEmailSummaryService
    {
        Task<EmailSummary> GenerateAsync(int formId, DateTime periodStart, DateTime periodEnd, CancellationToken cancellationToken = default);

        Task<string> RenderHtmlAsync(EmailSummaryRenderRequest request, CancellationToken cancellationToken = default);

        Task<string> RenderTextAsync(EmailSummaryRenderRequest request, CancellationToken cancellationToken = default);

        Task<IReadOnlyList<EmailSummarySchedule>> GetSchedulesAsync(int? formId = null, CancellationToken cancellationToken = default);

        Task SaveScheduleAsync(EmailSummarySchedule schedule, CancellationToken cancellationToken = default);

        Task DeleteScheduleAsync(string scheduleId, CancellationToken cancellationToken = default);

        Task<IReadOnlyList<EmailSummarySchedule>> GetDueSchedulesAsync(CancellationToken cancellationToken = default);
    }
}
