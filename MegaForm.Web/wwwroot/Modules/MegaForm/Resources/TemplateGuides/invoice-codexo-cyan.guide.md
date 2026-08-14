---
{
  "templateGuideSlug": "tpl-invoice-codexo-cyan",
  "slug": "invoice-codexo-cyan",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-icx.mfp-native-generated",
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
        "bill_to_email",
        "bill_to_addr",
        "bill_to_phone",
        "bill_to_city",
        "invoice_no",
        "client_id",
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
        "notes",
        "grand_total",
        "total_due"
      ]
    },
    {
      "step": 2,
      "keys": [
        "step_3",
        "pay_method",
        "bank_name",
        "account_no",
        "swift_code",
        "bank_address",
        "signer_name",
        "designation"
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
    "logo_image",
    "codexo",
    "design_studio",
    "text_1_888_555_0200",
    "hello_codexo_studio",
    "www_codexo_studio",
    "text_456_design_blvd_ny_10001",
    "text_01",
    "client",
    "bill_to_info",
    "text_02",
    "services",
    "line_items",
    "text_03",
    "payment",
    "bank_and_sign",
    "text_04",
    "confirm",
    "review_and_send",
    "invoice",
    "invoice_to",
    "order_id",
    "client_id",
    "date",
    "due_date",
    "invoice_to_2",
    "company_name",
    "email",
    "street_address",
    "phone",
    "city_state",
    "invoice_date",
    "next",
    "description_of_services",
    "subtotal",
    "tax_10",
    "discount_0",
    "total",
    "tax_rate",
    "discount",
    "notes",
    "back",
    "payment_method",
    "bank_name",
    "account_no",
    "swift_code",
    "bank_address",
    "authorised_signature",
    "name",
    "designation",
    "signature",
    "tax",
    "terms_and_conditions",
    "payment_is_due_within_30_days_of_invoice_date_late_p",
    "send_invoice"
  ],
  "colorVars": {
    "--icx-primary": "#0E6EB8",
    "--icx-accent": "#00B4D8",
    "--icx-deco": "#00B4D8",
    "--icx-page": "#F0F5FB",
    "--icx-fill": "#F7FAFD"
  },
  "lockedKeys": [
    "step_1",
    "bill_to_name",
    "bill_to_email",
    "bill_to_addr",
    "bill_to_phone",
    "bill_to_city",
    "invoice_no",
    "client_id",
    "invoice_date",
    "due_date",
    "step_2",
    "items",
    "grand_total",
    "total_due",
    "tax_pct",
    "discount_pct",
    "notes",
    "step_3",
    "pay_method",
    "bank_name",
    "account_no",
    "swift_code",
    "bank_address",
    "signer_name",
    "designation",
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
  "customCssSha256": "37592ae5a72671501375f30e17056b3aa0825cdebe1df3f3b5375f2fecb325aa",
  "shellSha256": "5e586ab709a22f7e392db58f6b4d9bc8d26119e695d9b9d1d31eb13a32fbd0ea"
}
---
# AI Edit Guide — Invoice — Codexo Design Studio

Theme `custom` · root `.mfp.mfp-icx.mfp-native-generated` · 27 fields · 4 steps (premium-native).

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
| bill_to_email | Email | input | 0 |  |
| bill_to_addr | Text | input | 0 |  |
| bill_to_phone | Text | input | 0 |  |
| bill_to_city | Text | input | 0 |  |
| invoice_no | Text | input | 0 |  |
| client_id | Text | input | 0 |  |
| invoice_date | Date | input | 0 |  |
| due_date | Date | input | 0 |  |
| step_2 | Section | input | 1 |  |
| items | DataGrid | input | 1 |  |
| grand_total | Number | input | 1 |  |
| total_due | Number | input | 1 |  |
| tax_pct | Number | input | 1 |  |
| discount_pct | Number | input | 1 |  |
| notes | Textarea | input | 1 |  |
| step_3 | Section | input | 2 |  |
| pay_method | Radio | chips | 2 | 4 |
| bank_name | Text | input | 2 |  |
| account_no | Text | input | 2 |  |
| swift_code | Text | input | 2 |  |
| bank_address | Text | input | 2 |  |
| signer_name | Text | input | 2 |  |
| designation | Text | input | 2 |  |
| step_4 | Section | input | 3 |  |
| terms | Checkbox | choice | 3 | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `codexo`: "CODEXO"
- `design_studio`: "DESIGN STUDIO"
- `text_1_888_555_0200`: "+1 (888) 555-0200"
- `hello_codexo_studio`: "hello@codexo.studio"
- `www_codexo_studio`: "www.codexo.studio"
- `text_456_design_blvd_ny_10001`: "456 Design Blvd, NY 10001"
- `text_01`: "01"
- `client`: "Client"
- `bill_to_info`: "Bill-to info"
- `text_02`: "02"
- `services`: "Services"
- `line_items`: "Line items"
- `text_03`: "03"
- `payment`: "Payment"
- `bank_and_sign`: "Bank & sign"
- `text_04`: "04"
- `confirm`: "Confirm"
- `review_and_send`: "Review & send"
- `invoice`: "INVOICE"
- `invoice_to`: "Invoice To:"
- `order_id`: "Order ID"
- `client_id`: "Client ID"
- `date`: "Date"
- `due_date`: "Due Date"
- `invoice_to_2`: "Invoice To"
- `company_name`: "Company / Name *"
- `email`: "Email"
- `street_address`: "Street Address"
- `phone`: "Phone"
- `city_state`: "City / State"
- `invoice_date`: "Invoice Date"
- `next`: "Next"
- `description_of_services`: "Description of Services"
- `subtotal`: "Subtotal"
- `tax_10`: "Tax (10%)"
- `discount_0`: "Discount (0%)"
- `total`: "Total"
- `tax_rate`: "Tax Rate (%)"
- `discount`: "Discount (%)"
- `notes`: "Notes"
- `back`: "Back"
- `payment_method`: "Payment Method"
- `bank_name`: "Bank Name"
- `account_no`: "Account No."
- `swift_code`: "Swift Code"
- `bank_address`: "Bank Address"
- `authorised_signature`: "Authorised Signature"
- `name`: "Name"
- `designation`: "Designation"
- `signature`: "Signature"
- `tax`: "Tax"
- `terms_and_conditions`: "Terms & Conditions"
- `payment_is_due_within_30_days_of_invoice_date_late_p`: "Payment is due within 30 days of invoice date. Late payments"
- `send_invoice`: "Send Invoice"
- `logo_image`: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="

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
  - `--icx-primary`: #0E6EB8
  - `--icx-accent`: #00B4D8
  - `--icx-deco`: #00B4D8
  - `--icx-page`: #F0F5FB
  - `--icx-fill`: #F7FAFD
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `37592ae5a726…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `37592ae5a7267150…` · customHtml shell sha256 stays `5e586ab709a22f7e…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
