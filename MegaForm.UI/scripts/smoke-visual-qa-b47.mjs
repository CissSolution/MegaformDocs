// Smoke test B47 canonical design — verify computed styles on real form
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.clearCookies();
const page = await ctx.newPage();

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(4000);

await page.goto(`${BASE}/xx?formid=335&_=` + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(10000);

const probe = await page.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const txt = document.querySelector('.mf-input, input.mf-input, input[type="text"]');
  const phone = document.querySelector('.mfp-phone-shell');
  const phoneBtn = document.querySelector('.mfp-phone-country-trigger, .mfp-phone-country-btn');
  const phoneInput = document.querySelector('.mfp-phone-input');
  const textarea = document.querySelector('.mf-textarea, textarea.mf-textarea');
  const cssTokens = {
    height: root.getPropertyValue('--mf-input-height').trim(),
    borderColor: root.getPropertyValue('--mf-input-border-color').trim(),
    focusColor: root.getPropertyValue('--mf-input-focus-color').trim(),
    focusRing: root.getPropertyValue('--mf-input-focus-ring').trim(),
    transition: root.getPropertyValue('--mf-input-transition').trim(),
    chipRadius: root.getPropertyValue('--mf-chip-radius').trim()
  };
  return {
    cssTokens,
    txtHeight: txt ? Math.round(txt.getBoundingClientRect().height) : null,
    phoneShellRect: phone ? {
      h: Math.round(phone.getBoundingClientRect().height),
      borderRadius: getComputedStyle(phone).borderRadius,
      display: getComputedStyle(phone).display,
      overflow: getComputedStyle(phone).overflow,
      hasOneBorder: getComputedStyle(phone).border !== '0px none rgb(0, 0, 0)'
    } : null,
    phoneBtnRect: phoneBtn ? {
      h: Math.round(phoneBtn.getBoundingClientRect().height),
      borderRight: getComputedStyle(phoneBtn).borderRight
    } : null,
    phoneInputRect: phoneInput ? {
      h: Math.round(phoneInput.getBoundingClientRect().height),
      borderLeft: getComputedStyle(phoneInput).borderLeft
    } : null,
    textareaResize: textarea ? getComputedStyle(textarea).resize : null,
    textareaMinH: textarea ? getComputedStyle(textarea).minHeight : null,
    phoneVsInput: txt && phone ? Math.abs(Math.round(txt.getBoundingClientRect().height) - Math.round(phone.getBoundingClientRect().height)) : null
  };
});
console.log(JSON.stringify(probe, null, 2));

console.log('\n=== VERDICT ===');
const r = probe;
const pass = {
  hasCanonicalTokens: r.cssTokens.borderColor === '#e2e8f0' && r.cssTokens.focusColor === '#2563eb',
  phoneSingleWrap: r.phoneShellRect ? r.phoneShellRect.display === 'flex' && r.phoneShellRect.overflow === 'hidden' && r.phoneShellRect.hasOneBorder : false,
  phoneInputBorderless: r.phoneInputRect ? r.phoneInputRect.borderLeft === '0px none rgb(0, 0, 0)' || r.phoneInputRect.borderLeft.startsWith('0px') : false,
  phoneHeightMatchesInput: r.phoneVsInput !== null && r.phoneVsInput <= 4,
  textareaResizeOn: r.textareaResize === 'vertical',
  textareaMinH100: r.textareaMinH === '100px'
};
console.log(JSON.stringify(pass, null, 2));
const passes = Object.values(pass).filter(Boolean).length;
console.log(`PASS ${passes}/6`);

await browser.close();
