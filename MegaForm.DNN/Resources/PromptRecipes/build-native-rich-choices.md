# Recipe: Native rich CHOICE controls (cards / chips) — no custom HTML

## When to use
The user wants Radio / Checkbox options to look RICH — pricing cards, selectable
"pass" tiers, pill/chip tag pickers, option cards with title + description + price
badge + icon — like a premium booking/registration form.

**Do this with NATIVE field properties, NOT hand-written `<input type=radio>` inside
`customHtml`.** Native = the Admin can edit every option in the Builder Options panel,
the AI can generate it from a tiny JSON shape, validation/rules/submission all work,
and there is no fragile embedded markup or script to maintain.

> Anti-pattern (avoid): putting `<div class='fi-pass-list'><label><input type='radio' …>`
> blocks in `customHtml`. That bypasses the engine — Admin can't edit options, AI can't
> reason about them, and the rich look is locked into brittle HTML.

## The schema (what the runtime renderer understands)
Set these on the **field** (Radio or Checkbox):

| Field prop        | Values                          | Effect |
|-------------------|---------------------------------|--------|
| `optionDisplay`   | `"default"` \| `"chips"` \| `"cards"` | layout of the option group |
| `allowOptionHtml` | `true` \| `false` (default false) | allow sanitized HTML in `richHtml`/`labelHtml` |
| `optionColumns`   | `1`–`4` (optional)              | force a column count (else auto) |

Per **option** (each entry in `options[]`) — all optional except `label`/`value`:

| Option key    | Renders as                  | Example |
|---------------|-----------------------------|---------|
| `label`       | the bold option title       | `"Terrazza"` |
| `value`       | submitted value             | `"terrazza"` |
| `description` | muted sub-line (aliases: `desc`,`helpText`,`subLabel`) | `"Posto riservato, cena a 4 portate"` |
| `meta`        | small kicker line (aliases: `location`,`kicker`) | `"Berlin · Paris · Madrid"` |
| `badge`       | pill on the right (great for PRICE) | `"€95"` |
| `icon`        | leading icon/emoji (text or HTML if `allowOptionHtml`) | `"🍷"` |
| `richHtml`    | full custom label HTML (needs `allowOptionHtml:true`; sanitized) | `"<b>VIP</b> …"` |

Rendered DOM (so themers know the hooks): `.mf-option-group--cards` / `--chips` wraps
`.mf-option-item` → `.mf-option-ui` (the card/chip box) → `.mf-option-icon`,
`.mf-option-copy` (`.mf-option-label` + `.mf-option-meta` + `.mf-option-desc`),
`.mf-option-badge`, `.mf-option-check`. Selected state = `.mf-option-item.is-checked`
(also matched via `:has(.mf-option-control:checked)`). The card border/padding live on
`.mf-option-ui` (NOT the label).

## Minimal example — pricing cards + diet chips
```json
{
  "key": "experience", "type": "Radio", "label": "Scegli la tua esperienza",
  "required": true, "optionDisplay": "cards",
  "options": [
    { "label": "Piazza",   "value": "piazza",   "description": "Accesso generale, degustazioni e musica dal vivo", "badge": "€45" },
    { "label": "Terrazza", "value": "terrazza", "description": "Posto riservato, cena a 4 portate e vini selezionati", "badge": "€95" },
    { "label": "Villa",    "value": "villa",    "description": "Esperienza completa, tavolo privato e chef incontro", "badge": "€180" }
  ]
},
{
  "key": "dietary", "type": "Checkbox", "label": "Preferenze alimentari",
  "optionDisplay": "chips",
  "options": [
    { "label": "Vegetariano", "value": "vegetariano" },
    { "label": "Vegano", "value": "vegano" },
    { "label": "Senza glutine", "value": "senza_glutine" },
    { "label": "Senza lattosio", "value": "senza_lattosio" },
    { "label": "Pescetariano", "value": "pescetariano" }
  ]
}
```
That alone renders bordered selectable cards (title + description + price badge + check)
and pill chips — responsive (1/2/3 cols by count, single col for cards). No HTML, no JS.

## Optional brand skin (still no HTML)
If a brand colour is wanted, add a SMALL `customCss` that only recolours the native hooks —
never hand-write the options. Example (festa burgundy):
```css
.mf-option-group--cards .mf-option-item.is-checked .mf-option-ui,
.mf-option-group--cards .mf-option-item:has(.mf-option-control:checked) .mf-option-ui{ border-color:#9d2235; background:#fbeef0; }
.mf-option-badge{ color:#9d2235; border-color:#e7c3c9; background:#fbeef0; }
.mf-option-group--chips .mf-option-item.is-checked .mf-option-ui,
.mf-option-group--chips .mf-option-item:has(.mf-option-control:checked) .mf-option-ui{ background:#9d2235; border-color:#9d2235; color:#fff; }
```

## Reference template
`DefaultTemplates - Deployed/Premium/festa-italiana-native.json` — full registration form
using ONLY native fields + this tiny CSS skin (cards + chips), no customHtml/script.
Compare with the legacy `festa-italiana-registration.json` which hand-writes the same
controls in customHtml (the thing to migrate AWAY from).

## Migration note (custom-HTML → native)
When a legacy template hand-writes the controls, replace the hand-written block with the
native field token and move the rich data onto the field's `options[]`:
- `<div class='fi-pass-list'>…3 radio cards…</div>`  →  `{{field:pass}}`  + `pass.optionDisplay="cards"` + per-option `description`/`badge`.
- `<div class='fi-chip-list'>…checkboxes…</div>`      →  `{{field:dietary}}` + `dietary.optionDisplay="chips"`.
Keep the outer layout/wizard; only the control block becomes a `{{field:key}}` token.
Watch for DOUBLE labels (native field renders its own `label` — drop the hand-written
label row, or set the field `label` to match the section title).

## Builder (Admin) equivalence
Everything above is exposed in the Builder → field Options panel: **Choice Display**
(default/chips/cards), **Allow sanitized HTML in labels**, **Columns**, a **Sample template**
one-click picker (below), plus per-option rows for description / badge / icon / Rich HTML.
So Admins reproduce any of this without code.

## One-click "Sample template" starters (Builder → Options)
The Builder ships ready-made starters that fill `options[]` AND set Choice Display / Allow-HTML /
Columns in one click: **Pricing cards** (price + features), **Plan cards** (badge + description),
**Feature cards** (icon + blurb), **Yes/No cards**, **Satisfaction cards** (emoji), **Interest chips**
(emoji tags), **Size chips** (S/M/L/XL), **Rich HTML card** (custom markup). The AI can emit the same
shapes directly — e.g. an interest-chip set is `optionDisplay:"chips"` + options each with an `icon` emoji;
a pricing set is `optionDisplay:"cards"` + options with `meta`/`description`/`badge`.

## Complete option-object reference (authoritative — for the AI)
Copy-paste shape; every key except `label`/`value` is optional:
```json
{ "label": "Pro", "value": "pro",
  "description": "10 projects · priority support",    // muted sub-line — aliases: desc, helpText, subLabel
  "meta": "Most popular",                              // small kicker line — aliases: location, kicker
  "badge": "$29/mo",                                   // pill on the right — PLAIN TEXT ONLY (HTML is escaped)
  "icon": "⭐",                                         // leading emoji/icon (HTML only if allowOptionHtml) — alias: iconHtml
  "richHtml": "<strong>Pro</strong> <small>…</small>"  // full custom label; needs field.allowOptionHtml:true; sanitized — aliases: labelHtml, html
}
```
Rules the AI MUST respect:
- **`badge` is TEXT only** — HTML is escaped. Put price/short labels here, never markup.
- **`richHtml` is sanitized** — only these tags survive: `a b br code div em i li ol p small span strong sub sup u ul`;
  only attrs `class title aria-label` (plus `href target rel` on `<a>`). Stripped: `style`, `on*` handlers,
  `<script>`, `<img>`, `<button>`, `javascript:` URIs. Must set `allowOptionHtml:true` on the field to use it.
- **`optionColumns`** auto-responsive when omitted: cards stack (≈1 col), chips wrap inline (≈2–3). Set `1`–`4` to force.
- **Prefer structured keys** (`icon` + `meta` + `description` + `badge`) over `richHtml` — Admin-editable and always safe.
- **Never** emit `<input type=radio>`/`<label>` inside `customHtml` — use the native field + `options[]`.
