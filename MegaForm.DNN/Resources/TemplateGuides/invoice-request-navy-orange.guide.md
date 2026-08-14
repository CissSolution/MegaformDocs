---
{
  "templateGuideSlug": "tpl-invoice-request-navy-orange",
  "slug": "invoice-request-navy-orange",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-inv.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "premium-native",
  "stepAnchor": "data-step",
  "stepCount": 4,
  "stepFieldKeys": [
    {
      "step": 0,
      "keys": [
        "step_1",
        "bill_to_name",
        "bill_to_addr",
        "bill_to_city",
        "bill_to_email",
        "bill_from_name",
        "bill_from_addr",
        "bill_from_city",
        "bill_from_email",
        "invoice_no",
        "invoice_date",
        "due_date"
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
        "pay_method",
        "bank_name",
        "account_no",
        "routing_no",
        "contact_phone",
        "contact_email",
        "contact_web"
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
  "chipFields": [
    "pay_method"
  ],
  "cardFields": [],
  "contentTokens": [
    "your_logo",
    "slogan",
    "invoice",
    "inv_001",
    "text_01",
    "parties",
    "text_02",
    "items",
    "text_03",
    "payment",
    "text_04",
    "confirm",
    "invoice_to",
    "company_name",
    "address",
    "city_state_zip",
    "email",
    "invoice_from",
    "invoice_no",
    "invoice_date",
    "due_date",
    "next_step",
    "subtotal",
    "text_0_00",
    "tax_10",
    "discount_0",
    "text_0_00_2",
    "total",
    "tax_rate",
    "discount",
    "notes",
    "back",
    "payment_method",
    "bank_name",
    "account_number",
    "routing_number",
    "contact_info",
    "phone",
    "website",
    "bill_to",
    "bill_from",
    "total_2",
    "signature",
    "date",
    "finalise_invoice"
  ],
  "colorVars": {
    "--inv-primary": "#0F1B35",
    "--inv-accent": "#E87C1E",
    "--inv-deco": "#D4A82A",
    "--inv-page": "#F0F1F5",
    "--inv-fill": "#F0F1F5"
  },
  "lockedKeys": [
    "step_1",
    "bill_to_name",
    "bill_to_addr",
    "bill_to_city",
    "bill_to_email",
    "bill_from_name",
    "bill_from_addr",
    "bill_from_city",
    "bill_from_email",
    "invoice_no",
    "invoice_date",
    "due_date",
    "step_2",
    "items",
    "grand_total",
    "tax_pct",
    "discount_pct",
    "notes",
    "step_3",
    "pay_method",
    "bank_name",
    "account_no",
    "routing_no",
    "contact_phone",
    "contact_email",
    "contact_web",
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
  "customCssSha256": "1c3a7c92da1e327a0875a645cfec80162d230bb1dd35a39d645b0d31c19e03d8",
  "shellSha256": "7328ad540184d96ee971f0ff87f74316159a788b0c22785dfb65e9d0bae0153b"
}
---
# AI Edit Guide — Invoice Request — Navy & Orange

Theme `custom` · root `.mfp.mfp-inv.mfp-native-generated` · 28 fields · 4 steps (premium-native).

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
| bill_to_name | Text | input | 0 |  |
| bill_to_addr | Text | input | 0 |  |
| bill_to_city | Text | input | 0 |  |
| bill_to_email | Email | input | 0 |  |
| bill_from_name | Text | input | 0 |  |
| bill_from_addr | Text | input | 0 |  |
| bill_from_city | Text | input | 0 |  |
| bill_from_email | Email | input | 0 |  |
| invoice_no | Text | input | 0 |  |
| invoice_date | Date | input | 0 |  |
| due_date | Date | input | 0 |  |
| step_2 | Section | input | 1 |  |
| items | DataGrid | input | 1 |  |
| grand_total | Number | input | 1 |  |
| tax_pct | Number | input | 1 |  |
| discount_pct | Number | input | 1 |  |
| notes | Textarea | input | 1 |  |
| step_3 | Section | input | 2 |  |
| pay_method | Radio | chips | 2 | 6 |
| bank_name | Text | input | 2 |  |
| account_no | Text | input | 2 |  |
| routing_no | Text | input | 2 |  |
| contact_phone | Text | input | 2 |  |
| contact_email | Email | input | 2 |  |
| contact_web | Text | input | 2 |  |
| step_4 | Section | input | 3 |  |
| terms | Checkbox | choice | 3 | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `your_logo`: "YOUR LOGO"
- `slogan`: "SLOGAN"
- `invoice`: "INVOICE"
- `inv_001`: "#INV-001"
- `text_01`: "01"
- `parties`: "Parties"
- `text_02`: "02"
- `items`: "Items"
- `text_03`: "03"
- `payment`: "Payment"
- `text_04`: "04"
- `confirm`: "Confirm"
- `invoice_to`: "Invoice To"
- `company_name`: "Company / Name *"
- `address`: "Address"
- `city_state_zip`: "City, State, ZIP"
- `email`: "Email"
- `invoice_from`: "Invoice From"
- `invoice_no`: "Invoice No."
- `invoice_date`: "Invoice Date"
- `due_date`: "Due Date"
- `next_step`: "Next step"
- `subtotal`: "Subtotal"
- `text_0_00`: "$0.00"
- `tax_10`: "Tax (10%)"
- `discount_0`: "Discount (0%)"
- `text_0_00_2`: "-$0.00"
- `total`: "TOTAL"
- `tax_rate`: "Tax Rate (%)"
- `discount`: "Discount (%)"
- `notes`: "Notes"
- `back`: "Back"
- `payment_method`: "Payment Method"
- `bank_name`: "Bank Name"
- `account_number`: "Account Number"
- `routing_number`: "Routing Number"
- `contact_info`: "Contact Info"
- `phone`: "Phone"
- `website`: "Website"
- `bill_to`: "Bill To"
- `bill_from`: "Bill From"
- `total_2`: "Total"
- `signature`: "Signature"
- `date`: "Date"
- `finalise_invoice`: "Finalise Invoice"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: pay_method): `{op:"set_field_property", key:"pay_method", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:3, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--inv-primary`: #0F1B35
  - `--inv-accent`: #E87C1E
  - `--inv-deco`: #D4A82A
  - `--inv-page`: #F0F1F5
  - `--inv-fill`: #F0F1F5
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `1c3a7c92da1e…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `1c3a7c92da1e327a…` · customHtml shell sha256 stays `7328ad540184d96e…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
