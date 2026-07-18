using System;
using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;

namespace MegaForm.Oqtane.Server.Migrations
{
    /// <summary>
    /// MegaForm 01.06.39 — Umbraco Forms-style typed submission storage.
    ///
    /// Adds:
    ///   MF_SubmissionFields          one row per submitted logical field + metadata snapshot
    ///   MF_SubmissionValueString     typed value rows (short string)
    ///   MF_SubmissionValueLongText   typed value rows (nvarchar(max))
    ///   MF_SubmissionValueNumber     typed value rows (decimal(18,6))
    ///   MF_SubmissionValueDate       typed value rows (datetime)
    ///   MF_SubmissionValueBoolean    typed value rows (bit)
    ///   MF_SubmissionValueJson       field-scoped JSON value rows (NOT the legacy DataJson)
    ///
    /// NOTE: On Oqtane this Up() never runs — MegaFormManager.InstallSchemaFromModel builds
    /// the schema from the EF model (GenerateCreateScript) and SeedMigrationHistory marks every
    /// migration applied without executing it. This migration exists for DNN/EF completeness and
    /// must stay parallel with the MegaFormDbContext mappings. Written in parallel with the legacy
    /// MF_Submissions.DataJson payload; DataJson stays the runtime source of truth in Phase 1
    /// (write-only).
    /// </summary>
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.06.00.39")]
    public class AddTypedSubmissionStorage : MultiDatabaseMigration
    {
        public AddTypedSubmissionStorage(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MF_SubmissionFields",
                columns: table => new
                {
                    SubmissionFieldId = table.Column<long>(nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1")
                        .Annotation("Sqlite:Autoincrement", true),
                    SubmissionId = table.Column<int>(nullable: false),
                    FormId = table.Column<int>(nullable: false),
                    FormFieldId = table.Column<long>(nullable: true),
                    FieldKey = table.Column<string>(maxLength: 256, nullable: true),
                    FieldId = table.Column<string>(maxLength: 256, nullable: true),
                    FieldAlias = table.Column<string>(maxLength: 256, nullable: true),
                    FieldType = table.Column<string>(maxLength: 128, nullable: true),
                    DataType = table.Column<string>(maxLength: 64, nullable: true),
                    LabelSnapshot = table.Column<string>(maxLength: 512, nullable: true),
                    PageIndex = table.Column<int>(nullable: true),
                    FieldOrder = table.Column<int>(nullable: true),
                    DisplayValue = table.Column<string>(nullable: true),
                    HasValue = table.Column<bool>(nullable: false, defaultValue: false),
                    IsSensitive = table.Column<bool>(nullable: false, defaultValue: false),
                    CreatedOnUtc = table.Column<DateTime>(nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    UpdatedOnUtc = table.Column<DateTime>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_SubmissionFields", x => x.SubmissionFieldId);
                    table.ForeignKey(
                        name: "FK_MF_SubmissionFields_MF_Submissions",
                        column: x => x.SubmissionId,
                        principalTable: "MF_Submissions",
                        principalColumn: "SubmissionId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MF_SubmissionValueString",
                columns: table => new
                {
                    Id = table.Column<long>(nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1")
                        .Annotation("Sqlite:Autoincrement", true),
                    SubmissionFieldId = table.Column<long>(nullable: false),
                    SubmissionId = table.Column<int>(nullable: false),
                    FormId = table.Column<int>(nullable: false),
                    FieldKey = table.Column<string>(maxLength: 256, nullable: true),
                    Ordinal = table.Column<int>(nullable: false, defaultValue: 0),
                    Value = table.Column<string>(maxLength: 1024, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_SubmissionValueString", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MF_SubmissionValueString_MF_SubmissionFields",
                        column: x => x.SubmissionFieldId,
                        principalTable: "MF_SubmissionFields",
                        principalColumn: "SubmissionFieldId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MF_SubmissionValueLongText",
                columns: table => new
                {
                    Id = table.Column<long>(nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1")
                        .Annotation("Sqlite:Autoincrement", true),
                    SubmissionFieldId = table.Column<long>(nullable: false),
                    SubmissionId = table.Column<int>(nullable: false),
                    FormId = table.Column<int>(nullable: false),
                    FieldKey = table.Column<string>(maxLength: 256, nullable: true),
                    Ordinal = table.Column<int>(nullable: false, defaultValue: 0),
                    Value = table.Column<string>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_SubmissionValueLongText", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MF_SubmissionValueLongText_MF_SubmissionFields",
                        column: x => x.SubmissionFieldId,
                        principalTable: "MF_SubmissionFields",
                        principalColumn: "SubmissionFieldId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MF_SubmissionValueNumber",
                columns: table => new
                {
                    Id = table.Column<long>(nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1")
                        .Annotation("Sqlite:Autoincrement", true),
                    SubmissionFieldId = table.Column<long>(nullable: false),
                    SubmissionId = table.Column<int>(nullable: false),
                    FormId = table.Column<int>(nullable: false),
                    FieldKey = table.Column<string>(maxLength: 256, nullable: true),
                    Ordinal = table.Column<int>(nullable: false, defaultValue: 0),
                    Value = table.Column<decimal>(type: "decimal(18,6)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_SubmissionValueNumber", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MF_SubmissionValueNumber_MF_SubmissionFields",
                        column: x => x.SubmissionFieldId,
                        principalTable: "MF_SubmissionFields",
                        principalColumn: "SubmissionFieldId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MF_SubmissionValueDate",
                columns: table => new
                {
                    Id = table.Column<long>(nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1")
                        .Annotation("Sqlite:Autoincrement", true),
                    SubmissionFieldId = table.Column<long>(nullable: false),
                    SubmissionId = table.Column<int>(nullable: false),
                    FormId = table.Column<int>(nullable: false),
                    FieldKey = table.Column<string>(maxLength: 256, nullable: true),
                    Ordinal = table.Column<int>(nullable: false, defaultValue: 0),
                    Value = table.Column<DateTime>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_SubmissionValueDate", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MF_SubmissionValueDate_MF_SubmissionFields",
                        column: x => x.SubmissionFieldId,
                        principalTable: "MF_SubmissionFields",
                        principalColumn: "SubmissionFieldId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MF_SubmissionValueBoolean",
                columns: table => new
                {
                    Id = table.Column<long>(nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1")
                        .Annotation("Sqlite:Autoincrement", true),
                    SubmissionFieldId = table.Column<long>(nullable: false),
                    SubmissionId = table.Column<int>(nullable: false),
                    FormId = table.Column<int>(nullable: false),
                    FieldKey = table.Column<string>(maxLength: 256, nullable: true),
                    Ordinal = table.Column<int>(nullable: false, defaultValue: 0),
                    Value = table.Column<bool>(nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_SubmissionValueBoolean", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MF_SubmissionValueBoolean_MF_SubmissionFields",
                        column: x => x.SubmissionFieldId,
                        principalTable: "MF_SubmissionFields",
                        principalColumn: "SubmissionFieldId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MF_SubmissionValueJson",
                columns: table => new
                {
                    Id = table.Column<long>(nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1")
                        .Annotation("Sqlite:Autoincrement", true),
                    SubmissionFieldId = table.Column<long>(nullable: false),
                    SubmissionId = table.Column<int>(nullable: false),
                    FormId = table.Column<int>(nullable: false),
                    FieldKey = table.Column<string>(maxLength: 256, nullable: true),
                    Ordinal = table.Column<int>(nullable: false, defaultValue: 0),
                    Value = table.Column<string>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_SubmissionValueJson", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MF_SubmissionValueJson_MF_SubmissionFields",
                        column: x => x.SubmissionFieldId,
                        principalTable: "MF_SubmissionFields",
                        principalColumn: "SubmissionFieldId",
                        onDelete: ReferentialAction.Cascade);
                });

            // MF_SubmissionFields indexes
            migrationBuilder.CreateIndex(
                name: "IX_MF_SubmissionFields_Submission_FieldKey",
                table: "MF_SubmissionFields",
                columns: new[] { "SubmissionId", "FieldKey" });
            migrationBuilder.CreateIndex(
                name: "IX_MF_SubmissionFields_Form_FieldKey",
                table: "MF_SubmissionFields",
                columns: new[] { "FormId", "FieldKey" });
            migrationBuilder.CreateIndex(
                name: "IX_MF_SubmissionFields_SubmissionId",
                table: "MF_SubmissionFields",
                column: "SubmissionId");
            migrationBuilder.CreateIndex(
                name: "IX_MF_SubmissionFields_Form_DataType",
                table: "MF_SubmissionFields",
                columns: new[] { "FormId", "DataType" });

            // Typed value table indexes (FieldId + SubmissionId everywhere; Form_Field(_Value) per type)
            CreateValueIndexes(migrationBuilder, "MF_SubmissionValueString", indexValue: false);
            CreateValueIndexes(migrationBuilder, "MF_SubmissionValueLongText", indexValue: false);
            CreateValueIndexes(migrationBuilder, "MF_SubmissionValueNumber", indexValue: true);
            CreateValueIndexes(migrationBuilder, "MF_SubmissionValueDate", indexValue: true);
            CreateValueIndexes(migrationBuilder, "MF_SubmissionValueBoolean", indexValue: true);
            CreateValueIndexes(migrationBuilder, "MF_SubmissionValueJson", indexValue: false);
        }

        private static void CreateValueIndexes(MigrationBuilder migrationBuilder, string tableName, bool indexValue)
        {
            migrationBuilder.CreateIndex(
                name: "IX_" + tableName + "_FieldId",
                table: tableName,
                column: "SubmissionFieldId");
            migrationBuilder.CreateIndex(
                name: "IX_" + tableName + "_SubmissionId",
                table: tableName,
                column: "SubmissionId");

            if (indexValue)
            {
                migrationBuilder.CreateIndex(
                    name: "IX_" + tableName + "_Form_Field_Value",
                    table: tableName,
                    columns: new[] { "FormId", "FieldKey", "Value" });
            }
            else
            {
                migrationBuilder.CreateIndex(
                    name: "IX_" + tableName + "_Form_Field",
                    table: tableName,
                    columns: new[] { "FormId", "FieldKey" });
            }
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "MF_SubmissionValueString");
            migrationBuilder.DropTable(name: "MF_SubmissionValueLongText");
            migrationBuilder.DropTable(name: "MF_SubmissionValueNumber");
            migrationBuilder.DropTable(name: "MF_SubmissionValueDate");
            migrationBuilder.DropTable(name: "MF_SubmissionValueBoolean");
            migrationBuilder.DropTable(name: "MF_SubmissionValueJson");
            migrationBuilder.DropTable(name: "MF_SubmissionFields");
        }
    }
}
