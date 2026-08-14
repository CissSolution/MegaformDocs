import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const user = process.argv[3] || 'admin';
const pass = process.argv[4] || 'dnnhost';
const outDir = path.resolve(process.argv[5] || 'qa-out/wizard-create-b418');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1365, height: 675 } });
const page = await context.newPage();
const report = { site, scripts: [], badResponses: [], consoleErrors: [], steps: [] };

page.on('response', (r) => {
  if (/megaform-dashboard\.js/i.test(r.url())) report.scripts.push({ url: r.url(), status: r.status(), fromServiceWorker: r.fromServiceWorker() });
  if (r.status() >= 400) report.badResponses.push({ url: r.url(), status: r.status() });
});
page.on('pageerror', (e) => report.consoleErrors.push('page: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push('console: ' + m.text()); });

async function login() {
  await page.goto(`${site}/Login?returnurl=%2fmfqa-admin`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('input[id*="txtUsername"]').fill(user);
  await page.locator('input[id*="txtPassword"]').fill(pass);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
    page.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click(),
  ]);
}

async function openWizard() {
  if (!(await page.locator('#mf-wizard-root').count())) {
    const opened = await page.evaluate(() => {
      if (!window.MegaFormWizard?.open) return false;
      window.MegaFormWizard.open();
      return true;
    });
    if (!opened) throw new Error('MegaFormWizard.open is unavailable');
  }
  await page.locator('#mf-wizard-root').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.mfw-library-card').first().waitFor({ state: 'visible', timeout: 30000 });
}

async function shellMetrics(label) {
  const value = await page.evaluate((name) => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect() || null;
    const cancel = document.querySelector('.mfw-cancel');
    const footer = document.querySelector('.mfw-foot');
    const next = document.querySelector('.mfw-foot .mfw-btn.primary');
    const visible = (el) => !!el && el.getBoundingClientRect().top >= 0 && el.getBoundingClientRect().bottom <= innerHeight + 1;
    return {
      label: name, viewport: { width: innerWidth, height: innerHeight },
      root: rect('#mf-wizard-root'), footer: rect('.mfw-foot'), cancel: rect('.mfw-cancel'), next: rect('.mfw-foot .mfw-btn.primary'),
      cancelVisible: visible(cancel), footerVisible: visible(footer), nextVisible: visible(next),
    };
  }, label);
  report.steps.push(value);
  return value;
}

try {
  await login();
  await page.goto(`${site}/mfqa-admin?b418=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2500);
  await openWizard();

  const initial = await shellMetrics('initial-open');
  if (!initial.cancelVisible || !initial.footerVisible || !initial.nextVisible) throw new Error('Wizard controls are outside the viewport');
  await page.screenshot({ path: path.join(outDir, '01-initial-open.png'), fullPage: false });

  await page.locator('.mfw-cancel').click();
  await page.locator('#mf-wizard-root').waitFor({ state: 'detached', timeout: 5000 });
  report.closeWorks = true;

  await openWizard();
  await page.locator('.mfw-library-all').click();
  await page.locator('.mfwg-modal').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.mfwg-card').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.screenshot({ path: path.join(outDir, '02-gallery-open.png'), fullPage: false });
  await page.locator('.mfwg-x').click();
  await page.locator('.mfwg-modal').waitFor({ state: 'detached', timeout: 5000 });
  report.galleryCloseWorks = true;

  const formName = `QA Wizard B419 ${Date.now()}`;
  await page.locator('#mf-wizard-root input.mfw-in').first().fill(formName);
  await page.locator('.mfw-library-all').click();
  await page.locator('.mfwg-card').first().waitFor({ state: 'visible', timeout: 20000 });
  const pickedTitle = await page.locator('.mfwg-card .mfwg-cap b').first().textContent();
  await page.locator('.mfwg-card').first().click();
  await page.locator('.mfwg-modal').waitFor({ state: 'detached', timeout: 5000 });
  report.galleryPickWorks = true;
  report.pickedTitle = pickedTitle;
  report.formName = formName;
  await page.screenshot({ path: path.join(outDir, '03-template-picked.png'), fullPage: false });

  for (let expectedStep = 2; expectedStep <= 5; expectedStep++) {
    const next = page.locator('.mfw-foot .mfw-btn.primary');
    if (await next.count() !== 1) throw new Error(`Expected one primary footer action at step ${expectedStep - 1}`);
    await next.click();
    await page.waitForTimeout(250);
    const active = await page.locator('.mfw-steps-top .s.active .n').textContent();
    if (Number(active) !== expectedStep) throw new Error(`Expected wizard step ${expectedStep}, got ${active}`);
    await shellMetrics('step-' + expectedStep);
  }

  await page.screenshot({ path: path.join(outDir, '04-ready-to-create.png'), fullPage: false });
  const create = page.locator('.mfw-foot .mfw-btn.cta');
  if (await create.count() !== 1) throw new Error('Create button is missing');
  await create.click();
  await page.waitForURL(/mfFormId=\d+|formId=\d+|#mf-builder/i, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  report.finalUrl = page.url();
  report.createdFormId = Number((page.url().match(/(?:mfFormId|formId)=(\d+)/i) || [])[1] || 0);
  report.builderVisible = (await page.locator('#mf-builder-root, .mf-builder-shell, [data-mf-builder]').count()) > 0;
  await page.screenshot({ path: path.join(outDir, '05-created-builder.png'), fullPage: false });
} catch (e) {
  report.failure = String(e && e.stack || e);
  report.failureUrl = page.url();
  await page.screenshot({ path: path.join(outDir, 'failure.png'), fullPage: false }).catch(() => {});
}

report.hasB419 = report.scripts.some((s) => /[?&]v=20260809-B419/i.test(s.url));
report.hasDnnBuilderRoute = /[?&]mfFormId=\d+/i.test(report.finalUrl || '') && /#mf-builder$/i.test(report.finalUrl || '');
report.pass = !report.failure && report.hasB419 && report.closeWorks && report.galleryCloseWorks
  && report.galleryPickWorks && report.createdFormId > 0 && report.hasDnnBuilderRoute && report.builderVisible
  && report.steps.every((s) => s.cancelVisible && s.footerVisible && s.nextVisible);
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(report.pass ? 0 : 1);
