using System;
using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;

namespace MegaForm.Oqtane.Server.Migrations
{
    /// <summary>
    /// MegaForm 01.06.41 — durable workflow timer (Cloud-Ready Track A2).
    ///
    /// Adds:
    ///   MF_WorkflowExecutions.WaitUntilUtc   Delay node wake time
    ///   MF_WorkflowExecutions.LeaseOwner     timer-scanner claim owner
    ///   MF_WorkflowExecutions.LeaseUntilUtc  timer-scanner claim expiry
    ///   index (Status, WaitUntilUtc)         scanner candidate query
    ///   MF_WorkflowTasks.EscalatedAtUtc      one-shot overdue reminder marker
    ///
    /// NOTE: On Oqtane this Up() never runs — MegaFormManager.InstallSchemaFromModel builds
    /// the schema from the EF model (GenerateCreateScript) and SeedMigrationHistory marks every
    /// migration applied without executing it. This migration exists for DNN/EF completeness and
    /// must stay parallel with the MegaFormDbContext mappings.
    /// </summary>
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.06.00.41")]
    public class AddWorkflowTimerColumns : MultiDatabaseMigration
    {
        public AddWorkflowTimerColumns(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "WaitUntilUtc",
                table: "MF_WorkflowExecutions",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LeaseOwner",
                table: "MF_WorkflowExecutions",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LeaseUntilUtc",
                table: "MF_WorkflowExecutions",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "EscalatedAtUtc",
                table: "MF_WorkflowTasks",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_MF_WorkflowExecutions_Status_WaitUntilUtc",
                table: "MF_WorkflowExecutions",
                columns: new[] { "Status", "WaitUntilUtc" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_MF_WorkflowExecutions_Status_WaitUntilUtc",
                table: "MF_WorkflowExecutions");

            migrationBuilder.DropColumn(name: "EscalatedAtUtc", table: "MF_WorkflowTasks");
            migrationBuilder.DropColumn(name: "LeaseUntilUtc", table: "MF_WorkflowExecutions");
            migrationBuilder.DropColumn(name: "LeaseOwner", table: "MF_WorkflowExecutions");
            migrationBuilder.DropColumn(name: "WaitUntilUtc", table: "MF_WorkflowExecutions");
        }
    }
}
