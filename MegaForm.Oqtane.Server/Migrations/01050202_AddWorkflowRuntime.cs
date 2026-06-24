using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using System;

namespace MegaForm.Oqtane.Server.Migrations
{
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.05.02.02")]
    public class AddWorkflowRuntime : MultiDatabaseMigration
    {
        public AddWorkflowRuntime(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MF_WorkflowExecutions",
                columns: table => new
                {
                    ExecutionId = table.Column<string>(maxLength: 64, nullable: false),
                    FormId = table.Column<int>(nullable: false),
                    SubmissionId = table.Column<int>(nullable: false),
                    Status = table.Column<string>(maxLength: 32, nullable: true),
                    StartedAt = table.Column<DateTime>(nullable: false),
                    CompletedAt = table.Column<DateTime>(nullable: true),
                    CurrentNodeId = table.Column<string>(maxLength: 128, nullable: true),
                    ContextJson = table.Column<string>(nullable: true),
                    ErrorMessage = table.Column<string>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_WorkflowExecutions", x => x.ExecutionId);
                });

            migrationBuilder.CreateTable(
                name: "MF_WorkflowCases",
                columns: table => new
                {
                    CaseId = table.Column<string>(maxLength: 64, nullable: false),
                    ExecutionId = table.Column<string>(maxLength: 64, nullable: true),
                    FormId = table.Column<int>(nullable: false),
                    SubmissionId = table.Column<int>(nullable: false),
                    WorkflowId = table.Column<string>(maxLength: 128, nullable: true),
                    CurrentNodeId = table.Column<string>(maxLength: 128, nullable: true),
                    Status = table.Column<string>(maxLength: 32, nullable: true),
                    StartedByUserId = table.Column<int>(nullable: true),
                    StartedByUserName = table.Column<string>(maxLength: 256, nullable: true),
                    ActiveTaskId = table.Column<string>(maxLength: 64, nullable: true),
                    Outcome = table.Column<string>(maxLength: 64, nullable: true),
                    LastComment = table.Column<string>(nullable: true),
                    CreatedAt = table.Column<DateTime>(nullable: false),
                    CompletedAt = table.Column<DateTime>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_WorkflowCases", x => x.CaseId);
                });

            migrationBuilder.CreateTable(
                name: "MF_WorkflowTasks",
                columns: table => new
                {
                    TaskId = table.Column<string>(maxLength: 64, nullable: false),
                    CaseId = table.Column<string>(maxLength: 64, nullable: true),
                    ExecutionId = table.Column<string>(maxLength: 64, nullable: true),
                    FormId = table.Column<int>(nullable: false),
                    SubmissionId = table.Column<int>(nullable: false),
                    NodeId = table.Column<string>(maxLength: 128, nullable: true),
                    NodeLabel = table.Column<string>(maxLength: 256, nullable: true),
                    Status = table.Column<string>(maxLength: 32, nullable: true),
                    CandidateRolesJson = table.Column<string>(nullable: true),
                    CandidateUsersJson = table.Column<string>(nullable: true),
                    AssignedUserId = table.Column<int>(nullable: true),
                    AssignedUserName = table.Column<string>(maxLength: 256, nullable: true),
                    AssignedDisplayName = table.Column<string>(maxLength: 256, nullable: true),
                    AllowClaim = table.Column<bool>(nullable: false),
                    AllowForward = table.Column<bool>(nullable: false),
                    AllowReassign = table.Column<bool>(nullable: false),
                    CommentRequiredOnReject = table.Column<bool>(nullable: false),
                    PendingSubmissionStatus = table.Column<string>(maxLength: 64, nullable: true),
                    ApprovedSubmissionStatus = table.Column<string>(maxLength: 64, nullable: true),
                    RejectedSubmissionStatus = table.Column<string>(maxLength: 64, nullable: true),
                    Outcome = table.Column<string>(maxLength: 64, nullable: true),
                    Comment = table.Column<string>(nullable: true),
                    CreatedAt = table.Column<DateTime>(nullable: false),
                    ClaimedAt = table.Column<DateTime>(nullable: true),
                    DueAt = table.Column<DateTime>(nullable: true),
                    CompletedAt = table.Column<DateTime>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_WorkflowTasks", x => x.TaskId);
                });

            migrationBuilder.CreateTable(
                name: "MF_WorkflowTaskActions",
                columns: table => new
                {
                    ActionId = table.Column<string>(maxLength: 64, nullable: false),
                    TaskId = table.Column<string>(maxLength: 64, nullable: true),
                    CaseId = table.Column<string>(maxLength: 64, nullable: true),
                    ExecutionId = table.Column<string>(maxLength: 64, nullable: true),
                    FormId = table.Column<int>(nullable: false),
                    SubmissionId = table.Column<int>(nullable: false),
                    ActionType = table.Column<string>(maxLength: 64, nullable: true),
                    ActorUserId = table.Column<int>(nullable: true),
                    ActorUserName = table.Column<string>(maxLength: 256, nullable: true),
                    ActorDisplayName = table.Column<string>(maxLength: 256, nullable: true),
                    TargetUser = table.Column<string>(maxLength: 256, nullable: true),
                    Outcome = table.Column<string>(maxLength: 64, nullable: true),
                    Comment = table.Column<string>(nullable: true),
                    CreatedAt = table.Column<DateTime>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_WorkflowTaskActions", x => x.ActionId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MF_WorkflowExecutions_FormId_StartedAt",
                table: "MF_WorkflowExecutions",
                columns: new[] { "FormId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MF_WorkflowCases_ExecutionId",
                table: "MF_WorkflowCases",
                column: "ExecutionId");

            migrationBuilder.CreateIndex(
                name: "IX_MF_WorkflowCases_FormId_SubmissionId_Status",
                table: "MF_WorkflowCases",
                columns: new[] { "FormId", "SubmissionId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_MF_WorkflowTasks_CaseId_Status",
                table: "MF_WorkflowTasks",
                columns: new[] { "CaseId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_MF_WorkflowTasks_ExecutionId_NodeId_Status",
                table: "MF_WorkflowTasks",
                columns: new[] { "ExecutionId", "NodeId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_MF_WorkflowTasks_FormId_SubmissionId_Status",
                table: "MF_WorkflowTasks",
                columns: new[] { "FormId", "SubmissionId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_MF_WorkflowTaskActions_TaskId_CreatedAt",
                table: "MF_WorkflowTaskActions",
                columns: new[] { "TaskId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MF_WorkflowTaskActions_CaseId_CreatedAt",
                table: "MF_WorkflowTaskActions",
                columns: new[] { "CaseId", "CreatedAt" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "MF_WorkflowTaskActions");
            migrationBuilder.DropTable(name: "MF_WorkflowTasks");
            migrationBuilder.DropTable(name: "MF_WorkflowCases");
            migrationBuilder.DropTable(name: "MF_WorkflowExecutions");
        }
    }
}
