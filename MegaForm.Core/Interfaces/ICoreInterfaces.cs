using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using MegaForm.Core.Models;

// Alias to avoid System.IO.FileInfo vs MegaForm.Core.Models.FileInfo conflict
using MfFileInfo = MegaForm.Core.Models.FileInfo;

namespace MegaForm.Core.Interfaces
{
    // =========================================================
    //  REPOSITORY INTERFACES (Data Access Layer)
    //  DNN: ADO.NET/Dapper  |  Oqtane: EF Core  |  .NET 10: EF Core
    // =========================================================

    public interface IFormRepository
    {
        FormInfo GetForm(int formId);
        List<FormInfo> GetFormsByModule(int moduleId);
        List<FormInfo> ListForms(int portalId, string status = null, string search = null,
            int pageIndex = 0, int pageSize = 20);
        int SaveForm(FormInfo form);
        void DeleteForm(int formId);
        FormStatsInfo GetFormStats(int formId);
        int DuplicateForm(int formId, int userId);
    }

    public interface ISubmissionRepository
    {
        int Insert(SubmissionInfo sub);
        SubmissionInfo Get(int submissionId);
        List<SubmissionValueInfo> GetValues(int submissionId);
        (List<SubmissionInfo> Items, int TotalCount) List(int formId,
            string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null,
            int pageIndex = 0, int pageSize = 50);
        void UpdateStatus(int submissionId, string status);
        void UpdateData(int submissionId, string dataJson);
        void Delete(int submissionId);
        void BulkDelete(int formId, int[] submissionIds);
        void InsertValues(int submissionId, List<SubmissionValueInfo> values);
    }

    public interface IDraftRepository
    {
        int SaveDraft(SavedDraftInfo draft);
        SavedDraftInfo GetDraft(string resumeToken);
        void DeleteDraft(string resumeToken);
        void CleanExpiredDrafts();
    }

    public interface IFileRepository
    {
        int InsertFile(MfFileInfo file);
        List<MfFileInfo> GetBySubmission(int submissionId);
        void DeleteBySubmission(int submissionId);
    }

    public interface IDocumentRepository
    {
        DocumentInfo GetDocument(int documentId);
        DocumentInfo GetDocumentBySlug(int portalId, string slug, string appScope = null);
        (List<DocumentInfo> Items, int TotalCount) ListDocuments(int portalId,
            string appScope = null, string status = null, string search = null,
            int pageIndex = 0, int pageSize = 50);
        int SaveDocument(DocumentInfo document);

        DocumentRevisionInfo GetRevision(int revisionId);
        DocumentRevisionInfo GetRevisionBySubmission(int submissionId);
        DocumentRevisionInfo GetLatestRevision(int documentId);
        DocumentRevisionInfo GetPublishedRevision(int documentId);
        List<DocumentRevisionInfo> ListRevisions(int documentId);
        int SaveRevision(DocumentRevisionInfo revision);
        void PublishRevision(int revisionId, int? publishedByUserId);

        DocumentMetadataInfo GetMetadata(int documentId);
        void SaveMetadata(DocumentMetadataInfo metadata);

        void SaveAlias(DocumentAliasInfo alias);
        List<DocumentAliasInfo> ListAliases(int documentId);

        List<DocumentAssignmentInfo> ListAssignments(int documentId);
        int SaveAssignment(DocumentAssignmentInfo assignment);

        List<DocumentCommentInfo> ListComments(int documentId, int? revisionId = null);
        int SaveComment(DocumentCommentInfo comment);

        List<DocumentDirectiveInfo> ListDirectives(int documentId);
        int SaveDirective(DocumentDirectiveInfo directive);
    }

    /// <summary>Phase 2: Views, Templates, Permissions, Workflows data access.</summary>
    public interface IPhase2Repository
    {
        // App foundation
        List<string> GetAppScopes(int portalId);
        List<AppDefinitionInfo> ListAppDefinitions(int portalId, string appScope = null);
        AppDefinitionInfo GetAppDefinition(int portalId, string appKey);
        int SaveAppDefinition(AppDefinitionInfo app);
        void DeleteAppDefinition(int appId);

        List<AppQueryDefinitionInfo> ListAppQueries(int appId);
        AppQueryDefinitionInfo GetAppQuery(int appId, string queryKey);
        int SaveAppQuery(AppQueryDefinitionInfo query);
        void DeleteAppQuery(int queryId);

        // Views
        List<FormViewInfo> GetFormViews(int formId);
        int SaveFormView(FormViewInfo view);
        void DeleteFormView(int viewId);

        // Relations
        List<FormRelationInfo> GetFormRelations(int formId);
        int SaveFormRelation(FormRelationInfo relation);
        void DeleteFormRelation(int relationId);
        void LinkSubmissions(int relationId, int parentSubmissionId, int childSubmissionId);
        (List<SubmissionInfo> Items, int TotalCount) GetChildSubmissions(
            int parentSubmissionId, int? relationId = null, int page = 1, int pageSize = 50);

        // Templates
        List<TemplateInfo> ListTemplates(int portalId, string category = null);
        int SaveTemplate(TemplateInfo template);
        void DeleteTemplate(int portalId, string slug);

        // Permissions
        List<FormPermissionInfo> GetFormPermissions(int formId);
        void SaveFormPermissions(int formId, List<FormPermissionInfo> perms);

        // Workflows
        List<WorkflowInfo> GetWorkflows(int formId);
        int SaveWorkflow(WorkflowInfo wf);
        void DeleteWorkflow(int workflowId);
        long CreateWorkflowRun(int workflowId, int submissionId);
        void CompleteWorkflowRun(long runId, string status, string error);
        void LogWorkflowStep(long runId, string stepId, string stepType, string status, string output, string error);

        // Audit
        void InsertAuditLog(AuditLogInfo log);

        // UniqueId
        long IncrementUniqueId(int formId, string fieldKey, long startValue);
        long GetUniqueIdCounter(int formId, string fieldKey);

        // Webhook
        void InsertWebhookLog(WebhookLogInfo log);

        // Rate Limit
        int GetRecentSubmissionCount(string ipAddress, int windowMinutes);
        void InsertRateLimitEntry(string ipAddress, int formId);
    }

    // =========================================================
    //  SERVICE INTERFACES (Business Logic Layer)
    // =========================================================

    /// <summary>
    /// Email sending — platform provides the implementation.
    /// DNN: DotNetNuke.Services.Mail | Oqtane: IMailService | .NET 10: SmtpClient/SendGrid
    /// </summary>
    public interface IEmailSender
    {
        void Send(string to, string subject, string htmlBody, string from = null, string replyTo = null);
        string GetHostEmail();
    }

    /// <summary>
    /// Logging abstraction — platform provides implementation.
    /// DNN: EventLog | Oqtane: ILogManager | .NET 10: ILogger
    /// </summary>
    public interface ILogService
    {
        void LogInfo(string source, string message);
        void LogWarning(string source, string message);
        void LogError(string source, string message, Exception ex = null);
    }

    /// <summary>
    /// File storage abstraction.
    /// DNN: DNN file system | Oqtane: Oqtane file manager | .NET 10: wwwroot/storage
    /// </summary>
    public interface IStorageService
    {
        Task<string> SaveFileAsync(Stream stream, string fileName, string folder);
        Stream GetFile(string filePath);
        void DeleteFile(string filePath);
        string GetFileUrl(string filePath);
    }

    /// <summary>
    /// Platform context: user, permissions, paths.
    /// Each platform creates its own implementation.
    /// </summary>
    public interface IPlatformContext
    {
        int PortalId { get; }
        int ModuleId { get; }
        int UserId { get; }
        string UserName { get; }
        string UserEmail { get; }
        bool IsAuthenticated { get; }
        bool IsAdmin { get; }
        bool HasPermission(string permissionKey);
        string MapPath(string virtualPath);
        string GetSetting(string key);
        string GetConnectionString();
    }

    public interface IPermissionPrincipalCatalogProvider
    {
        List<PermissionPrincipalInfo> GetPrincipals(int portalId, MegaForm.Core.Services.UserContext actor);
    }

    // =========================================================
    //  RESULT MODELS
    // =========================================================

    public class SubmissionResult
    {
        public bool Success { get; set; }
        public int SubmissionId { get; set; }
        public string ErrorMessage { get; set; }
        public bool IsSpam { get; set; }
        public bool IsDuplicate { get; set; }
    }

    public class WorkflowRunResult
    {
        public long RunId { get; set; }
        public string Status { get; set; }  // completed, failed, waiting
        public string Error { get; set; }
        public List<StepRunResult> StepResults { get; set; } = new List<StepRunResult>();
    }

    public class StepRunResult
    {
        public string StepId { get; set; }
        public string StepType { get; set; }
        public string Status { get; set; }
        public string Output { get; set; }
        public string Error { get; set; }
    }
    // =========================================================
    //  MODULE SETTINGS INTERFACE
    //  DNN: ModuleController | Oqtane: ISettingService | ASP.NET: IConfiguration
    // =========================================================

    /// <summary>
    /// Lưu/đọc settings theo moduleId — mỗi platform implement khác nhau.
    /// DNN    : DotNetNuke.Entities.Modules.ModuleController.UpdateModuleSetting()
    /// Oqtane : Oqtane.Services.ISettingService
    /// ASP.NET: IConfiguration / database key-value store
    /// </summary>
    public interface IModuleSettingsService
    {
        string GetSetting(int moduleId, string key, string defaultValue = "");
        void SetSetting(int moduleId, string key, string value);
    }

    /// <summary>
    /// Live Style Editor settings — platform-agnostic.
    /// Gọi qua IModuleSettingsService, không phụ thuộc DNN.
    /// </summary>
    public class StyleSettings
    {
        public string ThemeClass  { get; set; } = "";
        public string CssOverride { get; set; } = "";
        public string ExtraClass  { get; set; } = "";
    }

}
