// [B65v+w] Verify token-into-editor + Display Style section
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

await page.goto(SITE + '/megaform/Home/mfFormId/1264?mfFormId=1264#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(15000);

// Open Form Settings accordion
await page.evaluate(() => {
  const fieldTab = document.querySelector('#mf-tab-link-field');
  if (fieldTab) fieldTab.click();
});
await page.waitForTimeout(800);
await page.evaluate(() => {
  const head = document.querySelector('[data-mf-design-toggle="settings"]');
  if (head) head.click();
});
await page.waitForTimeout(2500);

const styleCheck = await page.evaluate(() => ({
  hasFormRadius: !!document.getElementById('mf-setting-form-radius'),
  hasInputRadius: !!document.getElementById('mf-setting-input-radius'),
  hasFormShadow: !!document.getElementById('mf-setting-form-shadow'),
  hasFormBorder: !!document.getElementById('mf-setting-form-border'),
  radiusOptions: (() => {
    const sel = document.getElementById('mf-setting-form-radius');
    return sel ? Array.from(sel.options).map(o => o.value) : [];
  })()
}));

// Test radius change → class applied to wrapper
const radiusApplied = await page.evaluate(() => {
  const sel = document.getElementById('mf-setting-form-radius');
  if (!sel) return null;
  sel.value = 'pill';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return null;
});
await page.waitForTimeout(1200);

const wrapperClass = await page.evaluate(() => {
  const iframe = document.querySelector('.mf-theme-preview-frame');
  if (iframe && iframe.contentDocument) {
    const w = iframe.contentDocument.querySelector('.mf-form-wrapper');
    return w ? w.className : null;
  }
  const w2 = document.querySelector('.mf-form-wrapper');
  return w2 ? w2.className : null;
});

// Token chip test — focus the HTML editor area + click a token
const tokenTest = await page.evaluate(() => {
  const area = document.querySelector('.mf-html-editor-area');
  if (!area) return { ok: false, reason: 'no editor area' };
  area.focus();
  // Move caret to end
  const range = document.createRange();
  range.selectNodeContents(area);
  range.collapse(false);
  const sel = window.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  // Find a token chip
  const chip = document.querySelector('.mf-ps-token, [data-mf-token], [data-token]');
  if (!chip) return { ok: false, reason: 'no token chip' };
  const beforeHTML = area.innerHTML;
  chip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  chip.click();
  return {
    ok: true,
    chipText: (chip.textContent || '').trim().slice(0, 30),
    chipDataToken: chip.getAttribute('data-token') || chip.getAttribute('data-mf-token') || '',
    beforeHTML: beforeHTML.slice(0, 100),
    afterHTML: area.innerHTML.slice(0, 200)
  };
});

await page.screenshot({ path: 'qa-out/b65vw-style-section.png', fullPage: false });
await browser.close();
console.log(JSON.stringify({ styleCheck, wrapperClass, tokenTest }, null, 2));
