---
{
  "templateGuideSlug": "tpl-intake-acme-ocean",
  "slug": "intake-acme-ocean",
  "theme": "intake-ocean-premium",
  "rootSelector": ".mfp.mfp-intake",
  "tokenStyle": "double",
  "stepMechanism": "rail-content",
  "stepAnchor": "in-step",
  "stepCount": 3,
  "stepFieldKeys": [],
  "chipFields": [],
  "cardFields": [],
  "contentTokens": [
    "brand_name",
    "brand_sub",
    "step1",
    "step2",
    "step3",
    "theme_name",
    "step_label",
    "panel_title"
  ],
  "colorVars": {
    "--in-primary": "#2563eb",
    "--in-ink": "#0f172a",
    "--in-muted": "#64748b",
    "--in-border": "#e2e8f0"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "work_email",
    "company",
    "role",
    "terms"
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
  "customCssSha256": "848f7a7b8b25f4f3278fbc8b4bf249a91deb0c42b9c725e5a89cea1a16839f12",
  "shellSha256": "9675c74d7f4f85984da4cfe27c3d3a59ecb0228362e2415980ebe6e9a3873fa7"
}
---
# AI Edit Guide — Acme Platform Intake

Theme `intake-ocean-premium` · root `.mfp.mfp-intake` · 6 fields · 3 steps (rail-content).

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
| work_email | Email | input | - |  |
| company | Text | input | - |  |
| role | Text | input | - |  |
| terms | Checkbox | choice | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `brand_name`: "Acme Platform"
- `brand_sub`: "Tell us what you need"
- `step1`: "About you"
- `step2`: "Your needs"
- `step3`: "Review"
- `theme_name`: "🎨 Ocean Blue"
- `step_label`: "Step 1 of 3"
- `panel_title`: "About you"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: none): `{op:"set_field_property", key:"<chipFieldKey>", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…","icon":"★"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:2, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `in-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--in-primary`: #2563eb
  - `--in-ink`: #0f172a
  - `--in-muted`: #64748b
  - `--in-border`: #e2e8f0
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `848f7a7b8b25…`).
- **C4/C5 Add/Remove step** (ADVANCED — rail-content): steps are `in-step` blocks in customHtml driven by `the wizard script`. Only attempt if the user explicitly asks; clone an existing `in-step` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `848f7a7b8b25f4f3…` · customHtml shell sha256 stays `9675c74d7f4f8598…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `intake-ocean-premium`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
