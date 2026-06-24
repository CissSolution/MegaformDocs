using System.Collections.Generic;
using System.Threading.Tasks;
using MegaForm.Oqtane.Shared.Models;

namespace MegaForm.Oqtane.Client.Services
{
    public interface IMegaFormService
    {
        // Forms
        Task<FormDto>          GetFormAsync(int formId, int moduleId = 0, int siteId = 0);
        Task<List<FormDto>>    ListFormsAsync(int moduleId = 0, int siteId = 0, int authModuleId = 0);
        // [OQDashLockedIds v20260502-03] Fetch the server-authoritative locked
        // form id list so the Dashboard payload renders the Protected Forms
        // section after a lock+reload cycle.
        Task<List<int>>        GetLockedFormIdsAsync(int moduleId = 0, int siteId = 0);
        Task<object>           SaveFormAsync(FormDto form);
        Task                   DeleteFormAsync(int formId);

        // Submissions
        Task<PagedResult<SubmissionDto>> GetSubmissionsAsync(int formId, int page = 0, int pageSize = 25);
        Task<SubmissionDto>    GetSubmissionAsync(int submissionId);
        Task                   DeleteSubmissionAsync(int submissionId);

        // Schema (public)
        Task<SchemaResponse>   GetSchemaAsync(int formId);
        Task<SubmitResponse>   SubmitAsync(SubmitRequest request);

        // Module Config
        Task<ModuleConfigResponse> GetModuleConfigAsync(int moduleId, int siteId = 0);
        Task                   SaveModuleConfigAsync(ModuleConfigDto config, int siteId = 0);

        // Business App Starters
        Task<StarterAppSetupResult> SetupLeaveRequestStarterAsync(int moduleId = 0, int siteId = 0, string homeUrl = null);
        Task<StarterAppSetupResult> SetupProposalStarterAsync(int moduleId = 0, int siteId = 0, string homeUrl = null);
        Task<StarterAppSetupResult> SetupDocumentExchangeStarterAsync(int moduleId = 0, int siteId = 0, string homeUrl = null);
    }
}
