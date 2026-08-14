---
{
  "templateGuideSlug": "tpl-golden-pro-agent-registration",
  "slug": "golden-pro-agent-registration",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-gpr.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "premium-native",
  "stepAnchor": "data-step",
  "stepCount": 3,
  "stepFieldKeys": [
    {
      "step": 0,
      "keys": [
        "step_1",
        "first_name",
        "last_name",
        "email",
        "phone",
        "address",
        "city",
        "country",
        "member_type"
      ]
    },
    {
      "step": 1,
      "keys": [
        "step_2",
        "agency",
        "license_no",
        "experience",
        "start_date",
        "referral"
      ]
    },
    {
      "step": 2,
      "keys": [
        "step_3",
        "newsletter",
        "terms"
      ]
    }
  ],
  "chipFields": [
    "member_type"
  ],
  "cardFields": [],
  "contentTokens": [
    "golden_pro",
    "real_estate",
    "registration_form",
    "agent_photo",
    "agent",
    "your_area_managing_director",
    "premium_real_estate_partner",
    "text_1_888_555_0100",
    "agent_goldenpro_com",
    "www_goldenpro_com",
    "text_123_luxury_ave_beverly_hills_ca_90210",
    "text_01",
    "personal",
    "basic_info",
    "text_02",
    "agency",
    "work_details",
    "text_03",
    "confirm",
    "review_and_sign",
    "personal_information",
    "first_name",
    "last_name",
    "email_address",
    "phone_number",
    "street_address",
    "city",
    "country",
    "membership_type",
    "continue",
    "agency_and_licence",
    "agency_brokerage",
    "licence_number",
    "years_of_experience",
    "preferred_start_date",
    "how_did_you_hear_about_us",
    "back",
    "review_and_confirm",
    "name",
    "email",
    "phone",
    "membership",
    "licence",
    "experience",
    "submit_registration"
  ],
  "colorVars": {
    "--gpr-primary": "#4A5E3A",
    "--gpr-accent": "#C9A84C",
    "--gpr-deco": "#C9A84C",
    "--gpr-page": "#F9F6EE",
    "--gpr-fill": "#F9F6EE"
  },
  "lockedKeys": [
    "step_1",
    "first_name",
    "last_name",
    "email",
    "phone",
    "address",
    "city",
    "country",
    "member_type",
    "step_2",
    "agency",
    "license_no",
    "experience",
    "start_date",
    "referral",
    "step_3",
    "newsletter",
    "terms"
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
  "customCssSha256": "887eb41fad07eb9da8538fa55494227c57b229cd7693362b59b7f6e9f030eca9",
  "shellSha256": "8d5cba882d07344908a34c0c746fa080f3cf7e6ec89e8eeb0f621ab19752403e"
}
---
# AI Edit Guide — Golden Pro — Real Estate Agent Registration

Theme `custom` · root `.mfp.mfp-gpr.mfp-native-generated` · 18 fields · 3 steps (premium-native).

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
| step_1 | Section | input | 0 |  |
| first_name | Text | input | 0 |  |
| last_name | Text | input | 0 |  |
| email | Email | input | 0 |  |
| phone | Text | input | 0 |  |
| address | Text | input | 0 |  |
| city | Text | input | 0 |  |
| country | Select | choice | 0 | 9 |
| member_type | Radio | chips | 0 | 4 |
| step_2 | Section | input | 1 |  |
| agency | Text | input | 1 |  |
| license_no | Text | input | 1 |  |
| experience | Select | choice | 1 | 5 |
| start_date | Date | input | 1 |  |
| referral | Text | input | 1 |  |
| step_3 | Section | input | 2 |  |
| newsletter | Checkbox | choice | 2 | 1 |
| terms | Checkbox | choice | 2 | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `golden_pro`: "GOLDEN PRO"
- `real_estate`: "REAL ESTATE"
- `registration_form`: "REGISTRATION FORM"
- `agent`: "AGENT"
- `your_area_managing_director`: "Your Area Managing Director"
- `premium_real_estate_partner`: "Premium Real Estate Partner"
- `text_1_888_555_0100`: "+1 (888) 555-0100"
- `agent_goldenpro_com`: "agent@goldenpro.com"
- `www_goldenpro_com`: "www.goldenpro.com"
- `text_123_luxury_ave_beverly_hills_ca_90210`: "123 Luxury Ave, Beverly Hills, CA 90210"
- `text_01`: "01"
- `personal`: "Personal"
- `basic_info`: "Basic info"
- `text_02`: "02"
- `agency`: "Agency"
- `work_details`: "Work details"
- `text_03`: "03"
- `confirm`: "Confirm"
- `review_and_sign`: "Review & sign"
- `personal_information`: "Personal Information"
- `first_name`: "First Name *"
- `last_name`: "Last Name *"
- `email_address`: "Email Address *"
- `phone_number`: "Phone Number"
- `street_address`: "Street Address"
- `city`: "City"
- `country`: "Country"
- `membership_type`: "Membership Type *"
- `continue`: "Continue"
- `agency_and_licence`: "Agency & Licence"
- `agency_brokerage`: "Agency / Brokerage *"
- `licence_number`: "Licence Number *"
- `years_of_experience`: "Years of Experience *"
- `preferred_start_date`: "Preferred Start Date"
- `how_did_you_hear_about_us`: "How did you hear about us?"
- `back`: "Back"
- `review_and_confirm`: "Review & Confirm"
- `name`: "Name"
- `email`: "Email"
- `phone`: "Phone"
- `membership`: "Membership"
- `licence`: "Licence"
- `experience`: "Experience"
- `submit_registration`: "Submit Registration"
- `agent_photo`: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: member_type): `{op:"set_field_property", key:"member_type", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:2, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--gpr-primary`: #4A5E3A
  - `--gpr-accent`: #C9A84C
  - `--gpr-deco`: #C9A84C
  - `--gpr-page`: #F9F6EE
  - `--gpr-fill`: #F9F6EE
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `887eb41fad07…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `887eb41fad07eb9d…` · customHtml shell sha256 stays `8d5cba882d073449…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
