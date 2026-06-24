// [B65j] Visual QA + diagnose 400 from /Form/Get on subportal /megaform/
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
const TARGET = SITE + '/megaform/Home/mfFormId/1269?mfFormId=1269#mf-builder';

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const networkLog = [];
const consoleErrs = [];

page.on('request', r => {
  if (r.url().includes('/MegaForm/API/')) {
    networkLog.push({ phase: 'req', url: r.url(), method: r.method(), headers: r.headers() });
  }
});
page.on('response', async r => {
  if (r.url().includes('/MegaForm/API/')) {
    let body = '';
    try { body = (await r.text()).slice(0, 600); } catch { body = '(no body)'; }
    networkLog.push({ phase: 'res', url: r.url(), status: r.status(), body });
  }
});
page.on('pageerror', e => consoleErrs.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') consoleErrs.push('CON: ' + m.text().slice(0, 200)); });

await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

await page.goto(TARGET, { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(15000);
await page.screenshot({ path: 'qa-out/b65j-01-target.png', fullPage: false });

const pageState = await page.evaluate(() => {
  const root = document.querySelector('#mf-megaform-root, [data-module-id]');
  return {
    url: location.href,
    title: document.title,
    rootModuleId: root ? root.getAttribute('data-module-id') : null,
    rootTabId: root ? root.getAttribute('data-tab-id') : null,
    rootPortalId: root ? root.getAttribute('data-portal-id') : null,
    rootFormId: root ? root.getAttribute('data-form-id') : null,
    builderMounted: !!document.querySelector('#mf-builder, #mf-canvas-dropzone'),
    schemaJsonLen: ((window.SCHEMA_JSON || '') + '').length
  };
});

const formGet = networkLog.filter(l => l.url.includes('/Form/Get'));
const summary = networkLog.map(l => ({
  phase: l.phase,
  status: l.status,
  url: l.url.replace(SITE, '').slice(0, 120),
  hasAfHeader: l.headers && (l.headers['requestverificationtoken'] || l.headers['RequestVerificationToken']) ? 'Y' : '',
  tabIdHeader: l.headers && l.headers.tabid ? 'Y' : '',
  moduleIdHeader: l.headers && l.headers.moduleid ? 'Y' : '',
  bodyPreview: (l.body || '').slice(0, 200)
}));

writeFileSync('qa-out/b65j-network.json', JSON.stringify({ summary, formGetDetails: formGet, pageState, consoleErrs: consoleErrs.slice(0, 10) }, null, 2));
console.log(JSON.stringify({ summary: summary.slice(0, 6), pageState, formGetCount: formGet.length, errors: consoleErrs.length }, null, 2));

await browser.close();
