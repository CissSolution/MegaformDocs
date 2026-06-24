using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Conversion
{
    /// <summary>
    /// Tracks partial form submissions and abandonment.
    /// Hosts call TrackActivityAsync from client events; recovery is detected on full submission.
    /// </summary>
    public interface IFormAbandonmentService
    {
        Task TrackActivityAsync(FormAbandonmentEvent activity, CancellationToken cancellationToken = default);
        Task MarkRecoveredAsync(string sessionId, CancellationToken cancellationToken = default);
        Task<FormAbandonmentSummary> GetSummaryAsync(int formId, CancellationToken cancellationToken = default);
        Task<IReadOnlyList<FormAbandonmentEvent>> GetAbandonedSessionsAsync(int formId, int? maxAgeMinutes = null, CancellationToken cancellationToken = default);
    }
}
