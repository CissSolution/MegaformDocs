---
{
  "templateGuideSlug": "tpl-bulgaria-discovery-programme",
  "slug": "bulgaria-discovery-programme",
  "theme": "bulgaria-discovery-premium",
  "rootSelector": ".mfp.mfp-bulgaria.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "premium-native",
  "stepAnchor": "data-step",
  "stepCount": 4,
  "stepFieldKeys": [
    {
      "step": 0,
      "keys": [
        "row_name",
        "email",
        "phone",
        "birth_date",
        "gender",
        "nationality"
      ]
    },
    {
      "step": 1,
      "keys": [
        "purpose_type",
        "interests",
        "experience",
        "languages"
      ]
    },
    {
      "step": 2,
      "keys": [
        "region",
        "duration",
        "accommodation",
        "budget",
        "dietary",
        "accessibility"
      ]
    },
    {
      "step": 3,
      "keys": [
        "bio",
        "referral",
        "supporting_document",
        "newsletter",
        "terms"
      ]
    }
  ],
  "chipFields": [
    "interests",
    "languages",
    "budget",
    "dietary"
  ],
  "cardFields": [
    "purpose_type",
    "region"
  ],
  "contentTokens": [],
  "colorVars": {
    "--bg-parch": "#f5f0e8",
    "--bg-surface": "#fff",
    "--bg-dark": "#1a1410",
    "--bg-rose": "#c94f6d",
    "--bg-rose-soft": "#fdf0f3",
    "--bg-green": "#2d5a3d",
    "--bg-green-soft": "#edf6f0",
    "--bg-gold": "#c8853a",
    "--bg-gold-soft": "#fdf4ec",
    "--bg-muted": "#7c6e62",
    "--bg-border": "#e6ddd2",
    "--bg-line": "#ded3c7"
  },
  "lockedKeys": [
    "premium_step_1",
    "first_name",
    "last_name",
    "email",
    "phone",
    "birth_date",
    "gender",
    "nationality",
    "premium_step_2",
    "purpose_type",
    "interests",
    "experience",
    "languages",
    "premium_step_3",
    "region",
    "duration",
    "accommodation",
    "budget",
    "dietary",
    "accessibility",
    "premium_step_4",
    "bio",
    "referral",
    "supporting_document",
    "newsletter",
    "terms"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "Bulgaria Discovery Programme",
    "Discover",
    "Bulgaria",
    "Rose valleys, ancient Thracian history, Black Sea coasts, and Balkan hospitality.",
    "Plovdiv Old Town",
    "Profile",
    "Who you are",
    "Purpose",
    "What you seek",
    "Details",
    "Preferences",
    "Confirm",
    "Review",
    "Tell us about yourself",
    "Email address *",
    "Phone",
    "Date of birth",
    "Gender",
    "Nationality",
    "What brings you to Bulgaria?",
    "Purpose of visit *",
    "Interests - pick all that apply",
    "Prior experience with Bulgaria",
    "Languages you speak",
    "Plan your stay",
    "Preferred region *",
    "Duration of stay *",
    "Accommodation type *",
    "Budget per day (EUR)",
    "Dietary requirements",
    "Review & confirm",
    "Your application summary",
    "Name",
    "Email",
    "Region",
    "Stay",
    "Interests",
    "After you submit",
    "Application review",
    "Our Sofia team checks your details within 3 business days.",
    "Programme match",
    "We suggest regions, hosts, and seasonal experiences based on your choices.",
    "Welcome pack",
    "Approved applicants receive itinerary notes, local contacts, and next-step instructions.",
    "Short personal statement",
    "How did you hear about us?",
    "Supporting document (optional)",
    "Back",
    "Step",
    "of 4",
    "Continue",
    "Submit Application"
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
  "customCssSha256": "c5429cdb917e3b5b870fa6d95468fe8e71a21c9c822d645f4032c7cd4e172778",
  "shellSha256": "9ae4d83e9fd6ded20b2add340ef33eca74cfddcb68292e94a73834b60822c58f"
}
---
# AI Edit Guide — Bulgaria Discovery Programme

Theme `bulgaria-discovery-premium` · root `.mfp.mfp-bulgaria.mfp-native-generated` · 26 fields · 4 steps (premium-native).

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
| birth_date | Date | input | 0 |  |
| gender | Select | choice | 0 | 4 |
| nationality | Text | input | 0 |  |
| premium_step_2 | Section | input | - |  |
| purpose_type | Radio | cards | 1 | 6 |
| interests | Checkbox | chips | 1 | 10 |
| experience | Select | choice | 1 | 4 |
| languages | Checkbox | chips | 1 | 8 |
| premium_step_3 | Section | input | - |  |
| region | Radio | cards | 2 | 6 |
| duration | Select | choice | 2 | 5 |
| accommodation | Select | choice | 2 | 5 |
| budget | Radio | chips | 2 | 4 |
| dietary | Checkbox | chips | 2 | 6 |
| accessibility | Checkbox | choice | 2 | 1 |
| premium_step_4 | Section | input | - |  |
| bio | Textarea | input | 3 |  |
| referral | Select | choice | 3 | 5 |
| supporting_document | File | input | 3 |  |
| newsletter | Checkbox | choice | 3 | 1 |
| terms | Checkbox | choice | 3 | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
_(none — this template has no {{content:*}} tokens)_

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "Bulgaria Discovery Programme"
- "Discover"
- "Bulgaria"
- "Rose valleys, ancient Thracian history, Black Sea coasts, and Balkan hospitality."
- "Plovdiv Old Town"
- "Profile"
- "Who you are"
- "Purpose"
- "What you seek"
- "Details"
- "Preferences"
- "Confirm"
- "Review"
- "Tell us about yourself"
- "Email address *"
- "Phone"
- "Date of birth"
- "Gender"
- "Nationality"
- "What brings you to Bulgaria?"
- "Purpose of visit *"
- "Interests - pick all that apply"
- "Prior experience with Bulgaria"
- "Languages you speak"
- "Plan your stay"
- "Preferred region *"
- "Duration of stay *"
- "Accommodation type *"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: interests, languages, budget, dietary): `{op:"set_field_property", key:"interests", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: purpose_type, region): `{op:"set_field_property", key:"purpose_type", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:3, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--bg-parch`: #f5f0e8
  - `--bg-surface`: #fff
  - `--bg-dark`: #1a1410
  - `--bg-rose`: #c94f6d
  - `--bg-rose-soft`: #fdf0f3
  - `--bg-green`: #2d5a3d
  - `--bg-green-soft`: #edf6f0
  - `--bg-gold`: #c8853a
  - `--bg-gold-soft`: #fdf4ec
  - `--bg-muted`: #7c6e62
  - `--bg-border`: #e6ddd2
  - `--bg-line`: #ded3c7
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `c5429cdb917e…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `c5429cdb917e3b5b…` · customHtml shell sha256 stays `9ae4d83e9fd6ded2…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `bulgaria-discovery-premium`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
