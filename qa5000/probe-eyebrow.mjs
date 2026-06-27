import { launch, login, getForm } from './lib.mjs';
import { chromium } from 'playwright';
// 1) persisted settings
const { browser, page } = await launch(true);
await login(page);
const f = await getForm(page, 13);
const s = JSON.parse(f.settingsJson || '{}');
console.log('persisted themeCssOverrides:', JSON.stringify(s.themeCssOverrides || {}));
console.log('themeSelector:', JSON.stringify(s.themeSelector || s.ThemeSelector || null).slice(0, 300));
console.log('customScripts keys:', Object.keys(s.customScripts || {}));
await browser.close();

// 2) computed vars on render
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
const p = await ctx.newPage();
await p.goto('http://localhost:5000/api/MegaForm/render/13?ev=' + Date.now(), { waitUntil: 'networkidle', timeout: 45000 });
await p.waitForTimeout(4500);
const vars = await p.evaluate(() => {
  const root = document.querySelector('.mfp.mfp-australia');
  const cs = getComputedStyle(root);
  return {
    auSoft: cs.getPropertyValue('--au-soft').trim(),
    auPrimary: cs.getPropertyValue('--au-primary').trim(),
    auInk: cs.getPropertyValue('--au-ink').trim(),
    primary: cs.getPropertyValue('--primary').trim(),
    accent: cs.getPropertyValue('--accent').trim(),
    rootInline: root.getAttribute('style'),
  };
});
console.log('computed vars on root:', JSON.stringify(vars));
await b.close();
