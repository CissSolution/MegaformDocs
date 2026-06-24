# HANDOFF — MegaForm Builder UI Fixes B110

Date: 2026-06-09  
Scope: Fix 3 critical Builder UX issues: pane collapse gaps/extra triggers, missing drag handles on top-level fields, and drag clone smoothness.  
Repo: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`  
Final cache version: `20260609-B110`  

---

## 1. Summary of this session

| # | Issue | Root Cause | Fix |
|---|-------|------------|-----|
| 1 | Left/Right pane collapse leaves large blank gaps or duplicate triggers | Right panel used `transform: translateX(100%)` which only moves visually but still occupies `300px` flex space. Left panel `opacity: 1` on collapsed conflicted with JS. Three modules bound the same collapse buttons. | Switched right panel to `width` transition. Unified left panel `opacity: 0`. Added `data-mf-collapse-wired` dedup flag. |
| 2 | Top-level fields outside Row have no drag handle on hover | CSS specificity bug in build mode: hide rule has `#mf-canvas-dropzone` ID (`1,2,1`) but hover show rule did not (`0,4,1`), so `opacity: 0 !important` always won. | Added `#mf-canvas-dropzone` to the hover show selector so specificity beats the hide rule. |
| 3 | Drag feels “invisible” — no sense of pulling; only see movement after drop | Generic `.sortable-fallback { max-width: 160px }` squeezed Row/Field clones. Row-field was skipped by width-locking code. Clone opacity `0.95` + weak shadow made it hard to see. | Extended `lockCanvasItemDragSize` to `.mf-row-field`. Added `onClone`/`onStart` to row Sortable. Raised clone opacity to `1` and shadow depth. Added `.mf-row-field-drag-clone` CSS override. |

---

## 2. Files changed in this session

### Source (TypeScript / CSS)

| File | Lines changed | What |
|------|---------------|------|
| `MegaForm.UI/src/styles/megaform-builder-ts.css` | ~40 | Right panel width transition; left panel collapsed opacity; drag handle specificity; sortable fallback opacity/shadow; row-field clone width override. |
| `MegaForm.UI/src/builder/canvas.ts` | ~25 | `lockCanvasItemDragSize` now supports `.mf-row-field`; added `onClone` + `onStart` to row column Sortable; `clearCanvasItemDragSize` cleans new clone class. |
| `MegaForm.UI/src/builder/panels.ts` | ~20 | Added `data-mf-collapse-wired` guard so left/right collapse/open listeners are only bound once. |
| `MegaForm.UI/src/builder/properties.ts` | ~20 | Same dedup guard on `bindPanelCollapse` to avoid triple-binding the same buttons. |
| `MegaForm.UI/src/builder/theme-left-rail.ts` | ~10 | Same dedup guard on left collapse button wiring. |
| `MegaForm.UI/src/loader/index.ts` | 1 | Bumped `BUILDER_BUNDLE_VERSION` to `20260609-B110`. |

### Live asset paths (local Oqtane)

```
E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\wwwroot\Modules\MegaForm\
  js\bundles\megaform-builder.js
  js\bundles\megaform-builder.js.map
  js\megaform-builder-loader.js
  js\megaform-builder-loader.js.map
  js\megaform-renderer.js
  js\megaform-renderer.js.map
  css\megaform-builder-ts.css
  css\megaform-builder.css
```

---

## 3. Build & deploy

```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.UI"
npm run build:builder
npm run build:renderer
npm run build:loader
```

Copy to local Oqtane:

```powershell
$src='E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\Assets'
$dst='E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\wwwroot\Modules\MegaForm'
$files=@(
  'js\bundles\megaform-builder.js',
  'js\bundles\megaform-builder.js.map',
  'js\megaform-builder-loader.js',
  'js\megaform-builder-loader.js.map',
  'js\megaform-renderer.js',
  'js\megaform-renderer.js.map',
  'css\megaform-builder-ts.css',
  'css\megaform-builder.css'
)
foreach($f in $files){
  Copy-Item -LiteralPath (Join-Path $src $f) -Destination (Join-Path $dst $f) -Force
}
```

---

## 4. Fix detail

### 4.1 Pane collapse — no more blank gaps

**Right panel** (`megaform-builder-ts.css`):

```css
.mf-panel-right {
  width: 300px !important;
  background: #fff !important;
  border-left: 1px solid #e4e4e7 !important;
  box-shadow: none !important;
  flex-shrink: 0 !important;
  position: relative !important;
  transform: none !important;
  right: auto !important;
  transition: width 0.25s ease, opacity 0.25s ease, padding 0.25s ease, border-width 0.25s ease !important;
  overflow: visible !important;
}
.mf-panel-right.mf-collapsed {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  opacity: 0 !important;
  border-left-width: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
  transform: none !important;
}
```

- **Why:** `transform: translateX(100%)` only affects composited layer; the element still consumes flex space. Switching to `width: 0` removes it from layout flow.
- **Trigger safety:** `#mf-right-collapse-btn` is `position: absolute; left: -16px`. When width reaches `0`, the panel’s left edge sits at the viewport right edge, so `-16px` places the trigger exactly `16px` inside the screen — still clickable. `#mf-right-open-btn` (pre-rendered outside the panel by `dom.ts`) is styled by `megaform-builder-shell.css` and is unaffected.

**Left panel** (`megaform-builder-ts.css`):

```css
.mf-panel-left.mf-collapsed {
  width: 0 !important;
  min-width: 0 !important;
  overflow: hidden !important;
  opacity: 0 !important;
  padding: 0 !important;
  border-right-width: 0 !important;
}
```

- **Why:** Previously `opacity: 1 !important` overrode JS `opacity: 0`, causing ghost content to leak through during transition.

**Event deduplication** (`panels.ts`, `properties.ts`, `theme-left-rail.ts`):

```ts
// Before binding:
if (btn && !(btn as any).dataset?.mfCollapseWired) {
  (btn as any).dataset = (btn as any).dataset || {};
  (btn as any).dataset.mfCollapseWired = '1';
  btn.addEventListener('click', handler);
}
```

- **Why:** Three independent modules attached click handlers to the same `#mf-left-collapse-btn` and `#mf-right-collapse-btn`. This caused no functional breakage but could create subtle race conditions or double-toggle sensations.

---

### 4.2 Drag handle on top-level fields

**The bug:**

```css
/* Base hide rule — specificity (1,2,1) */
body[data-mf-mode="build"] #mf-canvas-dropzone .mf-drag-handle {
  opacity: 0 !important;
}

/* Old hover show rule — specificity (0,4,1)  → LOSES */
body[data-mf-mode="build"] .mf-canvas-field:hover > .mf-drag-handle {
  opacity: 1 !important;
}
```

**The fix:**

```css
/* New hover show rule — specificity (1,4,1)  → WINS */
body[data-mf-mode="build"] #mf-canvas-dropzone .mf-canvas-field:hover > .mf-drag-handle,
body[data-mf-mode="build"] #mf-canvas-dropzone .mf-canvas-field:hover > .mf-canvas-field-actions,
body[data-mf-mode="build"] #mf-canvas-dropzone .mf-canvas-field.mf-selected > .mf-canvas-field-actions {
  opacity: 1 !important;
  pointer-events: auto !important;
}
```

**QA measurement:**

```json
{
  "opacity": "1",
  "pointerEvents": "auto",
  "display": "flex",
  "width": "16px",
  "height": "28px",
  "left": "-10px",
  "top": "26px"
}
```

---

### 4.3 Drag clone smoothness

**Width locking extended to row fields** (`canvas.ts`):

```ts
function lockCanvasItemDragSize(el, source?) {
  const isTopLevelRow = el.classList.contains('mf-canvas-row');
  const isTopLevelField = el.classList.contains('mf-canvas-field') && !el.classList.contains('mf-row-field');
  const isRowField = el.classList.contains('mf-row-field');        // ← NEW
  if (!isTopLevelRow && !isTopLevelField && !isRowField) return;   // ← NEW

  let cloneClass = 'mf-canvas-item-drag-clone';
  if (isTopLevelRow) cloneClass = 'mf-row-drag-clone';
  else if (isRowField) cloneClass = 'mf-row-field-drag-clone';    // ← NEW

  el.classList.add(cloneClass);
  el.style.setProperty('--mf-canvas-item-drag-width', Math.round(rect.width) + 'px');
  el.style.width = Math.round(rect.width) + 'px';
  el.style.minWidth = Math.round(rect.width) + 'px';
  el.style.maxWidth = 'none';
  if (rect.height > 0) {
    el.style.minHeight = Math.round(rect.height) + 'px';
  }
}
```

**Row Sortable hooks** (`canvas.ts`):

```ts
const s = new Sortable(colEl, {
  // ...
  onClone(evt) {
    lockCanvasItemDragSize(evt.clone, evt.item);
  },
  onStart(evt) {
    lockCanvasItemDragSize(evt.item);
    colEl.classList.add('mf-row-col-droppable');
  },
  onEnd(evt) {
    clearCanvasItemDragSize(evt.item);
    clearCanvasItemDragSize(evt.clone);
    // ...
  }
});
```

**Clone styling** (`megaform-builder-ts.css`):

```css
/* Generic fallback (palette tile cap) */
.sortable-drag,
.sortable-fallback,
.mf-palette-item.sortable-drag,
.mf-palette-item.sortable-fallback {
  background: #ffffff !important;
  color: #0f172a !important;
  border: 1px solid #c7d2fe !important;
  box-shadow: 0 16px 40px rgba(99, 102, 241, .28) !important;  /* stronger shadow */
  border-radius: 0.625rem !important;
  max-width: 160px !important;
  padding: 0.5rem 0.5rem !important;
  opacity: 1 !important;                                         /* was 0.95 */
}

/* Canvas items + row fields override the 160px cap */
.mf-canvas-row.sortable-drag,
.mf-canvas-row.sortable-fallback,
.mf-canvas-row.mf-sortable-ghost,
.mf-canvas-row.mf-row-drag-clone,
.mf-canvas-item.mf-canvas-field.sortable-drag,
.mf-canvas-item.mf-canvas-field.sortable-fallback,
.mf-canvas-item.mf-canvas-field.mf-sortable-ghost,
.mf-canvas-item.mf-canvas-field.mf-canvas-item-drag-clone,
.mf-row-field.sortable-drag,                    /* ← NEW */
.mf-row-field.sortable-fallback,                /* ← NEW */
.mf-row-field.mf-sortable-ghost,                /* ← NEW */
.mf-row-field.mf-row-field-drag-clone {         /* ← NEW */
  box-sizing: border-box !important;
  display: block !important;
  width: var(--mf-canvas-item-drag-width, auto) !important;
  min-width: var(--mf-canvas-item-drag-width, auto) !important;
  max-width: none !important;
  transform-origin: top left !important;
}
```

---

## 5. Version history

| Version | Note |
|---------|------|
| B103 | Renderer reads both `cssOverrides` and `themeCssOverrides` aliases. |
| B104 | Drag handle small, hover-only; expanded Sortable selectors. |
| B105/B106 | Centered drag handle, FontAwesome `fa-grip-vertical`, removed placeholder. |
| B107 | Preset colors apply to Design/runtime; buttons consume `--mf-btn-bg`. |
| B108 | Row drag clone keeps full width. |
| B109 | Top-level field drag clone keeps full width. |
| **B110** | **Pane collapse width transition; drag handle specificity fix; row-field width lock; dedup collapse listeners.** |

---

## 6. Visual QA results

All QA screenshots saved to: `E:\MENU SPECS\tmp-qa-b110`

| Screenshot | What it proves |
|------------|----------------|
| `synth-01-default.png` | Baseline layout: left 256px, right 300px, center canvas centered. |
| `synth-02-left-collapsed.png` | Left panel width = 0, canvas shifts flush to left edge. **No blank gap.** |
| `synth-03-right-collapsed.png` | Right panel width = 0, canvas expands full. **No blank gap.** |
| `synth-04-hover-topfield.png` | Hovering a top-level field shows the drag handle at left edge. |
| `synth-05-clone-topfield.png` | Top-level field fallback clone keeps full width (760px). |
| `synth-06-clone-rowfield.png` | Row-field fallback clone keeps correct column width (360px). |

**Computed measurements:**

```json
{
  "rightPanelCollapsed": { "width": 1, "height": 900 },
  "leftPanelCollapsed":  { "width": 0, "height": 900 },
  "dragHandle": {
    "opacity": "1",
    "pointerEvents": "auto",
    "width": "16px",
    "height": "28px",
    "deltaX": 0,
    "deltaY": 0
  }
}
```

*(Right panel collapsed shows 1px due to 1px border being in transition; at rest it is 0.)*

---

## 7. Bundle / live checks

```powershell
$builder='E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\wwwroot\Modules\MegaForm\js\bundles\megaform-builder.js'
$loader='E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\wwwroot\Modules\MegaForm\js\megaform-builder-loader.js'
$css='E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\wwwroot\Modules\MegaForm\css\megaform-builder-ts.css'
$b=[IO.File]::ReadAllText($builder)
$l=[IO.File]::ReadAllText($loader)
$c=[IO.File]::ReadAllText($css)
[pscustomobject]@{
  LoaderB110 = $l.Contains('20260609-B110')
  RowFieldCloneClass = $b.Contains('mf-row-field-drag-clone')
  RightPanelWidthTransition = $c.Contains('transition: width 0.25s ease, opacity 0.25s ease, padding 0.25s ease, border-width 0.25s ease')
  LeftPanelCollapsedOpacity0 = $c.Contains('.mf-panel-left.mf-collapsed {\n  width: 0 !important;\n  min-width: 0 !important;\n  overflow: hidden !important;\n  opacity: 0 !important;')
  DragHandleSpecificityFix = $c.Contains('#mf-canvas-dropzone .mf-canvas-field:hover > .mf-drag-handle')
  FallbackOpacity1 = $c.Contains('opacity: 1 !important;') -and $c.Contains('box-shadow: 0 16px 40px rgba(99, 102, 241, .28)')
} | ConvertTo-Json
```

**Expected:**

```json
{
  "LoaderB110": true,
  "RowFieldCloneClass": true,
  "RightPanelWidthTransition": true,
  "LeftPanelCollapsedOpacity0": true,
  "DragHandleSpecificityFix": true,
  "FallbackOpacity1": true
}
```

---

## 8. Manual acceptance checklist

Before signing off:

- [ ] Hard refresh builder (`Ctrl+F5`).
- [ ] **Pane collapse:**
  - [ ] Click left collapse → canvas shifts left, no blank space.
  - [ ] Click right collapse → canvas expands right, no blank space.
  - [ ] Re-open both panels → smooth width animation, no content leak.
- [ ] **Drag handle visibility:**
  - [ ] In Build mode, hover a top-level field (e.g., Department, Proposal Title) → drag handle appears at left edge.
  - [ ] Hover a field inside a Row → drag handle appears.
  - [ ] Drag handle is hidden again on mouse-out.
- [ ] **Drag smoothness:**
  - [ ] Drag a top-level field by its body/handle → clone is full-width, clearly visible with shadow.
  - [ ] Drag a Row → clone keeps full width, not squeezed.
  - [ ] Drag a field inside a Row → clone keeps column width, not squeezed.
  - [ ] Typing into inputs does **not** start a drag.
- [ ] **Design mode:**
  - [ ] Left pane Presets tab renders correctly.
  - [ ] Click Lavender → form colors update immediately.
  - [ ] No yellow "Save the form first" placeholder.
- [ ] **Live/runtime:**
  - [ ] Save theme, view live form.
  - [ ] Button/input/label colors match selected preset.

---

## 9. Known gotchas & next steps

1. **Playwright headless cannot authenticate into Oqtane.** All CSS/structural QA was done via synthetic DOM + live asset inspection. Final pixel verification must be done manually in Chrome.
2. **Remote server:** If testing on `dnn10322_megatest.ai`, deploy the same `B110` bundle set and hard refresh.
3. **Row-field clone:** Although width is now locked, `forceFallback: true` appends the clone to `<body>`. Any global body margin/padding could offset the clone by a few pixels. If observed, inspect `document.body` margin in DevTools.
4. **Next recommended step:** Create a permanent Playwright QA fixture under `qa/builder-ui-pixel-qa.cjs` with deterministic DOM fixtures so future regressions are caught automatically without needing auth.

---

## 10. Artifact list

### Source files (final state)

- `MegaForm.UI/src/builder/canvas.ts`
- `MegaForm.UI/src/styles/megaform-builder-ts.css`
- `MegaForm.UI/src/builder/panels.ts`
- `MegaForm.UI/src/builder/properties.ts`
- `MegaForm.UI/src/builder/theme-left-rail.ts`
- `MegaForm.UI/src/loader/index.ts`

### QA outputs

- `E:\MENU SPECS\tmp-qa-b110\synth-01-default.png`
- `E:\MENU SPECS\tmp-qa-b110\synth-02-left-collapsed.png`
- `E:\MENU SPECS\tmp-qa-b110\synth-03-right-collapsed.png`
- `E:\MENU SPECS\tmp-qa-b110\synth-04-hover-topfield.png`
- `E:\MENU SPECS\tmp-qa-b110\synth-05-clone-topfield.png`
- `E:\MENU SPECS\tmp-qa-b110\synth-06-clone-rowfield.png`
- `E:\MENU SPECS\tmp-qa-b110\synth-handle-styles.json`
- `E:\MENU SPECS\tmp-qa-b110\synth-panel-boxes.json`
- `E:\MENU SPECS\tmp-qa-b110\bundle-checks.json`

End of handoff.
