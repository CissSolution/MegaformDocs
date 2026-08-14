---
{
  "templateGuideSlug": "tpl-invoice-spinera-blue",
  "slug": "invoice-spinera-blue",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-spn.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "premium-native",
  "stepAnchor": "data-step",
  "stepCount": 4,
  "stepFieldKeys": [
    {
      "step": 0,
      "keys": [
        "step_1",
        "to_company",
        "to_name",
        "to_addr",
        "to_phone",
        "to_email",
        "to_web",
        "from_company",
        "from_addr",
        "from_phone",
        "from_email",
        "invoice_date",
        "invoice_no"
      ]
    },
    {
      "step": 1,
      "keys": [
        "step_2",
        "items",
        "tax_pct",
        "discount_pct",
        "grand_total",
        "notes"
      ]
    },
    {
      "step": 2,
      "keys": [
        "step_3",
        "bank_name",
        "account_no",
        "routing_no",
        "swift"
      ]
    },
    {
      "step": 3,
      "keys": [
        "step_4",
        "terms"
      ]
    }
  ],
  "chipFields": [],
  "cardFields": [],
  "contentTokens": [
    "invoice",
    "invoice_date",
    "invoice_no",
    "inv_2025_001",
    "to",
    "spinera_group",
    "address_line_1",
    "text_1_000_000_0000",
    "contact_spinera_com",
    "www_spinera_com",
    "from",
    "my_company",
    "your_address",
    "every_calculation_done_in_usd",
    "currency",
    "usd",
    "eur",
    "gbp",
    "aud",
    "cad",
    "sgd",
    "text_01",
    "parties",
    "text_02",
    "items",
    "text_03",
    "payment",
    "text_04",
    "confirm",
    "to_2",
    "company",
    "contact_name",
    "address",
    "phone",
    "email",
    "website",
    "from_2",
    "invoice_date_2",
    "invoice_no_2",
    "next",
    "subtotal",
    "text_0_00",
    "tax_10",
    "discount_0",
    "text_0_00_2",
    "total",
    "tax",
    "discount",
    "notes",
    "back",
    "bank",
    "bank_name",
    "account_number",
    "routing",
    "routing_number",
    "swift_bic",
    "send_invoice"
  ],
  "colorVars": {
    "--spn-primary": "#0B1F4B",
    "--spn-accent": "#1E5DB5",
    "--spn-deco": "#E02020",
    "--spn-page": "#F0F3FA",
    "--spn-fill": "#F0F3FA"
  },
  "lockedKeys": [
    "step_1",
    "to_company",
    "to_name",
    "to_addr",
    "to_phone",
    "to_email",
    "to_web",
    "from_company",
    "from_addr",
    "from_phone",
    "from_email",
    "invoice_date",
    "invoice_no",
    "step_2",
    "items",
    "grand_total",
    "tax_pct",
    "discount_pct",
    "notes",
    "step_3",
    "bank_name",
    "account_no",
    "routing_no",
    "swift",
    "step_4",
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
  "customCssSha256": "e584402d20a3a4d0dc4745dc66f548ff5a54026727821d764ddbc2ea54d05dfd",
  "shellSha256": "fa9e0bb20e99f0080a2c8ad9d7740bc61b01d6d0123002ba9f9fe8211b3cfe6c"
}
---
# AI Edit Guide — Spinera Invoice — Blue

Theme `custom` · root `.mfp.mfp-spn.mfp-native-generated` · 26 fields · 4 steps (premium-native).

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
| step_1 | Section | input | 0 |  |
| to_company | Text | input | 0 |  |
| to_name | Text | input | 0 |  |
| to_addr | Text | input | 0 |  |
| to_phone | Text | input | 0 |  |
| to_email | Email | input | 0 |  |
| to_web | Text | input | 0 |  |
| from_company | Text | input | 0 |  |
| from_addr | Text | input | 0 |  |
| from_phone | Text | input | 0 |  |
| from_email | Email | input | 0 |  |
| invoice_date | Date | input | 0 |  |
| invoice_no | Text | input | 0 |  |
| step_2 | Section | input | 1 |  |
| items | DataGrid | input | 1 |  |
| grand_total | Number | input | 1 |  |
| tax_pct | Number | input | 1 |  |
| discount_pct | Number | input | 1 |  |
| notes | Textarea | input | 1 |  |
| step_3 | Section | input | 2 |  |
| bank_name | Text | input | 2 |  |
| account_no | Text | input | 2 |  |
| routing_no | Text | input | 2 |  |
| swift | Text | input | 2 |  |
| step_4 | Section | input | 3 |  |
| terms | Checkbox | choice | 3 | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `invoice`: "INVOICE"
- `invoice_date`: "Invoice Date:"
- `invoice_no`: "Invoice No:"
- `inv_2025_001`: "INV-2025-001"
- `to`: "To:"
- `spinera_group`: "Spinera Group"
- `address_line_1`: "Address line 1"
- `text_1_000_000_0000`: "+1 000-000-0000"
- `contact_spinera_com`: "contact@spinera.com"
- `www_spinera_com`: "www.spinera.com"
- `from`: "From:"
- `my_company`: "My Company"
- `your_address`: "Your address"
- `every_calculation_done_in_usd`: "Every Calculation Done in USD"
- `currency`: "Currency:"
- `usd`: "USD"
- `eur`: "EUR"
- `gbp`: "GBP"
- `aud`: "AUD"
- `cad`: "CAD"
- `sgd`: "SGD"
- `text_01`: "01"
- `parties`: "Parties"
- `text_02`: "02"
- `items`: "Items"
- `text_03`: "03"
- `payment`: "Payment"
- `text_04`: "04"
- `confirm`: "Confirm"
- `to_2`: "To"
- `company`: "Company *"
- `contact_name`: "Contact Name"
- `address`: "Address"
- `phone`: "Phone"
- `email`: "Email"
- `website`: "Website"
- `from_2`: "From"
- `invoice_date_2`: "Invoice Date"
- `invoice_no_2`: "Invoice No."
- `next`: "Next"
- `subtotal`: "Subtotal"
- `text_0_00`: "$0.00"
- `tax_10`: "Tax (10%)"
- `discount_0`: "Discount (0%)"
- `text_0_00_2`: "-$0.00"
- `total`: "TOTAL"
- `tax`: "Tax %"
- `discount`: "Discount %"
- `notes`: "Notes"
- `back`: "Back"
- `bank`: "Bank"
- `bank_name`: "Bank Name"
- `account_number`: "Account Number"
- `routing`: "Routing"
- `routing_number`: "Routing Number"
- `swift_bic`: "SWIFT / BIC"
- `send_invoice`: "Send Invoice"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: none): `{op:"set_field_property", key:"<chipFieldKey>", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:3, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--spn-primary`: #0B1F4B
  - `--spn-accent`: #1E5DB5
  - `--spn-deco`: #E02020
  - `--spn-page`: #F0F3FA
  - `--spn-fill`: #F0F3FA
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `e584402d20a3…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `e584402d20a3a4d0…` · customHtml shell sha256 stays `fa9e0bb20e99f008…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
