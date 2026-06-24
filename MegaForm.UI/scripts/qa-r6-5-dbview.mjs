// R6.5 QA — DB View tab. Calls the new __MF_RenderDbView(submissionId)
// QA hook against submission 1251 (form 296, which has the postInsert
// hook configured to write to MF_R2_AuditLog). Verifies the response
// has the expected structure and the rendered DOM contains:
//   - at least one master / child block
//   - a table or key-value list
//   - no JSON leak
//
// Also probes the SubmissionDbView endpoint directly (auth-required, expect 401 anonymous).

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

// Login as host — the SubmissionDbView endpoint is admin-gated.
await page.goto(`${BASE}/Login?returnurl=/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
try {
  // DNN9 standard login form input names
  await page.waitForSelector('input[name*="Username"], input[id*="Username"]', { timeout: 6000 });
  await page.locator('input[name*="Username"], input[id*="Username"]').first().fill('host');
  await page.locator('input[name*="Password"], input[id*="Password"]').first().fill('dnnhost');
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }),
    page.locator('input[type="submit"][value*="Login"], a[id*="cmdLogin"], button[id*="cmdLogin"]').first().click(),
  ]);
} catch (loginErr) {
  console.warn('login form differed:', loginErr?.message);
}

await page.goto(`${BASE}/xx?formid=296`, { waitUntil: 'networkidle', timeout: 45000 });
await page.addScriptTag({ url: `/DesktopModules/MegaForm/Assets/js/megaform-submissions.js?_=${Date.now()}` });
await page.evaluate(() => {
  (window).__MF_PLATFORM__ = (window).__MF_PLATFORM__ || {};
  (window).__MF_PLATFORM__.apiBase = '/DesktopModules/MegaForm/API/';
});

// Endpoint reachability probe
const endpointProbe = await page.evaluate(async () => {
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/SubmissionDbView?submissionId=1252', { credentials: 'same-origin' });
  return { status: r.status, statusText: r.statusText, body: (await r.text()).slice(0, 800) };
});

// Render via QA hook
const renderProbe = await page.evaluate(() => {
  const host = document.createElement('div');
  host.id = 'r6-5-host';
  host.style.cssText = 'position:fixed;top:80px;left:20px;right:20px;bottom:20px;background:#fff;padding:0;border:1px solid #cbd5e1;border-radius:10px;overflow:auto;z-index:99999;font-family:-apple-system,sans-serif';
  document.body.appendChild(host);
  const fn = (window).__MF_RenderDbView;
  if (typeof fn !== 'function') { host.textContent = 'no QA hook'; return 'no-hook'; }
  // submission 1252 is the fresh one with the postInsert audit row landed
  const el = fn(1252);
  host.appendChild(el);
  return 'rendered';
});

// Wait for fetch to settle
await page.waitForTimeout(2500);
await page.screenshot({ path: join(OUT, 'r6-5-dbview.png'), fullPage: false });

const inspect = await page.evaluate(() => {
  const root = document.getElementById('r6-5-host');
  if (!root) return { mounted: false };
  return {
    mounted: true,
    sections: root.querySelectorAll('.mf-subdetail-db-section').length,
    masterKvList: root.querySelectorAll('.mf-subdetail-db-keyvals').length,
    childTables: root.querySelectorAll('.mf-subdetail-db-table').length,
    emptyNotes: root.querySelectorAll('.mf-subdetail-db-empty').length,
    loadingStill: root.querySelectorAll('.mf-subdetail-db-loading').length,
    rawJsonLeak: root.querySelectorAll('pre').length,
    htmlSample: root.innerHTML.slice(0, 1500),
  };
});

const report = { endpointProbe, renderProbe, inspect, consoleErrors: errs };
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'r6-5-dbview-report.json'), JSON.stringify(report, null, 2));
await browser.close();
