using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;

namespace MegaForm.DNN.Data
{
    /// <summary>
    /// Adapter: wraps static FormRepository -> IFormRepository.
    /// FormRepository is a partial class (FormRepository.cs + Phase2Repository.cs).
    /// </summary>
    public class DnnFormRepositoryAdapter : IFormRepository
    {
        public FormInfo GetForm(int formId) => FormRepository.GetForm(formId);
        public List<FormInfo> GetFormsByModule(int moduleId) => FormRepository.GetFormsByModule(moduleId);
        public List<FormInfo> ListForms(int portalId, string status = null, string search = null,
            int pageIndex = 0, int pageSize = 20)
        {
            // [PageSizeZeroFix v20260518-08] Core callers (Business Starters) use
            // pageSize=0 to mean "no limit" (matches EF Take(0) semantics on
            // Oqtane). DNN's stored proc usp_MF_Form_List drives a
            // FETCH NEXT @PageSize ROWS ONLY clause that SQL Server rejects
            // when value is 0 ("The number of rows provided for a FETCH clause
            // must be greater than zero."). Clamp to a generous upper bound here.
            if (pageSize <= 0) pageSize = 1000;
            return FormRepository.ListForms(portalId, status, search, pageIndex, pageSize);
        }
        public int SaveForm(FormInfo form) => FormRepository.SaveForm(form);
        public void DeleteForm(int formId) => FormRepository.DeleteForm(formId);
        public FormStatsInfo GetFormStats(int formId) => FormRepository.GetFormStats(formId);

        public int DuplicateForm(int formId, int userId)
        {
            var form = FormRepository.GetForm(formId);
            if (form == null) return 0;
            form.FormId = 0;
            form.Title = form.Title + " (Copy)";
            form.CreatedByUserId = userId;
            form.CreatedOnUtc = DateTime.UtcNow;
            form.Status = "Draft";
            return FormRepository.SaveForm(form);
        }
    }

    /// <summary>Adapter: wraps static FormRepository -> ISubmissionRepository.</summary>
    public class DnnSubmissionRepositoryAdapter : ISubmissionRepository
    {
        public int Insert(SubmissionInfo sub) => FormRepository.InsertSubmission(sub);
        public SubmissionInfo Get(int submissionId) => FormRepository.GetSubmission(submissionId);
        public List<SubmissionValueInfo> GetValues(int submissionId) => new List<SubmissionValueInfo>();
        public (List<SubmissionInfo> Items, int TotalCount) List(int formId,
            string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null,
            int pageIndex = 0, int pageSize = 50) =>
            FormRepository.ListSubmissions(formId, status, search, dateFrom, dateTo, pageIndex, pageSize);
        public void UpdateStatus(int submissionId, string status) => FormRepository.UpdateSubmissionStatus(submissionId, status);
        public void UpdateData(int submissionId, string dataJson) => FormRepository.UpdateSubmissionData(submissionId, dataJson);
        public void Delete(int submissionId) => FormRepository.DeleteSubmission(submissionId);

        public void BulkDelete(int formId, int[] submissionIds)
        {
            if (submissionIds == null) return;
            foreach (var id in submissionIds) FormRepository.DeleteSubmission(id);
        }

        public void InsertValues(int submissionId, List<SubmissionValueInfo> values)
        {
            // DNN stores data as JSON in SubmissionInfo.DataJson - no-op here
        }
    }

    /// <summary>Adapter: wraps static FormRepository -> IDraftRepository.</summary>
    public class DnnDraftRepositoryAdapter : IDraftRepository
    {
        public int SaveDraft(SavedDraftInfo draft) => FormRepository.SaveDraft(draft);
        public SavedDraftInfo GetDraft(string resumeToken) => FormRepository.GetDraft(resumeToken);
        public void DeleteDraft(string resumeToken) => FormRepository.DeleteDraft(resumeToken);
        public void CleanExpiredDrafts() { /* TODO: DELETE FROM MF_SavedDrafts WHERE ExpiresOnUtc < GETUTCDATE() */ }
    }

    /// <summary>
    /// Adapter: wraps static FormRepository (partial) -> IPhase2Repository.
    /// Phase2Repository.cs is a partial class of FormRepository, so all methods
    /// are accessed via FormRepository.XXX.
    /// </summary>
    public class DnnPhase2RepositoryAdapter : IPhase2Repository
    {
        // Temporary bridge until DNN gets canonical MF_Apps / MF_AppQueries tables.
        private static int _nextAppId = 0;
        private static int _nextQueryId = 0;
        private static readonly ConcurrentDictionary<int, AppDefinitionInfo> _apps = new ConcurrentDictionary<int, AppDefinitionInfo>();
        private static readonly ConcurrentDictionary<int, AppQueryDefinitionInfo> _queries = new ConcurrentDictionary<int, AppQueryDefinitionInfo>();

        // App foundation
        public List<string> GetAppScopes(int portalId) =>
            _apps.Values
                .Where(a => a.PortalId == portalId && !string.IsNullOrWhiteSpace(a.AppScope))
                .Select(a => a.AppScope)
                .Concat(FormRepository.GetAppScopes(portalId))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(s => s)
                .ToList();

        public List<AppDefinitionInfo> ListAppDefinitions(int portalId, string appScope = null)
        {
            var query = _apps.Values.Where(a => a.PortalId == portalId);
            if (!string.IsNullOrWhiteSpace(appScope))
                query = query.Where(a => string.Equals(a.AppScope, appScope.Trim(), StringComparison.OrdinalIgnoreCase));

            return query
                .OrderBy(a => a.SortOrder)
                .ThenBy(a => a.AppName)
                .ToList();
        }

        public AppDefinitionInfo GetAppDefinition(int portalId, string appKey) =>
            _apps.Values.FirstOrDefault(a =>
                a.PortalId == portalId &&
                string.Equals(a.AppKey, appKey ?? string.Empty, StringComparison.OrdinalIgnoreCase));

        public int SaveAppDefinition(AppDefinitionInfo app)
        {
            if (app == null) return 0;
            if (app.AppId <= 0)
            {
                app.AppId = Interlocked.Increment(ref _nextAppId);
                if (app.CreatedOnUtc == default(DateTime)) app.CreatedOnUtc = DateTime.UtcNow;
            }
            app.ModifiedOnUtc = DateTime.UtcNow;
            _apps[app.AppId] = app;
            return app.AppId;
        }

        public void DeleteAppDefinition(int appId)
        {
            _apps.TryRemove(appId, out _);
            foreach (var query in _queries.Values.Where(q => q.AppId == appId).ToList())
                _queries.TryRemove(query.QueryId, out _);
        }

        public List<AppQueryDefinitionInfo> ListAppQueries(int appId) =>
            _queries.Values
                .Where(q => q.AppId == appId)
                .OrderBy(q => q.SortOrder)
                .ThenBy(q => q.QueryName)
                .ToList();

        public AppQueryDefinitionInfo GetAppQuery(int appId, string queryKey) =>
            _queries.Values.FirstOrDefault(q =>
                q.AppId == appId &&
                string.Equals(q.QueryKey, queryKey ?? string.Empty, StringComparison.OrdinalIgnoreCase));

        public int SaveAppQuery(AppQueryDefinitionInfo query)
        {
            if (query == null) return 0;
            if (query.QueryId <= 0)
            {
                query.QueryId = Interlocked.Increment(ref _nextQueryId);
                if (query.CreatedOnUtc == default(DateTime)) query.CreatedOnUtc = DateTime.UtcNow;
            }
            query.ModifiedOnUtc = DateTime.UtcNow;
            _queries[query.QueryId] = query;
            return query.QueryId;
        }

        public void DeleteAppQuery(int queryId) => _queries.TryRemove(queryId, out _);

        // Views
        public List<FormViewInfo> GetFormViews(int formId) => FormRepository.GetFormViews(formId);
        public int SaveFormView(FormViewInfo view) => FormRepository.SaveFormView(view);
        public void DeleteFormView(int viewId) => FormRepository.DeleteFormView(viewId);

        // Relations
        public List<FormRelationInfo> GetFormRelations(int formId) => FormRepository.GetFormRelations(formId);
        public int SaveFormRelation(FormRelationInfo relation) => FormRepository.SaveFormRelation(relation);
        public void DeleteFormRelation(int relationId) => FormRepository.DeleteFormRelation(relationId);
        public void LinkSubmissions(int relationId, int parentSubmissionId, int childSubmissionId) =>
            FormRepository.LinkSubmissions(relationId, parentSubmissionId, childSubmissionId);
        public (List<SubmissionInfo> Items, int TotalCount) GetChildSubmissions(
            int parentSubmissionId, int? relationId = null, int page = 1, int pageSize = 50) =>
            FormRepository.GetChildSubmissions(parentSubmissionId, relationId, page, pageSize);

        // Templates
        public List<TemplateInfo> ListTemplates(int portalId, string category = null) => FormRepository.ListTemplates(portalId, category);
        public int SaveTemplate(TemplateInfo template) => FormRepository.SaveTemplate(template);
        public void DeleteTemplate(int portalId, string slug) => FormRepository.DeleteTemplate(portalId, slug);

        // Permissions
        public List<FormPermissionInfo> GetFormPermissions(int formId) => FormRepository.GetFormPermissions(formId);
        public void SaveFormPermissions(int formId, List<FormPermissionInfo> perms) => FormRepository.SaveFormPermissions(formId, perms);

        // Workflows
        public List<WorkflowInfo> GetWorkflows(int formId) => FormRepository.GetWorkflows(formId);
        public int SaveWorkflow(WorkflowInfo wf) => FormRepository.SaveWorkflow(wf);
        public void DeleteWorkflow(int workflowId) => FormRepository.DeleteWorkflow(workflowId);
        public long CreateWorkflowRun(int workflowId, int submissionId) => FormRepository.CreateWorkflowRun(workflowId, submissionId);
        public void CompleteWorkflowRun(long runId, string status, string error) => FormRepository.CompleteWorkflowRun(runId, status, error);
        public void LogWorkflowStep(long runId, string stepId, string stepType, string status, string output, string error) =>
            FormRepository.LogWorkflowStep(runId, stepId, stepType, status, output, error);

        // Audit
        public void InsertAuditLog(AuditLogInfo log) => FormRepository.InsertAuditLog(log);

        // UniqueId
        public long IncrementUniqueId(int formId, string fieldKey, long startValue) =>
            FormRepository.IncrementUniqueId(formId, fieldKey, startValue);
        public long GetUniqueIdCounter(int formId, string fieldKey) =>
            FormRepository.GetUniqueIdCounter(formId, fieldKey);

        // Webhook
        public void InsertWebhookLog(WebhookLogInfo log) => FormRepository.InsertWebhookLog(log);

        // Rate Limit
        public int GetRecentSubmissionCount(string ipAddress, int windowMinutes) => 0; // TODO: implement
        public void InsertRateLimitEntry(string ipAddress, int formId) { } // TODO: implement
    }
}
