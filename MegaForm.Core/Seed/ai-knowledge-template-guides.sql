-- ============================================================
-- AI Knowledge — Premium Template Guides (file-linked)
-- ============================================================
-- Each row's Body is a JSON pointer to a .md file under
--   /DesktopModules/MegaForm/Resources/TemplateGuides/
--   /wwwroot/Modules/MegaForm/Resources/TemplateGuides/
-- The server resolver loads the file at request time.
--
-- To add a new guide: drop a .md file + append one INSERT below.
-- ============================================================

SET NOCOUNT ON;


-- 1. tpl-alpine-retreat-escape
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-alpine-retreat-escape' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-alpine-retreat-escape',
        N'template_guide',
        N'Alpine Retreat Escape Planner',
        N'A cinematic booking inquiry with a scenic hero image and glass panels.',
        N'{"guide_file": "alpine-retreat-escape.md"}',
        N'premium,template-guide,premium',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 2. tpl-blueprint-property-brief
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-blueprint-property-brief' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-blueprint-property-brief',
        N'template_guide',
        N'Blueprint Property Brief',
        N'A bold real-estate intake styled like an architectural plan board.',
        N'{"guide_file": "blueprint-property-brief.md"}',
        N'premium,template-guide,premium',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 3. tpl-botanical-volunteer-story
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-botanical-volunteer-story' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-botanical-volunteer-story',
        N'template_guide',
        N'Botanical Volunteer Story Form',
        N'A nature-inspired signup with an immersive photo background and frosted cards.',
        N'{"guide_file": "botanical-volunteer-story.md"}',
        N'premium,template-guide,premium',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 4. tpl-clinic-concierge-serene
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-clinic-concierge-serene' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-clinic-concierge-serene',
        N'template_guide',
        N'Clinic Concierge Serene Intake',
        N'A modern healthcare intake with calm colors and a premium concierge feel.',
        N'{"guide_file": "clinic-concierge-serene.md"}',
        N'premium,template-guide,premium',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 5. tpl-editorial-monochrome-portfolio
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-editorial-monochrome-portfolio' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-editorial-monochrome-portfolio',
        N'template_guide',
        N'Editorial Monochrome Portfolio Submission',
        N'A magazine-inspired application with bold black-and-white styling.',
        N'{"guide_file": "editorial-monochrome-portfolio.md"}',
        N'premium,template-guide,premium',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 6. tpl-festival-speaker-spotlight
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-festival-speaker-spotlight' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-festival-speaker-spotlight',
        N'template_guide',
        N'Festival Speaker Spotlight Form',
        N'A vibrant speaker application with stage-like contrast and premium blocks.',
        N'{"guide_file": "festival-speaker-spotlight.md"}',
        N'premium,template-guide,premium',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 7. tpl-french-invitation-2026
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-french-invitation-2026' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-french-invitation-2026',
        N'template_guide',
        N'Vous Etes Invite',
        N'We would be honored by your presence at our celebration',
        N'{"guide_file": "french-invitation-2026.md"}',
        N'premium,template-guide,invitation',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 8. tpl-french-product-consultation-2026
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-french-product-consultation-2026' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-french-product-consultation-2026',
        N'template_guide',
        N'Product Consultation',
        N'Schedule a personalized consultation with our product specialists',
        N'{"guide_file": "french-product-consultation-2026.md"}',
        N'premium,template-guide,general',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 9. tpl-golf-tournament-individual
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-golf-tournament-individual' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-golf-tournament-individual',
        N'template_guide',
        N'Golf Tournament — Individual (Senior Championship style)',
        N'GolfGenius-style multi-round leaderboard for individual stroke-play tournaments. Mimics https://lbgf-2026seniorchampionship1.golfgenius.com style: flight accordions, click player → expand inline 3-round scorecards with score color marks (re',
        N'{"guide_file": "golf-tournament-individual.md"}',
        N'premium,template-guide,reports',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 10. tpl-golf-tournament-pair
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-golf-tournament-pair' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-golf-tournament-pair',
        N'template_guide',
        N'Golf Tournament — Pair / 2 Person (Couples League style)',
        N'GolfGenius-style 2-person team leaderboard. Mimics https://www.golfgenius.com/pages/5155134566574327893: pair accordion, click pair name → expand inline scorecards for BOTH players with full Yardage/Par/Stroke Index rows + score color marks',
        N'{"guide_file": "golf-tournament-pair.md"}',
        N'premium,template-guide,reports',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 11. tpl-golf-tournament-scoreboard
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-golf-tournament-scoreboard' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-golf-tournament-scoreboard',
        N'template_guide',
        N'Golf Tournament Scoreboard',
        N'Multi-round leaderboard with inline drill-down to per-round hole-by-hole scorecards. Configure to your Golf.dbo.CardResultNew table.',
        N'{"guide_file": "golf-tournament-scoreboard.md"}',
        N'premium,template-guide,reports',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 12. tpl-halloween-party-registration
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-halloween-party-registration' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-halloween-party-registration',
        N'template_guide',
        N'Spooky Night Party',
        N'Join us for a frighteningly fun Halloween celebration with costumes, treats, and thrills!',
        N'{"guide_file": "halloween-party-registration.md"}',
        N'premium,template-guide,event-registration',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 13. tpl-invitation-ceremony
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-invitation-ceremony' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-invitation-ceremony',
        N'template_guide',
        N'Celebration',
        N'We cannot wait to celebrate with you',
        N'{"guide_file": "invitation-ceremony.md"}',
        N'premium,template-guide,invitation',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 14. tpl-italian-law-firm-consultation-2026
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-italian-law-firm-consultation-2026' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-italian-law-firm-consultation-2026',
        N'template_guide',
        N'Legal Consultation Request',
        N'Connect with our distinguished legal team for expert guidance',
        N'{"guide_file": "italian-law-firm-consultation-2026.md"}',
        N'premium,template-guide,professional',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 15. tpl-job-application-form
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-job-application-form' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-job-application-form',
        N'template_guide',
        N'Job Application Form',
        N'Join our team and grow your career with us',
        N'{"guide_file": "job-application-form.md"}',
        N'premium,template-guide,standard-application',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 16. tpl-italian-romantic-premium-template
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-italian-romantic-premium-template' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-italian-romantic-premium-template',
        N'template_guide',
        N'Contact Us',
        N'We would love to hear from you. Fill out the form below and our team will get back to you shortly.',
        N'{"guide_file": "italian-romantic-premium-template.md"}',
        N'premium,template-guide,contact',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 17. tpl-multipurpose-usa-contact-form
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-multipurpose-usa-contact-form' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-multipurpose-usa-contact-form',
        N'template_guide',
        N'Get In Touch With Us',
        N'We''re here to help you succeed. Fill out the form below and our team will get back to you within 24 hours.',
        N'{"guide_file": "multipurpose-usa-contact-form.md"}',
        N'premium,template-guide,contact',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 18. tpl-neon-launch-control-room
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-neon-launch-control-room' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-neon-launch-control-room',
        N'template_guide',
        N'Neon Launch Control Room',
        N'A bold startup launch intake with a futuristic dark console look.',
        N'{"guide_file": "neon-launch-control-room.md"}',
        N'premium,template-guide,premium',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 19. tpl-new-orleans-event-registration
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-new-orleans-event-registration' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-new-orleans-event-registration',
        N'template_guide',
        N'Mardi Gras Celebration',
        N'Join us for an unforgettable night of jazz, festivities, and New Orleans magic.',
        N'{"guide_file": "new-orleans-event-registration.md"}',
        N'premium,template-guide,event-registration',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 20. tpl-passport-concierge-itinerary
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-passport-concierge-itinerary' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-passport-concierge-itinerary',
        N'template_guide',
        N'Passport Concierge Itinerary Form',
        N'A travel-planning template with passport-book styling and destination vibes.',
        N'{"guide_file": "passport-concierge-itinerary.md"}',
        N'premium,template-guide,premium',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 21. tpl-pdf-form-blank
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-pdf-form-blank' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-pdf-form-blank',
        N'template_guide',
        N'PDF Form — Blank (paper-style)',
        N'Minimal PDF Form starter. Adds an empty PdfForm widget so you can immediately upload your own PDF and drag fields onto it. Best for paper forms (contracts, applications, intake sheets) where you want end-users to fill in inputs over an exis',
        N'{"guide_file": "pdf-form-blank.md"}',
        N'premium,template-guide,inputs',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 22. tpl-sticky-spark-creative-brief
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-sticky-spark-creative-brief' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-sticky-spark-creative-brief',
        N'template_guide',
        N'Sticky Spark Creative Brief',
        N'A colorful creative intake styled like a wall of sticky notes.',
        N'{"guide_file": "sticky-spark-creative-brief.md"}',
        N'premium,template-guide,premium',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 23. tpl-template-639124136870269154
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-template-639124136870269154' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-template-639124136870269154',
        N'template_guide',
        N'Contact Us',
        N'We would love to hear from you. Fill out the form below and our team will get back to you shortly.',
        N'{"guide_file": "template-639124136870269154.md"}',
        N'premium,template-guide,contact',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 24. tpl-template-639124137034063476
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-template-639124137034063476' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-template-639124137034063476',
        N'template_guide',
        N'Celebration',
        N'We cannot wait to celebrate with you',
        N'{"guide_file": "template-639124137034063476.md"}',
        N'premium,template-guide,invitation',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 25. tpl-template-639124137734507091
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-template-639124137734507091' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-template-639124137734507091',
        N'template_guide',
        N'Celebration RSVP — Stepped',
        N'3-step RSVP form with progress bar + 20 theme presets (French/Italian/American/German)',
        N'{"guide_file": "template-639124137734507091.md"}',
        N'premium,template-guide,invitation',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 26. tpl-template-639124210007175219
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-template-639124210007175219' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-template-639124210007175219',
        N'template_guide',
        N'Personal Training Registration',
        N'Start your fitness transformation with our certified personal trainers',
        N'{"guide_file": "template-639124210007175219.md"}',
        N'premium,template-guide,fitness-wellness',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 27. tpl-template-639124210228418310
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-template-639124210228418310' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-template-639124210228418310',
        N'template_guide',
        N'Style Consultation',
        N'Discover your signature style with our premium collection',
        N'{"guide_file": "template-639124210228418310.md"}',
        N'premium,template-guide,general',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 28. tpl-v0-contact-map-left-corporate
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-v0-contact-map-left-corporate' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-v0-contact-map-left-corporate',
        N'template_guide',
        N'Contact Us - Map Left, Corporate',
        N'Premium contact page with Google Map on the left, form body on the right. Corporate color presets.',
        N'{"guide_file": "v0-contact-map-left-corporate.md"}',
        N'premium,template-guide,contact',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 29. tpl-v0-contact-map-left-minimal
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-v0-contact-map-left-minimal' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-v0-contact-map-left-minimal',
        N'template_guide',
        N'Contact Us - Map Left, Minimal',
        N'Premium contact page with Google Map on the left, form body on the right. Minimal color presets.',
        N'{"guide_file": "v0-contact-map-left-minimal.md"}',
        N'premium,template-guide,contact',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 30. tpl-v0-contact-map-right-modern
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-v0-contact-map-right-modern' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-v0-contact-map-right-modern',
        N'template_guide',
        N'Contact Us - Map Right, Modern',
        N'Premium contact page with Google Map on the right, form body on the left. Modern color presets.',
        N'{"guide_file": "v0-contact-map-right-modern.md"}',
        N'premium,template-guide,contact',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 31. tpl-wedding-scrapbook-story
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-wedding-scrapbook-story' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-wedding-scrapbook-story',
        N'template_guide',
        N'Wedding Scrapbook Story Form',
        N'A romantic scrapbook-inspired planner with polaroid visuals and soft paper cards.',
        N'{"guide_file": "wedding-scrapbook-story.md"}',
        N'premium,template-guide,premium',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 32. tpl-bulgaria-discovery-programme
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-bulgaria-discovery-programme' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-bulgaria-discovery-programme',
        N'template_guide',
        N'Bulgaria Discovery Programme',
        N'Elegant 4-step application form with Rose Valley hero photography, Plovdiv inset, Bulgarian folk borders, and rose, pine, gold palette.',
        N'{"guide_file": "bulgaria-discovery-programme.guide.md"}',
        N'premium,template-guide,travel-application',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 33. tpl-euro-youth-application
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-euro-youth-application' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-euro-youth-application',
        N'template_guide',
        N'EuroYouth 2026 Application',
        N'Apply for European youth mobility programmes across study, language immersion and volunteering tracks.',
        N'{"guide_file": "euro-youth-application.guide.md"}',
        N'premium,template-guide,event-registration',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 34. tpl-festa-italiana
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-festa-italiana' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-festa-italiana',
        N'template_guide',
        N'Festa Italiana',
        N'Warm Italian festival RSVP with hero photography, texture overlay and a multi-step wizard.',
        N'{"guide_file": "festa-italiana.guide.md"}',
        N'premium,template-guide,event-registration',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 35. tpl-down-under-australia
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-down-under-australia' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-down-under-australia',
        N'template_guide',
        N'Down Under Australia Experience',
        N'Reef-and-outback themed travel application with card choices, chip multi-selects and a multi-step wizard.',
        N'{"guide_file": "down-under-australia.guide.md"}',
        N'premium,template-guide,travel-application',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 36. tpl-intake-acme-ocean
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-intake-acme-ocean' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-intake-acme-ocean',
        N'template_guide',
        N'Acme Platform Intake',
        N'Clean ocean-gradient SaaS onboarding intake with a left-rail step wizard and {{content:*}} brand tokens.',
        N'{"guide_file": "intake-acme-ocean.guide.md"}',
        N'premium,template-guide,saas-intake',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 37. tpl-americana-journey
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-americana-journey' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-americana-journey',
        N'template_guide',
        N'The Great American Journey',
        N'Minimalist American road-trip planner with a split hero, restrained Americana palette and a multi-step wizard.',
        N'{"guide_file": "americana-journey.guide.md"}',
        N'premium,template-guide,travel-application',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 38. tpl-event-registration-rsvp
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-event-registration-rsvp' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-event-registration-rsvp',
        N'template_guide',
        N'Event Registration & RSVP',
        N'Premium dark-editorial multi-step event registration & RSVP form with card/chip choices, fully editable in the builder.',
        N'{"guide_file": "event-registration-rsvp.guide.md"}',
        N'premium,template-guide,event-registration',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 39. tpl-wellness-patient-intake
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-wellness-patient-intake' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-wellness-patient-intake',
        N'template_guide',
        N'Wellness & Patient Intake',
        N'Calm, soft multi-step wellness / patient intake form with grouped health sections and a native step wizard.',
        N'{"guide_file": "wellness-patient-intake.guide.md"}',
        N'premium,template-guide,health-intake',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- [AuthContactSet 2026-07-24] The four templates added with the auth/contact set shipped
-- facts+guide files but never got their knowledge rows, which failed the pack-time
-- completeness guard (verify-package-complete.cjs). Same file-pointer shape as above.

-- 40. tpl-azure-contact-request
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-azure-contact-request' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-azure-contact-request',
        N'template_guide',
        N'Azure Contact Request',
        N'Coastal split-photo contact form with reason chips, direct contact details, and a calm blue palette.',
        N'{"guide_file": "azure-contact-request.guide.md"}',
        N'premium,template-guide,contact',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 41. tpl-obsidian-member-login
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-obsidian-member-login' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-obsidian-member-login',
        N'template_guide',
        N'Obsidian Member Login',
        N'Editorial split-photo sign-in launcher that hands credentials to the host authentication flow.',
        N'{"guide_file": "obsidian-member-login.guide.md"}',
        N'premium,template-guide,authentication',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 42. tpl-terracotta-product-feedback
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-terracotta-product-feedback' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-terracotta-product-feedback',
        N'template_guide',
        N'Terracotta Product Feedback',
        N'Warm editorial feedback form with star rating, topic chips, response opt-in, and a photo-led shell.',
        N'{"guide_file": "terracotta-product-feedback.guide.md"}',
        N'premium,template-guide,feedback',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 43. tpl-verdant-member-registration
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-verdant-member-registration' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-verdant-member-registration',
        N'template_guide',
        N'Verdant Member Registration',
        N'Botanical three-step member registration with profile, preferences, consent, and review.',
        N'{"guide_file": "verdant-member-registration.guide.md"}',
        N'premium,template-guide,registration',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 44. tpl-botanical-thankyou
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-botanical-thankyou' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-botanical-thankyou',
        N'template_guide',
        N'Botanical Thank You Application',
        N'Botanical editorial application with underlined fields, sticky sections, and a warm paper finish.',
        N'{"guide_file": "botanical-thankyou.guide.md"}',
        N'premium,template-guide,application',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 45. tpl-cv-registration
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-cv-registration' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-cv-registration',
        N'template_guide',
        N'EuroYouth CV Registration',
        N'Classic two-column CV application with sticky document navigation and a responsive resume layout.',
        N'{"guide_file": "cv-registration.guide.md"}',
        N'premium,template-guide,hr',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 46. tpl-kawaii-diary
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-kawaii-diary' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-kawaii-diary',
        N'template_guide',
        N'Kawaii Diary Application',
        N'Playful notebook-style EuroYouth application with pastel sections and sticky diary navigation.',
        N'{"guide_file": "kawaii-diary.guide.md"}',
        N'premium,template-guide,application',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- 47. tpl-realestate-registration
IF NOT EXISTS (SELECT 1 FROM MF_AI_Knowledge WHERE Slug = N'tpl-realestate-registration' AND PortalId IS NULL)
    INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate)
    VALUES (
        N'tpl-realestate-registration',
        N'template_guide',
        N'EuroYouth Estate Registration',
        N'Warm illustrated EuroYouth registration sheet with sticky section navigation and long-form support.',
        N'{"guide_file": "realestate-registration.guide.md"}',
        N'premium,template-guide,real-estate',
        NULL, 'megaform-builtin', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

-- Keep existing premium guide rows pointing at the new two-file layout (<slug>.guide.md).
UPDATE MF_AI_Knowledge SET Body = N'{"guide_file": "bulgaria-discovery-programme.guide.md"}', UpdatedOnDate = SYSUTCDATETIME()
    WHERE Slug = N'tpl-bulgaria-discovery-programme' AND PortalId IS NULL;
UPDATE MF_AI_Knowledge SET Body = N'{"guide_file": "euro-youth-application.guide.md"}', UpdatedOnDate = SYSUTCDATETIME()
    WHERE Slug = N'tpl-euro-youth-application' AND PortalId IS NULL;

SELECT Slug, Title, Body, UpdatedOnDate

FROM MF_AI_Knowledge

WHERE Kind = 'template_guide'

ORDER BY Slug;
