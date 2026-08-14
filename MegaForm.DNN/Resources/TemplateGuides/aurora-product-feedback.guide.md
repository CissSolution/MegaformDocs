---
{
  "templateGuideSlug": "tpl-aurora-product-feedback",
  "slug": "aurora-product-feedback",
  "theme": "modern-blue",
  "rootSelector": ".mfp.mfp-aurora-product-feedback",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "overall_rating",
    "would_recommend",
    "improvement_areas"
  ],
  "cardFields": [],
  "contentTokens": [
    "brand_name",
    "brand_tag",
    "section_customer",
    "section_product",
    "section_voice",
    "footer_note"
  ],
  "colorVars": {
    "--aur-primary": "#c8a26b",
    "--aur-primary-dark": "#a98548",
    "--aur-bg": "#f5f3ef",
    "--aur-card": "#fffefb",
    "--aur-text": "#1a1a1a",
    "--aur-text-muted": "#6b6b6b",
    "--aur-border": "#e8e3d8",
    "--aur-error": "#b85450",
    "--mf-choice-border": "rgba(255,255,255,0.28)",
    "--mf-choice-card": "rgba(255,255,255,0.10)"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "email",
    "order_number",
    "product_purchased",
    "overall_rating",
    "would_recommend",
    "improvement_areas",
    "feedback_message"
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
  "customCssSha256": "a588d87f7b9afd3d17dd47b9b5fddf69418226fe90a63411cc16a84267652dcd",
  "shellSha256": "7138e409f55b949bc081d17b4ae50dc48e640839a1eda135528b585d91f88d14"
}
---
# AI Edit Guide — Share Your Experience

Theme `modern-blue` · root `.mfp.mfp-aurora-product-feedback` · 9 fields · 1 steps (single).

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
| order_number | Text | input | - |  |
| product_purchased | Select | choice | - | 6 |
| overall_rating | Radio | chips | - | 5 |
| would_recommend | Radio | chips | - | 3 |
| improvement_areas | Checkbox | chips | - | 6 |
| feedback_message | Textarea | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `section_customer`: "Customer Details"
- `section_product`: "Product & Rating"
- `section_voice`: "Your Voice"
- `brand_name`: "AURORA"
- `brand_tag`: "PREMIUM AMERICAN FASHION"
- `footer_note`: "Every piece of feedback shapes the next thread we weave."

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: overall_rating, would_recommend, improvement_areas): `{op:"set_field_property", key:"overall_rating", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--aur-primary`: #c8a26b
  - `--aur-primary-dark`: #a98548
  - `--aur-bg`: #f5f3ef
  - `--aur-card`: #fffefb
  - `--aur-text`: #1a1a1a
  - `--aur-text-muted`: #6b6b6b
  - `--aur-border`: #e8e3d8
  - `--aur-error`: #b85450
  - `--mf-choice-border`: rgba(255,255,255,0.28)
  - `--mf-choice-card`: rgba(255,255,255,0.10)
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `a588d87f7b9a…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `the wizard script`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `a588d87f7b9afd3d…` · customHtml shell sha256 stays `7138e409f55b949b…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `modern-blue`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
