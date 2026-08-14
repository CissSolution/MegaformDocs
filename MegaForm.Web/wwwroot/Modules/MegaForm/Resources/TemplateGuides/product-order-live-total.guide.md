---
{
  "templateGuideSlug": "tpl-product-order-live-total",
  "slug": "product-order-live-total",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-pdo.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [],
  "cardFields": [],
  "contentTokens": [
    "create_order",
    "fill_in_your_details_and_select_products_to_order",
    "personal_information",
    "shipping_address",
    "order_items",
    "add_item",
    "place_order",
    "order_summary",
    "product_x1",
    "text_0_00",
    "subtotal",
    "tax_10",
    "total"
  ],
  "colorVars": {
    "--pdo-primary": "#EC003F",
    "--pdo-accent": "#EC003F",
    "--pdo-deco": "#EC003F",
    "--pdo-page": "#F8FAFC",
    "--pdo-fill": "#F8FAFC"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "email",
    "phone",
    "company",
    "address",
    "city",
    "state",
    "zip",
    "country",
    "item_product",
    "item_qty"
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
  "customCssSha256": "c704448298662612b5f1132faa4418c8a06893cc9a69a0da5222d4ca01f04617",
  "shellSha256": "766590a8e5b49234ffef4d348684b45bccbc81d561f6d3b902846eb273fba14b"
}
---
# AI Edit Guide — Create Order

Theme `custom` · root `.mfp.mfp-pdo.mfp-native-generated` · 12 fields · 1 steps (single).

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
| phone | Text | input | - |  |
| company | Text | input | - |  |
| address | Text | input | - |  |
| city | Text | input | - |  |
| state | Text | input | - |  |
| zip | Text | input | - |  |
| country | Select | choice | - | 3 |
| item_product | Select | choice | - | 3 |
| item_qty | Number | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `create_order`: "Create Order"
- `fill_in_your_details_and_select_products_to_order`: "Fill in your details and select products to order"
- `personal_information`: "Personal Information"
- `shipping_address`: "Shipping Address"
- `order_items`: "Order Items"
- `add_item`: "Add Item"
- `place_order`: "Place Order"
- `order_summary`: "Order Summary"
- `product_x1`: "Product x1"
- `text_0_00`: "$0.00"
- `subtotal`: "Subtotal"
- `tax_10`: "Tax (10%)"
- `total`: "Total"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: none): `{op:"set_field_property", key:"<chipFieldKey>", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--pdo-primary`: #EC003F
  - `--pdo-accent`: #EC003F
  - `--pdo-deco`: #EC003F
  - `--pdo-page`: #F8FAFC
  - `--pdo-fill`: #F8FAFC
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `c70444829866…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `order_total`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `c704448298662612…` · customHtml shell sha256 stays `766590a8e5b49234…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
