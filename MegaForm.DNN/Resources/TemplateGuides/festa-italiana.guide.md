---
{
  "templateGuideSlug": "tpl-festa-italiana",
  "slug": "festa-italiana",
  "theme": "festa-italiana-premium",
  "rootSelector": ".mfp.mfp-festa-italiana.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "premium-native",
  "stepAnchor": "data-step",
  "stepCount": 3,
  "stepFieldKeys": [
    {
      "step": 0,
      "keys": [
        "first_name",
        "last_name",
        "email",
        "phone",
        "city"
      ]
    },
    {
      "step": 1,
      "keys": [
        "pass",
        "guests",
        "wine_pairing",
        "dietary"
      ]
    },
    {
      "step": 2,
      "keys": [
        "arrival",
        "notes",
        "terms",
        "newsletter"
      ]
    }
  ],
  "chipFields": [
    "pass",
    "dietary",
    "newsletter"
  ],
  "cardFields": [],
  "contentTokens": [
    "hero_image"
  ],
  "colorVars": {
    "--fi-ink": "#3a2a1a",
    "--fi-green": "#1a7a4c",
    "--fi-cream": "#f4f1ea",
    "--fi-red": "#b5322e",
    "--fi-bg": "#f6f1e7",
    "--fi-body": "#fbf8f1",
    "--fi-muted": "#7a6a55",
    "--fi-soft": "#b3a387",
    "--fi-line": "#d8cab0",
    "--fi-card-line": "#e3d8c2",
    "--fi-gold": "#d4af6a"
  },
  "lockedKeys": [
    "premium_step_1",
    "first_name",
    "last_name",
    "email",
    "phone",
    "city",
    "premium_step_2",
    "pass",
    "guests",
    "wine_pairing",
    "dietary",
    "premium_step_3",
    "arrival",
    "notes",
    "terms",
    "newsletter"
  ],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "Benvenuti alla",
    "Festa Italiana",
    "Una serata di vino, musica e tradizione · 14 Settembre",
    "L'Ospite",
    "The Guest",
    "II",
    "L'Esperienza",
    "The Experience",
    "III",
    "La Conferma",
    "Confirmation",
    "Raccontaci di te",
    "Nome",
    "First name",
    "Cognome",
    "Last name",
    "Email",
    "Indirizzo email",
    "Telefono",
    "Phone",
    "Città",
    "City",
    "Scegli la tua esperienza",
    "Pass",
    "Choose your pass",
    "Numero di ospiti",
    "Number of guests",
    "Abbinamento vini",
    "Wine pairing",
    "Preferenze alimentari",
    "Dietary preferences",
    "Ultimi dettagli",
    "Riepilogo",
    "Ospite",
    "Ospiti",
    "Dieta",
    "Orario di arrivo",
    "Arrival time",
    "Note speciali",
    "Special notes",
    "Termini",
    "Terms",
    "Newsletter",
    "&larr; Indietro",
    "Continua &rarr;",
    "Conferma Iscrizione",
    "Festa Italiana · Piazza del Sole · info@festaitaliana.it"
  ],
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
  "customCssSha256": "f00e3a4f3c37aad6d2fad225c9d8e92d7454bc4439e8853854891fe1ed94ae3b",
  "shellSha256": "86104a511e7d238ead9cbb246081ed57a667abbaac601a7d4c71ff88e183113c"
}
---
# AI Edit Guide — Festa Italiana

Theme `festa-italiana-premium` · root `.mfp.mfp-festa-italiana.mfp-native-generated` · 16 fields · 3 steps (premium-native).

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
| premium_step_1 | Section | input | - |  |
| first_name | Text | input | 0 |  |
| last_name | Text | input | 0 |  |
| email | Email | input | 0 |  |
| phone | Phone | input | 0 |  |
| city | Text | input | 0 |  |
| premium_step_2 | Section | input | - |  |
| pass | Radio | chips | 1 | 3 |
| guests | Select | choice | 1 | 6 |
| wine_pairing | Select | choice | 1 | 4 |
| dietary | Checkbox | chips | 1 | 5 |
| premium_step_3 | Section | input | - |  |
| arrival | Select | choice | 2 | 3 |
| notes | Textarea | input | 2 |  |
| terms | Checkbox | choice | 2 | 1 |
| newsletter | Checkbox | chips | 2 | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `hero_image`: "/Modules/MegaForm/img/festa-italiana/festa-italiana-hero.png"
- `texture_image`: "/Modules/MegaForm/img/festa-italiana/festa-italiana-texture."
- `footer_note`: "Festa Italiana · Piazza del Sole · info@festaitaliana.it"

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
- "Benvenuti alla"
- "Festa Italiana"
- "Una serata di vino, musica e tradizione · 14 Settembre"
- "L'Ospite"
- "The Guest"
- "II"
- "L'Esperienza"
- "The Experience"
- "III"
- "La Conferma"
- "Confirmation"
- "Raccontaci di te"
- "Nome"
- "First name"
- "Cognome"
- "Last name"
- "Email"
- "Indirizzo email"
- "Telefono"
- "Phone"
- "Città"
- "City"
- "Scegli la tua esperienza"
- "Pass"
- "Choose your pass"
- "Numero di ospiti"
- "Number of guests"
- "Abbinamento vini"

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: pass, dietary, newsletter): `{op:"set_field_property", key:"pass", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: none): `{op:"set_field_property", key:"<cardFieldKey>", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:2, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--fi-ink`: #3a2a1a
  - `--fi-green`: #1a7a4c
  - `--fi-cream`: #f4f1ea
  - `--fi-red`: #b5322e
  - `--fi-bg`: #f6f1e7
  - `--fi-body`: #fbf8f1
  - `--fi-muted`: #7a6a55
  - `--fi-soft`: #b3a387
  - `--fi-line`: #d8cab0
  - `--fi-card-line`: #e3d8c2
  - `--fi-gold`: #d4af6a
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `f00e3a4f3c37…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `f00e3a4f3c37aad6…` · customHtml shell sha256 stays `86104a511e7d238e…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `festa-italiana-premium`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
