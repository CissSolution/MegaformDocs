// After-fix verification: only MegaForm module toggles keep the box; others are native.
import { login, BASE, OUT } from './lib.mjs';
import { chromium } from 'playwright';
import { join } from 'node:path';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
const page = await ctx.newPage();
await login(page);
await page.goto(`${BASE}/mfqa-panes?edit=true`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(7000);
await page.screenshot({ path: join(OUT, 'b281-leak-fixed.png'), fullPage: false });

const out = await page.evaluate(() => {
  const MEGA = '.mf-form-wrapper, .mf-oq-admin-dock, .megaform-module';
  const toggles = [...document.querySelectorAll('.app-moduleactions .dropdown-toggle')];
  const rows = toggles.map(t => {
    const cs = getComputedStyle(t);
    const border = t.closest('.app-pane-admin-border');
    const isMega = border ? !!border.querySelector(MEGA) : null;
    const hasBox = cs.borderTopWidth === '1px' && cs.borderTopStyle === 'solid' && cs.borderTopColor === 'rgb(203, 213, 225)';
    return { isMega, hasBox, border: cs.borderTopWidth + ' ' + cs.borderTopStyle, radius: cs.borderRadius, bg: cs.backgroundColor };
  });
  const megaWithBox = rows.filter(r => r.isMega && r.hasBox).length;
  const nonMegaWithBox = rows.filter(r => !r.isMega && r.hasBox).length;
  return { total: toggles.length, megaWithBox, nonMegaWithBox_SHOULD_BE_0: nonMegaWithBox, rows };
});
console.log(JSON.stringify(out, null, 1));
await ctx.close(); await browser.close();
