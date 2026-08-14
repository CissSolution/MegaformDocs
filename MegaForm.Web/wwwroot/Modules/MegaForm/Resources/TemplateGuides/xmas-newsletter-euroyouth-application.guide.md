---
{
  "templateGuideSlug": "tpl-xmas-newsletter-euroyouth-application",
  "slug": "xmas-newsletter-euroyouth-application",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-xnl.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "interests"
  ],
  "cardFields": [
    "programme"
  ],
  "contentTokens": [
    "euroyouth_eu_apply",
    "ey",
    "euroyouth_exchange_no_reply_euroyouth_eu",
    "to_applicant_email_eu",
    "text_7_aug_2026",
    "hero_image",
    "euroyouth",
    "merry_christmas",
    "text_2026_applications_open",
    "limited_spots_available_apply_before_31_december",
    "dear_future_explorer_this_holiday_season_we_are_open",
    "personal_information",
    "first_name",
    "last_name",
    "email",
    "phone",
    "year_of_birth",
    "country",
    "programme_details",
    "start_month",
    "duration_months",
    "language_level",
    "accommodation",
    "your_interests",
    "motivation",
    "submit_application",
    "erasmus_exchange",
    "berlin_paris_madrid",
    "language_immersion",
    "florence_lisbon",
    "solidarity_corps",
    "amsterdam_athens",
    "euroyouth_exchange_erasmus_partner_euroyouth_eu",
    "you_received_this_because_you_requested_programme_in"
  ],
  "colorVars": {
    "--xnl-primary": "#C41E3A",
    "--xnl-accent": "#9B0E25",
    "--xnl-deco": "#D4A017",
    "--xnl-page": "#F5EDE8",
    "--xnl-fill": "#F5EDE8"
  },
  "lockedKeys": [
    "programme",
    "first_name",
    "last_name",
    "email",
    "phone",
    "birth_year",
    "country",
    "start_month",
    "duration",
    "language_level",
    "accommodation",
    "interests",
    "motivation",
    "newsletter",
    "terms"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "🏛️",
    "🗣️",
    "🌿"
  ],
  "allowedOps": [
    "set_form_meta",
    "set_field_property",
    "set_html_text",
    "add_field",
    "remove_field"
  ],
  "forbiddenOps": [
    "replace_form_schema",
    "set customHtml/customCss/theme"
  ],
  "immutable": [
    "customHtml structure (tag tree + classes)",
    "customCss (byte-invariant)",
    "settings.theme",
    "field keys"
  ],
  "customCssSha256": "afe3ca2b71110ae3784bff39e267cba39b3f898301bc28cc3bf7bc93dacda943",
  "shellSha256": "9d158670588e86e3a27db669979d2c7eb99f1adf73d8f878623853d992d33608"
}
---
# AI Edit Guide — EuroYouth Christmas — 2026 Applications

Theme `custom` · root `.mfp.mfp-xnl.mfp-native-generated` · 15 fields · 1 steps (single).

## DETERMINISTIC EDIT PROTOCOL (follow exactly — do NOT improvise structure/CSS)
This is a PREMIUM form. Its look lives in `settings.customHtml` + `settings.customCss` + `settings.theme`, which are **IMMUTABLE**. You may ONLY emit these ops, and ONLY against keys/tokens listed in the frontmatter map:
- `set_form_meta` — title, description, submitButtonText, successMessage, `customContent.<token>`, or `themeCssOverrides` (color only).
- `set_field_property` — label / placeholder / required / options (on an EXISTING key).
- `add_field` — append a new field (the dispatcher injects its `{{field:KEY}}` into the right panel).
- `remove_field` — delete a field + its token.
NEVER emit `customHtml`, `customCss`, `theme`, or `replace_form_schema` for this form. NEVER rename a key in `lockedKeys`. Emit `designDecision:"preserve"` on every op.

## Field map
| key | type | display | step | options |
|-----|------|---------|------|---------|
| programme | Radio | cards | - | 3 |
| first_name | Text | input | - |  |
| last_name | Text | input | - |  |
| email | Email | input | - |  |
| phone | Text | input | - |  |
| birth_year | Text | input | - |  |
| country | Select | choice | - | 13 |
| start_month | Select | choice | - | 12 |
| duration | Text | input | - |  |
| language_level | Select | choice | - | 6 |
| accommodation | Select | choice | - | 4 |
| interests | Checkbox | chips | - | 8 |
| motivation | Textarea | input | - |  |
| newsletter | Checkbox | choice | - | 1 |
| terms | Checkbox | choice | - | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `euroyouth_eu_apply`: "euroyouth.eu / apply"
- `ey`: "EY"
- `euroyouth_exchange_no_reply_euroyouth_eu`: "EuroYouth Exchange <no-reply@euroyouth.eu>"
- `to_applicant_email_eu`: "To: applicant@email.eu ·"
- `text_7_aug_2026`: "7 Aug 2026"
- `euroyouth`: "EuroYouth"
- `merry_christmas`: "MERRY CHRISTMAS"
- `text_2026_applications_open`: "2026 Applications Open"
- `limited_spots_available_apply_before_31_december`: "Limited spots available — apply before 31 December"
- `dear_future_explorer_this_holiday_season_we_are_open`: "Dear future explorer, this holiday season we are opening a s"
- `personal_information`: "Personal Information"
- `first_name`: "First name *"
- `last_name`: "Last name *"
- `email`: "Email *"
- `phone`: "Phone"
- `year_of_birth`: "Year of birth"
- `country`: "Country *"
- `programme_details`: "Programme Details"
- `start_month`: "Start month *"
- `duration_months`: "Duration (months)"
- `language_level`: "Language level"
- `accommodation`: "Accommodation"
- `your_interests`: "Your Interests"
- `motivation`: "Motivation"
- `submit_application`: "Submit Application"
- `erasmus_exchange`: "Erasmus Exchange"
- `berlin_paris_madrid`: "Berlin · Paris · Madrid"
- `language_immersion`: "Language Immersion"
- `florence_lisbon`: "Florence · Lisbon"
- `solidarity_corps`: "Solidarity Corps"
- `amsterdam_athens`: "Amsterdam · Athens"
- `euroyouth_exchange_erasmus_partner_euroyouth_eu`: "EuroYouth Exchange · Erasmus+ Partner · euroyouth.eu"
- `you_received_this_because_you_requested_programme_in`: "You received this because you requested programme informatio"
- `hero_image`: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "🏛️"
- "🗣️"
- "🌿"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: interests): `{op:"set_field_property", key:"interests", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: programme): `{op:"set_field_property", key:"programme", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--xnl-primary`: #C41E3A
  - `--xnl-accent`: #9B0E25
  - `--xnl-deco`: #D4A017
  - `--xnl-page`: #F5EDE8
  - `--xnl-fill`: #F5EDE8
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `afe3ca2b7111…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `mail_date`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `afe3ca2b71110ae3…` · customHtml shell sha256 stays `9d158670588e86e3…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
