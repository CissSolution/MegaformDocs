// Dashboard density QA: measures the /mfqa-admin dashboard and every modal it can open, at one
// viewport per run. Companion to personalbar-compact-qa.mjs - same account, same JSON-and-
// screenshots discipline, because "looks fine" has been wrong three times on this surface.
//
//   node tools/browser-qa/dashboard-density-qa.mjs <site> <user> <pass> <outDir> <w> <h>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const user = process.argv[3] || 'admin';
const pass = process.argv[4] || 'dnnhost';
const outDir = path.resolve(process.argv[5] || 'qa-out/dashboard-density');
const viewport = { width: Number(process.argv[6] || 1365), height: Number(process.argv[7] || 675) };
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport });
const page = await context.newPage();
const log = [];
page.on('pageerror', (e) => log.push({ type: 'pageerror', text: e.message }));
page.on('console', (m) => { if (m.type() === 'error') log.push({ type: 'console', text: m.text().slice(0, 200) }); });

await page.goto(site + '/Login', { waitUntil: 'domcontentloaded', timeout: 90000 });
if (await page.locator('input[id*="txtUsername"]').count()) {
  await page.locator('input[id*="txtUsername"]').fill(user);
  await page.locator('input[id*="txtPassword"]').fill(pass);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
    page.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click(),
  ]);
}
await page.goto(site + '/mfqa-admin', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#mf-dash-root', { timeout: 90000 });
await page.waitForTimeout(3500);

const measure = () => page.evaluate(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      right: Math.round(r.right), bottom: Math.round(r.bottom),
      clientW: el.clientWidth, scrollW: el.scrollWidth, overflow: el.scrollWidth - el.clientWidth,
    };
  };
  const doc = document.documentElement;
  const offscreen = Array.from(document.querySelectorAll('button, a, input, select'))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ el, r }) => r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden')
    .filter(({ r }) => r.right > doc.clientWidth + 1 || r.left < -1)
    .slice(0, 8)
    .map(({ el, r }) => ({ tag: el.tagName, cls: String(el.className || '').slice(0, 40),
                           text: (el.textContent || '').trim().slice(0, 24), right: Math.round(r.right) }));
  return {
    document: { clientW: doc.clientWidth, scrollW: doc.scrollWidth, clientH: doc.clientHeight, scrollH: doc.scrollHeight,
                horizontalOverflow: doc.scrollWidth - doc.clientWidth },
    chrome: { dnnHeader: box('.mf-dash-title, .DnnModule-MegaForm .Head, h1'), appHeader: box('.mf-hd'), toolbar: box('.mf-hd-ac') },
    table: { wrap: box('.mf-tablewrap, .mf-table-wrap'), table: box('.mf-table, table'),
             columns: Array.from(document.querySelectorAll('.mf-table thead th, table thead th'))
               .filter((th) => getComputedStyle(th).display !== 'none')
               .map((th) => ({ label: th.textContent.trim().slice(0, 18), w: Math.round(th.getBoundingClientRect().width) })),
             rowHeight: Math.round(document.querySelector('.mf-table tbody tr, table tbody tr')?.getBoundingClientRect().height || 0) },
    offscreen,
  };
});

const baseline = await measure();
await page.screenshot({ path: path.join(outDir, '01-dashboard.png') });

// Every modal this dashboard can open. A modal passes when it fits the viewport, scrolls its own
// body, and still shows its footer actions - the three ways this surface has broken before.
// Real selectors, read off the live dashboard - the class names are the contract here, not guesses.
const modalTargets = [
  { key: 'starters', label: 'Business Starters', selector: '.mf-hd-starters' },
  { key: 'ai', label: 'Create with AI', selector: '.mf-btn-ai-create' },
  { key: 'bulk-delete', label: 'Bulk delete', selector: 'button[aria-label^="Ch"][aria-label*="hộp kiểm"], button[aria-label*="checkbox" i]' },
  { key: 'pin-to-page', label: 'Pin to page', selector: 'button[aria-label*="DNN"][aria-label*="trang"], button[aria-label*="Pin" i]' },
];

const modals = [];
for (const target of modalTargets) {
  const trigger = page.locator(target.selector).first();
  if (!(await trigger.count())) { modals.push({ ...target, opened: false, reason: 'trigger not found' }); continue; }
  try {
    await trigger.click({ timeout: 8000 });
    await page.waitForTimeout(2200);
    const info = await page.evaluate(() => {
      // Whatever the class is called, a modal is the biggest fixed/absolute layer on top of the
      // page. Finding it by behaviour survives a rename; finding it by class did not.
      const candidates = Array.from(document.querySelectorAll('body *')).filter((el) => {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
        if (s.position !== 'fixed' && s.position !== 'absolute') return false;
        if ((Number(s.zIndex) || 0) < 50) return false;
        const r = el.getBoundingClientRect();
        return r.width > 260 && r.height > 160;
      });
      const dialog = candidates.sort((a, b) => (Number(getComputedStyle(b).zIndex) || 0) - (Number(getComputedStyle(a).zIndex) || 0))[0];
      if (!dialog) return null;
      const r = dialog.getBoundingClientRect();
      const doc = document.documentElement;
      const footer = dialog.querySelector('.mf-modal-foot, .mf-dialog-foot, footer, .mf-wizard-foot, .mf-md-foot')
        || Array.from(dialog.querySelectorAll('div')).reverse().find((d) => d.querySelector('button, a.mf-btn'));
      const fr = footer ? footer.getBoundingClientRect() : null;
      const scroller = Array.from(dialog.querySelectorAll('*')).find((el) => el.scrollHeight > el.clientHeight + 8);
      return {
        cls: String(dialog.className || '').slice(0, 50),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
                right: Math.round(r.right), bottom: Math.round(r.bottom) },
        viewport: { w: doc.clientWidth, h: doc.clientHeight },
        fitsWidth: r.left >= -1 && r.right <= doc.clientWidth + 1,
        fitsHeight: r.top >= -1 && r.bottom <= doc.clientHeight + 1,
        documentOverflow: doc.scrollWidth - doc.clientWidth,
        footerVisible: fr ? (fr.bottom <= doc.clientHeight + 1 && fr.top >= 0) : null,
        bodyScrolls: !!scroller,
      };
    });
    modals.push({ ...target, opened: !!info, ...(info || {}) });
    await page.screenshot({ path: path.join(outDir, `modal-${target.key}.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
    // A modal that Escape does not close is a finding of its own.
    // The dashboard itself is a fixed full-screen layer, so "any big overlay" reported every
    // modal as un-closable. The modal has an id; use it.
    const stillOpen = await page.evaluate(() => (document.getElementById('mf-modal-overlay') ? 1 : 0));
    if (stillOpen) {
      const closer = page.locator('.mf-modal-close, .mf-dialog-close, button[title*="Close" i]').first();
      if (await closer.count()) { await closer.click({ timeout: 5000 }).catch(() => {}); }
      await page.waitForTimeout(700);
    }
    modals[modals.length - 1].escapeCloses = !stillOpen;
  } catch (error) {
    modals.push({ ...target, opened: false, reason: String(error.message).slice(0, 90) });
  }
}

const report = { viewport, baseline, modals, log };
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
