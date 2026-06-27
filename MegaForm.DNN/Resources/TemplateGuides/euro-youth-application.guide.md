---
{
  "templateGuideSlug": "tpl-euro-youth-application",
  "slug": "euro-youth-application",
  "theme": "euro-youth-premium",
  "rootSelector": ".mfp.mfp-euro-youth",
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
        "first_name",
        "last_name",
        "email",
        "phone",
        "birth_year",
        "country",
        "duration",
        "start_month",
        "language_level",
        "motivation",
        "programme",
        "interests",
        "accommodation",
        "scholarship",
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
    "first_name",
    "last_name",
    "email",
    "phone",
    "birth_year",
    "country",
    "programme",
    "duration",
    "start_month",
    "interests",
    "accommodation",
    "language_level",
    "motivation",
    "scholarship",
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
    "Erasmus Exchange",
    "Berlin &middot; Paris &middot; Madrid",
    "Study a semester at a partner university across the EU.",
    "&check;",
    "Language Immersion",
    "Florence &middot; Lisbon &middot; Vienna",
    "Intensive language courses with a host family.",
    "Solidarity Corps",
    "Amsterdam &middot; Prague &middot; Athens",
    "Volunteer on community and sustainability projects.",
    "Duration (months)",
    "Preferred start *",
    "Interests",
    "Art & Design",
    "Technology",
    "Sustainability",
    "Music",
    "Sports",
    "Cuisine",
    "History",
    "Entrepreneurship",
    "Where you'll live and how we can help.",
    "Accommodation preference *",
    "Host family",
    "Live with locals",
    "Student dorm",
    "On campus",
    "Shared flat",
    "With peers",
    "Language level",
    "Why do you want to join? (optional)",
    "Apply for a mobility grant",
    "Eligible participants receive up to &euro;600/month towards living costs.",
    "Review &amp; confirm"
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
  "customCssSha256": "028e26db0c8c76f635f94d0c260fe80ae4027f3468b5f923880b2debc48ff384",
  "shellSha256": "a799bbb29b3ea77bc962ad8e6292acefd195b122566e8df74ec901e0b20ce5a2"
}
---
# AI Edit Guide — EuroYouth 2026 Application

Theme `euro-youth-premium` · root `.mfp.mfp-euro-youth` · 16 fields · 4 steps (customHtml-wizard).

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
| birth_year | Text | input | 3 |  |
| country | Select | choice | 3 | 13 |
| programme | Radio | cards | 3 | 3 |
| duration | Select | choice | 3 | 4 |
| start_month | Select | choice | 3 | 12 |
| interests | Checkbox | chips | 3 | 8 |
| accommodation | Radio | cards | 3 | 3 |
| language_level | Select | choice | 3 | 6 |
| motivation | Textarea | input | 3 |  |
| scholarship | Checkbox | chips | 3 | 1 |
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
- "Erasmus Exchange"
- "Berlin &middot; Paris &middot; Madrid"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: interests, scholarship, newsletter): `{op:"set_field_property", key:"interests", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: programme, accommodation): `{op:"set_field_property", key:"programme", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…","icon":"★"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:3, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--mf-choice-border`: rgba(255,255,255,0.28)
  - `--mf-choice-card`: rgba(255,255,255,0.10)
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `028e26db0c8c…`).
- **C4/C5 Add/Remove step** (ADVANCED — customHtml-wizard): steps are `data-step` blocks in customHtml driven by `euro_youth_wizard`. Only attempt if the user explicitly asks; clone an existing `data-step` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `028e26db0c8c76f6…` · customHtml shell sha256 stays `a799bbb29b3ea77b…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `euro-youth-premium`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
