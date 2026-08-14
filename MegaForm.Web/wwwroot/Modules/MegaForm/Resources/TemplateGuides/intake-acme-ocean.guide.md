---
{
  "templateGuideSlug": "tpl-intake-acme-ocean",
  "slug": "intake-acme-ocean",
  "theme": "intake-ocean-premium",
  "rootSelector": ".mfp.mfp-intake.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "premium-native",
  "stepAnchor": "data-step",
  "stepCount": 3,
  "stepFieldKeys": [
    {
      "step": 0,
      "keys": [
        "first_name",
        "last_name",
        "work_email"
      ]
    },
    {
      "step": 1,
      "keys": [
        "company",
        "role",
        "terms"
      ]
    },
    {
      "step": 2,
      "keys": []
    }
  ],
  "chipFields": [],
  "cardFields": [],
  "contentTokens": [
    "brand_name",
    "brand_sub",
    "step1",
    "step2",
    "step3",
    "theme_name",
    "step1_eyebrow",
    "step2_eyebrow",
    "step3_eyebrow",
    "review_lede"
  ],
  "colorVars": {
    "--in-primary": "#2563eb",
    "--in-ink": "#0f172a",
    "--in-muted": "#64748b",
    "--in-border": "#e2e8f0"
  },
  "lockedKeys": [
    "premium_step_1",
    "first_name",
    "last_name",
    "work_email",
    "premium_step_2",
    "company",
    "role",
    "terms",
    "premium_step_3"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "&larr; Back",
    "Continue &rarr;"
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
  "customCssSha256": "8d7b4be69b9c3ed853aadc20761731fa720b70bf1637c3360c6482b283a931fd",
  "shellSha256": "944a5faf4bd9f90eb1694a52612cab26d71b64f3656d583a048316b9804bb883"
}
---
# AI Edit Guide — Acme Platform Intake

Theme `intake-ocean-premium` · root `.mfp.mfp-intake.mfp-native-generated` · 9 fields · 3 steps (premium-native).

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
| work_email | Email | input | 0 |  |
| premium_step_2 | Section | input | - |  |
| company | Text | input | 1 |  |
| role | Text | input | 1 |  |
| terms | Checkbox | choice | 1 |  |
| premium_step_3 | Section | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `brand_name`: "Acme Platform"
- `brand_sub`: "Tell us what you need"
- `step1`: "About you"
- `step2`: "Your needs"
- `step3`: "Review"
- `theme_name`: "🎨 Ocean Blue"
- `step1_eyebrow`: "Step 01"
- `step2_eyebrow`: "Step 02"
- `step3_eyebrow`: "Step 03"
- `review_lede`: "Check your details before submitting."

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "&larr; Back"
- "Continue &rarr;"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: none): `{op:"set_field_property", key:"<chipFieldKey>", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:2, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--in-primary`: #2563eb
  - `--in-ink`: #0f172a
  - `--in-muted`: #64748b
  - `--in-border`: #e2e8f0
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `8d7b4be69b9c…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `8d7b4be69b9c3ed8…` · customHtml shell sha256 stays `944a5faf4bd9f90e…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `intake-ocean-premium`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
