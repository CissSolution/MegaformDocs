// R6.4 QA — Submission dashboard Form View must render:
//   - FK select labels (NOT raw IDs)
//   - DataGrid rows as a real HTML table (NOT raw JSON)
//   - Razor SSR widgets as a clean "display-only" note (NOT "—")
// Opens the Submissions dashboard, finds a submission from form 293,
// switches to Form View tab, captures screenshot + structural inspection.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

// Login as host so we can reach the Submissions dashboard
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
try {
  await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
  await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }),
    page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
  ]);
} catch (e) {
  console.warn('Login form selectors may differ:', e?.message);
}

await page.goto(`${BASE}/xx#mf-submissions`, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2500);

await page.screenshot({ path: join(OUT, 'r6-4-01-submissions-list.png'), fullPage: true });

// Click first submission row that belongs to form 293
const targetRow = page.locator('[data-mf-submission-id], .mf-submission-row, .mf-gm-row').first();
let rowsCount = await targetRow.count();
const inspectList = await page.evaluate(() => ({
  bodyTitle: document.title,
  bodyHasInbox: !!document.querySelector('[data-mf-submission-inbox], #mf-submissions, .mf-gm-row'),
  visibleRowCount: document.querySelectorAll('.mf-gm-row').length,
}));

// Programmatically open submission 1251 (the one we created with the postInsert hook)
const detailOk = await page.evaluate(async () => {
  const root = (window).MegaFormSubmissionInbox || (window).MegaFormSubmissions;
  if (root && typeof root.openDetail === 'function') {
    try { await root.openDetail(1251); return 'openDetail called'; } catch (e) { return 'err ' + e.message; }
  }
  // Fallback: click any row mentioning #1251
  const rows = document.querySelectorAll('.mf-gm-row, [data-mf-submission-id]');
  for (const r of rows) {
    if (r.textContent && r.textContent.includes('1251')) { (r).click(); return 'clicked row 1251'; }
  }
  return 'no-handler';
});

await page.waitForTimeout(2000);

// Find the Form View tab if a detail modal opened
const modalShown = await page.locator('.mf-modal, .mf-submission-modal, [data-mf-submission-detail]').count();
let switchedToForm = false;
if (modalShown > 0) {
  const formTabBtn = page.getByText('Form View', { exact: false }).first();
  if (await formTabBtn.count() > 0) {
    await formTabBtn.click().catch(() => {});
    switchedToForm = true;
    await page.waitForTimeout(800);
  }
}

await page.screenshot({ path: join(OUT, 'r6-4-02-form-view.png'), fullPage: true });

// Inspect the form-view structure
const inspectFormView = await page.evaluate(() => {
  const wrap = document.querySelector('.mf-form-view-wrapper');
  if (!wrap) return { mounted: false };
  return {
    mounted: true,
    selectLabels: document.querySelectorAll('.mf-form-view-select [data-fk-label]').length,
    datagridTables: document.querySelectorAll('.mf-form-view-dgrid-table').length,
    datagridImageCells: document.querySelectorAll('.mf-form-view-dgrid-table img').length,
    razorPlaceholders: Array.from(document.querySelectorAll('.mf-form-view-empty')).filter(n => (n.textContent || '').includes('Display-only Razor')).length,
    rawJsonLeak: Array.from(document.querySelectorAll('pre.mf-form-view-json')).length,
    formViewSampleHtml: wrap.innerHTML.slice(0, 1500),
  };
});

const report = { detailOk, switchedToForm, inspectList, inspectFormView, consoleErrors: errs };
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'r6-4-formview-report.json'), JSON.stringify(report, null, 2));
await browser.close();
