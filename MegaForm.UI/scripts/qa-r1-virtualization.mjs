// R1.1 + R1.4 QA — DataGrid virtualization + column resize.
//   1) Synthesise a 1000-row dataset, mount the SQL display mode against
//      it (we bypass the actual /DataRepeater/Query fetch by stubbing the
//      ajaxJson global the plugin uses).
//   2) Verify only the windowed slice is in the DOM (~30 rows + overscan,
//      definitely far less than 1000).
//   3) Scroll halfway → window shifts; original first row no longer in DOM.
//   4) Drag the resize handle on a header → grid-template-columns updates
//      across both head + window grids.
//
// Bonus: confirms the dense (non-virt) renderer still kicks in below the
// threshold by mounting a second instance with 50 rows.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

// Boot any MegaForm page so the plugins load
await page.goto(`${BASE}/xx?formid=293`, { waitUntil: 'networkidle', timeout: 45000 });
await page.addScriptTag({ url: `/DesktopModules/MegaForm/Assets/js/plugins/megaform-widget-datagrid-sql.js?_=${Date.now()}` });
await page.waitForTimeout(300);

const badge = await page.evaluate(() => (window).__MF_DATAGRID_SQL_BADGE__);
console.log('sql-mode badge:', badge);

// Stub the AJAX layer used by the plugin so we can deterministically inject 1000 rows
const setup = await page.evaluate(() => {
  // Recreate a synthetic wrap on the page outside the form
  function buildWrap(id, dataPayload) {
    const wrap = document.createElement('div');
    wrap.id = id;
    wrap.className = 'mfw-dgrid';
    wrap.setAttribute('data-mfw-dgrid', '1');
    wrap.setAttribute('data-field-key', id);
    wrap.setAttribute('data-form-id', '293');
    wrap.style.cssText = 'position:fixed;width:760px;background:#fff;padding:0;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;z-index:99999;font-family:system-ui;font-size:13px';
    document.body.appendChild(wrap);
    // Intercept XHR for DataRepeater/Query — the plugin uses XMLHttpRequest, not fetch.
    if (!(window).__mfMockXhrInstalled) {
      (window).__mfMockXhrInstalled = true;
      const OrigXhr = window.XMLHttpRequest;
      function StubXhr() {
        const inst = new OrigXhr();
        const origOpen = inst.open;
        let stubUrl = '';
        inst.open = function(method, url, ...rest) {
          stubUrl = String(url);
          return origOpen.call(inst, method, url, ...rest);
        };
        const origSend = inst.send;
        inst.send = function(...args) {
          if (stubUrl.indexOf('DataRepeater/Query') >= 0) {
            const which = stubUrl.indexOf('widgetKey=virt-1000') >= 0 ? bigData : (stubUrl.indexOf('widgetKey=dense-50') >= 0 ? smallData : null);
            if (which) {
              setTimeout(() => {
                Object.defineProperty(inst, 'readyState', { value: 4, configurable: true });
                Object.defineProperty(inst, 'status', { value: 200, configurable: true });
                Object.defineProperty(inst, 'responseText', { value: JSON.stringify(which), configurable: true });
                if (inst.onreadystatechange) inst.onreadystatechange({});
              }, 30);
              return;
            }
          }
          return origSend.apply(inst, args);
        };
        return inst;
      }
      window.XMLHttpRequest = StubXhr;
    }
    return wrap;
  }
  // forward references — set below
  let bigData, smallData;
  // 1000-row dataset
  const bigRows = [];
  for (let i = 0; i < 1000; i++) {
    bigRows.push({ Id: i + 1, Name: 'Row ' + (i + 1), Price: ((i % 50) * 1.23).toFixed(2), Stock: (i * 3) % 999 });
  }
  bigData = { columns: [
    { key: 'Id', label: 'Id' }, { key: 'Name', label: 'Name' },
    { key: 'Price', label: 'Price' }, { key: 'Stock', label: 'Stock' }
  ], rows: bigRows };

  const wrap1 = buildWrap('virt-1000', bigData);
  wrap1.style.top = '60px'; wrap1.style.left = '20px';
  (window).MFDataGridSql.bind(wrap1, {
    columns: bigData.columns, useSql: true, queryDependsOn: '', pageSize: 1000,
    tableName: '1000-row test'
  }, 293, 'virt-1000');

  // 50-row dataset → should use dense renderer
  const smallRows = [];
  for (let i = 0; i < 50; i++) smallRows.push({ Id: i + 1, Name: 'Item ' + (i + 1), Qty: i + 5 });
  smallData = { columns: [
    { key: 'Id', label: 'Id' }, { key: 'Name', label: 'Name' }, { key: 'Qty', label: 'Qty' }
  ], rows: smallRows };
  const wrap2 = buildWrap('dense-50', smallData);
  wrap2.style.top = '600px'; wrap2.style.left = '20px';
  (window).MFDataGridSql.bind(wrap2, {
    columns: [{ key: 'Id', label: 'Id' }, { key: 'Name', label: 'Name' }, { key: 'Qty', label: 'Qty' }],
    useSql: true, queryDependsOn: '', pageSize: 50, tableName: '50-row test'
  }, 293, 'dense-50');

  return 'ok';
});

await page.waitForTimeout(1200);
await page.screenshot({ path: join(OUT, 'r1-virt-01-initial.png'), fullPage: false });

const initialInspect = await page.evaluate(() => {
  const virt = document.querySelector('#virt-1000 [data-mfw-virtport]');
  const dense = document.querySelector('#dense-50 [data-mfw-virtport]');
  return {
    virtPortExists: !!virt,
    densePortExists: !!dense,                        // should be false (dense path = no virtport)
    virtRowsInDom: document.querySelectorAll('#virt-1000 .mfw-dgrid-row').length,
    denseRowsInDom: document.querySelectorAll('#dense-50 .mfw-dgrid-row').length,
    statusText:    document.querySelector('#virt-1000 [data-mfw-virtstatus]')?.textContent || ''
  };
});

// Scroll the virt port halfway
await page.evaluate(() => {
  const port = document.querySelector('#virt-1000 [data-mfw-virtport]');
  if (port) port.scrollTop = 15000; // ~470 rows down
});
await page.waitForTimeout(400);
const scrolledInspect = await page.evaluate(() => {
  const status = document.querySelector('#virt-1000 [data-mfw-virtstatus]')?.textContent || '';
  const firstRowText = (document.querySelector('#virt-1000 .mfw-dgrid-row')?.textContent || '').slice(0, 40);
  return { statusText: status, firstRowTextAfterScroll: firstRowText, rowsInDom: document.querySelectorAll('#virt-1000 .mfw-dgrid-row').length };
});

await page.screenshot({ path: join(OUT, 'r1-virt-02-scrolled.png'), fullPage: false });

// Drag the resize handle on the Price column of the 1000-row grid.
const handle = page.locator('#virt-1000 [data-mfw-resize="Price"]').first();
const handleBox = await handle.boundingBox();
let resizeResult = 'no-handle';
if (handleBox) {
  await page.mouse.move(handleBox.x + 2, handleBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 100, handleBox.y + 10, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  resizeResult = await page.evaluate(() => {
    const grids = document.querySelectorAll('#virt-1000 .mfw-dgrid-grid');
    const tpls = Array.from(grids).map(g => g.style.gridTemplateColumns);
    return { templatesNow: tpls };
  });
}
await page.screenshot({ path: join(OUT, 'r1-virt-03-resized.png'), fullPage: false });

const report = {
  badge,
  initialInspect,
  scrolledInspect,
  resizeResult,
  windowRangeShifted: scrolledInspect.statusText !== initialInspect.statusText,
  consoleErrors: errs
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'r1-virt-report.json'), JSON.stringify(report, null, 2));
await browser.close();
