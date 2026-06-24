using System;
using System.Collections.Generic;

namespace MegaForm.Core.EmailSummaries
{
    public class EmailSummarySchedule
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public int FormId { get; set; }
        public string Name { get; set; }
        public List<string> Recipients { get; set; } = new List<string>();
        public EmailSummaryFrequency Frequency { get; set; } = EmailSummaryFrequency.Daily;
        public DayOfWeek? DayOfWeek { get; set; }
        public int? HourOfDay { get; set; }
        public string TimeZone { get; set; } = "UTC";
        public bool IncludeSubmissions { get; set; } = true;
        public bool IncludeStatistics { get; set; } = true;
        public bool IncludeAbandonment { get; set; }
        public int? LastSentSummaryId { get; set; }
    }

    public enum EmailSummaryFrequency
    {
        Hourly,
        Daily,
        Weekly,
        Monthly
    }

    public class EmailSummary
    {
        public int Id { get; set; }
        public int FormId { get; set; }
        public DateTime PeriodStart { get; set; }
        public DateTime PeriodEnd { get; set; }
        public int TotalSubmissions { get; set; }
        public int NewSubmissions { get; set; }
        public int AbandonedSessions { get; set; }
        public Dictionary<string, int> FieldCounts { get; set; } = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        public List<EmailSummaryHighlight> Highlights { get; set; } = new List<EmailSummaryHighlight>();
        public string GeneratedHtml { get; set; }
        public string GeneratedText { get; set; }
        public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    }

    public class EmailSummaryHighlight
    {
        public string Type { get; set; }
        public string Title { get; set; }
        public string Description { get; set; }
        public int Count { get; set; }
    }

    public class EmailSummaryRenderRequest
    {
        public EmailSummary Summary { get; set; }
        public EmailSummarySchedule Schedule { get; set; }
        public string SiteName { get; set; }
        public string FormUrl { get; set; }
    }
}
