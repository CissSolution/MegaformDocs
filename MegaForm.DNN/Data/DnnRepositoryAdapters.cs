using System;
using System.Collections.Generic;
using System.Linq;
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
    public class DnnSubmissionRepositoryAdapter : ISubmissionRepository, ISubmissionTypedQueryRepository, ISubmissionOwnerFilterableRepository
    {
        public int Insert(SubmissionInfo sub) => FormRepository.InsertSubmission(sub);
        public SubmissionInfo Get(int submissionId) => FormRepository.GetSubmission(submissionId);
        public List<SubmissionValueInfo> GetValues(int submissionId) => new List<SubmissionValueInfo>();
        public (List<SubmissionInfo> Items, int TotalCount) List(int formId,
            string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null,
            int pageIndex = 0, int pageSize = 50) =>
            FormRepository.ListSubmissions(formId, status, search, dateFrom, dateTo, pageIndex, pageSize);
        public (List<SubmissionInfo> Items, int TotalCount) ListTyped(SubmissionListQuery query) =>
            FormRepository.ListSubmissionsTyped(query);
        public (List<SubmissionInfo> Items, int TotalCount) ListOwnedBy(int formId, int userId,
            string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null,
            int pageIndex = 0, int pageSize = 50) =>
            FormRepository.ListSubmissionsOwnedBy(formId, userId, status, search, dateFrom, dateTo, pageIndex, pageSize);
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
        // App foundation
        public List<string> GetAppScopes(int portalId) =>
            FormRepository.ListAppDefinitions(portalId)
                .Where(a => !string.IsNullOrWhiteSpace(a.AppScope))
                .Select(a => a.AppScope)
                .Concat(FormRepository.GetAppScopes(portalId))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(s => s)
                .ToList();

        public List<AppDefinitionInfo> ListAppDefinitions(int portalId, string appScope = null) =>
            FormRepository.ListAppDefinitions(portalId, appScope);

        public AppDefinitionInfo GetAppDefinition(int portalId, string appKey) =>
            FormRepository.GetAppDefinition(portalId, appKey);

        public int SaveAppDefinition(AppDefinitionInfo app) =>
            FormRepository.SaveAppDefinition(app);

        public void DeleteAppDefinition(int appId) =>
            FormRepository.DeleteAppDefinition(appId);

        public List<AppQueryDefinitionInfo> ListAppQueries(int appId) =>
            FormRepository.ListAppQueries(appId);

        public AppQueryDefinitionInfo GetAppQuery(int appId, string queryKey) =>
            FormRepository.GetAppQuery(appId, queryKey);

        public int SaveAppQuery(AppQueryDefinitionInfo query) =>
            FormRepository.SaveAppQuery(query);

        public void DeleteAppQuery(int queryId) =>
            FormRepository.DeleteAppQuery(queryId);

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
