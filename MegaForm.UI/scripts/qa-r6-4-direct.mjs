// R6.4 direct QA — bypass login by hand-crafting submission data + schema
// and invoking the renderer code path directly. Renders into an iframe-like
// host element so we can take a screenshot and verify the DOM structure.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

// Visit a page that already loads megaform-submissions.js
await page.goto(`${BASE}/xx?formid=293`, { waitUntil: 'networkidle', timeout: 45000 });
await page.addScriptTag({ url: `/DesktopModules/MegaForm/Assets/js/megaform-submissions.js?_=${Date.now()}` });
await page.addStyleTag({ url: `/DesktopModules/MegaForm/Assets/css/megaform-submissions-ts.css?_=${Date.now()}` });

// Set platform so FK label resolver knows the form id + apiBase
await page.evaluate(() => {
  (window).__MF_PLATFORM__ = (window).__MF_PLATFORM__ || {};
  (window).__MF_PLATFORM__.apiBase = '/DesktopModules/MegaForm/API/';
  (window).__MF_PLATFORM__.pin = { formId: 293 };
});

// Synthetic schema mimicking form 293
const exported = await page.evaluate(() => {
  return Object.keys(window).filter(k => /Megaform|Submission/i.test(k)).slice(0, 20);
});
console.log('exposed globals containing Submission/Megaform:', exported);

// Look for renderFormView export. Since the file is a Vite UMD bundle, it may
// have attached methods on a global. Try both `window.MegaFormSubmissions` and
// loading the source module dynamically.
const tryRender = await page.evaluate(async () => {
  const candidates = ['MegaFormSubmissions','MegaFormSubmissionInbox','MFSubmissionView'];
  for (const c of candidates) {
    const o = (window)[c];
    if (o && typeof o.renderFormView === 'function') return c;
    if (o && o.SubmissionFormView && typeof o.SubmissionFormView.renderFormView === 'function') return c + '.SubmissionFormView';
  }
  return null;
});
console.log('renderFormView entry point:', tryRender);

const buildOk = await page.evaluate(() => {
  const host = document.createElement('div');
  host.id = 'r6-4-host';
  host.style.cssText = 'position:fixed;top:80px;left:20px;right:20px;bottom:20px;background:#fff;padding:20px;border:1px solid #cbd5e1;border-radius:10px;overflow:auto;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,sans-serif';
  document.body.appendChild(host);

  // Synthetic submission detail aligned with form 293 schema
  const submission = {
    submissionId: 1251,
    formId: 293,
    data: {
      supplier_id: '1',  // FK -> ACME
      products_razor: '',  // SSR display-only widget
      new_products_grid: JSON.stringify([
        { image_url: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=300', product_name: 'Tomato (test row)', unit_price: 25, stock_qty: 110, sku: 'TM-22' },
        { image_url: '', product_name: 'Banana', unit_price: 18, stock_qty: 50, sku: 'BN-CV-01' }
      ]),
      detail_demo_grid: JSON.stringify([
        { title: 'Reorder pomelo', priority: 'high', due_date: '2026-06-05', note: 'Vinh Long supplier' }
      ]),
      note: 'Test note from R6.4 QA'
    },
    fields: [
      { key: 'supplier_id', type: 'Select', label: 'Nhà cung cấp', properties: { optionsSql: 'SELECT [Id] AS value, [SupplierName] AS label FROM [dbo].[Suppliers] ORDER BY [SupplierName]', optionsSource: 'sql', optionsConnectionKey: 'DashboardDatabase' } },
      { key: 'products_razor', type: 'Razor', label: 'Sản phẩm hiện có của nhà cung cấp', widgetProps: {} },
      { key: 'new_products_grid', type: 'DataGrid', label: 'Thêm sản phẩm mới cho nhà cung cấp này', widgetProps: {
        tableName: 'Products', columns: [
          { key: 'image_url',    label: 'Image', type: 'image', width: '1fr' },
          { key: 'product_name', label: 'Tên sản phẩm', type: 'text', width: '2fr' },
          { key: 'unit_price',   label: 'Đơn giá', type: 'currency' },
          { key: 'stock_qty',    label: 'Tồn kho', type: 'number' },
          { key: 'sku',          label: 'SKU', type: 'text' }
        ]
      } },
      { key: 'detail_demo_grid', type: 'DataGrid', label: 'Master-detail variant demo', widgetProps: {
        tableName: 'NotesDemo', columns: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'priority', label: 'Priority', type: 'select' },
          { key: 'due_date', label: 'Due', type: 'date' },
          { key: 'note', label: 'Note', type: 'text' }
        ]
      } },
      { key: 'note', type: 'Textarea', label: 'Ghi chú' }
    ]
  };

  // [R6.4 QA hook] window.__MF_RenderFormView is exported by SubmissionFormView.ts
  const fn = (window).__MF_RenderFormView;
  if (typeof fn === 'function') {
    try { host.appendChild(fn(submission.data, submission.fields)); return 'rendered via __MF_RenderFormView'; } catch (e) { host.textContent = 'render error: ' + e.message; return 'error:' + e.message; }
  }
  host.innerHTML = '<h3>__MF_RenderFormView not exposed — bundle may not have rebuilt</h3>';
  return 'no-renderer';
});
console.log('build result:', buildOk);

await page.waitForTimeout(2500);
await page.screenshot({ path: join(OUT, 'r6-4-direct-render.png'), fullPage: false });

const inspect = await page.evaluate(() => {
  const wrap = document.querySelector('#r6-4-host .mf-form-view-wrapper');
  if (!wrap) return { mounted: false, hostText: (document.getElementById('r6-4-host')?.innerHTML || '').slice(0, 600) };
  return {
    mounted: true,
    selectLabels: document.querySelectorAll('.mf-form-view-select [data-fk-label]').length,
    datagridTables: document.querySelectorAll('.mf-form-view-dgrid-table').length,
    datagridImageCells: document.querySelectorAll('.mf-form-view-dgrid-table img').length,
    razorPlaceholders: Array.from(document.querySelectorAll('.mf-form-view-empty')).filter(n => (n.textContent || '').includes('Display-only Razor')).length,
    rawJsonLeak: document.querySelectorAll('pre.mf-form-view-json').length,
    htmlSample: wrap.innerHTML.slice(0, 1800),
  };
});

const report = { buildOk, inspect, consoleErrors: errs };
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'r6-4-direct-report.json'), JSON.stringify(report, null, 2));
await browser.close();
