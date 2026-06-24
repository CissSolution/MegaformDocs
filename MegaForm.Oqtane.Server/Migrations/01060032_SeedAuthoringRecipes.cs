using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;

namespace MegaForm.Oqtane.Server.Migrations
{
    /// <summary>
    /// MegaForm 01.06.32 — Oqtane parity for the three form-authoring
    /// prompt_recipe rows shipped to DNN via
    /// `MegaForm.DNN\SqlScripts\01.06.32.SqlDataProvider`.
    ///
    /// Seeds three rows into MF_AI_Knowledge:
    ///   author-premium-template    — guide for unique-themed Premium forms
    ///   author-pure-grid-template  — guide for Vercel-style Pure Grid forms
    ///   pure-grid-canonical-css    — 5555-byte CSS the AI must paste verbatim
    ///
    /// Each Body is a JSON pointer of the form `{"recipe_file":"x.md"}`. The
    /// matching markdown files ship in the .nupkg under
    /// `wwwroot\Modules\MegaForm\Resources\PromptRecipes\` and are read at
    /// request time by AiToolsController.ResolveKnowledgeBody() (DNN twin)
    /// or the Oqtane equivalent endpoint. Without those files the recipes
    /// resolve to "[recipe_file not found: x.md]" — but the SQL row stays
    /// valid so MfAiChat keyword search still surfaces the slug.
    ///
    /// Idempotent via raw SQL MERGE on (Slug, PortalId) so re-running the
    /// migration after manual edits does not produce duplicates and
    /// preserves the existing row's Examples / CreatedOnDate / Id while
    /// bumping Version.
    /// </summary>
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.06.00.32")]
    public class SeedAuthoringRecipes : MultiDatabaseMigration
    {
        public SeedAuthoringRecipes(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Use raw SQL because EF Core MigrationBuilder.UpdateData() does not
            // express MERGE semantics. The block is dialect-aware: SQL Server
            // gets the canonical MERGE; SQLite gets INSERT … ON CONFLICT.
            migrationBuilder.Sql(@"
IF (SELECT SERVERPROPERTY('EngineEdition')) IS NOT NULL
BEGIN
    DECLARE @kb TABLE (
        Slug NVARCHAR(160), Kind NVARCHAR(40), Title NVARCHAR(200),
        Summary NVARCHAR(500), Body NVARCHAR(MAX), Tags NVARCHAR(500),
        Source NVARCHAR(40)
    );
    INSERT INTO @kb VALUES
      (N'author-premium-template', N'prompt_recipe',
       N'Author a MegaForm Premium template',
       N'Author a NEW Premium form template with a unique themed shell (mfp-<slug> class, per-template customHtml + customCss). Use for campaign / event / brand-led forms with strong visual identity. Output: single JSON with title/description/slug/icon/category, settings.customContent, 9 supported field types, customHtml with token system, customCss starting with CheckboxPad fix and scoped to .mfp.mfp-<slug>, optional rules, workflow=null.',
       N'{""recipe_file"":""author-premium-template.md""}',
       N'premium,template,authoring,form-design,visual,campaign,mfp-slug,brand-led,custom-shell',
       N'megaform-builtin'),
      (N'author-pure-grid-template', N'prompt_recipe',
       N'Author a MegaForm Pure Grid (Vercel-style) template',
       N'Author a NEW Pure Grid form using the LOCKED shared design (mfp-pure-grid class, 5555-byte canonical CSS, frozen customHtml skeleton). Use for OPERATIONAL forms — contact, application, booking, registration, payment, healthcare, HR, survey, feedback. Author content+fields only; CSS byte-frozen. 18 supported field types (adds Date/Time/Number/Url/File/Html/Payment/Rating/Appointment/Calculator vs Premium 9). Floating-label requires placeholder="" "" (single space) on text fields.',
       N'{""recipe_file"":""author-pure-grid-template.md""}',
       N'pure-grid,vercel,template,authoring,form-design,operational,floating-label,locked-css',
       N'megaform-builtin'),
      (N'pure-grid-canonical-css', N'prompt_recipe',
       N'Pure Grid canonical customCss (paste verbatim)',
       N'The 5555-byte byte-identical customCss shared across all 125 Pure Grid templates. Paste verbatim into customCss field. NEVER modify colors, add selectors, rename classes, or @import a different font. Italian-flag accent bar, cream bg #faf9f7, white card, Cormorant + Inter typography, green primary #009246, floating labels via non-empty placeholder, 12-col grid collapsing at <=768px. CheckboxPad fix is BAKED-IN.',
       N'{""recipe_file"":""pure-grid-canonical-css.md""}',
       N'pure-grid,css,canonical,verbatim,locked,design-system,italian-flag,floating-label,grid,checkbox-pad',
       N'megaform-builtin');

    MERGE dbo.MF_AI_Knowledge AS tgt
    USING (SELECT Slug, Kind, Title, Summary, Body, Tags, Source FROM @kb) AS src
    ON  tgt.Slug = src.Slug AND tgt.PortalId IS NULL
    WHEN MATCHED THEN UPDATE SET
        Kind = src.Kind, Title = src.Title, Summary = src.Summary,
        Body = src.Body, Tags = src.Tags, Source = src.Source,
        Version = tgt.Version + 1, UpdatedByUserId = -1,
        UpdatedOnDate = SYSUTCDATETIME()
    WHEN NOT MATCHED BY TARGET THEN INSERT
        (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version,
         CreatedByUserId, CreatedOnDate, UpdatedByUserId, UpdatedOnDate)
    VALUES
        (src.Slug, src.Kind, src.Title, src.Summary, src.Body, src.Tags,
         NULL, src.Source, 1, -1, SYSUTCDATETIME(), -1, SYSUTCDATETIME());
END
            ");

            // SQLite path — same intent, INSERT … ON CONFLICT clause.
            migrationBuilder.Sql(@"
INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedByUserId, CreatedOnDate, UpdatedByUserId, UpdatedOnDate)
SELECT * FROM (
  SELECT 'author-premium-template' AS Slug, 'prompt_recipe' AS Kind, 'Author a MegaForm Premium template' AS Title,
         'Author a NEW Premium form template with a unique themed shell (mfp-<slug> class, per-template customHtml + customCss). Use for campaign / event / brand-led forms.' AS Summary,
         '{""recipe_file"":""author-premium-template.md""}' AS Body,
         'premium,template,authoring' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL SELECT 'author-pure-grid-template', 'prompt_recipe', 'Author a MegaForm Pure Grid (Vercel-style) template',
         'Author a NEW Pure Grid form using the LOCKED shared design.',
         '{""recipe_file"":""author-pure-grid-template.md""}',
         'pure-grid,vercel,template,authoring', NULL, 'megaform-builtin', 1,
         -1, CURRENT_TIMESTAMP, -1, CURRENT_TIMESTAMP
  UNION ALL SELECT 'pure-grid-canonical-css', 'prompt_recipe', 'Pure Grid canonical customCss (paste verbatim)',
         'The 5555-byte byte-identical customCss shared across all 125 Pure Grid templates.',
         '{""recipe_file"":""pure-grid-canonical-css.md""}',
         'pure-grid,css,canonical,verbatim', NULL, 'megaform-builtin', 1,
         -1, CURRENT_TIMESTAMP, -1, CURRENT_TIMESTAMP
) AS new_rows
WHERE NOT EXISTS (
  SELECT 1 FROM MF_AI_Knowledge x
  WHERE x.Slug = new_rows.Slug AND x.PortalId IS NULL
);
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
DELETE FROM MF_AI_Knowledge
WHERE Slug IN ('author-premium-template','author-pure-grid-template','pure-grid-canonical-css')
  AND PortalId IS NULL;
            ");
        }
    }
}
