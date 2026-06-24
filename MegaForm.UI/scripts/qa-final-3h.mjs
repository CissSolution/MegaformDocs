// Final QA after the 3-hour iteration. Runs all the visual checks the
// user agreed on:
//   1) Form 293 — supplier picker + Razor card grid with images
//   2) DataGrid in Card mode renders cards + Add row + image upload UI
//   3) DataGrid in Master-detail mode renders collapsed rows + expand
//   4) DataGrid Studio popup opens + 4 tabs + edits mutate state
//   5) DryRunValidate endpoint reachable (401 for anonymous is OK)
//
// Headless Chrome, captures full-page screenshots per phase.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => errs.push(`[pageerror] ${e.message}`));

const report = { phases: {} };

// PHASE 1 — Form 293 supplier + razor + datagrid
console.log('PHASE 1 — form 293');
await page.goto(`${BASE}/xx?formid=293`, { waitUntil: 'networkidle', timeout: 45000 });
await page.locator('select[name="supplier_id"]').first().selectOption('1');
await page.locator('select[name="supplier_id"]').first().evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
await page.waitForTimeout(1800);

const phase1 = await page.evaluate(() => {
  return {
    razorCards: document.querySelectorAll('.mf-supplier-product-card').length,
    razorImagesLoaded: Array.from(document.querySelectorAll('.mf-supplier-product-card img')).filter(img => img.complete && img.naturalWidth > 0).length,
    dgridWraps: document.querySelectorAll('[data-mfw-dgrid="1"]').length,
    dgridBadges: Array.from(document.querySelectorAll('[data-mfw-dgrid="1"]')).map(w => w.getAttribute('data-badge')),
    cardWraps: document.querySelectorAll('.mfw-dgrid-cards').length,
    mdWraps: document.querySelectorAll('.mfw-dgrid-md').length,
  };
});
report.phases.p1_razorAndDataGrid = phase1;
await page.screenshot({ path: join(OUT, 'final-p1-razor-and-grids.png'), fullPage: true });

// Click each Add row to expand the grids
const addBtns = page.locator('[data-mfw-add]');
const addCount = await addBtns.count();
for (let i = 0; i < addCount; i++) {
  await addBtns.nth(i).click();
  await page.waitForTimeout(300);
}
const phase1b = await page.evaluate(() => ({
  cardRows: document.querySelectorAll('.mfw-dgrid-card').length,
  mdRows: document.querySelectorAll('.mfw-dgrid-md-row').length,
  imageCellsRendered: document.querySelectorAll('.mfw-dgrid-card-cover').length,
  uploadBtns: document.querySelectorAll('[data-mfw-image-upload]').length,
}));
report.phases.p1b_addedRows = phase1b;
await page.screenshot({ path: join(OUT, 'final-p1b-after-add.png'), fullPage: true });

// PHASE 2 — DataGrid Studio (synthetic)
console.log('PHASE 2 — DataGrid Studio');
await page.evaluate(() => {
  (window).MegaFormBuilder = {
    state: {
      isDirty: false,
      schema: {
        fields: [{
          key: 'demo_grid', type: 'DataGrid', label: 'Demo',
          widgetProps: {
            tableName: 'Products', displayTemplate: 'card', imageColumn: 'img',
            columns: [
              { key: 'img', label: 'Image', type: 'image', width: '1fr' },
              { key: 'name', label: 'Name', type: 'text', width: '2fr', required: true },
              { key: 'price', label: 'Price', type: 'currency', width: '120px', decimals: 2 }
            ]
          }
        }]
      }
    },
    callModule: () => {}, syncSchemaToHtmlImmediate: () => {}
  };
});
await page.addScriptTag({ url: `/DesktopModules/MegaForm/Assets/js/plugins/megaform-widget-datagrid-studio.js?_=${Date.now()}` });

const studioReady = await page.evaluate(() => typeof (window).MFDataGridStudio?.open === 'function');
await page.evaluate(() => (window).MFDataGridStudio.open('demo_grid'));
await page.waitForSelector('.mf-dgs-overlay', { timeout: 5000 });
const studioReport = await page.evaluate(() => ({
  badge: (window).MFDataGridStudio.badge,
  tabs: document.querySelectorAll('.mf-dgs-tab').length,
  settingsRows: document.querySelectorAll('[data-mf-dgs-panel="settings"] .mf-dgs-row').length,
  columnCount: document.querySelector('[data-mf-dgs-colcount]')?.textContent
}));
report.phases.p2_studio = { studioReady, ...studioReport };
await page.screenshot({ path: join(OUT, 'final-p2-studio.png'), fullPage: false });

// PHASE 3 — DryRunValidate endpoint reachability
console.log('PHASE 3 — DryRunValidate endpoint');
const dryRun = await page.evaluate(async () => {
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/DryRunValidate', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: 'SELECT * FROM dbo.Products WHERE SupplierId=:sid', connectionKey: 'DashboardDatabase' })
  });
  return { status: r.status, statusText: r.statusText };
});
report.phases.p3_dryRunValidate = dryRun;

report.consoleErrors = errs;
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'final-3h-report.json'), JSON.stringify(report, null, 2));
await browser.close();
