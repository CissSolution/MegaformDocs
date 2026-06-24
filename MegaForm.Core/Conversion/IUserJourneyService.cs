using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Conversion
{
    /// <summary>
    /// Records and reports user journey through a form.
    /// </summary>
    public interface IUserJourneyService
    {
        Task RecordStepAsync(UserJourneyStep step, string journeyId, int formId, string sessionId, string userIdentifier, CancellationToken cancellationToken = default);
        Task<UserJourney> GetJourneyAsync(string journeyId, CancellationToken cancellationToken = default);
        Task<UserJourneyReport> BuildReportAsync(int formId, CancellationToken cancellationToken = default);
        Task<IReadOnlyList<UserJourney>> ListJourneysAsync(int formId, int? maxAgeHours = null, CancellationToken cancellationToken = default);
    }
}
