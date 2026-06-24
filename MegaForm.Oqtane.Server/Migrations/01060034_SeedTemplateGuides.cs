using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;

namespace MegaForm.Oqtane.Server.Migrations
{
    /// <summary>
    /// MegaForm 01.06.34 — Seeds Premium Template Guides into MF_AI_Knowledge.
    ///
    /// Adds 33 rows of Kind='template_guide', one per Premium template.
    /// Each Body is a JSON pointer {"guide_file":"<slug>.md"} to a markdown file
    /// shipped under wwwroot\Modules\MegaForm\Resources\TemplateGuides\.
    ///
    /// Idempotent via MERGE (SQL Server) or INSERT ... WHERE NOT EXISTS (SQLite).
    /// </summary>
    [DbContext(typeof(MegaFormDbContext))]
    [Migration("MegaForm.01.06.00.34")]
    public class SeedTemplateGuides : MultiDatabaseMigration
    {
        public SeedTemplateGuides(IDatabase database) : base(database)
        {
        }

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
IF (SELECT SERVERPROPERTY('EngineEdition')) IS NOT NULL
BEGIN
    DECLARE @kb TABLE (
        Slug NVARCHAR(160), Kind NVARCHAR(40), Title NVARCHAR(200),
        Summary NVARCHAR(500), Body NVARCHAR(MAX), Tags NVARCHAR(500),
        Source NVARCHAR(40)
    );
    INSERT INTO @kb VALUES
      (N'tpl-alpine-retreat-escape', N'template_guide',
       N'Alpine Retreat Escape Planner',
       N'A cinematic booking inquiry with a scenic hero image and glass panels.',
       N'{""guide_file"": ""alpine-retreat-escape.md""}',
       N'premium,template-guide,premium',
       N'megaform-builtin'),
      (N'tpl-blueprint-property-brief', N'template_guide',
       N'Blueprint Property Brief',
       N'A bold real-estate intake styled like an architectural plan board.',
       N'{""guide_file"": ""blueprint-property-brief.md""}',
       N'premium,template-guide,premium',
       N'megaform-builtin'),
      (N'tpl-botanical-volunteer-story', N'template_guide',
       N'Botanical Volunteer Story Form',
       N'A nature-inspired signup with an immersive photo background and frosted cards.',
       N'{""guide_file"": ""botanical-volunteer-story.md""}',
       N'premium,template-guide,premium',
       N'megaform-builtin'),
      (N'tpl-clinic-concierge-serene', N'template_guide',
       N'Clinic Concierge Serene Intake',
       N'A modern healthcare intake with calm colors and a premium concierge feel.',
       N'{""guide_file"": ""clinic-concierge-serene.md""}',
       N'premium,template-guide,premium',
       N'megaform-builtin'),
      (N'tpl-editorial-monochrome-portfolio', N'template_guide',
       N'Editorial Monochrome Portfolio Submission',
       N'A magazine-inspired application with bold black-and-white styling.',
       N'{""guide_file"": ""editorial-monochrome-portfolio.md""}',
       N'premium,template-guide,premium',
       N'megaform-builtin'),
      (N'tpl-festival-speaker-spotlight', N'template_guide',
       N'Festival Speaker Spotlight Form',
       N'A vibrant speaker application with stage-like contrast and premium blocks.',
       N'{""guide_file"": ""festival-speaker-spotlight.md""}',
       N'premium,template-guide,premium',
       N'megaform-builtin'),
      (N'tpl-french-invitation-2026', N'template_guide',
       N'Vous Etes Invite',
       N'We would be honored by your presence at our celebration',
       N'{""guide_file"": ""french-invitation-2026.md""}',
       N'premium,template-guide,invitation',
       N'megaform-builtin'),
      (N'tpl-french-product-consultation-2026', N'template_guide',
       N'Product Consultation',
       N'Schedule a personalized consultation with our product specialists',
       N'{""guide_file"": ""french-product-consultation-2026.md""}',
       N'premium,template-guide,general',
       N'megaform-builtin'),
      (N'tpl-golf-tournament-individual', N'template_guide',
       N'Golf Tournament — Individual (Senior Championship style)',
       N'GolfGenius-style multi-round leaderboard for individual stroke-play tournaments. Mimics https://lbgf-2026seniorchampionship1.golfgenius.com style: flight accordions, click player → expand inline 3-round scorecards with score color marks (red circles = under par, navy squares = over par).',
       N'{""guide_file"": ""golf-tournament-individual.md""}',
       N'premium,template-guide,reports',
       N'megaform-builtin'),
      (N'tpl-golf-tournament-pair', N'template_guide',
       N'Golf Tournament — Pair / 2 Person (Couples League style)',
       N'GolfGenius-style 2-person team leaderboard. Mimics https://www.golfgenius.com/pages/5155134566574327893: pair accordion, click pair name → expand inline scorecards for BOTH players with full Yardage/Par/Stroke Index rows + score color marks. Adjust the pair-pivot SQL when you have a real pair table.',
       N'{""guide_file"": ""golf-tournament-pair.md""}',
       N'premium,template-guide,reports',
       N'megaform-builtin'),
      (N'tpl-golf-tournament-scoreboard', N'template_guide',
       N'Golf Tournament Scoreboard',
       N'Multi-round leaderboard with inline drill-down to per-round hole-by-hole scorecards. Configure to your Golf.dbo.CardResultNew table.',
       N'{""guide_file"": ""golf-tournament-scoreboard.md""}',
       N'premium,template-guide,reports',
       N'megaform-builtin'),
      (N'tpl-halloween-party-registration', N'template_guide',
       N'Spooky Night Party',
       N'Join us for a frighteningly fun Halloween celebration with costumes, treats, and thrills!',
       N'{""guide_file"": ""halloween-party-registration.md""}',
       N'premium,template-guide,event-registration',
       N'megaform-builtin'),
      (N'tpl-invitation-ceremony', N'template_guide',
       N'Celebration',
       N'We cannot wait to celebrate with you',
       N'{""guide_file"": ""invitation-ceremony.md""}',
       N'premium,template-guide,invitation',
       N'megaform-builtin'),
      (N'tpl-italian-law-firm-consultation-2026', N'template_guide',
       N'Legal Consultation Request',
       N'Connect with our distinguished legal team for expert guidance',
       N'{""guide_file"": ""italian-law-firm-consultation-2026.md""}',
       N'premium,template-guide,professional',
       N'megaform-builtin'),
      (N'tpl-job-application-form', N'template_guide',
       N'Job Application Form',
       N'Join our team and grow your career with us',
       N'{""guide_file"": ""job-application-form.md""}',
       N'premium,template-guide,standard-application',
       N'megaform-builtin'),
      (N'tpl-italian-romantic-premium-template', N'template_guide',
       N'Contact Us',
       N'We would love to hear from you. Fill out the form below and our team will get back to you shortly.',
       N'{""guide_file"": ""italian-romantic-premium-template.md""}',
       N'premium,template-guide,contact',
       N'megaform-builtin'),
      (N'tpl-multipurpose-usa-contact-form', N'template_guide',
       N'Get In Touch With Us',
       N'We''re here to help you succeed. Fill out the form below and our team will get back to you within 24 hours.',
       N'{""guide_file"": ""multipurpose-usa-contact-form.md""}',
       N'premium,template-guide,contact',
       N'megaform-builtin'),
      (N'tpl-neon-launch-control-room', N'template_guide',
       N'Neon Launch Control Room',
       N'A bold startup launch intake with a futuristic dark console look.',
       N'{""guide_file"": ""neon-launch-control-room.md""}',
       N'premium,template-guide,premium',
       N'megaform-builtin'),
      (N'tpl-new-orleans-event-registration', N'template_guide',
       N'Mardi Gras Celebration',
       N'Join us for an unforgettable night of jazz, festivities, and New Orleans magic.',
       N'{""guide_file"": ""new-orleans-event-registration.md""}',
       N'premium,template-guide,event-registration',
       N'megaform-builtin'),
      (N'tpl-passport-concierge-itinerary', N'template_guide',
       N'Passport Concierge Itinerary Form',
       N'A travel-planning template with passport-book styling and destination vibes.',
       N'{""guide_file"": ""passport-concierge-itinerary.md""}',
       N'premium,template-guide,premium',
       N'megaform-builtin'),
      (N'tpl-pdf-form-blank', N'template_guide',
       N'PDF Form — Blank (paper-style)',
       N'Minimal PDF Form starter. Adds an empty PdfForm widget so you can immediately upload your own PDF and drag fields onto it. Best for paper forms (contracts, applications, intake sheets) where you want end-users to fill in inputs over an existing PDF layout.',
       N'{""guide_file"": ""pdf-form-blank.md""}',
       N'premium,template-guide,inputs',
       N'megaform-builtin'),
      (N'tpl-sticky-spark-creative-brief', N'template_guide',
       N'Sticky Spark Creative Brief',
       N'A colorful creative intake styled like a wall of sticky notes.',
       N'{""guide_file"": ""sticky-spark-creative-brief.md""}',
       N'premium,template-guide,premium',
       N'megaform-builtin'),
      (N'tpl-template-639124136870269154', N'template_guide',
       N'Contact Us',
       N'We would love to hear from you. Fill out the form below and our team will get back to you shortly.',
       N'{""guide_file"": ""template-639124136870269154.md""}',
       N'premium,template-guide,contact',
       N'megaform-builtin'),
      (N'tpl-template-639124137034063476', N'template_guide',
       N'Celebration',
       N'We cannot wait to celebrate with you',
       N'{""guide_file"": ""template-639124137034063476.md""}',
       N'premium,template-guide,invitation',
       N'megaform-builtin'),
      (N'tpl-template-639124137734507091', N'template_guide',
       N'Celebration RSVP — Stepped',
       N'3-step RSVP form with progress bar + 20 theme presets (French/Italian/American/German)',
       N'{""guide_file"": ""template-639124137734507091.md""}',
       N'premium,template-guide,invitation',
       N'megaform-builtin'),
      (N'tpl-template-639124210007175219', N'template_guide',
       N'Personal Training Registration',
       N'Start your fitness transformation with our certified personal trainers',
       N'{""guide_file"": ""template-639124210007175219.md""}',
       N'premium,template-guide,fitness-wellness',
       N'megaform-builtin'),
      (N'tpl-template-639124210228418310', N'template_guide',
       N'Style Consultation',
       N'Discover your signature style with our premium collection',
       N'{""guide_file"": ""template-639124210228418310.md""}',
       N'premium,template-guide,general',
       N'megaform-builtin'),
      (N'tpl-v0-contact-map-left-corporate', N'template_guide',
       N'Contact Us - Map Left, Corporate',
       N'Premium contact page with Google Map on the left, form body on the right. Corporate color presets.',
       N'{""guide_file"": ""v0-contact-map-left-corporate.md""}',
       N'premium,template-guide,contact',
       N'megaform-builtin'),
      (N'tpl-v0-contact-map-left-minimal', N'template_guide',
       N'Contact Us - Map Left, Minimal',
       N'Premium contact page with Google Map on the left, form body on the right. Minimal color presets.',
       N'{""guide_file"": ""v0-contact-map-left-minimal.md""}',
       N'premium,template-guide,contact',
       N'megaform-builtin'),
      (N'tpl-v0-contact-map-right-modern', N'template_guide',
       N'Contact Us - Map Right, Modern',
       N'Premium contact page with Google Map on the right, form body on the left. Modern color presets.',
       N'{""guide_file"": ""v0-contact-map-right-modern.md""}',
       N'premium,template-guide,contact',
       N'megaform-builtin'),
      (N'tpl-wedding-scrapbook-story', N'template_guide',
       N'Wedding Scrapbook Story Form',
       N'A romantic scrapbook-inspired planner with polaroid visuals and soft paper cards.',
       N'{""guide_file"": ""wedding-scrapbook-story.md""}',
       N'premium,template-guide,premium',
       N'megaform-builtin'),
      (N'tpl-bulgaria-discovery-programme', N'template_guide',
       N'Bulgaria Discovery Programme',
       N'Elegant 4-step application form with Rose Valley hero photography, Plovdiv inset, Bulgarian folk borders, and rose, pine, gold palette.',
       N'{""guide_file"": ""bulgaria-discovery-programme.md""}',
       N'premium,template-guide,travel-application',
       N'megaform-builtin'),
      (N'tpl-euro-youth-application', N'template_guide',
       N'EuroYouth 2026 Application',
       N'Apply for European youth mobility programmes across study, language immersion and volunteering tracks.',
       N'{""guide_file"": ""euro-youth-application.md""}',
       N'premium,template-guide,event-registration',
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

            migrationBuilder.Sql(@"
INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedByUserId, CreatedOnDate, UpdatedByUserId, UpdatedOnDate)
SELECT * FROM (
  SELECT 'tpl-alpine-retreat-escape' AS Slug, 'template_guide' AS Kind, 'Alpine Retreat Escape Planner' AS Title,
         'A cinematic booking inquiry with a scenic hero image and glass panels.' AS Summary,
         '{""guide_file"": ""alpine-retreat-escape.md""}' AS Body,
         'premium,template-guide,premium' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-blueprint-property-brief' AS Slug, 'template_guide' AS Kind, 'Blueprint Property Brief' AS Title,
         'A bold real-estate intake styled like an architectural plan board.' AS Summary,
         '{""guide_file"": ""blueprint-property-brief.md""}' AS Body,
         'premium,template-guide,premium' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-botanical-volunteer-story' AS Slug, 'template_guide' AS Kind, 'Botanical Volunteer Story Form' AS Title,
         'A nature-inspired signup with an immersive photo background and frosted cards.' AS Summary,
         '{""guide_file"": ""botanical-volunteer-story.md""}' AS Body,
         'premium,template-guide,premium' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-clinic-concierge-serene' AS Slug, 'template_guide' AS Kind, 'Clinic Concierge Serene Intake' AS Title,
         'A modern healthcare intake with calm colors and a premium concierge feel.' AS Summary,
         '{""guide_file"": ""clinic-concierge-serene.md""}' AS Body,
         'premium,template-guide,premium' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-editorial-monochrome-portfolio' AS Slug, 'template_guide' AS Kind, 'Editorial Monochrome Portfolio Submission' AS Title,
         'A magazine-inspired application with bold black-and-white styling.' AS Summary,
         '{""guide_file"": ""editorial-monochrome-portfolio.md""}' AS Body,
         'premium,template-guide,premium' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-festival-speaker-spotlight' AS Slug, 'template_guide' AS Kind, 'Festival Speaker Spotlight Form' AS Title,
         'A vibrant speaker application with stage-like contrast and premium blocks.' AS Summary,
         '{""guide_file"": ""festival-speaker-spotlight.md""}' AS Body,
         'premium,template-guide,premium' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-french-invitation-2026' AS Slug, 'template_guide' AS Kind, 'Vous Etes Invite' AS Title,
         'We would be honored by your presence at our celebration' AS Summary,
         '{""guide_file"": ""french-invitation-2026.md""}' AS Body,
         'premium,template-guide,invitation' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-french-product-consultation-2026' AS Slug, 'template_guide' AS Kind, 'Product Consultation' AS Title,
         'Schedule a personalized consultation with our product specialists' AS Summary,
         '{""guide_file"": ""french-product-consultation-2026.md""}' AS Body,
         'premium,template-guide,general' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-golf-tournament-individual' AS Slug, 'template_guide' AS Kind, 'Golf Tournament — Individual (Senior Championship style)' AS Title,
         'GolfGenius-style multi-round leaderboard for individual stroke-play tournaments. Mimics https://lbgf-2026seniorchampionship1.golfgenius.com style: flight accordions, click player → expand inline 3-round scorecards with score color marks (red circles = under par, navy squares = over par).' AS Summary,
         '{""guide_file"": ""golf-tournament-individual.md""}' AS Body,
         'premium,template-guide,reports' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-golf-tournament-pair' AS Slug, 'template_guide' AS Kind, 'Golf Tournament — Pair / 2 Person (Couples League style)' AS Title,
         'GolfGenius-style 2-person team leaderboard. Mimics https://www.golfgenius.com/pages/5155134566574327893: pair accordion, click pair name → expand inline scorecards for BOTH players with full Yardage/Par/Stroke Index rows + score color marks. Adjust the pair-pivot SQL when you have a real pair table.' AS Summary,
         '{""guide_file"": ""golf-tournament-pair.md""}' AS Body,
         'premium,template-guide,reports' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-golf-tournament-scoreboard' AS Slug, 'template_guide' AS Kind, 'Golf Tournament Scoreboard' AS Title,
         'Multi-round leaderboard with inline drill-down to per-round hole-by-hole scorecards. Configure to your Golf.dbo.CardResultNew table.' AS Summary,
         '{""guide_file"": ""golf-tournament-scoreboard.md""}' AS Body,
         'premium,template-guide,reports' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-halloween-party-registration' AS Slug, 'template_guide' AS Kind, 'Spooky Night Party' AS Title,
         'Join us for a frighteningly fun Halloween celebration with costumes, treats, and thrills!' AS Summary,
         '{""guide_file"": ""halloween-party-registration.md""}' AS Body,
         'premium,template-guide,event-registration' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-invitation-ceremony' AS Slug, 'template_guide' AS Kind, 'Celebration' AS Title,
         'We cannot wait to celebrate with you' AS Summary,
         '{""guide_file"": ""invitation-ceremony.md""}' AS Body,
         'premium,template-guide,invitation' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-italian-law-firm-consultation-2026' AS Slug, 'template_guide' AS Kind, 'Legal Consultation Request' AS Title,
         'Connect with our distinguished legal team for expert guidance' AS Summary,
         '{""guide_file"": ""italian-law-firm-consultation-2026.md""}' AS Body,
         'premium,template-guide,professional' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-job-application-form' AS Slug, 'template_guide' AS Kind, 'Job Application Form' AS Title,
         'Join our team and grow your career with us' AS Summary,
         '{""guide_file"": ""job-application-form.md""}' AS Body,
         'premium,template-guide,standard-application' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-italian-romantic-premium-template' AS Slug, 'template_guide' AS Kind, 'Contact Us' AS Title,
         'We would love to hear from you. Fill out the form below and our team will get back to you shortly.' AS Summary,
         '{""guide_file"": ""italian-romantic-premium-template.md""}' AS Body,
         'premium,template-guide,contact' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-multipurpose-usa-contact-form' AS Slug, 'template_guide' AS Kind, 'Get In Touch With Us' AS Title,
         'We''re here to help you succeed. Fill out the form below and our team will get back to you within 24 hours.' AS Summary,
         '{""guide_file"": ""multipurpose-usa-contact-form.md""}' AS Body,
         'premium,template-guide,contact' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-neon-launch-control-room' AS Slug, 'template_guide' AS Kind, 'Neon Launch Control Room' AS Title,
         'A bold startup launch intake with a futuristic dark console look.' AS Summary,
         '{""guide_file"": ""neon-launch-control-room.md""}' AS Body,
         'premium,template-guide,premium' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-new-orleans-event-registration' AS Slug, 'template_guide' AS Kind, 'Mardi Gras Celebration' AS Title,
         'Join us for an unforgettable night of jazz, festivities, and New Orleans magic.' AS Summary,
         '{""guide_file"": ""new-orleans-event-registration.md""}' AS Body,
         'premium,template-guide,event-registration' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-passport-concierge-itinerary' AS Slug, 'template_guide' AS Kind, 'Passport Concierge Itinerary Form' AS Title,
         'A travel-planning template with passport-book styling and destination vibes.' AS Summary,
         '{""guide_file"": ""passport-concierge-itinerary.md""}' AS Body,
         'premium,template-guide,premium' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-pdf-form-blank' AS Slug, 'template_guide' AS Kind, 'PDF Form — Blank (paper-style)' AS Title,
         'Minimal PDF Form starter. Adds an empty PdfForm widget so you can immediately upload your own PDF and drag fields onto it. Best for paper forms (contracts, applications, intake sheets) where you want end-users to fill in inputs over an existing PDF layout.' AS Summary,
         '{""guide_file"": ""pdf-form-blank.md""}' AS Body,
         'premium,template-guide,inputs' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-sticky-spark-creative-brief' AS Slug, 'template_guide' AS Kind, 'Sticky Spark Creative Brief' AS Title,
         'A colorful creative intake styled like a wall of sticky notes.' AS Summary,
         '{""guide_file"": ""sticky-spark-creative-brief.md""}' AS Body,
         'premium,template-guide,premium' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-template-639124136870269154' AS Slug, 'template_guide' AS Kind, 'Contact Us' AS Title,
         'We would love to hear from you. Fill out the form below and our team will get back to you shortly.' AS Summary,
         '{""guide_file"": ""template-639124136870269154.md""}' AS Body,
         'premium,template-guide,contact' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-template-639124137034063476' AS Slug, 'template_guide' AS Kind, 'Celebration' AS Title,
         'We cannot wait to celebrate with you' AS Summary,
         '{""guide_file"": ""template-639124137034063476.md""}' AS Body,
         'premium,template-guide,invitation' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-template-639124137734507091' AS Slug, 'template_guide' AS Kind, 'Celebration RSVP — Stepped' AS Title,
         '3-step RSVP form with progress bar + 20 theme presets (French/Italian/American/German)' AS Summary,
         '{""guide_file"": ""template-639124137734507091.md""}' AS Body,
         'premium,template-guide,invitation' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-template-639124210007175219' AS Slug, 'template_guide' AS Kind, 'Personal Training Registration' AS Title,
         'Start your fitness transformation with our certified personal trainers' AS Summary,
         '{""guide_file"": ""template-639124210007175219.md""}' AS Body,
         'premium,template-guide,fitness-wellness' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-template-639124210228418310' AS Slug, 'template_guide' AS Kind, 'Style Consultation' AS Title,
         'Discover your signature style with our premium collection' AS Summary,
         '{""guide_file"": ""template-639124210228418310.md""}' AS Body,
         'premium,template-guide,general' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-v0-contact-map-left-corporate' AS Slug, 'template_guide' AS Kind, 'Contact Us - Map Left, Corporate' AS Title,
         'Premium contact page with Google Map on the left, form body on the right. Corporate color presets.' AS Summary,
         '{""guide_file"": ""v0-contact-map-left-corporate.md""}' AS Body,
         'premium,template-guide,contact' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-v0-contact-map-left-minimal' AS Slug, 'template_guide' AS Kind, 'Contact Us - Map Left, Minimal' AS Title,
         'Premium contact page with Google Map on the left, form body on the right. Minimal color presets.' AS Summary,
         '{""guide_file"": ""v0-contact-map-left-minimal.md""}' AS Body,
         'premium,template-guide,contact' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-v0-contact-map-right-modern' AS Slug, 'template_guide' AS Kind, 'Contact Us - Map Right, Modern' AS Title,
         'Premium contact page with Google Map on the right, form body on the left. Modern color presets.' AS Summary,
         '{""guide_file"": ""v0-contact-map-right-modern.md""}' AS Body,
         'premium,template-guide,contact' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-wedding-scrapbook-story' AS Slug, 'template_guide' AS Kind, 'Wedding Scrapbook Story Form' AS Title,
         'A romantic scrapbook-inspired planner with polaroid visuals and soft paper cards.' AS Summary,
         '{""guide_file"": ""wedding-scrapbook-story.md""}' AS Body,
         'premium,template-guide,premium' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-bulgaria-discovery-programme' AS Slug, 'template_guide' AS Kind, 'Bulgaria Discovery Programme' AS Title,
         'Elegant 4-step application form with Rose Valley hero photography, Plovdiv inset, Bulgarian folk borders, and rose, pine, gold palette.' AS Summary,
         '{""guide_file"": ""bulgaria-discovery-programme.md""}' AS Body,
         'premium,template-guide,travel-application' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
  UNION ALL
  SELECT 'tpl-euro-youth-application' AS Slug, 'template_guide' AS Kind, 'EuroYouth 2026 Application' AS Title,
         'Apply for European youth mobility programmes across study, language immersion and volunteering tracks.' AS Summary,
         '{""guide_file"": ""euro-youth-application.md""}' AS Body,
         'premium,template-guide,event-registration' AS Tags, NULL AS PortalId, 'megaform-builtin' AS Source, 1 AS Version,
         -1 AS CreatedByUserId, CURRENT_TIMESTAMP AS CreatedOnDate, -1 AS UpdatedByUserId, CURRENT_TIMESTAMP AS UpdatedOnDate
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
WHERE Slug IN ('tpl-alpine-retreat-escape','tpl-blueprint-property-brief','tpl-botanical-volunteer-story','tpl-clinic-concierge-serene','tpl-editorial-monochrome-portfolio','tpl-festival-speaker-spotlight','tpl-french-invitation-2026','tpl-french-product-consultation-2026','tpl-golf-tournament-individual','tpl-golf-tournament-pair','tpl-golf-tournament-scoreboard','tpl-halloween-party-registration','tpl-invitation-ceremony','tpl-italian-law-firm-consultation-2026','tpl-job-application-form','tpl-italian-romantic-premium-template','tpl-multipurpose-usa-contact-form','tpl-neon-launch-control-room','tpl-new-orleans-event-registration','tpl-passport-concierge-itinerary','tpl-pdf-form-blank','tpl-sticky-spark-creative-brief','tpl-template-639124136870269154','tpl-template-639124137034063476','tpl-template-639124137734507091','tpl-template-639124210007175219','tpl-template-639124210228418310','tpl-v0-contact-map-left-corporate','tpl-v0-contact-map-left-minimal','tpl-v0-contact-map-right-modern','tpl-wedding-scrapbook-story','tpl-bulgaria-discovery-programme','tpl-euro-youth-application')
  AND PortalId IS NULL;
            ");
        }
    }
}
