# B83k — Builder Canvas Center Not Full-Width (Handoff)

> **Date**: 2026-06-06  
> **Scope**: Center canvas form width in Builder (Build + Design modes)  
> **Status**: ✅ Completed — CSS fix applied, JS rebuilt, assets deployed, Visual QA passed  
> **Assignee**: Completed by AI session 2026-06-07

---

## Problem Statement

User reports: *"canvas chinh giua khong full-width duoc nhu mock `localhost:3000/builder?mode=design`"*.

In the Oqtane builder (`localhost:5005/?mfpanel=builder&formId=N`), the form card in the center panel appears **narrower than the available center area**, leaving a large gray gap on the right (and sometimes left). Red arrows in user screenshots explicitly mark this gap.

| Screenshot | URL | Observation |
|---|---|---|
| Screenshot 1 | `localhost:5005/?mfpanel=builder&formId=1` | Blue form card ~60% of visible center width |
| Screenshot 2 | `localhost:5005/?mfpanel=builder&formId=3` | White wedding form card ~50–60% of visible center width; red arrows indicate desired full-width stretch |

---

## Root Cause Analysis (So Far)

### 1. Missing `width: 100%` on builder canvas `.mf-form-wrapper`

**File**: `MegaForm.UI/src/styles/megaform-builder-ts.css` (line ~457)

```css
.mf-canvas-dropzone .mf-form-wrapper {
  max-width: var(--mf-form-max-width, 960px) !important;
  /* ❌ NO width: 100% here */
  margin-left: auto !important;
  margin-right: auto !important;
  ...
}
```

The mock (`VERCEL_mega_form-admin-redesign/app/builder/page.tsx:1143`) uses:
```tsx
<div className="w-full rounded-xl border bg-background shadow-sm transition-all max-w-3xl">
```

Production lacks `width: 100%`, so the flex container may shrink to fit narrow content instead of stretching to fill the dropzone.

### 2. Theme-level `--mf-form-max-width` constrains `.mf-form-inner`

**File**: `Assets/css/megaform.css` (line ~226)

```css
.mf-form-inner {
    width: 100%;
    max-width: var(--mf-form-max-width);   /* <-- NOT overridden in builder CSS */
}
```

If a theme sets `--mf-form-max-width` to 500–600px, `.mf-form-inner` shrinks even though `.mf-form-wrapper` allows 960px. The **iframe srcdoc** (`canvas.ts:484`) already fixes this for Design-mode iframe preview:

```css
.mf-form-inner{max-width:none !important;width:100% !important;...}
```

But the **native builder canvas** (Build mode, or any iframe fallback) has no such override.

### 3. Double padding vs mock

Production applies padding **twice**:
- `.mf-panel-center` → `padding: 1.5rem` (24px)
- `.mf-canvas-dropzone` → `padding: 1.5rem` (24px)

Total external padding = **48px**.

Mock uses only a single `p-6` (24px) layer.

---

## Fix Already Applied (CSS)

**Files modified**:
1. `MegaForm.UI/src/styles/megaform-builder-ts.css`
2. `Assets/css/megaform-builder-ts.css` (compiled copy)
3. `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/css/megaform-builder-ts.css` (deployed copy)

**Change** (badge `B83k`):
```css
/* [B70] Runtime-like form card inside builder canvas */
.mf-canvas-dropzone .mf-form-wrapper {
  ...
  max-width: var(--mf-form-max-width, 960px) !important;
  width: 100% !important;                    /* ✅ ADDED */
  margin-left: auto !important;
  margin-right: auto !important;
  ...
}

/* [B83k] Prevent theme-level --mf-form-max-width from shrinking the builder canvas form.
   The iframe srcdoc already does this for Design mode; this fixes the native canvas
   (Build mode + any iframe fallback) so the form card always fills available width. */
.mf-canvas-dropzone .mf-form-inner {
  max-width: none !important;
  width: 100% !important;
}
```

---

## Remaining Work

1. **Rebuild JS bundle** (optional but recommended for cleanliness):
   ```bash
   cd MegaForm.UI
   npm run build:builder   # → Assets/js/bundles/megaform-builder.js
   npm run build:loader    # → Assets/js/megaform-builder-loader.js
   ```
   The CSS fix does **not** require a JS rebuild because `megaform-builder-ts.css` is loaded as a `<link>` by the loader.

2. **Copy compiled assets to Oqtane wwwroot**:
   ```bash
   cp Assets/css/megaform-builder-ts.css MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/css/
   cp Assets/js/megaform-builder-loader.js MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/
   cp Assets/js/bundles/megaform-builder.js MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/bundles/
   ```

3. **Visual QA via Playwright**:
   - Login Oqtane: `host` / `Minh@2002`
   - Open `http://localhost:5005/?mfpanel=builder&formId=3`
   - Switch to **Design** mode (topbar segmented pill)
   - Screenshot and verify form card stretches to fill center panel minus padding
   - Also test **Build** mode to ensure field cards still render correctly
   - Test tablet/mobile device toggles

4. **If still narrow** — additional things to check:
   - Is `#mf-builder-preview-frame` actually present in Design mode? If missing, the iframe failed to mount and native canvas is showing.
   - Is `data-device="tablet"` or `data-device="mobile"` accidentally set on `.mf-panel-center`? (Would cap width at 540px / 375px.)
   - Does the form's own CSS variable `--mf-form-max-width` override the 960px cap? (Now mitigated by `width: 100%` + `.mf-form-inner { max-width: none }`.)

---

## Related Docs

- `Docs/B83J_DESIGN_MODE_FORM_WIDTH_FIX.md` — Previous 960px bump (2026-06-06)
- `Docs/BUILDER_THEME_TECHNICAL_HANDOFF_20260604.md` — Mock parity spec
- `Docs/BUILDER_UX_MIGRATION_TO_MOCK_SPEC_20260604.md` — Migration checklist
- Mock source: `E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/VERCEL_mega_form-admin-redesign/app/builder/page.tsx`
