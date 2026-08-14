---
{
  "templateGuideSlug": "americana-journey",
  "slug": "americana-journey",
  "theme": "americana-journey-premium",
  "rootSelector": ".mfp.mfp-americana.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "premium-native",
  "stepAnchor": "data-step",
  "stepCount": 4,
  "stepFieldKeys": [
    {
      "step": 0,
      "keys": [
        "row_name",
        "email",
        "phone"
      ]
    },
    {
      "step": 1,
      "keys": [
        "route",
        "style"
      ]
    },
    {
      "step": 2,
      "keys": [
        "experiences",
        "notes"
      ]
    },
    {
      "step": 3,
      "keys": [
        "review_marker"
      ]
    }
  ],
  "chipFields": [
    "experiences"
  ],
  "cardFields": [
    "route",
    "style"
  ],
  "contentTokens": [
    "hero_image"
  ],
  "colorVars": {
    "--am-ink": "#16223d",
    "--am-accent": "#b23a3a",
    "--am-accent-soft": "#f6e9e9",
    "--am-sub": "#6b7689",
    "--am-ring": "#e7e9ef",
    "--am-surface": "#ffffff",
    "--am-field": "#f8f9fb"
  },
  "lockedKeys": [
    "premium_step_1",
    "first_name",
    "last_name",
    "email",
    "phone",
    "premium_step_2",
    "route",
    "style",
    "premium_step_3",
    "experiences",
    "notes",
    "premium_step_4",
    "review_marker"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "&#9733;",
    "The Great American Journey",
    "Plan your American road trip",
    "From desert highways to coastal cliffs &mdash; tell us how you want to see the country.",
    "/ 04 &middot;",
    "Traveler",
    "The Route",
    "Experiences",
    "Review",
    "First, the essentials so we know who's traveling.",
    "Email",
    "Phone",
    "Choose your route",
    "Travel style",
    "What do you want to experience?",
    "Anything else we should know?",
    "Take a look before you send it our way.",
    "&mdash;",
    "Route",
    "Style",
    "Back",
    "Continue",
    "Submit request"
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
  "customCssSha256": "2dfe5666f1e2da59ccbb2df2318f284a522b7850ed3b8767a779696fbacb6d0d",
  "shellSha256": "3f657247c9897aac50c0a1b4cd808391d6c2abfeea824ea72403ba9126acd769"
}
---
# AI Edit Guide — The Great American Journey

Theme `americana-journey-premium` · root `.mfp.mfp-americana.mfp-native-generated` · 13 fields · 4 steps (premium-native).

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
| premium_step_1 | Section | input | - |  |
| first_name | Text | input | 0 |  |
| last_name | Text | input | 0 |  |
| email | Email | input | 0 |  |
| phone | Phone | input | 0 |  |
| premium_step_2 | Section | input | - |  |
| route | Radio | cards | 1 | 4 |
| style | Radio | cards | 1 | 3 |
| premium_step_3 | Section | input | - |  |
| experiences | Checkbox | chips | 2 | 6 |
| notes | Textarea | input | 2 |  |
| premium_step_4 | Section | input | - |  |
| review_marker | Hidden | input | 3 |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `hero_image`: "/Modules/MegaForm/img/mock/americana-hero.png"
- `coastal_image`: "/Modules/MegaForm/img/mock/americana-coast.png"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "&#9733;"
- "The Great American Journey"
- "Plan your American road trip"
- "From desert highways to coastal cliffs &mdash; tell us how you want to see the country."
- "/ 04 &middot;"
- "Traveler"
- "The Route"
- "Experiences"
- "Review"
- "First, the essentials so we know who's traveling."
- "Email"
- "Phone"
- "Choose your route"
- "Travel style"
- "What do you want to experience?"
- "Anything else we should know?"
- "Take a look before you send it our way."
- "&mdash;"
- "Route"
- "Style"
- "Back"
- "Continue"
- "Submit request"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: experiences): `{op:"set_field_property", key:"experiences", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: route, style): `{op:"set_field_property", key:"route", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:3, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--am-ink`: #16223d
  - `--am-accent`: #b23a3a
  - `--am-accent-soft`: #f6e9e9
  - `--am-sub`: #6b7689
  - `--am-ring`: #e7e9ef
  - `--am-surface`: #ffffff
  - `--am-field`: #f8f9fb
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `2dfe5666f1e2…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `2dfe5666f1e2da59…` · customHtml shell sha256 stays `3f657247c9897aac…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `americana-journey-premium`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
