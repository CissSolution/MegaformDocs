---
{
  "templateGuideSlug": "tpl-document-registration-a4",
  "slug": "document-registration-a4",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-drc.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [],
  "cardFields": [],
  "contentTokens": [
    "euroyouth",
    "exchange_programme_2026",
    "date",
    "photo",
    "registration_form",
    "personal_information",
    "first_name",
    "last_name",
    "gender",
    "date_of_birth",
    "place_of_birth",
    "fathers_name",
    "mothers_name",
    "nationality",
    "religion",
    "residence_status",
    "marital_status",
    "national_id_no",
    "passport_no",
    "tin",
    "driving_license_no",
    "contact_information",
    "address",
    "city",
    "state_province",
    "zip_code",
    "country",
    "phone",
    "email",
    "membership_type",
    "programme_details",
    "programme",
    "duration_months",
    "start_month",
    "accommodation",
    "language_level",
    "scholarship_required",
    "declaration",
    "terms_and_conditions",
    "by_signing_this_registration_form_i_confirm_that_all",
    "signature",
    "applicant_signature",
    "back_to_forms",
    "submit_registration",
    "euroyouth_exchange_programme_registered_ngo_euroyout"
  ],
  "colorVars": {
    "--drc-primary": "#111111",
    "--drc-accent": "#111111",
    "--drc-deco": "#111111",
    "--drc-page": "#f0f0f0",
    "--drc-fill": "#f0f0f0"
  },
  "lockedKeys": [
    "application_date",
    "passport_photo",
    "first_name",
    "last_name",
    "gender",
    "date_of_birth",
    "place_of_birth",
    "father_name",
    "mother_name",
    "nationality",
    "religion",
    "residence_status",
    "marital_status",
    "national_id",
    "passport_no",
    "tin",
    "driving_license",
    "address",
    "city",
    "state",
    "zip",
    "country",
    "phone",
    "email",
    "membership_type",
    "programme",
    "duration",
    "start_month",
    "accommodation",
    "language_level",
    "scholarship",
    "terms",
    "newsletter",
    "signature"
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
  "customCssSha256": "fe0f3372ec70c20666d7a3325e9bec8a100c566703f533b30b3582ea84dfacb4",
  "shellSha256": "5fa94fe5a049ca84362307ad712e00aae244cf8a06ecde625b7f4ecf901b2320"
}
---
# AI Edit Guide — EuroYouth Document Registration

Theme `custom` · root `.mfp.mfp-drc.mfp-native-generated` · 34 fields · 1 steps (single).

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
| application_date | Date | input | - |  |
| passport_photo | File | input | - |  |
| first_name | Text | input | - |  |
| last_name | Text | input | - |  |
| gender | Radio | choice | - | 3 |
| date_of_birth | Date | input | - |  |
| place_of_birth | Text | input | - |  |
| father_name | Text | input | - |  |
| mother_name | Text | input | - |  |
| nationality | Select | choice | - | 13 |
| religion | Text | input | - |  |
| residence_status | Radio | choice | - | 2 |
| marital_status | Radio | choice | - | 2 |
| national_id | Text | input | - |  |
| passport_no | Text | input | - |  |
| tin | Text | input | - |  |
| driving_license | Text | input | - |  |
| address | Text | input | - |  |
| city | Text | input | - |  |
| state | Text | input | - |  |
| zip | Text | input | - |  |
| country | Select | choice | - | 13 |
| phone | Phone | input | - |  |
| email | Email | input | - |  |
| membership_type | Radio | choice | - | 3 |
| programme | Select | choice | - | 3 |
| duration | Select | choice | - | 5 |
| start_month | Select | choice | - | 12 |
| accommodation | Select | choice | - | 4 |
| language_level | Select | choice | - | 6 |
| scholarship | Radio | choice | - | 2 |
| terms | Checkbox | choice | - | 1 |
| newsletter | Checkbox | choice | - | 1 |
| signature | Signature | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `euroyouth`: "EuroYouth"
- `exchange_programme_2026`: "exchange programme 2026"
- `date`: "Date"
- `photo`: "Photo"
- `registration_form`: "Registration Form"
- `personal_information`: "Personal Information"
- `first_name`: "First Name"
- `last_name`: "Last Name"
- `gender`: "Gender"
- `date_of_birth`: "Date of Birth"
- `place_of_birth`: "Place of Birth"
- `fathers_name`: "Father's Name"
- `mothers_name`: "Mother's Name"
- `nationality`: "Nationality"
- `religion`: "Religion"
- `residence_status`: "Residence Status"
- `marital_status`: "Marital Status"
- `national_id_no`: "National ID No."
- `passport_no`: "Passport No."
- `tin`: "TIN"
- `driving_license_no`: "Driving License No."
- `contact_information`: "Contact Information"
- `address`: "Address"
- `city`: "City"
- `state_province`: "State / Province"
- `zip_code`: "Zip Code"
- `country`: "Country"
- `phone`: "Phone"
- `email`: "Email"
- `membership_type`: "Membership Type"
- `programme_details`: "Programme Details"
- `programme`: "Programme"
- `duration_months`: "Duration (months)"
- `start_month`: "Start Month"
- `accommodation`: "Accommodation"
- `language_level`: "Language Level"
- `scholarship_required`: "Scholarship Required"
- `declaration`: "Declaration"
- `terms_and_conditions`: "Terms & Conditions"
- `by_signing_this_registration_form_i_confirm_that_all`: "By signing this registration form, I confirm that all the   "
- `signature`: "Signature"
- `applicant_signature`: "Applicant Signature"
- `back_to_forms`: "Back to forms"
- `submit_registration`: "Submit Registration"
- `euroyouth_exchange_programme_registered_ngo_euroyout`: "EuroYouth Exchange Programme — Registered NGO — euroyouth.eu"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: none): `{op:"set_field_property", key:"<chipFieldKey>", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--drc-primary`: #111111
  - `--drc-accent`: #111111
  - `--drc-deco`: #111111
  - `--drc-page`: #f0f0f0
  - `--drc-fill`: #f0f0f0
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `fe0f3372ec70…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `drc_runtime`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `fe0f3372ec70c206…` · customHtml shell sha256 stays `5fa94fe5a049ca84…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
