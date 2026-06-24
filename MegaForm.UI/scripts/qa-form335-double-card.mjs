// Diagnose double-card on form 335 (Course Registration) in render mode.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/xx?formid=335`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);

// Walk the DOM to find nested cards with bg/shadow/radius
const probe = await page.evaluate(() => {
  function hasCardLook(el) {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    const hasShadow = cs.boxShadow !== 'none';
    const hasRadius = parseFloat(cs.borderTopLeftRadius) > 4;
    const hasBorder = cs.borderTopWidth !== '0px' || cs.borderTopStyle === 'solid';
    const hasPadding = parseFloat(cs.paddingTop) > 8;
    return {
      hasBg, bg,
      hasShadow, shadow: hasShadow ? cs.boxShadow.slice(0, 60) : '',
      hasRadius, radius: cs.borderTopLeftRadius,
      hasBorder, border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
      hasPadding, padding: cs.paddingTop + ' ' + cs.paddingLeft,
      isCard: hasBg && (hasShadow || hasBorder || hasRadius) && hasPadding
    };
  }
  const containers = [];
  // Walk from form-wrapper down into the first input
  const wrapper = document.querySelector('.mf-form-wrapper, .mf-form-shell, [data-mf-form-id]');
  if (!wrapper) return { error: 'no form wrapper' };
  function walk(el, depth) {
    if (!el || depth > 10) return;
    const look = hasCardLook(el);
    if (look.isCard) {
      containers.push({
        depth,
        tag: el.tagName,
        cls: el.className.slice(0, 80),
        ...look,
        rect: { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }
      });
    }
    // Walk first few children
    Array.from(el.children).slice(0, 4).forEach(c => walk(c, depth + 1));
  }
  walk(wrapper, 0);

  // Also check the form-wrapper itself + its first chain of parents
  let cur = wrapper;
  const ancestorCards = [];
  while (cur && cur !== document.body) {
    const look = hasCardLook(cur);
    if (look.isCard) {
      ancestorCards.push({
        tag: cur.tagName,
        cls: cur.className.slice(0, 80),
        ...look
      });
    }
    cur = cur.parentElement;
  }

  // Form attributes
  const form = document.querySelector('.mfp, .mf-form, .mf-form-shell');
  const formAttrs = form ? {
    cls: form.className,
    dataTheme: form.getAttribute('data-mf-theme'),
    dataHasCustomHtml: form.getAttribute('data-mf-has-custom-html')
  } : null;

  return { containers, ancestorCards, formAttrs };
});

console.log('=== DOUBLE-CARD DIAGNOSIS — form 335 ===\n');
console.log('Form attributes:', JSON.stringify(probe.formAttrs, null, 2));
console.log('\nDescendant cards (containers showing bg+shadow+radius+padding):');
(probe.containers || []).forEach((c, i) => {
  console.log(`  [${i}] depth=${c.depth} <${c.tag} class="${c.cls}"> ${c.rect.w}x${c.rect.h}`);
  console.log(`      bg=${c.bg}  shadow=${c.shadow ? 'YES' : 'no'}  radius=${c.radius}  border=${c.border}  padding=${c.padding}`);
});
console.log('\nAncestor cards (between form-wrapper and body):');
(probe.ancestorCards || []).forEach((c, i) => {
  console.log(`  [${i}] <${c.tag} class="${c.cls}">`);
  console.log(`      bg=${c.bg}  shadow=${c.shadow}  radius=${c.radius}`);
});

writeFileSync(join(OUT, 'qa-form335-cards.json'), JSON.stringify(probe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-form335-rendered.png'), fullPage: false });
await browser.close();
