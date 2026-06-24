# HANDOFF - MegaForm Builder UI, Drag/Drop, Sortable, Theme Preset, Visual QA

Date: 2026-06-09  
Scope: MegaForm Builder UI redesign parity voi mock, dac biet left pane, center canvas, right pane Theme Designer, drag/drop/sortable, CSS preset apply vao form runtime/live preview.  
Repo: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`  
Mock tham chieu: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\VERCEL_mega_form-admin-redesign`  
Mock URL: `http://localhost:3000/builder?mode=design`  
Oqtane local target: `http://localhost:5005/?mfpanel=builder&formId=3` hoac `http://localhost:5005/?mfpanel=builder`  
Remote target user da chup: `dnn10322_megatest.ai/megaform/Home/mfFormId/1270?mfFormId=1270#mf-builder`

## 1. Muc tieu ban giao

Hoan thien giao dien Builder theo huong pixel-perfect nhu mock:

- Left pane trong mode Design: Presets / Elements / Colors giong mock.
- Center canvas Build/Design khong bi rac UI, drag/drop dung va nhin on dinh.
- Right pane Theme Designer: Global / Inputs / Buttons / Layout / Inspector.
- CSS preset ben left pane phai apply ngay vao form trong Design mode va consistent khi live/render.
- Drag/drop:
  - Row drag khong bi meo/co lai.
  - Field trong Row drag duoc bang ca card.
  - Top-level field ngoai Row drag duoc bang ca card.
  - Drag ghost/clone phai keo theo control day du, dung width/height.
  - Drag handle nho, can giua, chi hien khi hover/focus.
- Visual QA phai co do dac bang browser/Playwright, khong chi nhin bang mat.

## 2. Cac file chinh can nam

Builder source:

- `MegaForm.UI/src/builder/canvas.ts`
  - Render center canvas Build/Design.
  - Mount/unmount theme preview iframe.
  - Sortable main canvas, row columns, flex grid.
  - Drag handle markup.
  - Drag clone width locking.
- `MegaForm.UI/src/styles/megaform-builder-ts.css`
  - Builder UI CSS.
  - Left pane, center canvas, row/field cards, drag handle, sortable ghost/fallback.
  - Pixel parity rules.
- `MegaForm.UI/src/builder/theme-left-rail.ts`
  - Left Design pane: Presets / Elements / Colors.
  - Click preset tu left pane.
  - Map swatch colors vao CSS variables.
- `MegaForm.UI/src/builder/theme-tab-adapter.ts`
  - Right pane Theme Designer state.
  - Persist theme/cssOverrides/themeCssOverrides vao schema.
  - Build CSS inject cho parent canvas va iframe preview.
  - Bridge postMessage `mf-theme-live-css`, `mf-theme-live-class`.
- `MegaForm.UI/src/renderer/index.ts`
  - Runtime renderer.
  - Apply `settings.cssOverrides`, `settings.themeCssOverrides`, `themeJson.cssOverrides`.
  - Submit/button/input/form CSS var consumption.
- `MegaForm.UI/src/loader/index.ts`
  - Cache bust version cho builder assets.
  - Current final version trong handoff nay: `20260609-B109`.

Built/live asset paths:

- Source build output: `Assets/js/bundles/megaform-builder.js`
- Source build output: `Assets/js/megaform-builder-loader.js`
- Source build output: `Assets/js/megaform-renderer.js`
- Source build output: `Assets/css/megaform-builder-ts.css`
- Local Oqtane live copy:
  - `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\wwwroot\Modules\MegaForm\js\bundles\megaform-builder.js`
  - `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\wwwroot\Modules\MegaForm\js\megaform-builder-loader.js`
  - `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\wwwroot\Modules\MegaForm\js\megaform-renderer.js`
  - `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\wwwroot\Modules\MegaForm\css\megaform-builder-ts.css`

## 3. Build/deploy commands

Run from:

```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.UI"
```

Build:

```powershell
npm run build:builder
npm run build:renderer
npm run build:loader
```

Copy local Oqtane live assets:

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

Remote deploy note:

- Neu user test tren `dnn10322_megatest.ai`, phai deploy cung bundle/css `B109` len server do.
- Hard refresh browser sau deploy vi loader dung query cache version.

## 4. Cache/version history trong dot sua nay

Final current:

- `MegaForm.UI/src/loader/index.ts`
- `BUILDER_BUNDLE_VERSION = '20260609-B109'`

Important versions:

- `B103`: renderer + preset bridge doc nhan `cssOverrides/themeCssOverrides`.
- `B104`: drag handle nho, chi hover moi hien; Row/top-level sortable selector mo rong.
- `B105/B106`: can giua drag handle, doi glyph sang FontAwesome `fa-grip-vertical`, bo placeholder "Save the form first".
- `B107`: preset color apply vao Design/runtime, button dung `--mf-btn-bg`.
- `B108`: Row drag clone khong bi co/meo.
- `B109`: top-level field ngoai Row draggable bang ca card, clone field giu dung kich thuoc.

## 5. Drag/drop va Sortable - kien truc

Main canvas Sortable nam trong `canvas.ts`, function `initMainSortable(container)`.

Current intent:

```ts
handle: '.mf-drag-handle, .mf-canvas-row, .mf-canvas-field'
draggable: '.mf-canvas-item,.mf-palette-item'
filter: '.mf-canvas-empty-state, .mf-row-field, .mf-canvas-action-btn, button, input, textarea, select, [contenteditable="true"]'
forceFallback: true
fallbackOnBody: true
```

Y nghia:

- Top-level Row drag duoc bang ca Row.
- Top-level Field drag duoc bang ca card.
- Field trong Row khong lam drag ca Row vi `.mf-row-field` bi filter o main canvas.
- Input/textarea/select/button khong trigger drag, van click/type binh thuong.
- Palette item van drag vao canvas.

Row column Sortables nam trong `initRowSortables(container)`.

Current intent:

```ts
handle: '.mf-drag-handle, .mf-row-field'
draggable: '.mf-row-field,.mf-canvas-item,.mf-canvas-field,.mf-palette-item'
filter: '.mf-row-col-empty, .mf-canvas-action-btn, button, input, textarea, select, [contenteditable="true"]'
forceFallback: true
fallbackOnBody: true
```

Y nghia:

- Field trong Row drag duoc bang ca card.
- Khong drag khi click vao input.
- Khong cho Row top-level bi drop nham vao Row column.

## 6. Drag clone width locking

Van de goc:

- CSS generic `.sortable-fallback` co `max-width: 160px` de palette tile khong thanh mot thanh den dai.
- Row va top-level Field cung nhan `.sortable-fallback` khi `forceFallback: true`.
- Ket qua: Row/Field drag clone bi bop ve 160px, meo UI, control khong keo theo dung kich thuoc.

Fix trong `canvas.ts`:

- `lockCanvasItemDragSize(el, source)`
  - Ap dung cho:
    - `.mf-canvas-row`
    - top-level `.mf-canvas-field:not(.mf-row-field)`
  - Doc `source.getBoundingClientRect()`.
  - Set CSS var `--mf-canvas-item-drag-width`.
  - Set inline width/minWidth/maxWidth/minHeight.
  - Add class:
    - Row: `.mf-row-drag-clone`
    - Field: `.mf-canvas-item-drag-clone`
- `clearCanvasItemDragSize(el)`
  - Cleanup class va inline styles trong `onEnd`.
- Sortable hooks:
  - `onClone`: lock clone theo item goc.
  - `onStart`: lock item dang drag.
  - `onEnd`: cleanup item/clone.

CSS trong `megaform-builder-ts.css`:

```css
.mf-canvas-row.sortable-drag,
.mf-canvas-row.sortable-fallback,
.mf-canvas-row.mf-sortable-ghost,
.mf-canvas-row.mf-row-drag-clone,
.mf-canvas-item.mf-canvas-field.sortable-drag,
.mf-canvas-item.mf-canvas-field.sortable-fallback,
.mf-canvas-item.mf-canvas-field.mf-sortable-ghost,
.mf-canvas-item.mf-canvas-field.mf-canvas-item-drag-clone {
  box-sizing: border-box !important;
  display: block !important;
  width: var(--mf-canvas-item-drag-width, auto) !important;
  min-width: var(--mf-canvas-item-drag-width, auto) !important;
  max-width: none !important;
  transform-origin: top left !important;
}
```

Important:

- Khong xoa generic `.sortable-fallback { max-width:160px }` vi palette item can no.
- Luon override rieng Row/Field clone.

## 7. Drag handle

Van de goc:

- Icon hand/drag qua to.
- Hien lien tuc, gay rac UI.
- Row-field handle lech len tren, khong can giua.
- Unicode glyph `⠿` co the fallback thanh dau hoi o browser/font.

Fix:

- Dung FontAwesome:

```html
<i class="fas fa-grip-vertical"></i>
```

- CSS handle:
  - width 16px, height 28px.
  - thuc te do duoc 18x30 vi border.
  - `left:-10px`, `top:50%`, `transform:translateY(-50%)`.
  - `opacity:0`, `pointer-events:none` default.
  - hover/focus moi `opacity:1`, `pointer-events:auto`.

QA expected:

- Before hover:
  - `opacity: 0`
  - `pointer-events: none`
- After hover:
  - `opacity: 1`
  - `pointer-events: auto`
- Can giua:
  - `deltaX = 0`
  - `deltaY = 0`

Screenshots:

- `E:\MENU SPECS\tmp-qa\drag-handle-b106-default.png`
- `E:\MENU SPECS\tmp-qa\drag-handle-b106-hover.png`

## 8. Placeholder "Save the form first"

Van de goc:

- Design mode center canvas luon hien placeholder vang:
  - "Save the form first to see the live preview here..."
- Loi xay ra ca khi form da co/published.

Fix:

- Trong `canvas.ts`, branch `if (!formId)` render placeholder da bi vo hieu hoa.
- Preview iframe van render tu in-memory schema khi chua resolve duoc formId.
- `showThemePreviewLoadError()` khong render placeholder nua; no remove iframe loi va restore builder children.

Live bundle check:

- `Save the form first to see the live preview here` khong con trong bundle.
- `Preview failed to load. Check that the form is published` khong con trong bundle.

## 9. CSS preset apply vao Design/live/runtime

Van de goc:

- Click preset ben left pane tick dung tile nhung form trong Design mode khong doi mau.
- Submit button van giu mau cu.
- Runtime/live co luc khong nhan preset do khong doc dung alias `themeCssOverrides`.

Fix parts:

### 9.1 Renderer doc ca hai alias

`renderer/index.ts`:

- Collect vars tu:
  - `themePatch.cssOverrides`
  - `themePatch.themeCssOverrides`
  - `settings.cssOverrides`
  - `settings.themeCssOverrides`
  - PascalCase variants.
- Inject scoped runtime vars style tag.

### 9.2 SaveTheme ghi ca hai alias

Controllers:

- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
- `MegaForm.Web/Controllers/MegaFormController.cs`

SaveTheme ghi:

- `cssOverrides`
- `themeCssOverrides`

### 9.3 Left pane preset click dung batch apply

`theme-left-rail.ts`:

- Click tile lay 4 swatch colors:
  - `c1`: primary / button bg.
  - `c2`: text/title/label.
  - `c3`: form/input bg.
  - `c4`: border/input border.
- Tao `presetVars`.
- Goi `MFThemeTabAdapter.applyPresetVars(id, presetVars)`.

Bien quan trong:

```ts
'--mf-primary'
'--mf-primary-hover'
'--mf-primary-light'
'--mf-input-focus-border'
'--mf-check-color'
'--mf-progress-fill'
'--mf-btn-bg'
'--mf-btn-bg-hover'
'--mf-btn-hover-bg'
'--mf-color-text-inverse'
'--mf-btn-color'
'--mf-btn-text'
'--mf-secondary'
'--mf-title-color'
'--mf-text'
'--mf-label-color'
'--mf-form-bg'
'--mf-input-bg'
'--mf-border'
'--mf-input-border'
```

### 9.4 Theme tab adapter batch API

`theme-tab-adapter.ts`:

- New API:

```ts
applyPresetVars(themeId, vars)
```

Behavior:

- Set `currentTheme`.
- Merge all vars into `live`.
- `persistToSchema()`.
- Dispatch `mf:theme-preset-changed`.
- `B.callModule('canvas', 'render')`.
- `flushPreview()` immediately and after short timeouts.

Reason:

- Tranh viec `setVar` tung bien gay repaint giua chung.
- Tranh mat `postMessage` khi iframe vua rebuild.

### 9.5 Button phai dung `--mf-btn-bg`

Van de:

- Nhieu CSS target button chi dung `--mf-primary`.
- Preset left pane set `--mf-btn-bg`, nhung button khong consume.

Fix:

- `theme-tab-adapter.ts` element-level overrides:

```css
background: var(--mf-btn-bg, var(--mf-primary)) !important;
color: var(--mf-btn-color, var(--mf-btn-text, var(--mf-color-text-inverse, #ffffff))) !important;
```

- Targets:
  - `.mf-form-wrapper button[type="submit"]`
  - `.mf-form-wrapper .mf-submit`
  - `.mf-form-wrapper .mfp-submit`
  - `.mf-form-wrapper .mf-btn-submit`
  - `.mf-form-wrapper .mf-submit-btn`
  - `.mf-form-wrapper .mfp-actions button[type="submit"]`
  - `.mf-form-wrapper .mf-btn-primary`
  - `.mf-form-wrapper .mf-form-actions button`

- `renderer/index.ts` runtime button rule cung dung:

```css
background: var(--mf-btn-bg, var(--mf-primary, inherit));
color: var(--mf-btn-color, var(--mf-btn-text, var(--mf-color-text-inverse, #ffffff)));
```

- `canvas.ts` iframe srcdoc inline CSS cung dung `--mf-btn-bg`.

### 9.6 Iframe renderer cache

`canvas.ts` preview iframe script:

```html
megaform-renderer.js?v=20260609-B107
```

Reason:

- Neu iframe van load renderer query cu `B82d`, browser co the giu renderer cu, preset runtime khong an.

## 10. Visual QA workflow

Nguyen tac:

- Khong chi nhin anh; phai do bang DOM/CSS.
- Khi browser auth/local session khong vao duoc Oqtane, dung synthetic DOM + live CSS/bundle inspection.
- Luon chup screenshot vao `E:\MENU SPECS\tmp-qa`.
- Luon verify live assets, khong chi source.

Limit da gap:

- Browser bridge/Playwright headless khong vao duoc authenticated Oqtane builder session.
- Headless local co the redirect Home/Login.
- Vi vay dung 3 lop QA:
  1. Source inspection.
  2. Built/live bundle string check.
  3. Synthetic DOM visual + measurement bang Playwright voi CSS live.

## 11. Visual QA - exact measurements da dung

### 11.1 Drag handle center

Expected:

```json
{
  "before": {
    "opacity": "0",
    "pointerEvents": "none",
    "width": 18,
    "height": 30,
    "deltaY": 0,
    "deltaX": 0
  },
  "after": {
    "opacity": "1",
    "pointerEvents": "auto",
    "width": 18,
    "height": 30,
    "deltaY": 0,
    "deltaX": 0
  }
}
```

Screenshots:

- `E:\MENU SPECS\tmp-qa\drag-handle-b106-default.png`
- `E:\MENU SPECS\tmp-qa\drag-handle-b106-hover.png`

Measurement formula:

```js
deltaY = Math.round((handle.top + handle.height / 2) - (field.top + field.height / 2))
deltaX = Math.round((handle.left + handle.width / 2) - field.left)
```

### 11.2 Row drag clone

Expected after B108:

```json
{
  "width": 760,
  "maxWidth": "none",
  "minWidth": "760px",
  "display": "block",
  "padding": "0px"
}
```

Screenshot:

- `E:\MENU SPECS\tmp-qa\row-drag-clone-b108.png`

### 11.3 Top-level field drag clone

Expected after B109:

```json
{
  "width": 760,
  "maxWidth": "none",
  "minWidth": "760px",
  "display": "block",
  "padding": "16px 20px",
  "opacity": "0.95"
}
```

Screenshot:

- `E:\MENU SPECS\tmp-qa\top-level-field-drag-clone-b109.png`

### 11.4 Lavender preset renderer/runtime

Expected after B107:

```json
{
  "buttonBackground": "rgb(168, 85, 247)",
  "buttonColor": "rgb(255, 255, 255)",
  "inputBackground": "rgb(250, 245, 255)",
  "inputBorder": "rgb(233, 213, 255)",
  "labelColor": "rgb(88, 28, 135)"
}
```

Screenshot:

- `E:\MENU SPECS\tmp-qa\preset-lavender-renderer-b107.png`

## 12. Playwright QA snippets

Use Node/Playwright from repo `MegaForm.UI`.

Pattern:

```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.UI"
@'
const fs = require('fs');
const path = require('path');
(async () => {
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch (e) { chromium = require('@playwright/test').chromium; }

  const css = fs.readFileSync(
    'E:/DNN_SITES/OqtaneSites/Oqtane.Fresh.10.1.0/wwwroot/Modules/MegaForm/css/megaform-builder-ts.css',
    'utf8'
  );
  const outDir = 'E:/MENU SPECS/tmp-qa';
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1050, height: 520 }, deviceScaleFactor: 1 });

  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body></body></html>`);

  // Insert exact DOM fixture here.
  // Measure getBoundingClientRect + getComputedStyle.
  // Save screenshot.

  await browser.close();
})();
'@ | node -
```

## 13. Bundle/live checks

Check loader version and required strings:

```powershell
$builder='E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\wwwroot\Modules\MegaForm\js\bundles\megaform-builder.js'
$loader='E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\wwwroot\Modules\MegaForm\js\megaform-builder-loader.js'
$css='E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\wwwroot\Modules\MegaForm\css\megaform-builder-ts.css'
$b=[IO.File]::ReadAllText($builder)
$l=[IO.File]::ReadAllText($loader)
$c=[IO.File]::ReadAllText($css)
[pscustomobject]@{
  LoaderB109 = $l.Contains('20260609-B109')
  HandleIncludesCanvasField = $b.Contains('.mf-drag-handle, .mf-canvas-row, .mf-canvas-field')
  HasCanvasItemDragCloneCss = $c.Contains('.mf-canvas-item.mf-canvas-field.mf-canvas-item-drag-clone')
  UsesSharedDragWidthVar = $c.Contains('--mf-canvas-item-drag-width')
} | ConvertTo-Json
```

Expected:

```json
{
  "LoaderB109": true,
  "HandleIncludesCanvasField": true,
  "HasCanvasItemDragCloneCss": true,
  "UsesSharedDragWidthVar": true
}
```

Check placeholder removed:

```powershell
$bundle='E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\wwwroot\Modules\MegaForm\js\bundles\megaform-builder.js'
$text=[IO.File]::ReadAllText($bundle)
[pscustomobject]@{
  SaveFirstPlaceholderInBundle = $text.Contains('Save the form first to see the live preview here')
  PreviewFailedPlaceholderInBundle = $text.Contains('Preview failed to load. Check that the form is published')
} | ConvertTo-Json
```

Expected:

```json
{
  "SaveFirstPlaceholderInBundle": false,
  "PreviewFailedPlaceholderInBundle": false
}
```

## 14. Pixel-perfect compare voi mock

### 14.1 Screens to compare

Mock:

- `http://localhost:3000/builder?mode=design`

Oqtane:

- `http://localhost:5005/?mfpanel=builder&formId=3`
- `http://localhost:5005/?mfpanel=builder&new=1`

Compare areas:

- Top toolbar:
  - Build/Design segmented pill.
  - Device icons.
  - Publish button.
- Left pane Design:
  - tab height, font, active underline, chips, search, grid tile width.
- Center canvas:
  - background.
  - preview toolbar.
  - form max width.
  - row card spacing.
  - field card spacing.
  - drag handle position.
- Right pane:
  - tabs, labels, inputs, sliders.

### 14.2 Measurement checklist

Use Playwright:

- `locator.boundingBox()` for width/height/x/y.
- `getComputedStyle` for:
  - `font-family`
  - `font-size`
  - `font-weight`
  - `line-height`
  - `color`
  - `background-color`
  - `border-color`
  - `border-radius`
  - `box-shadow`
  - `padding`
  - `gap`
  - `opacity`
  - `pointer-events`

Suggested tolerance:

- Layout x/y/width/height: <= 2px for exact controls.
- Text font-size/line-height: exact.
- Color: exact RGB or acceptable only if browser antialias/opacity involved.
- Drag/hover states: exact CSS computed values.

### 14.3 Screenshot naming

Use deterministic names:

- `tmp-qa/builder-design-leftpane-bXXX.png`
- `tmp-qa/builder-build-canvas-bXXX.png`
- `tmp-qa/drag-handle-bXXX-hover.png`
- `tmp-qa/row-drag-clone-bXXX.png`
- `tmp-qa/top-level-field-drag-clone-bXXX.png`
- `tmp-qa/preset-lavender-renderer-bXXX.png`

## 15. Known gotchas

### 15.1 Auth/session Visual QA

Headless Playwright may not share user's logged-in browser session.

Symptoms:

- Redirect to Home/Login.
- Cannot access actual Oqtane builder in browser automation.

Fallback:

- Use synthetic DOM with live CSS.
- Use live bundle string checks.
- Use manual Chrome visual observation from user screenshot.

### 15.2 `forceFallback: true`

Pros:

- More stable cross-browser DnD.
- Works better with palette/drop zones.

Cons:

- Sortable clone is moved to `body` because `fallbackOnBody:true`.
- It loses canvas container context.
- Must lock width/height with inline styles/classes.

Never remove clone width lock unless replacing Sortable strategy entirely.

### 15.3 Generic `.sortable-fallback`

This rule is required for palette item:

```css
max-width: 160px !important;
```

But it breaks row/field clones. Always override for:

- `.mf-canvas-row.sortable-fallback`
- `.mf-canvas-item.mf-canvas-field.sortable-fallback`
- `.mf-row-drag-clone`
- `.mf-canvas-item-drag-clone`

### 15.4 Remote server

Fixes local live path do not affect remote `dnn10322_megatest.ai`.

Need deploy:

- `megaform-builder.js`
- `megaform-builder-loader.js`
- `megaform-renderer.js` when renderer changed
- `megaform-builder-ts.css`
- `megaform-builder.css` if generated/copy required

Then hard refresh.

### 15.5 Existing unrelated .NET build issue

During this work:

- `dotnet build MegaForm.Oqtane.Server.csproj --no-restore` passed with warnings.
- `dotnet build MegaForm.Web.csproj --no-restore` failed due existing unrelated interface errors in:
  - `MegaForm.Web\Data\Phase2DataLayer.cs`
  - `EfPhase2Repository` not implementing `IPhase2Repository.*`

Do not confuse this with Builder UI fixes.

## 16. Manual acceptance checklist

Before handing to customer:

- Hard refresh builder after deploy.
- In Build mode:
  - Drag top-level field by card body.
  - Drag top-level field by icon.
  - Drag Row by row body/header.
  - Drag field inside Row by card body.
  - Type into field input: should not start drag.
  - Click delete/duplicate: should not start drag.
- In Design mode:
  - Left pane Presets tab looks like mock.
  - Click Lavender: form button/input/labels change immediately.
  - Click Ocean/Forest/Sunset: colors change immediately.
  - No "Save the form first" yellow placeholder.
  - Right Theme Designer values stay consistent.
- Drag QA:
  - Row drag clone keeps full width.
  - Field drag clone keeps full width.
  - Drag handle only appears on hover/focus.
  - Drag handle centered on field edge.
- Live/runtime:
  - Save/apply theme.
  - View live form.
  - Button color, input bg, label color match selected preset.

## 17. Current final artifact list

Important source files touched for final state:

- `MegaForm.UI/src/builder/canvas.ts`
- `MegaForm.UI/src/styles/megaform-builder-ts.css`
- `MegaForm.UI/src/builder/theme-left-rail.ts`
- `MegaForm.UI/src/builder/theme-tab-adapter.ts`
- `MegaForm.UI/src/renderer/index.ts`
- `MegaForm.UI/src/loader/index.ts`
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
- `MegaForm.Web/Controllers/MegaFormController.cs`

Important QA screenshots:

- `E:\MENU SPECS\tmp-qa\drag-handle-b106-default.png`
- `E:\MENU SPECS\tmp-qa\drag-handle-b106-hover.png`
- `E:\MENU SPECS\tmp-qa\preset-lavender-renderer-b107.png`
- `E:\MENU SPECS\tmp-qa\row-drag-clone-b108.png`
- `E:\MENU SPECS\tmp-qa\top-level-field-drag-clone-b109.png`

Final cache:

- `20260609-B109`

## 18. Neu tiep tuc lam pixel-perfect

Recommended next steps:

1. Create permanent QA script under `qa/builder-ui-pixel-qa.cjs`.
2. Add fixtures:
   - Design left pane preset.
   - Build canvas with Row + top-level fields.
   - Drag handle hover.
   - Preset renderer.
3. Export JSON measurement report and screenshot set.
4. Compare against mock screenshot with fixed viewport:
   - Desktop 1366x768
   - Tablet 1024x768
   - Mobile 390x844
5. Add acceptance threshold:
   - Fail if dimension drift > 2px for controls.
   - Fail if preset color does not equal expected RGB.
   - Fail if drag clone width less than source width - 2px.

End of handoff.
