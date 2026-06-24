# Recipe: Author a MegaForm Pure Grid template

## When to use
User asks to create a NEW form for an **operational purpose** — contact,
application, booking, registration, payment, healthcare intake, HR request,
survey, feedback, RMA. 125+ existing templates share a single locked visual
identity (Italian-flag accent bar, cream paper bg, white card, Cormorant +
Inter typography, floating labels). The AI's job is to author content +
fields only — the CSS is byte-frozen.

If the user wants a unique-aesthetic campaign form, redirect to
`author-premium-template` instead.

## TL;DR — what's locked vs what changes

| Element | Action |
|---|---|
| `customCss` | **Copy verbatim** from the `pure-grid-canonical-css` recipe (5555 bytes shared across 125 templates). NEVER modify. |
| `customHtml` skeleton | Copy §4 skeleton; swap section count + token names only. |
| `title`, `description`, `slug`, `icon`, `category`, `submitButtonText`, `successMessage` | Author fresh. |
| `settings.customContent` | One entry per `{{content:K}}` token. |
| `fields[]` | One Row + nested fields per `{{field:row_K}}` + any extra fields referenced directly. |
| `rules[]` | Optional conditional logic. |
| `settings.theme` | Always `"modern-blue"`. |
| `settings.multiPage` | Always `false`. |
| `workflow` | Always `null`. |

## 2 — File envelope (differs slightly from Premium)
```json
{
  "version": "1.0",
  "slug": "<kebab-case-unique-id>",
  "title": "<Human Title>",
  "description": "<1–2 line subtitle>",
  "category": "<domain slug e.g. standard-application, contact-inquiry, booking-appointment>",
  "icon": "sparkles",
  "submitButtonText": "Submit",
  "successMessage": "Thank you — we'll be in touch shortly.",
  "settings": {
    "theme": "modern-blue",
    "multiPage": false,
    "customContent": { "section_one": "...", "footer_note": "..." }
  },
  "fields": [ ... ],
  "customHtml": "<div class='mfp mfp-pure-grid'>...</div>",
  "customCss":  "/* paste verbatim 5555-byte canonical CSS — see recipe `pure-grid-canonical-css` */",
  "rules": [],
  "workflow": null
}
```

**Differences vs Premium:**
- `settings` keys: `theme`, `multiPage`, `customContent` ONLY. NO duplicate
  customHtml/customCss/rules under settings. NO themeSelector. NO customScripts.
- `icon` is a Lucide-style keyword (`"sparkles"`, `"briefcase"`, `"heart"`,
  `"calendar"`, `"mail"`, `"message-square"`), not a single emoji.
- `category` is a domain slug, not `"general"`.

## 3 — Supported field types (18 — wider than Premium's 9)

| Type | Notes |
|---|---|
| `Text`, `Email`, `Phone`, `Url`, `Number` | Use placeholder `" "` (single space) for floating-label trick. |
| `Textarea` | `properties.rows` for height. |
| `Select`, `Radio`, `Checkbox` | Require `options[]` (Checkbox without options = single boolean). |
| `Date`, `Time` | Native pickers. |
| `File` | `properties.accept`, `properties.maxSize` (bytes). |
| `Html` | Static block — `properties.htmlContent` holds the markup (used for inline conditional headings). |
| `Row` | 12-col grid container — `columns[]` with `span` summing to 12. |
| `Section` | Logical break (rarely needed — visual sections live in customHtml). |
| `Payment` | Payment widget — see `payment-forms/` for shape. |
| `Rating` | 1-5 / 1-10 star widget — see `feedback-review-forms/`. |
| `Appointment` | Calendar slot picker — see `booking-forms/`. |
| `Calculator` | Computed-value field — see quote/estimation samples. |

Type frequencies across the 125-template corpus:
`Row` 405 · `Text` 301 · `Select` 231 · `Textarea` 155 · `Email` 122 · `Phone`
117 · `Checkbox` 76 · `Date` 72 · `Html` 51 · `Number` 39 · `Radio` 24 ·
`Time` 22 · `File` 19 · `Payment` 9 · `Rating` 7 · `Appointment` 6 ·
`Calculator` 5 · `Url` 4.

### Floating-label idiom (canonical)
The shared customCss floats `.mfp-pure-grid .mf-field label` above the input
when the input has a non-empty placeholder OR focus OR value. **For every
Text/Email/Phone/Url/Textarea field set `"placeholder": " "` (single space)**
so the label floats persistently. Use a real placeholder string if you want
guidance text — it still triggers the float.

### Row pattern (used EVERYWHERE — 405 occurrences in corpus)
Wrap EVERY field placement in a Row, even single full-width fields:
```json
/* Two columns */
{
  "key": "row_name", "type": "Row", "label": "Name Row",
  "columns": [
    { "span": 6, "fields": [ { "key": "first_name", "type": "Text", "label": "First Name", "required": true, "placeholder": " " } ] },
    { "span": 6, "fields": [ { "key": "last_name",  "type": "Text", "label": "Last Name",  "required": true, "placeholder": " " } ] }
  ]
}
/* Full-width */
{
  "key": "row_subject", "type": "Row", "label": "Subject Row",
  "columns": [
    { "span": 12, "fields": [ { "key": "subject", "type": "Text", "label": "Subject", "required": true, "placeholder": " " } ] }
  ]
}
```
For 3 columns: `{ span: 4 } × 3`. For 1+2 split: `{ span: 4 } + { span: 8 }`.
Spans MUST sum to 12. Reference the row in customHtml as `{{field:row_KEY}}`.

## 4 — customHtml skeleton (frozen — copy this, then adjust sections)

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
- Root ALWAYS `<div class='mfp mfp-pure-grid'>`.
- 3–5 sections is the norm (mean 4 across corpus).
- Last section may use `mfp-section mfp-section--compact` for tighter spacing
  (suits consent/terms blocks).
- Submit button ALWAYS `<button type='submit' class='mfp-submit'>` inside
  `<div class='mfp-actions'>`.
- Footer paragraph holds an optional reassurance note via `{{content:footer_note}}`.
- Use single-quote HTML attributes.
- Tokens — `{{form:title|description|submit}}`, `{{field:row_KEY}}` for Rows,
  `{{field:KEY}}` for non-Row fields, `{{content:KEY}}` for customContent.

## 5 — customCss (5555 bytes shared)
**Do NOT author CSS.** Fetch the canonical CSS from the
`pure-grid-canonical-css` recipe and paste it verbatim. The file is byte-
identical across 125 templates and guarantees:
- Floating labels on all text-shaped inputs.
- 12-col responsive grid that collapses at ≤768px.
- Italian-flag tricolor accent bar at top.
- Cream paper bg + white card + soft shadow.
- Section labels in muted slate (11px uppercase letter-spaced).
- Green primary submit button (`#009246`).
- Cormorant Garamond serif title + Inter body.
- CheckboxPad fix baked-in — DO NOT prepend it.

Engine canonical classes the CSS styles (DO NOT invent or rename):
`.mf-field-group, .mf-field-label, .mf-required, .mf-field-error, .mf-input,
.mf-textarea, .mf-select, .mf-option-group, .mf-option-group--cols,
.mf-option-item, .mf-option-control, .mf-option-ui, .mf-option-label, .mf-row,
.mf-col-1 … .mf-col-12, .mf-field`.

## 6 — `rules[]` pattern (optional)
Standard "show extra section when select X = Y, hide otherwise":
```json
[
  {
    "id": "definition_conditional_section",
    "name": "Show Sponsorship Information",
    "enabled": true,
    "priority": 1,
    "when": {
      "id": "group_conditional_section", "type": "group", "logic": "all",
      "children": [
        { "id": "rule_conditional_section", "type": "rule",
          "field": "work_authorization", "operator": "eq", "value": "needs_sponsorship" }
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
Operators: `eq, ne, contains, not_contains, gt, lt, gte, lte, empty, not_empty, in, not_in`.
Actions: `show, hide, enable, disable, require, optional, clear`.

When using conditional sections, add an extra `<div class='mfp-section'>` to
customHtml that references the conditional fields, and use a `Html`-type
field for the section heading (the heading is just a styled `<div
class='mfp-section-label'>...</div>` in `properties.htmlContent`).

## 7 — Sanity checklist before shipping
- [ ] `JSON.parse()` succeeds.
- [ ] Root is `<div class='mfp mfp-pure-grid'>`.
- [ ] Every `{{field:K}}` and `{{field:row_K}}` token has a matching field.
- [ ] Every `{{content:K}}` token has a key in `settings.customContent`.
- [ ] Every Row's `columns[].span` sums to 12.
- [ ] Every text-shaped field has placeholder `" "` (or a real placeholder
      string — never `""`).
- [ ] No field uses a type outside the 18 supported.
- [ ] `customCss` matches the `pure-grid-canonical-css` recipe byte-for-byte.
- [ ] `settings.theme = "modern-blue"`, `settings.multiPage = false`,
      `workflow: null`.
- [ ] customHtml ends with `<button type='submit' class='mfp-submit'>…</button>`
      inside `<div class='mfp-actions'>`.
- [ ] No Unsplash URL anywhere — Pure Grid templates do not use stock photos.

## 8 — Category folder map (where to find inspiration)
| Folder | Pattern |
|---|---|
| `application-forms/` | 4 sections (Applicant / Role / Materials / Declaration) + 1 conditional sponsorship rule. |
| `booking-forms/` | 3 sections (Visitor / Service / Time-slot) + Date + Time + Appointment widget. |
| `contact-forms/` | 3-4 sections (Personal / Message / Preferences / Consent). Canonical sample: `contact-forms/contact-us-standard.json`. |
| `education-forms/` | Same 3-section shape + more Select fields. |
| `feedback-review-forms/` | Adds Rating fields. |
| `healthcare-forms/` | Adds Date (DOB), File (insurance card), more conditional rules. |
| `hr-forms/` | Standard 4-section + Date + Textarea-heavy. |
| `nonprofit-forms/` | Often adds Payment or Number. |
| `order-forms/` | Adds Number (quantity), Select (variant). |
| `payment-forms/` | Adds Payment widget. |
| `real-estate-forms/` | Conditional rules on income tiers. |
| `registration-forms/` | Adds Url (social profile). |
| `rtl-forms/` | Same shape with `dir="rtl"` on root + RTL-aware CSS tail. |
| `service-request-forms/` | Adds File, Number (urgency). |
| `survey-forms/` | Rating + Select + Textarea heavy. |
| `floating-label-forms/` | Single-row demos of the floating label across input types. |

## 9 — Output shape (when invoked as an authoring tool)
Return a single fenced JSON code block containing the full template envelope.
DO NOT include commentary outside the block. The file must parse with
`JSON.parse()` in Node.js without errors.

## 10 — Premium vs Pure Grid (when to switch)
- Premium → unique visual identity per template, longer to author, marketing
  / event / campaign use.
- Pure Grid → locked visual identity, 10× faster to author, operational forms.
Default to Pure Grid unless the user explicitly wants a campaign aesthetic.
