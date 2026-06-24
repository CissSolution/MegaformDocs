// [B65h] Verify Form/Save no longer 401 after antiforgery token fallback.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const saveResponses = [];
page.on('response', r => {
  if (r.url().includes('/Form/Save')) {
    saveResponses.push({ url: r.url(), status: r.status() });
  }
});

await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

await page.goto(SITE + '/xx?mfFormId=249#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(15000);

// Check the antiforgery token availability
const sfState = await page.evaluate(() => {
  const MFB = window.MegaFormBuilder;
  const cfg1 = MFB && MFB._config;
  const cfg2 = MFB && MFB.state && MFB.state.config;
  const sf1 = cfg1 && cfg1.servicesFramework;
  const sf2 = cfg2 && cfg2.servicesFramework;
  let token1 = ''; let token2 = '';
  try { token1 = sf1 && typeof sf1.getAntiForgeryValue === 'function' ? sf1.getAntiForgeryValue() : ''; } catch(e) {}
  try { token2 = sf2 && typeof sf2.getAntiForgeryValue === 'function' ? sf2.getAntiForgeryValue() : ''; } catch(e) {}
  const inputs = Array.from(document.getElementsByName('__RequestVerificationToken')).map(i => (i.value || '').slice(0, 30) + '...');
  const cookies = (document.cookie || '').split(';').filter(c => c.includes('Verification')).map(c => c.trim().slice(0, 80));
  return {
    hasMFB: !!MFB,
    hasConfig1: !!cfg1, hasSF1: !!sf1, sf1TokenLen: token1.length,
    hasConfig2: !!cfg2, hasSF2: !!sf2, sf2TokenLen: token2.length,
    sf2TokenPreview: token2.slice(0, 30),
    domInputCount: inputs.length, domInputs: inputs, csrfCookies: cookies,
    websfPresent: !!window.WebSF,
    websfTokenLen: window.WebSF && typeof window.WebSF.getAntiForgeryValue === 'function' ? (window.WebSF.getAntiForgeryValue() || '').length : 0
  };
});

// Find Save button and click
const saveClick = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button, a'));
  const saveBtn = buttons.find(b => /^save$/i.test((b.textContent || '').trim()));
  if (!saveBtn) return { ok: false, reason: 'no Save button' };
  saveBtn.click();
  return { ok: true };
});
await page.waitForTimeout(5000);

await page.screenshot({ path: 'qa-out/b65h-after-save.png', fullPage: false });

await browser.close();
console.log(JSON.stringify({ sfState, saveClick, saveResponses }, null, 2));
