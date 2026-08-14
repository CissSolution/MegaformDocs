using System.Collections.Generic;
using MegaForm.Core.Models;

namespace MegaForm.Core.Interfaces
{
    /// <summary>
    /// Optional repository capability for filtering submission fields in the typed value tables.
    /// Kept separate from ISubmissionRepository so existing host binaries remain loadable.
    /// Implementations must apply filters before TotalCount and paging.
    /// </summary>
    public interface ISubmissionTypedQueryRepository
    {
        (List<SubmissionInfo> Items, int TotalCount) ListTyped(SubmissionListQuery query);
    }
}
