// Three questions in one pass:
//   1. Does the ORIGINAL page-hosted dashboard still work, unchanged, alongside the panel?
//   2. Are the shell's icons in the panel the same elements the page renders, or something worse?
//   3. What clips the right-hand side of the panel at a normal laptop width?
//
// The clipping check is the interesting one: it distinguishes "content is wider than its box and
// the box scrolls" (fine) from "content is wider than its box and the box hides it" (the bug), by
// walking every ancestor of the widest element and reporting the first one with overflow != visible
// whose clientWidth is smaller than its scrollWidth.
//
//   node tools/browser-qa/pb-parity-and-clipping-qa.mjs [site] [user] [pass] [outDir] [w] [h]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const user = process.argv[3] || 'admin';
const pass = process.argv[4] || 'dnnhost';
const outDir = path.resolve(process.argv[5] || 'qa-out/pb-parity');
const W = Number(process.argv[6] || 1300);
const H = Number(process.argv[7] || 700);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
await page.goto(site + '/Login', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.locator('input[id*="txtUsername"]').fill(user);
await page.locator('input[id*="txtPassword"]').fill(pass);
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
                   page.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click()]);

// What the sidebar nav icons actually ARE, so "panel vs page" is a fact not an impression.
const ICON_PROBE = () => {
  // Scoped to the MegaForm shell only, and to what is VISIBLE: the first attempt matched the DNN
  // theme's own <nav a> and compared two unrelated menus.
  const items = Array.from(document.querySelectorAll('.mf-sidebar a, .mf-sidebar button'))
    .filter((e) => e.getClientRects().length > 0).slice(0, 8);
  return items.map((el) => {
    const svg = el.querySelector('svg');
    const i = el.querySelector('i, .fa, [class*="fa-"]');
    const host = svg || i;
    const cs = host ? getComputedStyle(host) : null;
    return {
      label: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24),
      iconTag: host ? host.tagName.toLowerCase() : null,
      iconClass: host ? (host.getAttribute('class') || '') : null,
      box: host ? (() => { const r = host.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); })() : null,
      strokeWidth: svg ? (svg.getAttribute('stroke-width') || cs.strokeWidth) : null,
      fontFamily: i && cs ? cs.fontFamily : null,
      color: cs ? cs.color : null,
    };
  });
};

// The first ancestor that both clips and has more content than it shows.
const CLIP_PROBE = (startSel) => {
  const start = document.querySelector(startSel);
  if (!start) return { error: 'no element for ' + startSel };
  const chain = [];
  let el = start;
  while (el && el !== document.documentElement) {
    const cs = getComputedStyle(el);
    const overflowsX = el.scrollWidth > el.clientWidth + 1;
    chain.push({
      sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
           (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      overflowX: cs.overflowX,
      clips: overflowsX && cs.overflowX === 'hidden',
      scrolls: overflowsX && (cs.overflowX === 'auto' || cs.overflowX === 'scroll'),
      minWidth: cs.minWidth,
    });
    el = el.parentElement;
  }
  return {
    chain,
    firstClipper: chain.find((c) => c.clips) || null,
    firstScroller: chain.find((c) => c.scrolls) || null,
    docOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
};

const out = {};

// ── 1 + 2: the ORIGINAL page-hosted dashboard ────────────────────────────────────────────────
await page.goto(site + '/mfqa-admin', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(8000);
out.pageDashboard = await page.evaluate(() => ({
  hasRoot: !!(document.getElementById('mf-dash-root') || document.getElementById('mf-dashboard-root')),
  hasSidebar: !!document.querySelector('.mf-sidebar'),
  sidebarWidth: document.querySelector('.mf-sidebar') ? Math.round(document.querySelector('.mf-sidebar').getBoundingClientRect().width) : null,
  rows: document.querySelectorAll('table tbody tr').length,
  megaSheets: Array.from(document.styleSheets).map((s) => s.href || '').filter((h) => /megaform/i.test(h)).length,
}));
out.pageIcons = await page.evaluate(ICON_PROBE);
await page.screenshot({ path: path.join(outDir, 'A-page-dashboard.png') });

// ── the panel, same viewport ─────────────────────────────────────────────────────────────────
await page.goto(site + '/mf-templates/mf-xmas-sale', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(6000);
const pb = page.frames().find((f) => f.url().includes('/Dnn.PersonaBar/index.html'));
if (!pb) { console.error('no persona bar'); await browser.close(); process.exit(2); }
await pb.locator('li#Content').first().click();
await pb.waitForTimeout(600);
await pb.locator('li#MegaForm').first().click();
await pb.waitForSelector('.mf-pb-table tbody tr', { timeout: 45000 });
await page.mouse.move(Math.round(W * 0.6), Math.round(H * 0.6));
await page.waitForTimeout(1200);

await pb.locator('.mf-pb-dashboard').click();
await pb.waitForSelector('.mf-pb-dashhost .mf-sidebar', { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(5000);
out.panelDashboard = await pb.evaluate(() => ({
  hasRoot: !!(document.getElementById('mf-dash-root') || document.getElementById('mf-dashboard-root')),
  hasSidebar: !!document.querySelector('.mf-pb-dashhost .mf-sidebar'),
  sidebarWidth: document.querySelector('.mf-pb-dashhost .mf-sidebar') ? Math.round(document.querySelector('.mf-pb-dashhost .mf-sidebar').getBoundingClientRect().width) : null,
  rows: document.querySelectorAll('.mf-pb-dashhost table tbody tr').length,
  megaSheets: Array.from(document.styleSheets).map((s) => s.href || '').filter((h) => /megaform/i.test(h)).length,
}));
out.panelIcons = await pb.evaluate(ICON_PROBE);
out.panelDashClip = await pb.evaluate(CLIP_PROBE, '.mf-pb-dashhost table');
await page.screenshot({ path: path.join(outDir, 'B-panel-dashboard.png') });

// ── 3: submissions in the panel - the surface the owner screenshotted ────────────────────────
await pb.locator('.mf-pb-back').click().catch(() => {});
await page.waitForTimeout(2000);
await pb.locator('.mf-pb-rows tr:first-child .mf-pb-action').nth(1).click();
await pb.waitForSelector('#mf-submissions-root', { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(7000);
out.panelSubmissionsClip = await pb.evaluate(CLIP_PROBE, '#mf-submissions-root table');
out.panelGeometry = await pb.evaluate(() => {
  const host = document.querySelector('.socialpanel');
  const dash = document.querySelector('.mf-pb-dashhost');
  const rail = document.getElementById('personabar');
  return {
    viewport: document.documentElement.clientWidth,
    rail: rail ? rail.offsetWidth : null,
    socialpanelWidth: host ? Math.round(host.getBoundingClientRect().width) : null,
    socialpanelRight: host ? Math.round(host.getBoundingClientRect().right) : null,
    dashHostWidth: dash ? Math.round(dash.getBoundingClientRect().width) : null,
    dashHostScrollWidth: dash ? dash.scrollWidth : null,
  };
});
await page.screenshot({ path: path.join(outDir, 'C-panel-submissions.png') });

fs.writeFileSync(path.join(outDir, 'parity-clipping.json'), JSON.stringify(out, null, 2));

console.log('\n=== 1. the ORIGINAL page dashboard (/mfqa-admin) ===');
console.log(' ', JSON.stringify(out.pageDashboard));
console.log('=== the panel-hosted dashboard, same viewport ===');
console.log(' ', JSON.stringify(out.panelDashboard));
console.log('\n=== 2. sidebar icons: page vs panel ===');
out.pageIcons.forEach((p, i) => {
  const q = out.panelIcons[i] || {};
  const same = p.iconTag === q.iconTag && p.box === q.box && p.iconClass === q.iconClass;
  console.log(`  ${(p.label || '').padEnd(24)} page:${p.iconTag}/${p.box}  panel:${q.iconTag}/${q.box}  ${same ? 'same' : 'DIFFERENT'}`);
});
console.log('\n=== 3. right-edge clipping ===');
console.log('  geometry:', JSON.stringify(out.panelGeometry));
for (const [name, res] of [['dashboard table', out.panelDashClip], ['submissions table', out.panelSubmissionsClip]]) {
  console.log(`  ${name}: firstClipper=${res.firstClipper ? res.firstClipper.sel + ' (' + res.firstClipper.clientWidth + '<' + res.firstClipper.scrollWidth + ', overflow-x:' + res.firstClipper.overflowX + ')' : 'none'}` +
              ` | firstScroller=${res.firstScroller ? res.firstScroller.sel : 'none'} | docOverflows=${res.docOverflows}`);
}
console.log(`\nscreenshots: ${outDir}`);
await browser.close();
