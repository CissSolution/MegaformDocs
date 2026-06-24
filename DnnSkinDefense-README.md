# MegaForm — DNN Skin Defense (DnnSkinDefense v20260421-01)

## History

- **v20260421-01 (IframeIsolation)** — attempted full iframe wrap.
  Reverted: DNN same-page iframe pulled the whole DNN skin/admin UI
  inside the iframe recursively (screenshot evidence).
- **v20260421-02 (IframeIsolation)** — added DNN fallback to find
  `#mf-form-wrapper-{formId}`. Still broken — iframe src is same
  DNN page, so DNN re-renders nav/logo/admin-dock inside.
- **v20260421-01 (DnnSkinDefense)** — switched strategy. No iframe.
  Scoped CSS reset inside `megaform.css` that defends form typography,
  controls, links, lists, Bootstrap primitives with `!important`.
  Customization via theme CSS vars and Theme Designer still works
  — `var()` fallbacks let user-chosen values win over defense defaults.

## What changed

### Canonical files REVERTED to zip baseline

| File | Status |
|---|---|
| `MegaForm.UI/src/renderer/megaform-renderer.ts` | reverted |
| `MegaForm.UI/src/renderer/helpers.ts` | reverted |
| `MegaForm.Oqtane.Client/Index.razor` | reverted (line 457: `_embedMode` guard restored) |

### Canonical CSS APPENDED (additive, no removal)

| File | Status |
|---|---|
| `Assets/css/megaform.css` | +138 lines skin defense block at EOF |

All 5 platform mirrors synced (identical md5):
- `Assets/css/megaform.css`
- `MegaForm.Web/wwwroot/megaform/css/megaform.css`
- `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/css/megaform.css`
- `DesktopModules/MegaForm/Assets/css/megaform.css`
- `MegaForm.Umbraco/wwwroot/css/megaform.css`

## What the defense covers

| Category | Elements | Strategy |
|---|---|---|
| Typography | `h1-h6`, `p` | `!important` font-family/weight/margin with `var()` fallbacks |
| Controls | `button, input, select, textarea` | Font + box-sizing reset |
| Text inputs | `.mf-input, .mf-textarea, .mf-select` | BG/color/border/radius locked with `!important` |
| Links | `a, a:link, a:visited` | Color locked to `--mf-link-color` |
| Lists | `ul, ol, li` | Margin/padding/indent reset |
| Bootstrap | `.container, .row, [class*="col-"]` | Reset margin/padding when wrapping form |
| Bootstrap form | `.form-control, .form-group` | Strip background/border/shadow |
| Tables | `table, tr, td, th` | Neutralize if DNN wraps in table |

## Verification snippets

### Does defense CSS load?
```js
getComputedStyle(document.querySelector('.mf-form-wrapper'))
  .getPropertyValue('--mf-skin-defense-badge')
  .trim()
// expect: "'DnnSkinDefense v20260421-01'"
```

### Is heading defended?
```js
const h = document.querySelector('.mf-form-wrapper h2');
if (h) {
  const cs = getComputedStyle(h);
  console.log({
    font: cs.fontFamily,            // should NOT be "Arial" (DNN default)
    weight: cs.fontWeight,          // should be 700 or theme override
    margin: cs.margin               // should be "0px 0px 12px" or theme override
  });
}
```

### Is iframe isolation really gone?
```js
typeof window.__MF_IFRAME_ISOLATION_BADGE__
// expect: "undefined"
document.querySelectorAll('iframe[src*="mfchromeless"]').length
// expect: 0
```

## How theme customization beats defense

Defense rules use:
```css
font-family: var(--mf-title-font-family, var(--mf-font-family, inherit)) !important;
```

User sets `--mf-title-font-family: 'Cormorant Garamond'` in Theme Designer
customCss → `var()` resolves → wins the `!important` game.

So the defense only kicks in for things the user hasn't themed — exactly
where DNN skin would bleed.

## What the defense does NOT cover

- Animation/keyframe styles
- Pseudo-element content (`::before`, `::after`)
- Unusual properties (cursor, caret-color)
- Custom widget shells rendered by plugin JS

If a DNN skin still bleeds through for a specific form/element, open
Theme Designer and add targeted `!important` overrides in customCss —
that is the intended escape hatch.

## Cache-bust after deploy

`megaform.css` version string on DNN: bump `?v=217` (current `?v=216`).

## Deploy checklist

1. Copy `DesktopModules/MegaForm/Assets/css/megaform.css` to DNN server
2. Copy `DesktopModules/MegaForm/Assets/js/megaform-renderer.js` (reverted,
   no iframe isolation) to DNN server
3. Bump cache-bust version
4. Hard-reload (Ctrl+F5)
5. Run the console snippets above to verify
