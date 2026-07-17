using System.Collections.Generic;
using MegaForm.Core.Models;

namespace MegaForm.Core.Interfaces
{
    /// <summary>
    /// Optional platform-specific source for legacy submissions that need backfill.
    /// Hosts implement this when they want cross-form or filtered backfill beyond what
    /// ISubmissionRepository.List(formId) provides.
    /// </summary>
    public interface ILegacySubmissionSource
    {
        /// <summary>
        /// Returns submissions that still need typed row backfill.
        /// </summary>
        /// <param name="formId">Optional form filter. Null means all forms.</param>
        /// <param name="batchSize">Maximum rows to return.</param>
        /// <param name="skip">Rows to skip for paging.</param>
        List<SubmissionInfo> GetSubmissionsNeedingBackfill(int? formId, int batchSize, int skip);
    }
}
