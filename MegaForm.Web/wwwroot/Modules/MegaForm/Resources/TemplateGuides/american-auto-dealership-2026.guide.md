---
{
  "templateGuideSlug": "tpl-american-auto-dealership-2026",
  "slug": "american-auto-dealership-2026",
  "theme": "american-auto-premium",
  "rootSelector": ".mfp.auto-dealership",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [],
  "cardFields": [],
  "contentTokens": [
    "brand_name",
    "brand_tagline",
    "section_vehicles",
    "slider_prev_aria",
    "vehicle_1_badge",
    "vehicle_1_image",
    "vehicle_1_alt",
    "vehicle_1_name",
    "vehicle_1_desc",
    "vehicle_1_price",
    "vehicle_2_badge",
    "vehicle_2_image",
    "vehicle_2_alt",
    "vehicle_2_name",
    "vehicle_2_desc",
    "vehicle_2_price",
    "vehicle_3_badge",
    "vehicle_3_image",
    "vehicle_3_alt",
    "vehicle_3_name",
    "vehicle_3_desc",
    "vehicle_3_price",
    "vehicle_4_badge",
    "vehicle_4_image",
    "vehicle_4_alt",
    "vehicle_4_name",
    "vehicle_4_desc",
    "vehicle_4_price",
    "vehicle_5_badge",
    "vehicle_5_image",
    "vehicle_5_alt",
    "vehicle_5_name",
    "vehicle_5_desc",
    "vehicle_5_price",
    "slider_next_aria",
    "section_contact",
    "footer_note"
  ],
  "colorVars": {
    "--auto-charcoal": "#1a1a1a",
    "--auto-gunmetal": "#2d2d2d",
    "--auto-silver": "#c0c0c0",
    "--auto-chrome": "#e8e8e8",
    "--auto-gold": "#c9a227",
    "--auto-gold-dk": "#a68b1f",
    "--auto-red": "#c41e3a",
    "--auto-navy": "#1e3a5f",
    "--auto-white": "#ffffff",
    "--auto-bg": "#0f0f0f",
    "--auto-card-bg": "#1a1a1a",
    "--auto-text": "#f5f5f5",
    "--auto-text-muted": "#999999",
    "--auto-border": "#333333",
    "--auto-input-bg": "#252525"
  },
  "lockedKeys": [
    "vehicle_carousel",
    "full_name",
    "email",
    "phone",
    "vehicle_interest",
    "preferred_date"
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
  "customCssSha256": "66214d1fb4cf404fef091c6b3a6578f0808679330d9a991fd3b73e709d7d94ff",
  "shellSha256": "f3add39aa406fcb045d524618109dd5dfdf3e041e9e973bfd9f7b8d7c994c3ae"
}
---
# AI Edit Guide — Schedule Your Test Drive

Theme `american-auto-premium` · root `.mfp.auto-dealership` · 6 fields · 1 steps (single).

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
| vehicle_carousel | Html | input | - |  |
| full_name | Text | input | - |  |
| email | Email | input | - |  |
| phone | Phone | input | - |  |
| vehicle_interest | Select | choice | - | 6 |
| preferred_date | Date | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `brand_name`: "LIBERTY MOTORS"
- `brand_tagline`: "Driven by Excellence"
- `section_vehicles`: "Featured Vehicles"
- `section_contact`: "Your Information"
- `footer_note`: "Premium automotive experience since 1965"
- `slider_prev_aria`: "Previous vehicle"
- `slider_next_aria`: "Next vehicle"
- `vehicle_1_badge`: "Best Seller"
- `vehicle_1_name`: "Mustang GT Premium"
- `vehicle_1_desc`: "5.0L V8 | 450 HP | 0-60 in 4.2s"
- `vehicle_1_price`: "From $42,900"
- `vehicle_1_alt`: "Ford Mustang GT"
- `vehicle_1_image`: "https://images.unsplash.com/photo-1584345604476-8ec5f82d718d"
- `vehicle_2_badge`: "New Arrival"
- `vehicle_2_name`: "Corvette Stingray"
- `vehicle_2_desc`: "6.2L V8 | 490 HP | Mid-Engine"
- `vehicle_2_price`: "From $65,900"
- `vehicle_2_alt`: "Chevrolet Corvette"
- `vehicle_2_image`: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w="
- `vehicle_3_badge`: "Limited"
- `vehicle_3_name`: "Challenger Hellcat"
- `vehicle_3_desc`: "6.2L Supercharged | 717 HP"
- `vehicle_3_price`: "From $72,500"
- `vehicle_3_alt`: "Dodge Challenger Hellcat"
- `vehicle_3_image`: "https://images.unsplash.com/photo-1612825173281-9a193378527e"
- `vehicle_4_badge`: "Popular"
- `vehicle_4_name`: "F-150 Raptor"
- `vehicle_4_desc`: "3.5L V6 Twin-Turbo | Off-Road"
- `vehicle_4_price`: "From $57,500"
- `vehicle_4_alt`: "Ford F-150 Raptor"
- `vehicle_4_image`: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf"
- `vehicle_5_badge`: "Exclusive"
- `vehicle_5_name`: "Cadillac CT5-V"
- `vehicle_5_desc`: "3.0L Twin-Turbo | Luxury Sport"
- `vehicle_5_price`: "From $48,900"
- `vehicle_5_alt`: "Cadillac CT5-V"
- `vehicle_5_image`: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8"

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
  - `--auto-charcoal`: #1a1a1a
  - `--auto-gunmetal`: #2d2d2d
  - `--auto-silver`: #c0c0c0
  - `--auto-chrome`: #e8e8e8
  - `--auto-gold`: #c9a227
  - `--auto-gold-dk`: #a68b1f
  - `--auto-red`: #c41e3a
  - `--auto-navy`: #1e3a5f
  - `--auto-white`: #ffffff
  - `--auto-bg`: #0f0f0f
  - `--auto-card-bg`: #1a1a1a
  - `--auto-text`: #f5f5f5
  - `--auto-text-muted`: #999999
  - `--auto-border`: #333333
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `66214d1fb4cf…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `the wizard script`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `66214d1fb4cf404f…` · customHtml shell sha256 stays `f3add39aa406fcb0…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `american-auto-premium`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
