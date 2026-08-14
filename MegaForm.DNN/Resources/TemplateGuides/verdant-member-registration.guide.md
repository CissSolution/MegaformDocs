---
{
  "templateGuideSlug": "tpl-verdant-member-registration",
  "slug": "verdant-member-registration",
  "theme": "system",
  "rootSelector": ".mfp.mfp-verdant-member-registration.mfp-native-generated",
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
        "email",
        "company"
      ]
    },
    {
      "step": 1,
      "keys": [
        "phone",
        "member_role",
        "preferred_contact",
        "community_updates",
        "agree_terms"
      ]
    },
    {
      "step": 2,
      "keys": [
        "utm_source",
        "utm_campaign"
      ]
    }
  ],
  "chipFields": [
    "preferred_contact"
  ],
  "cardFields": [],
  "contentTokens": [],
  "colorVars": {
    "--vd-bg": "#0d1a12",
    "--vd-error": "#c0392b"
  },
  "lockedKeys": [
    "step_details",
    "first_name",
    "last_name",
    "email",
    "company",
    "step_preferences",
    "phone",
    "member_role",
    "preferred_contact",
    "community_updates",
    "agree_terms",
    "step_review",
    "utm_source",
    "utm_campaign"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "VERDANT",
    "Every great journey begins with a single step forward.",
    "Join a community built for growth.",
    "&#8592; Back to Forms",
    "Create profile &#8212; Step 1 of 3",
    "Tell us about you",
    "Fill in your basic details to get started.",
    "Continue",
    "&#8594;",
    "Create profile &#8212; Step 2 of 3",
    "Your preferences",
    "Tell us how to tailor your member experience.",
    "&#8592; Back",
    "Review",
    "Create profile &#8212; Step 3 of 3",
    "You're all set",
    "Confirm your registration and begin your Verdant journey.",
    "Ready to grow with us?",
    "Create profile",
    "Already a member? Sign in through your site's secure login."
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
  "customCssSha256": "b2473852c055a3ef210916320866a06f327970f75ae63cab0cdd30834c71d1b5",
  "shellSha256": "48c05f3601b71461681dcd4573b34a72a4943408be537a55f09c16b3207145b2"
}
---
# AI Edit Guide — Verdant Member Registration

Theme `system` · root `.mfp.mfp-verdant-member-registration.mfp-native-generated` · 14 fields · 3 steps (premium-native).

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
| step_details | Section | input | - |  |
| first_name | Text | input | 0 |  |
| last_name | Text | input | 0 |  |
| email | Email | input | 0 |  |
| company | Text | input | 0 |  |
| step_preferences | Section | input | - |  |
| phone | Phone | input | 1 |  |
| member_role | Select | choice | 1 | 3 |
| preferred_contact | Radio | chips | 1 | 3 |
| community_updates | Checkbox | choice | 1 | 1 |
| agree_terms | Checkbox | choice | 1 | 1 |
| step_review | Section | input | - |  |
| utm_source | Hidden | input | 2 |  |
| utm_campaign | Hidden | input | 2 |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
_(none — this template has no {{content:*}} tokens)_

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "VERDANT"
- "Every great journey begins with a single step forward."
- "Join a community built for growth."
- "&#8592; Back to Forms"
- "Create profile &#8212; Step 1 of 3"
- "Tell us about you"
- "Fill in your basic details to get started."
- "Continue"
- "&#8594;"
- "Create profile &#8212; Step 2 of 3"
- "Your preferences"
- "Tell us how to tailor your member experience."
- "&#8592; Back"
- "Review"
- "Create profile &#8212; Step 3 of 3"
- "You're all set"
- "Confirm your registration and begin your Verdant journey."
- "Ready to grow with us?"
- "Create profile"
- "Already a member? Sign in through your site's secure login."

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: preferred_contact): `{op:"set_field_property", key:"preferred_contact", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:2, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--vd-bg`: #0d1a12
  - `--vd-error`: #c0392b
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `b2473852c055…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `b2473852c055a3ef…` · customHtml shell sha256 stays `48c05f3601b71461…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `system`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
