using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;

namespace MegaForm.Oqtane.Server.Migrations
{
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.05.02.01")]
    public class AddFormViewQueryKey : MultiDatabaseMigration
    {
        public AddFormViewQueryKey(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "QueryKey",
                table: "MF_Views",
                maxLength: 100,
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "QueryKey",
                table: "MF_Views");
        }
    }
}
