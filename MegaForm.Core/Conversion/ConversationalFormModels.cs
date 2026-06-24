using System;
using System.Collections.Generic;

namespace MegaForm.Core.Conversion
{
    public class ConversationalFormSession
    {
        public string SessionId { get; set; } = Guid.NewGuid().ToString("N");
        public int FormId { get; set; }
        public string FormTitle { get; set; }
        public int CurrentStepIndex { get; set; }
        public List<ConversationalStep> Steps { get; set; } = new List<ConversationalStep>();
        public Dictionary<string, object> Answers { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public bool IsCompleted { get; set; }
        public DateTime StartedAt { get; set; } = DateTime.UtcNow;
        public DateTime? CompletedAt { get; set; }
        public DateTime LastActivityAt { get; set; } = DateTime.UtcNow;
    }

    public class ConversationalStep
    {
        public string FieldKey { get; set; }
        public string Label { get; set; }
        public string Type { get; set; }
        public bool IsRequired { get; set; }
        public List<ConversationalOption> Options { get; set; } = new List<ConversationalOption>();
        public string Placeholder { get; set; }
        public string HelpText { get; set; }
    }

    public class ConversationalOption
    {
        public string Value { get; set; }
        public string Label { get; set; }
    }

    public class ConversationalAnswer
    {
        public string SessionId { get; set; }
        public string FieldKey { get; set; }
        public object Value { get; set; }
    }

    public class ConversationalProgress
    {
        public int TotalSteps { get; set; }
        public int CurrentStepIndex { get; set; }
        public int CompletedSteps { get; set; }
        public double PercentComplete => TotalSteps == 0 ? 0 : (CompletedSteps * 100.0 / TotalSteps);
        public bool IsCompleted { get; set; }
    }
}
