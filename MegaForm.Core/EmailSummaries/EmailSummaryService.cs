using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using Newtonsoft.Json;

namespace MegaForm.Core.EmailSummaries
{
    /// <summary>
    /// Default email summary generator. Schedules are stored in-memory;
    /// hosts should provide a persistent schedule store and email dispatcher for production.
    /// </summary>
    public class EmailSummaryService : IEmailSummaryService
    {
        private readonly IFormRepository _formRepository;
        private readonly ISubmissionRepository _submissionRepository;
        private readonly ConcurrentDictionary<string, EmailSummarySchedule> _schedules = new ConcurrentDictionary<string, EmailSummarySchedule>();

        public EmailSummaryService(IFormRepository formRepository, ISubmissionRepository submissionRepository)
        {
            _formRepository = formRepository ?? throw new ArgumentNullException(nameof(formRepository));
            _submissionRepository = submissionRepository ?? throw new ArgumentNullException(nameof(submissionRepository));
        }

        public async Task<EmailSummary> GenerateAsync(int formId, DateTime periodStart, DateTime periodEnd, CancellationToken cancellationToken = default)
        {
            var form = await Task.FromResult(_formRepository.GetForm(formId)).ConfigureAwait(false);
            var submissions = await Task.FromResult(_submissionRepository.List(formId, null, null, periodStart, periodEnd, 0, int.MaxValue)).ConfigureAwait(false);

            var summary = new EmailSummary
            {
                FormId = formId,
                PeriodStart = periodStart,
                PeriodEnd = periodEnd,
                TotalSubmissions = submissions.TotalCount,
                NewSubmissions = submissions.TotalCount
            };

            if (submissions.Items != null)
            {
                foreach (var submission in submissions.Items)
                {
                    var values = DeserializeValues(submission.DataJson);
                    if (values == null)
                        continue;

                    foreach (var kvp in values)
                    {
                        if (!summary.FieldCounts.ContainsKey(kvp.Key))
                            summary.FieldCounts[kvp.Key] = 0;
                        summary.FieldCounts[kvp.Key]++;
                    }
                }
            }

            summary.Highlights.Add(new EmailSummaryHighlight
            {
                Type = "submissions",
                Title = "Total Submissions",
                Description = $"You received {summary.TotalSubmissions} submissions during this period.",
                Count = summary.TotalSubmissions
            });

            return summary;
        }

        public Task<string> RenderHtmlAsync(EmailSummaryRenderRequest request, CancellationToken cancellationToken = default)
        {
            var sb = new StringBuilder();
            sb.AppendLine("<html><body>");
            sb.AppendLine($"<h1>{request.SiteName} - Form Summary</h1>");
            sb.AppendLine($"<p>Period: {request.Summary.PeriodStart:yyyy-MM-dd} to {request.Summary.PeriodEnd:yyyy-MM-dd}</p>");
            sb.AppendLine($"<h2>Total Submissions: {request.Summary.TotalSubmissions}</h2>");
            sb.AppendLine("<ul>");
            foreach (var highlight in request.Summary.Highlights)
            {
                sb.AppendLine($"<li><strong>{highlight.Title}</strong>: {highlight.Description}</li>");
            }
            sb.AppendLine("</ul>");
            sb.AppendLine($"<p><a href=\"{request.FormUrl}\">View Form</a></p>");
            sb.AppendLine("</body></html>");
            return Task.FromResult(sb.ToString());
        }

        public Task<string> RenderTextAsync(EmailSummaryRenderRequest request, CancellationToken cancellationToken = default)
        {
            var sb = new StringBuilder();
            sb.AppendLine($"{request.SiteName} - Form Summary");
            sb.AppendLine($"Period: {request.Summary.PeriodStart:yyyy-MM-dd} to {request.Summary.PeriodEnd:yyyy-MM-dd}");
            sb.AppendLine($"Total Submissions: {request.Summary.TotalSubmissions}");
            foreach (var highlight in request.Summary.Highlights)
            {
                sb.AppendLine($"- {highlight.Title}: {highlight.Description}");
            }
            sb.AppendLine($"View Form: {request.FormUrl}");
            return Task.FromResult(sb.ToString());
        }

        public Task<IReadOnlyList<EmailSummarySchedule>> GetSchedulesAsync(int? formId = null, CancellationToken cancellationToken = default)
        {
            var query = _schedules.Values.AsEnumerable();
            if (formId.HasValue)
                query = query.Where(s => s.FormId == formId.Value);

            return Task.FromResult<IReadOnlyList<EmailSummarySchedule>>(query.ToList());
        }

        public Task SaveScheduleAsync(EmailSummarySchedule schedule, CancellationToken cancellationToken = default)
        {
            if (schedule == null)
                throw new ArgumentNullException(nameof(schedule));

            _schedules[schedule.Id] = schedule;
            return Task.CompletedTask;
        }

        public Task DeleteScheduleAsync(string scheduleId, CancellationToken cancellationToken = default)
        {
            _schedules.TryRemove(scheduleId, out _);
            return Task.CompletedTask;
        }

        private static Dictionary<string, object> DeserializeValues(string dataJson)
        {
            if (string.IsNullOrWhiteSpace(dataJson))
                return new Dictionary<string, object>();
            try
            {
                return JsonConvert.DeserializeObject<Dictionary<string, object>>(dataJson) ?? new Dictionary<string, object>();
            }
            catch
            {
                return new Dictionary<string, object>();
            }
        }

        public Task<IReadOnlyList<EmailSummarySchedule>> GetDueSchedulesAsync(CancellationToken cancellationToken = default)
        {
            var now = DateTime.UtcNow;
            var due = _schedules.Values.Where(s => IsDue(s, now)).ToList();
            return Task.FromResult<IReadOnlyList<EmailSummarySchedule>>(due);
        }

        private static bool IsDue(EmailSummarySchedule schedule, DateTime now)
        {
            var reference = schedule.LastSentSummaryId.HasValue
                ? DateTime.UtcNow // In-memory store doesn't track last sent time; always true for demo.
                : schedule.HourOfDay.HasValue
                    ? new DateTime(now.Year, now.Month, now.Day, schedule.HourOfDay.Value, 0, 0, DateTimeKind.Utc)
                    : now.Date;

            // Simplistic due check: if hour matches or no hour specified.
            if (schedule.HourOfDay.HasValue)
                return now.Hour >= schedule.HourOfDay.Value;

            return true;
        }
    }
}
