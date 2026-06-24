using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Conversion
{
    /// <summary>
    /// Scores and tags leads based on form submission values.
    /// </summary>
    public interface ILeadFormService
    {
        Task<LeadScoreResult> ScoreAsync(LeadFormProfile profile, IReadOnlyDictionary<string, object> submissionValues, CancellationToken cancellationToken = default);
        Task<IReadOnlyList<LeadFormProfile>> ListProfilesAsync(int? formId = null, CancellationToken cancellationToken = default);
        Task SaveProfileAsync(LeadFormProfile profile, CancellationToken cancellationToken = default);
        Task DeleteProfileAsync(string id, CancellationToken cancellationToken = default);
    }
}
