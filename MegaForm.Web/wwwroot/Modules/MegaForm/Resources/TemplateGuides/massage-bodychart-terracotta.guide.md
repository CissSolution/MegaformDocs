---
{
  "templateGuideSlug": "tpl-massage-bodychart-terracotta",
  "slug": "massage-bodychart-terracotta",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-mbc.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "massage_type",
    "pressure",
    "avoid_areas"
  ],
  "cardFields": [],
  "contentTokens": [
    "your_logo_here",
    "session_plan_and_body_chart",
    "please_circle_areas_of_discomfort_and_answer_the_que",
    "front",
    "back",
    "what_area_would_you_like_to_focus_on_today",
    "what_type_of_massage_are_you_seeking_today",
    "what_pressure_do_you_prefer",
    "any_areas_you_would_not_like_massaged",
    "if_yes_please_explain",
    "what_are_your_goals_for_this_treatment_session",
    "i_agree_that_the_above_information_is_accurate_to_th",
    "signature",
    "date",
    "submit_and_sign"
  ],
  "colorVars": {
    "--mbc-primary": "#8C5333",
    "--mbc-accent": "#B9714A",
    "--mbc-deco": "#C9A24B",
    "--mbc-page": "#F7F1E6",
    "--mbc-fill": "#F7F1E6"
  },
  "lockedKeys": [
    "focus_area",
    "massage_type",
    "pressure",
    "avoid_areas",
    "avoid_explain",
    "goals",
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
  "customCssSha256": "850aa3436c36e9f47579bd9648bffcc144603a86f7afee4e309dc80bec51bc65",
  "shellSha256": "5b065140cd28a1d6ff71aa8b29445d93d60dca97738cbdc44363f01f734ff499"
}
---
# AI Edit Guide — Massage Session Plan & Body Chart

Theme `custom` · root `.mfp.mfp-mbc.mfp-native-generated` · 7 fields · 1 steps (single).

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
| focus_area | Textarea | input | - |  |
| massage_type | Radio | chips | - | 2 |
| pressure | Radio | chips | - | 3 |
| avoid_areas | Radio | chips | - | 2 |
| avoid_explain | Text | input | - |  |
| goals | Textarea | input | - |  |
| signature | Signature | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `your_logo_here`: "Your Logo Here"
- `session_plan_and_body_chart`: "Session Plan & Body Chart"
- `please_circle_areas_of_discomfort_and_answer_the_que`: "Please circle areas of discomfort and answer the questions b"
- `front`: "Front"
- `back`: "Back"
- `what_area_would_you_like_to_focus_on_today`: "What area would you like to focus on today?"
- `what_type_of_massage_are_you_seeking_today`: "What type of massage are you seeking today? *"
- `what_pressure_do_you_prefer`: "What pressure do you prefer? *"
- `any_areas_you_would_not_like_massaged`: "Any areas you would NOT like massaged? *"
- `if_yes_please_explain`: "If yes, please explain"
- `what_are_your_goals_for_this_treatment_session`: "What are your goals for this treatment session?"
- `i_agree_that_the_above_information_is_accurate_to_th`: "I agree that the above information is accurate to the best o"
- `signature`: "Signature *"
- `date`: "Date"
- `submit_and_sign`: "Submit & Sign"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: massage_type, pressure, avoid_areas): `{op:"set_field_property", key:"massage_type", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--mbc-primary`: #8C5333
  - `--mbc-accent`: #B9714A
  - `--mbc-deco`: #C9A24B
  - `--mbc-page`: #F7F1E6
  - `--mbc-fill`: #F7F1E6
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `850aa3436c36…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `mbc_today`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `850aa3436c36e9f4…` · customHtml shell sha256 stays `5b065140cd28a1d6…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
