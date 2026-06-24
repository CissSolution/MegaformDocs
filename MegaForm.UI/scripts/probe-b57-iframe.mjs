import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(5000);

await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=333#mf-builder', { waitUntil: 'commit', timeout: 60000 });
await page.waitForTimeout(12000);

// Click THEME tab
await page.evaluate(() => {
  const t = document.querySelector('#mf-tab-link-theme, .mf-right-tab[data-tab="theme"]');
  if (t) t.click();
});
await page.waitForTimeout(3000);

const result = await page.evaluate(() => {
  const iframe = document.querySelector('iframe.mf-theme-preview-frame, iframe#mf-builder-preview-frame');
  if (!iframe) return { iframeExists: false };
  const srcdoc = iframe.srcdoc || '';
  const doc = iframe.contentDocument;
  let bodyContent = '';
  let assetUrls = [];
  let schemaSnippet = '';
  let rendererLoaded = false;
  if (doc) {
    bodyContent = doc.body ? (doc.body.innerHTML || '').slice(0, 1000) : 'no body';
    Array.from(doc.querySelectorAll('link[href]')).forEach(l => assetUrls.push('LINK: ' + l.getAttribute('href')));
    Array.from(doc.querySelectorAll('script[src]')).forEach(s => assetUrls.push('SCRIPT: ' + s.getAttribute('src')));
    try {
      const cfg = iframe.contentWindow && iframe.contentWindow.__CFG;
      if (cfg && cfg.schema) schemaSnippet = JSON.stringify(cfg.schema).slice(0, 500);
    } catch (_) { schemaSnippet = '(blocked or undefined)'; }
    try { rendererLoaded = !!(iframe.contentWindow && iframe.contentWindow.MegaFormRenderer); } catch (_) { rendererLoaded = false; }
  }
  return {
    iframeExists: true,
    srcdocStarts: srcdoc.slice(0, 2000) + '\n...TAIL...\n' + srcdoc.slice(-1500),
    iframeBodyContent: bodyContent,
    assetUrls,
    schemaJsonSnippet: schemaSnippet,
    rendererLoaded
  };
});

console.log(JSON.stringify(result, null, 2));
console.log('=== CONSOLE ERRORS ===');
consoleErrors.forEach(e => console.log(e));
await browser.close();
