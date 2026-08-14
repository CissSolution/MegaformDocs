---
{
  "templateGuideSlug": "tpl-rose-wellness-registration",
  "slug": "rose-wellness-registration",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-rws.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "programme"
  ],
  "cardFields": [],
  "contentTokens": [
    "hero_image",
    "euroyouth_2026",
    "shape_your",
    "future",
    "in_europe",
    "join_a_community_of_young_leaders_explorers_and_chan",
    "text_12k",
    "members",
    "text_98",
    "satisfaction",
    "text_40",
    "countries",
    "our_team",
    "am",
    "aria_morel",
    "programme_director",
    "js",
    "jonas_steyn",
    "community_lead",
    "lk",
    "lena_kovacs",
    "youth_coordinator",
    "registration_2026",
    "apply_now",
    "fill_in_the_7_fields_below_and_well_match_you_with_t",
    "first_name",
    "last_name",
    "email_address",
    "phone",
    "country",
    "programme",
    "why_do_you_want_to_join",
    "text_0_of_7_fields_complete",
    "text_0",
    "submit_application",
    "by_submitting_you_agree_to_our",
    "privacy_policy",
    "and_terms"
  ],
  "colorVars": {
    "--rws-primary": "#C2185B",
    "--rws-accent": "#880E4F",
    "--rws-deco": "#F48FB1",
    "--rws-page": "#FFF8F5",
    "--rws-fill": "#FFF8F5"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "email",
    "phone",
    "country",
    "programme",
    "motivation"
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
  "customCssSha256": "8bb9b4e190b98fd2fd6f3bae5fe7767c3cb823ab75adc929c3b1a29927d16766",
  "shellSha256": "96d10a9594fd25b563e02a4671e4eff7dc85226456c9a52fa4b929852c75d217"
}
---
# AI Edit Guide — EuroYouth 2026 — Registration

Theme `custom` · root `.mfp.mfp-rws.mfp-native-generated` · 7 fields · 1 steps (single).

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
| country | Select | choice | - | 14 |
| programme | Radio | chips | - | 5 |
| motivation | Textarea | input | - |  |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `euroyouth_2026`: "EuroYouth 2026"
- `shape_your`: "Shape your"
- `future`: "future"
- `in_europe`: "in Europe."
- `join_a_community_of_young_leaders_explorers_and_chan`: "Join a community of young leaders, explorers and changemaker"
- `text_12k`: "12K+"
- `members`: "Members"
- `text_98`: "98%"
- `satisfaction`: "Satisfaction"
- `text_40`: "40+"
- `countries`: "Countries"
- `our_team`: "Our Team"
- `am`: "AM"
- `aria_morel`: "Aria Morel"
- `programme_director`: "Programme Director"
- `js`: "JS"
- `jonas_steyn`: "Jonas Steyn"
- `community_lead`: "Community Lead"
- `lk`: "LK"
- `lena_kovacs`: "Lena Kovacs"
- `youth_coordinator`: "Youth Coordinator"
- `registration_2026`: "Registration 2026"
- `apply_now`: "Apply now"
- `fill_in_the_7_fields_below_and_well_match_you_with_t`: "Fill in the 7 fields below and we'll match you with the perf"
- `first_name`: "First name"
- `last_name`: "Last name"
- `email_address`: "Email address"
- `phone`: "Phone"
- `country`: "Country"
- `programme`: "Programme"
- `why_do_you_want_to_join`: "Why do you want to join?"
- `text_0_of_7_fields_complete`: "0 of 7 fields complete"
- `text_0`: "0%"
- `submit_application`: "Submit Application"
- `by_submitting_you_agree_to_our`: "By submitting you agree to our"
- `privacy_policy`: "Privacy Policy"
- `and_terms`: "& Terms."
- `hero_image`: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: programme): `{op:"set_field_property", key:"programme", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--rws-primary`: #C2185B
  - `--rws-accent`: #880E4F
  - `--rws-deco`: #F48FB1
  - `--rws-page`: #FFF8F5
  - `--rws-fill`: #FFF8F5
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `8bb9b4e190b9…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `progress`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `8bb9b4e190b98fd2…` · customHtml shell sha256 stays `96d10a9594fd25b5…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
