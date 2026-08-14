---
{
  "templateGuideSlug": "tpl-event-registration-rsvp",
  "slug": "event-registration-rsvp",
  "theme": "system",
  "rootSelector": ".mfp.mfp-event-registration-rsvp.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "premium-native",
  "stepAnchor": "data-step",
  "stepCount": 4,
  "stepFieldKeys": [
    {
      "step": 0,
      "keys": [
        "first_name",
        "last_name",
        "email_address",
        "phone_number",
        "job_title",
        "organisation"
      ]
    },
    {
      "step": 1,
      "keys": [
        "ticket_type",
        "additional_guests",
        "session_tracks"
      ]
    },
    {
      "step": 2,
      "keys": [
        "attendance_date",
        "meal_preference",
        "tshirt_size",
        "accessibility_needs"
      ]
    },
    {
      "step": 3,
      "keys": [
        "linkedin_url",
        "how_did_you_hear",
        "experience_rating",
        "consent_communications",
        "consent_photography",
        "utm_source",
        "utm_campaign"
      ]
    }
  ],
  "chipFields": [],
  "cardFields": [],
  "contentTokens": [],
  "colorVars": {
    "--mf-primary-light": "#fef3e0"
  },
  "lockedKeys": [
    "step_attendee",
    "first_name",
    "last_name",
    "email_address",
    "phone_number",
    "job_title",
    "organisation",
    "step_ticket",
    "ticket_type",
    "additional_guests",
    "session_tracks",
    "step_logistics",
    "attendance_date",
    "meal_preference",
    "accessibility_needs",
    "tshirt_size",
    "step_confirm",
    "linkedin_url",
    "how_did_you_hear",
    "experience_rating",
    "consent_communications",
    "consent_photography",
    "utm_source",
    "utm_campaign"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "Event Registration",
    "Join the Event",
    "Secure your spot in four quick steps. All ticket types include the evening reception.",
    "Attendee",
    "Your details",
    "Ticket",
    "Choose your pass",
    "Logistics",
    "Meals &amp; access",
    "Confirm",
    "Review &amp; submit",
    "Questions?",
    "Contact us",
    "Step 1 of 4",
    "Who’s attending?",
    "Continue",
    "&rarr;",
    "Step 2 of 4",
    "Choose your ticket",
    "&larr;",
    "Back",
    "Step 3 of 4",
    "Logistics &amp; accessibility",
    "Help us prepare the best possible experience for you on the day.",
    "Step 4 of 4",
    "Almost done — confirm your spot",
    "Review your details one last time and let us know about your social presence.",
    "Reserve My Spot"
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
  "customCssSha256": "6fbfc36edb41e06c59268bce2ade4a690781d3f18773a484b54dbda270c7c376",
  "shellSha256": "819d0be8b2a0838a53e707021d57128a8b0f43261b4ec220e98f6d448490959d"
}
---
# AI Edit Guide — Event Registration & RSVP

Theme `system` · root `.mfp.mfp-event-registration-rsvp.mfp-native-generated` · 24 fields · 4 steps (premium-native).

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
| step_attendee | Section | input | - |  |
| first_name | Text | input | 0 |  |
| last_name | Text | input | 0 |  |
| email_address | Email | input | 0 |  |
| phone_number | Phone | input | 0 |  |
| job_title | Text | input | 0 |  |
| organisation | Text | input | 0 |  |
| step_ticket | Section | input | - |  |
| ticket_type | Radio | choice | 1 | 5 |
| additional_guests | Number | input | 1 |  |
| session_tracks | Chips | input | 1 | 5 |
| step_logistics | Section | input | - |  |
| attendance_date | Date | input | 2 |  |
| meal_preference | Select | choice | 2 | 6 |
| accessibility_needs | Textarea | input | 2 |  |
| tshirt_size | Select | choice | 2 | 6 |
| step_confirm | Section | input | - |  |
| linkedin_url | Text | input | 3 |  |
| how_did_you_hear | Select | choice | 3 | 6 |
| experience_rating | Rating | input | 3 |  |
| consent_communications | Checkbox | choice | 3 | 1 |
| consent_photography | Checkbox | choice | 3 | 1 |
| utm_source | Hidden | input | 3 |  |
| utm_campaign | Hidden | input | 3 |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
_(none — this template has no {{content:*}} tokens)_

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "Event Registration"
- "Join the Event"
- "Secure your spot in four quick steps. All ticket types include the evening reception."
- "Attendee"
- "Your details"
- "Ticket"
- "Choose your pass"
- "Logistics"
- "Meals &amp; access"
- "Confirm"
- "Review &amp; submit"
- "Questions?"
- "Contact us"
- "Step 1 of 4"
- "Who’s attending?"
- "Continue"
- "&rarr;"
- "Step 2 of 4"
- "Choose your ticket"
- "&larr;"
- "Back"
- "Step 3 of 4"
- "Logistics &amp; accessibility"
- "Help us prepare the best possible experience for you on the day."
- "Step 4 of 4"
- "Almost done — confirm your spot"
- "Review your details one last time and let us know about your social presence."
- "Reserve My Spot"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: none): `{op:"set_field_property", key:"<chipFieldKey>", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:3, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--mf-primary-light`: #fef3e0
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `6fbfc36edb41…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `6fbfc36edb41e06c…` · customHtml shell sha256 stays `819d0be8b2a0838a…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `system`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
