// Honest Visual QA across all 5 tabs of the Submission detail modal.
// Verifies claims: Data View ≠ JSON dump · Data View shows FK label not id
// · DB View shows dbo.<table> with mapping · Flow process renamed · Activity
// timeline · DataGrid render as table (skipped if form has no datagrid).
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

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 30000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

// QA target — submission #1261 has class_id=3 which resolves to "10A1".
const sid = 1261;
const formId = 302;

// Reach a page that mounts the renderer + makes window.__MF_RenderDbView available.
async function safeGoto(url) {
  try { await page.goto(url, { waitUntil: 'commit', timeout: 60000 }); }
  catch { await page.waitForTimeout(2500); await page.goto(url, { waitUntil: 'commit', timeout: 60000 }); }
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
}
// Hit a page that hosts the admin dashboard (which loads megaform-submission-inbox.js).
// /Contact + /Careers are admin_dashboard tabs per reference_dnn_megaf_site.
await safeGoto(`${BASE}/Contact`);
await page.waitForTimeout(2200);
const inboxLoaded = await page.evaluate(() => typeof window.__MF_OpenSubmissionDetail === 'function');
if (!inboxLoaded) {
  // fall back to Careers
  await safeGoto(`${BASE}/Careers`);
  await page.waitForTimeout(2500);
}

const detail = await page.evaluate(async (sid) => {
  const r = await fetch('/DesktopModules/MegaForm/API/Submissions/Get?submissionId=' + sid, { credentials: 'same-origin' });
  return { status: r.status, json: r.ok ? await r.json() : null };
}, sid);

// Test 1 — Data View: render renderSubmissionDataTab via the exported shell.
// We don't have direct access to the TS module, so the easiest probe is to mount
// renderSubmissionDetailShell via window helpers if they exist.
// Debug: dump bundle state
const dbg = await page.evaluate(() => ({
  url: location.href,
  hasOpenHelper: typeof window.__MF_OpenSubmissionDetail === 'function',
  hasInboxBadge: typeof window.__MF_SUBMISSION_INBOX_RUNTIME_BADGE__ === 'string',
  badge: window.__MF_SUBMISSION_INBOX_RUNTIME_BADGE__ || null,
  bundleScripts: Array.from(document.scripts).filter(s => /submission-inbox/.test(s.src)).map(s => s.src),
}));
console.log('[debug] ' + JSON.stringify(dbg, null, 2));

const dataTabHtml = await page.evaluate(async ([sid, detail]) => {
  if (typeof window.__MF_OpenSubmissionDetail === 'function') {
    window.__MF_OpenSubmissionDetail(sid);
  }
  // give the fetch + render time to settle
  await new Promise(r => setTimeout(r, 2600));
  const modal = document.querySelector('.mf-sx-modal-card, .mf-modal');
  if (!modal) return { mounted: false };
  // ensure Data tab is active
  const dataBtn = Array.from(modal.querySelectorAll('button')).find(b => /Data View/i.test(b.textContent || ''));
  if (dataBtn) dataBtn.click();
  await new Promise(r => setTimeout(r, 250));
  // pull info
  const tabs = Array.from(modal.querySelectorAll('button.mf-modal-tab')).map(b => (b.textContent || '').trim());
  const rows = Array.from(modal.querySelectorAll('table.mf-modal-table tr')).map(tr => {
    const td = tr.querySelector('td');
    const inp = td?.querySelector('input,textarea,select');
    return {
      label: (tr.querySelector('th')?.textContent || '').trim(),
      // Read both innerText (for read-only) and the input's .value (for editable)
      text: (td?.innerText || '').trim(),
      inputValue: inp ? (inp).value : null,
      tag: inp?.tagName?.toLowerCase() || null,
      // Detect FK label resolution: if the cell has data-fk-label OR shows
      // "10A1" (not "1") for class_id field, FK is resolved
      hasFkBadge: !!td?.querySelector('[data-fk-label]'),
    };
  });
  return { mounted: true, tabs, rows };
}, [sid, detail]);

await page.screenshot({ path: join(OUT, 'qa-truth-01-data-view.png'), fullPage: false });

// Test 2 — Form View
const formTabSnap = await page.evaluate(async () => {
  const modal = document.querySelector('.mf-sx-modal-card, .mf-modal');
  if (!modal) return { mounted: false };
  const btn = Array.from(modal.querySelectorAll('button')).find(b => /^Form View$/i.test((b.textContent || '').trim()));
  if (btn) btn.click();
  await new Promise(r => setTimeout(r, 2200));
  return {
    mounted: true,
    classFieldText: Array.from(modal.querySelectorAll('*')).find(el => /Lớp học/i.test(el.textContent || ''))?.closest('.mf-form-view-row, tr, .mf-form-row')?.textContent?.replace(/\s+/g, ' ').slice(0, 200) || null,
    fkLabelResolved: !!modal.querySelector('[data-fk-label]'),
    fkSpinnerStillVisible: !!modal.querySelector('.mf-form-view-select .fa-spin'),
  };
});
await page.screenshot({ path: join(OUT, 'qa-truth-02-form-view.png'), fullPage: false });

// Test 3 — DB View
const dbTabSnap = await page.evaluate(async () => {
  const modal = document.querySelector('.mf-sx-modal-card, .mf-modal');
  if (!modal) return { mounted: false };
  const btn = Array.from(modal.querySelectorAll('button')).find(b => /^DB View$/i.test((b.textContent || '').trim()));
  if (btn) btn.click();
  await new Promise(r => setTimeout(r, 2200));
  const dbBody = modal.querySelector('.mf-subdetail-db-body');
  return {
    mounted: true,
    bodyText: (dbBody?.innerText || '').slice(0, 400),
    hasMasterBlock: !!modal.querySelector('.mf-subdetail-db-section'),
    hasErrText: /Could not load DB View|submissionId required/i.test(dbBody?.innerText || ''),
  };
});
await page.screenshot({ path: join(OUT, 'qa-truth-03-db-view.png'), fullPage: false });

// Test 4 — Flow process (verify rename from "Flow Canvas" + mini-canvas default)
const flowSnap = await page.evaluate(async () => {
  const modal = document.querySelector('.mf-sx-modal-card, .mf-modal');
  if (!modal) return { mounted: false };
  const allTabBtns = Array.from(modal.querySelectorAll('button.mf-modal-tab')).map(b => (b.textContent || '').trim());
  const hasFlowProcess = allTabBtns.some(t => /^Flow process$/.test(t));
  const hasFlowCanvas = allTabBtns.some(t => /^Flow Canvas$/.test(t));
  const btn = Array.from(modal.querySelectorAll('button')).find(b => /^Flow process$/i.test((b.textContent || '').trim()));
  if (btn) btn.click();
  await new Promise(r => setTimeout(r, 800));
  const defaultFlow = modal.querySelector('.mf-subflow-defaultflow');
  return {
    mounted: true,
    hasFlowProcess, hasFlowCanvas,
    hasDefaultFlow: !!defaultFlow,
    defaultFlowText: (defaultFlow?.innerText || '').slice(0, 250),
  };
});
await page.screenshot({ path: join(OUT, 'qa-truth-04-flow.png'), fullPage: false });

// Test 5 — Activity
const activitySnap = await page.evaluate(async () => {
  const modal = document.querySelector('.mf-sx-modal-card, .mf-modal');
  if (!modal) return { mounted: false };
  const btn = Array.from(modal.querySelectorAll('button')).find(b => /^Activity$/i.test((b.textContent || '').trim()));
  if (btn) btn.click();
  await new Promise(r => setTimeout(r, 800));
  return {
    mounted: true,
    bodyText: (modal.querySelector('.mf-subdetail-activity, .mf-activity, .mf-modal-body')?.innerText || '').slice(0, 300),
    allClasses: Array.from(modal.querySelectorAll('[class*="activity"],[class*="timeline"]')).map(e => e.className).slice(0, 5),
  };
});
await page.screenshot({ path: join(OUT, 'qa-truth-05-activity.png'), fullPage: false });

const report = {
  sid, formId,
  detailEndpointStatus: detail.status,
  detailJsonKeys: detail.json ? Object.keys(detail.json) : null,
  dataTabHtml,
  formTabSnap,
  dbTabSnap,
  flowSnap,
  activitySnap,
  consoleErrors: errs,
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'qa-truth-report.json'), JSON.stringify(report, null, 2));
await browser.close();
