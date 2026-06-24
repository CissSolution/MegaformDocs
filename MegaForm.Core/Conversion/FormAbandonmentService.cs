using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Conversion
{
    /// <summary>
    /// In-memory form abandonment tracker. Replace with persistent store for production.
    /// </summary>
    public class FormAbandonmentService : IFormAbandonmentService
    {
        private readonly ConcurrentDictionary<string, FormAbandonmentEvent> _events = new ConcurrentDictionary<string, FormAbandonmentEvent>();

        public Task TrackActivityAsync(FormAbandonmentEvent activity, CancellationToken cancellationToken = default)
        {
            if (activity == null)
                return Task.CompletedTask;

            activity.LastActivityAt = DateTime.UtcNow;
            _events.AddOrUpdate(activity.SessionId, activity, (key, existing) =>
            {
                existing.LastCompletedStep = Math.Max(existing.LastCompletedStep, activity.LastCompletedStep);
                existing.LastActivityAt = activity.LastActivityAt;
                if (activity.PartialValues != null)
                {
                    foreach (var kvp in activity.PartialValues)
                        existing.PartialValues[kvp.Key] = kvp.Value;
                }
                if (!string.IsNullOrWhiteSpace(activity.Email))
                    existing.Email = activity.Email;
                return existing;
            });

            return Task.CompletedTask;
        }

        public Task MarkRecoveredAsync(string sessionId, CancellationToken cancellationToken = default)
        {
            if (_events.TryGetValue(sessionId, out var evt))
            {
                evt.Recovered = true;
                evt.RecoveredAt = DateTime.UtcNow;
            }
            return Task.CompletedTask;
        }

        public Task<FormAbandonmentSummary> GetSummaryAsync(int formId, CancellationToken cancellationToken = default)
        {
            var events = _events.Values.Where(e => e.FormId == formId).ToList();
            var total = events.Count;
            var abandoned = events.Count(e => !e.Recovered);
            var recovered = events.Count(e => e.Recovered);

            return Task.FromResult(new FormAbandonmentSummary
            {
                FormId = formId,
                TotalSessions = total,
                AbandonedSessions = abandoned,
                RecoveredSessions = recovered
            });
        }

        public Task<IReadOnlyList<FormAbandonmentEvent>> GetAbandonedSessionsAsync(int formId, int? maxAgeMinutes = null, CancellationToken cancellationToken = default)
        {
            var cutoff = maxAgeMinutes.HasValue ? DateTime.UtcNow.AddMinutes(-maxAgeMinutes.Value) : (DateTime?)null;
            var result = _events.Values
                .Where(e => e.FormId == formId && !e.Recovered)
                .Where(e => !cutoff.HasValue || e.LastActivityAt >= cutoff.Value)
                .OrderByDescending(e => e.LastActivityAt)
                .ToList();

            return Task.FromResult<IReadOnlyList<FormAbandonmentEvent>>(result);
        }
    }
}
