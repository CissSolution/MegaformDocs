using System;
using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;

namespace MegaForm.Oqtane.Server.Migrations
{
    /// <summary>
    /// MegaForm 01.06.38 — reusable workflow library.
    ///
    /// Adds:
    ///   MF_WorkflowTemplates          template header / catalog row
    ///   MF_WorkflowTemplateVersions   versioned WorkflowDefinition JSON
    ///   MF_FormWorkflows              form-to-template mapping + field mappings
    ///
    /// Runtime resolution is additive: mapped forms use the library definition;
    /// unmapped forms continue to execute MF_Forms.WorkflowJson.
    /// </summary>
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.06.00.38")]
    public class AddWorkflowLibrary : MultiDatabaseMigration
    {
        public AddWorkflowLibrary(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MF_WorkflowTemplates",
                columns: table => new
                {
                    WorkflowTemplateId = table.Column<int>(nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1")
                        .Annotation("Sqlite:Autoincrement", true),
                    PortalId = table.Column<int>(nullable: false),
                    TemplateKey = table.Column<string>(maxLength: 120, nullable: false),
                    Name = table.Column<string>(maxLength: 200, nullable: false),
                    Description = table.Column<string>(maxLength: 1000, nullable: true),
                    Category = table.Column<string>(maxLength: 100, nullable: true),
                    IsEnabled = table.Column<bool>(nullable: false, defaultValue: true),
                    CurrentVersionId = table.Column<int>(nullable: true),
                    CreatedByUserId = table.Column<int>(nullable: true),
                    CreatedOnUtc = table.Column<DateTime>(nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    UpdatedOnUtc = table.Column<DateTime>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_WorkflowTemplates", x => x.WorkflowTemplateId);
                });

            migrationBuilder.CreateTable(
                name: "MF_WorkflowTemplateVersions",
                columns: table => new
                {
                    WorkflowVersionId = table.Column<int>(nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1")
                        .Annotation("Sqlite:Autoincrement", true),
                    WorkflowTemplateId = table.Column<int>(nullable: false),
                    Version = table.Column<string>(maxLength: 40, nullable: false),
                    DefinitionJson = table.Column<string>(nullable: false),
                    Notes = table.Column<string>(maxLength: 1000, nullable: true),
                    IsApplied = table.Column<bool>(nullable: false, defaultValue: false),
                    CreatedByUserId = table.Column<int>(nullable: true),
                    CreatedOnUtc = table.Column<DateTime>(nullable: false, defaultValueSql: "SYSUTCDATETIME()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_WorkflowTemplateVersions", x => x.WorkflowVersionId);
                    table.ForeignKey(
                        name: "FK_MF_WorkflowTemplateVersions_MF_WorkflowTemplates",
                        column: x => x.WorkflowTemplateId,
                        principalTable: "MF_WorkflowTemplates",
                        principalColumn: "WorkflowTemplateId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MF_FormWorkflows",
                columns: table => new
                {
                    MappingId = table.Column<int>(nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1")
                        .Annotation("Sqlite:Autoincrement", true),
                    FormId = table.Column<int>(nullable: false),
                    WorkflowTemplateId = table.Column<int>(nullable: false),
                    WorkflowVersionId = table.Column<int>(nullable: true),
                    FieldMappingsJson = table.Column<string>(nullable: false),
                    TriggerType = table.Column<string>(maxLength: 40, nullable: false),
                    IsActive = table.Column<bool>(nullable: false, defaultValue: true),
                    AppliedByUserId = table.Column<int>(nullable: true),
                    AppliedBy = table.Column<string>(maxLength: 200, nullable: true),
                    AppliedOnUtc = table.Column<DateTime>(nullable: false, defaultValueSql: "SYSUTCDATETIME()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_FormWorkflows", x => x.MappingId);
                    table.ForeignKey(
                        name: "FK_MF_FormWorkflows_MF_Forms",
                        column: x => x.FormId,
                        principalTable: "MF_Forms",
                        principalColumn: "FormId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MF_FormWorkflows_MF_WorkflowTemplates",
                        column: x => x.WorkflowTemplateId,
                        principalTable: "MF_WorkflowTemplates",
                        principalColumn: "WorkflowTemplateId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MF_FormWorkflows_MF_WorkflowTemplateVersions",
                        column: x => x.WorkflowVersionId,
                        principalTable: "MF_WorkflowTemplateVersions",
                        principalColumn: "WorkflowVersionId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MF_WorkflowTemplates_PortalId_TemplateKey",
                table: "MF_WorkflowTemplates",
                columns: new[] { "PortalId", "TemplateKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MF_WorkflowTemplates_PortalId_IsEnabled",
                table: "MF_WorkflowTemplates",
                columns: new[] { "PortalId", "IsEnabled" });

            migrationBuilder.CreateIndex(
                name: "IX_MF_WorkflowTemplateVersions_Template_Version",
                table: "MF_WorkflowTemplateVersions",
                columns: new[] { "WorkflowTemplateId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MF_WorkflowTemplateVersions_Template_Applied",
                table: "MF_WorkflowTemplateVersions",
                columns: new[] { "WorkflowTemplateId", "IsApplied" });

            migrationBuilder.CreateIndex(
                name: "IX_MF_FormWorkflows_FormId_IsActive",
                table: "MF_FormWorkflows",
                columns: new[] { "FormId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_MF_FormWorkflows_Template_IsActive",
                table: "MF_FormWorkflows",
                columns: new[] { "WorkflowTemplateId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_MF_FormWorkflows_WorkflowVersionId",
                table: "MF_FormWorkflows",
                column: "WorkflowVersionId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "MF_FormWorkflows");
            migrationBuilder.DropTable(name: "MF_WorkflowTemplateVersions");
            migrationBuilder.DropTable(name: "MF_WorkflowTemplates");
        }
    }
}
