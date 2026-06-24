using MegaForm.Oqtane.Server.Data;
using MegaForm.Oqtane.Server.Migrations.EntityBuilders;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;

namespace MegaForm.Oqtane.Server.Migrations
{
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.05.02.00")]
    public class AddAppFoundation : MultiDatabaseMigration
    {
        public AddAppFoundation(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            new AppDefinitionEntityBuilder(migrationBuilder, ActiveDatabase).Create();
            new AppQueryDefinitionEntityBuilder(migrationBuilder, ActiveDatabase).Create();
            new FormRelationEntityBuilder(migrationBuilder, ActiveDatabase).Create();
            new SubmissionLinkEntityBuilder(migrationBuilder, ActiveDatabase).Create();

            migrationBuilder.CreateIndex(
                name: "IX_MF_Apps_PortalId_AppKey",
                table: "MF_Apps",
                columns: new[] { "PortalId", "AppKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MF_Apps_PortalId_AppScope",
                table: "MF_Apps",
                columns: new[] { "PortalId", "AppScope" });

            migrationBuilder.CreateIndex(
                name: "IX_MF_AppQueries_AppId_QueryKey",
                table: "MF_AppQueries",
                columns: new[] { "AppId", "QueryKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MF_AppQueries_AppId_FormId",
                table: "MF_AppQueries",
                columns: new[] { "AppId", "FormId" });

            migrationBuilder.CreateIndex(
                name: "IX_MF_FormRelations_ParentFormId",
                table: "MF_FormRelations",
                column: "ParentFormId");

            migrationBuilder.CreateIndex(
                name: "IX_MF_FormRelations_ChildFormId",
                table: "MF_FormRelations",
                column: "ChildFormId");

            migrationBuilder.CreateIndex(
                name: "IX_MF_SubmissionLinks_RelationId_ParentSubmissionId_ChildSubmissionId",
                table: "MF_SubmissionLinks",
                columns: new[] { "RelationId", "ParentSubmissionId", "ChildSubmissionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MF_SubmissionLinks_ParentSubmissionId_RelationId",
                table: "MF_SubmissionLinks",
                columns: new[] { "ParentSubmissionId", "RelationId" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_MF_SubmissionLinks_ParentSubmissionId_RelationId", table: "MF_SubmissionLinks");
            migrationBuilder.DropIndex(name: "IX_MF_SubmissionLinks_RelationId_ParentSubmissionId_ChildSubmissionId", table: "MF_SubmissionLinks");
            migrationBuilder.DropIndex(name: "IX_MF_FormRelations_ChildFormId", table: "MF_FormRelations");
            migrationBuilder.DropIndex(name: "IX_MF_FormRelations_ParentFormId", table: "MF_FormRelations");
            migrationBuilder.DropIndex(name: "IX_MF_AppQueries_AppId_FormId", table: "MF_AppQueries");
            migrationBuilder.DropIndex(name: "IX_MF_AppQueries_AppId_QueryKey", table: "MF_AppQueries");
            migrationBuilder.DropIndex(name: "IX_MF_Apps_PortalId_AppScope", table: "MF_Apps");
            migrationBuilder.DropIndex(name: "IX_MF_Apps_PortalId_AppKey", table: "MF_Apps");

            new SubmissionLinkEntityBuilder(migrationBuilder, ActiveDatabase).Drop();
            new FormRelationEntityBuilder(migrationBuilder, ActiveDatabase).Drop();
            new AppQueryDefinitionEntityBuilder(migrationBuilder, ActiveDatabase).Drop();
            new AppDefinitionEntityBuilder(migrationBuilder, ActiveDatabase).Drop();
        }
    }
}
