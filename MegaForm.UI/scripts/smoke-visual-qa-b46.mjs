// Smoke test B46 polish fixes: Map layout, Appointment extra line gone, unified heights, height/rows props, label overrides, lighter chrome
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

// Go to runtime form 335 (has Map + Appointment + Phone + Email + Long Text)
await page.goto(`${BASE}/xx?formid=335&_=` + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(10000);

// FIX 1 — Map iframe wrap exists + has Pin badge ABOVE the iframe
console.log('\n=== FIX 1: Map widget layout ===');
const fix1 = await page.evaluate(() => {
  const wrap = document.querySelector('.mfw-map-iframe-wrap, .mf-map-frame-wrap');
  const iframe = wrap ? wrap.querySelector('iframe') : null;
  const pinBadge = document.querySelector('.mfw-map-pin-badge, .mf-map-pin-badge');
  const footer = document.querySelector('.mfw-map-footer, .mf-map-footer');
  return {
    wrapExists: !!wrap,
    wrapOverflow: wrap ? getComputedStyle(wrap).overflow : null,
    iframeWidth: iframe ? iframe.getBoundingClientRect().width : null,
    pinBadgeExists: !!pinBadge,
    footerExists: !!footer,
    badgeAboveWrap: !!(pinBadge && wrap && pinBadge.getBoundingClientRect().top < wrap.getBoundingClientRect().top)
  };
});
console.log(JSON.stringify(fix1, null, 2));

// FIX 2 — Appointment empty strip below input is gone
console.log('\n=== FIX 2: Appointment extra line below input ===');
const fix2 = await page.evaluate(() => {
  const apptWrap = document.querySelector('.mfw-appt');
  if (!apptWrap) return { error: 'no .mfw-appt on this form' };
  const apptRect = apptWrap.getBoundingClientRect();
  const dateBar = apptWrap.querySelector('.mfw-appt-datebar');
  const dateBarRect = dateBar ? dateBar.getBoundingClientRect() : null;
  // Check what's after .mfw-appt-shell inside .mfw-appt
  const afterShell = Array.from(apptWrap.children).filter(c =>
    !c.classList.contains('mfw-appt-shell') && !c.classList.contains('mfw-appt-config') && c.tagName !== 'SCRIPT' && c.tagName !== 'INPUT'
  );
  return {
    apptWrapHeight: Math.round(apptRect.height),
    dateBarHeight: dateBarRect ? Math.round(dateBarRect.height) : null,
    extraTrailingNodes: afterShell.map(n => n.tagName + '.' + (n.className || '').split(' ')[0]).slice(0, 5),
    overflowHeight: dateBarRect ? Math.round(apptRect.height - dateBarRect.height) : null
  };
});
console.log(JSON.stringify(fix2, null, 2));
const fix2Pass = fix2.overflowHeight !== null && fix2.overflowHeight < 50; // <50px slack vs old ~120px wrap

// FIX 3 — All inputs in a row share the same computed height
console.log('\n=== FIX 3: Unified input heights ===');
const fix3 = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('.mf-form input.mf-input, .mf-form input[type="email"], .mf-form input[type="text"], .mf-form .mf-select, .mf-form .mfp-phone-shell, .mf-form .mfw-appt-datebar'));
  const heights = inputs.map(el => Math.round(el.getBoundingClientRect().height));
  const unique = [...new Set(heights)].sort();
  return {
    inputCount: inputs.length,
    distinctHeights: unique,
    allEqual: unique.length === 1,
    closeRange: unique.length > 0 ? unique[unique.length-1] - unique[0] : null
  };
});
console.log(JSON.stringify(fix3, null, 2));
const fix3Pass = fix3.closeRange !== null && fix3.closeRange <= 4; // 4px slack OK

// FIX 5b — Lighter chrome — check .mf-form computed shadow + border
console.log('\n=== FIX 5b: Lighter form chrome ===');
const fix5b = await page.evaluate(() => {
  const form = document.querySelector('.mf-form, .mf-form-wrapper');
  if (!form) return { error: 'no form wrapper' };
  const cs = getComputedStyle(form);
  return {
    boxShadow: cs.boxShadow,
    borderRadius: cs.borderRadius,
    padding: cs.padding,
    chromeAttr: form.getAttribute('data-mf-chrome')
  };
});
console.log(JSON.stringify(fix5b, null, 2));
// Pass if shadow is light (alpha <=0.1) — the old heavy shadow used 0 4px 12px
const fix5bPass = fix5b.boxShadow && /rgba\(0, 0, 0, 0\.(0[0-9]|10)\)/.test(fix5b.boxShadow);

// FIX 4 — Height prop available + Textarea rows wired (this needs Builder mode)
console.log('\n=== FIX 4: Height + Rows props in Builder ===');
await page.goto(`${BASE}/xx?mfFormId=335#mf-builder&_=` + Date.now(), { waitUntil: 'commit', timeout: 60000 });
await page.waitForTimeout(10000);
const fix4 = await page.evaluate(() => {
  const heightInput = document.querySelector('#mf-prop-height');
  const rowsInput = document.querySelector('#mf-prop-rows');
  return {
    heightInputExists: !!heightInput,
    rowsInputExists: !!rowsInput
  };
});
console.log(JSON.stringify(fix4, null, 2));
const fix4Pass = fix4.heightInputExists && fix4.rowsInputExists;

await page.screenshot({ path: join(OUT, 'qa-b46-final.png'), fullPage: false });

console.log('\n=== SUMMARY ===');
const results = {
  fix1MapPass: fix1.wrapExists && fix1.pinBadgeExists,
  fix2ApptPass: fix2Pass,
  fix3UnifiedHeightPass: fix3Pass,
  fix4HeightPropPass: fix4Pass,
  fix5bChromePass: fix5bPass
};
const passes = Object.values(results).filter(Boolean).length;
console.log(`PASS ${passes}/5 — ${JSON.stringify(results)}`);

await browser.close();
