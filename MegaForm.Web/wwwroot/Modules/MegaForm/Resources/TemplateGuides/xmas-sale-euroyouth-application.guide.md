---
{
  "templateGuideSlug": "tpl-xmas-sale-euroyouth-application",
  "slug": "xmas-sale-euroyouth-application",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-xms.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "interests"
  ],
  "cardFields": [
    "programme"
  ],
  "contentTokens": [
    "merry",
    "christmas",
    "and",
    "happy_new_year",
    "online_and_in_stores",
    "five_days_of",
    "offer",
    "apply_during_the_christmas_season_and_receive_priori",
    "choose_your_programme",
    "personal_information",
    "first_name",
    "last_name",
    "email",
    "phone",
    "birth_year",
    "country",
    "programme_details",
    "start_month",
    "duration_months",
    "language_level",
    "accommodation",
    "interests",
    "motivation",
    "apply_now"
  ],
  "colorVars": {
    "--xms-primary": "#1B8C6E",
    "--xms-accent": "#0E5C47",
    "--xms-deco": "#D9B45B",
    "--xms-page": "#F4FAF8",
    "--xms-fill": "#F4FAF8"
  },
  "lockedKeys": [
    "programme",
    "first_name",
    "last_name",
    "email",
    "phone",
    "birth_year",
    "country",
    "start_month",
    "duration",
    "language_level",
    "accommodation",
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
  "customCssSha256": "4d518b35e2955aa3ab3429519ef92e93db3d83b8e1d9cefa87600f3b5e4405ad",
  "shellSha256": "d2773048d4f8ce1223d2b8ed62736b5fed0d4a5f6c4d266935e75054cd73590c"
}
---
# AI Edit Guide — Christmas Offer — EuroYouth Application

Theme `custom` · root `.mfp.mfp-xms.mfp-native-generated` · 15 fields · 1 steps (single).

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
| programme | Radio | cards | - | 3 |
| first_name | Text | input | - |  |
| last_name | Text | input | - |  |
| email | Email | input | - |  |
| phone | Text | input | - |  |
| birth_year | Text | input | - |  |
| country | Select | choice | - | 13 |
| start_month | Select | choice | - | 12 |
| duration | Select | choice | - | 6 |
| language_level | Select | choice | - | 6 |
| accommodation | Select | choice | - | 4 |
| interests | Checkbox | chips | - | 8 |
| motivation | Textarea | input | - |  |
| newsletter | Checkbox | choice | - | 1 |
| terms | Checkbox | choice | - | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `merry`: "Merry"
- `christmas`: "Christmas"
- `and`: "and"
- `happy_new_year`: "Happy New Year"
- `online_and_in_stores`: "Online & in Stores"
- `five_days_of`: "Five days of"
- `offer`: "OFFER"
- `apply_during_the_christmas_season_and_receive_priori`: "Apply during the Christmas season and receive priority place"
- `choose_your_programme`: "Choose Your Programme"
- `personal_information`: "Personal Information"
- `first_name`: "First name *"
- `last_name`: "Last name *"
- `email`: "Email *"
- `phone`: "Phone"
- `birth_year`: "Birth year"
- `country`: "Country *"
- `programme_details`: "Programme Details"
- `start_month`: "Start month *"
- `duration_months`: "Duration (months)"
- `language_level`: "Language level"
- `accommodation`: "Accommodation"
- `interests`: "Interests"
- `motivation`: "Motivation"
- `apply_now`: "Apply Now"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: interests): `{op:"set_field_property", key:"interests", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: programme): `{op:"set_field_property", key:"programme", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--xms-primary`: #1B8C6E
  - `--xms-accent`: #0E5C47
  - `--xms-deco`: #D9B45B
  - `--xms-page`: #F4FAF8
  - `--xms-fill`: #F4FAF8
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `4d518b35e295…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `the wizard script`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `4d518b35e2955aa3…` · customHtml shell sha256 stays `d2773048d4f8ce12…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
