using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;

namespace MegaForm.Web.Data
{
    public partial class MegaFormDbContext : DbContext
    {
        public MegaFormDbContext(DbContextOptions<MegaFormDbContext> options) : base(options) { }

        /// <summary>
        /// Text column type — mỗi provider dùng kiểu khác nhau:
        /// SqlServer: nvarchar(max) | SQLite: TEXT | PostgreSQL: text
        /// </summary>
        private string TextType => Database.ProviderName switch
        {
            var p when p != null && p.Contains("Sqlite")     => "TEXT",
            var p when p != null && p.Contains("Npgsql")     => "text",
            var p when p != null && p.Contains("MySql")      => "longtext",
            _                                                  => "nvarchar(max)"
        };
        public DbSet<FormInfo>            Forms            { get; set; }
        public DbSet<SubmissionInfo>      Submissions      { get; set; }
        public DbSet<SubmissionValueInfo> SubmissionValues { get; set; }
        public DbSet<Core.Models.FileInfo> Files           { get; set; }
        public DbSet<SavedDraftInfo>      Drafts           { get; set; }
        public DbSet<WebhookLogInfo>      WebhookLogs      { get; set; }
        public DbSet<ModuleSettingRow>    ModuleSettings   { get; set; }
        public DbSet<WorkflowExecutionRow> WorkflowExecutions { get; set; }
        public DbSet<WebUserRow>          WebUsers         { get; set; }
        public DbSet<WebRoleRow>          WebRoles         { get; set; }
        public DbSet<WebUserRoleRow>      WebUserRoles     { get; set; }
        public DbSet<DocumentInfo>        Documents        { get; set; }
        public DbSet<DocumentRevisionInfo> DocumentRevisions { get; set; }
        public DbSet<DocumentMetadataInfo> DocumentMetadata { get; set; }
        public DbSet<DocumentAliasInfo>   DocumentAliases  { get; set; }
        public DbSet<DocumentAssignmentInfo> DocumentAssignments { get; set; }
        public DbSet<DocumentCommentInfo> DocumentComments { get; set; }
        public DbSet<DocumentDirectiveInfo> DocumentDirectives { get; set; }
        public DbSet<AiKnowledgeEntry>    AiKnowledgeEntries { get; set; }
        public DbSet<AiKnowledgeHistory>  AiKnowledgeHistories { get; set; }
        public DbSet<KbTemplate>          KbTemplates      { get; set; }
        public DbSet<KbRule>              KbRules          { get; set; }
        public DbSet<KbFeedback>          KbFeedbacks      { get; set; }
        public DbSet<ReportDefinitionInfo> ReportDefinitions { get; set; }

        protected override void OnModelCreating(ModelBuilder b)
        {
            b.Entity<FormInfo>(e => {
                e.ToTable("MF_Forms"); e.HasKey(x => x.FormId);
                // TEXT columns
                e.Property(x => x.SchemaJson)   .HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.SettingsJson) .HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.ThemeJson)    .HasColumnType(TextType).HasDefaultValue("{}");
                // Optional string columns — default empty string so NOT NULL is never violated
                e.Property(x => x.Title)                   .HasDefaultValue("");
                e.Property(x => x.Description)             .HasDefaultValue("");
                e.Property(x => x.Status)                  .HasDefaultValue("draft");
                e.Property(x => x.SubmitButtonText)        .HasDefaultValue("Submit");
                e.Property(x => x.SuccessMessage)          .HasDefaultValue("");
                e.Property(x => x.RedirectUrl)             .HasDefaultValue("");
                e.Property(x => x.WebhookUrl)              .HasDefaultValue("");
                e.Property(x => x.WebhookSecret)           .HasDefaultValue("");
                e.Property(x => x.WebhookHeaders)          .HasDefaultValue("{}");
                e.Property(x => x.NotifyEmails)            .HasDefaultValue("");
                e.Property(x => x.NotifyTemplate)          .HasDefaultValue("");
                e.Property(x => x.AutoresponderEmailField) .HasDefaultValue("");
                e.Property(x => x.AutoresponderSubject)    .HasDefaultValue("");
                e.Property(x => x.AutoresponderBody)       .HasDefaultValue("");
                e.Property(x => x.AppScope)                .HasDefaultValue("");
                e.Property(x => x.RulesJson)               .HasColumnType(TextType).HasDefaultValue("[]");
                e.Property(x => x.WorkflowJson)            .HasColumnType(TextType).HasDefaultValue("");
            });
            b.Entity<SubmissionInfo>(e => {
                e.ToTable("MF_Submissions"); e.HasKey(x => x.SubmissionId);
                e.HasIndex(x => new { x.FormId, x.SubmittedOnUtc });
                e.HasIndex(x => new { x.FormId, x.Status, x.SubmittedOnUtc });
                e.HasIndex(x => x.SubmittedOnUtc);
                e.HasIndex(x => x.Status);
                e.Property(x => x.DataJson)  .HasColumnType(TextType);
                e.Property(x => x.IpAddress) .HasDefaultValue("");
                e.Property(x => x.UserAgent) .HasDefaultValue("");
                e.Property(x => x.Status)    .HasDefaultValue("new");
            });
            b.Entity<SubmissionValueInfo>(e => {
                e.ToTable("MF_SubmissionValues"); e.HasKey(x => x.ValueId);
                e.HasIndex(x => x.SubmissionId);
                e.HasIndex(x => new { x.SubmissionId, x.FieldKey });
                e.HasIndex(x => new { x.FormId, x.FieldKey });
                e.HasIndex(x => new { x.FormId, x.ValueDate });
                e.Property(x => x.FormId)     .HasDefaultValue(0);
                e.Property(x => x.FieldKey)   .HasDefaultValue("");
                e.Property(x => x.FieldValue) .HasColumnType(TextType).IsRequired(false);
                e.Property(x => x.ValueText)  .HasColumnType(TextType).IsRequired(false);
                e.Property(x => x.ValueNumber).HasColumnType("DECIMAL(18,6)");
            });
            b.Entity<Core.Models.FileInfo>(e => {
                e.ToTable("MF_Files"); e.HasKey(x => x.FileId);
                e.Property(x => x.FieldKey)     .HasDefaultValue("");
                e.Property(x => x.OriginalName) .HasDefaultValue("");
                e.Property(x => x.StoredPath)   .HasDefaultValue("");
                e.Property(x => x.ContentType)  .HasDefaultValue("");
            });
            b.Entity<SavedDraftInfo>(e => {
                e.ToTable("MF_SavedDrafts"); e.HasKey(x => x.DraftId);
                e.Property(x => x.DataJson)    .HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.ResumeToken) .HasDefaultValue("");
                e.Property(x => x.Email)       .HasDefaultValue("");
                e.Property(x => x.IpAddress)   .HasDefaultValue("");
            });
            b.Entity<WebhookLogInfo>(e => {
                e.ToTable("MF_WebhookLog"); e.HasKey(x => x.LogId);
                e.Property(x => x.RequestBody)  .HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.ResponseBody) .HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.WebhookUrl)   .HasDefaultValue("");
            });
            b.Entity<ModuleSettingRow>(e => {
                e.ToTable("MF_ModuleSettings"); e.HasKey(x => x.Id);
                e.HasIndex(x => new { x.ModuleId, x.SettingKey }).IsUnique();
                e.Property(x => x.SettingKey)  .HasDefaultValue("");
                e.Property(x => x.SettingValue).HasDefaultValue("");
            });
            // Phase2
            b.Entity<FormViewInfo>(e => {
                e.ToTable("MF_FormViews"); e.HasKey(x => x.ViewId);
                e.Property(x => x.ConfigJson)    .HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.ViewKey)       .HasDefaultValue("");
                e.Property(x => x.ViewType)      .HasDefaultValue("edit");
                e.Property(x => x.ViewName)      .HasDefaultValue("");
                e.Property(x => x.CustomHtml)    .HasDefaultValue("");
                e.Property(x => x.CustomCss)     .HasDefaultValue("");
                e.Property(x => x.PermissionsJson).HasDefaultValue("{}");
            });
            b.Entity<TemplateInfo>(e => {
                e.ToTable("MF_Templates"); e.HasKey(x => x.TemplateId);
                e.Property(x => x.MetadataJson) .HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.Slug)         .HasDefaultValue("");
                e.Property(x => x.Name)         .HasDefaultValue("");
                e.Property(x => x.Description)  .HasDefaultValue("");
                e.Property(x => x.Category)     .HasDefaultValue("");
                e.Property(x => x.Icon)         .HasDefaultValue("");
                e.Property(x => x.Version)      .HasDefaultValue("1.0");
                e.Property(x => x.Author)       .HasDefaultValue("");
                e.Property(x => x.ThumbnailPath).HasDefaultValue("");
                e.Property(x => x.FolderPath)   .HasDefaultValue("");
                e.Property(x => x.JsScanResult) .HasDefaultValue("");
            });
            b.Entity<FormPermissionInfo>(e => {
                e.ToTable("MF_FormPermissions"); e.HasKey(x => x.PermissionId);
                e.Property(x => x.PrincipalId).HasDefaultValue("");
                e.Property(x => x.RoleName)   .HasDefaultValue("");
            });
            b.Entity<WorkflowInfo>(e => {
                e.ToTable("MF_Workflows"); e.HasKey(x => x.WorkflowId);
                e.Property(x => x.StepsJson)    .HasColumnType(TextType).HasDefaultValue("[]");
                e.Property(x => x.WorkflowName) .HasDefaultValue("");
                e.Property(x => x.Description)  .HasDefaultValue("");
                e.Property(x => x.TriggerType)  .HasDefaultValue("");
                e.Property(x => x.TriggerConfig).HasDefaultValue("{}");
            });
            b.Entity<AuditLogInfo>(e => {
                e.ToTable("MF_AuditLog"); e.HasKey(x => x.LogId);
                e.Property(x => x.Details)    .HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.UserName)   .HasDefaultValue("");
                e.Property(x => x.IpAddress)  .HasDefaultValue("");
                e.Property(x => x.Action)     .HasDefaultValue("");
                e.Property(x => x.EntityType) .HasDefaultValue("");
                e.Property(x => x.Result)     .HasDefaultValue("");
            });
            b.Entity<UniqueIdCounterRow>(e => {
                e.ToTable("MF_UniqueIdCounters"); e.HasKey(x => x.Id);
                e.HasIndex(x => new { x.FormId, x.FieldKey }).IsUnique();
                e.Property(x => x.FieldKey).HasDefaultValue("");
            });
            b.Entity<RateLimitRow>(e => {
                e.ToTable("MF_RateLimits"); e.HasKey(x => x.Id);
                e.Property(x => x.IpAddress).HasDefaultValue("");
            });
            // Workflow Engine v2.0
            b.Entity<WorkflowExecutionRow>(e => {
                e.ToTable("MF_WorkflowExecutions"); e.HasKey(x => x.ExecutionId);
                e.Property(x => x.ContextJson)  .HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.Status)       .HasDefaultValue("running");
                e.Property(x => x.CurrentNodeId).HasDefaultValue("");
                e.Property(x => x.ErrorMessage) .HasDefaultValue("");
            });
            // Web identity provisioning
            b.Entity<WebUserRow>(e => {
                e.ToTable("MF_WebUsers"); e.HasKey(x => x.UserId);
                e.Property(x => x.UserName)    .HasDefaultValue("");
                e.Property(x => x.Email)       .HasDefaultValue("");
                e.Property(x => x.DisplayName) .HasDefaultValue("");
                e.Property(x => x.PasswordHash).HasDefaultValue("");
                e.Property(x => x.SecurityStamp).HasDefaultValue("");
                e.Property(x => x.LastIpAddress).HasDefaultValue("");
                e.Property(x => x.CreatedBy)   .HasDefaultValue("");
                e.Property(x => x.UpdatedBy)   .HasDefaultValue("");
            });
            b.Entity<WebRoleRow>(e => {
                e.ToTable("MF_WebRoles"); e.HasKey(x => x.RoleId);
                e.Property(x => x.RoleName)    .HasDefaultValue("");
                e.Property(x => x.Description) .HasDefaultValue("");
            });
            b.Entity<WebUserRoleRow>(e => {
                e.ToTable("MF_WebUserRoles"); e.HasKey(x => x.Id);
            });
            b.Entity<WorkflowCaseRow>(e => {
                e.ToTable("MF_WorkflowCases"); e.HasKey(x => x.CaseId);
                e.Property(x => x.ExecutionId)      .HasDefaultValue("");
                e.Property(x => x.WorkflowId)       .HasDefaultValue("");
                e.Property(x => x.CurrentNodeId)    .HasDefaultValue("");
                e.Property(x => x.StartedByUserName).HasDefaultValue("");
                e.Property(x => x.ActiveTaskId)     .HasDefaultValue("");
                e.Property(x => x.Outcome)          .HasDefaultValue("");
                e.Property(x => x.LastComment)      .HasDefaultValue("");
            });
            b.Entity<WorkflowTaskRow>(e => {
                e.ToTable("MF_WorkflowTasks"); e.HasKey(x => x.TaskId);
                e.Property(x => x.CaseId)               .HasDefaultValue("");
                e.Property(x => x.ExecutionId)          .HasDefaultValue("");
                e.Property(x => x.NodeId)               .HasDefaultValue("");
                e.Property(x => x.NodeLabel)            .HasDefaultValue("");
                e.Property(x => x.CandidateRolesJson)   .HasColumnType(TextType).HasDefaultValue("[]");
                e.Property(x => x.CandidateUsersJson)   .HasColumnType(TextType).HasDefaultValue("[]");
                e.Property(x => x.AssignedUserName)     .HasDefaultValue("");
                e.Property(x => x.AssignedDisplayName)  .HasDefaultValue("");
                e.Property(x => x.PendingSubmissionStatus)  .HasDefaultValue("pending_approval");
                e.Property(x => x.ApprovedSubmissionStatus) .HasDefaultValue("approved");
                e.Property(x => x.RejectedSubmissionStatus) .HasDefaultValue("rejected");
                e.Property(x => x.Outcome)              .HasDefaultValue("");
                e.Property(x => x.Comment)              .HasDefaultValue("");
            });
            b.Entity<WorkflowTaskActionRow>(e => {
                e.ToTable("MF_WorkflowTaskActions"); e.HasKey(x => x.ActionId);
                e.Property(x => x.TaskId)           .HasDefaultValue("");
                e.Property(x => x.CaseId)           .HasDefaultValue("");
                e.Property(x => x.ExecutionId)      .HasDefaultValue("");
                e.Property(x => x.ActorUserName)    .HasDefaultValue("");
                e.Property(x => x.ActorDisplayName) .HasDefaultValue("");
                e.Property(x => x.TargetUser)       .HasDefaultValue("");
                e.Property(x => x.Outcome)          .HasDefaultValue("");
                e.Property(x => x.Comment)          .HasDefaultValue("");
            });
            b.Entity<AppDefinitionInfo>(e => {
                e.ToTable("MF_AppDefinitions"); e.HasKey(x => x.AppId);
                e.Property(x => x.AppKey)        .HasDefaultValue("");
                e.Property(x => x.AppName)       .HasDefaultValue("");
                e.Property(x => x.Description)   .HasDefaultValue("");
                e.Property(x => x.AppScope)      .HasDefaultValue("");
                e.Property(x => x.Icon)          .HasDefaultValue("");
                e.Property(x => x.AccentColor)   .HasDefaultValue("");
                e.Property(x => x.ManifestJson)  .HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.SettingsJson)  .HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.ResourcesJson) .HasColumnType(TextType).HasDefaultValue("{}");
                e.HasIndex(x => new { x.PortalId, x.AppKey }).IsUnique();
            });
            b.Entity<AppQueryDefinitionInfo>(e => {
                e.ToTable("MF_AppQueries"); e.HasKey(x => x.QueryId);
                e.Property(x => x.QueryKey)       .HasDefaultValue("");
                e.Property(x => x.QueryName)      .HasDefaultValue("");
                e.Property(x => x.Description)    .HasDefaultValue("");
                e.Property(x => x.QueryType)      .HasDefaultValue("");
                e.Property(x => x.DefinitionJson) .HasColumnType(TextType).HasDefaultValue("{}");
                e.HasIndex(x => new { x.AppId, x.QueryKey }).IsUnique();
            });
            b.Entity<FormRelationInfo>(e => {
                e.ToTable("MF_FormRelations"); e.HasKey(x => x.RelationId);
                e.Property(x => x.RelationType) .HasDefaultValue("has_many");
                e.Property(x => x.ForeignKey)   .HasDefaultValue("");
                e.Property(x => x.ParentKey)    .HasDefaultValue("SubmissionId");
                e.Property(x => x.Label)        .HasDefaultValue("");
            });
            b.Entity<SubmissionLinkInfo>(e => {
                e.ToTable("MF_SubmissionLinks"); e.HasKey(x => x.LinkId);
                e.HasIndex(x => new { x.RelationId, x.ParentSubmissionId });
                e.HasIndex(x => x.ChildSubmissionId);
            });
            // Documents
            b.Entity<DocumentInfo>(e => {
                e.ToTable("MF_Documents"); e.HasKey(x => x.DocumentId);
                e.Property(x => x.AppScope).HasDefaultValue("");
                e.Property(x => x.Slug)    .HasDefaultValue("");
                e.Property(x => x.Title)   .HasDefaultValue("");
                e.Property(x => x.Summary) .HasDefaultValue("");
                e.Property(x => x.Status)  .HasDefaultValue("draft");
                e.HasIndex(x => new { x.PortalId, x.Slug });
            });
            b.Entity<DocumentRevisionInfo>(e => {
                e.ToTable("MF_DocumentRevisions"); e.HasKey(x => x.RevisionId);
                e.Property(x => x.Status)      .HasDefaultValue("draft");
                e.Property(x => x.Title)       .HasDefaultValue("");
                e.Property(x => x.Summary)     .HasDefaultValue("");
                e.Property(x => x.Slug)        .HasDefaultValue("");
                e.Property(x => x.OriginalName).HasDefaultValue("");
                e.Property(x => x.StoredPath)  .HasDefaultValue("");
                e.Property(x => x.ContentType) .HasDefaultValue("");
                e.Property(x => x.StoredIn)    .HasDefaultValue("private");
                e.Property(x => x.Hash)        .HasDefaultValue("");
                e.HasIndex(x => new { x.DocumentId, x.IsPublished });
                e.HasIndex(x => x.SubmissionId);
            });
            b.Entity<DocumentMetadataInfo>(e => {
                e.ToTable("MF_DocumentMetadata"); e.HasKey(x => x.MetadataId);
                e.Property(x => x.Direction)        .HasDefaultValue("internal");
                e.Property(x => x.DocumentType)     .HasDefaultValue("");
                e.Property(x => x.RegistryNumber)   .HasDefaultValue("");
                e.Property(x => x.ExternalReference).HasDefaultValue("");
                e.Property(x => x.Category)         .HasDefaultValue("");
                e.Property(x => x.Department)       .HasDefaultValue("");
                e.Property(x => x.OwnerDisplayName) .HasDefaultValue("");
                e.Property(x => x.SenderOrg)        .HasDefaultValue("");
                e.Property(x => x.RecipientOrg)     .HasDefaultValue("");
                e.Property(x => x.SignerName)       .HasDefaultValue("");
                e.Property(x => x.SecurityLevel)    .HasDefaultValue("internal");
                e.Property(x => x.UrgencyLevel)     .HasDefaultValue("normal");
                e.Property(x => x.Tags)             .HasDefaultValue("");
                e.Property(x => x.Keywords)         .HasDefaultValue("");
                e.Property(x => x.Notes)            .HasDefaultValue("");
                e.HasIndex(x => x.DocumentId).IsUnique();
            });
            b.Entity<DocumentAliasInfo>(e => {
                e.ToTable("MF_DocumentAliases"); e.HasKey(x => x.AliasId);
                e.Property(x => x.Slug).HasDefaultValue("");
                e.HasIndex(x => new { x.PortalId, x.Slug });
            });
            b.Entity<DocumentAssignmentInfo>(e => {
                e.ToTable("MF_DocumentAssignments"); e.HasKey(x => x.AssignmentId);
                e.Property(x => x.AssignmentType)     .HasDefaultValue("review");
                e.Property(x => x.Status)             .HasDefaultValue("pending");
                e.Property(x => x.AssignedToUserName) .HasDefaultValue("");
                e.Property(x => x.AssignedRole)       .HasDefaultValue("");
                e.Property(x => x.AssignedDepartment) .HasDefaultValue("");
                e.Property(x => x.AssignedByUserName) .HasDefaultValue("");
                e.Property(x => x.Comment)            .HasDefaultValue("");
                e.HasIndex(x => x.DocumentId);
            });
            b.Entity<DocumentCommentInfo>(e => {
                e.ToTable("MF_DocumentComments"); e.HasKey(x => x.CommentId);
                e.Property(x => x.CommentType)        .HasDefaultValue("comment");
                e.Property(x => x.Body)               .HasDefaultValue("");
                e.Property(x => x.CreatedByUserName)  .HasDefaultValue("");
                e.HasIndex(x => x.DocumentId);
            });
            b.Entity<DocumentDirectiveInfo>(e => {
                e.ToTable("MF_DocumentDirectives"); e.HasKey(x => x.DirectiveId);
                e.Property(x => x.Status)         .HasDefaultValue("open");
                e.Property(x => x.DirectiveText)  .HasDefaultValue("");
                e.Property(x => x.TargetUserName) .HasDefaultValue("");
                e.Property(x => x.TargetRole)     .HasDefaultValue("");
                e.Property(x => x.IssuedByUserName).HasDefaultValue("");
                e.Property(x => x.CompletionNote) .HasDefaultValue("");
                e.HasIndex(x => x.DocumentId);
            });
            // AI Knowledge Base
            b.Entity<AiKnowledgeEntry>(e => {
                e.ToTable("MF_AI_Knowledge"); e.HasKey(x => x.Id);
                e.Property(x => x.Slug)       .HasDefaultValue("");
                e.Property(x => x.Kind)       .HasDefaultValue("");
                e.Property(x => x.Title)      .HasDefaultValue("");
                e.Property(x => x.Summary)    .HasDefaultValue("");
                e.Property(x => x.Body)       .HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.Tags)       .HasDefaultValue("");
                e.Property(x => x.Examples)   .HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.Source)     .HasDefaultValue("customer");
                e.Property(x => x.WidgetType) .HasDefaultValue("");
                e.Property(x => x.Surface)    .HasDefaultValue("");
                e.HasIndex(x => new { x.Slug, x.PortalId }).IsUnique();
            });
            b.Entity<AiKnowledgeHistory>(e => {
                e.ToTable("MF_AI_KnowledgeHistory"); e.HasKey(x => x.HistoryId);
                e.Property(x => x.Slug)         .HasDefaultValue("");
                e.Property(x => x.Kind)         .HasDefaultValue("");
                e.Property(x => x.Title)        .HasDefaultValue("");
                e.Property(x => x.Summary)      .HasDefaultValue("");
                e.Property(x => x.Body)         .HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.Tags)         .HasDefaultValue("");
                e.Property(x => x.Examples)     .HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.Source)       .HasDefaultValue("customer");
                e.Property(x => x.ChangeAction) .HasDefaultValue("");
                e.HasIndex(x => x.KnowledgeId);
            });
            b.Entity<KbTemplate>(e => {
                e.ToTable("MF_AI_KB_Templates"); e.HasKey(x => x.Id);
                e.Property(x => x.TemplateKey) .HasDefaultValue("");
                e.Property(x => x.Kind)        .HasDefaultValue("");
                e.Property(x => x.Title)       .HasDefaultValue("");
                e.Property(x => x.Summary)     .HasDefaultValue("");
                e.Property(x => x.Body)        .HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.Tags)        .HasDefaultValue("");
                e.Property(x => x.Source)      .HasDefaultValue("customer");
                e.HasIndex(x => new { x.KnowledgeId, x.TemplateKey });
            });
            b.Entity<KbRule>(e => {
                e.ToTable("MF_AI_KB_Rules"); e.HasKey(x => x.RuleId);
                e.Property(x => x.WidgetType)        .HasDefaultValue("");
                e.Property(x => x.Title)             .HasDefaultValue("");
                e.Property(x => x.Severity)          .HasDefaultValue("");
                e.Property(x => x.Condition)         .HasDefaultValue("");
                e.Property(x => x.RegexPattern)      .HasDefaultValue("");
                e.Property(x => x.RejectionMessage)  .HasDefaultValue("");
                e.Property(x => x.FixHint)           .HasDefaultValue("");
                e.Property(x => x.Source)            .HasDefaultValue("customer");
                e.HasIndex(x => x.KnowledgeId);
                e.HasIndex(x => x.WidgetType);
            });
            b.Entity<KbFeedback>(e => {
                e.ToTable("MF_AI_KB_Feedback"); e.HasKey(x => x.Id);
                e.Property(x => x.SessionId)        .HasDefaultValue("");
                e.Property(x => x.RuleId)           .HasDefaultValue("");
                e.Property(x => x.WidgetType)       .HasDefaultValue("");
                e.Property(x => x.Op)               .HasDefaultValue("");
                e.Property(x => x.AttemptedJson)    .HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.RejectionMessage) .HasDefaultValue("");
                e.Property(x => x.FixedJson)        .HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.Outcome)          .HasDefaultValue("rejected");
                e.Property(x => x.ReviewNotes)      .HasDefaultValue("");
                e.HasIndex(x => new { x.WidgetType, x.Outcome });
            });
            b.Entity<ReportDefinitionInfo>(e => {
                e.ToTable("MF_ReportDefinitions"); e.HasKey(x => x.ReportId);
                e.Property(x => x.Name)          .HasDefaultValue("");
                e.Property(x => x.AppScope)      .HasDefaultValue("");
                e.Property(x => x.DefinitionJson).HasColumnType(TextType).HasDefaultValue("{}");
                e.HasIndex(x => new { x.PortalId, x.AppScope });
            });
        }
    }

    public class ModuleSettingRow
    {
        public int    Id           { get; set; }
        public int    ModuleId     { get; set; }
        public string SettingKey   { get; set; }
        public string SettingValue { get; set; }
    }

    public class EfFormRepository : IFormRepository
    {
        private readonly MegaFormDbContext _db;
        public EfFormRepository(MegaFormDbContext db) { _db = db; }
        public FormInfo GetForm(int formId) => _db.Forms.AsNoTracking().FirstOrDefault(f => f.FormId == formId);
        public List<FormInfo> GetFormsByModule(int moduleId) => _db.Forms.Where(f => f.ModuleId == moduleId).OrderByDescending(f => f.CreatedOnUtc).ToList();
        public List<FormInfo> ListForms(int portalId, string status = null, string search = null, int pageIndex = 0, int pageSize = 20)
        {
            var q = _db.Forms.AsQueryable();
            if (portalId > 0)              q = q.Where(f => f.PortalId == portalId);
            if (!string.IsNullOrEmpty(status)) q = q.Where(f => f.Status == status);
            if (!string.IsNullOrEmpty(search)) q = q.Where(f => f.Title.Contains(search));
            q = q.OrderByDescending(f => f.UpdatedOnUtc ?? f.CreatedOnUtc).ThenByDescending(f => f.FormId);
            if (pageSize <= 0) return q.ToList();
            return q.Skip(pageIndex * pageSize).Take(pageSize).ToList();
        }
        public int SaveForm(FormInfo form)
        {
            // Ensure NOT NULL string columns are never null — builder JS may omit these
            form.Title                    = form.Title                    ?? "Untitled Form";
            form.Description              = form.Description              ?? "";
            form.SchemaJson               = form.SchemaJson               ?? "{}";
            form.SettingsJson             = form.SettingsJson             ?? "{}";
            form.ThemeJson                = form.ThemeJson                ?? "{}";
            form.Status                   = form.Status                   ?? "draft";
            form.SubmitButtonText         = form.SubmitButtonText         ?? "Submit";
            form.SuccessMessage           = form.SuccessMessage           ?? "";
            form.RedirectUrl              = form.RedirectUrl              ?? "";
            form.WebhookUrl               = form.WebhookUrl               ?? "";
            form.WebhookSecret            = form.WebhookSecret            ?? "";
            form.WebhookHeaders           = form.WebhookHeaders           ?? "{}";
            form.NotifyEmails             = form.NotifyEmails             ?? "";
            form.NotifyTemplate           = form.NotifyTemplate           ?? "";
            form.AutoresponderEmailField  = form.AutoresponderEmailField  ?? "";
            form.AutoresponderSubject     = form.AutoresponderSubject     ?? "";
            form.AutoresponderBody        = form.AutoresponderBody        ?? "";
            form.AppScope                 = form.AppScope                 ?? "";
            form.RulesJson                 = form.RulesJson                 ?? "[]";
            // [WfApplyClobber v20260711] The builder toolbar never sends WorkflowJson, but an
            // applied BPMN workflow lives only in this column — coercing null to "" and doing a
            // full-entity Update() erased it on every builder Save. Null = "not editing the
            // workflow": carry the stored value forward instead of wiping it.
            if (form.WorkflowJson == null && form.FormId > 0)
            {
                form.WorkflowJson = _db.Forms.AsNoTracking()
                    .Where(f => f.FormId == form.FormId)
                    .Select(f => f.WorkflowJson)
                    .FirstOrDefault();
            }
            form.WorkflowJson              = form.WorkflowJson              ?? "";

            if (form.FormId == 0) { form.CreatedOnUtc = DateTime.UtcNow; _db.Forms.Add(form); }
            else { form.UpdatedOnUtc = DateTime.UtcNow; _db.Forms.Update(form); }
            _db.SaveChanges();
            return form.FormId;
        }
        public void DeleteForm(int formId) { var f = _db.Forms.Find(formId); if (f != null) { _db.Forms.Remove(f); _db.SaveChanges(); } }
        public FormStatsInfo GetFormStats(int formId)
        {
            var subs = _db.Submissions.Where(s => s.FormId == formId);
            return new FormStatsInfo { TotalSubmissions = subs.Count(), ValidSubmissions = subs.Count(s => !s.IsSpam), SpamSubmissions = subs.Count(s => s.IsSpam) };
        }
        public int DuplicateForm(int formId, int userId)
        {
            var src = _db.Forms.AsNoTracking().FirstOrDefault(f => f.FormId == formId);
            if (src == null) return 0;
            src.FormId = 0; src.Title += " (Copy)"; src.Status = "Draft"; src.CreatedByUserId = userId; src.CreatedOnUtc = DateTime.UtcNow;
            _db.Forms.Add(src); _db.SaveChanges(); return src.FormId;
        }
    }

    public class EfSubmissionRepository : ISubmissionRepository
    {
        private readonly MegaFormDbContext _db;
        public EfSubmissionRepository(MegaFormDbContext db) { _db = db; }
        public int Insert(SubmissionInfo sub)
        {
            sub.IpAddress      = sub.IpAddress  ?? "";
            sub.UserAgent      = sub.UserAgent   ?? "";
            sub.Status         = sub.Status      ?? "new";
            sub.DataJson       = sub.DataJson    ?? "{}";
            sub.SubmittedOnUtc = DateTime.UtcNow;
            _db.Submissions.Add(sub);
            _db.SaveChanges();
            return sub.SubmissionId;
        }
        public SubmissionInfo Get(int id) => _db.Submissions.AsNoTracking().FirstOrDefault(s => s.SubmissionId == id);
        public List<SubmissionValueInfo> GetValues(int submissionId) => _db.SubmissionValues.AsNoTracking().Where(v => v.SubmissionId == submissionId).OrderBy(v => v.ValueId).ToList();
        public (List<SubmissionInfo> Items, int TotalCount) List(int formId, string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null, int pageIndex = 0, int pageSize = 50)
        {
            var q = _db.Submissions.AsNoTracking().AsQueryable();
            if (formId > 0) q = q.Where(s => s.FormId == formId);
            if (!string.IsNullOrWhiteSpace(status)) q = q.Where(s => s.Status == status);
            if (dateFrom.HasValue) q = q.Where(s => s.SubmittedOnUtc >= dateFrom.Value);
            if (dateTo.HasValue)
            {
                var inclusiveEnd = dateTo.Value.Date.AddDays(1);
                q = q.Where(s => s.SubmittedOnUtc < inclusiveEnd);
            }
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                if (int.TryParse(term, out var exactId) && exactId > 0)
                {
                    q = q.Where(s => s.SubmissionId == exactId ||
                                     EF.Functions.Like(s.IpAddress ?? "", $"%{term}%") ||
                                     EF.Functions.Like(s.Status ?? "", $"%{term}%"));
                }
                else
                {
                    var pattern = $"%{term}%";
                    var matchingIds = _db.SubmissionValues
                        .AsNoTracking()
                        .Where(v => EF.Functions.Like(v.FieldKey ?? "", pattern) || EF.Functions.Like(v.FieldValue ?? "", pattern))
                        .Select(v => v.SubmissionId);

                    q = q.Where(s =>
                        EF.Functions.Like(s.IpAddress ?? "", pattern) ||
                        EF.Functions.Like(s.Status ?? "", pattern) ||
                        matchingIds.Contains(s.SubmissionId));
                }
            }
            if (pageSize <= 0) pageSize = 50;
            if (pageSize > 250) pageSize = 250;
            if (pageIndex < 0) pageIndex = 0;

            var ordered = q.OrderByDescending(s => s.SubmissionId);
            var total = ordered.Count();
            var items = ordered.Skip(pageIndex * pageSize).Take(pageSize).ToList();
            return (items, total);
        }
        public void UpdateStatus(int id, string status) { var s = _db.Submissions.Find(id); if (s != null) { s.Status = status; _db.SaveChanges(); } }
        public void UpdateData(int id, string json) { var s = _db.Submissions.Find(id); if (s != null) { s.DataJson = json; _db.SaveChanges(); } }
        public void Delete(int id) { var s = _db.Submissions.Find(id); if (s != null) { _db.Submissions.Remove(s); _db.SaveChanges(); } }
        public void BulkDelete(int formId, int[] ids)
        {
            _db.Submissions.RemoveRange(_db.Submissions.Where(s => s.FormId == formId && ids.Contains(s.SubmissionId)));
            _db.SaveChanges();
        }
        public void InsertValues(int subId, List<SubmissionValueInfo> values)
        {
            foreach (var v in values) { v.SubmissionId = subId; _db.SubmissionValues.Add(v); }
            _db.SaveChanges();
        }
    }

    public class EfDraftRepository : IDraftRepository
    {
        private readonly MegaFormDbContext _db;
        public EfDraftRepository(MegaFormDbContext db) { _db = db; }
        public int SaveDraft(SavedDraftInfo d) { if (d.DraftId == 0) _db.Drafts.Add(d); else _db.Drafts.Update(d); _db.SaveChanges(); return d.DraftId; }
        public SavedDraftInfo GetDraft(string token) => _db.Drafts.FirstOrDefault(d => d.ResumeToken == token);
        public void DeleteDraft(string token) { var d = _db.Drafts.FirstOrDefault(x => x.ResumeToken == token); if (d != null) { _db.Drafts.Remove(d); _db.SaveChanges(); } }
        public void CleanExpiredDrafts() { _db.Drafts.RemoveRange(_db.Drafts.Where(d => d.ExpiresOnUtc < DateTime.UtcNow)); _db.SaveChanges(); }
    }
}
