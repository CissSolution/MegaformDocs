---
{
  "templateGuideSlug": "tpl-french-invitation-2026",
  "slug": "french-invitation-2026",
  "theme": "french-elegant",
  "rootSelector": ".mfp.fr-inv",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "dietary_restrictions"
  ],
  "cardFields": [],
  "contentTokens": [
    "text1",
    "text2",
    "text3",
    "text4"
  ],
  "colorVars": {
    "--fr-cream": "#faf8f5",
    "--fr-ivory": "#f5f2ed",
    "--fr-gold": "#b8956e",
    "--fr-gold-dk": "#9a7856",
    "--fr-burgundy": "#722f37",
    "--fr-charcoal": "#2c2c2c",
    "--fr-text": "#3d3d3d",
    "--fr-muted": "#6b6b6b",
    "--fr-white": "#ffffff",
    "--fr-border": "#d4cfc6",
    "--fr-champagne": "#e8e2d9",
    "--mf-choice-border": "rgba(255,255,255,0.28)",
    "--mf-choice-card": "rgba(255,255,255,0.10)"
  },
  "lockedKeys": [
    "section_page1",
    "first_name",
    "last_name",
    "email",
    "phone",
    "guest_count",
    "attendance",
    "meal_preference",
    "dietary_restrictions",
    "special_notes"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "AB",
    "SAT",
    "JUN 2026",
    "Chateau de Lumiere",
    "Paris, France"
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
  "customCssSha256": "bede8c388e39ffc3dfe172bcc83b46db68bc7de4016272ed86872ec8f57320f9",
  "shellSha256": "4837db51137c4e6601207a8ad8ef50a702d29d7275fd377d61f135928502abb7"
}
---
# AI Edit Guide — Vous Etes Invite

Theme `french-elegant` · root `.mfp.fr-inv` · 10 fields · 1 steps (single).

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
| section_page1 | Section | input | - |  |
| first_name | Text | input | - |  |
| last_name | Text | input | - |  |
| email | Email | input | - |  |
| phone | Phone | input | - |  |
| guest_count | Select | choice | - | 5 |
| attendance | Select | choice | - | 2 |
| meal_preference | Select | choice | - | 4 |
| dietary_restrictions | Checkbox | chips | - | 4 |
| special_notes | Textarea | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `text1`: "Your Details"
- `text2`: "Attendance"
- `text3`: "Preferences"
- `text4`: "Dietary & Notes"
- `page1_title`: "Personal Information"
- `page2_title`: "Your Response"
- `step1`: "Details"
- `step2`: "RSVP"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "AB"
- "SAT"
- "JUN 2026"
- "Chateau de Lumiere"
- "Paris, France"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: dietary_restrictions): `{op:"set_field_property", key:"dietary_restrictions", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--fr-cream`: #faf8f5
  - `--fr-ivory`: #f5f2ed
  - `--fr-gold`: #b8956e
  - `--fr-gold-dk`: #9a7856
  - `--fr-burgundy`: #722f37
  - `--fr-charcoal`: #2c2c2c
  - `--fr-text`: #3d3d3d
  - `--fr-muted`: #6b6b6b
  - `--fr-white`: #ffffff
  - `--fr-border`: #d4cfc6
  - `--fr-champagne`: #e8e2d9
  - `--mf-choice-border`: rgba(255,255,255,0.28)
  - `--mf-choice-card`: rgba(255,255,255,0.10)
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `bede8c388e39…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `theme_selector`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `bede8c388e39ffc3…` · customHtml shell sha256 stays `4837db51137c4e66…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `french-elegant`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
