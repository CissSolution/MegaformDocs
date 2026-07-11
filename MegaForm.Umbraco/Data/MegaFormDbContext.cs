using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Models;
using MegaForm.Core.Workflow;

namespace MegaForm.Umbraco.Data
{
    public partial class MegaFormDbContext : DbContext
    {
        public MegaFormDbContext(DbContextOptions<MegaFormDbContext> options) : base(options) { }

        private string TextType => (Database.ProviderName ?? string.Empty).ToLowerInvariant() switch
        {
            var p when p.Contains("sqlite") => "TEXT",
            var p when p.Contains("npgsql") => "text",
            var p when p.Contains("mysql") => "longtext",
            _ => "nvarchar(max)"
        };

        public DbSet<FormInfo> Forms { get; set; }
        public DbSet<SubmissionInfo> Submissions { get; set; }
        public DbSet<SubmissionValueInfo> SubmissionValues { get; set; }
        public DbSet<Core.Models.FileInfo> Files { get; set; }
        public DbSet<SavedDraftInfo> Drafts { get; set; }
        public DbSet<WebhookLogInfo> WebhookLogs { get; set; }
        public DbSet<ModuleSettingRow> ModuleSettings { get; set; }
        public DbSet<ModuleViewConfigInfo> ModuleViewConfigs { get; set; }
        public DbSet<WorkflowExecutionRow> WorkflowExecutions { get; set; }
        public DbSet<WebUserRow> WebUsers { get; set; }
        public DbSet<WebRoleRow> WebRoles { get; set; }
        public DbSet<WebUserRoleRow> WebUserRoles { get; set; }
        public DbSet<DocumentInfo> Documents { get; set; }
        public DbSet<DocumentRevisionInfo> DocumentRevisions { get; set; }
        public DbSet<DocumentMetadataInfo> DocumentMetadata { get; set; }
        public DbSet<DocumentAliasInfo> DocumentAliases { get; set; }
        public DbSet<DocumentAssignmentInfo> DocumentAssignments { get; set; }
        public DbSet<DocumentCommentInfo> DocumentComments { get; set; }
        public DbSet<DocumentDirectiveInfo> DocumentDirectives { get; set; }
        public DbSet<AiKnowledgeEntry> AiKnowledgeEntries { get; set; }
        public DbSet<AiKnowledgeHistory> AiKnowledgeHistories { get; set; }
        public DbSet<KbTemplate> KbTemplates { get; set; }
        public DbSet<KbRule> KbRules { get; set; }
        public DbSet<KbFeedback> KbFeedbacks { get; set; }
        public DbSet<ReportDefinitionInfo> ReportDefinitions { get; set; }

        // Phase2
        public DbSet<FormViewInfo> FormViews { get; set; }
        public DbSet<TemplateInfo> Templates { get; set; }
        public DbSet<FormPermissionInfo> FormPermissions { get; set; }
        public DbSet<WorkflowInfo> Workflows { get; set; }
        public DbSet<AuditLogInfo> AuditLogs { get; set; }
        public DbSet<UniqueIdCounterRow> UniqueIdCounters { get; set; }
        public DbSet<RateLimitRow> RateLimits { get; set; }
        public DbSet<WorkflowCaseRow> WorkflowCases { get; set; }
        public DbSet<WorkflowTaskRow> WorkflowTasks { get; set; }
        public DbSet<WorkflowTaskActionRow> WorkflowTaskActions { get; set; }

        // Workflow Library (reusable workflow templates)
        public DbSet<WorkflowTemplateInfo> WorkflowTemplates { get; set; }
        public DbSet<WorkflowTemplateVersionInfo> WorkflowTemplateVersions { get; set; }
        public DbSet<FormWorkflowMappingInfo> FormWorkflowMappings { get; set; }

        public DbSet<AppDefinitionInfo> AppDefinitions { get; set; }
        public DbSet<AppQueryDefinitionInfo> AppQueries { get; set; }
        public DbSet<FormRelationInfo> FormRelations { get; set; }
        public DbSet<SubmissionLinkInfo> SubmissionLinks { get; set; }

        protected override void OnModelCreating(ModelBuilder b)
        {
            b.Entity<FormInfo>(e => {
                e.ToTable("MF_Forms"); e.HasKey(x => x.FormId);
                e.Property(x => x.SchemaJson).HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.SettingsJson).HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.ThemeJson).HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.Title).HasDefaultValue("");
                e.Property(x => x.Description).HasDefaultValue("");
                e.Property(x => x.Status).HasDefaultValue("draft");
                e.Property(x => x.SubmitButtonText).HasDefaultValue("Submit");
                e.Property(x => x.SuccessMessage).HasDefaultValue("");
                e.Property(x => x.RedirectUrl).HasDefaultValue("");
                e.Property(x => x.WebhookUrl).HasDefaultValue("");
                e.Property(x => x.WebhookSecret).HasDefaultValue("");
                e.Property(x => x.WebhookHeaders).HasDefaultValue("{}");
                e.Property(x => x.NotifyEmails).HasDefaultValue("");
                e.Property(x => x.NotifyTemplate).HasDefaultValue("");
                e.Property(x => x.AutoresponderEmailField).HasDefaultValue("");
                e.Property(x => x.AutoresponderSubject).HasDefaultValue("");
                e.Property(x => x.AutoresponderBody).HasDefaultValue("");
                e.Property(x => x.AppScope).HasDefaultValue("");
                e.Property(x => x.RulesJson).HasColumnType(TextType).HasDefaultValue("[]");
                e.Property(x => x.WorkflowJson).HasColumnType(TextType).HasDefaultValue("");
            });

            b.Entity<SubmissionInfo>(e => {
                e.ToTable("MF_Submissions"); e.HasKey(x => x.SubmissionId);
                e.HasIndex(x => new { x.FormId, x.SubmittedOnUtc });
                e.HasIndex(x => new { x.FormId, x.Status, x.SubmittedOnUtc });
                e.HasIndex(x => x.SubmittedOnUtc);
                e.HasIndex(x => x.Status);
                e.Property(x => x.DataJson).HasColumnType(TextType);
                e.Property(x => x.IpAddress).HasDefaultValue("");
                e.Property(x => x.UserAgent).HasDefaultValue("");
                e.Property(x => x.Status).HasDefaultValue("new");
            });

            b.Entity<SubmissionValueInfo>(e => {
                e.ToTable("MF_SubmissionValues"); e.HasKey(x => x.ValueId);
                e.HasIndex(x => x.SubmissionId);
                e.HasIndex(x => new { x.SubmissionId, x.FieldKey });
                e.HasIndex(x => new { x.FormId, x.FieldKey });
                e.HasIndex(x => new { x.FormId, x.ValueDate });
                e.Property(x => x.FormId).HasDefaultValue(0);
                e.Property(x => x.FieldKey).HasDefaultValue("");
                e.Property(x => x.FieldValue).HasColumnType(TextType).IsRequired(false);
                e.Property(x => x.ValueText).HasColumnType(TextType).IsRequired(false);
                e.Property(x => x.ValueNumber).HasColumnType("DECIMAL(18,6)");
            });

            b.Entity<Core.Models.FileInfo>(e => {
                e.ToTable("MF_Files"); e.HasKey(x => x.FileId);
                e.Property(x => x.FieldKey).HasDefaultValue("");
                e.Property(x => x.OriginalName).HasDefaultValue("");
                e.Property(x => x.StoredPath).HasDefaultValue("");
                e.Property(x => x.ContentType).HasDefaultValue("");
            });

            b.Entity<SavedDraftInfo>(e => {
                e.ToTable("MF_SavedDrafts"); e.HasKey(x => x.DraftId);
                e.Property(x => x.DataJson).HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.ResumeToken).HasDefaultValue("");
                e.Property(x => x.Email).HasDefaultValue("");
                e.Property(x => x.IpAddress).HasDefaultValue("");
            });

            b.Entity<WebhookLogInfo>(e => {
                e.ToTable("MF_WebhookLog"); e.HasKey(x => x.LogId);
                e.Property(x => x.RequestBody).HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.ResponseBody).HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.WebhookUrl).HasDefaultValue("");
            });

            b.Entity<ModuleSettingRow>(e => {
                e.ToTable("MF_ModuleSettings"); e.HasKey(x => x.Id);
                e.HasIndex(x => new { x.ModuleId, x.SettingKey }).IsUnique();
                e.Property(x => x.SettingKey).HasDefaultValue("");
                e.Property(x => x.SettingValue).HasDefaultValue("");
            });

            b.Entity<ModuleViewConfigInfo>(e => {
                e.ToTable("MF_ModuleViewConfigs"); e.HasKey(x => x.ConfigId);
                e.HasIndex(x => x.ModuleId).IsUnique();
                e.Property(x => x.ViewType).HasDefaultValue("submit");
                e.Property(x => x.ViewConfigJson).HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.CssClass).HasDefaultValue("");
                e.Property(x => x.PermissionsJson).HasColumnType(TextType).HasDefaultValue("{}");
            });

            b.Entity<FormViewInfo>(e => {
                e.ToTable("MF_FormViews"); e.HasKey(x => x.ViewId);
                e.Property(x => x.ConfigJson).HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.ViewKey).HasDefaultValue("");
                e.Property(x => x.ViewType).HasDefaultValue("edit");
                e.Property(x => x.ViewName).HasDefaultValue("");
                e.Property(x => x.CustomHtml).HasDefaultValue("");
                e.Property(x => x.CustomCss).HasDefaultValue("");
                e.Property(x => x.PermissionsJson).HasDefaultValue("{}");
            });

            b.Entity<TemplateInfo>(e => {
                e.ToTable("MF_Templates"); e.HasKey(x => x.TemplateId);
                e.Property(x => x.MetadataJson).HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.Slug).HasDefaultValue("");
                e.Property(x => x.Name).HasDefaultValue("");
                e.Property(x => x.Description).HasDefaultValue("");
                e.Property(x => x.Category).HasDefaultValue("");
                e.Property(x => x.Icon).HasDefaultValue("");
                e.Property(x => x.Version).HasDefaultValue("1.0");
                e.Property(x => x.Author).HasDefaultValue("");
                e.Property(x => x.ThumbnailPath).HasDefaultValue("");
                e.Property(x => x.FolderPath).HasDefaultValue("");
                e.Property(x => x.JsScanResult).HasDefaultValue("");
            });

            b.Entity<FormPermissionInfo>(e => {
                e.ToTable("MF_FormPermissions"); e.HasKey(x => x.PermissionId);
                e.Property(x => x.PrincipalId).HasDefaultValue("");
                e.Property(x => x.RoleName).HasDefaultValue("");
            });

            b.Entity<WorkflowInfo>(e => {
                e.ToTable("MF_Workflows"); e.HasKey(x => x.WorkflowId);
                e.Property(x => x.StepsJson).HasColumnType(TextType).HasDefaultValue("[]");
                e.Property(x => x.WorkflowName).HasDefaultValue("");
                e.Property(x => x.Description).HasDefaultValue("");
                e.Property(x => x.TriggerType).HasDefaultValue("");
                e.Property(x => x.TriggerConfig).HasDefaultValue("{}");
            });

            b.Entity<AuditLogInfo>(e => {
                e.ToTable("MF_AuditLog"); e.HasKey(x => x.LogId);
                e.Property(x => x.Details).HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.UserName).HasDefaultValue("");
                e.Property(x => x.IpAddress).HasDefaultValue("");
                e.Property(x => x.Action).HasDefaultValue("");
                e.Property(x => x.EntityType).HasDefaultValue("");
                e.Property(x => x.Result).HasDefaultValue("");
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

            b.Entity<WorkflowExecutionRow>(e => {
                e.ToTable("MF_WorkflowExecutions"); e.HasKey(x => x.ExecutionId);
                e.Property(x => x.ContextJson).HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.Status).HasDefaultValue("running");
                e.Property(x => x.CurrentNodeId).HasDefaultValue("");
                e.Property(x => x.ErrorMessage).HasDefaultValue("");
            });

            b.Entity<WebUserRow>(e => {
                e.ToTable("MF_WebUsers"); e.HasKey(x => x.UserId);
                e.Property(x => x.UserName).HasDefaultValue("");
                e.Property(x => x.Email).HasDefaultValue("");
                e.Property(x => x.DisplayName).HasDefaultValue("");
                e.Property(x => x.PasswordHash).HasDefaultValue("");
                e.Property(x => x.SecurityStamp).HasDefaultValue("");
                e.Property(x => x.LastIpAddress).HasDefaultValue("");
                e.Property(x => x.CreatedBy).HasDefaultValue("");
                e.Property(x => x.UpdatedBy).HasDefaultValue("");
            });

            b.Entity<WebRoleRow>(e => {
                e.ToTable("MF_WebRoles"); e.HasKey(x => x.RoleId);
                e.Property(x => x.RoleName).HasDefaultValue("");
                e.Property(x => x.Description).HasDefaultValue("");
            });

            b.Entity<WebUserRoleRow>(e => {
                e.ToTable("MF_WebUserRoles"); e.HasKey(x => x.Id);
            });

            b.Entity<WorkflowCaseRow>(e => {
                e.ToTable("MF_WorkflowCases"); e.HasKey(x => x.CaseId);
                e.Property(x => x.ExecutionId).HasDefaultValue("");
                e.Property(x => x.WorkflowId).HasDefaultValue("");
                e.Property(x => x.CurrentNodeId).HasDefaultValue("");
                e.Property(x => x.StartedByUserName).HasDefaultValue("");
                e.Property(x => x.ActiveTaskId).HasDefaultValue("");
                e.Property(x => x.Outcome).HasDefaultValue("");
                e.Property(x => x.LastComment).HasDefaultValue("");
            });

            b.Entity<WorkflowTaskRow>(e => {
                e.ToTable("MF_WorkflowTasks"); e.HasKey(x => x.TaskId);
                e.Property(x => x.CaseId).HasDefaultValue("");
                e.Property(x => x.ExecutionId).HasDefaultValue("");
                e.Property(x => x.NodeId).HasDefaultValue("");
                e.Property(x => x.NodeLabel).HasDefaultValue("");
                e.Property(x => x.CandidateRolesJson).HasColumnType(TextType).HasDefaultValue("[]");
                e.Property(x => x.CandidateUsersJson).HasColumnType(TextType).HasDefaultValue("[]");
                e.Property(x => x.AssignedUserName).HasDefaultValue("");
                e.Property(x => x.AssignedDisplayName).HasDefaultValue("");
                e.Property(x => x.PendingSubmissionStatus).HasDefaultValue("pending_approval");
                e.Property(x => x.ApprovedSubmissionStatus).HasDefaultValue("approved");
                e.Property(x => x.RejectedSubmissionStatus).HasDefaultValue("rejected");
                e.Property(x => x.Outcome).HasDefaultValue("");
                e.Property(x => x.Comment).HasDefaultValue("");
            });

            b.Entity<WorkflowTaskActionRow>(e => {
                e.ToTable("MF_WorkflowTaskActions"); e.HasKey(x => x.ActionId);
                e.Property(x => x.TaskId).HasDefaultValue("");
                e.Property(x => x.CaseId).HasDefaultValue("");
                e.Property(x => x.ExecutionId).HasDefaultValue("");
                e.Property(x => x.ActorUserName).HasDefaultValue("");
                e.Property(x => x.ActorDisplayName).HasDefaultValue("");
                e.Property(x => x.TargetUser).HasDefaultValue("");
                e.Property(x => x.Outcome).HasDefaultValue("");
                e.Property(x => x.Comment).HasDefaultValue("");
            });

            b.Entity<AppDefinitionInfo>(e => {
                e.ToTable("MF_AppDefinitions"); e.HasKey(x => x.AppId);
                e.Property(x => x.AppKey).HasDefaultValue("");
                e.Property(x => x.AppName).HasDefaultValue("");
                e.Property(x => x.Description).HasDefaultValue("");
                e.Property(x => x.AppScope).HasDefaultValue("");
                e.Property(x => x.Icon).HasDefaultValue("");
                e.Property(x => x.AccentColor).HasDefaultValue("");
                e.Property(x => x.ManifestJson).HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.SettingsJson).HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.ResourcesJson).HasColumnType(TextType).HasDefaultValue("{}");
                e.HasIndex(x => new { x.PortalId, x.AppKey }).IsUnique();
            });

            b.Entity<AppQueryDefinitionInfo>(e => {
                e.ToTable("MF_AppQueries"); e.HasKey(x => x.QueryId);
                e.Property(x => x.QueryKey).HasDefaultValue("");
                e.Property(x => x.QueryName).HasDefaultValue("");
                e.Property(x => x.Description).HasDefaultValue("");
                e.Property(x => x.QueryType).HasDefaultValue("");
                e.Property(x => x.DefinitionJson).HasColumnType(TextType).HasDefaultValue("{}");
                e.HasIndex(x => new { x.AppId, x.QueryKey }).IsUnique();
            });

            b.Entity<FormRelationInfo>(e => {
                e.ToTable("MF_FormRelations"); e.HasKey(x => x.RelationId);
                e.Property(x => x.RelationType).HasDefaultValue("has_many");
                e.Property(x => x.ForeignKey).HasDefaultValue("");
                e.Property(x => x.ParentKey).HasDefaultValue("SubmissionId");
                e.Property(x => x.Label).HasDefaultValue("");
            });

            b.Entity<SubmissionLinkInfo>(e => {
                e.ToTable("MF_SubmissionLinks"); e.HasKey(x => x.LinkId);
                e.HasIndex(x => new { x.RelationId, x.ParentSubmissionId });
                e.HasIndex(x => x.ChildSubmissionId);
            });

            b.Entity<DocumentInfo>(e => {
                e.ToTable("MF_Documents"); e.HasKey(x => x.DocumentId);
                e.Property(x => x.AppScope).HasDefaultValue("");
                e.Property(x => x.Slug).HasDefaultValue("");
                e.Property(x => x.Title).HasDefaultValue("");
                e.Property(x => x.Summary).HasDefaultValue("");
                e.Property(x => x.Status).HasDefaultValue("draft");
                e.HasIndex(x => new { x.PortalId, x.Slug });
            });

            b.Entity<DocumentRevisionInfo>(e => {
                e.ToTable("MF_DocumentRevisions"); e.HasKey(x => x.RevisionId);
                e.Property(x => x.Status).HasDefaultValue("draft");
                e.Property(x => x.Title).HasDefaultValue("");
                e.Property(x => x.Summary).HasDefaultValue("");
                e.Property(x => x.Slug).HasDefaultValue("");
                e.Property(x => x.OriginalName).HasDefaultValue("");
                e.Property(x => x.StoredPath).HasDefaultValue("");
                e.Property(x => x.ContentType).HasDefaultValue("");
                e.Property(x => x.StoredIn).HasDefaultValue("private");
                e.Property(x => x.Hash).HasDefaultValue("");
                e.HasIndex(x => new { x.DocumentId, x.IsPublished });
                e.HasIndex(x => x.SubmissionId);
            });

            b.Entity<DocumentMetadataInfo>(e => {
                e.ToTable("MF_DocumentMetadata"); e.HasKey(x => x.MetadataId);
                e.Property(x => x.Direction).HasDefaultValue("internal");
                e.Property(x => x.DocumentType).HasDefaultValue("");
                e.Property(x => x.RegistryNumber).HasDefaultValue("");
                e.Property(x => x.ExternalReference).HasDefaultValue("");
                e.Property(x => x.Category).HasDefaultValue("");
                e.Property(x => x.Department).HasDefaultValue("");
                e.Property(x => x.OwnerDisplayName).HasDefaultValue("");
                e.Property(x => x.SenderOrg).HasDefaultValue("");
                e.Property(x => x.RecipientOrg).HasDefaultValue("");
                e.Property(x => x.SignerName).HasDefaultValue("");
                e.Property(x => x.SecurityLevel).HasDefaultValue("internal");
                e.Property(x => x.UrgencyLevel).HasDefaultValue("normal");
                e.Property(x => x.Tags).HasDefaultValue("");
                e.Property(x => x.Keywords).HasDefaultValue("");
                e.Property(x => x.Notes).HasDefaultValue("");
                e.HasIndex(x => x.DocumentId).IsUnique();
            });

            b.Entity<DocumentAliasInfo>(e => {
                e.ToTable("MF_DocumentAliases"); e.HasKey(x => x.AliasId);
                e.Property(x => x.Slug).HasDefaultValue("");
                e.HasIndex(x => new { x.PortalId, x.Slug });
            });

            b.Entity<DocumentAssignmentInfo>(e => {
                e.ToTable("MF_DocumentAssignments"); e.HasKey(x => x.AssignmentId);
                e.Property(x => x.AssignmentType).HasDefaultValue("review");
                e.Property(x => x.Status).HasDefaultValue("pending");
                e.Property(x => x.AssignedToUserName).HasDefaultValue("");
                e.Property(x => x.AssignedRole).HasDefaultValue("");
                e.Property(x => x.AssignedDepartment).HasDefaultValue("");
                e.Property(x => x.AssignedByUserName).HasDefaultValue("");
                e.Property(x => x.Comment).HasDefaultValue("");
                e.HasIndex(x => x.DocumentId);
            });

            b.Entity<DocumentCommentInfo>(e => {
                e.ToTable("MF_DocumentComments"); e.HasKey(x => x.CommentId);
                e.Property(x => x.CommentType).HasDefaultValue("comment");
                e.Property(x => x.Body).HasDefaultValue("");
                e.Property(x => x.CreatedByUserName).HasDefaultValue("");
                e.HasIndex(x => x.DocumentId);
            });

            b.Entity<DocumentDirectiveInfo>(e => {
                e.ToTable("MF_DocumentDirectives"); e.HasKey(x => x.DirectiveId);
                e.Property(x => x.Status).HasDefaultValue("open");
                e.Property(x => x.DirectiveText).HasDefaultValue("");
                e.Property(x => x.TargetUserName).HasDefaultValue("");
                e.Property(x => x.TargetRole).HasDefaultValue("");
                e.Property(x => x.IssuedByUserName).HasDefaultValue("");
                e.Property(x => x.CompletionNote).HasDefaultValue("");
                e.HasIndex(x => x.DocumentId);
            });

            b.Entity<AiKnowledgeEntry>(e => {
                e.ToTable("MF_AI_Knowledge"); e.HasKey(x => x.Id);
                e.Property(x => x.Slug).HasDefaultValue("");
                e.Property(x => x.Kind).HasDefaultValue("");
                e.Property(x => x.Title).HasDefaultValue("");
                e.Property(x => x.Summary).HasDefaultValue("");
                e.Property(x => x.Body).HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.Tags).HasDefaultValue("");
                e.Property(x => x.Examples).HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.Source).HasDefaultValue("customer");
                e.Property(x => x.WidgetType).HasDefaultValue("");
                e.Property(x => x.Surface).HasDefaultValue("");
                e.HasIndex(x => new { x.Slug, x.PortalId }).IsUnique();
            });

            b.Entity<AiKnowledgeHistory>(e => {
                e.ToTable("MF_AI_KnowledgeHistory"); e.HasKey(x => x.HistoryId);
                e.Property(x => x.Slug).HasDefaultValue("");
                e.Property(x => x.Kind).HasDefaultValue("");
                e.Property(x => x.Title).HasDefaultValue("");
                e.Property(x => x.Summary).HasDefaultValue("");
                e.Property(x => x.Body).HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.Tags).HasDefaultValue("");
                e.Property(x => x.Examples).HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.Source).HasDefaultValue("customer");
                e.Property(x => x.ChangeAction).HasDefaultValue("");
                e.HasIndex(x => x.KnowledgeId);
            });

            b.Entity<KbTemplate>(e => {
                e.ToTable("MF_AI_KB_Templates"); e.HasKey(x => x.Id);
                e.Property(x => x.TemplateKey).HasDefaultValue("");
                e.Property(x => x.Kind).HasDefaultValue("");
                e.Property(x => x.Title).HasDefaultValue("");
                e.Property(x => x.Summary).HasDefaultValue("");
                e.Property(x => x.Body).HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.Tags).HasDefaultValue("");
                e.Property(x => x.Source).HasDefaultValue("customer");
                e.HasIndex(x => new { x.KnowledgeId, x.TemplateKey });
            });

            b.Entity<KbRule>(e => {
                e.ToTable("MF_AI_KB_Rules"); e.HasKey(x => x.RuleId);
                e.Property(x => x.WidgetType).HasDefaultValue("");
                e.Property(x => x.Title).HasDefaultValue("");
                e.Property(x => x.Severity).HasDefaultValue("");
                e.Property(x => x.Condition).HasDefaultValue("");
                e.Property(x => x.RegexPattern).HasDefaultValue("");
                e.Property(x => x.RejectionMessage).HasDefaultValue("");
                e.Property(x => x.FixHint).HasDefaultValue("");
                e.Property(x => x.Source).HasDefaultValue("customer");
                e.HasIndex(x => x.KnowledgeId);
                e.HasIndex(x => x.WidgetType);
            });

            b.Entity<KbFeedback>(e => {
                e.ToTable("MF_AI_KB_Feedback"); e.HasKey(x => x.Id);
                e.Property(x => x.SessionId).HasDefaultValue("");
                e.Property(x => x.RuleId).HasDefaultValue("");
                e.Property(x => x.WidgetType).HasDefaultValue("");
                e.Property(x => x.Op).HasDefaultValue("");
                e.Property(x => x.AttemptedJson).HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.RejectionMessage).HasDefaultValue("");
                e.Property(x => x.FixedJson).HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.Outcome).HasDefaultValue("rejected");
                e.Property(x => x.ReviewNotes).HasDefaultValue("");
                e.HasIndex(x => new { x.WidgetType, x.Outcome });
            });

            b.Entity<ReportDefinitionInfo>(e => {
                e.ToTable("MF_ReportDefinitions"); e.HasKey(x => x.ReportId);
                e.Property(x => x.Name).HasDefaultValue("");
                e.Property(x => x.AppScope).HasDefaultValue("");
                e.Property(x => x.DefinitionJson).HasColumnType(TextType).HasDefaultValue("{}");
                e.HasIndex(x => new { x.PortalId, x.AppScope });
            });

            b.Entity<WorkflowTemplateInfo>(e => {
                e.ToTable("MF_WorkflowTemplates"); e.HasKey(x => x.WorkflowTemplateId);
                e.HasIndex(x => new { x.PortalId, x.TemplateKey }).IsUnique();
                e.HasIndex(x => new { x.PortalId, x.IsEnabled });
                e.Property(x => x.TemplateKey).HasMaxLength(120).HasDefaultValue("");
                e.Property(x => x.Name).HasMaxLength(200).HasDefaultValue("");
                e.Property(x => x.Description).HasColumnType(TextType).HasDefaultValue("");
                e.Property(x => x.Category).HasMaxLength(100).HasDefaultValue("");
            });

            b.Entity<WorkflowTemplateVersionInfo>(e => {
                e.ToTable("MF_WorkflowTemplateVersions"); e.HasKey(x => x.WorkflowVersionId);
                e.HasIndex(x => new { x.WorkflowTemplateId, x.Version }).IsUnique();
                e.HasIndex(x => new { x.WorkflowTemplateId, x.IsApplied });
                e.Property(x => x.Version).HasMaxLength(40).HasDefaultValue("");
                e.Property(x => x.DefinitionJson).HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.Notes).HasColumnType(TextType).HasDefaultValue("");
            });

            b.Entity<FormWorkflowMappingInfo>(e => {
                e.ToTable("MF_FormWorkflows"); e.HasKey(x => x.MappingId);
                e.HasIndex(x => new { x.FormId, x.IsActive });
                e.HasIndex(x => new { x.WorkflowTemplateId, x.IsActive });
                e.Property(x => x.FieldMappingsJson).HasColumnType(TextType).HasDefaultValue("[]");
                e.Property(x => x.VariableOverridesJson).HasColumnType(TextType).HasDefaultValue("{}");
                e.Property(x => x.TriggerType).HasMaxLength(40).HasDefaultValue("on_submit");
                e.Property(x => x.AppliedBy).HasMaxLength(200).HasDefaultValue("");
            });
        }
    }

    // Local row types for EF (mirrors MegaForm.Web)

    public class ModuleSettingRow
    {
        public int Id { get; set; }
        public int ModuleId { get; set; }
        public string SettingKey { get; set; }
        public string SettingValue { get; set; }
    }

    public class WorkflowExecutionRow
    {
        public string ExecutionId { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public string Status { get; set; }
        public DateTime StartedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
        public string CurrentNodeId { get; set; }
        public string ContextJson { get; set; }
        public string ErrorMessage { get; set; }
    }

    public class UniqueIdCounterRow
    {
        public int Id { get; set; }
        public int FormId { get; set; }
        public string FieldKey { get; set; }
        public long Counter { get; set; }
    }

    public class RateLimitRow
    {
        public int Id { get; set; }
        public string IpAddress { get; set; }
        public int FormId { get; set; }
        public DateTime CreatedUtc { get; set; }
    }

    public class WorkflowCaseRow
    {
        public string CaseId { get; set; }
        public string ExecutionId { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public string WorkflowId { get; set; }
        public string CurrentNodeId { get; set; }
        public int Status { get; set; }
        public int? StartedByUserId { get; set; }
        public string StartedByUserName { get; set; }
        public string ActiveTaskId { get; set; }
        public string Outcome { get; set; }
        public string LastComment { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
    }

    public class WorkflowTaskRow
    {
        public string TaskId { get; set; }
        public string CaseId { get; set; }
        public string ExecutionId { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public string NodeId { get; set; }
        public string NodeLabel { get; set; }
        public int Status { get; set; }
        public string CandidateRolesJson { get; set; }
        public string CandidateUsersJson { get; set; }
        public int? AssignedUserId { get; set; }
        public string AssignedUserName { get; set; }
        public string AssignedDisplayName { get; set; }
        public bool AllowClaim { get; set; }
        public bool AllowForward { get; set; }
        public bool AllowReassign { get; set; }
        public bool CommentRequiredOnReject { get; set; }
        public string PendingSubmissionStatus { get; set; }
        public string ApprovedSubmissionStatus { get; set; }
        public string RejectedSubmissionStatus { get; set; }
        public string Outcome { get; set; }
        public string Comment { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? ClaimedAt { get; set; }
        public DateTime? DueAt { get; set; }
        public DateTime? CompletedAt { get; set; }
    }

    public class WorkflowTaskActionRow
    {
        public string ActionId { get; set; }
        public string TaskId { get; set; }
        public string CaseId { get; set; }
        public string ExecutionId { get; set; }
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public int ActionType { get; set; }
        public int? ActorUserId { get; set; }
        public string ActorUserName { get; set; }
        public string ActorDisplayName { get; set; }
        public string TargetUser { get; set; }
        public string Outcome { get; set; }
        public string Comment { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class WebUserRow
    {
        public int UserId { get; set; }
        public int PortalId { get; set; }
        public string UserName { get; set; }
        public string Email { get; set; }
        public string DisplayName { get; set; }
        public string PasswordHash { get; set; }
        public string SecurityStamp { get; set; }
        public bool IsApproved { get; set; }
        public bool IsDeleted { get; set; }
        public string LastIpAddress { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public DateTime? UpdatedOnUtc { get; set; }
        public string CreatedBy { get; set; }
        public string UpdatedBy { get; set; }
    }

    public class WebRoleRow
    {
        public int RoleId { get; set; }
        public int PortalId { get; set; }
        public string RoleName { get; set; }
        public string Description { get; set; }
        public bool IsSystem { get; set; }
        public bool IsAutoAssigned { get; set; }
        public DateTime CreatedOnUtc { get; set; }
    }

    public class WebUserRoleRow
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public int RoleId { get; set; }
        public DateTime? EffectiveDate { get; set; }
        public DateTime? ExpiryDate { get; set; }
        public DateTime CreatedOnUtc { get; set; }
    }
}
