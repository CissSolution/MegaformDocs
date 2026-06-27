---
{
  "templateGuideSlug": "tpl-down-under-australia",
  "slug": "down-under-australia",
  "theme": "down-under-reef-premium",
  "rootSelector": ".mfp.mfp-australia",
  "tokenStyle": "double",
  "stepMechanism": "customHtml-wizard",
  "stepAnchor": "data-step",
  "stepCount": 4,
  "stepFieldKeys": [
    {
      "step": 0,
      "keys": []
    },
    {
      "step": 1,
      "keys": []
    },
    {
      "step": 2,
      "keys": []
    },
    {
      "step": 3,
      "keys": [
        "row_name",
        "email",
        "phone",
        "dob",
        "nationality",
        "purpose",
        "region",
        "interests",
        "duration",
        "stay",
        "budget",
        "arrival",
        "notes",
        "terms"
      ]
    }
  ],
  "chipFields": [
    "interests",
    "duration",
    "stay"
  ],
  "cardFields": [
    "purpose",
    "region",
    "budget"
  ],
  "contentTokens": [],
  "colorVars": {
    "--au-primary": "#0bb39b",
    "--au-primary-d": "#079a85",
    "--au-ink": "#06363a",
    "--au-soft": "#e2f7f2",
    "--au-sub": "#5b8a8c",
    "--au-border": "#d2ece8",
    "--au-surface": "#ffffff"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "email",
    "phone",
    "dob",
    "nationality",
    "purpose",
    "region",
    "interests",
    "duration",
    "stay",
    "budget",
    "arrival",
    "notes",
    "terms"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "Down Under Experience",
    "Tell us about your Australian journey",
    "Great Barrier",
    "12 Premium Presets",
    "Reef Turquoise",
    "Red Centre",
    "Outback Ochre",
    "Golden Wattle",
    "Sunlit Amber",
    "Eucalypt Bush",
    "Forest Sage",
    "Coral Coast",
    "Sunset Coral",
    "Pacific Deep",
    "Ocean Navy",
    "Desert Night",
    "Midnight Plum",
    "Sandstone",
    "Warm Neutral",
    "Monochrome",
    "Editorial Ink",
    "Flat Mint",
    "Soft Flat UI",
    "Opal Glow",
    "Iridescent",
    "Festival Pass",
    "Ticket Style",
    "Step 1",
    "About You",
    "Step 2",
    "Purpose",
    "Step 3",
    "Your Journey",
    "Step 4",
    "Review",
    "Step 01",
    "Tell us about you",
    "The essentials so we can tailor your Australian experience.",
    "Email address",
    "Phone",
    "Date of birth",
    "Nationality",
    "Step 02",
    "What brings you here?",
    "Pick the purpose that fits your journey best.",
    "Step 03",
    "Shape your journey",
    "Where to, how long, and what you love.",
    "Destination region",
    "Interests",
    "Duration",
    "Accommodation",
    "Budget tier",
    "Arrival date",
    "Anything else?",
    "Step 04",
    "Review &amp; confirm",
    "Make sure everything looks right before you submit.",
    "Name",
    "&mdash;"
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
  "customCssSha256": "091af7542ef9c511053f5fe063da2b690fc531831d839f8060e854883e91552c",
  "shellSha256": "33a267bd52a7c721684f2bad56ab3d4fbd4d1d9101823419fd0c1e5ea6102668"
}
---
# AI Edit Guide — Down Under Australia Experience

Theme `down-under-reef-premium` · root `.mfp.mfp-australia` · 15 fields · 4 steps (customHtml-wizard).

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
| first_name | Text | input | 3 |  |
| last_name | Text | input | 3 |  |
| email | Email | input | 3 |  |
| phone | Phone | input | 3 |  |
| dob | Date | input | 3 |  |
| nationality | Select | choice | 3 | 11 |
| purpose | Radio | cards | 3 | 6 |
| region | Radio | cards | 3 | 6 |
| interests | Checkbox | chips | 3 | 12 |
| duration | Radio | chips | 3 | 5 |
| stay | Radio | chips | 3 | 5 |
| budget | Radio | cards | 3 | 3 |
| arrival | Date | input | 3 |  |
| notes | Textarea | input | 3 |  |
| terms | Checkbox | choice | 3 | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
_(none — this template has no {{content:*}} tokens)_

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "Down Under Experience"
- "Tell us about your Australian journey"
- "Great Barrier"
- "12 Premium Presets"
- "Reef Turquoise"
- "Red Centre"
- "Outback Ochre"
- "Golden Wattle"
- "Sunlit Amber"
- "Eucalypt Bush"
- "Forest Sage"
- "Coral Coast"
- "Sunset Coral"
- "Pacific Deep"
- "Ocean Navy"
- "Desert Night"
- "Midnight Plum"
- "Sandstone"
- "Warm Neutral"
- "Monochrome"
- "Editorial Ink"
- "Flat Mint"
- "Soft Flat UI"
- "Opal Glow"
- "Iridescent"
- "Festival Pass"
- "Ticket Style"
- "Step 1"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: interests, duration, stay): `{op:"set_field_property", key:"interests", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: purpose, region, budget): `{op:"set_field_property", key:"purpose", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…","icon":"★"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:3, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--au-primary`: #0bb39b
  - `--au-primary-d`: #079a85
  - `--au-ink`: #06363a
  - `--au-soft`: #e2f7f2
  - `--au-sub`: #5b8a8c
  - `--au-border`: #d2ece8
  - `--au-surface`: #ffffff
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `091af7542ef9…`).
- **C4/C5 Add/Remove step** (ADVANCED — customHtml-wizard): steps are `data-step` blocks in customHtml driven by `au_wizard`. Only attempt if the user explicitly asks; clone an existing `data-step` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `091af7542ef9c511…` · customHtml shell sha256 stays `33a267bd52a7c721…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `down-under-reef-premium`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
