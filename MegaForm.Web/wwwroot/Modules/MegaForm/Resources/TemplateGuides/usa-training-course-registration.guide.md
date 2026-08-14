---
{
  "templateGuideSlug": "tpl-usa-training-course-registration",
  "slug": "usa-training-course-registration",
  "theme": "usa-training-premium",
  "rootSelector": ".mfp.mfp-usa-training",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "course_format",
    "schedule_preference",
    "experience_level",
    "goals",
    "newsletter"
  ],
  "cardFields": [],
  "contentTokens": [
    "brand_name",
    "brand_tagline",
    "section_personal",
    "section_course",
    "section_preferences"
  ],
  "colorVars": {
    "--usa-primary": "#1e40af",
    "--usa-primary-dark": "#1e3a8a",
    "--usa-accent": "#fbbf24",
    "--usa-secondary": "#dc2626",
    "--usa-navy": "#0f172a",
    "--usa-white": "#ffffff",
    "--usa-gray-50": "#f8fafc",
    "--usa-gray-100": "#f1f5f9",
    "--usa-gray-200": "#e2e8f0",
    "--usa-gray-300": "#cbd5e1",
    "--usa-gray-400": "#94a3b8",
    "--usa-gray-500": "#64748b",
    "--usa-gray-600": "#475569",
    "--usa-gray-700": "#334155",
    "--usa-gray-800": "#1e293b",
    "--mf-choice-border": "rgba(255,255,255,0.28)",
    "--mf-choice-card": "rgba(255,255,255,0.10)"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "email",
    "phone",
    "city",
    "state",
    "zip_code",
    "slider_activities",
    "course_type",
    "course_format",
    "schedule_preference",
    "start_date",
    "funding_source",
    "experience_level",
    "goals",
    "additional_info",
    "how_heard",
    "terms_agreement",
    "newsletter"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "Need help? Contact us at",
    "admissions@academy.edu",
    "or call",
    "1-800-ACADEMY"
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
  "customCssSha256": "30acce781a3adae65d5ba19a07e1b2ef6824b7f9dc73ecd35cb835883368f41e",
  "shellSha256": "d77f47fbfc43c8c23db56ba8e8e6687e12020e7539c797cea517cc48ac833dde"
}
---
# AI Edit Guide — Training Course Registration

Theme `usa-training-premium` · root `.mfp.mfp-usa-training` · 19 fields · 1 steps (single).

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
| state | Select | choice | - | 11 |
| zip_code | Text | input | - |  |
| slider_activities | Html | input | - |  |
| course_type | Select | choice | - | 8 |
| course_format | Radio | chips | - | 4 |
| schedule_preference | Radio | chips | - | 4 |
| start_date | Select | choice | - | 4 |
| funding_source | Select | choice | - | 5 |
| experience_level | Radio | chips | - | 4 |
| goals | Checkbox | chips | - | 6 |
| additional_info | Textarea | input | - |  |
| how_heard | Select | choice | - | 6 |
| terms_agreement | Checkbox | choice | - | 1 |
| newsletter | Checkbox | chips | - | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `brand_name`: "AMERICAN EXCELLENCE ACADEMY"
- `brand_tagline`: "Empowering Tomorrow's Leaders"
- `section_personal`: "Personal Information"
- `section_slider`: "Student Life & Activities"
- `section_course`: "Course Selection"
- `section_preferences`: "Additional Details"
- `slider_title`: "Campus Life & Student Activities"
- `slider_subtitle`: "Join a vibrant community of learners"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "Need help? Contact us at"
- "admissions@academy.edu"
- "or call"
- "1-800-ACADEMY"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: course_format, schedule_preference, experience_level, goals, newsletter): `{op:"set_field_property", key:"course_format", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--usa-primary`: #1e40af
  - `--usa-primary-dark`: #1e3a8a
  - `--usa-accent`: #fbbf24
  - `--usa-secondary`: #dc2626
  - `--usa-navy`: #0f172a
  - `--usa-white`: #ffffff
  - `--usa-gray-50`: #f8fafc
  - `--usa-gray-100`: #f1f5f9
  - `--usa-gray-200`: #e2e8f0
  - `--usa-gray-300`: #cbd5e1
  - `--usa-gray-400`: #94a3b8
  - `--usa-gray-500`: #64748b
  - `--usa-gray-600`: #475569
  - `--usa-gray-700`: #334155
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `30acce781a3a…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `usa_training_slider`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `30acce781a3adae6…` · customHtml shell sha256 stays `d77f47fbfc43c8c2…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `usa-training-premium`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
