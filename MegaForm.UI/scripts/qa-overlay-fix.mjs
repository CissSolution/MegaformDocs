// [B30 QA] Verify the takeover no longer hides our designer popups.
// Real visibility check: rect width > 0 AND visibility != hidden AND opacity > 0.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.clearCookies();
const page = await ctx.newPage();

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

try { await page.goto(`${BASE}/xx?mfFormId=331#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=331#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(12000);

// HTML tab
await page.evaluate(() => {
  const tab = document.querySelector('#mf-tab-link-html, a.mf-right-tab[data-tab="html"]');
  if (tab) tab.click();
});
await page.waitForTimeout(1200);

// Click Token Designer
const tokenProbe = await page.evaluate(async () => {
  document.getElementById('mf-open-token-designer')?.click();
  await new Promise(r => setTimeout(r, 800));
  const modal = document.getElementById('mf-token-designer-modal');
  if (!modal) return { opened: false };
  const rect = modal.getBoundingClientRect();
  const cs = getComputedStyle(modal);
  return {
    opened: true,
    inDOM: true,
    rect: { w: rect.width, h: rect.height, top: rect.top, left: rect.left },
    visible: rect.width > 100 && rect.height > 100 && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0,
    hasOverlayAttr: modal.hasAttribute('data-mf-overlay'),
    overlayVal: modal.getAttribute('data-mf-overlay'),
    inlineDisplay: modal.style.display,
    computedDisplay: cs.display,
    computedVisibility: cs.visibility,
    computedOpacity: cs.opacity,
    computedZIndex: cs.zIndex
  };
});
console.log('=== Token Designer ===');
console.log(JSON.stringify(tokenProbe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-b30-token.png'), fullPage: false });

await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// Click Razor Studio
const razorProbe = await page.evaluate(async () => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Razor Studio'));
  if (!btn) return { opened: false, error: 'no btn' };
  btn.click();
  await new Promise(r => setTimeout(r, 1800));
  const popup = document.getElementById('mf-razor-studio-popup');
  if (!popup) return { opened: false, error: 'no popup' };
  const rect = popup.getBoundingClientRect();
  const cs = getComputedStyle(popup);
  return {
    opened: true,
    rect: { w: rect.width, h: rect.height, top: rect.top, left: rect.left },
    visible: rect.width > 100 && rect.height > 100 && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0,
    hasOverlayAttr: popup.hasAttribute('data-mf-overlay'),
    computedDisplay: cs.display,
    computedVisibility: cs.visibility,
    computedOpacity: cs.opacity,
    parentId: popup.parentElement ? popup.parentElement.id : null,
    parentTag: popup.parentElement ? popup.parentElement.tagName : null,
    cssInjected: !!document.getElementById('mf-razor-studio-style'),
    cssLen: document.getElementById('mf-razor-studio-style')?.textContent.length || 0,
    inlineStyle: popup.style.cssText
  };
});
console.log('\n=== Razor Studio ===');
console.log(JSON.stringify(razorProbe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-b30-razor.png'), fullPage: false });

await browser.close();
