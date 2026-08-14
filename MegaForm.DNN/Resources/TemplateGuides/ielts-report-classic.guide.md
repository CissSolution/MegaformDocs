---
{
  "templateGuideSlug": "tpl-ielts-report-classic",
  "slug": "ielts-report-classic",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-iel.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [],
  "cardFields": [],
  "contentTokens": [
    "ielts",
    "test_report_form",
    "academic",
    "note",
    "admission_to_undergraduate_and_postgraduate_courses",
    "centre_number",
    "uk047",
    "date",
    "candidate_number",
    "candidate_details",
    "family_name",
    "first_name_s",
    "candidate_id",
    "date_of_birth",
    "country_of_nationality",
    "first_language",
    "test_results",
    "text_9_0",
    "listening",
    "text_8_5",
    "reading",
    "text_7_0",
    "writing",
    "speaking",
    "overall_band",
    "administrator_comments",
    "reserved_for_administrator_use_only",
    "validation",
    "stamp",
    "submit_report"
  ],
  "colorVars": {
    "--iel-primary": "#111318",
    "--iel-accent": "#B3242A",
    "--iel-deco": "#F4F5F7",
    "--iel-page": "#EEF0F3",
    "--iel-fill": "#EEF0F3"
  },
  "lockedKeys": [
    "family_name",
    "first_name",
    "candidate_id",
    "dob",
    "country",
    "first_language",
    "overall_band"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "&mdash;"
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
  "customCssSha256": "68d53837940d4e96a22fc8826e5c37581f1847166a959725a1c6445ddf95b604",
  "shellSha256": "d9d59afef5d8d3c9ef2ce36284da678e7f00093979555d507d42ac39ba525982"
}
---
# AI Edit Guide — IELTS Test Report Form

Theme `custom` · root `.mfp.mfp-iel.mfp-native-generated` · 7 fields · 1 steps (single).

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
| family_name | Text | input | - |  |
| first_name | Text | input | - |  |
| candidate_id | Text | input | - |  |
| dob | Date | input | - |  |
| country | Select | choice | - | 8 |
| first_language | Text | input | - |  |
| overall_band | Select | choice | - | 11 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `ielts`: "IELTS"
- `test_report_form`: "Test Report Form"
- `academic`: "Academic"
- `note`: "NOTE"
- `admission_to_undergraduate_and_postgraduate_courses`: "Admission to undergraduate and postgraduate courses should b"
- `centre_number`: "Centre Number"
- `uk047`: "UK047"
- `date`: "Date"
- `candidate_number`: "Candidate Number"
- `candidate_details`: "Candidate Details"
- `family_name`: "Family Name *"
- `first_name_s`: "First Name(s) *"
- `candidate_id`: "Candidate ID *"
- `date_of_birth`: "Date of Birth *"
- `country_of_nationality`: "Country of Nationality"
- `first_language`: "First Language"
- `test_results`: "Test Results"
- `text_9_0`: "9.0"
- `listening`: "Listening"
- `text_8_5`: "8.5"
- `reading`: "Reading"
- `text_7_0`: "7.0"
- `writing`: "Writing"
- `speaking`: "Speaking"
- `overall_band`: "Overall Band *"
- `administrator_comments`: "Administrator Comments"
- `reserved_for_administrator_use_only`: "Reserved for administrator use only"
- `validation`: "Validation"
- `stamp`: "Stamp"
- `submit_report`: "Submit Report"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "&mdash;"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: none): `{op:"set_field_property", key:"<chipFieldKey>", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--iel-primary`: #111318
  - `--iel-accent`: #B3242A
  - `--iel-deco`: #F4F5F7
  - `--iel-page`: #EEF0F3
  - `--iel-fill`: #EEF0F3
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `68d53837940d…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `iel_meta`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `68d53837940d4e96…` · customHtml shell sha256 stays `d9d59afef5d8d3c9…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
