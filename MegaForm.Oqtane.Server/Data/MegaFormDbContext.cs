using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Models;
using MegaForm.Core.Workflow;
using Oqtane.Modules;
using Oqtane.Repository;
using Oqtane.Repository.Databases.Interfaces;

namespace MegaForm.Oqtane.Server.Data
{
    public class MegaFormDbContext : DBContextBase, ITransientService, IMultiDatabase
    {
        public MegaFormDbContext(IDBContextDependencies dbContextDependencies) : base(dbContextDependencies)
        {
        }

        public virtual DbSet<FormInfo> Forms { get; set; }
        public virtual DbSet<SubmissionInfo> Submissions { get; set; }
        public virtual DbSet<SubmissionValueInfo> SubmissionValues { get; set; }
        public virtual DbSet<Core.Models.FileInfo> Files { get; set; }
        public virtual DbSet<SavedDraftInfo> Drafts { get; set; }
        public virtual DbSet<WebhookLogInfo> WebhookLogs { get; set; }
        public virtual DbSet<AppDefinitionInfo> AppDefinitions { get; set; }
        public virtual DbSet<AppQueryDefinitionInfo> AppQueries { get; set; }
        public virtual DbSet<FormViewInfo> FormViews { get; set; }
        public virtual DbSet<FormRelationInfo> FormRelations { get; set; }
        public virtual DbSet<SubmissionLinkInfo> SubmissionLinks { get; set; }
        public virtual DbSet<TemplateInfo> Templates { get; set; }
        public virtual DbSet<FormPermissionInfo> Permissions { get; set; }
        public virtual DbSet<WorkflowInfo> Workflows { get; set; }
        public virtual DbSet<WorkflowExecutionRow> WorkflowExecutions { get; set; }
        public virtual DbSet<WorkflowCaseRow> WorkflowCases { get; set; }
        public virtual DbSet<WorkflowTaskRow> WorkflowTasks { get; set; }
        public virtual DbSet<WorkflowTaskActionRow> WorkflowTaskActions { get; set; }
        public virtual DbSet<WorkflowTemplateInfo> WorkflowTemplates { get; set; }
        public virtual DbSet<WorkflowTemplateVersionInfo> WorkflowTemplateVersions { get; set; }
        public virtual DbSet<FormWorkflowMappingInfo> FormWorkflowMappings { get; set; }

        // [v20260530-20] AI Knowledge Base — Oqtane parity with the 5 DNN tables.
        public virtual DbSet<AiKnowledgeEntry>   AiKnowledgeEntries { get; set; }
        public virtual DbSet<AiKnowledgeHistory> AiKnowledgeHistories { get; set; }
        public virtual DbSet<KbTemplate>         KbTemplates { get; set; }
        public virtual DbSet<KbRule>             KbRules { get; set; }
        public virtual DbSet<KbFeedback>         KbFeedbacks { get; set; }

        // [B55 v20260603] Reporting System — customer-authored report definitions.
        // Lives in MF_ReportDefinitions; see 01060030_AddReporting.cs for the
        // schema migration and Controllers/MegaFormController.Reports.cs for
        // the CRUD + runtime endpoints.
        public virtual DbSet<MegaForm.Oqtane.Server.Controllers.ReportDefinitionRow> ReportDefinitions { get; set; }

        // [ATBE P1] Forms bound to a table in a CUSTOMER database, and the anchor rows that let a
        // MegaForm submission id address one of that table's records. See ExternalTableStores.cs.
        public virtual DbSet<ExternalBindingRow> ExternalBindings { get; set; }
        public virtual DbSet<ExternalRowMapRow> ExternalRowMap { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<ExternalBindingRow>(e =>
            {
                e.ToTable("MF_ExternalBinding");
                e.HasKey(x => x.FormId);
                e.Property(x => x.FormId).ValueGeneratedNever();
                e.Property(x => x.ConnectionKey).HasMaxLength(100);
                e.Property(x => x.DatabaseType).HasMaxLength(50);
                e.Property(x => x.SchemaName).HasMaxLength(128);
                e.Property(x => x.TableName).HasMaxLength(128);
                e.Property(x => x.ProfileHash).HasMaxLength(80);
                e.Property(x => x.Mode).HasMaxLength(20);
            });

            modelBuilder.Entity<ExternalRowMapRow>(e =>
            {
                e.ToTable("MF_ExternalRowMap");
                e.HasKey(x => x.SubmissionId);
                e.Property(x => x.SubmissionId).ValueGeneratedNever();   // the anchor id comes from MF_Submissions
                e.Property(x => x.RowKeyHash).HasMaxLength(64).IsRequired();
                e.Property(x => x.RowKeyJson).HasMaxLength(900).IsRequired();
                // The database, not application code, is what guarantees one anchor per customer row.
                e.HasIndex(x => new { x.FormId, x.RowKeyHash }).IsUnique();
            });

            modelBuilder.Entity<FormInfo>(e =>
            {
                e.ToTable("MF_Forms");
                e.HasKey(x => x.FormId);
                e.Property(x => x.Title).HasMaxLength(500);

                // [OQ-difix20260418-06] FormInfo.SubmissionCount is a computed/runtime
                // property (see comment in MegaForm.Core/Models/EntityModels.cs:59 —
                // "// Computed"). It is NOT migrated as a real column in
                // FormEntityBuilder.cs and the table MF_Forms genuinely does not have
                // it. Without this Ignore(), EF's INSERT/UPDATE statements include
                // `SubmissionCount` and SQLite errors with:
                //   "table MF_Forms has no column named SubmissionCount"
                // → ExceptionMiddleware → 400 Bad Request → Save silently fails.
                //
                // Done in Fluent API rather than [NotMapped] on the property to keep
                // the fix scoped to the Oqtane build. DNN handles this same property
                // via a runtime HasColumn() check (FormRepository.cs:604-605).
                // To populate the count for read scenarios, query MF_Submissions
                // separately and assign to the in-memory FormInfo instance.
                e.Ignore(x => x.SubmissionCount);
            });

            modelBuilder.Entity<SubmissionInfo>(e =>
            {
                e.ToTable("MF_Submissions");
                e.HasKey(x => x.SubmissionId);
                e.HasIndex(x => new { x.FormId, x.SubmittedOnUtc });
                // [B196] Backs the dominant "list form X, status S, newest-first,
                // page N" submissions query. Named explicitly so the model matches
                // the migration 01060034_AddSubmissionStatusIndex that creates it.
                e.HasIndex(x => new { x.FormId, x.Status, x.SubmittedOnUtc })
                    .HasDatabaseName("IX_MF_Submissions_FormId_Status_SubmittedOnUtc");
                // [Perf 2026-07-11] The Submissions landing page counts every form's submissions
                // (WHERE IsSpam = 0 GROUP BY FormId). IsSpam was in no index, so that count scanned
                // the whole table — 19.5s on a site with a million submissions, which blew the 30s
                // command timeout and left the page showing "Unable to load the forms overview".
                // With this index the same count takes ~0.45s.
                // NOTE: Oqtane builds the schema from the EF model, so a FRESH install gets this
                // index — but it never runs migration Up() bodies, so EXISTING sites need the
                // CREATE INDEX run by hand.
                e.HasIndex(x => new { x.IsSpam, x.FormId, x.SubmittedOnUtc })
                    .HasDatabaseName("IX_MF_Submissions_Spam_Form_Date");
            });

            modelBuilder.Entity<SubmissionValueInfo>(e =>
            {
                e.ToTable("MF_SubmissionValues");
                e.HasKey(x => x.ValueId);
            });

            modelBuilder.Entity<Core.Models.FileInfo>(e =>
            {
                e.ToTable("MF_Files");
                e.HasKey(x => x.FileId);
            });

            modelBuilder.Entity<SavedDraftInfo>(e =>
            {
                e.ToTable("MF_SavedDrafts");
                e.HasKey(x => x.DraftId);
                e.HasIndex(x => x.ResumeToken).IsUnique();
            });

            modelBuilder.Entity<WebhookLogInfo>(e =>
            {
                e.ToTable("MF_WebhookLog");
                e.HasKey(x => x.LogId);
            });

            modelBuilder.Entity<AppDefinitionInfo>(e =>
            {
                e.ToTable("MF_Apps");
                e.HasKey(x => x.AppId);
                e.HasIndex(x => new { x.PortalId, x.AppKey }).IsUnique();
                e.HasIndex(x => new { x.PortalId, x.AppScope });
            });

            modelBuilder.Entity<AppQueryDefinitionInfo>(e =>
            {
                e.ToTable("MF_AppQueries");
                e.HasKey(x => x.QueryId);
                e.HasIndex(x => new { x.AppId, x.QueryKey }).IsUnique();
                e.HasIndex(x => new { x.AppId, x.FormId });
            });

            modelBuilder.Entity<FormViewInfo>(e =>
            {
                e.ToTable("MF_Views");
                e.HasKey(x => x.ViewId);
                // QueryKey is optional. Existing rows created before Phase 2 have
                // NULL in this column, so Oqtane must not treat it as a required
                // non-null string during materialization.
                e.Property(x => x.QueryKey).HasMaxLength(100).IsRequired(false);
            });

            modelBuilder.Entity<FormRelationInfo>(e =>
            {
                e.ToTable("MF_FormRelations");
                e.HasKey(x => x.RelationId);
                e.HasIndex(x => x.ParentFormId);
                e.HasIndex(x => x.ChildFormId);
            });

            modelBuilder.Entity<SubmissionLinkInfo>(e =>
            {
                e.ToTable("MF_SubmissionLinks");
                e.HasKey(x => x.LinkId);
                e.HasIndex(x => new { x.RelationId, x.ParentSubmissionId, x.ChildSubmissionId }).IsUnique();
                e.HasIndex(x => new { x.ParentSubmissionId, x.RelationId });
            });

            modelBuilder.Entity<TemplateInfo>(e =>
            {
                e.ToTable("MF_Templates");
                e.HasKey(x => x.TemplateId);
            });

            modelBuilder.Entity<FormPermissionInfo>(e =>
            {
                e.ToTable("MF_Permissions");
                e.HasKey(x => x.PermissionId);
            });

            modelBuilder.Entity<WorkflowInfo>(e =>
            {
                e.ToTable("MF_Workflows");
                e.HasKey(x => x.WorkflowId);
            });

            modelBuilder.Entity<WorkflowExecutionRow>(e =>
            {
                e.ToTable("MF_WorkflowExecutions");
                e.HasKey(x => x.ExecutionId);
                e.HasIndex(x => new { x.FormId, x.StartedAt });
            });

            modelBuilder.Entity<WorkflowCaseRow>(e =>
            {
                e.ToTable("MF_WorkflowCases");
                e.HasKey(x => x.CaseId);
                e.HasIndex(x => x.ExecutionId);
                e.HasIndex(x => new { x.FormId, x.SubmissionId, x.Status });
            });

            modelBuilder.Entity<WorkflowTaskRow>(e =>
            {
                e.ToTable("MF_WorkflowTasks");
                e.HasKey(x => x.TaskId);
                e.HasIndex(x => new { x.CaseId, x.Status });
                e.HasIndex(x => new { x.ExecutionId, x.NodeId, x.Status });
                e.HasIndex(x => new { x.FormId, x.SubmissionId, x.Status });
            });

            modelBuilder.Entity<WorkflowTaskActionRow>(e =>
            {
                e.ToTable("MF_WorkflowTaskActions");
                e.HasKey(x => x.ActionId);
                e.HasIndex(x => new { x.TaskId, x.CreatedAt });
                e.HasIndex(x => new { x.CaseId, x.CreatedAt });
            });

            modelBuilder.Entity<WorkflowTemplateInfo>(e =>
            {
                e.ToTable("MF_WorkflowTemplates");
                e.HasKey(x => x.WorkflowTemplateId);
                e.HasIndex(x => new { x.PortalId, x.TemplateKey }).IsUnique();
                e.HasIndex(x => new { x.PortalId, x.IsEnabled });
                e.Property(x => x.TemplateKey).HasMaxLength(120);
                e.Property(x => x.Name).HasMaxLength(200);
                e.Property(x => x.Description).HasMaxLength(1000);
                e.Property(x => x.Category).HasMaxLength(100);
            });

            modelBuilder.Entity<WorkflowTemplateVersionInfo>(e =>
            {
                e.ToTable("MF_WorkflowTemplateVersions");
                e.HasKey(x => x.WorkflowVersionId);
                e.HasIndex(x => new { x.WorkflowTemplateId, x.Version }).IsUnique();
                e.HasIndex(x => new { x.WorkflowTemplateId, x.IsApplied });
                e.Property(x => x.Version).HasMaxLength(40);
                e.Property(x => x.Notes).HasMaxLength(1000);
            });

            modelBuilder.Entity<FormWorkflowMappingInfo>(e =>
            {
                e.ToTable("MF_FormWorkflows");
                e.HasKey(x => x.MappingId);
                e.HasIndex(x => new { x.FormId, x.IsActive });
                e.HasIndex(x => new { x.WorkflowTemplateId, x.IsActive });
                e.Property(x => x.TriggerType).HasMaxLength(40);
                e.Property(x => x.AppliedBy).HasMaxLength(200);
            });

            // [v20260530-20] AI Knowledge Base — 5 sibling tables.
            // [B53] Added WidgetType + Surface columns for scoped KB lookup.
            modelBuilder.Entity<AiKnowledgeEntry>(e =>
            {
                e.ToTable("MF_AI_Knowledge");
                e.HasKey(x => x.Id);
                e.HasIndex(x => new { x.Slug, x.PortalId }).IsUnique();
                e.HasIndex(x => x.Kind);
                e.HasIndex(x => x.Source);
                e.HasIndex(x => new { x.WidgetType, x.Surface }).HasDatabaseName("IX_MF_AI_Knowledge_Widget_Surface");
                e.Property(x => x.Slug).HasMaxLength(160);
                e.Property(x => x.Kind).HasMaxLength(40);
                e.Property(x => x.Title).HasMaxLength(200);
                e.Property(x => x.Summary).HasMaxLength(500);
                e.Property(x => x.Tags).HasMaxLength(500);
                e.Property(x => x.Source).HasMaxLength(40);
                e.Property(x => x.WidgetType).HasMaxLength(80);
                e.Property(x => x.Surface).HasMaxLength(80);
            });

            modelBuilder.Entity<AiKnowledgeHistory>(e =>
            {
                e.ToTable("MF_AI_Knowledge_History");
                e.HasKey(x => x.HistoryId);
                e.HasIndex(x => x.KnowledgeId);
                e.Property(x => x.Slug).HasMaxLength(160);
                e.Property(x => x.Kind).HasMaxLength(40);
                e.Property(x => x.Title).HasMaxLength(200);
                e.Property(x => x.Summary).HasMaxLength(500);
                e.Property(x => x.Tags).HasMaxLength(500);
                e.Property(x => x.Source).HasMaxLength(40);
                e.Property(x => x.ChangeAction).HasMaxLength(16);
            });

            modelBuilder.Entity<KbTemplate>(e =>
            {
                e.ToTable("MF_AI_KB_Templates");
                e.HasKey(x => x.Id);
                e.HasIndex(x => x.KnowledgeId);
                e.HasIndex(x => x.Kind);
                e.HasIndex(x => x.Source);
                e.HasIndex(x => new { x.KnowledgeId, x.TemplateKey, x.PortalId }).IsUnique();
                e.Property(x => x.TemplateKey).HasMaxLength(80);
                e.Property(x => x.Kind).HasMaxLength(40);
                e.Property(x => x.Title).HasMaxLength(200);
                e.Property(x => x.Summary).HasMaxLength(500);
                e.Property(x => x.Tags).HasMaxLength(500);
                e.Property(x => x.Source).HasMaxLength(40);
            });

            modelBuilder.Entity<KbRule>(e =>
            {
                e.ToTable("MF_AI_KB_Rules");
                e.HasKey(x => x.RuleId);
                e.HasIndex(x => x.WidgetType);
                e.HasIndex(x => x.KnowledgeId);
                e.Property(x => x.RuleId).HasMaxLength(40);
                e.Property(x => x.WidgetType).HasMaxLength(60);
                e.Property(x => x.Title).HasMaxLength(200);
                e.Property(x => x.Severity).HasMaxLength(20);
                e.Property(x => x.RegexPattern).HasMaxLength(500);
                e.Property(x => x.Source).HasMaxLength(40);
            });

            modelBuilder.Entity<KbFeedback>(e =>
            {
                e.ToTable("MF_AI_KB_Feedback");
                e.HasKey(x => x.Id);
                e.HasIndex(x => new { x.WidgetType, x.Promoted, x.CreatedOnDate });
                e.HasIndex(x => new { x.Outcome, x.CreatedOnDate });
                e.HasIndex(x => new { x.RuleId, x.CreatedOnDate });
                e.Property(x => x.SessionId).HasMaxLength(80);
                e.Property(x => x.RuleId).HasMaxLength(40);
                e.Property(x => x.WidgetType).HasMaxLength(60);
                e.Property(x => x.Op).HasMaxLength(40);
                e.Property(x => x.Outcome).HasMaxLength(20);
                e.Property(x => x.ReviewNotes).HasMaxLength(1000);
            });

            // [B55 v20260603] Reporting System — report definitions.
            modelBuilder.Entity<MegaForm.Oqtane.Server.Controllers.ReportDefinitionRow>(e =>
            {
                e.ToTable("MF_ReportDefinitions");
                e.HasKey(x => x.ReportId);
                e.HasIndex(x => new { x.PortalId, x.AppScope });
                e.Property(x => x.Name).HasMaxLength(120);
                e.Property(x => x.AppScope).HasMaxLength(120);
            });
        }
    }
}
