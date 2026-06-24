using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using System;

namespace MegaForm.Oqtane.Server.Migrations
{
    /// <summary>
    /// MegaForm 01.06.28 — Oqtane parity for AI Knowledge Base.
    ///
    /// Creates the 5 tables that have so far only existed on DNN:
    ///   MF_AI_Knowledge          (canonical entries: widget / form_template /
    ///                             form_pattern / system_arch …)
    ///   MF_AI_Knowledge_History  (audit log of every entry edit)
    ///   MF_AI_KB_Templates       (per-entry concrete presets / patterns /
    ///                             promoted-from-feedback success rows)
    ///   MF_AI_KB_Rules           (dispatcher rules indexed by RuleId, e.g.
    ///                             DL-001, STYLE-001, LAYOUT-004 …)
    ///   MF_AI_KB_Feedback        (every dispatcher rejection / AI-self-reported
    ///                             failure — admin promotes good fixes to Templates)
    ///
    /// All FKs use cascade for child rows (templates / history / feedback) so
    /// deleting a parent entry tidies up. Indexes match the DNN SQL provider.
    /// </summary>
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.06.00.28")]
    public class AddAiKnowledgeKb : MultiDatabaseMigration
    {
        public AddAiKnowledgeKb(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── MF_AI_Knowledge ─────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "MF_AI_Knowledge",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                              .Annotation("SqlServer:Identity", "1, 1")
                              .Annotation("Sqlite:Autoincrement", true),
                    Slug = table.Column<string>(maxLength: 160, nullable: false),
                    Kind = table.Column<string>(maxLength: 40, nullable: false),
                    Title = table.Column<string>(maxLength: 200, nullable: false),
                    Summary = table.Column<string>(maxLength: 500, nullable: true),
                    Body = table.Column<string>(nullable: true),
                    Tags = table.Column<string>(maxLength: 500, nullable: true),
                    Examples = table.Column<string>(nullable: true),
                    PortalId = table.Column<int>(nullable: true),
                    Source = table.Column<string>(maxLength: 40, nullable: false, defaultValue: "customer"),
                    Version = table.Column<int>(nullable: false, defaultValue: 1),
                    CreatedByUserId = table.Column<int>(nullable: true),
                    CreatedOnDate = table.Column<DateTime>(nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    UpdatedByUserId = table.Column<int>(nullable: true),
                    UpdatedOnDate = table.Column<DateTime>(nullable: true),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_AI_Knowledge", x => x.Id);
                });
            migrationBuilder.CreateIndex(
                name: "UQ_MF_AI_Knowledge_Slug",
                table: "MF_AI_Knowledge",
                columns: new[] { "Slug", "PortalId" },
                unique: true);
            migrationBuilder.CreateIndex(name: "IX_MF_AI_Knowledge_Kind",   table: "MF_AI_Knowledge", column: "Kind");
            migrationBuilder.CreateIndex(name: "IX_MF_AI_Knowledge_Source", table: "MF_AI_Knowledge", column: "Source");

            // ── MF_AI_Knowledge_History ────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "MF_AI_Knowledge_History",
                columns: table => new
                {
                    HistoryId = table.Column<int>(nullable: false)
                                     .Annotation("SqlServer:Identity", "1, 1")
                                     .Annotation("Sqlite:Autoincrement", true),
                    KnowledgeId = table.Column<int>(nullable: false),
                    Slug = table.Column<string>(maxLength: 160, nullable: false),
                    Kind = table.Column<string>(maxLength: 40, nullable: false),
                    Title = table.Column<string>(maxLength: 200, nullable: false),
                    Summary = table.Column<string>(maxLength: 500, nullable: true),
                    Body = table.Column<string>(nullable: true),
                    Tags = table.Column<string>(maxLength: 500, nullable: true),
                    Examples = table.Column<string>(nullable: true),
                    Source = table.Column<string>(maxLength: 40, nullable: false),
                    Version = table.Column<int>(nullable: false),
                    ChangedByUserId = table.Column<int>(nullable: true),
                    ChangedOnDate = table.Column<DateTime>(nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    ChangeAction = table.Column<string>(maxLength: 16, nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_AI_Knowledge_History", x => x.HistoryId);
                });
            migrationBuilder.CreateIndex(name: "IX_MF_AI_Knowledge_Hist_KnowledgeId", table: "MF_AI_Knowledge_History", column: "KnowledgeId");

            // ── MF_AI_KB_Templates ─────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "MF_AI_KB_Templates",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                              .Annotation("SqlServer:Identity", "1, 1")
                              .Annotation("Sqlite:Autoincrement", true),
                    KnowledgeId = table.Column<int>(nullable: false),
                    TemplateKey = table.Column<string>(maxLength: 80, nullable: false),
                    Kind = table.Column<string>(maxLength: 40, nullable: false),
                    Title = table.Column<string>(maxLength: 200, nullable: false),
                    Summary = table.Column<string>(maxLength: 500, nullable: true),
                    Body = table.Column<string>(nullable: false),
                    Tags = table.Column<string>(maxLength: 500, nullable: true),
                    Score = table.Column<int>(nullable: false, defaultValue: 0),
                    SortOrder = table.Column<int>(nullable: false, defaultValue: 100),
                    PortalId = table.Column<int>(nullable: true),
                    Source = table.Column<string>(maxLength: 40, nullable: false, defaultValue: "customer"),
                    Version = table.Column<int>(nullable: false, defaultValue: 1),
                    CreatedByUserId = table.Column<int>(nullable: true),
                    CreatedOnDate = table.Column<DateTime>(nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    UpdatedByUserId = table.Column<int>(nullable: true),
                    UpdatedOnDate = table.Column<DateTime>(nullable: true),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_AI_KB_Templates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MF_AI_KBTpl_Knowledge",
                        column: x => x.KnowledgeId,
                        principalTable: "MF_AI_Knowledge",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
            migrationBuilder.CreateIndex(name: "IX_MF_AI_KBTpl_Knowledge", table: "MF_AI_KB_Templates", column: "KnowledgeId");
            migrationBuilder.CreateIndex(name: "IX_MF_AI_KBTpl_Kind",      table: "MF_AI_KB_Templates", column: "Kind");
            migrationBuilder.CreateIndex(name: "IX_MF_AI_KBTpl_Source",    table: "MF_AI_KB_Templates", column: "Source");
            migrationBuilder.CreateIndex(
                name: "UQ_MF_AI_KBTpl_Key",
                table: "MF_AI_KB_Templates",
                columns: new[] { "KnowledgeId", "TemplateKey", "PortalId" },
                unique: true);

            // ── MF_AI_KB_Rules ─────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "MF_AI_KB_Rules",
                columns: table => new
                {
                    RuleId = table.Column<string>(maxLength: 40, nullable: false),
                    KnowledgeId = table.Column<int>(nullable: true),
                    WidgetType = table.Column<string>(maxLength: 60, nullable: true),
                    Title = table.Column<string>(maxLength: 200, nullable: false),
                    Severity = table.Column<string>(maxLength: 20, nullable: false),
                    Condition = table.Column<string>(nullable: false),
                    RegexPattern = table.Column<string>(maxLength: 500, nullable: true),
                    RejectionMessage = table.Column<string>(nullable: false),
                    FixHint = table.Column<string>(nullable: false),
                    Source = table.Column<string>(maxLength: 40, nullable: false, defaultValue: "megaform-builtin"),
                    Version = table.Column<int>(nullable: false, defaultValue: 1),
                    Enabled = table.Column<bool>(nullable: false, defaultValue: true),
                    PortalId = table.Column<int>(nullable: true),
                    CreatedByUserId = table.Column<int>(nullable: true),
                    CreatedOnDate = table.Column<DateTime>(nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    UpdatedByUserId = table.Column<int>(nullable: true),
                    UpdatedOnDate = table.Column<DateTime>(nullable: true),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_AI_KB_Rules", x => x.RuleId);
                    table.ForeignKey(
                        name: "FK_MF_AI_KBRule_Knowledge",
                        column: x => x.KnowledgeId,
                        principalTable: "MF_AI_Knowledge",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });
            migrationBuilder.CreateIndex(name: "IX_MF_AI_KBRule_Widget",    table: "MF_AI_KB_Rules", column: "WidgetType");
            migrationBuilder.CreateIndex(name: "IX_MF_AI_KBRule_Knowledge", table: "MF_AI_KB_Rules", column: "KnowledgeId");

            // ── MF_AI_KB_Feedback ──────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "MF_AI_KB_Feedback",
                columns: table => new
                {
                    Id = table.Column<long>(nullable: false)
                              .Annotation("SqlServer:Identity", "1, 1")
                              .Annotation("Sqlite:Autoincrement", true),
                    SessionId = table.Column<string>(maxLength: 80, nullable: true),
                    RuleId = table.Column<string>(maxLength: 40, nullable: true),
                    KnowledgeId = table.Column<int>(nullable: true),
                    WidgetType = table.Column<string>(maxLength: 60, nullable: true),
                    Op = table.Column<string>(maxLength: 40, nullable: true),
                    AttemptedJson = table.Column<string>(nullable: false),
                    RejectionMessage = table.Column<string>(nullable: true),
                    FixedJson = table.Column<string>(nullable: true),
                    Outcome = table.Column<string>(maxLength: 20, nullable: false),
                    Promoted = table.Column<bool>(nullable: false, defaultValue: false),
                    PromotedTemplateId = table.Column<int>(nullable: true),
                    PortalId = table.Column<int>(nullable: true),
                    FormId = table.Column<int>(nullable: true),
                    UserId = table.Column<int>(nullable: true),
                    CreatedOnDate = table.Column<DateTime>(nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    ReviewedByUserId = table.Column<int>(nullable: true),
                    ReviewedOnDate = table.Column<DateTime>(nullable: true),
                    ReviewNotes = table.Column<string>(maxLength: 1000, nullable: true),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MF_AI_KB_Feedback", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MF_AI_KBFb_Knowledge",
                        column: x => x.KnowledgeId,
                        principalTable: "MF_AI_Knowledge",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_MF_AI_KBFb_Template",
                        column: x => x.PromotedTemplateId,
                        principalTable: "MF_AI_KB_Templates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.NoAction);
                });
            migrationBuilder.CreateIndex(name: "IX_MF_AI_KBFb_Widget_Promoted", table: "MF_AI_KB_Feedback", columns: new[] { "WidgetType", "Promoted", "CreatedOnDate" });
            migrationBuilder.CreateIndex(name: "IX_MF_AI_KBFb_Outcome",         table: "MF_AI_KB_Feedback", columns: new[] { "Outcome", "CreatedOnDate" });
            migrationBuilder.CreateIndex(name: "IX_MF_AI_KBFb_Rule",            table: "MF_AI_KB_Feedback", columns: new[] { "RuleId", "CreatedOnDate" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "MF_AI_KB_Feedback");
            migrationBuilder.DropTable(name: "MF_AI_KB_Rules");
            migrationBuilder.DropTable(name: "MF_AI_KB_Templates");
            migrationBuilder.DropTable(name: "MF_AI_Knowledge_History");
            migrationBuilder.DropTable(name: "MF_AI_Knowledge");
        }
    }
}
