using System.Collections.Generic;
using MegaForm.Core.Models;
using MegaForm.Core.Services.TypedSubmission;

namespace MegaForm.Core.Interfaces
{
    /// <summary>
    /// Platform-agnostic contract for reading and writing typed submission field data.
    /// Hosts implement this over their own storage (EF Core, ADO.NET, stored procedures, etc.).
    /// </summary>
    public interface ISubmissionDataStore
    {
        SubmissionDataDocument GetData(int submissionId);
        IReadOnlyList<SubmissionFieldRecord> GetFields(int submissionId);

        IReadOnlyList<SubmissionValueStringRecord> GetStringValues(long submissionFieldId);
        IReadOnlyList<SubmissionValueLongTextRecord> GetLongTextValues(long submissionFieldId);
        IReadOnlyList<SubmissionValueNumberRecord> GetNumberValues(long submissionFieldId);
        IReadOnlyList<SubmissionValueDateRecord> GetDateValues(long submissionFieldId);
        IReadOnlyList<SubmissionValueBooleanRecord> GetBooleanValues(long submissionFieldId);
        IReadOnlyList<SubmissionValueJsonRecord> GetJsonValues(long submissionFieldId);

        void InsertFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields);
        void ReplaceFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields);
        void DeleteFields(int submissionId);

        bool HasFields(int submissionId);
    }
}
