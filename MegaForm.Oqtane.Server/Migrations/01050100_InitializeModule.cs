using MegaForm.Oqtane.Server.Data;
using MegaForm.Oqtane.Server.Migrations.EntityBuilders;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;

namespace MegaForm.Oqtane.Server.Migrations
{
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.05.01.00")]
    public class InitializeModule : MultiDatabaseMigration
    {
        public InitializeModule(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            new FormEntityBuilder(migrationBuilder, ActiveDatabase).Create();
            new SubmissionEntityBuilder(migrationBuilder, ActiveDatabase).Create();
            new SubmissionValueEntityBuilder(migrationBuilder, ActiveDatabase).Create();
            new FileEntityBuilder(migrationBuilder, ActiveDatabase).Create();
            new SavedDraftEntityBuilder(migrationBuilder, ActiveDatabase).Create();
            new WebhookLogEntityBuilder(migrationBuilder, ActiveDatabase).Create();
            new FormViewEntityBuilder(migrationBuilder, ActiveDatabase).Create();
            new TemplateEntityBuilder(migrationBuilder, ActiveDatabase).Create();
            new FormPermissionEntityBuilder(migrationBuilder, ActiveDatabase).Create();
            new WorkflowEntityBuilder(migrationBuilder, ActiveDatabase).Create();

            migrationBuilder.CreateIndex(
                name: "IX_MF_Submissions_FormId_SubmittedOnUtc",
                table: "MF_Submissions",
                columns: new[] { "FormId", "SubmittedOnUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_MF_SavedDrafts_ResumeToken",
                table: "MF_SavedDrafts",
                column: "ResumeToken",
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_MF_SavedDrafts_ResumeToken", table: "MF_SavedDrafts");
            migrationBuilder.DropIndex(name: "IX_MF_Submissions_FormId_SubmittedOnUtc", table: "MF_Submissions");

            new WorkflowEntityBuilder(migrationBuilder, ActiveDatabase).Drop();
            new FormPermissionEntityBuilder(migrationBuilder, ActiveDatabase).Drop();
            new TemplateEntityBuilder(migrationBuilder, ActiveDatabase).Drop();
            new FormViewEntityBuilder(migrationBuilder, ActiveDatabase).Drop();
            new WebhookLogEntityBuilder(migrationBuilder, ActiveDatabase).Drop();
            new SavedDraftEntityBuilder(migrationBuilder, ActiveDatabase).Drop();
            new FileEntityBuilder(migrationBuilder, ActiveDatabase).Drop();
            new SubmissionValueEntityBuilder(migrationBuilder, ActiveDatabase).Drop();
            new SubmissionEntityBuilder(migrationBuilder, ActiveDatabase).Drop();
            new FormEntityBuilder(migrationBuilder, ActiveDatabase).Drop();
        }
    }
}
