# Recipe: Author a MegaForm Premium template

## When to use
User asks to create a NEW form template with a **unique visual identity** —
campaign-led, event-led, or brand-led forms where each template has its own
themed shell (animated SVG decor, polaroid asides, oklch theme picker,
festival hero, etc.). Examples in the corpus: `mfp-halloween`,
`mfp-wedding-scrapbook`, `mfp-coachella`, `mfp-aurora-style`.

If the user wants a "standard / operational" form (contact, application,
booking, payment), point them to the Pure Grid recipe instead
(`author-pure-grid-template`) — it ships ~10× faster because the CSS is
locked.

## File envelope (canonical)
```json
{
  "version": "1.0",
  "slug": "<kebab-case-unique-id>",
  "title": "<Human Title>",
  "description": "<1–2 line subtitle>",
  "category": "general",
  "categories": ["events", "registration"],
  "icon": "🎃",
  "submitButtonText": "Reserve My Spot",
  "successMessage": "Thank you — see you at the party!",
  "settings": { /* see §2 */ },
  "fields": [ /* see §3 */ ],
  "customHtml": "<div class='mfp mfp-<slug>'>...</div>",
  "customCss":  ".mfp.mfp-<slug>{...}",
  "rules": [ /* see §6 */ ],
  "workflow": null
}
```

**Hard rules:**
- `version` always `"1.0"`.
- `slug` MUST equal the theme class in customHtml/customCss: `.mfp.mfp-<slug>`.
- `icon` is a single emoji.
- `submitButtonText`, `successMessage`, `customHtml`, `customCss`, `rules`
  appear BOTH at top level AND duplicated under `settings.*` (legacy shape).
- `workflow` is `null` unless a BPMN workflow ships with the form.

## 2 — `settings` object schema
```json
"settings": {
  "theme": "modern-blue",
  "multiPage": false,
  "customContent": { "section_attendee": "Who's Coming?", "footer_note": "..." },
  "submitButtonText": "<duplicate of top-level>",
  "successMessage":   "<duplicate of top-level>",
  "customHtml":       "<duplicate of top-level>",
  "customCss":        "<duplicate of top-level>",
  "rules":            [ "<duplicate of top-level>" ],
  "workflowTemplate": null,
  "themeSelector":    { /* optional — Rose Festival pattern */ },
  "customScripts":    { /* optional — theme_selector IIFE */ }
}
```

`customContent` keys back the `{{content:KEY}}` tokens in customHtml. Use for
section headers, event metadata, decorative copy, footer disclaimers. NEVER
put field values/labels/options here — those live in `fields[]`.

## 3 — Supported field types (9 only)
`Text` · `Email` · `Phone` · `Textarea` (use `properties.rows`) · `Select`
(needs `options[]`) · `Radio` (needs `options[]`) · `Checkbox` (with
`options[]` = multi; without = single boolean) · `Row` (12-col grid via
`columns[]` with `span` summing to 12) · `Section` (logical break — content
visual usually lives in customHtml).

### Field shape
```json
{
  "key": "first_name",
  "type": "Text",
  "label": "First Name",
  "required": true,
  "placeholder": "Your name",
  "helpText": "Shown on the badge.",
  "properties": { "rows": 3, "maxLength": 120 },
  "options": [ { "label": "Just me", "value": "1" } ]
}
```

### Row pattern
```json
{
  "key": "row_name", "type": "Row", "label": "Name Row",
  "columns": [
    { "span": 6, "fields": [ { "key": "first_name", "type": "Text", "label": "First", "required": true } ] },
    { "span": 6, "fields": [ { "key": "last_name",  "type": "Text", "label": "Last",  "required": true } ] }
  ]
}
```
Inside customHtml reference the row as `{{field:row_name}}` — the renderer
expands the 12-col block. Spans MUST sum to 12.

## 4 — customHtml shell
```html
<div class="mfp mfp-<slug>">
  <div class="mfp-decor"> ...optional SVG illustrations / gradient layers... </div>
  <div class="mfp-container">
    <div class="mfp-card">
      <header class="mfp-header">
        <h1 class="mfp-title">{{form:title}}</h1>
        <p class="mfp-subtitle">{{form:description}}</p>
      </header>
      <div class="mfp-section">
        <div class="mfp-section-label">{{content:section_one}}</div>
        {{field:row_name}}
        {{field:row_contact}}
      </div>
      <!-- more sections -->
      <div class="mfp-actions">
        <button type="submit" class="mfp-submit"><span>{{form:submit}}</span></button>
      </div>
    </div>
    <div class="mfp-card-footer"><p>{{content:footer_note}}</p></div>
  </div>
</div>
```

**Hard rules:**
- Root `<div class="mfp mfp-<slug>">` — both classes; mfp first.
- Every `{{field:K}}` MUST have a field with key=K in `fields[]`.
- Every `{{content:K}}` MUST have a key in `settings.customContent`.
- Submit button MUST be `<button type="submit" class="mfp-submit">` — runtime
  captures clicks via that selector.
- Use single-quote HTML attributes (`<div class='mfp ...'>`) so JSON encoding
  stays diff-friendly.

## 5 — customCss conventions
- ALL rules scoped to `.mfp.mfp-<slug>` (double-class for specificity bump).
- May `@import url('https://fonts.googleapis.com/css2?...')` Google Fonts.
- CSS variables prefixed with theme abbreviation (`--hw-bg`, `--rose-primary`,
  `--wd-card` etc.).
- Style ONLY the engine's canonical classes — never invent: `.mf-field-group`,
  `.mf-field-label`, `.mf-required`, `.mf-field-error`, `.mf-input`,
  `.mf-textarea`, `.mf-select`, `.mf-option-group`, `.mf-option-group--cols`,
  `.mf-option-item`, `.mf-option-control`, `.mf-option-ui`, `.mf-option-label`,
  `.mf-row`, `.mf-row-col`.

### CheckboxPad block — MUST appear at start of customCss
```css
body .mfp.mfp .mf-option-item, body .mfp .mf-option-item.mf-option-item {
  display: flex !important; align-items: flex-start !important;
  flex-direction: row !important; gap: 8px !important; padding: 0 !important;
  min-height: 24px !important; position: relative !important; width: 100% !important;
  grid-template-columns: none !important; grid-template-rows: none !important;
  cursor: pointer;
}
body .mfp.mfp .mf-option-item .mf-option-control,
body .mfp .mf-option-item.mf-option-item input[type=checkbox],
body .mfp .mf-option-item.mf-option-item input[type=radio] {
  position: static !important; flex: 0 0 auto !important; margin: 3px 0 0 !important;
  left: auto !important; top: auto !important; transform: none !important;
  width: 18px !important; height: 18px !important; min-width: 18px !important;
  max-width: 18px !important; grid-column: auto !important;
}
body .mfp.mfp .mf-option-item .mf-option-ui,
body .mfp .mf-option-item .mf-option-ui.mf-option-ui {
  flex: 1 1 auto !important; display: block !important; width: auto !important;
  min-width: 0 !important; max-width: none !important; padding: 0 !important;
  margin: 0 !important; grid-column: auto !important; grid-row: auto !important;
}
body .mfp.mfp .mf-option-item .mf-option-label,
body .mfp .mf-option-item .mf-option-label.mf-option-label {
  display: inline !important; width: auto !important; white-space: normal !important;
  word-break: normal !important; overflow-wrap: break-word !important;
}
body .mfp.mfp .mf-option-group, body .mfp .mf-option-group.mf-option-group {
  display: flex !important; flex-direction: column !important; gap: 6px !important;
  width: 100% !important;
}
```
Reason: many template customCss define `.mf-option-item { display:grid;
grid-template-columns: 20px 1fr }` which causes label text to wrap word-per-
line on single-checkbox consent fields. This block forces flex.

## 6 — `rules[]` shape (optional)
```json
[
  {
    "id": "other_style_toggle",
    "name": "Toggle other_style field",
    "enabled": true,
    "priority": 1,
    "when": { "type": "rule", "field": "event_style", "operator": "eq", "value": "other" },
    "then": [ { "id": "t1", "action": "show", "targetType": "field", "target": "other_style" } ],
    "else": [ { "id": "e1", "action": "hide", "targetType": "field", "target": "other_style" } ]
  }
]
```
Operators: `eq, ne, contains, not_contains, gt, lt, gte, lte, empty,
not_empty, in, not_in`. Actions: `show, hide, enable, disable, require,
optional, clear`. Nest with `"type":"group", "logic":"all"|"any",
"children":[...]` for AND/OR chains.

## 7 — Sanity checklist before shipping
- [ ] `JSON.parse()` succeeds.
- [ ] `slug` is unique; mfp class in customHtml === mfp class in every
      customCss selector.
- [ ] All `{{field:K}}` tokens have a matching field with key=K.
- [ ] All `{{content:K}}` tokens have a key in settings.customContent.
- [ ] Every Row's `columns[].span` sums to 12.
- [ ] No field uses a type outside the 9 supported.
- [ ] customCss starts with the CheckboxPad block.
- [ ] customHtml ends with `<button type="submit" class="mfp-submit">…</button>`
      inside `<div class="mfp-actions">`.
- [ ] No dead Unsplash URL (head-check with `curl -I`). Avoid known dead IDs:
      `1584345604476-8ec5f82d718d`, `1542261021-08d4d794b00d`.
- [ ] `submitButtonText`, `successMessage`, `customHtml`, `customCss`, `rules`
      duplicated between top-level AND `settings.*`.
- [ ] `workflow: null`.

## 8 — Pattern map (corpus references)
Pick the closest visual idiom and copy its customHtml/customCss as a starting
skeleton, then change only: mfp suffix → CSS variable prefix + color values →
token references → fields/customContent for the new purpose.

| Visual idiom | Source template |
|---|---|
| Animated floating SVG decor | `halloween-party-registration`, `cherry-blossom-festival-registration`, `new-orleans-event-registration` |
| Layered grid with image aside | `wedding-scrapbook-story`, `coachella-festival-registration` |
| 6-preset themeSelector with oklch palette | `Rose_festival_row_based_OK` (IIFE is canonical — only override SCOPE/PFX/DEFAULT constants) |
| Two-column applicant grid + sections | `V0job-application-form-v20260419-06`, `job-application-form` |
| Centered consultation with monogram | `aurora-style-consultation`, `italian-law-firm-consultation`, `aurora-product-feedback`, `italian-romantic-experience-feedback` |
| Festival pass selector with pricing cards | `coachella-festival-registration` |
| Multi-card slider for browsing | `american-auto-dealership-registration`, `french-product-consultation-form-fixed-final` |

## 9 — Output shape (when invoked as an authoring tool)
Return a single fenced JSON code block containing the full template envelope.
Do NOT include commentary outside the block. The file must parse with
`JSON.parse()` in Node.js without errors.
