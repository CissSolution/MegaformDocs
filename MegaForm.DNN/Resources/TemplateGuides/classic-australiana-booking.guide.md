---
{
  "templateGuideSlug": "tpl-classic-australiana-booking",
  "slug": "classic-australiana-booking",
  "theme": "system",
  "rootSelector": ".mfp.mfp-classic-australiana-booking.mfp-native-generated",
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
        "home_town"
      ]
    },
    {
      "step": 1,
      "keys": [
        "arrival_date",
        "nights",
        "party_size",
        "accommodation",
        "dietary"
      ]
    },
    {
      "step": 2,
      "keys": [
        "tour_package",
        "activities",
        "hat_size"
      ]
    },
    {
      "step": 3,
      "keys": [
        "transport",
        "how_heard",
        "excitement",
        "special_requests",
        "consent_terms",
        "consent_news",
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
    "step_guest",
    "full_name",
    "email_address",
    "phone_number",
    "home_town",
    "step_stay",
    "arrival_date",
    "nights",
    "party_size",
    "accommodation",
    "dietary",
    "step_experiences",
    "tour_package",
    "activities",
    "hat_size",
    "step_confirm",
    "transport",
    "how_heard",
    "excitement",
    "special_requests",
    "consent_terms",
    "consent_news",
    "utm_source",
    "utm_campaign"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "Est. 1962 &middot; Red Centre",
    "Outback Station Stay",
    "Booking &amp; Reservation",
    "Guest",
    "The Stay",
    "Do",
    "Confirm",
    "Step 1 of 4",
    "Book your outback escape",
    "Start with your details so we can prepare your welcome swag and station map.",
    "Step 2 of 4",
    "When are you heading bush?",
    "Pick your dates and the swag you&#x27;ll be bunking down in out on the station.",
    "Step 3 of 4",
    "Pick your adventures",
    "Add the experiences you fancy. All stays include a sunset campfire and damper night.",
    "Step 4 of 4",
    "One last yarn before you go",
    "A few final details, then send it through and we&#x27;ll get the billy on.",
    "Back",
    "Continue",
    "Send Booking"
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
  "customCssSha256": "76e38c8bb84ed8bbb6025540d668304b6cf42c55f1fca01480815967838270b4",
  "shellSha256": "3b1e8414cd735bc97ce4786b185d2654675b976f11290886037f49638ac3e22e"
}
---
# AI Edit Guide — Outback Station Stay Booking

Theme `system` · root `.mfp.mfp-classic-australiana-booking.mfp-native-generated` · 24 fields · 4 steps (premium-native).

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
| step_guest | Section | input | - |  |
| full_name | Text | input | 0 |  |
| email_address | Email | input | 0 |  |
| phone_number | Phone | input | 0 |  |
| home_town | Text | input | 0 |  |
| step_stay | Section | input | - |  |
| arrival_date | Date | input | 1 |  |
| nights | Number | input | 1 |  |
| party_size | Number | input | 1 |  |
| accommodation | Select | choice | 1 | 5 |
| dietary | Textarea | input | 1 |  |
| step_experiences | Section | input | - |  |
| tour_package | Radio | choice | 2 | 3 |
| activities | MultiSelect | choice | 2 | 5 |
| hat_size | Select | choice | 2 | 4 |
| step_confirm | Section | input | - |  |
| transport | Select | choice | 3 | 4 |
| how_heard | Select | choice | 3 | 5 |
| excitement | Rating | input | 3 |  |
| special_requests | Textarea | input | 3 |  |
| consent_terms | Checkbox | choice | 3 | 1 |
| consent_news | Checkbox | choice | 3 | 1 |
| utm_source | Hidden | input | 3 |  |
| utm_campaign | Hidden | input | 3 |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
_(none — this template has no {{content:*}} tokens)_

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "Est. 1962 &middot; Red Centre"
- "Outback Station Stay"
- "Booking &amp; Reservation"
- "Guest"
- "The Stay"
- "Do"
- "Confirm"
- "Step 1 of 4"
- "Book your outback escape"
- "Start with your details so we can prepare your welcome swag and station map."
- "Step 2 of 4"
- "When are you heading bush?"
- "Pick your dates and the swag you&#x27;ll be bunking down in out on the station."
- "Step 3 of 4"
- "Pick your adventures"
- "Add the experiences you fancy. All stays include a sunset campfire and damper night."
- "Step 4 of 4"
- "One last yarn before you go"
- "A few final details, then send it through and we&#x27;ll get the billy on."
- "Back"
- "Continue"
- "Send Booking"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: none): `{op:"set_field_property", key:"<chipFieldKey>", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:3, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - _(none detected — fall back to --primary/--accent)_
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `76e38c8bb84e…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `76e38c8bb84ed8bb…` · customHtml shell sha256 stays `3b1e8414cd735bc9…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `system`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
