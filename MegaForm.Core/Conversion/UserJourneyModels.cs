using System;
using System.Collections.Generic;

namespace MegaForm.Core.Conversion
{
    public class UserJourneyStep
    {
        public string StepName { get; set; }
        public string StepType { get; set; } // page, field, button, payment, submit
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public TimeSpan? TimeSincePrevious { get; set; }
        public Dictionary<string, object> Metadata { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
    }

    public class UserJourney
    {
        public string JourneyId { get; set; } = Guid.NewGuid().ToString("N");
        public int FormId { get; set; }
        public string SessionId { get; set; }
        public string UserIdentifier { get; set; }
        public List<UserJourneyStep> Steps { get; set; } = new List<UserJourneyStep>();
        public DateTime StartedAt { get; set; } = DateTime.UtcNow;
        public DateTime? CompletedAt { get; set; }
    }

    public class UserJourneyReport
    {
        public int FormId { get; set; }
        public int TotalJourneys { get; set; }
        public int CompletedJourneys { get; set; }
        public int AbandonedJourneys { get; set; }
        public TimeSpan AverageDuration { get; set; }
        public List<UserJourneyFunnelStep> Funnel { get; set; } = new List<UserJourneyFunnelStep>();
    }

    public class UserJourneyFunnelStep
    {
        public string StepName { get; set; }
        public int Reached { get; set; }
        public int Dropped { get; set; }
        public double DropOffRate => (Reached + Dropped) == 0 ? 0 : (Dropped * 100.0 / (Reached + Dropped));
        public TimeSpan AverageTimeToComplete { get; set; }
    }
}
