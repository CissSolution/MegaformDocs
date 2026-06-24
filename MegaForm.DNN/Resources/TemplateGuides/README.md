# MegaForm Premium Template Guides

This folder contains one guide file per Premium template.

Each guide is consumed by the AI assistant and by validation gates to ensure refine operations do not break the custom HTML/CSS design.

## Index (33 templates)

- [`alpine-retreat-escape.md`](alpine-retreat-escape.md) — template `alpine-retreat-escape`
- [`blueprint-property-brief.md`](blueprint-property-brief.md) — template `blueprint-property-brief`
- [`botanical-volunteer-story.md`](botanical-volunteer-story.md) — template `botanical-volunteer-story`
- [`bulgaria-discovery-programme.md`](bulgaria-discovery-programme.md) — template `bulgaria-discovery-programme`
- [`clinic-concierge-serene.md`](clinic-concierge-serene.md) — template `clinic-concierge-serene`
- [`editorial-monochrome-portfolio.md`](editorial-monochrome-portfolio.md) — template `editorial-monochrome-portfolio`
- [`euro-youth-application.md`](euro-youth-application.md) — template `euro-youth-application`
- [`festival-speaker-spotlight.md`](festival-speaker-spotlight.md) — template `festival-speaker-spotlight`
- [`french-invitation-2026.md`](french-invitation-2026.md) — template `french-invitation-2026`
- [`french-product-consultation-2026.md`](french-product-consultation-2026.md) — template `french-product-consultation-2026`
- [`golf-tournament-individual.md`](golf-tournament-individual.md) — template `golf-tournament-individual`
- [`golf-tournament-pair.md`](golf-tournament-pair.md) — template `golf-tournament-pair`
- [`golf-tournament-scoreboard.md`](golf-tournament-scoreboard.md) — template `golf-tournament-scoreboard`
- [`halloween-party-registration.md`](halloween-party-registration.md) — template `halloween-party-registration`
- [`invitation-ceremony.md`](invitation-ceremony.md) — template `invitation-ceremony`
- [`italian-law-firm-consultation-2026.md`](italian-law-firm-consultation-2026.md) — template `italian-law-firm-consultation-2026`
- [`italian-romantic-premium-template.md`](italian-romantic-premium-template.md) — template `italian-romantic-premium-template`
- [`job-application-form.md`](job-application-form.md) — template `job-application-form`
- [`multipurpose-usa-contact-form.md`](multipurpose-usa-contact-form.md) — template `multipurpose-usa-contact-form`
- [`neon-launch-control-room.md`](neon-launch-control-room.md) — template `neon-launch-control-room`
- [`new-orleans-event-registration.md`](new-orleans-event-registration.md) — template `new-orleans-event-registration`
- [`passport-concierge-itinerary.md`](passport-concierge-itinerary.md) — template `passport-concierge-itinerary`
- [`pdf-form-blank.md`](pdf-form-blank.md) — template `pdf-form-blank`
- [`sticky-spark-creative-brief.md`](sticky-spark-creative-brief.md) — template `sticky-spark-creative-brief`
- [`template-639124136870269154.md`](template-639124136870269154.md) — template `template-639124136870269154`
- [`template-639124137034063476.md`](template-639124137034063476.md) — template `template-639124137034063476`
- [`template-639124137734507091.md`](template-639124137734507091.md) — template `template-639124137734507091`
- [`template-639124210007175219.md`](template-639124210007175219.md) — template `template-639124210007175219`
- [`template-639124210228418310.md`](template-639124210228418310.md) — template `template-639124210228418310`
- [`v0-contact-map-left-corporate.md`](v0-contact-map-left-corporate.md) — template `v0-contact-map-left-corporate`
- [`v0-contact-map-left-minimal.md`](v0-contact-map-left-minimal.md) — template `v0-contact-map-left-minimal`
- [`v0-contact-map-right-modern.md`](v0-contact-map-right-modern.md) — template `v0-contact-map-right-modern`
- [`wedding-scrapbook-story.md`](wedding-scrapbook-story.md) — template `wedding-scrapbook-story`

## Adding / updating a guide

See `Docs/TEMPLATE_GUIDE_SPEC.md`.

## Note

These files are shipped in both DNN and Oqtane resource folders; keep them in sync.

### Known duplicate slugs

Two source JSONs share the same `slug` (`invitation-ceremony`):

- `invitation-ceremony-another.json`
- `invitation-ceremony-v6.json`

Only one guide file (`invitation-ceremony.md`) was generated. If the two variants diverge significantly, create separate guide slugs (e.g. `tpl-invitation-ceremony-another` and `tpl-invitation-ceremony-v6`) and update the template JSONs accordingly.
