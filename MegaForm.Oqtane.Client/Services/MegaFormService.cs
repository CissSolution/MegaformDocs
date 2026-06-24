using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Oqtane.Modules;
using Oqtane.Services;
using Oqtane.Shared;
using MegaForm.Oqtane.Shared.Models;

namespace MegaForm.Oqtane.Client.Services
{
    public class MegaFormService : ServiceBase, IMegaFormService, IService
    {
        public MegaFormService(HttpClient http, SiteState siteState) : base(http, siteState) { }

        private string ApiUrl => CreateApiUrl("MegaForm");

        // [OQAuthCtx v20260501-08] authModuleId carries the calling-page module
        // so the [Authorize(Policy="ViewModule")] policy can resolve even when
        // the query intentionally targets site-wide data (moduleId=0). Without
        // this, Blazor service-side calls return 403 → empty result, which is
        // why the Dashboard module showed "No forms yet" while the browser
        // (which has page cookies) succeeded against the same endpoint.
        private string BuildAuthorizedUrl(string url, int moduleId = 0, int siteId = 0, int authModuleId = 0)
        {
            var auth = new Dictionary<string, int>();
            var effectiveModule = authModuleId > 0 ? authModuleId : moduleId;
            if (effectiveModule > 0)
            {
                auth[EntityNames.Module] = effectiveModule;
            }
            if (siteId > 0)
            {
                auth[EntityNames.Site] = siteId;
            }
            return auth.Count > 0 ? CreateAuthorizationPolicyUrl(url, auth) : url;
        }

        // ── Forms ──
        public async Task<FormDto> GetFormAsync(int formId, int moduleId = 0, int siteId = 0)
            => await GetJsonAsync<FormDto>(BuildAuthorizedUrl($"{ApiUrl}/Form/{formId}", moduleId, siteId));

        public async Task<List<FormDto>> ListFormsAsync(int moduleId = 0, int siteId = 0, int authModuleId = 0)
            => await GetJsonAsync<List<FormDto>>(BuildAuthorizedUrl($"{ApiUrl}/Form/List?moduleId={moduleId}&siteId={siteId}", moduleId, siteId, authModuleId));

        // [OQDashLockedIds v20260502-03] Returns server-authoritative locked
        // form ids stored in App_Data/MegaForm/locked-forms.json.
        public async Task<List<int>> GetLockedFormIdsAsync(int moduleId = 0, int siteId = 0)
        {
            try
            {
                var raw = await GetJsonAsync<LockedIdsResponse>(BuildAuthorizedUrl($"{ApiUrl}/Form/LockedIds", moduleId, siteId, moduleId));
                return raw?.LockedIds ?? new List<int>();
            }
            catch { return new List<int>(); }
        }

        private class LockedIdsResponse
        {
            public List<int> LockedIds { get; set; }
        }

        public async Task<object> SaveFormAsync(FormDto form)
            => await PostJsonAsync<object>(ApiUrl + "/Form", form);

        public async Task DeleteFormAsync(int formId)
            => await DeleteAsync($"{ApiUrl}/Form/{formId}");

        // ── Submissions ──
        public async Task<PagedResult<SubmissionDto>> GetSubmissionsAsync(int formId, int page = 0, int pageSize = 25)
            => await GetJsonAsync<PagedResult<SubmissionDto>>($"{ApiUrl}/Submissions?formId={formId}&page={page}&pageSize={pageSize}");

        public async Task<SubmissionDto> GetSubmissionAsync(int submissionId)
            => await GetJsonAsync<SubmissionDto>($"{ApiUrl}/Submissions/{submissionId}");

        public async Task DeleteSubmissionAsync(int submissionId)
            => await DeleteAsync($"{ApiUrl}/Submissions/{submissionId}");

        // ── Schema (public form rendering) ──
        public async Task<SchemaResponse> GetSchemaAsync(int formId)
            => await GetJsonAsync<SchemaResponse>($"{ApiUrl}/Schema/{formId}");

        public async Task<SubmitResponse> SubmitAsync(SubmitRequest request)
            => await PostJsonAsync<SubmitRequest, SubmitResponse>(ApiUrl + "/Submit", request);

        // ── Module Config ──
        public async Task<ModuleConfigResponse> GetModuleConfigAsync(int moduleId, int siteId = 0)
            => await GetJsonAsync<ModuleConfigResponse>(BuildAuthorizedUrl($"{ApiUrl}/ModuleConfig/{moduleId}", moduleId, siteId));

        public async Task SaveModuleConfigAsync(ModuleConfigDto config, int siteId = 0)
            => await PostJsonAsync(BuildAuthorizedUrl(ApiUrl + "/ModuleConfig", config?.ModuleId ?? 0, siteId), config);

        public async Task<StarterAppSetupResult> SetupLeaveRequestStarterAsync(int moduleId = 0, int siteId = 0, string homeUrl = null)
            => await PostJsonAsync<object, StarterAppSetupResult>(BuildAuthorizedUrl($"{ApiUrl}/Starter/LeaveRequest/Setup", moduleId, siteId, moduleId), new { moduleId, homeUrl = homeUrl ?? string.Empty });

        public async Task<StarterAppSetupResult> SetupProposalStarterAsync(int moduleId = 0, int siteId = 0, string homeUrl = null)
            => await PostJsonAsync<object, StarterAppSetupResult>(BuildAuthorizedUrl($"{ApiUrl}/Starter/Proposal/Setup", moduleId, siteId, moduleId), new { moduleId, homeUrl = homeUrl ?? string.Empty });

        public async Task<StarterAppSetupResult> SetupDocumentExchangeStarterAsync(int moduleId = 0, int siteId = 0, string homeUrl = null)
            => await PostJsonAsync<object, StarterAppSetupResult>(BuildAuthorizedUrl($"{ApiUrl}/Starter/DocumentExchange/Setup", moduleId, siteId, moduleId), new { moduleId, homeUrl = homeUrl ?? string.Empty });
    }
}
