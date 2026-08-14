---
{
  "templateGuideSlug": "tpl-halloween-party-registration",
  "slug": "halloween-party-registration",
  "theme": "halloween-floating-ghosts",
  "rootSelector": ".mfp.mfp-halloween",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "costume_type",
    "activities",
    "newsletter"
  ],
  "cardFields": [],
  "contentTokens": [
    "ghost_message_1",
    "ghost_message_2",
    "ghost_message_3",
    "event_date",
    "event_time",
    "event_location",
    "section_attendee",
    "section_party",
    "section_preferences",
    "footer_note"
  ],
  "colorVars": {
    "--hw-bg": "#1a1a2e",
    "--hw-card": "#2d2d44",
    "--hw-purple": "#6b5b95",
    "--hw-orange": "#ff6b35",
    "--hw-green": "#7ed957",
    "--hw-ghost": "rgba(255,255,255,0.9)",
    "--hw-text": "#f0f0f0",
    "--hw-text-muted": "#a0a0b0",
    "--hw-border": "rgba(255,255,255,0.1)",
    "--mf-choice-border": "rgba(255,255,255,0.28)",
    "--mf-choice-card": "rgba(255,255,255,0.10)"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "email",
    "phone",
    "guest_count",
    "costume_type",
    "activities",
    "dietary",
    "special_requests",
    "newsletter"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "&#128197;",
    "&#128336;",
    "&#127968;",
    "&#128123;",
    "&#127875;",
    "&#128378;"
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
  "customCssSha256": "e018369f77d20a8e3ed80314eea8a75e43c55fa5aa4d1a71f5c866058eeff6c7",
  "shellSha256": "671c94892912b4edc74d9a116145603a5d0c57cd945ce563cf8b65869fb3c2f1"
}
---
# AI Edit Guide — Spooky Night Party

Theme `halloween-floating-ghosts` · root `.mfp.mfp-halloween` · 10 fields · 1 steps (single).

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
| guest_count | Select | choice | - | 5 |
| costume_type | Radio | chips | - | 5 |
| activities | Checkbox | chips | - | 6 |
| dietary | Select | choice | - | 5 |
| special_requests | Textarea | input | - |  |
| newsletter | Checkbox | chips | - | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `section_attendee`: "Who's Coming?"
- `section_party`: "Party Details"
- `section_preferences`: "Your Spooky Preferences"
- `footer_note`: "Costumes encouraged! Best costume wins a prize."
- `ghost_message_1`: "Boo!"
- `ghost_message_2`: "Join us..."
- `ghost_message_3`: "Spooky!"
- `event_date`: "October 31st, 2024"
- `event_time`: "7:00 PM - Midnight"
- `event_location`: "The Haunted Manor"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "&#128197;"
- "&#128336;"
- "&#127968;"
- "&#128123;"
- "&#127875;"
- "&#128378;"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: costume_type, activities, newsletter): `{op:"set_field_property", key:"costume_type", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--hw-bg`: #1a1a2e
  - `--hw-card`: #2d2d44
  - `--hw-purple`: #6b5b95
  - `--hw-orange`: #ff6b35
  - `--hw-green`: #7ed957
  - `--hw-ghost`: rgba(255,255,255,0.9)
  - `--hw-text`: #f0f0f0
  - `--hw-text-muted`: #a0a0b0
  - `--hw-border`: rgba(255,255,255,0.1)
  - `--mf-choice-border`: rgba(255,255,255,0.28)
  - `--mf-choice-card`: rgba(255,255,255,0.10)
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `e018369f77d2…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `the wizard script`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `e018369f77d20a8e…` · customHtml shell sha256 stays `671c94892912b4ed…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `halloween-floating-ghosts`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
