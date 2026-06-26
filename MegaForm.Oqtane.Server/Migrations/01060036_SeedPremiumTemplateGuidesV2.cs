using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;

namespace MegaForm.Oqtane.Server.Migrations
{
    /// <summary>
    /// MegaForm 01.06.36 — Two-file per-template KB layout for AI premium-edit.
    ///
    /// Each premium template now ships TWO files in Resources/TemplateGuides/:
    ///   &lt;slug&gt;.facts.json  (auto-generated deterministic map: fields/display/steps/css/hashes)
    ///   &lt;slug&gt;.guide.md    (compact design contract + per-operation formulas the AI follows)
    ///
    /// This migration:
    ///   • repoints the two existing premium guide rows (bulgaria, euro) at the new
    ///     &lt;slug&gt;.guide.md file, and
    ///   • adds three previously-missing premium guides (festa-italiana,
    ///     down-under-australia, intake-acme-ocean).
    ///
    /// Idempotent via MERGE (SQL Server) / INSERT…WHERE NOT EXISTS + UPDATE (SQLite).
    /// </summary>
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.06.00.36")]
    public class SeedPremiumTemplateGuidesV2 : MultiDatabaseMigration
    {
        public SeedPremiumTemplateGuidesV2(IDatabase database) : base(database)
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
      (N'tpl-festa-italiana', N'template_guide', N'Festa Italiana',
       N'Warm Italian festival RSVP with hero photography, texture overlay and a multi-step wizard.',
       N'{""guide_file"": ""festa-italiana.guide.md""}', N'premium,template-guide,event-registration', N'megaform-builtin'),
      (N'tpl-down-under-australia', N'template_guide', N'Down Under Australia Experience',
       N'Reef-and-outback travel application with card choices, chip multi-selects and a multi-step wizard.',
       N'{""guide_file"": ""down-under-australia.guide.md""}', N'premium,template-guide,travel-application', N'megaform-builtin'),
      (N'tpl-intake-acme-ocean', N'template_guide', N'Acme Platform Intake',
       N'Clean ocean-gradient SaaS onboarding intake with a left-rail step wizard and content tokens.',
       N'{""guide_file"": ""intake-acme-ocean.guide.md""}', N'premium,template-guide,saas-intake', N'megaform-builtin'),
      (N'tpl-bulgaria-discovery-programme', N'template_guide', N'Bulgaria Discovery Programme',
       N'Elegant 4-step application form with Rose Valley hero photography and a rose/pine/gold palette.',
       N'{""guide_file"": ""bulgaria-discovery-programme.guide.md""}', N'premium,template-guide,travel-application', N'megaform-builtin'),
      (N'tpl-euro-youth-application', N'template_guide', N'EuroYouth 2026 Application',
       N'Apply for European youth mobility programmes across study, language immersion and volunteering tracks.',
       N'{""guide_file"": ""euro-youth-application.guide.md""}', N'premium,template-guide,event-registration', N'megaform-builtin');

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

            // ── SQLite: insert the 3 new rows when missing ──────────────
            migrationBuilder.Sql(@"
INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedByUserId, CreatedOnDate, UpdatedByUserId, UpdatedOnDate)
SELECT * FROM (
  SELECT 'tpl-festa-italiana' AS Slug, 'template_guide' AS Kind, 'Festa Italiana' AS Title,
         'Warm Italian festival RSVP with hero photography, texture overlay and a multi-step wizard.' AS Summary,
         '{""guide_file"": ""festa-italiana.guide.md""}' AS Body,
         'premium,template-guide,event-registration' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-down-under-australia', 'template_guide', 'Down Under Australia Experience',
         'Reef-and-outback travel application with card choices, chip multi-selects and a multi-step wizard.',
         '{""guide_file"": ""down-under-australia.guide.md""}',
         'premium,template-guide,travel-application', NULL, 'megaform-builtin', 1, -1, CURRENT_TIMESTAMP, -1, CURRENT_TIMESTAMP
  UNION ALL
  SELECT 'tpl-intake-acme-ocean', 'template_guide', 'Acme Platform Intake',
         'Clean ocean-gradient SaaS onboarding intake with a left-rail step wizard and content tokens.',
         '{""guide_file"": ""intake-acme-ocean.guide.md""}',
         'premium,template-guide,saas-intake', NULL, 'megaform-builtin', 1, -1, CURRENT_TIMESTAMP, -1, CURRENT_TIMESTAMP
) AS src
WHERE NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge k WHERE k.Slug = src.Slug AND k.PortalId IS NULL);
            ");

            // ── SQLite: repoint bulgaria + euro at the new .guide.md file ─
            migrationBuilder.Sql(@"
UPDATE MF_AI_Knowledge SET Body = '{""guide_file"": ""bulgaria-discovery-programme.guide.md""}', UpdatedOnDate = CURRENT_TIMESTAMP
  WHERE Slug = 'tpl-bulgaria-discovery-programme' AND PortalId IS NULL AND Body LIKE '%bulgaria-discovery-programme.md%';
UPDATE MF_AI_Knowledge SET Body = '{""guide_file"": ""euro-youth-application.guide.md""}', UpdatedOnDate = CURRENT_TIMESTAMP
  WHERE Slug = 'tpl-euro-youth-application' AND PortalId IS NULL AND Body LIKE '%euro-youth-application.md%';
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
DELETE FROM MF_AI_Knowledge
 WHERE PortalId IS NULL AND Slug IN
   (N'tpl-festa-italiana', N'tpl-down-under-australia', N'tpl-intake-acme-ocean');
            ");
        }
    }
}
