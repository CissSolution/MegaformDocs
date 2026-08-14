---
{
  "templateGuideSlug": "tpl-dance-competition-registration",
  "slug": "dance-competition-registration",
  "theme": "dance-competition-premium",
  "rootSelector": ".mfp.mfp-dcp.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "category",
    "level",
    "interests"
  ],
  "cardFields": [
    "programme",
    "accommodation"
  ],
  "contentTokens": [],
  "colorVars": {},
  "lockedKeys": [
    "first_name",
    "last_name",
    "email",
    "phone",
    "birth_year",
    "country",
    "category",
    "style",
    "level",
    "programme",
    "start_month",
    "duration",
    "accommodation",
    "language_level",
    "interests",
    "motivation",
    "newsletter",
    "terms"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "DANCE COMPETITION",
    "Dance Registration",
    "Fill the registration form below keenly to enter the dancing competition.",
    "Name",
    "First name",
    "Last name",
    "E-mail *",
    "Phone",
    "Year of birth",
    "Country",
    "Competition details",
    "Category *",
    "Dance style",
    "Experience level",
    "Programme &amp; logistics",
    "Programme",
    "Preferred start",
    "Duration",
    "Accommodation",
    "Language level",
    "Interests &amp; motivation",
    "Interests",
    "Why do you want to join?",
    "Consent",
    "Newsletter",
    "Terms",
    "Submit Registration"
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
  "customCssSha256": "8a9fe735ab67f3f8dee5c829a7f848b46698a3661502f76a97a073b1210e3e5b",
  "shellSha256": "e71ad1aa87450cd2af7f66cb4f6fe92602cb2d67d67332baadbb0fd6097d8b18"
}
---
# AI Edit Guide — Dance Competition Registration

Theme `dance-competition-premium` · root `.mfp.mfp-dcp.mfp-native-generated` · 18 fields · 1 steps (single).

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
| email | Email | input | - |  |
| phone | Phone | input | - |  |
| birth_year | Text | input | - |  |
| country | Select | choice | - | 13 |
| category | Radio | chips | - | 4 |
| style | Select | choice | - | 10 |
| level | Radio | chips | - | 4 |
| programme | Radio | cards | - | 3 |
| start_month | Select | choice | - | 12 |
| duration | Select | choice | - | 4 |
| accommodation | Radio | cards | - | 3 |
| language_level | Select | choice | - | 6 |
| interests | Checkbox | chips | - | 8 |
| motivation | Textarea | input | - |  |
| newsletter | Checkbox | choice | - | 1 |
| terms | Checkbox | choice | - | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
_(none — this template has no {{content:*}} tokens)_

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "DANCE COMPETITION"
- "Dance Registration"
- "Fill the registration form below keenly to enter the dancing competition."
- "Name"
- "First name"
- "Last name"
- "E-mail *"
- "Phone"
- "Year of birth"
- "Country"
- "Competition details"
- "Category *"
- "Dance style"
- "Experience level"
- "Programme &amp; logistics"
- "Programme"
- "Preferred start"
- "Duration"
- "Accommodation"
- "Language level"
- "Interests &amp; motivation"
- "Interests"
- "Why do you want to join?"
- "Consent"
- "Newsletter"
- "Terms"
- "Submit Registration"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: category, level, interests): `{op:"set_field_property", key:"category", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: programme, accommodation): `{op:"set_field_property", key:"programme", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - _(none detected — fall back to --primary/--accent)_
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `8a9fe735ab67…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `the wizard script`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `8a9fe735ab67f3f8…` · customHtml shell sha256 stays `e71ad1aa87450cd2…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `dance-competition-premium`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
