// Does the Persona Bar panel actually HOST the dashboard, with no MegaForm module involved?
//
// F550's claim is that "Open dashboard" and "New form" stop navigating away and mount the
// dashboard SPA inside the panel. That claim is only worth what it is measured at, so this drives
// the real panel on a real site and records what happened:
//
//   1. open the panel                      -> the form list renders
//   2. click Open dashboard                -> #mf-dashboard-root gains the dashboard's own chrome
//   3. click Back to forms                 -> the list is back, with its state
//   4. click New form                      -> #mf-wizard-root exists (the 5-step wizard)
//   5. throughout: every MegaForm API response, and every console error
//
// The API log is the point. A panel that renders but quietly 400s half its calls looks fine in a
// screenshot, and that is exactly the failure this feature was at risk of.
//
//   node tools/browser-qa/personalbar-dashboard-qa.mjs [site] [user] [pass] [outDir] [w] [h]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const user = process.argv[3] || 'admin';
const pass = process.argv[4] || 'dnnhost';
const outDir = path.resolve(process.argv[5] || 'qa-out/pb-dash');
const width = Number(process.argv[6] || 1440);
const height = Number(process.argv[7] || 900);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width, height } });

const api = [];
const consoleErrors = [];
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('/DesktopModules/MegaForm/API/') || u.includes('/API/personaBar/MegaForm/')) {
    api.push({ status: r.status(), url: u.replace(site, '') });
  }
});
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 240)); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 240)));

await page.goto(site + '/Login', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.locator('input[id*="txtUsername"]').fill(user);
await page.locator('input[id*="txtPassword"]').fill(pass);
await Promise.all([
  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
  page.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click(),
]);

await page.goto(site + (process.argv[8] || '/mf-templates/mf-xmas-sale'), { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(6000);
const pb = page.frames().find((f) => f.url().includes('/Dnn.PersonaBar/index.html'));
if (!pb) { console.error('Persona Bar iframe not found'); await browser.close(); process.exit(2); }
await pb.locator('li#Content').first().click();
await pb.waitForTimeout(600);
await pb.locator('li#MegaForm').first().click();
await pb.waitForSelector('.mf-pb-table tbody tr', { timeout: 45000 });
await page.mouse.move(900, 500);            // dismiss the Content flyout sitting over the panel
await page.waitForTimeout(1200);

const steps = {};
const shot = async (name) => page.screenshot({ path: path.join(outDir, name + '.png') });

// 0. The Persona Bar's own localization table. It reads the resx of EVERY panel, so one malformed
// resx takes the whole Persona Bar down with a 404 here - which is exactly what a scripted edit to
// MegaForm.resx did on 2026-08-10 (it serialised xml:space as `d2p1:space`, invalid XML). Cheap to
// check, and the failure is otherwise reported far from its cause.
steps.personaBarLocalization = await pb.evaluate(async () => {
  try {
    const r = await fetch('/API/personaBar/localization/gettable?culture=en-US', { credentials: 'include' });
    return { status: r.status, bytes: (await r.text()).length };
  } catch (e) { return { status: -1, bytes: 0, error: String(e && e.message) }; }
});

// 1. the list
steps.listRows = await pb.locator('.mf-pb-table tbody tr').count();
await shot('1-list');

// 2. Open dashboard
const apiBefore = api.length;
await pb.locator('.mf-pb-dashboard').click();
// initDashboard RENAMES the element: `root.id = 'mf-dash-root'` (dashboard/index.ts, the delete
// button refers to it by that id). Waiting on #mf-dashboard-root would always time out.
await pb.waitForSelector('.mf-pb-dashhost .mf-hd-new, .mf-pb-dashhost .mf-sidebar', { timeout: 60000 })
  .catch(() => {});
await page.waitForTimeout(4000);
steps.dashboard = await pb.evaluate(() => {
  const root = document.getElementById('mf-dash-root') || document.getElementById('mf-dashboard-root');
  const host = document.querySelector('.mf-pb-dashhost');
  return {
    rootExists: !!root,
    rootId: root ? root.id : null,
    hostVisible: !!host && !host.classList.contains('mf-pb-hidden'),
    childCount: root ? root.children.length : 0,
    stillBooting: !!(root && root.querySelector('.mf-pb-dashboot')),
    hasHeaderButtons: !!document.querySelector('.mf-pb-dashhost .mf-hd-new'),
    hasSidebar: !!document.querySelector('.mf-pb-dashhost .mf-sidebar'),
    // Did anything real render, or is it an empty shell? FormView.ascx bakes the dashboard's
    // first payload into data-dashboard; the panel has no such attribute, so this is the check
    // that says whether the SPA fetches its own data here.
    statTiles: document.querySelectorAll('.mf-pb-dashhost .mf-stat, .mf-pb-dashhost .mf-stat-card').length,
    tableRows: document.querySelectorAll('.mf-pb-dashhost table tbody tr').length,
    visibleText: (host ? (host.innerText || '') : '').replace(/\s+/g, ' ').trim().slice(0, 200),
    listHidden: !!document.querySelector('.mf-pb-table-wrap.mf-pb-hidden'),
    backVisible: !!document.querySelector('.mf-pb-back:not(.mf-pb-hidden)'),
    // the panel must not have navigated the top window away
    topUrl: (() => { try { return window.top.location.pathname; } catch (e) { return 'cross-origin'; } })(),
    platform: (() => { const p = window.__MF_PLATFORM__ || {}; return { platform: p.platform, apiBase: p.apiBase, portalId: p.portalId, moduleId: p.moduleId, tabId: p.tabId }; })(),
  };
});
steps.apiDuringMount = api.slice(apiBefore);
await shot('2-dashboard');

// 3. Back to forms
await pb.locator('.mf-pb-back').click();
await page.waitForTimeout(2500);
steps.backToList = {
  rows: await pb.locator('.mf-pb-table tbody tr').count(),
  dashHidden: await pb.locator('.mf-pb-dashhost.mf-pb-hidden').count(),
};
await shot('3-back');

// 4. New form -> the wizard
const apiBeforeWizard = api.length;
await pb.locator('.mf-pb-new').click();
await pb.waitForSelector('#mf-wizard-root', { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(3500);
steps.wizard = await pb.evaluate(() => {
  const w = document.getElementById('mf-wizard-root');
  return {
    exists: !!w,
    visible: !!w && w.getBoundingClientRect().height > 100,
    heading: (document.querySelector('#mf-wizard-root h1, #mf-wizard-root h2, #mf-wizard-root .mfw-title')?.textContent || '').trim().slice(0, 80),
  };
});
steps.apiDuringWizard = api.slice(apiBeforeWizard);
await shot('4-wizard');

// 5. Full screen: the MegaForm panel must fill the width beside the rail, not sit in a ~860px
// strip with dead page showing next to it (owner, 2026-08-10).
steps.fullWidth = await pb.evaluate(() => {
  const host = document.querySelector('.socialpanel');
  const rail = document.getElementById('personabar');
  const avail = (document.documentElement.clientWidth || 0) - (rail ? rail.offsetWidth : 80);
  return {
    panelWidth: host ? Math.round(host.getBoundingClientRect().width) : 0,
    available: Math.round(avail),
    gap: host ? Math.round(avail - host.getBoundingClientRect().width) : null,
  };
});

// 6. Edit / Submissions must open INSIDE the panel, not throw the admin out to a module page.
// The wizard from step 4 is a fixed full-viewport overlay at z-index 2147483600, so it has to go
// first or every click below lands on it.
// Wrapped: if a surface falls back to opening its old page, the Persona Bar iframe is detached and
// every later evaluate throws. That is a RESULT, not a crash - record it and still write the report.
try {
await pb.evaluate(() => { const w = document.getElementById('mf-wizard-root'); if (w) w.remove(); });
await pb.locator('.mf-pb-back').click().catch(() => {});
await page.waitForTimeout(2500);
const topBefore = page.url();
await pb.locator('.mf-pb-rows tr:first-child .mf-pb-action', { hasText: /Submissions|Bài gửi/ }).first().click()
  .catch(async () => { await pb.locator('.mf-pb-rows tr:first-child .mf-pb-action').nth(1).click(); });
await pb.waitForSelector('#mf-submissions-root', { timeout: 45000 }).catch(() => {});
await page.waitForTimeout(6000);
steps.submissionsInPanel = await pb.evaluate(() => {
  const r = document.getElementById('mf-submissions-root');
  return {
    rootExists: !!r,
    childCount: r ? r.children.length : 0,
    stillBooting: !!(r && r.querySelector('.mf-pb-dashboot')),
    text: (r ? (r.innerText || '') : '').replace(/\s+/g, ' ').trim().slice(0, 140),
  };
});
steps.submissionsKeptTopPage = page.url() === topBefore;
await shot('5-submissions');

await pb.locator('.mf-pb-back').click().catch(() => {});
await page.waitForTimeout(2000);
await pb.locator('.mf-pb-rows tr:first-child .mf-pb-action').first().click().catch(() => {});
await pb.waitForSelector('#mf-builder-root', { timeout: 45000 }).catch(() => {});
await page.waitForTimeout(8000);
steps.builderInPanel = await pb.evaluate(() => {
  const r = document.getElementById('mf-builder-root');
  return {
    rootExists: !!r,
    childCount: r ? r.children.length : 0,
    stillBooting: !!(r && r.querySelector('.mf-pb-dashboot')),
    text: (r ? (r.innerText || '') : '').replace(/\s+/g, ' ').trim().slice(0, 140),
  };
});
steps.builderKeptTopPage = page.url() === topBefore;
await shot('6-builder');
} catch (e) {
  steps.surfaceProbeError = String(e && e.message).slice(0, 200);
  steps.topUrlAfterProbe = page.url();
}

const failed = api.filter((r) => r.status >= 400);
const report = { site, viewport: { width, height }, steps, apiCalls: api.length, failedApi: failed, consoleErrors };
fs.writeFileSync(path.join(outDir, 'pb-dashboard-qa.json'), JSON.stringify(report, null, 2));

console.log(JSON.stringify({ steps, apiCalls: api.length, failedApi: failed, consoleErrors: consoleErrors.slice(0, 10) }, null, 1));
await browser.close();
