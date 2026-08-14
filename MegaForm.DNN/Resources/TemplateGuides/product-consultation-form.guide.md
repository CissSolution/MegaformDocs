---
{
  "templateGuideSlug": "tpl-product-consultation-form",
  "slug": "product-consultation-form",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-product-consultation",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "product_interest",
    "contact_method",
    "newsletter"
  ],
  "cardFields": [],
  "contentTokens": [
    "brand_title",
    "brand_subtitle",
    "section_contact",
    "section_products",
    "slider_prev_aria",
    "product_1_image",
    "product_1_name",
    "product_1_badge",
    "product_1_price",
    "product_2_image",
    "product_2_name",
    "product_2_badge",
    "product_2_price",
    "product_3_image",
    "product_3_name",
    "product_3_price",
    "product_4_image",
    "product_4_name",
    "product_4_price",
    "product_5_image",
    "product_5_name",
    "product_5_price",
    "slider_next_aria",
    "section_preferences",
    "footer_note"
  ],
  "colorVars": {
    "--pc-primary": "#0066ff",
    "--pc-primary-dark": "#0052cc",
    "--pc-primary-light": "#e6f0ff",
    "--pc-accent": "#00c853",
    "--pc-secondary": "#ff6b35",
    "--pc-bg": "#f0f4f8",
    "--pc-card": "#ffffff",
    "--pc-text": "#1a2b3c",
    "--pc-text-muted": "#5a6a7a",
    "--pc-border": "#e2e8f0",
    "--mf-choice-border": "rgba(255,255,255,0.28)",
    "--mf-choice-card": "rgba(255,255,255,0.10)"
  },
  "lockedKeys": [
    "full_name",
    "phone",
    "email",
    "city",
    "product_interest",
    "budget",
    "contact_time",
    "contact_method",
    "message",
    "newsletter"
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
  "customCssSha256": "411a506f20d16b8b42d396e50098b5053cf87c55cdc9ec2186c553a804f4c2fe",
  "shellSha256": "3a2ef1bc308bb65dec173f1a57be40b340a58cf8dcc6cf9720a3222f0c9344f1"
}
---
# AI Edit Guide — Product Consultation

Theme `custom` · root `.mfp.mfp-product-consultation` · 10 fields · 1 steps (single).

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
| phone | Phone | input | - |  |
| email | Email | input | - |  |
| city | Select | choice | - | 6 |
| product_interest | Checkbox | chips | - | 5 |
| budget | Select | choice | - | 4 |
| contact_time | Select | choice | - | 4 |
| contact_method | Radio | chips | - | 4 |
| message | Textarea | input | - |  |
| newsletter | Checkbox | chips | - | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `brand_title`: "Premium Store"
- `brand_subtitle`: "High-Quality Products"
- `section_contact`: "Contact Information"
- `section_products`: "Products of Interest"
- `section_preferences`: "Consultation Preferences"
- `footer_note`: "Your information is protected under our privacy policy."
- `product_1_name`: "iPhone 16 Pro Max"
- `product_1_price`: "34,990,000₫"
- `product_1_image`: "https://images.unsplash.com/photo-1592750475338-74b7b21085ab"
- `product_1_badge`: "Hot"
- `product_2_name`: "MacBook Pro M4"
- `product_2_price`: "52,990,000₫"
- `product_2_image`: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8"
- `product_2_badge`: "New"
- `product_3_name`: "Apple Watch Ultra 3"
- `product_3_price`: "21,990,000₫"
- `product_3_image`: "https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d"
- `product_4_name`: "AirPods Pro 3"
- `product_4_price`: "6,990,000₫"
- `product_4_image`: "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434"
- `product_5_name`: "iPad Pro M4"
- `product_5_price`: "28,990,000₫"
- `product_5_image`: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?au"
- `slider_prev_aria`: "Previous products"
- `slider_next_aria`: "Next products"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: product_interest, contact_method, newsletter): `{op:"set_field_property", key:"product_interest", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--pc-primary`: #0066ff
  - `--pc-primary-dark`: #0052cc
  - `--pc-primary-light`: #e6f0ff
  - `--pc-accent`: #00c853
  - `--pc-secondary`: #ff6b35
  - `--pc-bg`: #f0f4f8
  - `--pc-card`: #ffffff
  - `--pc-text`: #1a2b3c
  - `--pc-text-muted`: #5a6a7a
  - `--pc-border`: #e2e8f0
  - `--mf-choice-border`: rgba(255,255,255,0.28)
  - `--mf-choice-card`: rgba(255,255,255,0.10)
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `411a506f20d1…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `product_slider`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `411a506f20d16b8b…` · customHtml shell sha256 stays `3a2ef1bc308bb65d…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
