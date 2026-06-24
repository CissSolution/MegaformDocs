// Visual QA on Submission Inbox: bulk delete, split view, draggable split
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
  const url = r.url();
  if (/BulkDelete|Submission|Delete\?submissionId/.test(url)) {
    try {
      const body = url.includes('BulkDelete') ? (await r.text()).slice(0, 300) : '';
      networkLog.push({ url: url.replace(BASE, ''), status: r.status(), body });
    } catch (e) { networkLog.push({ url: url.replace(BASE, ''), status: r.status() }); }
  }
});

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

// ── PROBE 1: layout markers + UI elements present ─────────────────────────
const probe1 = await page.evaluate(() => {
  const hasInbox = !!document.querySelector('.mf-sx-shell, [data-mf-list-host]');
  const listHost = document.querySelector('[data-mf-list-host]');
  const detailHost = document.querySelector('[data-mf-detail-host]');
  const workEl = document.querySelector('[data-mf-work]');
  const checkAll = document.querySelector('[data-mf-checkall]');
  const bulkBtn = document.querySelector('[data-mf-bulk-del]');
  const rows = Array.from(document.querySelectorAll('.mf-sx-row, [data-mf-row-sub-id]'));
  return {
    hasInbox,
    listVisible: listHost ? listHost.offsetParent !== null : false,
    detailVisible: detailHost ? detailHost.offsetParent !== null : false,
    workClassList: workEl ? Array.from(workEl.classList) : null,
    rowCount: rows.length,
    checkAllExists: !!checkAll,
    bulkBtnExists: !!bulkBtn,
    bulkBtnHidden: bulkBtn ? bulkBtn.hasAttribute('hidden') : null,
  };
});
console.log('=== PROBE 1: inbox UI ===');
console.log(JSON.stringify(probe1, null, 2));
await page.screenshot({ path: join(OUT, 'qa-inbox-01-initial.png'), fullPage: false });

// ── PROBE 2: click select-all, verify selection ────────────────────────────
const probe2 = await page.evaluate(() => {
  const checkAll = document.querySelector('[data-mf-checkall]');
  if (!checkAll) return { error: 'no select-all' };
  checkAll.click();
  const rowCbs = Array.from(document.querySelectorAll('input[data-mf-row-cb]'));
  const checked = rowCbs.filter(cb => cb.checked).length;
  const bulkCount = document.querySelector('[data-mf-bulk-count]')?.textContent || '';
  const bulkBtn = document.querySelector('[data-mf-bulk-del]');
  return {
    rowCbCount: rowCbs.length,
    checkedCount: checked,
    bulkBtnVisible: bulkBtn ? !bulkBtn.hasAttribute('hidden') : false,
    bulkCountLabel: bulkCount
  };
});
console.log('\n=== PROBE 2: select-all behavior ===');
console.log(JSON.stringify(probe2, null, 2));
await page.screenshot({ path: join(OUT, 'qa-inbox-02-selected.png'), fullPage: false });

// ── PROBE 3: split view — does selecting a row open the detail pane? ───────
const probe3 = await page.evaluate(async () => {
  // Find a row (not the checkbox — the row body)
  const row = document.querySelector('.mf-sx-row, [data-mf-row-sub-id]');
  if (!row) return { error: 'no row' };
  // Click somewhere on the row that's not a checkbox
  const titleEl = row.querySelector('.mf-sx-row-title, .mf-sx-row-text, .mf-sx-row-main') || row;
  titleEl.click();
  await new Promise(r => setTimeout(r, 1200));
  const detailHost = document.querySelector('[data-mf-detail-host]');
  const detailVis = detailHost ? detailHost.offsetParent !== null : false;
  const workEl = document.querySelector('[data-mf-work]');
  const workClassList = workEl ? Array.from(workEl.classList) : [];
  const modalOverlay = document.querySelector('.mf-sx-modal-overlay');
  const hasResizer = !!document.querySelector('[data-mf-split-resizer], .mf-sx-split-resizer, .mf-sx-resizer');
  return {
    rowClicked: true,
    detailVisible: detailVis,
    detailInnerLen: detailHost ? (detailHost.textContent || '').length : 0,
    workClassList,
    modalOpened: !!modalOverlay,
    hasResizer
  };
});
console.log('\n=== PROBE 3: split view after row click ===');
console.log(JSON.stringify(probe3, null, 2));
await page.screenshot({ path: join(OUT, 'qa-inbox-03-row-clicked.png'), fullPage: false });

// ── PROBE 4: F11 (layout toggle) or SPLIT button ───────────────────────────
const probe4 = await page.evaluate(async () => {
  // First close modal if any
  document.querySelector('.mf-sx-modal-close')?.click();
  await new Promise(r => setTimeout(r, 400));
  const btns = Array.from(document.querySelectorAll('button, [data-mf-act]'));
  const splitBtn = btns.find(b => /split|layout/i.test((b.getAttribute('data-mf-act') || '') + ' ' + (b.textContent || '')));
  if (!splitBtn) return { error: 'no split toggle', candidates: btns.slice(0, 10).map(b => (b.textContent || '').slice(0, 25)).filter(Boolean) };
  splitBtn.click();
  await new Promise(r => setTimeout(r, 600));
  const workEl = document.querySelector('[data-mf-work]');
  return {
    splitBtnText: (splitBtn.textContent || '').slice(0, 30).trim(),
    splitBtnAct: splitBtn.getAttribute('data-mf-act'),
    afterClickClass: workEl ? Array.from(workEl.classList) : []
  };
});
console.log('\n=== PROBE 4: layout/split toggle ===');
console.log(JSON.stringify(probe4, null, 2));
await page.screenshot({ path: join(OUT, 'qa-inbox-04-after-toggle.png'), fullPage: false });

// ── PROBE 5: click bulk delete (cancel the confirm dialog automatically) ────
page.on('dialog', d => {
  console.log(`Dialog (${d.type()}): ${d.message().slice(0, 200)}`);
  d.dismiss(); // dismiss so we don't actually delete
});
const probe5 = await page.evaluate(async () => {
  // Make sure select-all is on
  const checkAll = document.querySelector('[data-mf-checkall]');
  if (checkAll && !checkAll.checked) checkAll.click();
  await new Promise(r => setTimeout(r, 300));
  const bulkBtn = document.querySelector('[data-mf-bulk-del]');
  if (!bulkBtn) return { error: 'no bulk btn' };
  const countBefore = document.querySelector('[data-mf-bulk-count]')?.textContent || '0';
  bulkBtn.click();
  await new Promise(r => setTimeout(r, 1500));
  return {
    bulkCountBefore: countBefore
  };
});
console.log('\n=== PROBE 5: bulk delete click + confirm dismissed ===');
console.log(JSON.stringify(probe5, null, 2));
console.log('Network log during delete:', JSON.stringify(networkLog.slice(-5), null, 2));

writeFileSync(join(OUT, 'qa-inbox-summary.json'), JSON.stringify({ probe1, probe2, probe3, probe4, probe5, networkLog, consoleErrs }, null, 2));

console.log('\n=== Console errs ===');
console.log(JSON.stringify(consoleErrs.slice(0, 10), null, 2));
await browser.close();
