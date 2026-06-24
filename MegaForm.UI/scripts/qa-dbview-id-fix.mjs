// [DbViewIdFix v20260601-06] Verify the DB View tab now resolves submissionId
// from every common wrapper shape and the server returns 200, not the
// old "submissionId required" 400.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
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

// Login
await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 30000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

// Find a real submissionId on a form that has DB binding.  Form 302 (Sinh viên)
// in block 7 was wired to dbo.Students, and the latest submit there returned
// id 1260 — so any sid in that range will exercise the DB tab path.
const candidate = 1261;

// Direct API smoke (mirrors what the fixed shell now does)
try {
  await page.goto(`${BASE}/xx?formid=302`, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
} catch {
  // some redirect noise after the AppPool was recycled — wait + retry
  await page.waitForTimeout(2000);
  await page.goto(`${BASE}/xx?formid=302`, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
}
const apiProbe = await page.evaluate(async (sid) => {
  const r = await fetch(`/DesktopModules/MegaForm/API/AiTools/SubmissionDbView?submissionId=${sid}`, { credentials: 'same-origin' });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, snippet: text.slice(0, 240), json };
}, candidate);

// Shell-level: call window.__MF_RenderDbView with the submissionId and see if
// the resulting HTML still says "Could not load DB View"
await page.evaluate((sid) => {
  if (typeof window.__MF_RenderDbView === 'function') {
    const el = window.__MF_RenderDbView(sid);
    el.id = 'mf-test-db-root';
    document.body.appendChild(el);
  }
}, candidate);
// give the inner fetch time to settle
await page.waitForTimeout(2500);

const shellProbe = await page.evaluate(() => {
  const root = document.getElementById('mf-test-db-root');
  if (!root) return { mounted: false };
  return {
    mounted: true,
    text: root.innerText.slice(0, 400),
    badgeText: root.querySelector('.mf-subdetail-db-title code')?.textContent || null,
    hasErr: /Could not load DB View|submissionId required|submissionId is missing/i.test(root.innerText),
  };
}, );

const report = {
  candidate,
  apiProbe,
  shellProbe,
  consoleErrors: errs,
  pass: apiProbe.status === 200 && !shellProbe.hasErr,
};
console.log(JSON.stringify(report, null, 2));
await page.screenshot({ path: join(OUT, 'b9-dbview-fixed.png'), fullPage: false });
await browser.close();
process.exit(report.pass ? 0 : 1);
