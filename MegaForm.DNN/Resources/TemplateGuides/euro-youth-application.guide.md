---
{
  "templateGuideSlug": "tpl-euro-youth-application",
  "slug": "euro-youth-application",
  "theme": "euro-youth-premium",
  "rootSelector": ".mfp.mfp-euro-youth.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "premium-native",
  "stepAnchor": "data-step",
  "stepCount": 4,
  "stepFieldKeys": [
    {
      "step": 0,
      "keys": [
        "first_name",
        "last_name",
        "email",
        "phone",
        "birth_year",
        "country"
      ]
    },
    {
      "step": 1,
      "keys": [
        "programme",
        "duration",
        "start_month",
        "interests"
      ]
    },
    {
      "step": 2,
      "keys": [
        "accommodation",
        "language_level",
        "motivation",
        "scholarship"
      ]
    },
    {
      "step": 3,
      "keys": [
        "newsletter",
        "terms"
      ]
    }
  ],
  "chipFields": [
    "interests",
    "scholarship",
    "newsletter"
  ],
  "cardFields": [
    "programme",
    "accommodation"
  ],
  "contentTokens": [],
  "colorVars": {
    "--mf-choice-border": "rgba(255,255,255,0.28)",
    "--mf-choice-card": "rgba(255,255,255,0.10)"
  },
  "lockedKeys": [
    "premium_step_1",
    "first_name",
    "last_name",
    "email",
    "phone",
    "birth_year",
    "country",
    "premium_step_2",
    "programme",
    "duration",
    "start_month",
    "interests",
    "premium_step_3",
    "accommodation",
    "language_level",
    "motivation",
    "scholarship",
    "premium_step_4",
    "newsletter",
    "terms"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "EUROYOUTH&nbsp;2026",
    "Rated 4.9 by 12,000+ participants",
    "Your European adventure starts here.",
    "Countries",
    "340+",
    "Universities",
    "&euro;0",
    "Application fee",
    "Profile",
    "About you",
    "Programme",
    "Your track",
    "Logistics",
    "Stay &amp; support",
    "Confirm",
    "Review",
    "Tell us about you",
    "Basic details so we can match you with the right programme.",
    "First name *",
    "Last name *",
    "Email *",
    "Phone",
    "Year of birth",
    "Country of residence *",
    "Choose your track",
    "Pick the programme that fits your goals.",
    "Programme *",
    "Duration (months)",
    "Preferred start *",
    "Interests",
    "Where you'll live and how we can help.",
    "Accommodation preference *",
    "Language level",
    "Why do you want to join? (optional)",
    "Mobility grant",
    "Review &amp; confirm",
    "Double-check your details before submitting.",
    "Name",
    "&mdash;",
    "Email",
    "Country",
    "Duration",
    "3 months",
    "Start",
    "Accommodation",
    "No",
    "Newsletter",
    "Terms *",
    "&larr; Back",
    "&larr; Cancel",
    "Continue &rarr;",
    "Submit application &check;",
    "Co-funded by the European Youth Mobility Initiative &middot; Step",
    "of 4"
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
  "customCssSha256": "a4d59e1ca4c928e3063cde0bd05d7cb1d04831e461b70936834a22d57d3f5fe8",
  "shellSha256": "f7cc062d5a9aa27c61621a889184031a00998c1c50837b3dac3161a7f8c1eba9"
}
---
# AI Edit Guide — EuroYouth 2026 Application

Theme `euro-youth-premium` · root `.mfp.mfp-euro-youth.mfp-native-generated` · 20 fields · 4 steps (premium-native).

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
| premium_step_1 | Section | input | - |  |
| first_name | Text | input | 0 |  |
| last_name | Text | input | 0 |  |
| email | Email | input | 0 |  |
| phone | Phone | input | 0 |  |
| birth_year | Text | input | 0 |  |
| country | Select | choice | 0 | 13 |
| premium_step_2 | Section | input | - |  |
| programme | Radio | cards | 1 | 3 |
| duration | Select | choice | 1 | 4 |
| start_month | Select | choice | 1 | 12 |
| interests | Checkbox | chips | 1 | 8 |
| premium_step_3 | Section | input | - |  |
| accommodation | Radio | cards | 2 | 3 |
| language_level | Select | choice | 2 | 6 |
| motivation | Textarea | input | 2 |  |
| scholarship | Checkbox | chips | 2 | 1 |
| premium_step_4 | Section | input | - |  |
| newsletter | Checkbox | chips | 3 | 1 |
| terms | Checkbox | choice | 3 | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
_(none — this template has no {{content:*}} tokens)_

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "EUROYOUTH&nbsp;2026"
- "Rated 4.9 by 12,000+ participants"
- "Your European adventure starts here."
- "Countries"
- "340+"
- "Universities"
- "&euro;0"
- "Application fee"
- "Profile"
- "About you"
- "Programme"
- "Your track"
- "Logistics"
- "Stay &amp; support"
- "Confirm"
- "Review"
- "Tell us about you"
- "Basic details so we can match you with the right programme."
- "First name *"
- "Last name *"
- "Email *"
- "Phone"
- "Year of birth"
- "Country of residence *"
- "Choose your track"
- "Pick the programme that fits your goals."
- "Programme *"
- "Duration (months)"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: interests, scholarship, newsletter): `{op:"set_field_property", key:"interests", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: programme, accommodation): `{op:"set_field_property", key:"programme", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:3, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--mf-choice-border`: rgba(255,255,255,0.28)
  - `--mf-choice-card`: rgba(255,255,255,0.10)
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `a4d59e1ca4c9…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `a4d59e1ca4c928e3…` · customHtml shell sha256 stays `f7cc062d5a9aa27c…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `euro-youth-premium`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
