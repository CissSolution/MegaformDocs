using System;
using System.Collections.Generic;

namespace MegaForm.Core.Conversion
{
    public class FormAbandonmentEvent
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public int FormId { get; set; }
        public string SessionId { get; set; }
        public string UserIdentifier { get; set; }
        public string Email { get; set; }
        public Dictionary<string, object> PartialValues { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public int LastCompletedStep { get; set; }
        public DateTime StartedAt { get; set; } = DateTime.UtcNow;
        public DateTime LastActivityAt { get; set; } = DateTime.UtcNow;
        public bool Recovered { get; set; }
        public DateTime? RecoveredAt { get; set; }
    }

    public class FormAbandonmentSummary
    {
        public int FormId { get; set; }
        public int TotalSessions { get; set; }
        public int AbandonedSessions { get; set; }
        public int RecoveredSessions { get; set; }
        public double AbandonmentRate => TotalSessions == 0 ? 0 : (AbandonedSessions * 100.0 / TotalSessions);
        public double RecoveryRate => AbandonedSessions == 0 ? 0 : (RecoveredSessions * 100.0 / AbandonedSessions);
    }
}
