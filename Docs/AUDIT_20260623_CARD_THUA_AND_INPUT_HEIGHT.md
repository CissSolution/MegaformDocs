# Audit 2026-06-23 — "Card thừa" + textbox height on AI / standard-template forms

**Reporter:** user (Visual QA, Oqtane live `http://localhost:5070/` vs mock
`http://localhost:3050/forms/event-registration`).
**Symptoms (browser-measured, not guessed):**
1. Rendered MegaForm forms show an **extra card** wrapped around the form body
   (a card-in-a-card) vs the mock's single clean card.
2. Textboxes are **taller** than the mock controls.

All numbers below were measured live with Chrome DevTools `getComputedStyle` /
`getBoundingClientRect`, comparing the mock and the live "Get In Touch" premium
form (`mf-theme-pure-grid-premium`, custom-HTML / `.mfp` shell).

---

## Finding 1 — "Card thừa" (double card)

### Measured DOM nesting on the live form
```
.mf-form-wrapper                (transparent)
 └ .mf-form-inner               (transparent)
    └ .mf-form                  (transparent)
       └ .mf-fields-container   (transparent)
          └ .mfp.mfp-pure-grid  ← WHITE bg + 1px border + 8px radius   ▲ CARD #1 (the "card thừa")
             └ .mfp-container   (transparent, padding 16/20)
                └ .mfp-card     ← WHITE bg + box-shadow + 8px radius   ▲ CARD #2 (the template's real card)
                   └ .mfp-card-body → fields
```

### Root cause (exact)
`megaform.css` intentionally makes `.mfp` transparent when nested inside
`.mf-form-inner` (the "killer" rule:
`.mf-form-wrapper > .mf-form-inner .mfp { background:transparent!important; border:0!important }`).

But the **custom-shell compatibility CSS** — generated in two mirrored places:
- `MegaForm.UI/src/renderer/index.ts` → `buildCustomShellCompatibilityCss()`
- `MegaForm.Core/Services/CustomShellCompatibilityCssService.cs` → `Build()`

emits an **ID-scoped** rule
`#mf-form-wrapper-{id} .mfp[class*="mfp-"] { background:#fff!important; border:1px solid …!important; border-radius:8px!important }`.
Because it carries an `#id` it out-specifies the killer rule and **forces `.mfp`
to become a card** — for **every** custom-HTML form, with no check for whether the
template already provides its own inner card.

Premium templates come in two structural families:
- **card-on-root** (e.g. `.mfp-default`, `.mfp-australia`): `.mfp` itself IS the card →
  card chrome on `.mfp` is correct.
- **card-in-child** (e.g. `.mfp-pure-grid`: `.mfp > .mfp-container > .mfp-card`): the card
  is `.mfp-card`; the template already styles it (white + shadow). Forcing chrome on `.mfp`
  too ⇒ **double card**.

### Fix
Guard the `.mfp` card chrome (background + border) with
`:not(:has(.mfp-card)):not(:has(.fr-card))` so it applies **only** when `.mfp` has no
inner card. When an inner card exists, `.mfp` stays transparent/borderless (the
megaform.css killer rule wins) → single card. `:has()` is supported on every modern
browser the renderer targets (verified `CSS.supports('selector(:has(*))') === true`
on the live page).

Applied to both mirrors (`renderer/index.ts` + `CustomShellCompatibilityCssService.cs`);
badge bumped to `CustomShellBuilderCompat v20260623-B243-cardthua`.

---

## Finding 2 — Textbox height (45px vs mock 36px)

### Measured
| | height | font-size | line-height | padding (v) | border |
|---|---|---|---|---|---|
| **Mock control** (`/forms/event-registration`) | **36px** | 14px | 20px | 4px | 1px |
| **Admin shell** (`megaform-admin-shell.css .mf-input`) | 36px (`2.25rem`) | 14px | — | 0 | 1px |
| **Live rendered form** (`megaform.css .mf-input`) | **45px** | 15px | 22.5px | 10px | 1px |

`44.5px = line-height(22.5) + padding(10+10) + border(2)`.

### Root cause
`megaform.css` `:root/.mf-form-wrapper` set the renderer defaults
`--mf-input-padding: 10px 14px` and `--mf-input-font-size: 15px`, plus
`--mf-input-unified-height: 40px`. The admin shell and the mock both use a **36px /
14px** baseline, so the **form renderer was the outlier**. The `B47` comment even
claims 40px was chosen "to match the canonical form-builder-controls reference" —
but the real mock control is **36px** (`h-9`), so that target was mis-measured.

### Fix (CSS only — no DLL)
In `Assets/css/megaform.css`:
- `--mf-input-padding: 10px 14px` → `5px 12px`
- `--mf-input-font-size: 15px` → `14px`
- `--mf-input-unified-height: 40px` → `36px`

Note: the rendered control font stays **15px** because a separate `!important` reset
(`.mf-form-wrapper input,… { font-size: var(--mf-font-size-base,15px)!important }`) wins
over `--mf-input-font-size`. We deliberately did NOT lower `--mf-font-size-base` (it
scales every form label/help text product-wide and the user only reported height). So
with the 15px font (line-height 22.5px): `22.5 + padding(5+5) + border(2) = 34.5px`,
floored by the 36px unified `min-height` → **36px**, matching the mock exactly. The
unified-height var is shared by multi-select / phone / appointment triggers, so they stay
flush at the same new height. (If a future task wants the text to match the mock's 14px
too, set `--mf-font-size-base: 14px` and revert padding to `6px 12px`.)

---

## Files changed
- `MegaForm.UI/src/renderer/index.ts` — `:has()` guard + badge (rebuild via `BuildTS.ps1 renderer`).
- `MegaForm.Core/Services/CustomShellCompatibilityCssService.cs` — mirrored `:has()` guard (SSR parity; needs Core rebuild for DNN/Oqtane SSR path).
- `Assets/css/megaform.css` — input height vars → 36px / 14px.

## Deploy + Verification
Built `BuildTS.ps1 renderer` (regenerates `megaform-renderer.js` + syncs `megaform.css`),
then copied `megaform-renderer.js` + `megaform.css` to the **live** Oqtane instance
`E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\wwwroot\Modules\MegaForm\` (the running
`Oqtane.Server.exe --urls http://localhost:5070`).

Re-measured on `http://localhost:5070/` (cache-bypass reload) after deploy:
- `.mfp` (with inner `.mfp-card`): `background = rgba(0,0,0,0)`, `border = 0px none` → not a card.
- Visible card layers inside the wrapper: **1** (was 2).
- `.mf-input` heights: **[36, 36, 36, 36] px** (was 45px). Matches the mock.

### Note on the C# SSR mirror
`CustomShellCompatibilityCssService.cs` was updated for parity but the live `:5070`
verification ran through the **client** renderer (`megaform-renderer.js`), which is what
emits the inline compat `<style>` here. The C# change only takes effect on the SSR path
once `MegaForm.Core` is rebuilt and redeployed (DNN package / Oqtane server restart) —
not done in this session to avoid restarting the user's live server unprompted.
