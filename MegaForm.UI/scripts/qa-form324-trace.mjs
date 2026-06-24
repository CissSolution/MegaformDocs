// Trace exactly which element creates the heavy outer card on form 324.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// Login (form 324 is Draft status — needs admin)
await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 30000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

try {
  await page.goto(`${BASE}/xx?formid=324`, { waitUntil: 'commit', timeout: 60000 });
} catch {
  await page.waitForTimeout(2000);
  await page.goto(`${BASE}/xx?formid=324`, { waitUntil: 'commit', timeout: 60000 });
}
await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
await page.waitForTimeout(3500);

const probe = await page.evaluate(() => {
  // First: list ALL elements with form-related class names to find the right wrapper
  const allFormWrappers = Array.from(document.querySelectorAll('[class*="mf-form"], [class*="mfp"], [class*="fr-"]')).slice(0, 8).map(e => ({
    tag: e.tagName.toLowerCase(),
    id: e.id || null,
    className: (e.className || '').toString().slice(0, 120),
  }));
  // Walk every element from .mf-form-wrapper down to .fr-card and capture
  // box-shadow / background / border / padding to find the heavy card source.
  const wrapper = document.querySelector('.mf-form-wrapper');
  if (!wrapper) return { found: false, pageTitle: document.title, url: location.href, allFormWrappers };

  function snapshot(el, label) {
    const cs = getComputedStyle(el);
    return {
      label,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      className: el.className || null,
      bg: cs.backgroundColor,
      shadow: cs.boxShadow,
      radius: cs.borderRadius,
      padding: cs.padding,
      border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
    };
  }

  // Walk down: wrapper → mf-form-inner → mf-form → mf-fields-container → mfp → fr-inv → fr-card → ...
  const path = [];
  path.push(snapshot(wrapper, 'wrapper'));
  let el = wrapper;
  while (el && el.children && el.children.length > 0) {
    el = el.children[0];
    if (!el) break;
    if (path.length > 12) break;  // safety
    path.push(snapshot(el, 'child-' + path.length));
    // stop when we hit a deeply-nested form field
    if (/mf-field|mf-row|mf-fields-container/.test(el.className || '')) {
      if (path.length > 6) break;
    }
  }

  // Also list ALL elements with non-trivial box-shadow (the real "heavy card")
  const heavy = [];
  document.querySelectorAll('.mf-form-wrapper *').forEach(node => {
    const cs = getComputedStyle(node);
    if (cs.boxShadow && cs.boxShadow !== 'none' && !cs.boxShadow.includes('0px 0px')) {
      heavy.push({
        tag: node.tagName.toLowerCase(),
        id: node.id || null,
        className: (node.className || '').toString().slice(0, 100),
        shadow: cs.boxShadow.slice(0, 120),
        bg: cs.backgroundColor,
        radius: cs.borderRadius,
      });
    }
  });

  return {
    found: true,
    wrapperHasCustomHtmlAttr: wrapper.hasAttribute('data-mf-has-custom-html'),
    wrapperClasses: wrapper.className,
    pathDepth: path.length,
    pathSnapshot: path,
    elementsWithShadow: heavy.slice(0, 12),
  };
});

console.log(JSON.stringify(probe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-b14-form324-trace.png'), fullPage: false });
await browser.close();
