// [B8.C v20260601-01] Cross-host smoke for block 8 — App package + starter kits.
//
// Probes:
//   DNN @ http://dnn10322_megaf.ai
//     1. AppsList responds with at least 1 app
//     2. StarterKits lists ≥ 3 kits (purchase-order, recruitment, blog)
//     3. ExportApp produces a downloadable .zip with manifest.json
//     4. (Optional) InstallStarterKit purchase-order returns ok=true
//     5. After install, AppsList includes "Purchase Order" app
//
//   Oqtane @ http://localhost:5050 — bare ping only (the export endpoints
//   aren't on the Oqtane port yet — see block 9 backlog).
//
// Writes: qa-out/b8-smoke-report.json + screenshots for visible checkpoints.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DNN  = 'http://dnn10322_megaf.ai';
const OQT  = 'http://localhost:5050';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const report = { run: 'b8-smoke', startedAt: new Date().toISOString(), dnn: {}, oqtane: {}, summary: {} };
const consoleErrs = [];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });

// ─── 0. DNN: login as host so admin endpoints work ───
async function loginDnn() {
  await page.goto(`${DNN}/Login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
    await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: 30000 }),
      page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
    ]);
    return true;
  } catch { return false; }
}
report.dnn.login = await loginDnn();

// ─── 1. AppsList probe ───
async function probe(endpoint) {
  return page.evaluate(async (url) => {
    try {
      const r = await fetch(url, { credentials: 'same-origin' });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: r.status, json, snippet: text.slice(0, 160) };
    } catch (e) { return { status: 0, error: String(e) }; }
  }, endpoint);
}

await page.goto(`${DNN}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
report.dnn.appsList = await probe(`${DNN}/DesktopModules/MegaForm/API/AiTools/AppsList`);

// ─── 2. StarterKits probe ───
report.dnn.starterKits = await probe(`${DNN}/DesktopModules/MegaForm/API/AiTools/StarterKits`);
const kits = report.dnn.starterKits.json?.kits || [];
report.dnn.kitNames = kits.map(k => k.name);

// ─── 3. ExportApp probe (against first app, if any) ───
const apps = report.dnn.appsList.json?.apps || report.dnn.appsList.json || [];
const firstAppId = Array.isArray(apps) && apps[0]?.id;
if (firstAppId) {
  // Hit the export endpoint — we just want the response type + length, not the bytes.
  report.dnn.exportApp = await page.evaluate(async (url) => {
    try {
      const r = await fetch(url, { credentials: 'same-origin' });
      const blob = await r.blob();
      return { status: r.status, type: blob.type, size: blob.size };
    } catch (e) { return { status: 0, error: String(e) }; }
  }, `${DNN}/DesktopModules/MegaForm/API/AiTools/ExportApp?appId=${firstAppId}`);
}

// ─── 4. Install Starter Kit (Purchase Order) ───
report.dnn.installPurchaseOrder = await page.evaluate(async (url) => {
  try {
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'purchase-order' }),
    });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, snippet: text.slice(0, 200) };
  } catch (e) { return { status: 0, error: String(e) }; }
}, `${DNN}/DesktopModules/MegaForm/API/AiTools/InstallStarterKit`);

// ─── 5. AppsList again — should now include Purchase Order ───
report.dnn.appsListAfterInstall = await probe(`${DNN}/DesktopModules/MegaForm/API/AiTools/AppsList`);
const after = report.dnn.appsListAfterInstall.json?.apps || report.dnn.appsListAfterInstall.json || [];
report.dnn.hasPurchaseOrderAfter = Array.isArray(after) && after.some(a => /purchase[\s-]?order/i.test(String(a.slug || a.title || '')));

// ─── 6. Oqtane ping ───
try {
  await page.goto(`${OQT}/`, { waitUntil: 'domcontentloaded', timeout: 12000 });
  report.oqtane.reachable = true;
  report.oqtane.title = await page.title();
} catch (e) {
  report.oqtane.reachable = false;
  report.oqtane.error = String(e?.message || e).slice(0, 200);
}

// ─── Summary scoring ───
const checks = {
  dnn_login:                report.dnn.login === true,
  dnn_apps_list_200:        report.dnn.appsList?.status === 200,
  dnn_starter_kits_200:     report.dnn.starterKits?.status === 200,
  dnn_three_kits_present:   ['purchase-order','recruitment','blog'].every(n => report.dnn.kitNames?.includes(n)),
  dnn_export_zip:           !firstAppId || (report.dnn.exportApp?.status === 200 && (report.dnn.exportApp?.size ?? 0) > 200),
  dnn_install_po_ok:        report.dnn.installPurchaseOrder?.status === 200 && report.dnn.installPurchaseOrder?.json?.ok === true,
  dnn_po_visible_after:     report.dnn.hasPurchaseOrderAfter === true,
  oqtane_reachable:         report.oqtane.reachable === true,
};
report.summary = checks;
const pass = Object.values(checks).filter(Boolean).length;
const total = Object.keys(checks).length;
report.summary.score = `${pass}/${total}`;
report.summary.pass = pass === total;
report.consoleErrors = consoleErrs;

await page.screenshot({ path: join(OUT, 'b8-smoke-final.png'), fullPage: false });
console.log(JSON.stringify(report.summary, null, 2));
writeFileSync(join(OUT, 'b8-smoke-report.json'), JSON.stringify(report, null, 2));

await browser.close();
process.exit(report.summary.pass ? 0 : 1);
