# MegaForm — Iframe Isolation (IframeIsolation v20260421-02)

## History

- **v20260421-01** — Initial cut. Bailed out when `cfg.container` was missing.
  Worked for Web/Oqtane where callers pass container; **failed on DNN** where
  `FormView.ascx` pre-builds skeleton server-side and calls `init()` without
  a container → isolator skipped → form rendered inline → DNN CSS bled in.
- **v20260421-02** — DNN fix. Added fallback chain when `container` is absent:
  1. `cfg.container` (explicit)
  2. `#mf-form-wrapper-{formId}` — pre-built wrapper (DNN/Oqtane/Web live mode)
  3. `#mf-form-mount` — generic standalone mount
  Plus safety guard: skip wrap if mount is inside builder preview.

## Problem

Form rendered by DNN module was injected directly into DOM, so DNN skin CSS
(Bootstrap, theme) affected the form (headings, buttons, font-family,
margin/padding...). Triệu chứng: form `144`/`159` trên `dnn10322_megaf.ai`
render inline, không có iframe, CSS bleed.

Console snapshot **before** fix:
```
outerBadge: "IframeIsolation v20260421-01"
hasChromelessIframe: false                    ← FAIL — no wrap
iframeSrc: null
mountEls: [...mf-form-wrapper-159...]         ← wrapper exists, not used
```

## Fix (3 canonical files)

### 1. `MegaForm.UI/src/renderer/megaform-renderer.ts`  (MODIFY)
- Badge `IFRAME_ISOLATION_BADGE` / `IFRAME_ISOLATION_INNER_BADGE` = `v20260421-02`
- `RendererConfig.isolation?: 'iframe' | 'inline'` (local interface)
- ~110 lines of isolator helpers before `init()`:
  - `isInsideChromelessFrame()` — detect `?mfchromeless=1`
  - `resolveIsolationMount()` — resolve string|HTMLElement
  - `buildIsolationInnerUrl()` — build same-origin inner URL
  - `wrapMountInIsolationIframe()` — create iframe, listen `mf:resize`
  - `applyIframeIsolation()` — master gate with **fallback chain**
- `if (applyIframeIsolation(cfg)) return;` at top of `init()`
- Expose `window.__MF_IFRAME_ISOLATION_BADGE__`

### 2. `MegaForm.UI/src/renderer/helpers.ts`  (MODIFY)
- Added `isolation?: 'iframe' | 'inline'` to exported `RendererConfig`

### 3. `MegaForm.Oqtane.Client/Index.razor`  line 457  (MODIFY)
- Dropped `&& !_embedMode` so inner chromeless iframe boots renderer too

## Behavior table

| Signal | Result |
|---|---|
| `cfg.isolation === 'inline'` | inline (opt-out) |
| `cfg.isPreview === true` | inline (builder/theme designer) |
| URL has `mfchromeless=1` | inline, inner badge set |
| Mount is inside `[data-mf-builder-preview]` / `#mf-builder-root` | inline (safety) |
| `cfg.formId <= 0` | inline |
| Container resolvable (explicit / `#mf-form-wrapper-{id}` / `#mf-form-mount`) | **wrap in iframe** |

## Verify bundle

```
grep -c "IframeIsolation v20260421-02" DesktopModules/MegaForm/Assets/js/megaform-renderer.js
# expect 5
grep -c "IframeIsolation v20260421-01" DesktopModules/MegaForm/Assets/js/megaform-renderer.js
# expect 0
```

All 4 bundles identical (md5 should match across them).

## Browser verification snippet

```js
JSON.stringify({
  outerBadge: window.__MF_IFRAME_ISOLATION_BADGE__,
  innerBadge: window.__MF_IFRAME_ISOLATION_INNER_BADGE__,
  rendererType: typeof MegaFormRenderer,
  hasChromelessIframe: !!document.querySelector('iframe[src*="mfchromeless"]'),
  iframeSrc: document.querySelector('iframe[src*="mfchromeless"]')?.src || null
}, null, 2)
```

Expected on OUTER DNN page after deploy:
```
{
  "outerBadge": "IframeIsolation v20260421-02",
  "rendererType": "object",
  "hasChromelessIframe": true,                   ← now TRUE
  "iframeSrc": "http://.../MegaForm/...?formid=159&embed=1&mfchromeless=1"
}
```

## Cache-bust notice

Live DNN bundle URL had `?v=216?cdv=88` / `?v=216?cdv=89` (two `?`).
Bump to `?v=217` so browsers purge. Hard refresh (Ctrl+F5) also works.

## NOT changed

- `megaform-embed.js`
- `MegaForm.DNN/Views/FormView.ascx*` (DNN view untouched — canonical rule)
- `MegaForm.Web/Views/Form/View.cshtml`
