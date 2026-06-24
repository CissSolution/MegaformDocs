using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Conversion
{
    /// <summary>
    /// In-memory lead form scoring service. Replace with persistent store for production.
    /// </summary>
    public class LeadFormService : ILeadFormService
    {
        private readonly ConcurrentDictionary<string, LeadFormProfile> _profiles = new ConcurrentDictionary<string, LeadFormProfile>();

        public Task<LeadScoreResult> ScoreAsync(LeadFormProfile profile, IReadOnlyDictionary<string, object> submissionValues, CancellationToken cancellationToken = default)
        {
            if (profile == null)
                throw new ArgumentNullException(nameof(profile));
            if (submissionValues == null)
                throw new ArgumentNullException(nameof(submissionValues));

            var result = new LeadScoreResult
            {
                Tier = "cold",
                Tags = new List<string>(profile.TagsToApply)
            };

            result.TotalScore += profile.LeadScoreIncrement;

            foreach (var rule in profile.ScoringRules ?? new List<LeadScoringRule>())
            {
                if (!submissionValues.TryGetValue(rule.FieldKey, out var value))
                    continue;

                if (RuleMatches(rule, value))
                {
                    result.TotalScore += rule.Score;
                    result.MatchedRules.Add($"{rule.FieldKey} {rule.Operator} {rule.Value}");
                }
            }

            if (result.TotalScore >= 80)
                result.Tier = "hot";
            else if (result.TotalScore >= 50)
                result.Tier = "warm";

            return Task.FromResult(result);
        }

        public Task<IReadOnlyList<LeadFormProfile>> ListProfilesAsync(int? formId = null, CancellationToken cancellationToken = default)
        {
            var query = _profiles.Values.AsEnumerable();
            if (formId.HasValue)
                query = query.Where(p => p.FormId == formId.Value);

            return Task.FromResult<IReadOnlyList<LeadFormProfile>>(query.ToList());
        }

        public Task SaveProfileAsync(LeadFormProfile profile, CancellationToken cancellationToken = default)
        {
            if (profile == null)
                throw new ArgumentNullException(nameof(profile));

            _profiles[profile.Id] = profile;
            return Task.CompletedTask;
        }

        public Task DeleteProfileAsync(string id, CancellationToken cancellationToken = default)
        {
            _profiles.TryRemove(id, out _);
            return Task.CompletedTask;
        }

        private static bool RuleMatches(LeadScoringRule rule, object value)
        {
            var valueString = value?.ToString() ?? string.Empty;
            var ruleValue = rule.Value ?? string.Empty;

            switch ((rule.Operator ?? "equals").ToLowerInvariant())
            {
                case "equals":
                case "==":
                    return string.Equals(valueString, ruleValue, StringComparison.OrdinalIgnoreCase);
                case "contains":
                    return valueString.IndexOf(ruleValue, StringComparison.OrdinalIgnoreCase) >= 0;
                case "not_equals":
                case "!=":
                    return !string.Equals(valueString, ruleValue, StringComparison.OrdinalIgnoreCase);
                default:
                    return false;
            }
        }
    }
}
