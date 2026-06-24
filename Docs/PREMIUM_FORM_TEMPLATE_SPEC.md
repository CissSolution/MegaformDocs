# MegaForm Premium Template — Authoring Spec & One-Shot AI Prompt

**Source folder:** `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MEGAFORM TEMPLATES\DefaultTemplates - Deployed\Premium\` (34 templates analyzed)
**Last updated:** 2026-06-07 (B83 cascade)
**Purpose:** Reference for AI agents generating new "Premium-style" templates. The Premium tier is defined by its visual richness — custom themed shells (`mfp-<slug>`) with decorative SVG, oklch color presets, layered backgrounds, animated states. Engine reuses the same field schema regardless of theme; **only the visual shell + tokens + content vary**.

---

## 1 · File envelope

Every Premium template is a single `.json` file with this top-level shape (key order is not enforced but recommended):

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
  "settings": { ... },
  "fields": [ ... ],
  "customHtml": "<div class='mfp mfp-<slug>'>...</div>",
  "customCss": ".mfp.mfp-<slug>{...}",
  "rules": [ ... ],
  "workflow": null
}
```

**Hard rules:**
- `version` is always `"1.0"`.
- `slug` must match the theme class in customHtml/customCss: `.mfp.mfp-<slug>`.
- `icon` is a single emoji (used in dashboard cards + DNN tab title).
- `submitButtonText` and `successMessage` are surfaced both at top-level AND inside `settings.*` (legacy shape compatibility).
- `workflow` is `null` unless an actual BPMN workflow is attached.

---

## 2 · `settings` object — full schema

```json
"settings": {
  "theme": "modern-blue",
  "multiPage": false,
  "customContent": { "section_attendee": "Who's Coming?", ... },
  "submitButtonText": "Reserve My Spot",
  "successMessage": "Thank you — see you at the party!",
  "customHtml": "<duplicate of top-level customHtml>",
  "customCss":  ".duplicate of top-level customCss",
  "rules": [ "<duplicate of top-level rules>" ],
  "workflowTemplate": null,
  "themeSelector": { ... },         /* optional */
  "customScripts": { ... }          /* optional */
}
```

**Why the duplication?** The runtime renderer reads from `schema.customHtml` etc., the builder UI reads from `settings.customHtml`. For new templates **write both copies identically** so the form looks the same in builder, render, and after-Save reloads.

### 2.1 · `customContent` (token store)

Map of `<key, string>`. Any `{{content:key}}` token in `customHtml` is replaced by the value at render time. Use this for:
- Section headers visible in the customHtml (e.g. `"section_party": "Party Details"`).
- Event metadata strings (`"event_date": "October 31st, 2024"`).
- Decorative copy / ambient text (`"ghost_message_1": "Boo!"`).
- Footer disclaimers.

Do **NOT** put form-field values, labels, or option lists here — those live in `fields[]`.

### 2.2 · `themeSelector` (optional — Rose Festival pattern)

When a template ships multiple color variants for the user to switch live, include:

```json
"themeSelector": {
  "enabled": true,
  "mode": "module-controlled",
  "scriptKey": "theme_selector",
  "presetSet": "rose-garden",
  "defaultThemeKey": "damask-rose",
  "showUpdateThemeButton": true,
  "presets": {
    "damask-rose": {
      "name": "Damask Rose",
      "style": "rose",
      "background": "oklch(0.97 0.01 355)",
      "foreground": "oklch(0.25 0.05 355)",
      "card": "oklch(0.995 0.005 355)",
      "primary": "oklch(0.52 0.13 355)",
      "primaryForeground": "oklch(0.98 0 0)",
      "secondary": "oklch(0.90 0.04 355)",
      "muted": "oklch(0.94 0.015 355)",
      "mutedForeground": "oklch(0.50 0.03 355)",
      "accent": "oklch(0.62 0.10 90)",
      "border": "oklch(0.87 0.02 355)"
    },
    "english-tearose": { ... },
    "midnight-rose":   { ... }
  }
}
```

All color values are **`oklch(L C H)`** triples (L=lightness 0–1, C=chroma, H=hue). The runtime injects them as CSS variables (`--background`, `--primary`, etc.) scoped to the form root. The companion `customScripts.theme_selector` IIFE renders a floating "Theme" pill at top-right.

### 2.3 · `customScripts.theme_selector` (companion JS)

A self-invoking function string. **Do NOT modify** — it's the canonical theme-picker UI. Copy verbatim from any template that uses `themeSelector`. The script reads `ctx.themePreset.presets` and renders the pill + dropdown. Override only the `PFX` (prefix) and `SCOPE` constants to match your theme class:

```js
var SCOPE   = ".mfp.<your-mfp-class>";
var PFX     = "<short prefix used as id/event namespace>";
var DEFAULT = "<defaultThemeKey>";
```

---

## 3 · `fields[]` — schema

The engine accepts ONLY these types in Premium templates:

| `type` | Renderer | Notes |
|---|---|---|
| `Text` | `<input type="text">` | Most common single-line field. |
| `Email` | `<input type="email">` | Has built-in pattern validation. |
| `Phone` | `<input type="tel">` | E.164 friendly. |
| `Textarea` | `<textarea>` | Use `properties.rows` for height (3 = default). |
| `Select` | `<select>` | `options[]` required. |
| `Radio` | radio group | `options[]` required. |
| `Checkbox` | checkbox group (multi) OR single checkbox | `options[]` makes it multi; no options = single boolean. |
| `Row` | 12-col layout container | Has `columns[]`, each with `span` (1–12) and nested `fields[]`. |
| `Section` | named section header | Sets a logical group; visible label + optional `pageBreak`. |

### 3.1 · Common field properties

```json
{
  "key": "first_name",          /* unique, snake_case */
  "type": "Text",
  "label": "First Name",
  "required": true,             /* default false */
  "placeholder": "Your name",
  "helpText": "We use this on the badge.",   /* optional */
  "defaultValue": "",                          /* optional */
  "properties": {                              /* type-specific bag */
    "rows": 3,                                  /* Textarea */
    "min": 0,                                   /* Text / Number */
    "max": 999,
    "pattern": "^[A-Z].*$",
    "maxLength": 120,
    "pageBreak": false                          /* Section */
  }
}
```

### 3.2 · `Row` (12-col grid)

```json
{
  "key": "row_name",
  "type": "Row",
  "label": "Name Row",
  "columns": [
    { "span": 6, "fields": [ { "key": "first_name", "type": "Text", ... } ] },
    { "span": 6, "fields": [ { "key": "last_name",  "type": "Text", ... } ] }
  ]
}
```

**Rules:**
- `span` values per row should sum to **12**.
- Each column wraps a `fields[]` array — nest any other field type (including another Row → not recommended deeper than 1 level).
- Use Row for side-by-side layout. Use stand-alone fields for full-width.
- Inside customHtml, reference the row as `{{field:row_name}}` — the renderer expands the entire 2-column block.

### 3.3 · `Section` (header + optional page break)

```json
{
  "key": "sec_couple",
  "type": "Section",
  "label": "Couple Details",
  "properties": { "pageBreak": false }
}
```

Section is **content-only** in the renderer (it just emits a labelled break in the field flow). For Premium themes, the visual section header usually comes from the `customHtml` shell + a `{{content:section_<name>}}` token instead, leaving `Section` as a logical anchor for the rules engine.

### 3.4 · Options (Select / Radio / Checkbox)

```json
"options": [
  { "label": "Just me",    "value": "1" },
  { "label": "2 guests",   "value": "2" },
  { "label": "5+ guests",  "value": "5plus" }
]
```

- `label` is the visible text.
- `value` is the submission value (snake_case or kebab-case, never with spaces).
- For Checkbox: if `options` is present → multi-select; if absent → single boolean.

---

## 4 · `customHtml` — shell convention

The customHtml is the **outer rendering envelope** that the field stream is inserted into. The engine substitutes three token families:

| Token | Resolves to |
|---|---|
| `{{form:title}}` | The form's top-level `title`. |
| `{{form:description}}` | The form's `description`. |
| `{{form:submit}}` | The submit button text (`submitButtonText`). |
| `{{field:keyName}}` | The rendered HTML for one field (input + label + validation message). The renderer chooses the right widget based on `fields[…].type`. |
| `{{content:keyName}}` | The string at `settings.customContent[keyName]`. |

### 4.1 · Canonical shell structure

```html
<div class="mfp mfp-<slug>">
  <!-- 1. Decorative layer (optional): SVG illustrations, polaroids, gradients -->
  <div class="mfp-decor">…ambient SVG…</div>

  <!-- 2. Container/card wrapper -->
  <div class="mfp-container">
    <div class="mfp-card">

      <!-- 3. Header (always uses {{form:title}} + {{form:description}}) -->
      <header class="mfp-header">
        <h1 class="mfp-title">{{form:title}}</h1>
        <p class="mfp-subtitle">{{form:description}}</p>
      </header>

      <!-- 4. Sections — each is one logical group of fields -->
      <div class="mfp-section">
        <div class="mfp-section-label">
          <span class="mfp-section-icon">🦇</span>
          {{content:section_attendee}}
        </div>
        {{field:row_name}}
        {{field:row_contact}}
        {{field:guest_count}}
      </div>

      <div class="mfp-section">
        <div class="mfp-section-label">{{content:section_party}}</div>
        {{field:costume_type}}
        {{field:activities}}
        {{field:dietary}}
        {{field:special_requests}}
      </div>

      <!-- 5. Submit action -->
      <div class="mfp-actions">
        <button type="submit" class="mfp-submit">
          <span>{{form:submit}}</span>
        </button>
      </div>

    </div>

    <!-- 6. Footer note (optional) -->
    <div class="mfp-card-footer">
      <p>{{content:footer_note}}</p>
    </div>
  </div>
</div>
```

**Hard rules:**
- Root element is `<div class="mfp mfp-<slug>">` (both classes; mfp first).
- Every field referenced in customHtml MUST exist in `fields[]` by key.
- Every `{{content:X}}` token MUST have a key in `settings.customContent`.
- Use single quotes inside the JSON string for HTML attributes (the JSON serializer keeps backslash-free output): `<div class='mfp mfp-x'>` not `<div class=\"mfp mfp-x\">` if you want the file to be diff-friendly.
- The submit button MUST be `<button type="submit" class="mfp-submit">` so the runtime can capture clicks.

---

## 5 · `customCss` — styling convention

CSS lives entirely in `customCss` (the file MAY also `@import url(...)` Google Fonts at top). **All rules MUST be scoped to `.mfp.mfp-<slug>`** (double-class for specificity bump). This prevents the form's theme from leaking out onto the host DNN/Oqtane page.

### 5.1 · Required selector hierarchy

```css
/* 1. Root scope — declares CSS variables + base layout */
.mfp.mfp-<slug> {
  --<prefix>-bg:       #1a1a2e;
  --<prefix>-card:     #2d2d44;
  --<prefix>-primary:  #ff6b35;
  --<prefix>-text:     #f0f0f0;
  --<prefix>-border:   rgba(255,255,255,.1);
  font-family: 'Nunito', sans-serif;
  background: var(--<prefix>-bg);
  min-height: 100vh;
  padding: 20px;
  color: var(--<prefix>-text);
  width: 100%;
  box-sizing: border-box;
}

/* 2. Decorative pseudo-elements */
.mfp-<slug>::before { content: ''; …gradients/textures… }

/* 3. Container + card */
.mfp-<slug> .mfp-container { max-width: 720px; margin: 0 auto; }
.mfp-<slug> .mfp-card { background: var(--<prefix>-card); border-radius: 16px; padding: 40px; box-shadow: …; }

/* 4. Header */
.mfp-<slug> .mfp-header { text-align: center; margin-bottom: 32px; }
.mfp-<slug> .mfp-title { font-size: 32px; font-weight: 700; }
.mfp-<slug> .mfp-subtitle { color: var(--<prefix>-text-muted); }

/* 5. Sections */
.mfp-<slug> .mfp-section { margin-bottom: 28px; }
.mfp-<slug> .mfp-section-label { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 14px; }
.mfp-<slug> .mfp-section-icon { margin-right: 8px; }

/* 6. Field widgets — MUST style the engine's canonical classes */
.mfp-<slug> .mf-input,
.mfp-<slug> .mf-textarea,
.mfp-<slug> .mf-select { /* unified input look */ }
.mfp-<slug> .mf-input:focus,
.mfp-<slug> .mf-select:focus { /* focus state */ }
.mfp-<slug> .mf-input::placeholder { color: var(--<prefix>-text-muted); }
.mfp-<slug> .mf-field-label { /* per-field label above the input */ }
.mfp-<slug> .mf-required { color: var(--<prefix>-primary); }
.mfp-<slug> .mf-field-error { color: #ef4444; font-size: 12px; margin-top: 4px; }

/* 7. Option groups (Radio / Checkbox) */
.mfp-<slug> .mf-option-group { display: flex; flex-direction: column; gap: 8px; }
.mfp-<slug> .mf-option-group--cols { flex-direction: row; flex-wrap: wrap; }
.mfp-<slug> .mf-option-item { display: flex !important; align-items: flex-start; gap: 8px;
                              grid-template-columns: none !important; /* defeat any inherited grid */ }
.mfp-<slug> .mf-option-control { flex: 0 0 auto; width: 18px; height: 18px; }
.mfp-<slug> .mf-option-ui { flex: 1 1 auto; min-width: 0; }
.mfp-<slug> .mf-option-label { display: inline; white-space: normal; }

/* 8. Submit button */
.mfp-<slug> .mfp-actions { margin-top: 32px; }
.mfp-<slug> .mfp-submit { display: flex; align-items: center; justify-content: center;
                          width: 100%; padding: 16px 24px; border-radius: 12px;
                          background: var(--<prefix>-primary); color: #fff;
                          font-weight: 700; cursor: pointer; border: 0;
                          transition: transform .15s, box-shadow .2s; }
.mfp-<slug> .mfp-submit:hover { transform: translateY(-2px); box-shadow: 0 12px 24px rgba(0,0,0,.18); }

/* 9. Animations (optional) */
@keyframes <slug>Float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-20px)} }
```

### 5.2 · Mandatory canonical classes the engine emits

DO NOT invent. Style only these classes (full list from runtime):

| Class | Role |
|---|---|
| `.mf-field-group` | Wraps one field block (label + input + error). |
| `.mf-field-label` | The above-input label. |
| `.mf-required` | The `*` asterisk span next to a required label. |
| `.mf-field-error` | Inline validation message div. |
| `.mf-input` | Single-line text/email/phone input. |
| `.mf-textarea` | Multi-line textarea. |
| `.mf-select` | Native `<select>`. |
| `.mf-option-group` | Wrapper for radio/checkbox lists. |
| `.mf-option-group--cols` | Modifier — lays options horizontally. |
| `.mf-option-item` | One `<label>` for a radio/checkbox option. |
| `.mf-option-control` | The `<input type=radio|checkbox>`. |
| `.mf-option-ui` | Wrapper around label text (sibling of control). |
| `.mf-option-label` | Inline span containing the option's display text. |
| `.mf-row`, `.mf-row-col` | Row layout cells (auto-emitted from `Row` field). |

### 5.3 · CSS variable naming convention

Use a 2–4 letter PREFIX matching the theme (`hw` for halloween, `rose` for rose, `wd` for wedding):
- `--<pfx>-bg` page bg
- `--<pfx>-card` card surface
- `--<pfx>-primary` brand accent
- `--<pfx>-primary-light` / `--<pfx>-primary-dark`
- `--<pfx>-text` / `--<pfx>-text-muted`
- `--<pfx>-border`
- semantic accents (e.g. `--hw-orange`, `--hw-green`)

When using `themeSelector`, ALSO emit the standard set the script writes into: `--background, --foreground, --card, --card-foreground, --primary, --primary-foreground, --secondary, --secondary-foreground, --muted, --muted-foreground, --accent, --accent-foreground, --border, --input, --ring`.

---

## 6 · `rules[]` — conditional logic

Used to show/hide fields based on user input. Skeleton:

```json
"rules": [
  {
    "id": "other_style_toggle",
    "name": "Toggle other_style",
    "enabled": true,
    "priority": 1,
    "when": {
      "type": "rule",
      "field": "event_style",
      "operator": "eq",
      "value": "other"
    },
    "then": [
      { "id": "other_style_show", "action": "show", "targetType": "field", "target": "other_style" }
    ],
    "else": [
      { "id": "other_style_hide", "action": "hide", "targetType": "field", "target": "other_style" }
    ]
  }
]
```

**Operators:** `eq, ne, contains, not_contains, gt, lt, gte, lte, empty, not_empty, in, not_in`
**Actions:** `show, hide, enable, disable, require, unrequire`
**targetType:** `field` (most common), `section`, `group`

For complex AND/OR chains, nest `when` blocks with `"type":"group", "logic":"and"|"or", "children":[…]`.

---

## 7 · Visual taxonomy of existing Premium templates

| Template family | mfp-class | Signature element |
|---|---|---|
| Halloween Party | `mfp-halloween` | Animated floating ghosts (SVG), purple+orange gradient, Creepster headings. |
| Wedding Scrapbook | `mfp-wedding-scrapbook` | Tilted polaroids on left aside, paper-textured form, romantic serif. |
| Italian Romantic / Law Firm | `mfp-italian-romantic`, `mfp-italian-law` | Cream + gold + serif; classical column dividers. |
| French Invitation | `mfp-fr-inv` | Cream stationery look, monogram, lined paper. |
| Coachella Festival | `mfp-coachella` | Sunset gradient, palm SVG silhouettes, festival pass cards. |
| Rose Festival | `mfp-rose-festival` | 6-preset themeSelector (Damask/English/Wild Briar/Midnight/Dew/Garden Dusk). |
| Aurora Style | `mfp-aurora-style` | Diamond logo, neutral premium beige, fashion editorial. |
| Job Application | `mfp-job-app`, `mfp-v0-job` | Two-column grid, clean white card, professional. |
| Cherry Blossom | `mfp-cherry-blossom` | Sakura petals SVG, pink palette. |
| Halloween / Sunset / Sweet Holiday Rose | `mfp-warm-sunset`, `mfp-rose-garden` | Warm gradient backgrounds. |
| New Orleans Mardi Gras | `mfp-mardi-gras` | Beads + jester graphics, purple/gold/green. |
| World Cup 2026 | `mfp-worldcup` | Geometric flag pattern, bold sport typography. |

Each template uses the same field-engine output classes but invents its own MFP-scoped visual envelope.

---

## 8 · One-shot AI prompt (paste verbatim)

```
You are an authoring assistant for the MegaForm Premium template format.

GOAL
Produce ONE valid `.json` file (UTF-8, no BOM, no trailing comma) that defines a
premium-themed form for the purpose I give you. The file must conform exactly
to the spec at `docs/PREMIUM_FORM_TEMPLATE_SPEC.md` (this document).

WHAT YOU MUST CHANGE
- `title`, `description`, `submitButtonText`, `successMessage`, `icon`, `slug`
- `category`, `categories`
- `fields[]` (pick the right field types + labels + options + rules for the purpose)
- `customContent` (section headers + any decorative copy used in customHtml)
- `customHtml` token references (rename `{{field:row_X}}` to match your field keys
  and pick a layout that fits the purpose — header + 2-3 sections + actions)
- The mfp class suffix and CSS variable prefix (e.g. `mfp-event-rsvp`, `--evrsvp-bg`)
- The COLOR VALUES inside `customCss` (and `themeSelector.presets` if used) so the
  palette matches the form's mood — but the CSS STRUCTURE (selectors, properties,
  media queries) must mirror an existing Premium template's CSS file verbatim.

WHAT YOU MUST NOT CHANGE OR INVENT
- The top-level JSON envelope (`version, slug, title, ..., workflow`) — copy exactly.
- The settings duplication pattern — write `customHtml`, `customCss`, `rules`,
  `submitButtonText`, `successMessage` BOTH at top level AND under `settings`.
- The field-engine canonical classes — `.mf-input, .mf-textarea, .mf-select,
  .mf-option-group, .mf-option-item, .mf-option-control, .mf-option-ui,
  .mf-option-label, .mf-field-label, .mf-required, .mf-field-error, .mf-row,
  .mf-row-col, .mf-field-group`. Only style these; never rename or invent.
- The `.mfp.mfp-<slug>` double-class scope on every customCss rule.
- The token system: `{{form:title}}, {{form:description}}, {{form:submit}},
  {{field:KEY}}, {{content:KEY}}`. No other token syntax exists.
- The supported field types: `Text, Email, Phone, Textarea, Select, Radio,
  Checkbox, Row, Section`. No other types are valid in Premium.
- The customScripts.theme_selector IIFE — if you use themeSelector, copy the
  script body byte-for-byte from `Rose_festival_row_based_OK.json` and ONLY
  change the `SCOPE`, `PFX`, and `DEFAULT` constants near the top.
- The CheckboxPad patch `body .mfp.mfp .mf-option-item { display:flex !important;
  ... }` MUST appear at the START of customCss — copy from any existing Premium
  template. This guarantees checkbox labels render single-line.

REQUIRED OUTPUT SHAPE
{
  "version": "1.0",
  "slug": "<unique-kebab-case>",
  "title": "...",
  "description": "...",
  "category": "general",
  "categories": ["..."],
  "icon": "<single emoji>",
  "submitButtonText": "...",
  "successMessage": "...",
  "settings": {
    "theme": "modern-blue",
    "multiPage": false,
    "customContent": { ... },
    "submitButtonText": "...",
    "successMessage": "...",
    "customHtml": "<duplicate of top-level customHtml>",
    "customCss":  "<duplicate of top-level customCss>",
    "rules": [ ... ],
    "workflowTemplate": null
  },
  "fields": [ ... ],
  "customHtml": "<div class='mfp mfp-<slug>'>...</div>",
  "customCss": ".mfp.mfp-<slug>{...}",
  "rules": [ ... ],
  "workflow": null
}

HARD RULES
1. The mfp suffix in customHtml MUST equal the mfp suffix in EVERY customCss
   selector. If they diverge, the page won't style at all.
2. Every `{{field:KEY}}` in customHtml MUST have a matching entry in fields[].
3. Every `{{content:KEY}}` in customHtml MUST have a key in settings.customContent.
4. `fields[].columns[].span` values per Row sum to 12.
5. customCss MUST be self-scoped — every selector starts with `.mfp.mfp-<slug>`
   or `.mfp-<slug>` (after the root rule).
6. Use ONLY images from `https://images.unsplash.com/photo-<id>?w=...&h=...&fit=crop`.
   Verify URLs return HTTP 200 before including them. Avoid IDs known dead:
   `1584345604476-8ec5f82d718d`, `1542261021-08d4d794b00d`.
7. The submit button is always `<button type="submit" class="mfp-submit">…</button>`.
8. workflow is null.
9. Do NOT add fields with type other than the 9 supported. Do NOT invent CSS
   classes outside the `.mf-*` engine classes and your own `.mfp-<slug>-*` /
   `mfp-<slug> .<your-decor>` scope.

INPUT YOU WILL RECEIVE
- The form's purpose (e.g. "wedding caterer booking", "tech conference RSVP",
  "veterinary clinic appointment").
- Optional: a reference Premium template to mirror the palette/aesthetic from.

OUTPUT
A single fenced ```json``` code block containing the full template. Do not
include commentary, markdown headers, or trailing text. The file must parse
with `JSON.parse()` in Node.js without errors.
```

---

## 9 · Mini sanity checklist (run before shipping a generated template)

- [ ] `JSON.parse(fileContent)` succeeds.
- [ ] `slug` is kebab-case, unique vs other Premium files.
- [ ] mfp class in customHtml ≡ mfp class in every customCss selector.
- [ ] All `{{field:K}}` tokens have a field with key=K in `fields[]`.
- [ ] All `{{content:K}}` tokens have a key=K in `settings.customContent`.
- [ ] Every Row's `columns[].span` sums to 12.
- [ ] No field uses a type outside the 9 supported.
- [ ] customCss starts with the CheckboxPad block.
- [ ] customHtml ends with `<button type="submit" class="mfp-submit">…</button>` inside `<div class="mfp-actions">`.
- [ ] No Unsplash URL in the file returns 404 (head-check with `curl -I`).
- [ ] `submitButtonText`, `successMessage`, `customHtml`, `customCss`, `rules` appear in BOTH top level and `settings`.
- [ ] `workflow` is `null`.

---

## 10 · Source for further patterns

To learn a specific visual idiom (animated SVG decor, polaroid asides, oklch theme picker, etc.), read the corresponding file in the source folder:

- **Floating animated SVG decor** → `halloween-party-registration.json` (ghosts), `cherry-blossom-festival-registration.json` (petals), `new-orleans-event-registration.json` (jesters).
- **Layered grid with image aside** → `wedding-scrapbook-story.json` (`scrap-grid`), `coachella-festival-registration.json` (festival hero).
- **6-preset themeSelector with oklch palette** → `Rose_festival_row_based_OK.json`. The IIFE script body is the canonical one.
- **Two-column applicant grid + sections** → `V0job-application-form-v20260419-06.json`, `job-application-form.json`, `elegant-nature-job-application.json`.
- **Centered consultation with monogram** → `aurora-style-consultation.json`, `italian-law-firm-consultation.json`, `french-product-consultation-form-fixed-final.json`.
- **Festival pass selector with pricing cards** → `coachella-festival-registration.json`.
- **Multi-card slider for product/vehicle browsing** → `american-auto-dealership-registration.json`, `french-product-consultation-form-fixed-final.json`.
- **RTL-ready form** (mirror the structure but flip `direction: rtl`) — none in Premium yet; see `Others Forms/RTL` for canonical RTL examples.

For each new form, find the **closest visual match** in the list above, copy its `customHtml` and `customCss` as the starting skeleton, then change ONLY:
1. The mfp suffix.
2. The CSS variable prefix and color values.
3. The token references (`{{field:KEY}}`, `{{content:KEY}}`).
4. The `fields[]` and `settings.customContent` to match the new purpose.

Never invent CSS structure, never invent class names, never change the engine classes.
