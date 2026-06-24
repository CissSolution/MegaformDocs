using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;

namespace MegaForm.Oqtane.Server.Migrations
{
    /// <summary>
    /// MegaForm 01.06.34 — composite index for the dominant submissions list query.
    ///
    /// Adds:
    ///   IX_MF_Submissions_FormId_Status_SubmittedOnUtc  (FormId, Status, SubmittedOnUtc)
    ///
    /// Backs the "list form X, status S, newest-first, page N" access pattern that
    /// the submissions inbox / overview screens drive. The pre-existing
    /// (FormId, SubmittedOnUtc) index can only seek by form and then has to sort/scan
    /// to filter on Status; this index lets SQL Server seek straight to the
    /// (FormId, Status) slice and read it already ordered by SubmittedOnUtc, so the
    /// paged ORDER BY SubmittedOnUtc DESC needs no extra sort.
    ///
    /// The matching model mapping lives in MegaFormDbContext.OnModelCreating
    /// (SubmissionInfo) with the same explicit HasDatabaseName so EF and the live
    /// schema agree.
    /// </summary>
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.06.00.34")]
    public class AddSubmissionStatusIndex : MultiDatabaseMigration
    {
        public AddSubmissionStatusIndex(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_MF_Submissions_FormId_Status_SubmittedOnUtc",
                table: "MF_Submissions",
                columns: new[] { "FormId", "Status", "SubmittedOnUtc" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_MF_Submissions_FormId_Status_SubmittedOnUtc",
                table: "MF_Submissions");
        }
    }
}
