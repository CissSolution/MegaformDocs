// Pin down the EXACT source of the per-module ▾ ModuleActions border + the module-title size.
import { login, BASE, OUT } from './lib.mjs';
import { chromium } from 'playwright';
import { join } from 'node:path';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
const page = await ctx.newPage();
await login(page);
await page.goto(`${BASE}/mfqa-panes?edit=true`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(7000);

const out = await page.evaluate(() => {
  function collect(rules, href, el, acc) {
    for (const rule of rules) {
      if (rule.cssRules && !rule.selectorText) { collect(rule.cssRules, href, el, acc); continue; }
      if (!rule.selectorText) continue;
      for (const s of rule.selectorText.split(',')) {
        const sel = s.trim();
        try { if (el.matches(sel) && (/border|background|font-size|width|height|padding/i.test(rule.style.cssText))) { acc.push({ src: href, sel, css: rule.style.cssText.slice(0, 120) }); break; } } catch (e) {}
      }
    }
  }
  function rules(el) {
    const acc = [];
    for (const sheet of document.styleSheets) {
      const href = (sheet.href || 'inline').split('/').pop().split('?')[0];
      let r; try { r = sheet.cssRules; } catch (e) { continue; }
      collect(r, href, el, acc);
    }
    return acc;
  }
  const desc = el => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 60),
      border: cs.borderTopWidth + ' ' + cs.borderStyle.split(' ')[0] + ' ' + cs.borderTopColor,
      bg: cs.backgroundColor, borderRadius: cs.borderRadius,
      megaRules: rules(el).filter(x => /megaform/i.test(x.src)),
      allRules: rules(el).slice(0, 8) };
  };
  // The ▾ menu trigger: Oqtane ModuleActions. Try common containers.
  const menu = document.querySelector('.app-menu') || document.querySelector('[class*="app-menu"]');
  const toggle = menu ? (menu.querySelector('button, a, .dropdown-toggle') || menu.firstElementChild) : null;
  const title = document.querySelector('.app-moduletitle');
  return {
    activeTheme: [...document.styleSheets].map(s => (s.href||'').split('/').pop().split('?')[0]).filter(n=>/Theme|theme/.test(n)),
    menuContainer: desc(menu),
    menuToggle: desc(toggle),
    moduleTitle: title ? { fontSize: getComputedStyle(title).fontSize, megaRules: desc(title).megaRules,
      bsRule: desc(title).allRules.filter(x=>/font-size/.test(x.css)) } : null,
  };
});
console.log(JSON.stringify(out, null, 1));
await ctx.close(); await browser.close();
