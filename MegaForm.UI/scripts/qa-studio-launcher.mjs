// Verify the DataGrid Studio launcher injects itself into builder
// canvas cards (.mf-canvas-field[data-type="DataGrid"]). We can't reach
// the live builder without auth, but we CAN reproduce the canvas card
// shape on a public page + load the plugin + check that the launcher
// button appears and triggers the Studio modal.

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

await page.goto(`${BASE}/xx?formid=293`, { waitUntil: 'domcontentloaded', timeout: 45000 });

// Build a synthetic builder + canvas with two DataGrid cards
await page.evaluate(() => {
  (window).MegaFormBuilder = {
    state: {
      isDirty: false,
      schema: {
        fields: [
          {
            key: 'new_products_grid', type: 'DataGrid', label: 'Thêm sản phẩm mới',
            widgetProps: {
              displayTemplate: 'card',
              columns: [
                { key: 'img', label: 'Image', type: 'image', width: '1fr' },
                { key: 'name', label: 'Name', type: 'text', width: '2fr', required: true }
              ]
            }
          },
          {
            key: 'detail_demo_grid', type: 'DataGrid', label: 'Master-detail variant demo',
            widgetProps: {
              displayTemplate: 'master-detail',
              columns: [
                { key: 'title', label: 'Title', type: 'text', width: '2fr' }
              ]
            }
          }
        ]
      }
    },
    callModule: () => {},
    syncSchemaToHtmlImmediate: () => {},
  };

  // Append synthetic canvas cards that mirror the builder structure
  const canvas = document.createElement('div');
  canvas.id = 'mf-synthetic-canvas';
  canvas.style.cssText = 'position:fixed;top:120px;left:20px;width:600px;background:#fff;padding:14px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:99999';
  canvas.innerHTML = `
    <h4 style="margin:0 0 12px;font-family:sans-serif">Synthetic builder canvas</h4>
    <div class="mf-canvas-field" data-type="DataGrid" data-key="new_products_grid" style="border:1px solid #cbd5e1;border-radius:8px;padding:10px;margin-bottom:10px;display:flex;align-items:center;gap:8px">
      <div style="flex:1">
        <div style="font-weight:600">Thêm sản phẩm mới cho nhà cung cấp này</div>
        <div style="color:#64748b;font-size:12px">📊 Data Grid (Master-Detail) Widget</div>
      </div>
      <div class="mf-canvas-field-actions" style="display:flex;gap:4px">
        <button>×</button>
      </div>
    </div>
    <div class="mf-canvas-field" data-type="DataGrid" data-key="detail_demo_grid" style="border:1px solid #cbd5e1;border-radius:8px;padding:10px;display:flex;align-items:center;gap:8px">
      <div style="flex:1">
        <div style="font-weight:600">Master-detail variant demo</div>
        <div style="color:#64748b;font-size:12px">📊 Data Grid (Master-Detail) Widget</div>
      </div>
      <div class="mf-canvas-field-actions" style="display:flex;gap:4px">
        <button>×</button>
      </div>
    </div>
  `;
  document.body.appendChild(canvas);
});

// Load the studio plugin
await page.addScriptTag({ url: `/DesktopModules/MegaForm/Assets/js/plugins/megaform-widget-datagrid-studio.js?_=${Date.now()}` });
await page.waitForTimeout(500); // give MutationObserver a tick

// Inspect launchers
const inspect = await page.evaluate(() => {
  const cards = document.querySelectorAll('.mf-canvas-field[data-type="DataGrid"]');
  const launchers = document.querySelectorAll('.mf-dgs-launcher-btn');
  return {
    badge: (window).MFDataGridStudio?.badge,
    canvasCards: cards.length,
    launchersInjected: launchers.length,
    launcherTexts: Array.from(launchers).map(b => b.textContent),
  };
});

await page.screenshot({ path: join(OUT, 'studio-launcher-01-canvas.png'), fullPage: false, clip: { x: 0, y: 100, width: 700, height: 350 } });

// Click first launcher and verify Studio modal opens
await page.locator('.mf-dgs-launcher-btn').first().click();
await page.waitForSelector('.mf-dgs-overlay', { timeout: 5000 });
const modalReport = await page.evaluate(() => ({
  modalOpen: !!document.querySelector('.mf-dgs-overlay'),
  fieldKeyShown: document.querySelector('.mf-dgs-head code')?.textContent,
  tabs: document.querySelectorAll('.mf-dgs-tab').length,
}));
await page.screenshot({ path: join(OUT, 'studio-launcher-02-modal.png'), fullPage: false });

const report = { inspect, modalReport, consoleErrors: errs };
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'studio-launcher-report.json'), JSON.stringify(report, null, 2));
await browser.close();
