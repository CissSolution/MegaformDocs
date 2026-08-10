// Is the PAGE-hosted MegaForm dashboard alive, or is the visible overlay stuck on its placeholder?
//
// The module renders each admin surface TWICE - the module's own copy inside form#Form and a
// body-level host overlay - with the SAME element id. dnn-host/index.ts:607 already documents the
// consequence on this very site: the app can mount into the hidden copy while the copy the user
// looks at keeps its "Loading …" placeholder forever. getElementById returns the first in document
// order, so a naive check reports a healthy dashboard while the screen is blank.
//
// This reports what is VISIBLE, which is the only thing that matters to the person looking at it.
//
//   node tools/browser-qa/page-dashboard-health.mjs <site> [user] [pass] [adminPath] [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const user = process.argv[3] || 'admin';
const pass = process.argv[4] || 'dnnhost';
const adminPath = process.argv[5] || '/mfqa-admin';
const outDir = path.resolve(process.argv[6] || 'qa-out/page-health');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 160)));

await page.goto(site + '/Login', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.locator('input[id*="txtUsername"]').fill(user);
await page.locator('input[id*="txtPassword"]').fill(pass);
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
                   page.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click()]);
const loggedIn = !(await page.locator('input[id*="txtUsername"]').count());

await page.goto(site + adminPath, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(15000);

const health = await page.evaluate(() => {
  const visible = (el) => el.getClientRects().length > 0;
  const bootVisible = Array.from(document.querySelectorAll('.mf-host-boot')).filter(visible)
    .map((e) => (e.textContent || '').trim().slice(0, 40));
  return {
    // what the human sees
    visibleSidebars: Array.from(document.querySelectorAll('.mf-sidebar')).filter(visible).length,
    visibleRows: Array.from(document.querySelectorAll('table tbody tr')).filter(visible).length,
    visibleBootPlaceholders: bootVisible,
    // the duplicate-copy picture
    overlays: document.querySelectorAll('.mf-host-overlay').length,
    openOverlays: document.querySelectorAll('.mf-host-overlay.is-open').length,
    duplicateIds: (() => {
      const seen = {}, dupes = [];
      document.querySelectorAll('[id]').forEach((e) => {
        if (!/^mf-/.test(e.id)) return;
        if (seen[e.id]) { if (dupes.indexOf(e.id) < 0) dupes.push(e.id); } else seen[e.id] = 1;
      });
      return dupes;
    })(),
    formHidden: (() => { const f = document.getElementById('Form'); return f ? getComputedStyle(f).display === 'none' : null; })(),
    mountedButHidden: (() => {
      const m = document.getElementById('mf-dash-root');
      return m ? { exists: true, visible: visible(m), children: m.children.length } : { exists: false };
    })(),
    initDashboard: typeof (window.MegaForm || {}).initDashboard,
  };
});

const alive = health.visibleSidebars > 0 && health.visibleBootPlaceholders.length === 0;
fs.writeFileSync(path.join(outDir, 'page-health.json'), JSON.stringify({ site, adminPath, loggedIn, alive, health, errors }, null, 2));
await page.screenshot({ path: path.join(outDir, 'page-dashboard.png') });

console.log(`\n${site}${adminPath}  loggedIn=${loggedIn}`);
console.log(`  ALIVE: ${alive}`);
console.log(`  visible sidebars=${health.visibleSidebars} rows=${health.visibleRows} stuck placeholders=${JSON.stringify(health.visibleBootPlaceholders)}`);
console.log(`  overlays=${health.overlays} open=${health.openOverlays} form#Form hidden=${health.formHidden}`);
console.log(`  duplicate mf-* ids: ${health.duplicateIds.length ? health.duplicateIds.join(', ') : 'none'}`);
console.log(`  mounted-but-hidden #mf-dash-root: ${JSON.stringify(health.mountedButHidden)}`);
console.log(`  console errors: ${errors.length ? errors.slice(0, 3).join(' | ') : 'none'}`);
await browser.close();
