import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = 'E:/MENU SPECS/tmp-qa-b110';
fs.mkdirSync(outDir, { recursive: true });

const cssPath = 'E:/DNN_SITES/OqtaneSites/Oqtane.Fresh.10.1.0/wwwroot/Modules/MegaForm/css/megaform-builder-ts.css';
const css = fs.readFileSync(cssPath, 'utf8');

const bundlePath = 'E:/DNN_SITES/OqtaneSites/Oqtane.Fresh.10.1.0/wwwroot/Modules/MegaForm/js/bundles/megaform-builder.js';
const bundle = fs.readFileSync(bundlePath, 'utf8');

const loaderPath = 'E:/DNN_SITES/OqtaneSites/Oqtane.Fresh.10.1.0/wwwroot/Modules/MegaForm/js/megaform-builder-loader.js';
const loader = fs.readFileSync(loaderPath, 'utf8');

// Bundle checks
const checks = {
  loaderVersionB110: loader.includes('20260609-B110'),
  handleHoverHasCanvasDropzone: bundle.includes('#mf-canvas-dropzone .mf-canvas-field:hover > .mf-drag-handle'),
  lockCanvasItemDragSizeHasRowField: bundle.includes("const isRowField = el.classList.contains('mf-row-field')"),
  rowSortableOnClone: bundle.includes('onClone(evt: any) {') && bundle.includes("lockCanvasItemDragSize(evt && evt.clone ? evt.clone as HTMLElement : null, evt && evt.item ? evt.item as HTMLElement : null)"),
  rowFieldDragCloneCss: css.includes('.mf-row-field.mf-row-field-drag-clone'),
  rightPanelWidthTransition: css.includes('transition: width 0.25s ease, opacity 0.25s ease, padding 0.25s ease, border-width 0.25s ease'),
  leftPanelCollapsedOpacity0: css.includes('.mf-panel-left.mf-collapsed {\n  width: 0 !important;\n  min-width: 0 !important;\n  overflow: hidden !important;\n  opacity: 0 !important;'),
  sortableFallbackOpacity1: css.includes('opacity: 1 !important;') && css.includes('box-shadow: 0 16px 40px rgba(99, 102, 241, .28)'),
};
console.log('Bundle/CSS checks:', checks);
fs.writeFileSync(path.join(outDir, 'bundle-checks.json'), JSON.stringify(checks, null, 2));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.setContent(`<!doctype html>
<html>
<head>
<style>
${css}
/* Extra layout for synthetic test */
body { margin:0; display:flex; height:100vh; background:#f4f4f5; }
.mf-panel-left { width:256px; background:#fff; border-right:1px solid #e4e4e7; position:relative; overflow:visible; }
.mf-panel-left.mf-collapsed { width:0 !important; min-width:0 !important; overflow:hidden !important; opacity:0 !important; padding:0 !important; border-right-width:0 !important; }
.mf-panel-center { flex:1; display:flex; justify-content:center; align-items:flex-start; padding:24px; }
.mf-panel-right { width:300px; background:#fff; border-left:1px solid #e4e4e7; position:relative; overflow:visible; transition: width 0.25s ease, opacity 0.25s ease, padding 0.25s ease, border-width 0.25s ease !important; }
.mf-panel-right.mf-collapsed { width:0 !important; min-width:0 !important; max-width:0 !important; padding:0 !important; margin:0 !important; opacity:0 !important; border-left-width:0 !important; overflow:hidden !important; pointer-events:none !important; }
#mf-canvas-dropzone { width:760px; background:#fff; border:1px dashed #e4e4e7; border-radius:8px; padding:24px; }
</style>
</head>
<body>
<div id="mf-panel-left" class="mf-panel-left">
  <div class="mf-panel-header">Left Panel</div>
  <a href="#" id="mf-left-collapse-btn" class="mf-left-collapse-trigger">&lt;</a>
</div>
<div class="mf-panel-center">
  <div id="mf-canvas-dropzone">
    <div class="mf-canvas-item mf-canvas-field" data-index="0" style="position:relative;padding:16px 20px;border:1px solid #e4e4e7;border-radius:8px;margin-bottom:12px;background:#fff;">
      <span class="mf-drag-handle" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></span>
      <span class="mf-canvas-field-label">Top-level Field (outside row)</span>
    </div>
    <div class="mf-canvas-item mf-canvas-field mf-row-field" data-index="1" style="position:relative;padding:16px 20px;border:1px solid #e4e4e7;border-radius:8px;margin-bottom:12px;background:#fff;">
      <span class="mf-drag-handle" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></span>
      <span class="mf-canvas-field-label">Row Field (inside row)</span>
    </div>
  </div>
</div>
<div id="mf-panel-right" class="mf-panel-right">
  <div class="mf-right-tabs">Right Panel</div>
  <a href="#" id="mf-right-collapse-btn" class="mf-collapse-btn">&gt;</a>
</div>
<script>
  document.getElementById('mf-left-collapse-btn').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('mf-panel-left').classList.toggle('mf-collapsed');
  });
  document.getElementById('mf-right-collapse-btn').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('mf-panel-right').classList.toggle('mf-collapsed');
  });
</script>
</body>
</html>`);

await page.waitForTimeout(500);

// Screenshot 1: default
await page.screenshot({ path: path.join(outDir, 'synth-01-default.png') });

// Screenshot 2: left collapsed
await page.evaluate(() => document.getElementById('mf-left-collapse-btn').click());
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, 'synth-02-left-collapsed.png') });

// Screenshot 3: right collapsed (reset left first)
await page.evaluate(() => document.getElementById('mf-left-collapse-btn').click());
await page.evaluate(() => document.getElementById('mf-right-collapse-btn').click());
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, 'synth-03-right-collapsed.png') });

// Screenshot 4: hover top-level field to see drag handle
await page.evaluate(() => document.getElementById('mf-right-collapse-btn').click());
const hoverField = page.locator('#mf-canvas-dropzone > .mf-canvas-item.mf-canvas-field:not(.mf-row-field)');
await hoverField.hover();
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(outDir, 'synth-04-hover-topfield.png') });

// Measure drag handle computed style for top-level field
const handleStyles = await page.evaluate(() => {
  const field = document.querySelector('#mf-canvas-dropzone > .mf-canvas-item.mf-canvas-field:not(.mf-row-field)');
  const handle = field.querySelector('.mf-drag-handle');
  const c = window.getComputedStyle(handle);
  return {
    opacity: c.opacity,
    pointerEvents: c.pointerEvents,
    display: c.display,
    width: c.width,
    height: c.height,
    left: c.left,
    top: c.top
  };
});
console.log('Top-level drag handle computed:', handleStyles);
fs.writeFileSync(path.join(outDir, 'synth-handle-styles.json'), JSON.stringify(handleStyles, null, 2));

// Screenshot 5: simulate drag clone by adding classes manually
await page.evaluate(() => {
  const field = document.querySelector('#mf-canvas-dropzone > .mf-canvas-item.mf-canvas-field:not(.mf-row-field)');
  field.classList.add('sortable-fallback', 'mf-canvas-item-drag-clone');
  field.style.setProperty('--mf-canvas-item-drag-width', '760px');
});
await page.screenshot({ path: path.join(outDir, 'synth-05-clone-topfield.png') });

// Screenshot 6: row-field clone
await page.evaluate(() => {
  const field = document.querySelector('.mf-row-field');
  field.classList.add('sortable-fallback', 'mf-row-field-drag-clone');
  field.style.setProperty('--mf-canvas-item-drag-width', '360px');
});
await page.screenshot({ path: path.join(outDir, 'synth-06-clone-rowfield.png') });

// Measure right panel width when collapsed
const rightCollapsedBox = await page.evaluate(() => {
  const p = document.getElementById('mf-panel-right');
  p.classList.add('mf-collapsed');
  return p.getBoundingClientRect();
});
console.log('Right panel collapsed rect:', rightCollapsedBox);

const leftCollapsedBox = await page.evaluate(() => {
  const p = document.getElementById('mf-panel-left');
  p.classList.add('mf-collapsed');
  return p.getBoundingClientRect();
});
console.log('Left panel collapsed rect:', leftCollapsedBox);

fs.writeFileSync(path.join(outDir, 'synth-panel-boxes.json'), JSON.stringify({
  rightCollapsed: { width: rightCollapsedBox.width, height: rightCollapsedBox.height },
  leftCollapsed: { width: leftCollapsedBox.width, height: leftCollapsedBox.height }
}, null, 2));

await browser.close();
console.log('Synthetic QA done. Output:', outDir);
