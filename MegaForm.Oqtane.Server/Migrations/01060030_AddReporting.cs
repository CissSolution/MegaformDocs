using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using System;

namespace MegaForm.Oqtane.Server.Migrations
{
    /// <summary>
    /// MegaForm 01.06.30 — Oqtane parity for B55 Reporting System.
    ///
    /// Adds:
    ///   MF_ReportDefinitions       (customer-authored report definitions,
    ///                               JSON body, per-portal, optional AppScope)
    ///
    /// And amends:
    ///   MF_SubmissionValues        +FormId column + two reporting indexes
    ///                               so report queries can filter by FormId
    ///                               without joining MF_Submissions.
    ///
    /// The DNN twin lives in MegaForm.DNN\SqlScripts\01.06.30.SqlDataProvider.
    /// Keep both in sync when extending the report runtime.
    /// </summary>
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.06.00.30")]
    public class AddReporting : MultiDatabaseMigration
    {
        public AddReporting(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── 1. MF_ReportDefinitions ────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "MF_ReportDefinitions",
                columns: table => new
                {
                    ReportId = table.Column<int>(nullable: false)
                                    .Annotation("SqlServer:Identity", "1, 1")
                                    .Annotation("Sqlite:Autoincrement", true),
                    PortalId = table.Column<int>(nullable: false),
                    Name = table.Column<string>(maxLength: 120, nullable: false),
                    AppScope = table.Column<string>(maxLength: 120, nullable: true),
                    DefinitionJson = table.Column<string>(nullable: false),
                    CreatedByUserId = table.Column<int>(nullable: true),
                    CreatedOnUtc = table.Column<DateTime>(nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    UpdatedOnUtc = table.Column<DateTime>(nullable: true),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_ReportDefinitions", x => x.ReportId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MF_ReportDefinitions_PortalId",
                table: "MF_ReportDefinitions",
                columns: new[] { "PortalId", "AppScope" });

            // ── 2. MF_SubmissionValues FormId column + reporting indexes ──
            // The Oqtane MultiDatabaseMigration runs on SQL Server, SQLite,
            // MySQL, and PostgreSQL. AddColumn is portable across all four;
            // CreateIndex too. The DNN twin guards each statement with
            // IF NOT EXISTS — EF migrations get the same idempotence via
            // the __EFMigrationsHistory table, so we don't repeat the guards
            // here.
            migrationBuilder.AddColumn<int>(
                name: "FormId",
                table: "MF_SubmissionValues",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_MF_SubmissionValues_FormId_FieldKey",
                table: "MF_SubmissionValues",
                columns: new[] { "FormId", "FieldKey" });

            migrationBuilder.CreateIndex(
                name: "IX_MF_SubmissionValues_FormId_ValueDate",
                table: "MF_SubmissionValues",
                columns: new[] { "FormId", "ValueDate" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_MF_SubmissionValues_FormId_ValueDate",
                table: "MF_SubmissionValues");

            migrationBuilder.DropIndex(
                name: "IX_MF_SubmissionValues_FormId_FieldKey",
                table: "MF_SubmissionValues");

            migrationBuilder.DropColumn(
                name: "FormId",
                table: "MF_SubmissionValues");

            migrationBuilder.DropTable(name: "MF_ReportDefinitions");
        }
    }
}
