---
{
  "templateGuideSlug": "tpl-massage-intake-sage",
  "slug": "massage-intake-sage",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-msi.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "had_massage",
    "pregnant"
  ],
  "cardFields": [],
  "contentTokens": [
    "your_logo_here",
    "massage_therapy",
    "client_intake_form",
    "name",
    "phone",
    "date_of_birth",
    "please_answer_the_questions_below",
    "have_you_received_massage_therapy_before",
    "are_you_currently_pregnant",
    "please_mark_any_of_the_following_conditions_you_curr",
    "additional_notes_allergies_or_sensitivities",
    "submit_intake_form"
  ],
  "colorVars": {
    "--msi-primary": "#586B4A",
    "--msi-accent": "#7C8F6E",
    "--msi-deco": "#C9A24B",
    "--msi-page": "#F7F1E6",
    "--msi-fill": "#F7F1E6"
  },
  "lockedKeys": [
    "full_name",
    "phone",
    "dob",
    "had_massage",
    "pregnant",
    "conditions",
    "notes"
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
  "customCssSha256": "3c94a2a6e92d19fc1ad6d21fac59068bf2256526422fae890598519184776b15",
  "shellSha256": "00f2f6485dae3692d8321aee094cc612e78d8034ccec2e0addba92feb26d924e"
}
---
# AI Edit Guide — Massage Therapy — Client Intake

Theme `custom` · root `.mfp.mfp-msi.mfp-native-generated` · 7 fields · 1 steps (single).

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
| full_name | Text | input | - |  |
| phone | Text | input | - |  |
| dob | Date | input | - |  |
| had_massage | Radio | chips | - | 2 |
| pregnant | Radio | chips | - | 2 |
| conditions | Checkbox | choice | - | 20 |
| notes | Textarea | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `your_logo_here`: "Your Logo Here"
- `massage_therapy`: "Massage Therapy"
- `client_intake_form`: "Client Intake Form"
- `name`: "Name *"
- `phone`: "Phone *"
- `date_of_birth`: "Date of Birth *"
- `please_answer_the_questions_below`: "Please answer the questions below"
- `have_you_received_massage_therapy_before`: "Have you received massage therapy before? *"
- `are_you_currently_pregnant`: "Are you currently pregnant? *"
- `please_mark_any_of_the_following_conditions_you_curr`: "Please mark any of the following conditions you currently ha"
- `additional_notes_allergies_or_sensitivities`: "Additional notes, allergies or sensitivities"
- `submit_intake_form`: "Submit Intake Form"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: had_massage, pregnant): `{op:"set_field_property", key:"had_massage", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--msi-primary`: #586B4A
  - `--msi-accent`: #7C8F6E
  - `--msi-deco`: #C9A24B
  - `--msi-page`: #F7F1E6
  - `--msi-fill`: #F7F1E6
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `3c94a2a6e92d…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `the wizard script`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `3c94a2a6e92d19fc…` · customHtml shell sha256 stays `00f2f6485dae3692…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
