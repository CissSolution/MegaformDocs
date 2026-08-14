---
{
  "templateGuideSlug": "tpl-tabstrip-vertical-account-setup",
  "slug": "tabstrip-vertical-account-setup",
  "theme": "tabstrip-vertical-account-setup",
  "rootSelector": ".mfp.mfp-tabstrip-vertical-account-setup.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "premium-native",
  "stepAnchor": "data-step",
  "stepCount": 6,
  "stepFieldKeys": [
    {
      "step": 0,
      "keys": [
        "first_name",
        "last_name",
        "work_email",
        "phone_number"
      ]
    },
    {
      "step": 1,
      "keys": [
        "company_name",
        "website",
        "role",
        "company_size"
      ]
    },
    {
      "step": 2,
      "keys": [
        "plan"
      ]
    },
    {
      "step": 3,
      "keys": [
        "interests",
        "contact_method",
        "notes"
      ]
    },
    {
      "step": 4,
      "keys": [
        "two_factor"
      ]
    },
    {
      "step": 5,
      "keys": []
    }
  ],
  "chipFields": [
    "interests"
  ],
  "cardFields": [
    "role",
    "company_size",
    "plan",
    "contact_method",
    "two_factor"
  ],
  "contentTokens": [],
  "colorVars": {
    "--tab-ok": "#059669",
    "--tab-ok-soft": "#ecfdf5",
    "--tab-danger": "#dc2626"
  },
  "lockedKeys": [
    "step_account",
    "first_name",
    "last_name",
    "work_email",
    "phone_number",
    "step_company",
    "company_name",
    "website",
    "role",
    "company_size",
    "step_billing",
    "plan",
    "step_preferences",
    "interests",
    "contact_method",
    "notes",
    "step_security",
    "two_factor",
    "step_review"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "Tab Strip Setup",
    "Create your workspace",
    "Jump between tabs freely, or complete each one and continue. It only takes a minute.",
    "&#10003;",
    "Account",
    "Your details",
    "Company",
    "Where you work",
    "Billing",
    "Choose a plan",
    "Preferences",
    "Tailor your setup",
    "Security",
    "Protect your account",
    "Review",
    "Confirm and submit",
    "Review your details below. Click any tab to make changes.",
    "Some sections are incomplete. Open the highlighted tabs to finish.",
    "Back",
    "0 of 5 sections complete",
    "Continue",
    "Create workspace",
    "Your information is encrypted and never shared. &copy; 2026 Northwind Cloud."
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
  "customCssSha256": "fcc102628c76463bd0002025f9a09a1fee68796ea7445f9bc6e6491dd2d40830",
  "shellSha256": "7e2f97b6eb92509510d20521ead521401fcde6e62666ac7699f7a9849af43bd3"
}
---
# AI Edit Guide — Vertical Tab Strip Account Setup

Theme `tabstrip-vertical-account-setup` · root `.mfp.mfp-tabstrip-vertical-account-setup.mfp-native-generated` · 19 fields · 6 steps (premium-native).

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
| step_account | Section | input | - |  |
| first_name | Text | input | 0 |  |
| last_name | Text | input | 0 |  |
| work_email | Email | input | 0 |  |
| phone_number | Phone | input | 0 |  |
| step_company | Section | input | - |  |
| company_name | Text | input | 1 |  |
| website | Text | input | 1 |  |
| role | Radio | cards | 1 | 4 |
| company_size | Radio | cards | 1 | 4 |
| step_billing | Section | input | - |  |
| plan | Radio | cards | 2 | 3 |
| step_preferences | Section | input | - |  |
| interests | Checkbox | chips | 3 | 6 |
| contact_method | Radio | cards | 3 | 3 |
| notes | Textarea | input | 3 |  |
| step_security | Section | input | - |  |
| two_factor | Radio | cards | 4 | 3 |
| step_review | Section | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
_(none — this template has no {{content:*}} tokens)_

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "Tab Strip Setup"
- "Create your workspace"
- "Jump between tabs freely, or complete each one and continue. It only takes a minute."
- "&#10003;"
- "Account"
- "Your details"
- "Company"
- "Where you work"
- "Billing"
- "Choose a plan"
- "Preferences"
- "Tailor your setup"
- "Security"
- "Protect your account"
- "Review"
- "Confirm and submit"
- "Review your details below. Click any tab to make changes."
- "Some sections are incomplete. Open the highlighted tabs to finish."
- "Back"
- "0 of 5 sections complete"
- "Continue"
- "Create workspace"
- "Your information is encrypted and never shared. &copy; 2026 Northwind Cloud."

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: interests): `{op:"set_field_property", key:"interests", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: role, company_size, plan, contact_method, two_factor): `{op:"set_field_property", key:"role", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:5, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--tab-ok`: #059669
  - `--tab-ok-soft`: #ecfdf5
  - `--tab-danger`: #dc2626
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `fcc102628c76…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `fcc102628c76463b…` · customHtml shell sha256 stays `7e2f97b6eb925095…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `tabstrip-vertical-account-setup`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
