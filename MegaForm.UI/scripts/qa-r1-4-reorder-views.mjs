// R1.4 QA — column reorder + saved views.
//   1) Login as host
//   2) Hit the GET prefs endpoint anonymously and authenticated
//   3) Save a synthetic view via POST, confirm row landed in MF_DataGridUserPrefs
//   4) Mount a synthetic SQL display grid + drag the Name header onto Stock → order changes
//   5) Saved views bar present + lists the saved view name

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

// Login as host
await page.goto(`${BASE}/Login?returnurl=/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
try {
  await page.waitForSelector('input[name*="Username"], input[id*="Username"]', { timeout: 6000 });
  await page.locator('input[name*="Username"], input[id*="Username"]').first().fill('host');
  await page.locator('input[name*="Password"], input[id*="Password"]').first().fill('dnnhost');
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }),
    page.locator('input[type="submit"][value*="Login"], a[id*="cmdLogin"], button[id*="cmdLogin"]').first().click(),
  ]);
} catch (e) { console.warn('login form differed:', e?.message); }

// Boot the MegaForm plugins
await page.goto(`${BASE}/xx?formid=293`, { waitUntil: 'networkidle', timeout: 45000 });
await page.addScriptTag({ url: `/DesktopModules/MegaForm/Assets/js/plugins/megaform-widget-datagrid-sql.js?_=${Date.now()}` });
await page.waitForTimeout(500);

const badge = await page.evaluate(() => (window).__MF_DATAGRID_SQL_BADGE__);
console.log('badge:', badge);

// Synthesise a small SQL display grid + intercept the XHR
const setup = await page.evaluate(() => {
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push({ Id: i + 1, Name: 'R' + (i + 1), Price: (i * 1.5).toFixed(2), Stock: i * 7 });
  const dataPayload = { columns: [
    { key: 'Id', label: 'Id' }, { key: 'Name', label: 'Name' },
    { key: 'Price', label: 'Price' }, { key: 'Stock', label: 'Stock' }
  ], rows };
  // Intercept XHR for DataRepeater/Query
  const OrigXhr = window.XMLHttpRequest;
  function StubXhr() {
    const inst = new OrigXhr();
    const origOpen = inst.open; let stubUrl = '';
    inst.open = function(m, u, ...rest) { stubUrl = String(u); return origOpen.call(inst, m, u, ...rest); };
    const origSend = inst.send;
    inst.send = function(...args) {
      if (stubUrl.indexOf('DataRepeater/Query') >= 0 && stubUrl.indexOf('widgetKey=qa-grid') >= 0) {
        setTimeout(() => {
          Object.defineProperty(inst, 'readyState', { value: 4, configurable: true });
          Object.defineProperty(inst, 'status',     { value: 200, configurable: true });
          Object.defineProperty(inst, 'responseText', { value: JSON.stringify(dataPayload), configurable: true });
          if (inst.onreadystatechange) inst.onreadystatechange({});
        }, 20);
        return;
      }
      return origSend.apply(inst, args);
    };
    return inst;
  }
  window.XMLHttpRequest = StubXhr;

  const wrap = document.createElement('div');
  wrap.id = 'qa-grid';
  wrap.className = 'mfw-dgrid';
  wrap.setAttribute('data-mfw-dgrid', '1');
  wrap.setAttribute('data-field-key', 'qa-grid');
  wrap.setAttribute('data-form-id', '293');
  wrap.style.cssText = 'position:fixed;top:80px;left:20px;width:740px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;z-index:99999;font-family:system-ui;font-size:13px';
  document.body.appendChild(wrap);
  (window).MFDataGridSql.bind(wrap, {
    columns: dataPayload.columns, useSql: true, queryDependsOn: '', pageSize: 50, tableName: 'QA grid'
  }, 293, 'qa-grid');
  return 'ok';
});

await page.waitForTimeout(800);
await page.screenshot({ path: join(OUT, 'r1-4-01-initial.png'), fullPage: false });

const initialOrder = await page.evaluate(() => {
  const headers = document.querySelectorAll('#qa-grid .mfw-dgrid-head-cell[data-mfw-colkey]');
  return Array.from(headers).map(h => h.getAttribute('data-mfw-colkey'));
});
console.log('initial column order:', initialOrder);

// Drag the "Name" column header onto the "Stock" column header → reorder
const nameHdr = page.locator('#qa-grid .mfw-dgrid-head-cell[data-mfw-colkey="Name"]').first();
const stockHdr = page.locator('#qa-grid .mfw-dgrid-head-cell[data-mfw-colkey="Stock"]').first();
const nb = await nameHdr.boundingBox();
const sb = await stockHdr.boundingBox();
let reorderResult = 'no-handle';
if (nb && sb) {
  // Use the dataTransfer API via dispatched DragEvent — Playwright drag-and-drop on draggable elements
  await nameHdr.evaluate((src, dstSel) => {
    const dst = document.querySelector(dstSel);
    const dt = new DataTransfer();
    dt.setData('text/plain', src.getAttribute('data-mfw-colkey'));
    src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    dst.dispatchEvent(new DragEvent('dragover',  { dataTransfer: dt, bubbles: true, cancelable: true }));
    dst.dispatchEvent(new DragEvent('drop',      { dataTransfer: dt, bubbles: true, cancelable: true }));
    src.dispatchEvent(new DragEvent('dragend',   { dataTransfer: dt, bubbles: true }));
  }, '#qa-grid .mfw-dgrid-head-cell[data-mfw-colkey="Stock"]');
  await page.waitForTimeout(300);
  reorderResult = await page.evaluate(() => Array.from(document.querySelectorAll('#qa-grid .mfw-dgrid-head-cell[data-mfw-colkey]')).map(h => h.getAttribute('data-mfw-colkey')));
}

await page.screenshot({ path: join(OUT, 'r1-4-02-reordered.png'), fullPage: false });

// Save a view via the API (skips the prompt)
const saveResult = await page.evaluate(async () => {
  const tok = (document.querySelector('input[name="__RequestVerificationToken"]') || {}).value || '';
  const body = { formId: 293, fieldKey: 'qa-grid', viewName: 'My View 1', configJson: JSON.stringify({ columnOrder: ['Stock','Id','Name','Price'], columnWidths: { Price: '180px' } }) };
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/DataGridPrefs', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'RequestVerificationToken': tok },
    body: JSON.stringify(body)
  });
  return { status: r.status, body: await r.text() };
});

// Pull the saved views list (GET)
const listResult = await page.evaluate(async () => {
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/DataGridPrefs?formId=293&fieldKey=qa-grid', { credentials: 'same-origin' });
  return { status: r.status, body: await r.text() };
});

// Refresh the views bar UI by remounting
await page.evaluate(() => {
  const wrap = document.getElementById('qa-grid');
  if (wrap) { (wrap).__mfwDgridSqlBound = false; wrap.innerHTML = ''; }
  setTimeout(() => {
    const newWrap = document.getElementById('qa-grid');
    if (newWrap) {
      (window).MFDataGridSql.bind(newWrap, { columns: [
        { key: 'Id', label: 'Id' }, { key: 'Name', label: 'Name' },
        { key: 'Price', label: 'Price' }, { key: 'Stock', label: 'Stock' }
      ], useSql: true, queryDependsOn: '', pageSize: 50, tableName: 'QA grid' }, 293, 'qa-grid');
    }
  }, 50);
});
await page.waitForTimeout(1000);
await page.screenshot({ path: join(OUT, 'r1-4-03-saved-views.png'), fullPage: false });

const savedViewChips = await page.evaluate(() => Array.from(document.querySelectorAll('[data-mfw-view]')).map(c => c.getAttribute('data-mfw-view')));

const report = {
  badge,
  initialOrder,
  reorderResult,
  reordered: JSON.stringify(reorderResult) !== JSON.stringify(initialOrder),
  saveResult,
  listResult,
  savedViewChips,
  consoleErrors: errs
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'r1-4-reorder-views-report.json'), JSON.stringify(report, null, 2));
await browser.close();
