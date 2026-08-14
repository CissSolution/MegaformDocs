using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;

namespace MegaForm.Oqtane.Server.Migrations
{
    /// <summary>
    /// MegaForm 01.06.37 — Seed the premium template-guide KB rows that 01.06.36 missed:
    /// americana-journey (shipped since, no seed row) + the two 2026-07-03 additions
    /// event-registration-rsvp and wellness-patient-intake. Each &lt;slug&gt;.facts.json /
    /// &lt;slug&gt;.guide.md ships in Resources/TemplateGuides; this registers the guide_file row
    /// in MF_AI_Knowledge so the AI premium-edit assistant has per-template context.
    /// Idempotent via MERGE (SQL Server) / INSERT…WHERE NOT EXISTS (SQLite) — safe on existing DBs.
    /// </summary>
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.06.00.37")]
    public class SeedNewPremiumTemplateGuides : MultiDatabaseMigration
    {
        public SeedNewPremiumTemplateGuides(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── SQL Server ──────────────────────────────────────────────
            migrationBuilder.Sql(@"
IF (SELECT SERVERPROPERTY('EngineEdition')) IS NOT NULL
BEGIN
    DECLARE @kb TABLE (
        Slug NVARCHAR(160), Kind NVARCHAR(40), Title NVARCHAR(200),
        Summary NVARCHAR(500), Body NVARCHAR(MAX), Tags NVARCHAR(500), Source NVARCHAR(40)
    );
    INSERT INTO @kb VALUES
      (N'tpl-americana-journey', N'template_guide', N'The Great American Journey',
       N'Minimalist American road-trip planner with a split hero, restrained Americana palette and a multi-step wizard.',
       N'{""guide_file"": ""americana-journey.guide.md""}', N'premium,template-guide,travel-application', N'megaform-builtin'),
      (N'tpl-event-registration-rsvp', N'template_guide', N'Event Registration & RSVP',
       N'Premium dark-editorial multi-step event registration & RSVP form with card/chip choices, fully editable in the builder.',
       N'{""guide_file"": ""event-registration-rsvp.guide.md""}', N'premium,template-guide,event-registration', N'megaform-builtin'),
      (N'tpl-wellness-patient-intake', N'template_guide', N'Wellness & Patient Intake',
       N'Calm, soft multi-step wellness / patient intake form with grouped health sections and a native step wizard.',
       N'{""guide_file"": ""wellness-patient-intake.guide.md""}', N'premium,template-guide,health-intake', N'megaform-builtin');

    MERGE dbo.MF_AI_Knowledge AS tgt
    USING (SELECT Slug, Kind, Title, Summary, Body, Tags, Source FROM @kb) AS src
    ON  tgt.Slug = src.Slug AND tgt.PortalId IS NULL
    WHEN MATCHED THEN UPDATE SET
        Kind = src.Kind, Title = src.Title, Summary = src.Summary,
        Body = src.Body, Tags = src.Tags, Source = src.Source,
        Version = tgt.Version + 1, UpdatedByUserId = -1, UpdatedOnDate = SYSUTCDATETIME()
    WHEN NOT MATCHED BY TARGET THEN INSERT
        (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version,
         CreatedByUserId, CreatedOnDate, UpdatedByUserId, UpdatedOnDate)
    VALUES
        (src.Slug, src.Kind, src.Title, src.Summary, src.Body, src.Tags,
         NULL, src.Source, 1, -1, SYSUTCDATETIME(), -1, SYSUTCDATETIME());
END
            ");

            // ── SQLite: insert the 3 rows when missing ──────────────────
            migrationBuilder.Sql(@"
INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedByUserId, CreatedOnDate, UpdatedByUserId, UpdatedOnDate)
SELECT * FROM (
  SELECT 'tpl-americana-journey' AS Slug, 'template_guide' AS Kind, 'The Great American Journey' AS Title,
         'Minimalist American road-trip planner with a split hero, restrained Americana palette and a multi-step wizard.' AS Summary,
         '{""guide_file"": ""americana-journey.guide.md""}' AS Body,
         'premium,template-guide,travel-application' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-event-registration-rsvp', 'template_guide', 'Event Registration & RSVP',
         'Premium dark-editorial multi-step event registration & RSVP form with card/chip choices, fully editable in the builder.',
         '{""guide_file"": ""event-registration-rsvp.guide.md""}',
         'premium,template-guide,event-registration', NULL, 'megaform-builtin', 1, -1, CURRENT_TIMESTAMP, -1, CURRENT_TIMESTAMP
  UNION ALL
  SELECT 'tpl-wellness-patient-intake', 'template_guide', 'Wellness & Patient Intake',
         'Calm, soft multi-step wellness / patient intake form with grouped health sections and a native step wizard.',
         '{""guide_file"": ""wellness-patient-intake.guide.md""}',
         'premium,template-guide,health-intake', NULL, 'megaform-builtin', 1, -1, CURRENT_TIMESTAMP, -1, CURRENT_TIMESTAMP
) AS src
WHERE NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge k WHERE k.Slug = src.Slug AND k.PortalId IS NULL);
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
DELETE FROM MF_AI_Knowledge
 WHERE PortalId IS NULL AND Slug IN
   (N'tpl-americana-journey', N'tpl-event-registration-rsvp', N'tpl-wellness-patient-intake');
            ");
        }
    }
}
