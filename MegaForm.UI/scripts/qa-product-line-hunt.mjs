// Hunt where ProductLineItems script gets loaded
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.clearCookies();
const page = await ctx.newPage();
const scriptRequests = [];
page.on('request', r => {
  const url = r.url();
  if (/megaform-widget|megaform-builder|product-line/.test(url)) {
    scriptRequests.push({ url, method: r.method() });
  }
});

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

try { await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(12000);

// Check what's actually loaded
const probe = await page.evaluate(() => {
  const allScripts = Array.from(document.scripts).map(s => s.src).filter(Boolean);
  const productLineScripts = allScripts.filter(s => /product-line/i.test(s));
  const plugins = window.MegaFormWidgets && window.MegaFormWidgets.getAllPlugins ? window.MegaFormWidgets.getAllPlugins() : {};
  const pluginKeys = Object.keys(plugins).sort();
  return {
    allScriptsCount: allScripts.length,
    productLineScripts,
    pluginKeys,
    hasPLI: pluginKeys.indexOf('ProductLineItems') >= 0,
    pluginPaletteContent: (document.getElementById('mf-plugin-palette')?.innerHTML || '').slice(0, 500)
  };
});

console.log('=== Script requests captured (product-line / widget / builder) ===');
console.log(JSON.stringify(scriptRequests.filter(r => /product-line/i.test(r.url)), null, 2));
console.log('\n=== All widget script requests ===');
console.log(scriptRequests.map(r => r.url.replace(BASE, '')).join('\n'));
console.log('\n=== PROBE ===');
console.log(JSON.stringify({ allScriptsCount: probe.allScriptsCount, productLineScripts: probe.productLineScripts, pluginKeys: probe.pluginKeys, hasPLI: probe.hasPLI }, null, 2));

await browser.close();
