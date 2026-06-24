// [DoubleCardFix v20260601-B14] Visual QA — open form 325 (Premium Store)
// and verify .mf-form wrapper has no background/shadow/padding when custom
// theme/HTML is active.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// Test form 325 (Premium Store from screenshot 2)
await page.goto(`${BASE}/xx?formid=325`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
await page.waitForTimeout(3000);

const probe = await page.evaluate(() => {
  const wrapper = document.querySelector('.mf-form-wrapper');
  const formCard = document.querySelector('.mf-form');
  if (!wrapper || !formCard) return { found: false };
  const wcs = getComputedStyle(wrapper);
  const fcs = getComputedStyle(formCard);
  return {
    found: true,
    wrapperClass: wrapper.className,
    wrapperHasCustomHtmlAttr: wrapper.hasAttribute('data-mf-has-custom-html'),
    formBg: fcs.backgroundColor,
    formShadow: fcs.boxShadow,
    formRadius: fcs.borderRadius,
    formPadding: fcs.padding,
    wrapperBg: wcs.backgroundColor,
    wrapperPadding: wcs.padding,
  };
});

console.log('=== Form 325 (Premium Store) probe ===');
console.log(JSON.stringify(probe, null, 2));

await page.screenshot({ path: join(OUT, 'qa-b14-form325.png'), fullPage: false });

// Also probe a STANDARD form (form 302 — no custom theme) to confirm we
// did NOT strip the wrapper card for plain forms.
await page.goto(`${BASE}/xx?formid=302`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
await page.waitForTimeout(2000);

const probe2 = await page.evaluate(() => {
  const wrapper = document.querySelector('.mf-form-wrapper');
  const formCard = document.querySelector('.mf-form');
  if (!wrapper || !formCard) return { found: false };
  const fcs = getComputedStyle(formCard);
  return {
    found: true,
    wrapperClass: wrapper.className,
    wrapperHasCustomHtmlAttr: wrapper.hasAttribute('data-mf-has-custom-html'),
    formBg: fcs.backgroundColor,
    formShadow: fcs.boxShadow,
    formRadius: fcs.borderRadius,
    formPadding: fcs.padding,
  };
});

console.log('=== Form 302 (standard / no custom theme) probe ===');
console.log(JSON.stringify(probe2, null, 2));
await page.screenshot({ path: join(OUT, 'qa-b14-form302.png'), fullPage: false });

await browser.close();
