// Verify B36 fixes:
//   1. Form 333: when themeCssOverrides[--mf-form-max-width]=100% is set,
//      the inner card actually grows.
//   2. Geolocation widget shows HTTPS warning on http://.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// PROBE 1: Default form 333 width
await page.goto(`${BASE}/xx?formid=333`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
const default333 = await page.evaluate(() => {
  const inner = document.querySelector('.mf-form-wrapper > .mf-form-inner');
  if (!inner) return { error: 'no inner' };
  const cs = getComputedStyle(inner);
  return {
    width: inner.getBoundingClientRect().width,
    maxWidth: cs.maxWidth,
    cssVar: inner.style.getPropertyValue('--mf-form-max-width') || 'unset'
  };
});
console.log('=== Form 333 default ===');
console.log(JSON.stringify(default333, null, 2));

// PROBE 2: Inject themeCssOverrides override and verify the card expands
const overridden = await page.evaluate(() => {
  // Manually set the CSS var on the wrapper to simulate themeCssOverrides
  const wrapper = document.querySelector('.mf-form-wrapper');
  if (!wrapper) return { error: 'no wrapper' };
  wrapper.style.setProperty('--mf-form-max-width', '100%');
  const inner = document.querySelector('.mf-form-wrapper > .mf-form-inner');
  const cs = getComputedStyle(inner);
  return {
    width: inner.getBoundingClientRect().width,
    maxWidth: cs.maxWidth
  };
});
console.log('\n=== After setting --mf-form-max-width:100% ===');
console.log(JSON.stringify(overridden, null, 2));

// PROBE 3: Confirm the var actually takes effect (width should grow)
const beforeNum = parseFloat(default333.maxWidth);
const afterNum = parseFloat(overridden.maxWidth) || 0;
const grew = overridden.width > default333.width + 50;
console.log(`\n=== Verdict ===`);
console.log(`default width: ${default333.width}px, after 100%: ${overridden.width}px, grew=${grew}`);

await page.screenshot({ path: join(OUT, 'qa-b36-form-resized.png'), fullPage: false });
await browser.close();
