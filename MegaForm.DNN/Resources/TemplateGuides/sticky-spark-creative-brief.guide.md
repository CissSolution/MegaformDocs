---
{
  "templateGuideSlug": "tpl-sticky-spark-creative-brief",
  "slug": "sticky-spark-creative-brief",
  "theme": "playful",
  "rootSelector": ".mfp.mfp-sticky-spark",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "mood"
  ],
  "cardFields": [],
  "contentTokens": [],
  "colorVars": {
    "--ink": "#1f2937",
    "--paper": "#fffdf6",
    "--mf-choice-border": "rgba(255,255,255,0.28)",
    "--mf-choice-card": "rgba(255,255,255,0.10)"
  },
  "lockedKeys": [
    "sec_intro",
    "contact_name",
    "contact_email",
    "brand_name",
    "project_type",
    "other_project_type",
    "launch_date",
    "sec_direction",
    "mood",
    "references",
    "project_story",
    "sec_delivery",
    "deliverables",
    "budget_range",
    "budget_notes"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "Creative brief",
    "What to prepare",
    "Goals",
    "References",
    "Launch timing",
    "Response time",
    "Usually within 1–2 business days.",
    "Contact + project",
    "Creative direction",
    "Deliverables + budget"
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
  "customCssSha256": "4f3ee355220d7746a8d0445a68c8de5fa5e884ba73cba97f7fd7eeff8fa279bf",
  "shellSha256": "33dde875e60abe4a745ed6c8ce289c775650058b2d9b091e1668319dce94589b"
}
---
# AI Edit Guide — Sticky Spark Creative Brief

Theme `playful` · root `.mfp.mfp-sticky-spark` · 15 fields · 1 steps (single).

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
| sec_intro | Section | input | - |  |
| contact_name | Text | input | - |  |
| contact_email | Email | input | - |  |
| brand_name | Text | input | - |  |
| project_type | Select | choice | - | 5 |
| other_project_type | Text | input | - |  |
| launch_date | Date | input | - |  |
| sec_direction | Section | input | - |  |
| mood | Checkbox | chips | - | 4 |
| references | Url | input | - |  |
| project_story | Textarea | input | - |  |
| sec_delivery | Section | input | - |  |
| deliverables | Textarea | input | - |  |
| budget_range | Select | choice | - | 4 |
| budget_notes | Textarea | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
_(none — this template has no {{content:*}} tokens)_

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "Creative brief"
- "What to prepare"
- "Goals"
- "References"
- "Launch timing"
- "Response time"
- "Usually within 1–2 business days."
- "Contact + project"
- "Creative direction"
- "Deliverables + budget"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: mood): `{op:"set_field_property", key:"mood", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--ink`: #1f2937
  - `--paper`: #fffdf6
  - `--mf-choice-border`: rgba(255,255,255,0.28)
  - `--mf-choice-card`: rgba(255,255,255,0.10)
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `4f3ee355220d…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `the wizard script`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `4f3ee355220d7746…` · customHtml shell sha256 stays `33dde875e60abe4a…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `playful`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
