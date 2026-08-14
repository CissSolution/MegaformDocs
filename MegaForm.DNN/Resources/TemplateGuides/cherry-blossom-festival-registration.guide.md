---
{
  "templateGuideSlug": "tpl-cherry-blossom-festival-registration",
  "slug": "cherry-blossom-festival-registration",
  "theme": "sakura-premium",
  "rootSelector": ".mfp.mfp-sakura",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "ticket_type",
    "activities",
    "newsletter"
  ],
  "cardFields": [],
  "contentTokens": [
    "hero_title",
    "hero_subtitle",
    "event_card_1_image",
    "event_card_1_title",
    "event_card_1_desc",
    "event_card_2_image",
    "event_card_2_title",
    "event_card_2_desc",
    "event_card_3_image",
    "event_card_3_title",
    "event_card_3_desc",
    "section_attendee",
    "section_event",
    "section_preferences",
    "footer_note"
  ],
  "colorVars": {
    "--sakura-pink": "#ffb7c5",
    "--sakura-light": "#fff0f3",
    "--sakura-deep": "#d4668e",
    "--sakura-blossom": "#ffc0cb",
    "--branch-brown": "#8b6914",
    "--leaf-green": "#7cb342",
    "--bg-cream": "#fefcf9",
    "--text-dark": "#2d2926",
    "--text-muted": "#6b5b5b",
    "--card-bg": "rgba(255,255,255,0.92)",
    "--mf-choice-border": "rgba(255,255,255,0.28)",
    "--mf-choice-card": "rgba(255,255,255,0.10)"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "email",
    "phone",
    "city",
    "country",
    "visit_date",
    "ticket_type",
    "adult_count",
    "child_count",
    "activities",
    "dietary",
    "special_requests",
    "newsletter",
    "terms"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [],
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
  "customCssSha256": "b8c8e08b3cdd27e157967fbe7fa6f3bc1c9dff5b7348603e08249726f08c47c1",
  "shellSha256": "3d4db5d552490ae0750d02d269ca48f97c59eb32fa54bfef321b6281875488b5"
}
---
# AI Edit Guide — National Cherry Blossom Festival

Theme `sakura-premium` · root `.mfp.mfp-sakura` · 15 fields · 1 steps (single).

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
| first_name | Text | input | - |  |
| last_name | Text | input | - |  |
| email | Email | input | - |  |
| phone | Phone | input | - |  |
| city | Text | input | - |  |
| country | Select | choice | - | 6 |
| visit_date | Date | input | - |  |
| ticket_type | Radio | chips | - | 4 |
| adult_count | Select | choice | - | 5 |
| child_count | Select | choice | - | 5 |
| activities | Checkbox | chips | - | 8 |
| dietary | Select | choice | - | 7 |
| special_requests | Textarea | input | - |  |
| newsletter | Checkbox | chips | - | 1 |
| terms | Checkbox | choice | - | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `section_attendee`: "Attendee Information"
- `section_event`: "Festival Experience"
- `section_preferences`: "Your Preferences"
- `footer_note`: "We look forward to welcoming you to the festival!"
- `hero_title`: "Welcome to Sakura Season"
- `hero_subtitle`: "Experience the magic of cherry blossoms"
- `event_card_1_title`: "Garden Walk"
- `event_card_1_desc`: "Stroll through blooming sakura trees"
- `event_card_1_image`: "https://images.unsplash.com/photo-1522383225653-ed111181a951"
- `event_card_2_title`: "Tea Ceremony"
- `event_card_2_desc`: "Traditional Japanese tea experience"
- `event_card_2_image`: "https://images.unsplash.com/photo-1545048702-79362596cdc9?au"
- `event_card_3_title`: "Lantern Festival"
- `event_card_3_desc`: "Evening illumination celebration"
- `event_card_3_image`: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: ticket_type, activities, newsletter): `{op:"set_field_property", key:"ticket_type", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--sakura-pink`: #ffb7c5
  - `--sakura-light`: #fff0f3
  - `--sakura-deep`: #d4668e
  - `--sakura-blossom`: #ffc0cb
  - `--branch-brown`: #8b6914
  - `--leaf-green`: #7cb342
  - `--bg-cream`: #fefcf9
  - `--text-dark`: #2d2926
  - `--text-muted`: #6b5b5b
  - `--card-bg`: rgba(255,255,255,0.92)
  - `--mf-choice-border`: rgba(255,255,255,0.28)
  - `--mf-choice-card`: rgba(255,255,255,0.10)
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `b8c8e08b3cdd…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `theme_selector`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `b8c8e08b3cdd27e1…` · customHtml shell sha256 stays `3d4db5d552490ae0…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `sakura-premium`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
