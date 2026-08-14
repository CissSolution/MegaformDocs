---
{
  "templateGuideSlug": "tpl-aurora-style-consultation-2026",
  "slug": "aurora-style-consultation-2026",
  "theme": "aurora-fashion",
  "rootSelector": ".mfp.aur-form",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "consultation_type",
    "newsletter"
  ],
  "cardFields": [],
  "contentTokens": [
    "brand_name",
    "brand_tagline",
    "section_info",
    "section_collection",
    "filter_all",
    "filter_women",
    "filter_men",
    "filter_accessories",
    "p1_cat",
    "p1_badge",
    "p1_image",
    "p1_alt",
    "p1_name",
    "p1_desc",
    "p1_price",
    "p2_cat",
    "p2_badge",
    "p2_image",
    "p2_alt",
    "p2_name",
    "p2_desc",
    "p2_price",
    "p3_cat",
    "p3_badge",
    "p3_image",
    "p3_alt",
    "p3_name",
    "p3_desc",
    "p3_price",
    "p4_cat",
    "p4_image",
    "p4_alt",
    "p4_name",
    "p4_desc",
    "p4_price",
    "p5_cat",
    "p5_badge",
    "p5_image",
    "p5_alt",
    "p5_name",
    "p5_desc",
    "p5_price",
    "p6_cat",
    "p6_image",
    "p6_alt",
    "p6_name",
    "p6_desc",
    "p6_price",
    "p7_cat",
    "p7_badge",
    "p7_image",
    "p7_alt",
    "p7_name",
    "p7_desc",
    "p7_price",
    "p8_cat",
    "p8_image",
    "p8_alt",
    "p8_name",
    "p8_desc",
    "p8_price",
    "section_preferences",
    "footer_note"
  ],
  "colorVars": {
    "--aur-black": "#0a0a0a",
    "--aur-charcoal": "#1a1a1a",
    "--aur-dark": "#2d2d2d",
    "--aur-gray": "#6b6b6b",
    "--aur-light-gray": "#b0b0b0",
    "--aur-border": "#e5dfd5",
    "--aur-cream": "#faf7f2",
    "--aur-ivory": "#f5f0e8",
    "--aur-white": "#ffffff",
    "--aur-gold": "#b8924a",
    "--aur-gold-dk": "#9a7838",
    "--mf-choice-border": "rgba(255,255,255,0.28)",
    "--mf-choice-card": "rgba(255,255,255,0.10)"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "email",
    "phone",
    "city",
    "state",
    "style_preference",
    "budget_range",
    "consultation_type",
    "preferred_date",
    "preferred_time",
    "style_notes",
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
  "customCssSha256": "1af0575be697251a7558b9a4d38a637554f5b3f2d64438deb540fcb9d02537dd",
  "shellSha256": "89686ae1654010c1b6432e77734268e17cd3c6661c2f92fd627d9e6b2d157faa"
}
---
# AI Edit Guide — Style Consultation

Theme `aurora-fashion` · root `.mfp.aur-form` · 13 fields · 1 steps (single).

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
| phone | Phone | input | - |  |
| city | Text | input | - |  |
| state | Select | choice | - | 6 |
| style_preference | Select | choice | - | 5 |
| budget_range | Select | choice | - | 5 |
| consultation_type | Radio | chips | - | 4 |
| preferred_date | Date | input | - |  |
| preferred_time | Select | choice | - | 3 |
| style_notes | Textarea | input | - |  |
| newsletter | Checkbox | chips | - | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `brand_name`: "AURORA"
- `brand_tagline`: "PREMIUM AMERICAN FASHION"
- `section_info`: "Your Information"
- `section_collection`: "Featured Collection"
- `section_preferences`: "Style Preferences"
- `footer_note`: "Complimentary styling for all consultations"
- `filter_all`: "All"
- `filter_women`: "Women"
- `filter_men`: "Men"
- `filter_accessories`: "Accessories"
- `p1_badge`: "New Arrival"
- `p1_name`: "Cashmere Overcoat"
- `p1_desc`: "Italian cashmere, tailored silhouette"
- `p1_price`: "$1,850"
- `p1_alt`: "Cashmere Overcoat"
- `p1_cat`: "women"
- `p1_image`: "https://images.unsplash.com/photo-1548624313-0396c75e4b1a?w="
- `p2_badge`: "Bestseller"
- `p2_name`: "Leather Tote"
- `p2_desc`: "Full-grain leather, handcrafted"
- `p2_price`: "$695"
- `p2_alt`: "Leather Tote"
- `p2_cat`: "accessories"
- `p2_image`: "https://images.unsplash.com/photo-1584917865442-de89df76afd3"
- `p3_badge`: "Limited"
- `p3_name`: "Silk Blazer"
- `p3_desc`: "Raw silk blend, modern cut"
- `p3_price`: "$1,295"
- `p3_alt`: "Silk Blazer"
- `p3_cat`: "women"
- `p3_image`: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea"
- `p4_badge`: ""
- `p4_name`: "Merino Sweater"
- `p4_desc`: "100% merino wool, relaxed fit"
- `p4_price`: "$485"
- `p4_alt`: "Merino Sweater"
- `p4_cat`: "men"
- `p4_image`: "https://images.unsplash.com/photo-1620012253295-c15cc3e65df4"
- `p5_badge`: "Exclusive"
- `p5_name`: "Designer Watch"
- `p5_desc`: "Swiss movement, sapphire crystal"
- `p5_price`: "$2,450"
- `p5_alt`: "Designer Watch"
- `p5_cat`: "accessories"
- `p5_image`: "https://images.unsplash.com/photo-1523275335684-37898b6baf30"
- `p6_badge`: ""
- `p6_name`: "Wool Suit"
- `p6_desc`: "Super 150s wool, bespoke tailoring"
- `p6_price`: "$2,195"
- `p6_alt`: "Wool Suit"
- `p6_cat`: "men"
- `p6_image`: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35"
- `p7_badge`: "New"
- `p7_name`: "Evening Gown"
- `p7_desc`: "Flowing silk, timeless elegance"
- `p7_price`: "$1,650"
- `p7_alt`: "Evening Gown"
- `p7_cat`: "women"
- `p7_image`: "https://images.unsplash.com/photo-1566174053879-31528523f8ae"
- `p8_badge`: ""
- `p8_name`: "Leather Belt"
- `p8_desc`: "Premium leather, polished buckle"
- `p8_price`: "$295"
- `p8_alt`: "Leather Belt"
- `p8_cat`: "accessories"
- `p8_image`: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w="

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: consultation_type, newsletter): `{op:"set_field_property", key:"consultation_type", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--aur-black`: #0a0a0a
  - `--aur-charcoal`: #1a1a1a
  - `--aur-dark`: #2d2d2d
  - `--aur-gray`: #6b6b6b
  - `--aur-light-gray`: #b0b0b0
  - `--aur-border`: #e5dfd5
  - `--aur-cream`: #faf7f2
  - `--aur-ivory`: #f5f0e8
  - `--aur-white`: #ffffff
  - `--aur-gold`: #b8924a
  - `--aur-gold-dk`: #9a7838
  - `--mf-choice-border`: rgba(255,255,255,0.28)
  - `--mf-choice-card`: rgba(255,255,255,0.10)
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `1af0575be697…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `theme_selector`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `1af0575be697251a…` · customHtml shell sha256 stays `89686ae1654010c1…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `aurora-fashion`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
