using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Conversion
{
    /// <summary>
    /// In-memory user journey tracker. Replace with persistent store for production.
    /// </summary>
    public class UserJourneyService : IUserJourneyService
    {
        private readonly ConcurrentDictionary<string, UserJourney> _journeys = new ConcurrentDictionary<string, UserJourney>();

        public Task RecordStepAsync(UserJourneyStep step, string journeyId, int formId, string sessionId, string userIdentifier, CancellationToken cancellationToken = default)
        {
            if (step == null)
                return Task.CompletedTask;

            var journey = _journeys.GetOrAdd(journeyId, id => new UserJourney
            {
                JourneyId = id,
                FormId = formId,
                SessionId = sessionId,
                UserIdentifier = userIdentifier,
                StartedAt = DateTime.UtcNow
            });

            step.Timestamp = DateTime.UtcNow;
            var last = journey.Steps.LastOrDefault();
            if (last != null)
                step.TimeSincePrevious = step.Timestamp - last.Timestamp;

            journey.Steps.Add(step);

            if (string.Equals(step.StepType, "submit", StringComparison.OrdinalIgnoreCase))
                journey.CompletedAt = step.Timestamp;

            return Task.CompletedTask;
        }

        public Task<UserJourney> GetJourneyAsync(string journeyId, CancellationToken cancellationToken = default)
        {
            _journeys.TryGetValue(journeyId, out var journey);
            return Task.FromResult(journey);
        }

        public Task<UserJourneyReport> BuildReportAsync(int formId, CancellationToken cancellationToken = default)
        {
            var journeys = _journeys.Values.Where(j => j.FormId == formId).ToList();
            var report = new UserJourneyReport
            {
                FormId = formId,
                TotalJourneys = journeys.Count,
                CompletedJourneys = journeys.Count(j => j.CompletedAt.HasValue),
                AbandonedJourneys = journeys.Count(j => !j.CompletedAt.HasValue)
            };

            if (journeys.Any())
            {
                report.AverageDuration = TimeSpan.FromMilliseconds(
                    journeys.Where(j => j.CompletedAt.HasValue)
                            .Average(j => (j.CompletedAt.Value - j.StartedAt).TotalMilliseconds));
            }

            // Build funnel from unique step names.
            var stepNames = journeys.SelectMany(j => j.Steps).Select(s => s.StepName).Distinct().ToList();
            foreach (var name in stepNames)
            {
                var reached = journeys.Count(j => j.Steps.Any(s => s.StepName == name));
                var dropped = report.TotalJourneys - reached;
                report.Funnel.Add(new UserJourneyFunnelStep
                {
                    StepName = name,
                    Reached = reached,
                    Dropped = dropped
                });
            }

            return Task.FromResult(report);
        }

        public Task<IReadOnlyList<UserJourney>> ListJourneysAsync(int formId, int? maxAgeHours = null, CancellationToken cancellationToken = default)
        {
            var cutoff = maxAgeHours.HasValue ? DateTime.UtcNow.AddHours(-maxAgeHours.Value) : (DateTime?)null;
            var result = _journeys.Values
                .Where(j => j.FormId == formId)
                .Where(j => !cutoff.HasValue || j.StartedAt >= cutoff.Value)
                .OrderByDescending(j => j.StartedAt)
                .ToList();

            return Task.FromResult<IReadOnlyList<UserJourney>>(result);
        }
    }
}
