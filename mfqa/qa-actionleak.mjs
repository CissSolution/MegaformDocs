// Confirm the .app-moduleactions .dropdown-toggle leak from Index.razor's edit-mode <style>,
// and map the DOM so we can find a MODULE-SCOPED selector to fix it.
import { login, BASE, OUT } from './lib.mjs';
import { chromium } from 'playwright';
import { join } from 'node:path';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
const page = await ctx.newPage();
await login(page);
await page.goto(`${BASE}/mfqa-panes?edit=true`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(7000);
await page.screenshot({ path: join(OUT, 'b280-actionleak.png'), fullPage: false });

const out = await page.evaluate(() => {
  // how many copies of the leaking <style> got injected?
  const styleHits = [...document.querySelectorAll('style')].filter(s => /app-moduleactions .dropdown-toggle/.test(s.textContent)).length;

  const toggles = [...document.querySelectorAll('.app-moduleactions .dropdown-toggle')];
  const rows = toggles.map(t => {
    const cs = getComputedStyle(t);
    // climb ancestors, note classes/ids, and whether this module's content has a MegaForm form
    const chain = [];
    let el = t, hasMega = false, moduleHook = null;
    for (let i = 0; i < 12 && el; i++) {
      const cls = (el.className || '').toString();
      const id = el.id || '';
      if (/megaform|mf-form-wrapper|mfp/i.test(cls)) hasMega = true;
      // candidate scoping hooks Oqtane/themes put on the module container
      if (!moduleHook && /app-pane-module|app-module|container-|moduleid|id="?Module/i.test(cls + ' ' + id)) moduleHook = (id ? '#' + id : '') + (cls ? '.' + cls.trim().split(/\s+/).join('.') : '');
      chain.push((id ? '#' + id : '') + (cls ? '.' + cls.trim().split(/\s+/).slice(0, 3).join('.') : el.tagName.toLowerCase()));
      el = el.parentElement;
    }
    // does this toggle's MODULE CONTAINER also contain a megaform form? (via :has-like manual check)
    let container = t.closest('[class*="app-pane-module"], [class*="app-module"], [class*="container-"], [id^="Module"]') || t.parentElement?.parentElement;
    const containerHasMega = container ? !!container.querySelector('.mf-form-wrapper, .megaform-module, .mfp') : null;
    return {
      border: cs.borderTopWidth + ' ' + cs.borderStyle.split(' ')[0],
      radius: cs.borderRadius, bg: cs.backgroundColor, boxShadow: cs.boxShadow.slice(0, 30),
      minW: cs.minWidth, minH: cs.minHeight,
      containerHasMega,
      containerSel: container ? ((container.id ? '#' + container.id : '') + '.' + (container.className||'').toString().trim().split(/\s+/).slice(0,3).join('.')) : null,
      chain: chain.join('  >  '),
    };
  });
  return { styleHits, toggleCount: toggles.length, rows };
});
console.log(JSON.stringify(out, null, 1));
await ctx.close(); await browser.close();
