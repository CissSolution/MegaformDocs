---
{
  "templateGuideSlug": "tpl-lagoon-reserve-booking",
  "slug": "lagoon-reserve-booking",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-lgn.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [],
  "chipFields": [
    "interests"
  ],
  "cardFields": [
    "room_type"
  ],
  "contentTokens": [
    "hero_image",
    "text_4_9_2_457_reviews",
    "convenience_and_luxury",
    "reserve_your_perfect_stay",
    "guest_details",
    "first_name",
    "last_name",
    "email",
    "phone",
    "year_of_birth",
    "country",
    "stay_details",
    "check_in_date",
    "check_out_date",
    "number_of_guests",
    "preferred_start_month",
    "choose_your_room",
    "preferred_amenities",
    "programme_and_language",
    "programme_track",
    "duration",
    "language_level",
    "special_requests",
    "notes_for_the_concierge_optional",
    "confirm_reservation",
    "booking_summary",
    "no_room_selected_yet",
    "room_popularity",
    "standard_room",
    "text_82",
    "family_suite",
    "text_75",
    "royal_suite",
    "text_68",
    "positive_reviews",
    "text_92",
    "included",
    "wi_fi",
    "dining",
    "spa",
    "parking",
    "butler",
    "turndown"
  ],
  "colorVars": {
    "--lgn-primary": "#C8962C",
    "--lgn-accent": "#6B1E2E",
    "--lgn-deco": "#F0D898",
    "--lgn-page": "#FDF8F0",
    "--lgn-fill": "#FDF8F0"
  },
  "lockedKeys": [
    "first_name",
    "last_name",
    "email",
    "phone",
    "birth_year",
    "country",
    "check_in",
    "check_out",
    "guests",
    "start_month",
    "room_type",
    "interests",
    "programme",
    "duration",
    "language_level",
    "requests",
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
  "customCssSha256": "39096a8d1c2a76d8e4df48a808a8fe032b7701388118510a07f52fee75e46ed0",
  "shellSha256": "dedb28c60dc419373abfb7f3410667133657ddb42a0b169eb2799c58b417eed9"
}
---
# AI Edit Guide — Reserve Your Perfect Stay

Theme `custom` · root `.mfp.mfp-lgn.mfp-native-generated` · 18 fields · 1 steps (single).

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
| birth_year | Text | input | - |  |
| country | Select | choice | - | 11 |
| check_in | Date | input | - |  |
| check_out | Date | input | - |  |
| guests | Select | choice | - | 6 |
| start_month | Select | choice | - | 12 |
| room_type | Radio | cards | - | 3 |
| interests | Checkbox | chips | - | 6 |
| programme | Select | choice | - | 3 |
| duration | Select | choice | - | 4 |
| language_level | Select | choice | - | 6 |
| requests | Textarea | input | - |  |
| newsletter | Checkbox | choice | - | 1 |
| terms | Checkbox | choice | - | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `text_4_9_2_457_reviews`: "4.9 · 2,457 reviews"
- `convenience_and_luxury`: "Convenience & Luxury"
- `reserve_your_perfect_stay`: "Reserve Your Perfect Stay"
- `guest_details`: "Guest Details"
- `first_name`: "First name *"
- `last_name`: "Last name *"
- `email`: "Email *"
- `phone`: "Phone"
- `year_of_birth`: "Year of birth"
- `country`: "Country *"
- `stay_details`: "Stay Details"
- `check_in_date`: "Check-in date *"
- `check_out_date`: "Check-out date *"
- `number_of_guests`: "Number of guests"
- `preferred_start_month`: "Preferred start month"
- `choose_your_room`: "Choose Your Room"
- `preferred_amenities`: "Preferred Amenities"
- `programme_and_language`: "Programme & Language"
- `programme_track`: "Programme track"
- `duration`: "Duration"
- `language_level`: "Language level"
- `special_requests`: "Special Requests"
- `notes_for_the_concierge_optional`: "Notes for the concierge (optional)"
- `confirm_reservation`: "Confirm Reservation"
- `booking_summary`: "Booking Summary"
- `no_room_selected_yet`: "No room selected yet"
- `room_popularity`: "Room Popularity"
- `standard_room`: "Standard Room"
- `text_82`: "82%"
- `family_suite`: "Family Suite"
- `text_75`: "75%"
- `royal_suite`: "Royal Suite"
- `text_68`: "68%"
- `positive_reviews`: "Positive Reviews"
- `text_92`: "92%"
- `included`: "Included"
- `wi_fi`: "Wi-Fi"
- `dining`: "Dining"
- `spa`: "Spa"
- `parking`: "Parking"
- `butler`: "Butler"
- `turndown`: "Turndown"
- `hero_image`: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: interests): `{op:"set_field_property", key:"interests", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: room_type): `{op:"set_field_property", key:"room_type", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:0, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `panel` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--lgn-primary`: #C8962C
  - `--lgn-accent`: #6B1E2E
  - `--lgn-deco`: #F0D898
  - `--lgn-page`: #FDF8F0
  - `--lgn-fill`: #FDF8F0
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `39096a8d1c2a…`).
- **C4/C5 Add/Remove step** (ADVANCED — single): steps are `panel` blocks in customHtml driven by `booking_summary`. Clone an existing `panel` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `39096a8d1c2a76d8…` · customHtml shell sha256 stays `dedb28c60dc41937…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
