// [B65n] Diagnose preset not applying + builder canvas distorted vs runtime.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
const BUILDER = SITE + '/megaform/Home/mfFormId/1270?mfFormId=1270#mf-builder';
const RUNTIME = SITE + '/xx?formid=1270';

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

// ── Builder mode ──
await page.goto(BUILDER, { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(15000);

// Click THEME tab
await page.evaluate(() => {
  const t = document.querySelector('#mf-tab-link-theme');
  if (t) t.click();
});
await page.waitForTimeout(4000);

// Click Nature Green preset
const presetClick = await page.evaluate(() => {
  const tiles = Array.from(document.querySelectorAll('[data-preset]'));
  const ng = tiles.find(t => /nature green/i.test(t.textContent || ''));
  if (ng) { ng.click(); return { ok: true, id: ng.getAttribute('data-preset') }; }
  return { ok: false };
});
await page.waitForTimeout(4500);

await page.screenshot({ path: 'qa-out/b65n-01-builder-preset.png', fullPage: false });

// Capture iframe + canvas state
const builderState = await page.evaluate(() => {
  const iframe = document.querySelector('.mf-theme-preview-frame');
  if (!iframe) return { hasIframe: false };
  const doc = iframe.contentDocument;
  if (!doc) return { hasIframe: true, hasDoc: false };
  const wrap = doc.querySelector('.mf-form-wrapper');
  const form = doc.querySelector('.mf-form');
  const submitBtn = doc.querySelector('button[type="submit"], .mf-submit-btn, .mfp-submit');
  const cs = (el) => el ? getComputedStyle(el) : null;
  const wrapCs = cs(wrap);
  const formCs = cs(form);
  const btnCs = cs(submitBtn);
  return {
    hasIframe: true, hasDoc: true,
    bodyClasses: doc.body.className,
    primaryVar: getComputedStyle(doc.documentElement).getPropertyValue('--mf-primary') || '',
    formBgVar: getComputedStyle(doc.documentElement).getPropertyValue('--mf-form-bg') || '',
    pageBgVar: getComputedStyle(doc.documentElement).getPropertyValue('--mf-page-bg') || '',
    wrapper: wrapCs ? {
      bg: wrapCs.backgroundColor,
      border: wrapCs.borderTopWidth + ' ' + wrapCs.borderTopColor,
      shadow: wrapCs.boxShadow.slice(0, 60),
      padding: wrapCs.padding
    } : null,
    form: formCs ? {
      bg: formCs.backgroundColor,
      padding: formCs.padding
    } : null,
    submitBg: btnCs ? btnCs.backgroundColor : null,
    submitColor: btnCs ? btnCs.color : null,
    submitWidth: submitBtn ? Math.round(submitBtn.getBoundingClientRect().width) : 0,
    bodyHtmlLen: doc.body ? doc.body.innerHTML.length : 0,
    formStructureClasses: Array.from(doc.querySelectorAll('[class*="mf-form"]')).slice(0, 5).map(e => e.className.slice(0, 100))
  };
});

// ── Runtime mode ──
await page.goto(RUNTIME, { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(10000);

await page.screenshot({ path: 'qa-out/b65n-02-runtime.png', fullPage: false });

const runtimeState = await page.evaluate(() => {
  const wrap = document.querySelector('.mf-form-wrapper');
  const form = document.querySelector('.mf-form');
  const submitBtn = document.querySelector('button[type="submit"], .mf-submit-btn');
  const cs = (el) => el ? getComputedStyle(el) : null;
  const wrapCs = cs(wrap);
  const formCs = cs(form);
  const btnCs = cs(submitBtn);
  return {
    bodyClasses: document.body.className,
    primaryVar: getComputedStyle(document.documentElement).getPropertyValue('--mf-primary') || '',
    formBgVar: getComputedStyle(document.documentElement).getPropertyValue('--mf-form-bg') || '',
    pageBgVar: getComputedStyle(document.documentElement).getPropertyValue('--mf-page-bg') || '',
    wrapper: wrapCs ? {
      bg: wrapCs.backgroundColor,
      border: wrapCs.borderTopWidth + ' ' + wrapCs.borderTopColor,
      shadow: wrapCs.boxShadow.slice(0, 60),
      padding: wrapCs.padding
    } : null,
    form: formCs ? {
      bg: formCs.backgroundColor,
      padding: formCs.padding
    } : null,
    submitBg: btnCs ? btnCs.backgroundColor : null,
    submitColor: btnCs ? btnCs.color : null,
    submitWidth: submitBtn ? Math.round(submitBtn.getBoundingClientRect().width) : 0
  };
});

await browser.close();
console.log(JSON.stringify({ presetClick, builderState, runtimeState }, null, 2));
