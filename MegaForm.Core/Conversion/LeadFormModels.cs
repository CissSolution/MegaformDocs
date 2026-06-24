using System;
using System.Collections.Generic;

namespace MegaForm.Core.Conversion
{
    public class LeadFormProfile
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public int FormId { get; set; }
        public string Name { get; set; }
        public string LeadSource { get; set; }
        public string CampaignId { get; set; }
        public string UtmMedium { get; set; }
        public string UtmSource { get; set; }
        public string UtmCampaign { get; set; }
        public int LeadScoreIncrement { get; set; }
        public List<string> TagsToApply { get; set; } = new List<string>();
        public List<LeadScoringRule> ScoringRules { get; set; } = new List<LeadScoringRule>();
    }

    public class LeadScoringRule
    {
        public string FieldKey { get; set; }
        public string Operator { get; set; }
        public string Value { get; set; }
        public int Score { get; set; }
    }

    public class LeadScoreResult
    {
        public int TotalScore { get; set; }
        public string Tier { get; set; }
        public List<string> MatchedRules { get; set; } = new List<string>();
        public List<string> Tags { get; set; } = new List<string>();
    }
}
