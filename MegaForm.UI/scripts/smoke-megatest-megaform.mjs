// Smoke test: verify MegaForm works on dnn10322_megatest.ai after install.
// Login + open a runtime form + open builder + check for JS errors.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CON: ' + m.text().slice(0, 200)); });

console.log('[smoke] login');
await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

console.log('[smoke] open runtime form 1268');
await page.goto(SITE + '/xx?formid=1268', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(10000);
await page.screenshot({ path: 'qa-out/megatest-smoke-runtime-1268.png', fullPage: false });

const runtime = await page.evaluate(() => ({
  url: location.href,
  formExists: !!document.querySelector('.mf-form-wrapper'),
  fieldCount: document.querySelectorAll('.mf-field-group').length,
  title: (document.querySelector('h1, h2, .mf-form-title') || {}).textContent || ''
}));
console.log('[smoke] runtime: ' + JSON.stringify(runtime));

console.log('[smoke] open builder form 1268');
await page.goto(SITE + '/xx?mfFormId=1268#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(14000);
await page.screenshot({ path: 'qa-out/megatest-smoke-builder-1268.png', fullPage: false });

const builder = await page.evaluate(() => ({
  url: location.href,
  panelLeft: !!document.querySelector('#mf-panel-left, .mf-panel-left'),
  panelRight: !!document.querySelector('#mf-panel-right, .mf-panel-right'),
  canvas: !!document.querySelector('#mf-canvas-dropzone'),
  paletteItems: document.querySelectorAll('.mf-palette-item').length,
  themeTab: !!document.querySelector('#mf-tab-link-theme'),
  inspectTab: Array.from(document.querySelectorAll('.mf-tlr-tab')).some(t => (t.textContent || '').trim().toUpperCase() === 'INSPECT')
}));
console.log('[smoke] builder: ' + JSON.stringify(builder));

console.log('[smoke] errors during run: ' + errs.length);
errs.slice(0, 5).forEach(e => console.log('  ' + e.slice(0, 200)));

await browser.close();
console.log('[smoke] DONE');
