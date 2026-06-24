using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;

namespace MegaForm.Oqtane.Server.Migrations
{
    /// <summary>
    /// MegaForm 01.06.33 — seed the `build-native-rich-choices` prompt_recipe row
    /// so MfAiChat surfaces the recipe that teaches the AI to build RICH Radio/Checkbox
    /// controls (pricing cards, pill chips, option title+description+badge+icon) with
    /// NATIVE field properties (optionDisplay / per-option metadata) instead of
    /// hand-written `&lt;input type=radio&gt;` blocks in customHtml.
    ///
    /// Body is a JSON pointer `{"recipe_file":"build-native-rich-choices.md"}`; the
    /// markdown ships in wwwroot\Modules\MegaForm\Resources\PromptRecipes\ and is read
    /// at request time by the recipe resolver. Idempotent (MERGE on Slug+PortalId).
    /// </summary>
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.06.00.33")]
    public class SeedNativeRichChoicesRecipe : MultiDatabaseMigration
    {
        public SeedNativeRichChoicesRecipe(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // SQL Server (live) — idempotent MERGE.
            migrationBuilder.Sql(@"
IF (SELECT SERVERPROPERTY('EngineEdition')) IS NOT NULL
BEGIN
    DECLARE @kb TABLE (
        Slug NVARCHAR(160), Kind NVARCHAR(40), Title NVARCHAR(200),
        Summary NVARCHAR(1000), Body NVARCHAR(MAX), Tags NVARCHAR(500), Source NVARCHAR(40)
    );
    INSERT INTO @kb VALUES
      (N'build-native-rich-choices', N'prompt_recipe',
       N'Native rich CHOICE controls (cards / chips) — no custom HTML',
       N'Make Radio/Checkbox options look RICH (pricing cards, pass tiers, pill/chip tag pickers, option title+description+price-badge+icon) using NATIVE field props, NOT hand-written input HTML. Set field.optionDisplay = cards|chips (+ optional allowOptionHtml, optionColumns 1-4); per option set description (desc/helpText/subLabel), meta (location/kicker), badge (price pill), icon, or richHtml. Renders .mf-option-group--cards/--chips with .mf-option-ui card/chip box, .mf-option-label/-meta/-desc/-badge/-check; selected = .is-checked / :has(:checked). Optional small customCss recolours the native hooks for brand. Admin-editable in Builder Options panel (Choice Display / Allow HTML / Columns). Reference: festa-italiana-native.json. Migrate legacy hand-written fi-pass-list/fi-chip-list blocks to {{field:key}} tokens + move data onto options[].',
       N'{""recipe_file"":""build-native-rich-choices.md""}',
       N'radio,checkbox,options,cards,chips,rich,optionDisplay,badge,price,native,no-custom-html,choice,pills,tags',
       N'megaform-builtin');

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

            // SQLite — INSERT … WHERE NOT EXISTS.
            migrationBuilder.Sql(@"
INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedByUserId, CreatedOnDate, UpdatedByUserId, UpdatedOnDate)
SELECT * FROM (
  SELECT 'build-native-rich-choices' AS Slug, 'prompt_recipe' AS Kind,
         'Native rich CHOICE controls (cards / chips) — no custom HTML' AS Title,
         'Make Radio/Checkbox options look RICH (pricing cards, pill chips, title+description+badge+icon) with NATIVE field.optionDisplay=cards|chips + per-option description/meta/badge/icon/richHtml, instead of hand-written input HTML. Reference: festa-italiana-native.json.' AS Summary,
         '{""recipe_file"":""build-native-rich-choices.md""}' AS Body,
         'radio,checkbox,options,cards,chips,rich,optionDisplay,badge,native,no-custom-html' AS Tags,
         NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
) AS new_rows
WHERE NOT EXISTS (
  SELECT 1 FROM MF_AI_Knowledge x WHERE x.Slug = new_rows.Slug AND x.PortalId IS NULL
);
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
DELETE FROM MF_AI_Knowledge WHERE Slug = 'build-native-rich-choices' AND PortalId IS NULL;
            ");
        }
    }
}
