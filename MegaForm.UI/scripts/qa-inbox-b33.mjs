// Verify B33 fixes: bulk delete real count, split toggle, draggable resizer, auto-split
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.clearCookies();
const page = await ctx.newPage();
const consoleErrs = [];
const networkLog = [];
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
page.on('response', async r => {
  if (/BulkDelete/.test(r.url())) {
    try {
      const body = await r.text();
      networkLog.push({ url: r.url().replace(BASE, ''), status: r.status(), body: body.slice(0, 400) });
    } catch (e) {}
  }
});
page.on('dialog', d => d.dismiss()); // dismiss to keep data intact

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

try { await page.goto(`${BASE}/xx#mf-submissions`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(3000); await page.goto(`${BASE}/xx#mf-submissions`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(10000);

// PROBE 1 — resizer exists (hidden in list-only mode)
const probe1 = await page.evaluate(() => {
  const r = document.querySelector('[data-mf-split-resizer]');
  const cs = r ? getComputedStyle(r) : null;
  return {
    resizerExists: !!r,
    resizerDisplayInListOnly: cs?.display,
    resizerWidth: r?.getBoundingClientRect().width
  };
});
console.log('=== PROBE 1: resizer presence ===');
console.log(JSON.stringify(probe1, null, 2));

// PROBE 2 — click SPLIT button, verify layout switches + resizer visible
const probe2 = await page.evaluate(async () => {
  const btn = document.querySelector('[data-mf-ribbon-act="layout-toggle"]');
  if (!btn) return { error: 'no split btn' };
  btn.click();
  await new Promise(r => setTimeout(r, 400));
  const work = document.querySelector('[data-mf-work]');
  const layout = work?.getAttribute('data-mf-layout');
  const detail = document.querySelector('[data-mf-detail-host]');
  const detailVis = detail ? getComputedStyle(detail).display !== 'none' : false;
  const resizer = document.querySelector('[data-mf-split-resizer]');
  const resizerVis = resizer ? getComputedStyle(resizer).display !== 'none' : false;
  return {
    splitBtnLayoutAttr: btn.getAttribute('data-mf-layout'),
    workLayout: layout,
    detailVisible: detailVis,
    resizerVisible: resizerVis
  };
});
console.log('\n=== PROBE 2: SPLIT toggle ===');
console.log(JSON.stringify(probe2, null, 2));
await page.screenshot({ path: join(OUT, 'qa-b33-02-split-on.png'), fullPage: false });

// PROBE 3 — click a row in split mode → detail loads inline
const probe3 = await page.evaluate(async () => {
  const row = document.querySelector('[data-mf-submission-id], [data-mf-row]');
  if (!row) return { error: 'no row' };
  // Click on the row body (not the checkbox)
  const bodyArea = row.querySelector('.mf-sx-row-body, .mf-sx-row-main, .mf-sx-row-text') || row;
  bodyArea.click();
  await new Promise(r => setTimeout(r, 1500));
  const detail = document.querySelector('[data-mf-detail-host]');
  const iframe = detail?.querySelector('[data-mf-detail-iframe]');
  return {
    detailInnerLen: detail?.innerHTML.length || 0,
    iframePresent: !!iframe,
    iframeSrc: iframe?.getAttribute('src')?.slice(0, 100)
  };
});
console.log('\n=== PROBE 3: row click in split mode ===');
console.log(JSON.stringify(probe3, null, 2));
await page.screenshot({ path: join(OUT, 'qa-b33-03-detail-loaded.png'), fullPage: false });

// PROBE 4 — drag the resizer
const probe4 = await page.evaluate(async () => {
  const resizer = document.querySelector('[data-mf-split-resizer]');
  if (!resizer) return { error: 'no resizer' };
  const rect = resizer.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const list = document.querySelector('.mf-sx-list');
  const beforeBasis = list ? list.style.flexBasis : '';
  const beforeHeight = list?.getBoundingClientRect().height;
  // Simulate mousedown + mousemove + mouseup
  resizer.dispatchEvent(new MouseEvent('mousedown', { clientX: cx, clientY: cy, bubbles: true }));
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: cx, clientY: cy + 150, bubbles: true }));
  await new Promise(r => setTimeout(r, 100));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: cx, clientY: cy + 150, bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  const afterBasis = list ? list.style.flexBasis : '';
  const afterHeight = list?.getBoundingClientRect().height;
  return {
    beforeBasis, afterBasis,
    beforeHeight, afterHeight,
    heightChanged: beforeHeight !== afterHeight,
    savedPct: localStorage.getItem('mf-sx-split-pct')
  };
});
console.log('\n=== PROBE 4: drag resizer ===');
console.log(JSON.stringify(probe4, null, 2));
await page.screenshot({ path: join(OUT, 'qa-b33-04-resized.png'), fullPage: false });

// PROBE 5 — bulk delete returns real count from server (dismissed dialog)
const probe5 = await page.evaluate(async () => {
  const checkAll = document.querySelector('[data-mf-checkall]');
  if (checkAll && !checkAll.checked) checkAll.click();
  await new Promise(r => setTimeout(r, 200));
  const bulkBtn = document.querySelector('[data-mf-bulk-del]');
  const count = document.querySelector('[data-mf-bulk-count]')?.textContent || '0';
  return { bulkBtnHidden: bulkBtn?.hasAttribute('hidden'), bulkCount: count };
});
console.log('\n=== PROBE 5: bulk count visible ===');
console.log(JSON.stringify(probe5, null, 2));

// PROBE 6 — verify the server now responds with real counts (without actually deleting)
const probe6 = await page.evaluate(async () => {
  // Get the antiforgery token + call BulkDelete with a synthetic non-existent ID
  // so the server tries (and fails) — verifying the response shape includes failed.
  let token = '';
  try {
    const sf = window.$?.ServicesFramework?.(0);
    if (sf?.getAntiForgeryValue) token = sf.getAntiForgeryValue() || '';
  } catch (e) {}
  const r = await fetch('/DesktopModules/MegaForm/API/Submissions/BulkDelete?portalId=0', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', RequestVerificationToken: token },
    body: JSON.stringify({ Ids: [99999999] })  // doesn't exist
  });
  const body = await r.json();
  return { status: r.status, body };
});
console.log('\n=== PROBE 6: server response shape ===');
console.log(JSON.stringify(probe6, null, 2));

writeFileSync(join(OUT, 'qa-b33-summary.json'), JSON.stringify({ probe1, probe2, probe3, probe4, probe5, probe6, networkLog, consoleErrs }, null, 2));
console.log('\nConsole errs:', consoleErrs.slice(0, 5));
await browser.close();
