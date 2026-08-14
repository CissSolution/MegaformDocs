---
{
  "templateGuideSlug": "tpl-gold-suite-membership-application",
  "slug": "gold-suite-membership-application",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-gsu.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "interests"
  ],
  "cardFields": [
    "tier"
  ],
  "contentTokens": [
    "hero_image",
    "exclusive_membership",
    "gold_suite",
    "membership",
    "join_an_elite_circle_of_members_with_unrivalled_acce",
    "text_92",
    "text_4_218_reviews",
    "text_47",
    "countries",
    "text_3_200",
    "per_year",
    "choose_your_tier",
    "member_details",
    "first_name",
    "last_name",
    "email_address",
    "phone",
    "year_of_birth",
    "country",
    "stay_and_preferences",
    "number_of_guests",
    "preferred_start",
    "programme_track",
    "language_level",
    "special_occasion",
    "preferred_experiences",
    "why_join_gold_suite_optional",
    "apply_for_membership",
    "our_membership_team_reviews_all_applications_within"
  ],
  "colorVars": {
    "--gsu-primary": "#B8860B",
    "--gsu-accent": "#D4A520",
    "--gsu-deco": "#F5E6B8",
    "--gsu-page": "#FFFBF2",
    "--gsu-fill": "#FFFBF2"
  },
  "lockedKeys": [
    "tier",
    "first_name",
    "last_name",
    "email",
    "phone",
    "birth_year",
    "country",
    "guests",
    "start_month",
    "programme",
    "language_level",
    "occasion",
    "interests",
    "motivation",
    "newsletter",
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
  "customCssSha256": "6bb43d1b94f6fd913310def85b15d92e118491125bb714a1dd6a8ec6e0378d93",
  "shellSha256": "a6594f69a9807ee905b287803dcd6ccde961a46add498e343ae49461332a6aca"
}
---
# AI Edit Guide — Gold Suite — Membership Application

Theme `custom` · root `.mfp.mfp-gsu.mfp-native-generated` · 16 fields · 1 steps (single).

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
| tier | Radio | cards | - | 3 |
| first_name | Text | input | - |  |
| last_name | Text | input | - |  |
| email | Email | input | - |  |
| phone | Text | input | - |  |
| birth_year | Text | input | - |  |
| country | Select | choice | - | 10 |
| guests | Select | choice | - | 6 |
| start_month | Select | choice | - | 12 |
| programme | Select | choice | - | 3 |
| language_level | Select | choice | - | 6 |
| occasion | Text | input | - |  |
| interests | Checkbox | chips | - | 8 |
| motivation | Textarea | input | - |  |
| newsletter | Checkbox | choice | - | 1 |
| terms | Checkbox | choice | - | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `exclusive_membership`: "Exclusive Membership"
- `gold_suite`: "Gold Suite"
- `membership`: "Membership"
- `join_an_elite_circle_of_members_with_unrivalled_acce`: "Join an elite circle of members with unrivalled access to th"
- `text_92`: "92%"
- `text_4_218_reviews`: "4,218 reviews"
- `text_47`: "47"
- `countries`: "Countries"
- `text_3_200`: "$3,200"
- `per_year`: "Per year"
- `choose_your_tier`: "Choose Your Tier"
- `member_details`: "Member Details"
- `first_name`: "First name *"
- `last_name`: "Last name *"
- `email_address`: "Email address *"
- `phone`: "Phone"
- `year_of_birth`: "Year of birth"
- `country`: "Country *"
- `stay_and_preferences`: "Stay & Preferences"
- `number_of_guests`: "Number of guests"
- `preferred_start`: "Preferred start"
- `programme_track`: "Programme track"
- `language_level`: "Language level"
- `special_occasion`: "Special occasion"
- `preferred_experiences`: "Preferred Experiences"
- `why_join_gold_suite_optional`: "Why join Gold Suite? (optional)"
- `apply_for_membership`: "Apply for Membership"
- `our_membership_team_reviews_all_applications_within`: "Our membership team reviews all applications within 24 hours"
- `hero_image`: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: interests): `{op:"set_field_property", key:"interests", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: tier): `{op:"set_field_property", key:"tier", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--gsu-primary`: #B8860B
  - `--gsu-accent`: #D4A520
  - `--gsu-deco`: #F5E6B8
  - `--gsu-page`: #FFFBF2
  - `--gsu-fill`: #FFFBF2
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `6bb43d1b94f6…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `the wizard script`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `6bb43d1b94f6fd91…` · customHtml shell sha256 stays `a6594f69a9807ee9…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
