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
        /// <summary>
        /// True when this host reconstructs the submission data dictionary from typed rows on read
        /// (e.g. Oqtane's EfSubmissionRepository.HydrateDataJson). Only then is it safe for the submit
        /// pipeline to collapse the legacy MF_Submissions.DataJson to "{}". Hosts that still read
        /// DataJson directly (DNN today) MUST return false — the typed rows are written in parallel and
        /// DataJson stays the runtime source of truth until their readers are switched.
        /// </summary>
        bool SupportsDataJsonCollapse { get; }

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
