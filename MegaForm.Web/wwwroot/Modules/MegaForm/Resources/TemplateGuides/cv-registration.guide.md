---
{
  "templateGuideSlug": "tpl-cv-registration",
  "slug": "cv-registration",
  "theme": "system",
  "rootSelector": ".mfp.mfp-cv-registration.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "accommodation"
  ],
  "cardFields": [],
  "contentTokens": [],
  "colorVars": {
    "--cvx-ink": "#2b2b2b",
    "--cvx-primary": "#2b2b2b",
    "--cvx-page": "#f2f2f2",
    "--cvx-paper": "#ffffff",
    "--cvx-muted": "#777777",
    "--cvx-line": "#c8c8c8",
    "--cvx-input": "#fff",
    "--cvx-soft": "#e8e8e8",
    "--cvx-error": "#c0392b"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "job_title",
    "email",
    "phone",
    "address",
    "website",
    "skill_1",
    "skill_2",
    "skill_3",
    "skill_4",
    "skill_5",
    "birth_year",
    "nationality",
    "country",
    "programme",
    "duration",
    "start_month",
    "language_level",
    "interests",
    "accommodation",
    "scholarship",
    "motivation",
    "newsletter",
    "terms",
    "utm_source",
    "utm_campaign"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "Photo",
    "Contact",
    "Profile",
    "Programme",
    "Declaration",
    "&#9742;",
    "&#9733;",
    "Skills",
    "List your top skills",
    "&#9671;",
    "Interests",
    "&#9786;",
    "Personal Info",
    "&#9635;",
    "&#9998;",
    "Profile / Motivation",
    "&#10003;",
    "&#8592; Back",
    "Submit Application &#8594;"
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
  "customCssSha256": "649fd402d5ac5529e16f44b584daa441e16eb706d02c6e691b5548d34e42745f",
  "shellSha256": "47d657e9c90372594c66c5b4fc7d22d0ec9c70338e575c0815b5c9795ad7b26c"
}
---
# AI Edit Guide — EuroYouth CV Registration

Theme `system` · root `.mfp.mfp-cv-registration.mfp-native-generated` · 27 fields · 1 steps (single).

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
| job_title | Text | input | - |  |
| email | Email | input | - |  |
| phone | Phone | input | - |  |
| address | Text | input | - |  |
| website | Url | input | - |  |
| skill_1 | Text | input | - |  |
| skill_2 | Text | input | - |  |
| skill_3 | Text | input | - |  |
| skill_4 | Text | input | - |  |
| skill_5 | Text | input | - |  |
| birth_year | Number | input | - |  |
| nationality | Text | input | - |  |
| country | Select | choice | - | 13 |
| programme | Select | choice | - | 3 |
| duration | Select | choice | - | 6 |
| start_month | Select | choice | - | 12 |
| language_level | Select | choice | - | 3 |
| interests | Checkbox | choice | - | 8 |
| accommodation | Radio | chips | - | 4 |
| scholarship | Checkbox | choice | - | 1 |
| motivation | Textarea | input | - |  |
| newsletter | Checkbox | choice | - | 1 |
| terms | Checkbox | choice | - | 1 |
| utm_source | Hidden | input | - |  |
| utm_campaign | Hidden | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
_(none — this template has no {{content:*}} tokens)_

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "Photo"
- "Contact"
- "Profile"
- "Programme"
- "Declaration"
- "&#9742;"
- "&#9733;"
- "Skills"
- "List your top skills"
- "&#9671;"
- "Interests"
- "&#9786;"
- "Personal Info"
- "&#9635;"
- "&#9998;"
- "Profile / Motivation"
- "&#10003;"
- "&#8592; Back"
- "Submit Application &#8594;"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: accommodation): `{op:"set_field_property", key:"accommodation", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--cvx-ink`: #2b2b2b
  - `--cvx-primary`: #2b2b2b
  - `--cvx-page`: #f2f2f2
  - `--cvx-paper`: #ffffff
  - `--cvx-muted`: #777777
  - `--cvx-line`: #c8c8c8
  - `--cvx-input`: #fff
  - `--cvx-soft`: #e8e8e8
  - `--cvx-error`: #c0392b
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `649fd402d5ac…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `the wizard script`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `649fd402d5ac5529…` · customHtml shell sha256 stays `47d657e9c9037259…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `system`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
