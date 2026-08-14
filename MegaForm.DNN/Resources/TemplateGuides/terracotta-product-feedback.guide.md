---
{
  "templateGuideSlug": "tpl-terracotta-product-feedback",
  "slug": "terracotta-product-feedback",
  "theme": "system",
  "rootSelector": ".mfp.mfp-terracotta-product-feedback.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "topic"
  ],
  "cardFields": [],
  "contentTokens": [],
  "colorVars": {
    "--tc-bg": "#1e110a",
    "--tc-error": "#c0392b"
  },
  "lockedKeys": [
    "full_name",
    "email",
    "overall_rating",
    "topic",
    "message",
    "notify_response",
    "utm_source",
    "utm_campaign"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "TERRA",
    "Your voice shapes everything we build next.",
    "Every piece of feedback is read by our team.",
    "&#8592; Back to Forms",
    "Share your thoughts",
    "Your feedback",
    "Tell us what you think. Honest opinions help us improve.",
    "Up to 800 characters",
    "Send feedback",
    "&#8594;"
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
  "customCssSha256": "50903a00ff40320a05868b9e1a7a60401611b0a7d3af225d5108d5fbb53d9ec6",
  "shellSha256": "00a598a80103caa1c264cb28116ba747ba76d0f86976446fc1d05694436e0768"
}
---
# AI Edit Guide — Terracotta Product Feedback

Theme `system` · root `.mfp.mfp-terracotta-product-feedback.mfp-native-generated` · 8 fields · 1 steps (single).

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
| full_name | Text | input | - |  |
| email | Email | input | - |  |
| overall_rating | Rating | input | - |  |
| topic | Radio | chips | - | 5 |
| message | Textarea | input | - |  |
| notify_response | Checkbox | choice | - | 1 |
| utm_source | Hidden | input | - |  |
| utm_campaign | Hidden | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
_(none — this template has no {{content:*}} tokens)_

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "TERRA"
- "Your voice shapes everything we build next."
- "Every piece of feedback is read by our team."
- "&#8592; Back to Forms"
- "Share your thoughts"
- "Your feedback"
- "Tell us what you think. Honest opinions help us improve."
- "Up to 800 characters"
- "Send feedback"
- "&#8594;"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: topic): `{op:"set_field_property", key:"topic", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--tc-bg`: #1e110a
  - `--tc-error`: #c0392b
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `50903a00ff40…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `the wizard script`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `50903a00ff40320a…` · customHtml shell sha256 stays `00a598a80103caa1…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `system`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
