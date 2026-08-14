---
{
  "templateGuideSlug": "tpl-realestate-registration",
  "slug": "realestate-registration",
  "theme": "system",
  "rootSelector": ".mfp.mfp-realestate-registration.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "interests",
    "accommodation"
  ],
  "cardFields": [],
  "contentTokens": [],
  "colorVars": {
    "--rey-ink": "#1c1c1e",
    "--rey-primary": "#e8881a",
    "--rey-page": "#f0ebe0",
    "--rey-paper": "#fffcf5",
    "--rey-muted": "#8a8a8f",
    "--rey-line": "#e5e0d8",
    "--rey-input": "#fff",
    "--rey-soft": "#fff3e0",
    "--rey-error": "#c0392b"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "email",
    "phone",
    "birth_year",
    "country",
    "programme",
    "duration",
    "start_month",
    "language_level",
    "interests",
    "accommodation",
    "scholarship",
    "motivation",
    "signature",
    "newsletter",
    "terms",
    "utm_source",
    "utm_campaign"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "&#8962; EuroYouth Exchange",
    "Registration Form",
    "Your gateway to European youth programmes",
    "Date",
    "24 Jul 2026",
    "&#9673; Brussels, Belgium",
    "&#9742; +32 2 555 0100",
    "&#9993; info@euroyouth.eu",
    "&#9786;",
    "Personal Information",
    "&#9670;",
    "Programme Details",
    "&#8962;",
    "Logistics & Support",
    "&#9635;",
    "Application Summary",
    "Item",
    "Duration",
    "Start",
    "Status",
    "Select a programme above to see summary",
    "Total items",
    "Declaration",
    "&#8249;",
    "Back to Forms",
    "Submit Application",
    "&#10003;",
    "EuroYouth Exchange &copy; 2026",
    "Form REG-2026-001"
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
  "customCssSha256": "aad7feca42fbb23a66b1784c1d13c91ec303b0fd24eb14c896f7c028a1fe1fc7",
  "shellSha256": "943af5f05883d98f2b185eb3f90b1d9e32f0e18d9e7f02d04bcbf29aa124b5ed"
}
---
# AI Edit Guide — EuroYouth Estate Registration

Theme `system` · root `.mfp.mfp-realestate-registration.mfp-native-generated` · 19 fields · 1 steps (single).

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
| birth_year | Number | input | - |  |
| country | Select | choice | - | 13 |
| programme | Select | choice | - | 3 |
| duration | Select | choice | - | 6 |
| start_month | Select | choice | - | 12 |
| language_level | Select | choice | - | 3 |
| interests | Checkbox | chips | - | 8 |
| accommodation | Radio | chips | - | 4 |
| scholarship | Checkbox | choice | - | 1 |
| motivation | Textarea | input | - |  |
| signature | Signature | input | - |  |
| newsletter | Checkbox | choice | - | 1 |
| terms | Checkbox | choice | - | 1 |
| utm_source | Hidden | input | - |  |
| utm_campaign | Hidden | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
_(none — this template has no {{content:*}} tokens)_

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "&#8962; EuroYouth Exchange"
- "Registration Form"
- "Your gateway to European youth programmes"
- "Date"
- "24 Jul 2026"
- "&#9673; Brussels, Belgium"
- "&#9742; +32 2 555 0100"
- "&#9993; info@euroyouth.eu"
- "&#9786;"
- "Personal Information"
- "&#9670;"
- "Programme Details"
- "&#8962;"
- "Logistics & Support"
- "&#9635;"
- "Application Summary"
- "Item"
- "Duration"
- "Start"
- "Status"
- "Select a programme above to see summary"
- "Total items"
- "Declaration"
- "&#8249;"
- "Back to Forms"
- "Submit Application"
- "&#10003;"
- "EuroYouth Exchange &copy; 2026"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: interests, accommodation): `{op:"set_field_property", key:"interests", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--rey-ink`: #1c1c1e
  - `--rey-primary`: #e8881a
  - `--rey-page`: #f0ebe0
  - `--rey-paper`: #fffcf5
  - `--rey-muted`: #8a8a8f
  - `--rey-line`: #e5e0d8
  - `--rey-input`: #fff
  - `--rey-soft`: #fff3e0
  - `--rey-error`: #c0392b
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `aad7feca42fb…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `the wizard script`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `aad7feca42fbb23a…` · customHtml shell sha256 stays `943af5f05883d98f…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `system`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
