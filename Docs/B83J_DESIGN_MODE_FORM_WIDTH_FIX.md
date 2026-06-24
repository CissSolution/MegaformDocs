# B83j — Design Mode Form Width Fix (Handoff)

> **Date**: 2026-06-06  
> **Scope**: Center canvas form width in Theme Designer (Design Mode)  
> **Status**: ✅ Shipped & deployed to DNN + Oqtane

---

## Problem Statement

Form preview in **Theme Designer / Design Mode** appeared ~40–50% narrower than the **runtime** (public page) preview. On a 1366–1600px viewport the form was collapsing from 2-column grid to 1-column stack, making the preview look "shrunk" compared to the live form.

| Mode | Approx width | Grid |
|---|---|---|
| Runtime (`?formId=1`) | 960px | 2-column |
| Design Mode (before fix) | 500–720px | 1-column collapsed |

---

## Root Cause

Two independent constraints were stacking:

1. **Builder canvas CSS cap** (`megaform-builder-ts.css`)  
   `.mf-canvas-dropzone .mf-form-wrapper` had `max-width: 720px !important;` while runtime `megaform.css` defaults to `max-width: 960px`. This alone reduced width by 25%.

2. **Iframe srcdoc padding** (`canvas.ts` B58)  
   The runtime preview iframe injected in Design Mode used `.mf-form-wrapper { padding: 24px 16px !important; }`, eating ~32–48px of the already-narrow canvas area.

3. **Canvas area itself** is viewport − left rail (~288px) − right rail (~300px) − dropzone padding (48px). On a 1366px laptop this leaves only ~700px for the iframe, so a 720px cap hits almost immediately and the extra iframe padding pushes effective content width down to ~650px.

---

## Fix Applied

### 1. Builder canvas `max-width` bumped to match runtime

**File**: `MegaForm.UI/src/styles/megaform-builder-ts.css`

```css
/* BEFORE */
.mf-canvas-dropzone .mf-form-wrapper {
  max-width: var(--mf-form-max-width, 720px) !important;
}

/* AFTER */
.mf-canvas-dropzone .mf-form-wrapper {
  max-width: var(--mf-form-max-width, 960px) !important;
}
```

> Rationale: runtime default is 960px (`properties.ts:1286` → `var(--mf-form-max-width, 960px)`). Keeping builder at 720px guaranteed a permanent 25% gap.

### 2. Iframe srcdoc padding reduced

**File**: `MegaForm.UI/src/builder/canvas.ts` (inside `buildThemePreviewSrcdoc()` inline CSS)

```css
/* BEFORE */
'.mf-form-wrapper{...padding:24px 16px !important;...}'

/* AFTER */
'.mf-form-wrapper{...padding:12px 8px !important;...}'
```

> Rationale: the dropzone already has `padding: 24px` around the iframe. The iframe’s internal wrapper does not need additional large padding; 12px 8px is enough breath while maximizing content width.

---

## Build & Deploy

```bash
cd MegaForm.UI
npm run build:builder   # → Assets/js/bundles/megaform-builder.js + css
npm run build:loader    # → Assets/js/megaform-builder-loader.js
```

**DNN deploy**
- Copy to `/e/DNN_SITES/DNN10322_MegaTest/Website/DesktopModules/MegaForm/Assets/`
- `web.config` touch to recycle app pool

**Oqtane deploy**
- Copy to `/e/DNN_SITES/OqtaneSites/Oqtane.Fresh.10.1.0/wwwroot/Modules/MegaForm/`
- Restart `Oqtane.Server.exe --urls "http://localhost:5005"`

**Version stamp** (loader): `BUILDER_BUNDLE_VERSION = '20260606-B83i2'` (unchanged from previous B83i2 build; no stamp bump needed because the CSS/JS files themselves changed and `?v=` forces reload).

---

## Verification Notes

- Headless QA on Oqtane hit the "New Form" template picker for `formId=1` (unsaved form → no builder canvas), so direct screenshot comparison was not possible in automation.
- JavaScript inspect confirmed `getComputedStyle(wrapper).maxWidth === "960px"` on the builder root, proving the CSS change reached the browser.
- **Manual verification required**: open an existing **saved** form in Design Mode, clear cache (`Ctrl+F5`), and confirm the form card is noticeably wider and 2-column grids no longer collapse on 1600px viewports.

---

## Related Code References

| File | Line | Context |
|---|---|---|
| `megaform-builder-ts.css` | 462 | `.mf-canvas-dropzone .mf-form-wrapper` max-width |
| `canvas.ts` | 484 | iframe srcdoc `.mf-form-wrapper` padding |
| `properties.ts` | 1286 | runtime default `max-width: var(--mf-form-max-width, 960px)` |
| `theme-tab-adapter.ts` | 1089 | `applyDevicePreview()` sets inline max-width (desktop = `100%`) |

---

## Follow-up / Risks

1. **B67 identity constraint**: This change only touches CSS `max-width` and iframe padding constants. It does NOT alter `#mf-canvas-dropzone` innerHTML structure, so Build↔Design toggle delta should remain zero.
2. **Mock parity**: Mock uses `max-w-3xl` (768px) for desktop device preview. Our 960px cap is slightly wider than the mock but matches runtime behaviour. If future mock alignment requires 768px, adjust `960px` → `768px` in the same CSS rule.
3. **Ultra-wide monitors**: `960px` cap prevents form from stretching uncomfortably wide. If users request true full-width, override via `--mf-form-max-width: 100%` in theme settings.
