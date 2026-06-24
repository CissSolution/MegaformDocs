# MegaForm Pure Grid (Vercel-style) Template — Authoring Spec & One-Shot AI Prompt

**Source folder:** `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MEGAFORM TEMPLATES\DefaultTemplates - Deployed\` (all subfolders EXCEPT `Premium\` and `megaform_117_templates_updated\`)
**Sample size analyzed:** 125 templates across 17 category folders (`application-forms`, `booking-forms`, `contact-forms`, `education-forms`, `feedback-review-forms`, `healthcare-forms`, `hr-forms`, `nonprofit-forms`, `order-forms`, `payment-forms`, `real-estate-forms`, `registration-forms`, `rtl-forms`, `rules-forms`, `service-request-forms`, `survey-forms`, `floating-label-forms`)
**Last updated:** 2026-06-07
**Purpose:** Reference for AI agents generating new "Pure Grid" templates. The Pure Grid tier is defined by a **single shared, byte-identical CSS** (`PURE_GRID_CANONICAL_CSS.css` — 5555 bytes) and a **single shared, frozen `customHtml` skeleton** — the AI only swaps content (title/description/customContent/fields[]/rules). The design is canonical: floating labels, light card on cream bg, Italian flag accent bar at top, green primary, red secondary, gold highlights, Cormorant Garamond serif title + Inter body.

---

## 1 · TL;DR — what's locked vs what changes

| Element | What you do | Notes |
|---|---|---|
| `customCss` | **Copy verbatim** from `docs/PURE_GRID_CANONICAL_CSS.css` | All 125 templates share this byte-for-byte. NEVER invent new CSS rules. |
| `customHtml` skeleton | **Copy verbatim** from §4.1 below | Only swap the number of sections + which `{{field:row_X}}` and `{{content:section_X}}` tokens you reference. |
| `title`, `description`, `slug`, `icon`, `submitButtonText`, `successMessage`, `category` | **Author fresh** for the form's purpose | |
| `settings.customContent` keys | **Author fresh** — must equal one entry per `{{content:K}}` token in customHtml | |
| `fields[]` | **Author fresh** — must equal one Row + nested fields per `{{field:row_K}}` token in customHtml + any extra fields referenced directly | Use 18 supported types (§3). |
| `rules[]` | Optional conditional logic | Show/hide/require/clear actions (§6). |
| `settings.theme`, `settings.multiPage`, `workflow` | **Always** `theme: "modern-blue"`, `multiPage: false`, `workflow: null` | |

**Hard contract:** the AI is a content-and-fields author, not a designer. Visual identity is locked.

---

## 2 · File envelope (identical to Premium)

```json
{
  "version": "1.0",
  "slug": "<kebab-case-unique-id>",
  "title": "<Human Title>",
  "description": "<1–2 line subtitle>",
  "category": "standard-application",
  "icon": "sparkles",
  "submitButtonText": "Submit Application",
  "successMessage": "Thank you — we'll be in touch shortly.",
  "settings": {
    "theme": "modern-blue",
    "multiPage": false,
    "customContent": { "section_one": "...", "section_two": "...", "footer_note": "..." }
  },
  "fields": [ ... ],
  "customHtml": "<div class='mfp mfp-pure-grid'>...</div>",
  "customCss":  "@import url('https://fonts.googleapis.com/css2?...');:root{--mfp-primary:#009246;...} /* full 5555-byte canonical */",
  "rules": [ ... ],
  "workflow": null
}
```

**Differences vs Premium spec:**
- `settings` keys: `theme`, `multiPage`, `customContent` ONLY (no duplicate `customHtml`/`customCss`/`rules` under `settings`, no `themeSelector`, no `customScripts`).
- `icon` is a Lucide-style keyword (`"sparkles"`, `"briefcase"`, `"heart"`, `"calendar"`, etc.) NOT a single emoji.
- `category` is a domain slug (`"standard-application"`, `"contact-inquiry"`, `"booking-appointment"`), NOT just `"general"`.
- `categories` (plural) array is OPTIONAL and rarely present.

---

## 3 · Supported field types (18, not 9)

Pure Grid uses a richer field-engine surface than Premium:

| `type` | Renderer | Notes |
|---|---|---|
| `Text` | `<input type="text">` | Most common. Use `" "` (single space) as placeholder so the floating label always lifts. |
| `Email` | `<input type="email">` | Built-in pattern validation. |
| `Phone` | `<input type="tel">` | |
| `Url` | `<input type="url">` | |
| `Number` | `<input type="number">` | Use `properties.min/max`. |
| `Textarea` | `<textarea>` | `properties.rows` for height. |
| `Select` | `<select>` | Requires `options[]`. |
| `Radio` | radio group | Requires `options[]`. |
| `Checkbox` | checkbox group OR single boolean | `options[]` makes it multi-select; absent = single toggle. |
| `Date` | `<input type="date">` | Native date picker. |
| `Time` | `<input type="time">` | Native time picker. |
| `File` | file upload widget | Use `properties.accept` for MIME filter, `properties.maxSize` for size cap. |
| `Html` | static HTML block | Use for inline section dividers / conditional headings — content is in `htmlContent` or `defaultValue`. |
| `Row` | 12-col grid container | `columns[]` with `span` summing to 12. |
| `Section` | named logical break | Rarely used in Pure Grid — visual sections come from customHtml + `{{content:section_X}}`. |
| `Payment` | payment widget | For checkout flows — see `payment-forms/` examples. |
| `Rating` | 1-5 / 1-10 star widget | For feedback/review templates. |
| `Appointment` | calendar slot picker | For booking-forms/. |
| `Calculator` | computed-value field | For quote/estimation forms. |

**Type frequencies across the 125-template corpus:**
`Row` 405 · `Text` 301 · `Select` 231 · `Textarea` 155 · `Email` 122 · `Phone` 117 · `Checkbox` 76 · `Date` 72 · `Html` 51 · `Number` 39 · `Radio` 24 · `Time` 22 · `File` 19 · `Payment` 9 · `Rating` 7 · `Appointment` 6 · `Calculator` 5 · `Url` 4.

### 3.1 · Common field properties

```json
{
  "key": "first_name",          /* unique, snake_case */
  "type": "Text",
  "label": "First Name",
  "required": true,
  "placeholder": " ",           /* SINGLE SPACE for floating-label trick */
  "helpText": "We use this on the badge.",
  "defaultValue": "",
  "properties": {
    "rows": 4,                  /* Textarea */
    "min": 0,                   /* Number */
    "max": 999,                 /* Number */
    "pattern": "^[A-Z].*$",
    "maxLength": 120,
    "accept": ".pdf,.doc,.docx",/* File */
    "maxSize": 5242880,         /* File — bytes */
    "htmlContent": "<h3>Heading inside form</h3>"  /* Html type */
  }
}
```

### 3.2 · The floating-label idiom (CANONICAL)

The shared customCss styles `.mfp-pure-grid .mf-field label` to float ABOVE the input when:
- the input has focus, OR
- the input has a value, OR
- **the input has a non-empty placeholder** (this is the trick).

**Therefore:** for every Text/Email/Phone/Url/Textarea field, set `"placeholder": " "` (a single space). The label then floats persistently. Select / Date / Time / Number / File / Checkbox / Radio do NOT need this trick (they have their own canonical styling).

If you want a real placeholder shown for guidance (`"e.g. Sarah Johnson"`), use it instead of the space — the floating-label still triggers because the placeholder is non-empty.

### 3.3 · Row pattern (UBIQUITOUS — 405 occurrences across 125 templates)

Pure Grid templates use Row containers for **every** placement, even single fields:

```json
{
  "key": "row_name",
  "type": "Row",
  "label": "Name Row",
  "columns": [
    { "span": 6, "fields": [ { "key": "first_name", "type": "Text", "label": "First Name", "required": true, "placeholder": " " } ] },
    { "span": 6, "fields": [ { "key": "last_name",  "type": "Text", "label": "Last Name",  "required": true, "placeholder": " " } ] }
  ]
}
```

For full-width fields use one column with `span: 12`:

```json
{
  "key": "row_subject",
  "type": "Row",
  "label": "Subject Row",
  "columns": [
    { "span": 12, "fields": [ { "key": "subject", "type": "Text", "label": "Subject", "required": true, "placeholder": " " } ] }
  ]
}
```

**Reference the Row in customHtml as `{{field:row_subject}}`** — the engine expands the entire 12-col layout. Fields nested inside columns are NOT referenced directly in customHtml unless you want to break them out of the grid.

For Row of 3 columns: `{ "span": 4 } × 3`. For Row of 1+2: `{ "span": 4 } + { "span": 8 }`. Spans MUST sum to 12.

---

## 4 · `customHtml` — frozen skeleton (~957 bytes)

ALL Pure Grid templates use this exact skeleton — only the number of `<div class='mfp-section'>` blocks and which `{{field:row_X}}` / `{{content:section_X}}` tokens are emitted varies:

### 4.1 · The canonical skeleton (copy this verbatim, then adjust sections)

```html
<div class='mfp mfp-pure-grid'>
  <div class='mfp-container'>
    <div class='mfp-card'>

      <div class='mfp-card-header'>
        <h1 class='mfp-form-title'>{{form:title}}</h1>
        <p class='mfp-form-desc'>{{form:description}}</p>
      </div>

      <div class='mfp-card-body'>

        <div class='mfp-section'>
          <div class='mfp-section-label'>{{content:section_one}}</div>
          {{field:row_name}}
          {{field:row_contact}}
        </div>

        <div class='mfp-section'>
          <div class='mfp-section-label'>{{content:section_two}}</div>
          {{field:row_subject}}
          {{field:row_message}}
        </div>

        <div class='mfp-section'>
          <div class='mfp-section-label'>{{content:section_three}}</div>
          {{field:row_preferences}}
          {{field:row_datetime}}
        </div>

        <div class='mfp-section mfp-section--compact'>
          <div class='mfp-section-label'>{{content:section_four}}</div>
          {{field:row_terms}}
        </div>

        <div class='mfp-actions'>
          <button type='submit' class='mfp-submit'>{{form:submit}}</button>
        </div>

      </div>

      <div class='mfp-card-footer'>
        <p>{{content:footer_note}}</p>
      </div>

    </div>
  </div>
</div>
```

**Hard rules:**
- Root element is always `<div class='mfp mfp-pure-grid'>`.
- 3–5 sections is the norm (mean 4 across the corpus).
- The last section commonly uses `mfp-section mfp-section--compact` for tighter spacing (suited to consent/terms blocks).
- Submit button is ALWAYS `<button type='submit' class='mfp-submit'>` inside `<div class='mfp-actions'>`.
- Footer paragraph holds an optional reassurance note (`{{content:footer_note}}`).
- Use **single quotes** in HTML attributes — the engine + diff tools prefer it.

### 4.2 · Token system

| Token | Resolves to | Notes |
|---|---|---|
| `{{form:title}}` | The form's top-level `title` | |
| `{{form:description}}` | The form's `description` | |
| `{{form:submit}}` | `submitButtonText` | |
| `{{field:row_KEY}}` | One Row's entire 12-col block | Engine emits `.mf-row > .mf-col-N`. |
| `{{field:KEY}}` | One non-Row field's `.mf-field-group` | Used for full-width Textarea/File etc. NOT wrapped in a Row. |
| `{{content:KEY}}` | `settings.customContent[KEY]` | |

**No other token syntax.** The canonical customContent keys are `section_one / section_two / section_three / section_four / footer_note` — match the section count to your design.

---

## 5 · `customCss` — frozen 5555-byte file

ALL Pure Grid templates ship the **identical** customCss. **Copy verbatim** from `docs/PURE_GRID_CANONICAL_CSS.css` (saved alongside this spec for reference). Top-of-file structure:

```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');

:root{
  --mfp-primary:        #009246;   /* Italian flag green */
  --mfp-primary-dark:   #007a3a;
  --mfp-secondary:      #ce2b37;   /* Italian flag red */
  --mfp-gold:           #c9a227;
  --mfp-bg:             #faf9f7;
  --mfp-card-bg:        #ffffff;
  --mfp-text:           #1a1a1a;
  --mfp-text-muted:     #6b6b6b;
  --mfp-border:         #e8e4de;
  --mfp-border-focus:   #009246;
  --mfp-section:        #5a5a5a;
  --mfp-shadow-lg:      0 25px 50px -12px rgba(0,0,0,0.08);
  --mfp-radius:         12px;
  --mfp-font-display:   'Cormorant Garamond', Georgia, serif;
  --mfp-font-body:      'Inter', system-ui, sans-serif;
}

.mfp-pure-grid { font-family: var(--mfp-font-body); color: var(--mfp-text); background: var(--mfp-bg); ... }
.mfp-brand-bar { ... Italian flag tricolor accent bar ... }
.mfp-container, .mfp-card, .mfp-card-header, .mfp-card-body, .mfp-card-footer, .mfp-section, .mfp-actions, .mfp-submit { ... }
.mfp-pure-grid .mf-row, .mfp-pure-grid .mf-col-6, .mfp-pure-grid .mf-col-12 { ... }
.mfp-pure-grid .mf-field input, .mfp-pure-grid .mf-field textarea, .mfp-pure-grid .mf-field select { ... }
.mfp-pure-grid .mf-field label { ... floating-label states ... }
```

### 5.1 · What the canonical CSS guarantees

- **Floating labels** on all text-shaped inputs (Text/Email/Phone/Url/Textarea) when placeholder is non-empty OR field has focus/value.
- **12-column responsive grid** via `.mfp-pure-grid .mf-row` + `.mf-col-{6,12}`. At ≤768px the grid collapses to single column.
- **Italian-flag accent bar** at top of every form (`mfp-brand-bar` — green / white / red gradient).
- **Cream paper background** (`--mfp-bg`) + **white card** (`--mfp-card-bg`) with soft shadow.
- **Section labels** in muted slate (`--mfp-section`) — 11px, letter-spaced, uppercase.
- **Submit button** = full-width green primary (`--mfp-primary`) inside `.mfp-actions`.
- **Footer note** in small italic Cormorant serif.

### 5.2 · NEVER change the canonical CSS

The 125-template corpus relies on this file being identical so:
- A site that hosts dozens of these forms can cache the customCss via a shared `<style>` tag (future engine optimization).
- The visual identity stays cohesive across the entire library.
- AI authoring never has to verify CSS correctness — the file is a known-good asset.

If you need a per-form color tweak, change the `category` and/or `icon` instead. The visual palette is intentionally fixed.

### 5.3 · Engine canonical classes (DO NOT invent)

The canonical customCss styles these engine-emitted classes. Templates MUST NOT redefine or rename them:

`.mf-field-group, .mf-field-label, .mf-required, .mf-field-error, .mf-input, .mf-textarea, .mf-select, .mf-option-group, .mf-option-group--cols, .mf-option-item, .mf-option-control, .mf-option-ui, .mf-option-label, .mf-row, .mf-col-1 … .mf-col-12, .mf-field`

The CheckboxPad-v3 fix is BAKED INTO the canonical customCss — do not re-prepend it. (Premium templates need it because they each ship their own customCss; Pure Grid doesn't because the canonical file already has it.)

---

## 6 · `rules[]` — conditional logic

Pure Grid uses the same conditional rules engine as Premium, with the same actions. The corpus shows ONE common pattern: "show extra section when select X equals Y, hide otherwise". Skeleton:

```json
"rules": [
  {
    "id": "definition_conditional_section",
    "name": "Show Sponsorship Information",
    "enabled": true,
    "priority": 1,
    "when": {
      "id": "group_conditional_section",
      "type": "group",
      "logic": "all",
      "children": [
        {
          "id": "rule_conditional_section",
          "type": "rule",
          "field": "work_authorization",
          "operator": "eq",
          "value": "needs_sponsorship"
        }
      ]
    },
    "then": [
      { "id": "t1", "action": "show",    "targetType": "field", "target": "conditional_section_heading" },
      { "id": "t2", "action": "show",    "targetType": "field", "target": "conditional_reference" },
      { "id": "t3", "action": "require", "targetType": "field", "target": "conditional_notes" }
    ],
    "else": [
      { "id": "e1", "action": "hide",     "targetType": "field", "target": "conditional_section_heading" },
      { "id": "e2", "action": "hide",     "targetType": "field", "target": "conditional_reference" },
      { "id": "e3", "action": "optional", "targetType": "field", "target": "conditional_notes" },
      { "id": "e4", "action": "clear",    "targetType": "field", "target": "conditional_reference" }
    ]
  }
]
```

**Operators:** `eq, ne, contains, not_contains, gt, lt, gte, lte, empty, not_empty, in, not_in`
**Actions:** `show, hide, enable, disable, require, optional, clear`
**`when.type`:** `rule` (single condition) or `group` (AND/OR via `logic: "all"|"any"`).
**`children[]`** in a `group` can mix `rule` and nested `group` types.

When a Pure Grid template uses conditional sections, the convention is:
1. Add an extra `<div class='mfp-section'>` to customHtml referencing `{{field:conditional_section_heading}}` + the conditional fields.
2. Add a `Html`-type field with key `conditional_section_heading` whose `properties.htmlContent` is a `<div class='mfp-section-label'>...</div>` block (mirrors the section-label visual).
3. Add the conditional fields (Text/Date/Textarea/etc.) with `required: false` by default — the rule's `then` action toggles `require`.

---

## 7 · One-shot AI prompt (paste verbatim)

```
You are an authoring assistant for the MegaForm Pure Grid template format
(the Vercel-style design system shared by 125+ templates in
`DefaultTemplates - Deployed/` outside the `Premium/` folder).

GOAL
Produce ONE valid `.json` file (UTF-8, no BOM, no trailing comma) that defines
a Pure Grid form for the purpose I give you. The file must conform exactly to
the spec at `docs/PURE_GRID_FORM_TEMPLATE_SPEC.md` (this document).

WHAT YOU MUST AUTHOR
- `title`, `description`, `slug`, `category`, `icon`, `submitButtonText`,
  `successMessage`.
- `settings.customContent` — one entry per `{{content:KEY}}` token in
  customHtml (typically `section_one`, `section_two`, `section_three`,
  `section_four`, `footer_note`).
- `fields[]` — one Row + nested fields per `{{field:row_KEY}}` token in
  customHtml, plus any non-Row fields referenced as `{{field:KEY}}`.
- `customHtml` — copy the §4.1 skeleton, then INCLUDE only the sections + token
  references you actually need (3-5 sections is the norm; mean 4 in corpus).
- Optional `rules[]` — only when the purpose explicitly needs conditional
  show/hide (e.g. "show passport info only when work_authorization=needs_sponsorship").

WHAT YOU MUST NOT TOUCH OR INVENT
- The CANONICAL `customCss` — copy verbatim from
  `docs/PURE_GRID_CANONICAL_CSS.css` (5555 bytes). Never modify color
  values, never add new selectors, never @import a different font, never
  rename a class. The visual identity is locked.
- The mfp class — ALWAYS `<div class='mfp mfp-pure-grid'>` as root. Never
  invent a per-template suffix.
- The engine canonical classes — `.mf-input, .mf-textarea, .mf-select,
  .mf-option-group, .mf-option-item, .mf-option-control, .mf-option-ui,
  .mf-option-label, .mf-field-label, .mf-required, .mf-field-error,
  .mf-row, .mf-col-N, .mf-field, .mf-field-group`. Only the engine emits
  these; the canonical customCss already styles them.
- The token system — `{{form:title|description|submit}}`,
  `{{field:KEY}}`, `{{content:KEY}}`. No other syntax.
- The 18 supported field types — Text, Email, Phone, Url, Number,
  Textarea, Select, Radio, Checkbox, Date, Time, File, Html, Row,
  Section, Payment, Rating, Appointment, Calculator.
- `settings.theme`: always `"modern-blue"`. `settings.multiPage`: always
  `false`. `workflow`: always `null`.

REQUIRED OUTPUT SHAPE
{
  "version": "1.0",
  "slug": "<unique-kebab-case>",
  "title": "...",
  "description": "...",
  "category": "<domain slug e.g. standard-application, contact-inquiry, booking-appointment, customer-feedback>",
  "icon": "<lucide keyword e.g. sparkles, briefcase, heart, calendar, mail, message-square>",
  "submitButtonText": "...",
  "successMessage": "...",
  "settings": {
    "theme": "modern-blue",
    "multiPage": false,
    "customContent": {
      "section_one":   "...",
      "section_two":   "...",
      "section_three": "...",   // optional — omit if you only need 2 sections
      "section_four":  "...",   // optional — usually consent/terms block
      "footer_note":   "We typically respond within one business day."
    }
  },
  "fields": [
    {
      "key": "row_name",
      "type": "Row",
      "label": "Name Row",
      "columns": [
        { "span": 6, "fields": [ { "key": "first_name", "type": "Text", "label": "First Name", "required": true, "placeholder": " " } ] },
        { "span": 6, "fields": [ { "key": "last_name",  "type": "Text", "label": "Last Name",  "required": true, "placeholder": " " } ] }
      ]
    },
    /* ... more Rows / standalone fields ... */
  ],
  "customHtml": "<div class='mfp mfp-pure-grid'>...3–5 sections + actions + footer...</div>",
  "customCss":  "<verbatim copy of docs/PURE_GRID_CANONICAL_CSS.css>",
  "rules": [],
  "workflow": null
}

HARD RULES
1. The customCss field MUST contain the canonical CSS byte-for-byte. If you
   can fetch the file, do so; otherwise paste the version you were given.
2. Every `{{field:KEY}}` in customHtml MUST have a matching field with key=K.
3. Every `{{content:KEY}}` in customHtml MUST have a key=K in
   `settings.customContent`.
4. Every Row's `columns[].span` sums to 12.
5. Every Text/Email/Phone/Url/Textarea field uses placeholder " " (single
   space) so the floating label always lifts. You may use a real placeholder
   string instead, but never use `""` (empty).
6. `<button type='submit' class='mfp-submit'>` lives inside
   `<div class='mfp-actions'>` — never outside it.
7. The 18 supported field types are exhaustive. No File-upload variants, no
   custom widgets, no inline scripts.
8. workflow: null. theme: "modern-blue". multiPage: false.
9. DO NOT add a CheckboxPad block — the canonical customCss already includes
   the equivalent fix.

INPUT YOU WILL RECEIVE
- The form's purpose (e.g. "support ticket intake", "product return RMA",
  "speaker submission for a conference", "patient triage questionnaire").
- Optional: a list of fields the user wants to capture.

OUTPUT
A single fenced ```json``` code block containing the full template. No
commentary, no markdown headers outside the block. The file must parse with
`JSON.parse()` in Node.js without errors.
```

---

## 8 · Sanity checklist (run before shipping a generated template)

- [ ] `JSON.parse(fileContent)` succeeds.
- [ ] `slug` is kebab-case, unique vs the rest of `DefaultTemplates - Deployed/`.
- [ ] customHtml root is `<div class='mfp mfp-pure-grid'>`.
- [ ] Every `{{field:K}}` and `{{field:row_K}}` token has a matching field.
- [ ] Every `{{content:K}}` token has a key in `settings.customContent`.
- [ ] Every Row's `columns[].span` sums to 12.
- [ ] Every text-shaped field has placeholder `" "` (or a real placeholder string).
- [ ] No field uses a type outside the 18 supported.
- [ ] `customCss` matches `docs/PURE_GRID_CANONICAL_CSS.css` byte-for-byte.
- [ ] `settings.theme = "modern-blue"`, `settings.multiPage = false`, `workflow: null`.
- [ ] `submitButtonText`, `successMessage` set with form-specific copy.
- [ ] customHtml ends with `<button type='submit' class='mfp-submit'>…</button>` inside `<div class='mfp-actions'>`.
- [ ] No Unsplash URL anywhere — Pure Grid templates do not use stock photos.

---

## 9 · Reference: where to look in the corpus for inspiration

| Category | Folder | Pattern |
|---|---|---|
| Job / scholarship / vendor applications | `application-forms/` | 4 sections (Applicant / Role / Materials / Declaration) + 1 rule for conditional sponsorship info. |
| Appointments, consultations, property tours | `booking-forms/` | 3 sections (Visitor / Service / Time-slot) + Date + Time + Appointment widget. |
| Contact / callback / support | `contact-forms/` | 3-4 sections (Personal / Message / Preferences / Consent) — the canonical sample lives at `contact-forms/contact-us-standard.json`. |
| Course enrollment, parent-meeting | `education-forms/` | Same 3-section shape, more Select fields for grade/department. |
| Customer / employee / event feedback | `feedback-review-forms/` | Adds Rating fields. |
| Patient intake, insurance, telehealth | `healthcare-forms/` | Adds Date (DOB), File (insurance card), more conditional rules. |
| Leave request, performance review, onboarding | `hr-forms/` | Standard 4-section shape + Date + Textarea-heavy. |
| Donation, volunteer signup, event RSVP | `nonprofit-forms/` | Often adds Payment or Number fields. |
| E-commerce, product order, RMA | `order-forms/` | Adds Number (quantity), Select (variant). |
| Membership, subscription, deposit | `payment-forms/` | Adds Payment widget — see `membership-payment-fl.json`. |
| Rental, mortgage inquiry, property tour | `real-estate-forms/` | Conditional rules on income tiers. |
| Account signup, event registration | `registration-forms/` | Adds Url (social profile). |
| Arabic / Hebrew / Persian | `rtl-forms/` | Same shape with `dir="rtl"` added to outermost element in customHtml + RTL-aware CSS tweaks at the end of customCss (≈400 extra bytes). |
| Forms with conditional logic demo | `rules-forms/` | Each ships with at least one rule definition for teaching purposes. |
| Service tickets, quote requests | `service-request-forms/` | Adds File, Number (urgency). |
| Surveys with rating scales | `survey-forms/` | Rating + Select + Textarea heavy. |
| Floating-label showcase | `floating-label-forms/` | Single-row demos of the floating label across all input types. |

When in doubt, find the closest match by purpose, copy its `fields[]` and `rules[]` as the starting skeleton, and re-author labels / options / customContent for the new form.

---

## 10 · Premium vs Pure Grid — when to use which?

| Criterion | Premium | Pure Grid |
|---|---|---|
| **Visual identity** | Unique per template (`mfp-halloween`, `mfp-wedding-scrapbook` etc.) | Shared single design — Italian-flag accent bar, cream + white card. |
| **customCss** | Per-template, 6-15 KB each | One canonical 5555-byte file shared across 125+ templates. |
| **customHtml** | Per-template skeleton with decorative SVG, polaroids, gradient hero, etc. | Frozen ~957-byte skeleton — only section count + token names change. |
| **Field types** | 9 (Text/Email/Phone/Textarea/Select/Radio/Checkbox/Row/Section) | 18 (adds Url/Number/Date/Time/File/Html/Payment/Rating/Appointment/Calculator) |
| **CheckboxPad** | Must prepend per template | Baked into canonical CSS |
| **Use when** | Marketing / brand-led / one-off campaign forms with strong visual identity | Operational forms — applications, bookings, contacts, payments, healthcare intake — where consistency and speed-to-author matter more than visual flair. |
| **Author effort** | ~2-3 hours per template (CSS design + HTML markup + fields) | ~10-15 minutes per template (content + fields only) |

For new lines of business that need many forms quickly, default to Pure Grid. Switch to Premium only when a campaign or event needs a unique aesthetic.
