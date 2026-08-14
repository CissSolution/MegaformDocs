---
{
  "templateGuideSlug": "tpl-job-application-northwind",
  "slug": "job-application-northwind",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-jba.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [],
  "cardFields": [],
  "contentTokens": [
    "job_application",
    "step_1_of_1",
    "personal_info",
    "position_details",
    "text_3",
    "cover_letter",
    "apply_for_position",
    "complete_this_form_to_submit_your_job_application",
    "contact_information",
    "full_name",
    "phone",
    "email",
    "position",
    "years_of_experience",
    "expected_salary_annual",
    "available_start_date",
    "text_0_2000_characters",
    "save_as_draft",
    "submit_application"
  ],
  "colorVars": {
    "--jba-primary": "#4F39F6",
    "--jba-accent": "#4F39F6",
    "--jba-deco": "#4F39F6",
    "--jba-page": "#F8FAFC",
    "--jba-fill": "#F8FAFC"
  },
  "lockedKeys": [
    "full_name",
    "phone",
    "email",
    "position",
    "experience",
    "salary",
    "start_date",
    "cover_letter"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "&#10003;"
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
  "customCssSha256": "96ed2ce6fca28593ffd4dd3927c6231c8d3dc82e63d1a021ff342f05345b4321",
  "shellSha256": "574c206632deaabadf9a056a307af0a0a5adb4b9cfc2beeec68a49accf11deb0"
}
---
# AI Edit Guide — Apply for Position

Theme `custom` · root `.mfp.mfp-jba.mfp-native-generated` · 8 fields · 1 steps (single).

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
| full_name | Text | input | - |  |
| phone | Text | input | - |  |
| email | Email | input | - |  |
| position | Select | choice | - | 4 |
| experience | Select | choice | - | 4 |
| salary | Text | input | - |  |
| start_date | Date | input | - |  |
| cover_letter | Textarea | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `job_application`: "Job Application"
- `step_1_of_1`: "Step 1 of 1"
- `personal_info`: "Personal Info"
- `position_details`: "Position Details"
- `text_3`: "3"
- `cover_letter`: "Cover Letter"
- `apply_for_position`: "Apply for Position"
- `complete_this_form_to_submit_your_job_application`: "Complete this form to submit your job application"
- `contact_information`: "Contact Information"
- `full_name`: "Full Name"
- `phone`: "Phone"
- `email`: "Email"
- `position`: "Position"
- `years_of_experience`: "Years of Experience"
- `expected_salary_annual`: "Expected Salary (annual)"
- `available_start_date`: "Available Start Date"
- `text_0_2000_characters`: "0 / 2000 characters"
- `save_as_draft`: "Save as Draft"
- `submit_application`: "Submit Application"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "&#10003;"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: none): `{op:"set_field_property", key:"<chipFieldKey>", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--jba-primary`: #4F39F6
  - `--jba-accent`: #4F39F6
  - `--jba-deco`: #4F39F6
  - `--jba-page`: #F8FAFC
  - `--jba-fill`: #F8FAFC
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `96ed2ce6fca2…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `cover_count`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `96ed2ce6fca28593…` · customHtml shell sha256 stays `574c206632deaaba…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
