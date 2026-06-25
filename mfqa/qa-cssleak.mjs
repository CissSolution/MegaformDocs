// Visual QA: is the bordered module-dropdown + oversized module title a megaform.css LEAK
// or the page theme? Logs in as host, forces edit mode (?edit=true), then for the module
// title heading + the action-menu toggle reports computed style + EVERY matching CSS rule
// with its source stylesheet (so we can see if megaform.css is the culprit).
import { login, BASE, OUT } from './lib.mjs';
import { chromium } from 'playwright';
import { join } from 'node:path';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
const page = await ctx.newPage();
await login(page);

const target = process.argv[2] || '/mfqa-panes';
await page.goto(`${BASE}${target}?edit=true`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(7000);
await page.screenshot({ path: join(OUT, 'b279-editmode-chrome.png'), fullPage: false });

const report = await page.evaluate(() => {
  // recurse into @media/@container/@supports grouping rules
  function collect(rules, href, el, out) {
    for (const rule of rules) {
      if (rule.cssRules && !rule.selectorText) { collect(rule.cssRules, href, el, out); continue; }
      if (!rule.selectorText) continue;
      for (const s of rule.selectorText.split(',')) {
        const sel = s.trim();
        try { if (el.matches(sel)) { out.push({ src: href, sel, css: rule.style.cssText.slice(0, 160) }); break; } } catch (e) {}
      }
    }
  }
  function matching(el) {
    const out = [];
    for (const sheet of document.styleSheets) {
      const href = (sheet.href || 'inline').split('/').pop().split('?')[0];
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      collect(rules, href, el, out);
    }
    return out;
  }
  function describe(el) {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 80),
      text: (el.textContent || '').trim().slice(0, 40),
      fontSize: cs.fontSize, fontWeight: cs.fontWeight,
      border: cs.borderTopWidth + ' ' + cs.borderStyle + ' ' + cs.borderColor,
      w: Math.round(r.width), h: Math.round(r.height),
      // only rules whose source mentions megaform OR that set font-size/border
      rulesFromMega: matching(el).filter(x => /megaform/i.test(x.src)),
      ruleSetsFontOrBorder: matching(el).filter(x => /font-size|border/i.test(x.css)),
    };
  }

  // find a big module title: any heading not inside a MegaForm form, font-size > 28px
  const heads = [...document.querySelectorAll('h1,h2,h3,h4,.app-pane-name,[class*="title"]')]
    .filter(h => !h.closest('.mf-form-wrapper') && parseFloat(getComputedStyle(h).fontSize) > 24);
  // find the module action toggle (Oqtane ModuleActions): a control with a visible border that opens the menu
  const toggles = [...document.querySelectorAll('button, a.dropdown-toggle, [class*="dropdown"] > button, .app-menu *')]
    .filter(b => {
      if (b.closest('.mf-form-wrapper')) return false;
      const cs = getComputedStyle(b);
      return cs.borderTopWidth !== '0px' && cs.borderStyle !== 'none' && b.getBoundingClientRect().width < 80 && b.getBoundingClientRect().width > 10;
    });

  return {
    pageTheme: document.body.className.slice(0, 120),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    sheets: [...document.styleSheets].map(s => (s.href || 'inline').split('/').pop().split('?')[0]).filter(n => /megaform|theme|bootstrap/i.test(n)).slice(0, 12),
    bigHeadings: heads.slice(0, 3).map(describe),
    borderedToggles: toggles.slice(0, 3).map(describe),
  };
});

console.log(JSON.stringify(report, null, 1));
await ctx.close();
await browser.close();
console.log('done');
