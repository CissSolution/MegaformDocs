// R2.5 QA — Studio Bind tab Lifecycle hooks section.
// Synthesises a builder context, opens DataGridStudio on a DataGrid field,
// jumps to Bind tab, verifies 3 lifecycle hook rows render, edits one and
// confirms the change propagates to widgetProps.rowLifecycle.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(`${BASE}/xx?formid=293`, { waitUntil: 'domcontentloaded', timeout: 45000 });

await page.evaluate(() => {
  (window).MegaFormBuilder = {
    state: {
      isDirty: false,
      schema: {
        fields: [{
          key: 'items_grid', type: 'DataGrid', label: 'Items',
          widgetProps: {
            tableName: 'OrderItems',
            displayTemplate: 'grid',
            columns: [
              { key: 'product_id', label: 'Product', type: 'select' },
              { key: 'qty', label: 'Qty', type: 'number' }
            ]
          }
        }]
      }
    },
    callModule: () => {},
    syncSchemaToHtmlImmediate: () => {},
  };
});

await page.addScriptTag({ url: `/DesktopModules/MegaForm/Assets/js/plugins/megaform-widget-datagrid-studio.js?_=${Date.now()}` });
await page.evaluate(() => (window).MFDataGridStudio.open('items_grid'));
await page.waitForSelector('.mf-dgs-overlay', { timeout: 5000 });

await page.locator('[data-mf-dgs-tab="bind"]').click();
await page.waitForTimeout(300);

const inspect = await page.evaluate(() => ({
  badge: (window).MFDataGridStudio.badge,
  hookBlocks: document.querySelectorAll('[data-mf-dgs-hook]').length,
  hookSlots: Array.from(document.querySelectorAll('[data-mf-dgs-hook]')).map(h => h.getAttribute('data-mf-dgs-hook')),
  enabledCount: document.querySelectorAll('[data-mf-dgs-hookfield="enabled"]').length,
  granularityCount: document.querySelectorAll('[data-mf-dgs-hookfield="granularity"]').length,
  onFailureCount: document.querySelectorAll('[data-mf-dgs-hookfield="onFailure"]').length,
  sqlBoxCount: document.querySelectorAll('[data-mf-dgs-hookfield="sql"]').length,
}));

await page.screenshot({ path: join(OUT, 'r2-studio-lifecycle.png'), fullPage: false });

// Enable postInsert hook + write SQL + change granularity to row
const block = page.locator('[data-mf-dgs-hook="postInsert"]');
await block.locator('[data-mf-dgs-hookfield="enabled"]').check();
await block.locator('[data-mf-dgs-hookfield="enabled"]').evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
await block.locator('[data-mf-dgs-hookfield="granularity"]').selectOption('row');
await block.locator('[data-mf-dgs-hookfield="granularity"]').evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
await block.locator('[data-mf-dgs-hookfield="sql"]').fill('INSERT INTO Products (ProductName, SupplierId) VALUES (:product_name, :supplier_id)');
await block.locator('[data-mf-dgs-hookfield="sql"]').evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
await page.waitForTimeout(300);

const postEdit = await page.evaluate(() => ({
  rowLifecycle: (window).MegaFormBuilder.state.schema.fields[0].widgetProps.rowLifecycle,
  isDirty: (window).MegaFormBuilder.state.isDirty,
}));

const report = { inspect, postEdit, consoleErrors: errs };
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'r2-studio-lifecycle-report.json'), JSON.stringify(report, null, 2));
await browser.close();
