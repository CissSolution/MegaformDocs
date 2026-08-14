---
{
  "templateGuideSlug": "tpl-kids-first-book-registration",
  "slug": "kids-first-book-registration",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-kfb.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "interests"
  ],
  "cardFields": [],
  "contentTokens": [
    "babys_first_book",
    "euroyouth_exchange_registration",
    "personal_details",
    "first_name",
    "last_name",
    "school",
    "email",
    "phone",
    "birth_year",
    "author",
    "address",
    "programme_details",
    "programme",
    "country",
    "duration",
    "start_month",
    "my_interests",
    "notes_and_wishes",
    "declaration",
    "use_template"
  ],
  "colorVars": {
    "--kfb-primary": "#E8607A",
    "--kfb-accent": "#4A90D9",
    "--kfb-deco": "#FDEEA0",
    "--kfb-page": "#FDF0F4",
    "--kfb-fill": "#FDF0F4"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "school",
    "email",
    "phone",
    "birth_year",
    "author",
    "address",
    "programme",
    "country",
    "duration",
    "start_month",
    "interests",
    "motivation",
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
  "customCssSha256": "44f8acd918b081b2e8c33bdb6842a1f19a66fd1690497b64f2ebd6b170872f8f",
  "shellSha256": "7f39047fb6722ec756aed9058d0b60ca99c2a455d74efe66a4808a8bdbb2e710"
}
---
# AI Edit Guide — Baby's First Book — Registration

Theme `custom` · root `.mfp.mfp-kfb.mfp-native-generated` · 16 fields · 1 steps (single).

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
| first_name | Text | input | - |  |
| last_name | Text | input | - |  |
| school | Text | input | - |  |
| email | Email | input | - |  |
| phone | Text | input | - |  |
| birth_year | Text | input | - |  |
| author | Text | input | - |  |
| address | Text | input | - |  |
| programme | Select | choice | - | 5 |
| country | Select | choice | - | 13 |
| duration | Select | choice | - | 6 |
| start_month | Select | choice | - | 12 |
| interests | Checkbox | chips | - | 8 |
| motivation | Textarea | input | - |  |
| newsletter | Checkbox | choice | - | 1 |
| terms | Checkbox | choice | - | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `babys_first_book`: "BABY'S FIRST BOOK"
- `euroyouth_exchange_registration`: "EuroYouth Exchange — Registration"
- `personal_details`: "Personal Details"
- `first_name`: "FIRST NAME:"
- `last_name`: "LAST NAME:"
- `school`: "SCHOOL:"
- `email`: "EMAIL:"
- `phone`: "PHONE:"
- `birth_year`: "BIRTH YEAR:"
- `author`: "AUTHOR:"
- `address`: "ADDRESS:"
- `programme_details`: "Programme Details"
- `programme`: "PROGRAMME:"
- `country`: "COUNTRY:"
- `duration`: "DURATION:"
- `start_month`: "START MONTH:"
- `my_interests`: "My Interests"
- `notes_and_wishes`: "Notes & Wishes"
- `declaration`: "Declaration"
- `use_template`: "Use Template"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: interests): `{op:"set_field_property", key:"interests", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--kfb-primary`: #E8607A
  - `--kfb-accent`: #4A90D9
  - `--kfb-deco`: #FDEEA0
  - `--kfb-page`: #FDF0F4
  - `--kfb-fill`: #FDF0F4
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `44f8acd918b0…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `the wizard script`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `44f8acd918b081b2…` · customHtml shell sha256 stays `7f39047fb6722ec7…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
