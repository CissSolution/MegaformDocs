import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const user = process.argv[3] || 'host';
const pass = process.argv[4] || 'dnnhost';
const outDir = path.resolve(process.argv[5] || 'qa-out/wizard-library');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
const page = await context.newPage();
const errors = [];
const dashboardScripts = [];
const badResponses = [];
page.on('pageerror', (e) => errors.push('page: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('response', (r) => { if (/megaform-dashboard\.js/i.test(r.url())) dashboardScripts.push({ url: r.url(), status: r.status() }); });
page.on('response', (r) => { if (r.status() >= 400) badResponses.push({ url: r.url(), status: r.status() }); });

async function login() {
  await page.goto(`${site}/Login?returnurl=%2fmfqa-admin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const username = page.locator('input[id*="txtUsername"]');
  await username.waitFor({ state: 'visible', timeout: 30000 });
  await username.fill(user);
  await page.locator('input[id*="txtPassword"]').fill(pass);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {}),
    page.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click(),
  ]);
}

async function ensureWizard() {
  await page.goto(`${site}/mfqa-admin?qa=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  if (!(await page.locator('#mf-wizard-root').count())) {
    await page.evaluate(() => window.MegaFormWizard && window.MegaFormWizard.open());
  }
  await page.locator('#mf-wizard-root').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.mfw-library-card').first().waitFor({ state: 'visible', timeout: 30000 });
}

async function metrics(label) {
  return page.evaluate((name) => {
    const box = (el) => el ? el.getBoundingClientRect() : null;
    const root = document.querySelector('#mf-wizard-root');
    const footer = document.querySelector('.mfw-foot');
    const main = document.querySelector('.mfw-main');
    const cards = Array.from(document.querySelectorAll('.mfw-library-card'));
    const pager = document.querySelector('.mfw-library-pager');
    const next = Array.from(document.querySelectorAll('.mfw-foot button')).find((b) => /continue|next|tiếp/i.test(b.textContent || ''));
    return {
      label: name,
      viewport: { width: innerWidth, height: innerHeight },
      root: box(root), footer: box(footer), main: box(main), next: box(next),
      footerVisible: !!footer && box(footer).top >= 0 && box(footer).bottom <= innerHeight + 1,
      nextVisible: !!next && box(next).top >= 0 && box(next).bottom <= innerHeight + 1,
      libraryCards: cards.length,
      cardTitles: cards.map((c) => c.getAttribute('title')),
      libraryPageSize: document.querySelector('.mfw-library')?.getAttribute('data-page-size'),
      libraryPager: pager?.textContent?.replace(/\s+/g, ' ').trim(),
      documentScrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
    };
  }, label);
}

const report = { site, dashboardScripts, badResponses, errors, checks: [] };
try {
  await login();
  await ensureWizard();
  report.checks.push(await metrics('desktop-page-1'));
  await page.screenshot({ path: path.join(outDir, 'desktop-page-1.png'), fullPage: false });
  await page.locator('.mfw-library').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outDir, 'desktop-library-page-1.png'), fullPage: false });

  const firstTitles = await page.locator('.mfw-library-card').allTextContents();
  const pagerButtons = page.locator('.mfw-library-pager button');
  if (await pagerButtons.count() !== 2) throw new Error('Expected exactly two inline pager buttons');
  const nextPage = pagerButtons.nth(1);
  if (await nextPage.isEnabled()) await nextPage.click();
  await page.waitForTimeout(150);
  const secondTitles = await page.locator('.mfw-library-card').allTextContents();
  report.paginationChanged = JSON.stringify(firstTitles) !== JSON.stringify(secondTitles);
  report.checks.push(await metrics('desktop-page-2'));

  const search = page.locator('.mfw-library-search');
  await search.fill('gold suite');
  await page.waitForTimeout(150);
  report.searchResultCount = await page.locator('.mfw-library-card').count();
  report.searchTitles = await page.locator('.mfw-library-card').allTextContents();
  await search.fill('');

  await page.locator('.mfw-library-all').click();
  await page.locator('.mfwg-modal').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.mfwg-card').first().waitFor({ state: 'visible', timeout: 20000 });
  report.gallery = await page.evaluate(() => {
    const modal = document.querySelector('.mfwg-modal')?.getBoundingClientRect();
    const footer = document.querySelector('.mfwg-ft')?.getBoundingClientRect();
    return {
      cards: document.querySelectorAll('.mfwg-card').length,
      pageSize: document.querySelector('.mfwg-pager')?.getAttribute('data-page-size'),
      pager: document.querySelector('.mfwg-pager')?.textContent?.replace(/\s+/g, ' ').trim(),
      modal,
      footer,
      footerVisible: !!footer && footer.bottom <= innerHeight + 1,
    };
  });
  await page.screenshot({ path: path.join(outDir, 'gallery-page-1.png'), fullPage: false });
  await page.locator('.mfwg-x').click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  report.checks.push(await metrics('iphone-14'));
  await page.screenshot({ path: path.join(outDir, 'iphone-14.png'), fullPage: false });

  await page.setViewportSize({ width: 1365, height: 768 });
  await page.locator('.mfw-cancel').click();
  await page.waitForTimeout(700);
  report.dashboard = await page.evaluate(() => ({
    formLinks: document.querySelectorAll('.mf-form-name-link').length,
    formMeta: Array.from(document.querySelectorAll('.mf-card-meta')).map((e) => (e.textContent || '').trim()).filter(Boolean).slice(0, 12),
    hasGoldSuite: Array.from(document.querySelectorAll('.mf-form-name-link')).some((e) => /Gold Suite/i.test(e.textContent || '')),
    hasFesta: Array.from(document.querySelectorAll('.mf-form-name-link')).some((e) => /Festa Italiana/i.test(e.textContent || '')),
  }));
  await page.screenshot({ path: path.join(outDir, 'dashboard-after-bulk.png'), fullPage: false });
} catch (e) {
  report.failure = String(e && e.stack || e);
  report.failureUrl = page.url();
  report.failureTitle = await page.title().catch(() => '');
  report.failureText = await page.locator('body').innerText().then((s) => s.slice(0, 1500)).catch(() => '');
  await page.screenshot({ path: path.join(outDir, 'failure.png'), fullPage: false }).catch(() => {});
}

report.dashboardScripts = dashboardScripts;
report.badResponses = badResponses;
report.errors = errors.slice(0, 20);
report.pass = !report.failure
  && report.checks.every((c) => c.footerVisible && c.nextVisible && c.libraryCards > 0 && c.libraryCards <= 6)
  && report.paginationChanged
  && report.searchResultCount > 0
  && report.gallery?.cards > 0 && report.gallery.cards <= 12 && report.gallery.footerVisible
  && report.dashboard?.formLinks >= 100 && report.dashboard.hasGoldSuite && report.dashboard.hasFesta;

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(report.pass ? 0 : 1);
