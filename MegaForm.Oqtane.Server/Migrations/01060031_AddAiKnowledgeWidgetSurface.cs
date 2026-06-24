using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;

namespace MegaForm.Oqtane.Server.Migrations
{
    /// <summary>
    /// MegaForm 01.06.31 — B53 Unified Designer AI panel scoping.
    ///
    /// Adds:
    ///   MF_AI_Knowledge.WidgetType  NVARCHAR(80) NULL
    ///   MF_AI_Knowledge.Surface     NVARCHAR(80) NULL
    ///   IX_MF_AI_Knowledge_Widget_Surface
    ///
    /// Powers the new AiKnowledge/SearchScoped endpoint that the Unified
    /// Designer slide-out AI drawer hits. Pre-migration sites still work
    /// — the controller falls back to a Tags-CSV LIKE match — but the
    /// indexed columns make queries fast and let admins curate per-widget
    /// guidance directly.
    ///
    /// The DNN twin is the migration script
    /// MegaForm.Core\Migrations\B53_MfAiKnowledge_WidgetSurface.sql, which
    /// is bundled into the next DNN SqlDataProvider release.
    /// </summary>
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.06.00.31")]
    public class AddAiKnowledgeWidgetSurface : MultiDatabaseMigration
    {
        public AddAiKnowledgeWidgetSurface(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "WidgetType",
                table: "MF_AI_Knowledge",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Surface",
                table: "MF_AI_Knowledge",
                maxLength: 80,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_MF_AI_Knowledge_Widget_Surface",
                table: "MF_AI_Knowledge",
                columns: new[] { "WidgetType", "Surface" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_MF_AI_Knowledge_Widget_Surface",
                table: "MF_AI_Knowledge");

            migrationBuilder.DropColumn(
                name: "Surface",
                table: "MF_AI_Knowledge");

            migrationBuilder.DropColumn(
                name: "WidgetType",
                table: "MF_AI_Knowledge");
        }
    }
}
