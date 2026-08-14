---
{
  "templateGuideSlug": "tpl-coachella-festival-registration",
  "slug": "coachella-festival-registration",
  "theme": "coachella-desert-premium",
  "rootSelector": ".mfp.mfp-coachella",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "weekend_selection",
    "pass_type",
    "music_preference",
    "experience_addons",
    "newsletter"
  ],
  "cardFields": [],
  "contentTokens": [
    "gift_1_title",
    "gift_1_desc",
    "gift_2_title",
    "gift_2_desc",
    "gift_3_title",
    "gift_3_desc",
    "gift_4_title",
    "gift_4_desc",
    "hero_tagline",
    "hero_location",
    "section_attendee",
    "section_passes",
    "section_experience",
    "section_extras",
    "footer_note"
  ],
  "colorVars": {
    "--coachella-pink": "#ff85a1",
    "--coachella-sunset": "#ff6b35",
    "--coachella-coral": "#ff9f68",
    "--coachella-purple": "#9b59b6",
    "--coachella-gold": "#f4d03f",
    "--coachella-teal": "#1abc9c",
    "--coachella-sand": "#fef3e2",
    "--coachella-dark": "#1a1a2e",
    "--coachella-text": "#2d2d44",
    "--mf-choice-border": "rgba(255,255,255,0.28)",
    "--mf-choice-card": "rgba(255,255,255,0.10)"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "email",
    "phone",
    "city",
    "age_group",
    "weekend_selection",
    "pass_type",
    "pass_quantity",
    "camping",
    "music_preference",
    "experience_addons",
    "dietary_needs",
    "special_requests",
    "newsletter",
    "terms"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "🎒",
    "🌸",
    "💧",
    "🎨",
    "COACHELLA",
    "👤",
    "🎫",
    "🎵"
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
  "customCssSha256": "4533fb73a013bcf8d5241da2c5708f608218d5499879184701e41d9aa84f9725",
  "shellSha256": "b7cb7b656f19cf4d991f0388b91141c9c8ec41a79f5423b3fad80c09c31fe652"
}
---
# AI Edit Guide — Coachella Valley Music Festival

Theme `coachella-desert-premium` · root `.mfp.mfp-coachella` · 16 fields · 1 steps (single).

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
| city | Text | input | - |  |
| age_group | Select | choice | - | 4 |
| weekend_selection | Radio | chips | - | 3 |
| pass_type | Radio | chips | - | 4 |
| pass_quantity | Select | choice | - | 5 |
| camping | Select | choice | - | 4 |
| music_preference | Checkbox | chips | - | 8 |
| experience_addons | Checkbox | chips | - | 5 |
| dietary_needs | Select | choice | - | 6 |
| special_requests | Textarea | input | - |  |
| newsletter | Checkbox | chips | - | 1 |
| terms | Checkbox | choice | - | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `hero_tagline`: "April 11-13 & 18-20, 2025"
- `hero_location`: "Empire Polo Club, Indio, California"
- `gift_1_title`: "Festival Tote Bag"
- `gift_1_desc`: "Exclusive desert-print canvas tote"
- `gift_2_title`: "LED Flower Crown"
- `gift_2_desc`: "Light up the night in style"
- `gift_3_title`: "Hydration Pack"
- `gift_3_desc`: "Stay cool under the desert sun"
- `gift_4_title`: "Artist Poster Set"
- `gift_4_desc`: "Limited edition collectible prints"
- `section_attendee`: "Festival Goer Details"
- `section_passes`: "Pass Selection"
- `section_experience`: "Festival Experience"
- `section_extras`: "Add-Ons & Preferences"
- `footer_note`: "All passes include access to art installations, food village"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "🎒"
- "🌸"
- "💧"
- "🎨"
- "COACHELLA"
- "👤"
- "🎫"
- "🎵"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: weekend_selection, pass_type, music_preference, experience_addons, newsletter): `{op:"set_field_property", key:"weekend_selection", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--coachella-pink`: #ff85a1
  - `--coachella-sunset`: #ff6b35
  - `--coachella-coral`: #ff9f68
  - `--coachella-purple`: #9b59b6
  - `--coachella-gold`: #f4d03f
  - `--coachella-teal`: #1abc9c
  - `--coachella-sand`: #fef3e2
  - `--coachella-dark`: #1a1a2e
  - `--coachella-text`: #2d2d44
  - `--mf-choice-border`: rgba(255,255,255,0.28)
  - `--mf-choice-card`: rgba(255,255,255,0.10)
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `4533fb73a013…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `theme_selector`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `4533fb73a013bcf8…` · customHtml shell sha256 stays `b7cb7b656f19cf4d…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `coachella-desert-premium`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
