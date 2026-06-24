// QA v03 — verifies:
//   (a) No launcher leak on public form (admin-loaded plugin must NOT
//       inject the button into the runtime [data-mfw-dgrid] wrap).
//   (b) Studio edits trigger properties.showProps so the right Field
//       panel refreshes from the mutated widgetProps.
//
// (a) drives the actual public form; (b) is synthetic (mock builder).

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

const report = {};

// ───────── (a) Public form for form 296 (the one shown in the leak screenshot)
console.log('(a) Public form 296 — expect zero Studio launchers');
await page.goto(`${BASE}/xx?formid=296`, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1500);
report.a_publicForm = await page.evaluate(() => {
  const builderPresent = typeof (window).MegaFormBuilder !== 'undefined';
  const dropzonePresent = !!document.getElementById('mf-canvas-dropzone');
  const canvasFieldPresent = !!document.querySelector('.mf-canvas-field');
  const dgridWraps = document.querySelectorAll('[data-mfw-dgrid="1"]').length;
  const oldLeakBtns = document.querySelectorAll('.mf-dgs-launcher').length;
  const newCanvasBtns = document.querySelectorAll('.mf-dgs-launcher-btn').length;
  return { builderPresent, dropzonePresent, canvasFieldPresent, dgridWraps, oldLeakBtns, newCanvasBtns };
});
await page.screenshot({ path: join(OUT, 'v03-public-form-no-leak.png'), fullPage: true });

// ───────── (b) Synthetic builder context — verify showProps refresh fires
console.log('(b) Synthetic builder — Studio edit triggers properties.showProps');
const showPropsCalls = [];
await page.goto(`${BASE}/xx?formid=293`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.evaluate(() => {
  (window).__showPropsLog = [];
  (window).__canvasRenderLog = [];
  (window).MegaFormBuilder = {
    state: {
      isDirty: false,
      schema: {
        fields: [{
          key: 'items_grid', type: 'DataGrid', label: 'Hoa qua trong don hang',
          widgetProps: {
            tableName: 'OrderItems',
            displayTemplate: 'grid',
            columns: [
              { key: 'product_id', label: 'San pham', type: 'select', optionsSql: 'SELECT [Id] AS value, [ProductName] AS label FROM Products' },
              { key: 'qty', label: 'So luong', type: 'number', decimals: 0 }
            ]
          }
        }]
      }
    },
    callModule: (modName, methodName, args) => {
      if (modName === 'properties' && methodName === 'showProps') {
        (window).__showPropsLog.push({ fieldKey: args[0]?.key, cols: args[0]?.widgetProps?.columns?.length, tplt: args[0]?.widgetProps?.displayTemplate });
      }
      if (modName === 'canvas' && methodName === 'render') {
        (window).__canvasRenderLog.push(true);
      }
    },
    syncSchemaToHtmlImmediate: () => {},
  };
  // Synthetic canvas dropzone so isInBuilder() returns true
  const dz = document.createElement('div');
  dz.id = 'mf-canvas-dropzone';
  dz.innerHTML = `
    <div class="mf-canvas-field" data-type="DataGrid" data-key="items_grid">
      <div>Hoa qua trong don hang (DataGrid)</div>
      <div class="mf-canvas-field-actions"><button>×</button></div>
    </div>
  `;
  dz.style.cssText = 'position:fixed;top:100px;left:20px;width:500px;background:#fff;padding:14px;border:1px solid #ccc;z-index:9999';
  document.body.appendChild(dz);
});

await page.addScriptTag({ url: `/DesktopModules/MegaForm/Assets/js/plugins/megaform-widget-datagrid-studio.js?_=${Date.now()}` });
await page.waitForTimeout(400);

report.b_launcherInjection = await page.evaluate(() => ({
  badge: (window).MFDataGridStudio?.badge,
  launcherCount: document.querySelectorAll('.mf-dgs-launcher-btn').length,
}));

// Open Studio + edit Display Template to "card"
await page.locator('.mf-dgs-launcher-btn').first().click();
await page.waitForSelector('.mf-dgs-overlay', { timeout: 5000 });
await page.locator('[data-mf-dgs-tab="template"]').click();
await page.waitForTimeout(300);
await page.locator('[data-mf-dgs-input="displayTemplate"]').first().selectOption('card');
await page.locator('[data-mf-dgs-input="displayTemplate"]').first().evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
await page.waitForTimeout(300);

// Add a new column
await page.locator('[data-mf-dgs-tab="columns"]').click();
await page.waitForTimeout(200);
await page.locator('[data-mf-dgs-add-col]').click();
await page.waitForTimeout(300);

report.b_postEdit = await page.evaluate(() => ({
  showPropsCalls: (window).__showPropsLog,
  showPropsCount: (window).__showPropsLog.length,
  canvasRenderCount: (window).__canvasRenderLog.length,
  finalDisplayTemplate: (window).MegaFormBuilder.state.schema.fields[0].widgetProps.displayTemplate,
  finalColumnCount: (window).MegaFormBuilder.state.schema.fields[0].widgetProps.columns.length,
  isDirty: (window).MegaFormBuilder.state.isDirty
}));

await page.screenshot({ path: join(OUT, 'v03-after-edits.png'), fullPage: false });

report.consoleErrors = errs;
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'qa-studio-v03-report.json'), JSON.stringify(report, null, 2));
await browser.close();
