---
{
  "templateGuideSlug": "tpl-wellness-patient-intake",
  "slug": "wellness-patient-intake",
  "theme": "system",
  "rootSelector": ".mfp.mfp-wellness-patient-intake.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "premium-native",
  "stepAnchor": "data-step",
  "stepCount": 4,
  "stepFieldKeys": [
    {
      "step": 0,
      "keys": [
        "full_name",
        "date_of_birth",
        "biological_sex",
        "email_address",
        "phone_number"
      ]
    },
    {
      "step": 1,
      "keys": [
        "primary_concern",
        "symptom_duration",
        "existing_conditions",
        "current_medications",
        "known_allergies"
      ]
    },
    {
      "step": 2,
      "keys": [
        "activity_level",
        "sleep_hours",
        "dietary_preference",
        "smoking_status",
        "stress_level"
      ]
    },
    {
      "step": 3,
      "keys": [
        "preferred_date",
        "preferred_time",
        "practitioner_preference",
        "visit_notes",
        "consent_treatment",
        "consent_privacy",
        "referral_source",
        "clinic_location_id"
      ]
    }
  ],
  "chipFields": [],
  "cardFields": [],
  "contentTokens": [],
  "colorVars": {},
  "lockedKeys": [
    "step_personal",
    "full_name",
    "date_of_birth",
    "email_address",
    "phone_number",
    "biological_sex",
    "step_health",
    "primary_concern",
    "symptom_duration",
    "existing_conditions",
    "current_medications",
    "known_allergies",
    "step_lifestyle",
    "activity_level",
    "sleep_hours",
    "dietary_preference",
    "smoking_status",
    "stress_level",
    "step_appointment",
    "preferred_date",
    "preferred_time",
    "practitioner_preference",
    "visit_notes",
    "consent_treatment",
    "consent_privacy",
    "referral_source",
    "clinic_location_id"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "Verdant Health",
    "Patient Intake",
    "A few gentle questions so we can care for you better. Takes about 3 minutes.",
    "About You",
    "Health",
    "Lifestyle",
    "Booking",
    "Step 1 of 4",
    "Let’s start with the basics",
    "Tell us a little about yourself so we can prepare for your visit.",
    "Step 2 of 4",
    "Your health background",
    "This helps your practitioner understand your history. All information stays confidential.",
    "Step 3 of 4",
    "A little about your lifestyle",
    "Daily habits give us helpful context for your personalised plan.",
    "Step 4 of 4",
    "Book &amp; confirm",
    "Choose a time that works for you and review the consent details before submitting.",
    "Back",
    "Continue",
    "Submit intake"
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
  "customCssSha256": "2051703c23d41c60b8d5254f35445cf7636a264534a538e72e27c086f4308f9d",
  "shellSha256": "a37a7fbf082b013e1a560cecc6963d01dc00844358f949f6aea78a7ad768dbb4"
}
---
# AI Edit Guide — Wellness & Patient Intake

Theme `system` · root `.mfp.mfp-wellness-patient-intake.mfp-native-generated` · 27 fields · 4 steps (premium-native).

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
| step_personal | Section | input | - |  |
| full_name | Text | input | 0 |  |
| date_of_birth | Date | input | 0 |  |
| email_address | Email | input | 0 |  |
| phone_number | Phone | input | 0 |  |
| biological_sex | Select | choice | 0 | 4 |
| step_health | Section | input | - |  |
| primary_concern | Select | choice | 1 | 6 |
| symptom_duration | Select | choice | 1 | 4 |
| existing_conditions | MultiSelect | choice | 1 | 6 |
| current_medications | Textarea | input | 1 |  |
| known_allergies | Textarea | input | 1 |  |
| step_lifestyle | Section | input | - |  |
| activity_level | Radio | choice | 2 | 4 |
| sleep_hours | Number | input | 2 |  |
| dietary_preference | Select | choice | 2 | 5 |
| smoking_status | Radio | choice | 2 | 3 |
| stress_level | Rating | input | 2 |  |
| step_appointment | Section | input | - |  |
| preferred_date | Date | input | 3 |  |
| preferred_time | Select | choice | 3 | 3 |
| practitioner_preference | Select | choice | 3 | 4 |
| visit_notes | Textarea | input | 3 |  |
| consent_treatment | Checkbox | choice | 3 | 1 |
| consent_privacy | Checkbox | choice | 3 | 1 |
| referral_source | Hidden | input | 3 |  |
| clinic_location_id | Hidden | input | 3 |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
_(none — this template has no {{content:*}} tokens)_

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "Verdant Health"
- "Patient Intake"
- "A few gentle questions so we can care for you better. Takes about 3 minutes."
- "About You"
- "Health"
- "Lifestyle"
- "Booking"
- "Step 1 of 4"
- "Let’s start with the basics"
- "Tell us a little about yourself so we can prepare for your visit."
- "Step 2 of 4"
- "Your health background"
- "This helps your practitioner understand your history. All information stays confidential."
- "Step 3 of 4"
- "A little about your lifestyle"
- "Daily habits give us helpful context for your personalised plan."
- "Step 4 of 4"
- "Book &amp; confirm"
- "Choose a time that works for you and review the consent details before submitting."
- "Back"
- "Continue"
- "Submit intake"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: none): `{op:"set_field_property", key:"<chipFieldKey>", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:3, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - _(none detected — fall back to --primary/--accent)_
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `2051703c23d4…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `2051703c23d41c60…` · customHtml shell sha256 stays `a37a7fbf082b013e…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `system`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
