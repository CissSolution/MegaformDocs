---
{
  "templateGuideSlug": "tpl-invoice-dark-application",
  "slug": "invoice-dark-application",
  "theme": "invoice-dark-premium",
  "rootSelector": ".mfp.mfp-invoice-dark",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "interests"
  ],
  "cardFields": [
    "programme",
    "accommodation"
  ],
  "contentTokens": [
    "brand",
    "addr1",
    "addr2",
    "addr3",
    "kicker",
    "doctitle_top",
    "doctitle",
    "invno",
    "invdate",
    "currency",
    "tax_rate",
    "subtotal_label",
    "tax_label",
    "total_label",
    "backlabel",
    "footer"
  ],
  "colorVars": {
    "--io-accent": "#FFFFFF",
    "--io-accent-soft": "#DDDDDD",
    "--io-ink": "#FFFFFF",
    "--io-page": "#111111",
    "--io-muted": "#888888",
    "--io-line": "#333333",
    "--io-row": "#1A1A1A",
    "--io-card": "#222222"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "email",
    "phone",
    "birth_year",
    "country",
    "start_month",
    "duration",
    "programme",
    "items",
    "grand_total",
    "interests",
    "accommodation",
    "motivation",
    "newsletter",
    "terms"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "EY",
    "No:",
    "Date:",
    "Bill To",
    "Applicant Details",
    "Programme Selection",
    "Service Description",
    "Interests",
    "Accommodation Preference",
    "Motivation Statement"
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
  "customCssSha256": "fad986d00bd9c50ecd6f06dd4ec5f58d953fc342f8a56c3670a90d5fdb8b69ed",
  "shellSha256": "fe3a7833ac2bbc003de393a2d1e62ee6b7117d86f47086c66f6ebd81f4d5b7f9"
}
---
# AI Edit Guide — Invoice Dark — Programme Application

Theme `invoice-dark-premium` · root `.mfp.mfp-invoice-dark` · 16 fields · 1 steps (single).

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
| phone | Text | input | - |  |
| birth_year | Text | input | - |  |
| country | Select | choice | - | 13 |
| start_month | Select | choice | - | 12 |
| duration | Number | input | - |  |
| programme | Radio | cards | - | 3 |
| items | DataGrid | input | - |  |
| grand_total | Number | input | - |  |
| interests | Checkbox | chips | - | 8 |
| accommodation | Radio | cards | - | 3 |
| motivation | Textarea | input | - |  |
| newsletter | Checkbox | choice | - | 1 |
| terms | Checkbox | choice | - | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `brand`: "EUROYOUTH"
- `addr1`: "Erasmus House, 12 Exchange Square"
- `addr2`: "Brussels, BE 1000"
- `addr3`: "info@euroyouth.eu"
- `kicker`: "Application Form"
- `doctitle`: "INVOICE"
- `doctitle_top`: "SAMPLE"
- `invno`: "INV-466487"
- `invdate`: "26 Jul 2026"
- `backlabel`: "← Back"
- `currency`: "€"
- `tax_rate`: "0"
- `subtotal_label`: "Subtotal"
- `tax_label`: "Tax (0%)"
- `total_label`: "TOTAL"
- `footer`: "EuroYouth Exchange · Registered charity No. 8821034 · info@e"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "EY"
- "No:"
- "Date:"
- "Bill To"
- "Applicant Details"
- "Programme Selection"
- "Service Description"
- "Interests"
- "Accommodation Preference"
- "Motivation Statement"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: interests): `{op:"set_field_property", key:"interests", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: programme, accommodation): `{op:"set_field_property", key:"programme", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--io-accent`: #FFFFFF
  - `--io-accent-soft`: #DDDDDD
  - `--io-ink`: #FFFFFF
  - `--io-page`: #111111
  - `--io-muted`: #888888
  - `--io-line`: #333333
  - `--io-row`: #1A1A1A
  - `--io-card`: #222222
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `fad986d00bd9…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `invoice_totals`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `fad986d00bd9c50e…` · customHtml shell sha256 stays `fe3a7833ac2bbc00…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `invoice-dark-premium`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
