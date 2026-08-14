using System.Collections.Generic;
using MegaForm.Core.Services.TypedSubmission;

namespace MegaForm.Core.Interfaces
{
    /// <summary>
    /// OPTIONAL batch-read capability for <see cref="ISubmissionDataStore"/> implementations.
    ///
    /// Kept as a separate interface (instead of a new member on ISubmissionDataStore) so hosts
    /// and packages built against an older Core keep loading: callers probe with
    /// <c>_typedStore as ISubmissionDataBatchReader</c> and fall back to the per-record path
    /// when the host store does not implement it yet. net472 has no default interface members,
    /// and adding a member to ISubmissionDataStore would TypeLoadException every host DLL that
    /// was compiled against the old interface until it is recompiled and redeployed.
    ///
    /// Contract: one round trip per table for the whole id set (no per-submission queries).
    /// Return one entry per submission that HAS typed field rows — a missing key must mean
    /// "no typed fields", exactly what <c>ISubmissionDataStore.HasFields(id) == false</c> means.
    /// Each returned document must populate Data the same way GetData does.
    /// </summary>
    public interface ISubmissionDataBatchReader
    {
        /// <summary>
        /// Loads typed documents for many submissions at once. Implementations must not throw
        /// for unknown ids — simply omit them from the result.
        /// </summary>
        IDictionary<int, SubmissionDataDocument> GetDataMany(IReadOnlyCollection<int> submissionIds);
    }
}
