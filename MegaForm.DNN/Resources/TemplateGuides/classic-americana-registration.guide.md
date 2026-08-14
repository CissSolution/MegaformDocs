---
{
  "templateGuideSlug": "tpl-classic-americana-registration",
  "slug": "classic-americana-registration",
  "theme": "system",
  "rootSelector": ".mfp.mfp-classic-americana-registration.mfp-native-generated",
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
        "city_state"
      ]
    },
    {
      "step": 1,
      "keys": [
        "vehicle_year",
        "vehicle_make",
        "vehicle_model",
        "vehicle_class",
        "paint_color",
        "modifications"
      ]
    },
    {
      "step": 2,
      "keys": [
        "entry_package",
        "tshirt_size",
        "arrival_date",
        "addons"
      ]
    },
    {
      "step": 3,
      "keys": [
        "club_affiliation",
        "how_heard",
        "excitement",
        "consent_rules",
        "consent_photo",
        "utm_source",
        "utm_campaign"
      ]
    }
  ],
  "chipFields": [],
  "cardFields": [],
  "contentTokens": [],
  "colorVars": {},
  "lockedKeys": [
    "step_owner",
    "full_name",
    "email_address",
    "phone_number",
    "city_state",
    "step_ride",
    "vehicle_year",
    "vehicle_make",
    "vehicle_model",
    "vehicle_class",
    "paint_color",
    "modifications",
    "step_show",
    "entry_package",
    "tshirt_size",
    "addons",
    "arrival_date",
    "step_confirm",
    "club_affiliation",
    "how_heard",
    "excitement",
    "consent_rules",
    "consent_photo",
    "utm_source",
    "utm_campaign"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "Est. 1957 &middot; Route 66",
    "Classic Car Show",
    "Registration &amp; Entry Pass",
    "Owner",
    "The Ride",
    "Options",
    "Confirm",
    "Step 1 of 4",
    "Register your ride",
    "Start with your details so we can print your entry pass and dashboard placard.",
    "Step 2 of 4",
    "Tell us about the machine",
    "The good stuff. Judges use these details to place your vehicle in the right class.",
    "Step 3 of 4",
    "Pick your package",
    "Choose an entry package and any extras. All entries include a commemorative dash plaque.",
    "Step 4 of 4",
    "Last stop before the open road",
    "A few final details, then hit the gas and submit your registration.",
    "Back",
    "Next",
    "Submit Entry"
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
  "customCssSha256": "08794ad55201cdb637ca1281bdbd5e16d8f76c9a0efd33f7421793435fdfa049",
  "shellSha256": "44f7b71917e268a136f8aa078c49535d1049d59c669edfa1a2f6c77c14bfbac1"
}
---
# AI Edit Guide — Classic Car Show Registration

Theme `system` · root `.mfp.mfp-classic-americana-registration.mfp-native-generated` · 25 fields · 4 steps (premium-native).

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
| step_owner | Section | input | - |  |
| full_name | Text | input | 0 |  |
| email_address | Email | input | 0 |  |
| phone_number | Phone | input | 0 |  |
| city_state | Text | input | 0 |  |
| step_ride | Section | input | - |  |
| vehicle_year | Number | input | 1 |  |
| vehicle_make | Text | input | 1 |  |
| vehicle_model | Text | input | 1 |  |
| vehicle_class | Select | choice | 1 | 6 |
| paint_color | Text | input | 1 |  |
| modifications | Textarea | input | 1 |  |
| step_show | Section | input | - |  |
| entry_package | Radio | choice | 2 | 3 |
| tshirt_size | Select | choice | 2 | 5 |
| addons | MultiSelect | choice | 2 | 4 |
| arrival_date | Date | input | 2 |  |
| step_confirm | Section | input | - |  |
| club_affiliation | Text | input | 3 |  |
| how_heard | Select | choice | 3 | 5 |
| excitement | Rating | input | 3 |  |
| consent_rules | Checkbox | choice | 3 | 1 |
| consent_photo | Checkbox | choice | 3 | 1 |
| utm_source | Hidden | input | 3 |  |
| utm_campaign | Hidden | input | 3 |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
_(none — this template has no {{content:*}} tokens)_

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "Est. 1957 &middot; Route 66"
- "Classic Car Show"
- "Registration &amp; Entry Pass"
- "Owner"
- "The Ride"
- "Options"
- "Confirm"
- "Step 1 of 4"
- "Register your ride"
- "Start with your details so we can print your entry pass and dashboard placard."
- "Step 2 of 4"
- "Tell us about the machine"
- "The good stuff. Judges use these details to place your vehicle in the right class."
- "Step 3 of 4"
- "Pick your package"
- "Choose an entry package and any extras. All entries include a commemorative dash plaque."
- "Step 4 of 4"
- "Last stop before the open road"
- "A few final details, then hit the gas and submit your registration."
- "Back"
- "Next"
- "Submit Entry"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: none): `{op:"set_field_property", key:"<chipFieldKey>", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:3, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - _(none detected — fall back to --primary/--accent)_
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `08794ad55201…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `08794ad55201cdb6…` · customHtml shell sha256 stays `44f7b71917e268a1…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `system`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
