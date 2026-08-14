---
{
  "templateGuideSlug": "tpl-festa-italiana",
  "slug": "festa-italiana",
  "theme": "custom",
  "rootSelector": ".mfp.mfp-fes.mfp-native-generated",
  "tokenStyle": "double",
  "stepMechanism": "premium-native",
  "stepAnchor": "data-step",
  "stepCount": 3,
  "stepFieldKeys": [
    {
      "step": 0,
      "keys": [
        "step_1",
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
        "step_2",
        "pass",
        "guests",
        "wine_pairing",
        "dietary"
      ]
    },
    {
      "step": 2,
      "keys": [
        "step_3",
        "arrival",
        "notes",
        "terms",
        "newsletter"
      ]
    }
  ],
  "chipFields": [
    "dietary"
  ],
  "cardFields": [
    "pass"
  ],
  "contentTokens": [
    "hero_image",
    "benvenuti_alla",
    "festa_italiana",
    "una_serata_di_vino_musica_e_tradizione_14_settembre",
    "i",
    "lospite",
    "the_guest",
    "ii",
    "lesperienza",
    "the_experience",
    "iii",
    "la_conferma",
    "confirmation",
    "raccontaci_di_te",
    "nome",
    "first_name",
    "cognome",
    "last_name",
    "email",
    "indirizzo_email",
    "telefono",
    "phone",
    "citta",
    "city",
    "indietro",
    "continua",
    "scegli_la_tua_esperienza",
    "numero_di_ospiti",
    "number_of_guests",
    "abbinamento_vini",
    "wine_pairing",
    "preferenze_alimentari",
    "dietary_preferences",
    "ultimi_dettagli",
    "orario_di_arrivo",
    "arrival_time",
    "note_speciali",
    "special_notes",
    "riepilogo",
    "ospite",
    "pass",
    "ospiti",
    "dieta",
    "conferma_iscrizione",
    "festa_italiana_piazza_del_sole_info_festaitaliana_it"
  ],
  "colorVars": {
    "--fes-primary": "#b5322e",
    "--fes-accent": "#1a7a4c",
    "--fes-deco": "#d4af6a",
    "--fes-page": "#f6f1e7",
    "--fes-fill": "#f6f1e7"
  },
  "lockedKeys": [
    "step_1",
    "first_name",
    "last_name",
    "email",
    "phone",
    "city",
    "step_2",
    "pass",
    "guests",
    "wine_pairing",
    "dietary",
    "step_3",
    "arrival",
    "notes",
    "terms",
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
  "customCssSha256": "ef7e3e4152cdbb1347063dfa0852d2926a8d5e23df4ffb117481ac3a6c2ee797",
  "shellSha256": "d8b8579d4be1bc954010a58e16cd89217d44443a0b6ade873c78d8d72e5af157"
}
---
# AI Edit Guide — Festa Italiana — Iscrizione

Theme `custom` · root `.mfp.mfp-fes.mfp-native-generated` · 16 fields · 3 steps (premium-native).

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
| first_name | Text | input | 0 |  |
| last_name | Text | input | 0 |  |
| email | Email | input | 0 |  |
| phone | Text | input | 0 |  |
| city | Text | input | 0 |  |
| step_2 | Section | input | 1 |  |
| pass | Radio | cards | 1 | 3 |
| guests | Select | choice | 1 | 6 |
| wine_pairing | Select | choice | 1 | 4 |
| dietary | Checkbox | chips | 1 | 5 |
| step_3 | Section | input | 2 |  |
| arrival | Select | choice | 2 | 3 |
| notes | Textarea | input | 2 |  |
| terms | Checkbox | choice | 2 | 1 |
| newsletter | Checkbox | choice | 2 | 1 |

## Content tokens ({{content:*}} — editable text shown in the shell)
- `benvenuti_alla`: "Benvenuti alla"
- `festa_italiana`: "Festa Italiana"
- `una_serata_di_vino_musica_e_tradizione_14_settembre`: "Una serata di vino, musica e tradizione · 14 Settembre"
- `i`: "I"
- `lospite`: "L'Ospite"
- `the_guest`: "The Guest"
- `ii`: "II"
- `lesperienza`: "L'Esperienza"
- `the_experience`: "The Experience"
- `iii`: "III"
- `la_conferma`: "La Conferma"
- `confirmation`: "Confirmation"
- `raccontaci_di_te`: "Raccontaci di te"
- `nome`: "Nome"
- `first_name`: "First name"
- `cognome`: "Cognome"
- `last_name`: "Last name"
- `email`: "Email"
- `indirizzo_email`: "Indirizzo email"
- `telefono`: "Telefono"
- `phone`: "Phone"
- `citta`: "Città"
- `city`: "City"
- `indietro`: "← Indietro"
- `continua`: "Continua →"
- `scegli_la_tua_esperienza`: "Scegli la tua esperienza"
- `numero_di_ospiti`: "Numero di ospiti"
- `number_of_guests`: "Number of guests"
- `abbinamento_vini`: "Abbinamento vini"
- `wine_pairing`: "Wine pairing"
- `preferenze_alimentari`: "Preferenze alimentari"
- `dietary_preferences`: "Dietary preferences"
- `ultimi_dettagli`: "Ultimi dettagli"
- `orario_di_arrivo`: "Orario di arrivo"
- `arrival_time`: "Arrival time"
- `note_speciali`: "Note speciali"
- `special_notes`: "Special notes"
- `riepilogo`: "Riepilogo"
- `ospite`: "Ospite"
- `pass`: "Pass"
- `ospiti`: "Ospiti"
- `dieta`: "Dieta"
- `conferma_iscrizione`: "Conferma Iscrizione"
- `festa_italiana_piazza_del_sole_info_festaitaliana_it`: "Festa Italiana · Piazza del Sole · info@festaitaliana.it"
- `hero_image`: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
_(none)_

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title `{op:"set_form_meta", title:"New title", designDecision:"preserve"}`; a field's editable label `{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}`; a {{content:*}} token `{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}`; **a hardcoded shell heading/caption** `{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: dietary): `{op:"set_field_property", key:"dietary", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}`. Keep the field's `optionDisplay:"chips"` — set ONLY options. The chip look (`.mf-option-group--chips`) is in customCss and stays.
- **C7 Edit CARD options** (fields: pass): `{op:"set_field_property", key:"pass", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}`. Keep `optionDisplay:"cards"`. Card chrome (`.mf-option-group--cards`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an `icon`, keep it byte-for-byte; if it has none, OMIT the `icon` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY `label`/`meta`/`description`/`value`.
- **C2 Add field**: `{op:"add_field", type:"Text", key:"new_key", label:"…", step:2, designDecision:"preserve"}` — the dispatcher inserts `{{field:new_key}}` into the matching `data-step` block. Pick a snake_case key not already used.
- **C3 Remove field**: `{op:"remove_field", key:"<key>", designDecision:"preserve"}` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: `{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic `--primary`/`--accent` are INERT here). Available colour vars (current value):
  - `--fes-primary`: #b5322e
  - `--fes-accent`: #1a7a4c
  - `--fes-deco`: #d4af6a
  - `--fes-page`: #f6f1e7
  - `--fes-fill`: #f6f1e7
  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 `ef7e3e4152cd…`).
- **C4/C5 Add/Remove step** (ADVANCED — premium-native): steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `data-step` panels in customHtml. There is NO wizard script. To ADD a step: append a new `data-step` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields. Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays `ef7e3e4152cdbb13…` · customHtml shell sha256 stays `d8b8579d4be1bc95…` (unless C2/C4 legitimately add a node).
- `settings.theme` stays `custom`. Every field keeps a `{{field:key}}` (own or via Row). Zero orphan/zero floating-outside-card fields.
