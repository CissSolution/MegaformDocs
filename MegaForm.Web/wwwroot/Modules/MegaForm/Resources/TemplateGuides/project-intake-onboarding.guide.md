---
{
  "templateGuideSlug": "tpl-project-intake-onboarding",
  "slug": "project-intake-onboarding",
  "theme": "system",
  "rootSelector": ".mfp.mfp-project-intake-onboarding.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "premium-native",
  "stepAnchor": "data-step",
  "stepCount": 4,
  "stepFieldKeys": [
    {
      "step": 0,
      "keys": [
        "full_name",
        "email_address",
        "phone_number",
        "company_name"
      ]
    },
    {
      "step": 1,
      "keys": [
        "project_name",
        "project_type",
        "project_goals",
        "project_description"
      ]
    },
    {
      "step": 2,
      "keys": [
        "project_budget",
        "project_timeline",
        "start_date",
        "team_size",
        "has_existing_assets"
      ]
    },
    {
      "step": 3,
      "keys": [
        "reference_files",
        "project_urgency",
        "additional_notes",
        "consent_contact"
      ]
    }
  ],
  "chipFields": [
    "project_goals"
  ],
  "cardFields": [],
  "contentTokens": [],
  "colorVars": {},
  "lockedKeys": [
    "step_contact",
    "full_name",
    "email_address",
    "phone_number",
    "company_name",
    "step_project",
    "project_name",
    "project_type",
    "project_goals",
    "project_description",
    "step_scope",
    "project_budget",
    "project_timeline",
    "start_date",
    "team_size",
    "has_existing_assets",
    "step_final",
    "reference_files",
    "project_urgency",
    "additional_notes",
    "consent_contact",
    "referral_source"
  ],
  "missingFieldPlaceholders": [
    "referral_source"
  ],
  "shellTexts": [
    "New Enquiry",
    "Project Intake &amp; Onboarding",
    "Complete the four steps below and our team will be in touch within one business day.",
    "Contact",
    "Step 1 of 4",
    "Project",
    "Step 2 of 4",
    "Scope",
    "Step 3 of 4",
    "Final",
    "Step 4 of 4",
    "Let’s get to know you",
    "Tell us who you are so we can personalise your experience.",
    "Tell us about your project",
    "Share the high-level details so we can match you with the right team.",
    "Scope, timeline &amp; budget",
    "Help us understand the scale of your project so we can put together the best proposal.",
    "Almost there!",
    "Add any files, extra notes, and rate how urgent this project is.",
    "Back",
    "Continue",
    "Submit Enquiry"
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
  "customCssSha256": "9587f0de573e5fb21837c93815cb7aa2c7e882b24f2b86fd8a0a8ce40fa47aca",
  "shellSha256": "e6752734b5e7d5099d35decef21095d876f779888426ffb8bbc5021774569790"
}
---
# AI Edit Guide — Project Intake & Onboarding

Theme `system` · root `.mfp.mfp-project-intake-onboarding.mfp-native-generated` · 22 fields · 4 steps (premium-native).

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
| step_contact | Section | input | - |  |
| full_name | Text | input | 0 |  |
| email_address | Email | input | 0 |  |
| phone_number | Phone | input | 0 |  |
| company_name | Text | input | 0 |  |
| step_project | Section | input | - |  |
| project_name | Text | input | 1 |  |
| project_type | Select | choice | 1 | 6 |
| project_goals | Checkbox | chips | 1 | 6 |
| project_description | Textarea | input | 1 |  |
| step_scope | Section | input | - |  |
| project_budget | Radio | choice | 2 | 5 |
| project_timeline | Select | choice | 2 | 5 |
| start_date | Date | input | 2 |  |
| team_size | Number | input | 2 |  |
| has_existing_assets | Checkbox | choice | 2 | 1 |
| step_final | Section | input | - |  |
| reference_files | File | input | 3 |  |
| project_urgency | Rating | input | 3 |  |
| additional_notes | Textarea | input | 3 |  |
| consent_contact | Checkbox | choice | 3 | 1 |
| referral_source | Hidden | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
_(none — this template has no {{content:*}} tokens)_

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "New Enquiry"
- "Project Intake &amp; Onboarding"
- "Complete the four steps below and our team will be in touch within one business day."
- "Contact"
- "Step 1 of 4"
- "Project"
- "Step 2 of 4"
- "Scope"
- "Step 3 of 4"
- "Final"
- "Step 4 of 4"
- "Let’s get to know you"
- "Tell us who you are so we can personalise your experience."
- "Tell us about your project"
- "Share the high-level details so we can match you with the right team."
- "Scope, timeline &amp; budget"
- "Help us understand the scale of your project so we can put together the best proposal."
- "Almost there!"
- "Add any files, extra notes, and rate how urgent this project is."
- "Back"
- "Continue"
- "Submit Enquiry"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: project_goals): `{op:"set_field_property", key:"project_goals", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:3, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - _(none detected — fall back to --primary/--accent)_
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `9587f0de573e…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `9587f0de573e5fb2…` · customHtml shell sha256 stays `e6752734b5e7d509…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `system`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
