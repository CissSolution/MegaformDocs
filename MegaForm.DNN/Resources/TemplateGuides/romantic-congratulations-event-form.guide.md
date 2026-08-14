---
{
  "templateGuideSlug": "tpl-romantic-congratulations-event-form",
  "slug": "romantic-congratulations-event-form",
  "theme": "romantic-rose",
  "rootSelector": ".mfp.romantic-celebration",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "attendance",
    "dietary_restrictions",
    "newsletter"
  ],
  "cardFields": [],
  "contentTokens": [
    "brand_subtitle",
    "brand_title",
    "event_date",
    "event_time",
    "event_venue",
    "event_location",
    "section_personal",
    "section_gallery",
    "section_attendance",
    "section_preferences",
    "footer_note"
  ],
  "colorVars": {
    "--rc-cream": "#fef9f5",
    "--rc-blush": "#fff0eb",
    "--rc-rose": "#c45c6a",
    "--rc-rose-light": "#e8919b",
    "--rc-rose-dark": "#a34854",
    "--rc-rose-pale": "#f5d5d8",
    "--rc-gold": "#c9a87c",
    "--rc-gold-light": "#e0c9a8",
    "--rc-gold-dark": "#a08050",
    "--rc-green": "#5a8c5a",
    "--rc-green-light": "#7aac7a",
    "--rc-text": "#3d2c29",
    "--rc-text-muted": "#6b5a56",
    "--rc-white": "#ffffff",
    "--rc-border": "#e8d5d0",
    "--mf-choice-border": "rgba(255,255,255,0.28)",
    "--mf-choice-card": "rgba(255,255,255,0.10)"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "email",
    "phone",
    "attendance",
    "guest_count",
    "meal_preference",
    "dietary_restrictions",
    "special_message",
    "song_request",
    "newsletter"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "Featured",
    "The Grand Toast",
    "Raising glasses to new beginnings",
    "Popular",
    "Joyful Moments",
    "Capturing happiness together",
    "Romantic",
    "Rose Garden",
    "Nature's most beautiful gift",
    "Dance Together",
    "Moving to the rhythm of love",
    "Elegant",
    "Intimate Dinner",
    "An evening of fine dining",
    "Spectacular",
    "Grand Finale",
    "Lighting up the night sky"
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
  "customCssSha256": "feeaab5f9e606b3d189fb5fb50281b841ac88f341c3b6c2a82428f43deaada9e",
  "shellSha256": "db8a1333a5021c4af525f8ccd766b15cd23a3f773ccc302822ff0beafec73f3a"
}
---
# AI Edit Guide — Celebrate With Us

Theme `romantic-rose` · root `.mfp.romantic-celebration` · 11 fields · 1 steps (single).

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
| attendance | Radio | chips | - | 2 |
| guest_count | Select | choice | - | 4 |
| meal_preference | Select | choice | - | 4 |
| dietary_restrictions | Checkbox | chips | - | 4 |
| special_message | Textarea | input | - |  |
| song_request | Text | input | - |  |
| newsletter | Checkbox | chips | - | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `brand_title`: "With Love"
- `brand_subtitle`: "A Celebration of Joy"
- `event_date`: "June 21, 2026"
- `event_time`: "6:00 PM"
- `event_venue`: "Rose Garden Estate"
- `event_location`: "Beverly Hills, California"
- `section_personal`: "Your Details"
- `section_gallery`: "Celebration Moments"
- `section_attendance`: "Your Response"
- `section_preferences`: "Preferences"
- `footer_note`: "Your presence would be the greatest gift of all"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "Featured"
- "The Grand Toast"
- "Raising glasses to new beginnings"
- "Popular"
- "Joyful Moments"
- "Capturing happiness together"
- "Romantic"
- "Rose Garden"
- "Nature's most beautiful gift"
- "Dance Together"
- "Moving to the rhythm of love"
- "Elegant"
- "Intimate Dinner"
- "An evening of fine dining"
- "Spectacular"
- "Grand Finale"
- "Lighting up the night sky"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: attendance, dietary_restrictions, newsletter): `{op:"set_field_property", key:"attendance", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--rc-cream`: #fef9f5
  - `--rc-blush`: #fff0eb
  - `--rc-rose`: #c45c6a
  - `--rc-rose-light`: #e8919b
  - `--rc-rose-dark`: #a34854
  - `--rc-rose-pale`: #f5d5d8
  - `--rc-gold`: #c9a87c
  - `--rc-gold-light`: #e0c9a8
  - `--rc-gold-dark`: #a08050
  - `--rc-green`: #5a8c5a
  - `--rc-green-light`: #7aac7a
  - `--rc-text`: #3d2c29
  - `--rc-text-muted`: #6b5a56
  - `--rc-white`: #ffffff
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `feeaab5f9e60…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `theme_selector`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `feeaab5f9e606b3d…` · customHtml shell sha256 stays `db8a1333a5021c4a…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `romantic-rose`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
