// Phase-6 QA: click a Gmail row → verify detail modal opens with Data /
// Form / Flow / Activity tabs + workflow canvas renders when present.

import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5050';
const USER = 'host';
const PASS = 'abc@ABC1024';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_INBOX = `${BASE}/business/dao-tuan-hung/*/194/submissions`;

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.locator('button.btn-primary:has-text("Login")').first().click();
  await page.waitForFunction(() => !location.pathname.toLowerCase().includes('/login'), null, { timeout: 20000 }).catch(()=>{});
  await page.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console',   m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text().slice(0, 200)}`); });
  page.on('pageerror', e => errors.push(`[pageerror] ${String(e).slice(0, 200)}`));

  await login(page);
  await page.goto(URL_INBOX, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.mf-sx-row', { timeout: 20000 });
  await page.waitForTimeout(1500);

  // Pick first row that has a workflow-bearing form (Leave/Document/Proposal forms 5/6/7/10/13)
  const targetSubId = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.mf-sx-row'));
    for (const r of rows) {
      const fid = Number(r.getAttribute('data-mf-form-id') || '0');
      if ([5, 6, 7, 10, 13].includes(fid)) {
        return { id: Number(r.getAttribute('data-mf-sub-id')), fid };
      }
    }
    const first = rows[0];
    return { id: first ? Number(first.getAttribute('data-mf-sub-id')) : 0, fid: first ? Number(first.getAttribute('data-mf-form-id')) : 0 };
  });
  console.log('[target row]', JSON.stringify(targetSubId));

  // Click the chosen row
  await page.locator(`.mf-sx-row[data-mf-sub-id="${targetSubId.id}"]`).first().click();
  await page.waitForFunction(() => !!document.querySelector('.mf-sx-modal-overlay'), null, { timeout: 8000 });
  await page.waitForTimeout(2500);

  const diag = await page.evaluate(() => {
    const ov = document.querySelector('.mf-sx-modal-overlay');
    const has = (sel) => !!document.querySelector(sel);
    const count = (sel) => document.querySelectorAll(sel).length;
    const text = (sel) => (document.querySelector(sel)?.innerText || '').trim().slice(0, 100);
    return {
      overlayOpen: !!ov,
      isVisible:   !!ov?.classList.contains('is-visible'),
      titleText:   text('.mf-sx-modal-title'),
      detailShell: has('.mf-subdetail-shell'),
      tabCount:    count('.mf-modal-tabs button'),
      tabLabels:   Array.from(document.querySelectorAll('.mf-modal-tabs button')).map(b => b.innerText.trim()),
      dataTabFields: count('.mf-subdetail-shell .mf-modal-tabs ~ * .mf-data-tab-field, .mf-subdetail-shell .mf-data-row, .mf-subdetail-shell input, .mf-subdetail-shell textarea'),
      modalBodyText: text('.mf-sx-modal-body'),
      errorVisible: has('.mf-sx-modal-body .mf-sx-empty-title'),
    };
  });
  console.log('[modal diag]', JSON.stringify(diag, null, 2));
  await page.screenshot({ path: 'qa-out/row-click-data-tab.png', fullPage: false });

  // Click Flow process tab
  const flowTab = page.locator('.mf-modal-tabs button:has-text("Flow")').first();
  if (await flowTab.count() > 0) {
    await flowTab.click();
    await page.waitForTimeout(2000);
    const flowDiag = await page.evaluate(() => {
      return {
        flowVisible: !!document.querySelector('.mf-modal-flow-body, .mf-subflow-workspace'),
        flowEmpty:   !!document.querySelector('.mf-subflow-empty'),
        flowCanvas:  !!document.querySelector('.mf-subflow-canvas, .mf-rf-canvas, [class*="canvas"]'),
        flowText:    (document.querySelector('.mf-modal-flow-body, .mf-subflow-workspace')?.innerText || '').trim().slice(0, 200),
      };
    });
    console.log('[flow tab]', JSON.stringify(flowDiag, null, 2));
    await page.screenshot({ path: 'qa-out/row-click-flow-tab.png', fullPage: false });
  }

  // Click Activity tab
  const activityTab = page.locator('.mf-modal-tabs button:has-text("Activity")').first();
  if (await activityTab.count() > 0) {
    await activityTab.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'qa-out/row-click-activity-tab.png', fullPage: false });
  }

  if (errors.length) console.log('\n--- ERRORS ---\n' + errors.join('\n'));
  else console.log('(0 console errors)');

  await browser.close();
})();
