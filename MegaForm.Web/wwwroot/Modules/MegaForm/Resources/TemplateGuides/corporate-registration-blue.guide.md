---
{
  "templateGuideSlug": "tpl-corporate-registration-blue",
  "slug": "corporate-registration-blue",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-crg.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "gender"
  ],
  "cardFields": [],
  "contentTokens": [
    "member_photo",
    "membership_type",
    "registration_form",
    "your_company",
    "tagline_goes_here",
    "date",
    "personal_information",
    "full_name",
    "date_of_birth",
    "gender",
    "contact_and_address",
    "address",
    "phone",
    "membership_type_2",
    "service_information",
    "service_required",
    "please_review_the_answers_above_before_submitting_by",
    "submit_registration"
  ],
  "colorVars": {
    "--crg-primary": "#1B4F8C",
    "--crg-accent": "#0F3564",
    "--crg-deco": "#EAF1FA",
    "--crg-page": "#F4F6F9",
    "--crg-fill": "#F4F6F9"
  },
  "lockedKeys": [
    "reg_date",
    "full_name",
    "dob",
    "gender",
    "address",
    "phone",
    "membership_type",
    "service"
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
  "customCssSha256": "327f56675b1eb3ebcfbebf1c0a83450012956f2ca0f644fd5ae39ab965036bae",
  "shellSha256": "03b98092785925c6bb65dac0f79334cefde67c3d3851aca6fd9c40622feb2c8d"
}
---
# AI Edit Guide — Registration Form — Corporate Blue

Theme `custom` · root `.mfp.mfp-crg.mfp-native-generated` · 8 fields · 1 steps (single).

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
| reg_date | Date | input | - |  |
| full_name | Text | input | - |  |
| dob | Date | input | - |  |
| gender | Radio | chips | - | 3 |
| address | Text | input | - |  |
| phone | Text | input | - |  |
| membership_type | Select | choice | - | 4 |
| service | Select | choice | - | 4 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `membership_type`: "Membership Type"
- `registration_form`: "Registration Form"
- `your_company`: "YOUR COMPANY"
- `tagline_goes_here`: "TAGLINE GOES HERE"
- `date`: "Date"
- `personal_information`: "Personal Information"
- `full_name`: "Full Name *"
- `date_of_birth`: "Date of Birth *"
- `gender`: "Gender *"
- `contact_and_address`: "Contact & Address"
- `address`: "Address"
- `phone`: "Phone"
- `membership_type_2`: "Membership Type *"
- `service_information`: "Service Information"
- `service_required`: "Service Required"
- `please_review_the_answers_above_before_submitting_by`: "Please review the answers above before submitting. By clicki"
- `submit_registration`: "Submit Registration"
- `member_photo`: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: gender): `{op:"set_field_property", key:"gender", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--crg-primary`: #1B4F8C
  - `--crg-accent`: #0F3564
  - `--crg-deco`: #EAF1FA
  - `--crg-page`: #F4F6F9
  - `--crg-fill`: #F4F6F9
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `327f56675b1e…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `the wizard script`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `327f56675b1eb3eb…` · customHtml shell sha256 stays `03b98092785925c6…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
