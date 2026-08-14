---
{
  "templateGuideSlug": "tpl-glass-course-mentor-application",
  "slug": "glass-course-mentor-application",
  "theme": "modern-blue",
  "rootSelector": ".mfp-submit",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "level",
    "needs_certificate"
  ],
  "cardFields": [],
  "contentTokens": [
    "text1",
    "text2",
    "text3",
    "text6"
  ],
  "colorVars": {
    "--rose-pink": "#c45c6a",
    "--rose-pink-light": "#e8919b",
    "--rose-pink-dark": "#a34854",
    "--rose-cream": "#fef9f3",
    "--rose-blush": "#fdf2e9",
    "--rose-green": "#4a7c59",
    "--rose-green-light": "#5a9c69",
    "--rose-gold": "#b8860b",
    "--rose-gold-light": "#d4a84b",
    "--rose-text": "#3d2c29",
    "--rose-text-muted": "#6b5a56",
    "--rose-border": "#e8d5c4",
    "--rose-white": "#ffffff",
    "--mf-choice-border": "rgba(255,255,255,0.28)",
    "--mf-choice-card": "rgba(255,255,255,0.10)"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "email",
    "phone",
    "step_profile",
    "track",
    "level",
    "portfolio_url",
    "goal",
    "needs_certificate",
    "shipping_address",
    "step_finish",
    "signature"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "Submit Application"
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
  "customCssSha256": "76e0d025ed35e012c466de9121709921c50f7d1e7ba19f6959c550b056cf481d",
  "shellSha256": "814dbe2ac74f3ef364c5432bd45abfe99ca904d7ee2f910891961433b2f756f1"
}
---
# AI Edit Guide — Rose Festival 2026

Theme `modern-blue` · root `.mfp-submit` · 13 fields · 1 steps (single).

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
| step_profile | Section | input | - |  |
| track | Select | choice | - | 4 |
| level | Radio | chips | - | 3 |
| portfolio_url | Url | input | - |  |
| goal | Textarea | input | - |  |
| needs_certificate | Radio | chips | - | 2 |
| shipping_address | Address | input | - |  |
| step_finish | Section | input | - |  |
| signature | Signature | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `text1`: "April Festival 2026"
- `text2`: "Bloom with Us"
- `text3`: "Spring Mentor Application"
- `text4`: "Application Form"
- `text5`: "Share your details and let your journey begin"
- `text6`: "Crafted with care for the April Festival"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "Submit Application"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: level, needs_certificate): `{op:"set_field_property", key:"level", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--rose-pink`: #c45c6a
  - `--rose-pink-light`: #e8919b
  - `--rose-pink-dark`: #a34854
  - `--rose-cream`: #fef9f3
  - `--rose-blush`: #fdf2e9
  - `--rose-green`: #4a7c59
  - `--rose-green-light`: #5a9c69
  - `--rose-gold`: #b8860b
  - `--rose-gold-light`: #d4a84b
  - `--rose-text`: #3d2c29
  - `--rose-text-muted`: #6b5a56
  - `--rose-border`: #e8d5c4
  - `--rose-white`: #ffffff
  - `--mf-choice-border`: rgba(255,255,255,0.28)
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `76e0d025ed35…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `theme_selector`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `76e0d025ed35e012…` · customHtml shell sha256 stays `814dbe2ac74f3ef3…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `modern-blue`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
