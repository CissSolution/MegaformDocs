import { chromium } from 'playwright-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const fourxx = [];
page.on('response', r => {
  if (r.status() >= 400 && (r.url().includes('MegaForm') || r.url().includes('Subform') || r.url().includes('AiAssistant'))) {
    fourxx.push(r.status() + ' ' + r.url().replace('http://dnn10322_megaf.ai', ''));
  }
});
await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([page.waitForLoadState('domcontentloaded', { timeout: 60000 }), page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click()]);
await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=326#mf-builder', { waitUntil: 'commit', timeout: 90000 });
await page.waitForTimeout(8000);
const probe = await page.evaluate(() => ({
  platform: window.__MF_PLATFORM__?.platform,
  apiBase: window.__MF_PLATFORM__?.apiBase,
  builder: !!window.MegaFormBuilder,
  designerLoaded: !!window.MFTokenDesigner,
  razorStudioLoaded: !!window.MFRazorStudio,
  aiAssistantLoaded: !!window.MFAiFormAssistant,
}));
console.log(JSON.stringify(probe, null, 2));
console.log('=== MegaForm-related 4xx ===');
if (!fourxx.length) console.log('  (none)');
else fourxx.forEach(r => console.log('  ' + r));
await browser.close();
