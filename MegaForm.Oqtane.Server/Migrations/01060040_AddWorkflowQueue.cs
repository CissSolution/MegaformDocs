using System;
using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;

namespace MegaForm.Oqtane.Server.Migrations
{
    /// <summary>
    /// MegaForm 01.06.40 — async workflow execution queue (Cloud-Ready Track A1).
    ///
    /// Adds:
    ///   MF_WorkflowQueue   DB-backed queue for post-submit workflow executions
    ///                      (queued/leased/done/failed + lease columns for
    ///                      multi-instance claiming)
    ///
    /// NOTE: On Oqtane this Up() never runs — MegaFormManager.InstallSchemaFromModel builds
    /// the schema from the EF model (GenerateCreateScript) and SeedMigrationHistory marks every
    /// migration applied without executing it. This migration exists for DNN/EF completeness and
    /// must stay parallel with the MegaFormDbContext mapping of WorkflowQueueRow.
    /// </summary>
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.06.00.40")]
    public class AddWorkflowQueue : MultiDatabaseMigration
    {
        public AddWorkflowQueue(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MF_WorkflowQueue",
                columns: table => new
                {
                    QueueId = table.Column<int>(nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1")
                        .Annotation("Sqlite:Autoincrement", true),
                    FormId = table.Column<int>(nullable: false),
                    SubmissionId = table.Column<int>(nullable: false),
                    PayloadJson = table.Column<string>(nullable: false),
                    Status = table.Column<string>(maxLength: 16, nullable: false, defaultValue: "queued"),
                    AttemptCount = table.Column<int>(nullable: false, defaultValue: 0),
                    LeasedBy = table.Column<string>(maxLength: 64, nullable: true),
                    LeaseUntilUtc = table.Column<DateTime>(nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    ProcessedAtUtc = table.Column<DateTime>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_WorkflowQueue", x => x.QueueId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MF_WorkflowQueue_Status_LeaseUntilUtc",
                table: "MF_WorkflowQueue",
                columns: new[] { "Status", "LeaseUntilUtc" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "MF_WorkflowQueue");
        }
    }
}
