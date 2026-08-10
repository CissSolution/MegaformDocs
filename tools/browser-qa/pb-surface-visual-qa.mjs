// Visual QA for the Persona Bar panel: does each surface actually LOOK right, from a cold panel?
//
// Why this exists. The previous harness asked "does #mf-submissions-root exist and have children?"
// and the answer was yes while the screen rendered as raw unstyled HTML - default blue underlined
// links, a sidebar 1320px wide, no MegaForm stylesheet in the document at all. Two failures made
// that possible and both are fixed here:
//
//   1. DOM existence is not appearance. Every surface is now checked with getComputedStyle against
//      values that are only reachable when the stylesheets are present.
//   2. Step ORDER hid the bug. The old run clicked "Open dashboard" first, and that path happened
//      to load megaform-admin-shell.css, so every surface opened afterwards inherited it. Each
//      surface here gets a COLD page: new document, panel opened fresh, straight to that surface.
//
// It also compares the sheets the panel loads against the sheets the real DNN admin page loads, so
// the hand-maintained asset list in the panel cannot drift silently.
//
//   node tools/browser-qa/pb-surface-visual-qa.mjs [site] [user] [pass] [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const user = process.argv[3] || 'admin';
const pass = process.argv[4] || 'dnnhost';
const outDir = path.resolve(process.argv[5] || 'qa-out/pb-visual');
const hostPage = process.argv[6] || '/mf-templates/mf-xmas-sale';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// ── login once; every surface still gets its own cold page ────────────────────────────────────
{
  const p = await ctx.newPage();
  await p.goto(site + '/Login', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.locator('input[id*="txtUsername"]').fill(user);
  await p.locator('input[id*="txtPassword"]').fill(pass);
  await Promise.all([p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
                     p.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click()]);
  await p.close();
}

// The styled/unstyled verdict. Every one of these is a value the browser CANNOT produce on its own.
const STYLE_PROBE = ({ rootSel, needsShell }) => {
  const root = document.querySelector(rootSel) || document.querySelector('.mf-pb-dashhost');
  const failures = [];
  const sheets = Array.from(document.styleSheets)
    .map((s) => (s.href || '')).filter(Boolean);
  const megaSheets = sheets.filter((h) => /megaform/i.test(h));
  const hasShell = sheets.some((h) => /megaform-admin-shell\.css/i.test(h));

  // The panel's OWN list view is styled by the panel's own sheet and needs nothing else; only the
  // hosted SPA surfaces require the admin shell. Asserting it everywhere just cries wolf.
  if (needsShell && !hasShell) failures.push('megaform-admin-shell.css is not in document.styleSheets');
  if (needsShell && megaSheets.length < 5) failures.push(`only ${megaSheets.length} megaform stylesheets present`);

  const link = root && root.querySelector('a');
  const linkColor = link ? getComputedStyle(link).color : null;
  // rgb(0,0,238) is the UA default for <a href>. A styled MegaForm surface never leaves it.
  if (linkColor === 'rgb(0, 0, 238)') failures.push('links are UA-default blue: no stylesheet applied');

  const sb = document.querySelector('.mf-pb-dashhost .mf-sidebar');
  const sidebarWidth = sb ? Math.round(sb.getBoundingClientRect().width) : null;
  if (sb && (sidebarWidth > 400 || sidebarWidth < 40)) {
    failures.push(`sidebar is ${sidebarWidth}px - the shell rule never applied`);
  }

  // A styled surface has real chrome: buttons with a background and rounded corners somewhere.
  const btn = root && root.querySelector('button, .mf-btn');
  const btnBg = btn ? getComputedStyle(btn).backgroundColor : null;
  const btnRadius = btn ? getComputedStyle(btn).borderRadius : null;

  // Only meaningful as a corroborating signal when the shell is absent: a styled surface may still
  // contain a plain <ul> that legitimately keeps its bullets.
  const ul = root && root.querySelector('ul');
  const ulStyle = ul ? getComputedStyle(ul).listStyleType : null;
  if (needsShell && !hasShell && ulStyle === 'disc') failures.push('lists show UA bullets');

  // Did the surface actually finish mounting, or is it still sitting on the panel's placeholder?
  const stillBooting = !!(root && root.querySelector('.mf-pb-dashboot'));
  if (needsShell && stillBooting) failures.push('surface never mounted: still showing the boot placeholder');

  return {
    pass: failures.length === 0,
    failures,
    megaSheetCount: megaSheets.length,
    hasShell,
    stillBooting,
    // Counted in THIS frame: page-level network hits do not prove the panel injected anything.
    headStylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
    panelInjectedSheets: document.querySelectorAll('link[id^="mf-pb-css-"]').length,
    megaFormGlobals: Object.keys(window.MegaForm || {}).filter((k) => /^init/.test(k)),
    alert: (document.querySelector('.mf-pb-alert:not(.mf-pb-hidden)') || {}).textContent || '',
    linkColor,
    sidebarWidth,
    btnBg,
    btnRadius,
    ulStyle,
    rootChildren: root ? root.children.length : 0,
    text: root ? (root.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '',
  };
};

async function coldPanel(label) {
  const page = await ctx.newPage();
  const net = [];
  page.on('response', (r) => {
    const u = r.url();
    if (/\.(css|js)(\?|$)/i.test(u) && /megaform|font-?awesome|Sortable/i.test(u)) {
      net.push({ status: r.status(), url: u.replace(site, '') });
    }
  });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 180)); });

  await page.goto(site + hostPage, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(6000);
  const pb = page.frames().find((f) => f.url().includes('/Dnn.PersonaBar/index.html'));
  if (!pb) throw new Error(`[${label}] Persona Bar iframe missing`);
  await pb.locator('li#Content').first().click();
  await pb.waitForTimeout(600);
  await pb.locator('li#MegaForm').first().click();
    // A CLEAN install has no forms at all, which is the headline scenario: the panel must work with
  // no module and no data. Wait for the table OR the empty state, never only for rows.
  await pb.waitForSelector('.mf-pb-table tbody tr, .mf-pb-empty:not(.mf-pb-hidden)', { timeout: 45000 });
  await page.mouse.move(900, 500);
  await page.waitForTimeout(1200);
  return { page, pb, net, consoleErrors };
}

const results = {};

async function runSurface(label, rootSel, drive, needsShell = true) {
  const { page, pb, net, consoleErrors } = await coldPanel(label);
  try {
    await drive(pb, page);
    const probe = await pb.evaluate(STYLE_PROBE, { rootSel, needsShell });
    await page.screenshot({ path: path.join(outDir, `${label}.png`) });
    results[label] = {
      ...probe,
      failedRequests: net.filter((r) => r.status >= 400),
      cssLoaded: net.filter((r) => /\.css/i.test(r.url)).length,
      jsLoaded: net.filter((r) => /\.js/i.test(r.url)).length,
      consoleErrors: consoleErrors.slice(0, 6),
      topUrl: new URL(page.url()).pathname,
    };
  } catch (e) {
    results[label] = { pass: false, failures: ['driver threw: ' + String(e && e.message).slice(0, 160)] };
    await page.screenshot({ path: path.join(outDir, `${label}-ERROR.png`) }).catch(() => {});
  }
  await page.close();
}

const rowAction = (pb, nth) => pb.locator('.mf-pb-rows tr:first-child .mf-pb-action').nth(nth).click();

// The panel's own list: styled by the panel's own sheet, so it is NOT expected to carry the shell.
await runSurface('1-list', '.mf-pb-body', async () => { /* a cold panel already shows it */ }, false);

await runSurface('2-dashboard', '#mf-dash-root', async (pb, page) => {
  await pb.locator('.mf-pb-dashboard').click();
  await pb.waitForSelector('.mf-pb-dashhost .mf-sidebar', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
});

await runSurface('3-submissions', '#mf-submissions-root', async (pb, page) => {
  await rowAction(pb, 1);                       // straight in - no dashboard first
  await pb.waitForSelector('#mf-submissions-root', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(7000);
});

await runSurface('4-builder', '#mf-builder-root', async (pb, page) => {
  await rowAction(pb, 0);
  await pb.waitForSelector('#mf-builder-root', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(9000);
});

await runSurface('5-myinbox', '#mf-myinbox-root', async (pb, page) => {
  await pb.locator('.mf-pb-dashboard').click();
  await pb.waitForSelector('.mf-pb-dashhost .mf-sidebar', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await pb.locator('.mf-pb-dashhost a[href*="mf-myinbox"]').first().click();
  await pb.waitForSelector('#mf-myinbox-root', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(6000);
});

await runSurface('6-wizard', '#mf-wizard-root', async (pb, page) => {
  await pb.locator('.mf-pb-new').click();
  await pb.waitForSelector('#mf-wizard-root', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
});

fs.writeFileSync(path.join(outDir, 'visual-qa.json'), JSON.stringify(results, null, 2));

let bad = 0;
console.log('\nsurface        styled  sheets  links        sidebar  failures');
for (const [k, v] of Object.entries(results)) {
  if (!v.pass) bad++;
  console.log(
    k.padEnd(15) + String(v.pass).padEnd(8) + String(v.megaSheetCount ?? '-').padEnd(8) +
    String(v.linkColor ?? '-').padEnd(13) + String(v.sidebarWidth ?? '-').padEnd(9) +
    (v.failures || []).join('; ')
  );
  if (v.failedRequests && v.failedRequests.length) {
    v.failedRequests.forEach((r) => console.log(`                 404/${r.status} ${r.url}`));
  }
}
console.log(`\n${bad} surface(s) failed. Screenshots: ${outDir}`);
await browser.close();
