// Razor Studio canvas-button click only — no token interactions
import { chromium } from 'playwright-core';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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

const probe = await page.evaluate(async () => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Razor Studio'));
  if (!btn) return { error: 'no btn' };
  btn.click();
  await new Promise(r => setTimeout(r, 1800));
  const popup = document.getElementById('mf-razor-studio-popup');
  if (!popup) return { error: 'no popup' };
  const rect = popup.getBoundingClientRect();
  const cs = getComputedStyle(popup);
  const parent = popup.parentElement;
  const parentCS = parent ? getComputedStyle(parent) : null;
  const parentRect = parent ? parent.getBoundingClientRect() : null;
  return {
    popup: {
      rect: { w: rect.width, h: rect.height, top: rect.top, left: rect.left },
      cs: { position: cs.position, top: cs.top, left: cs.left, right: cs.right, bottom: cs.bottom, width: cs.width, height: cs.height, display: cs.display, zIndex: cs.zIndex }
    },
    parent: parent ? {
      id: parent.id,
      tag: parent.tagName,
      cs: { position: parentCS.position, display: parentCS.display, transform: parentCS.transform, width: parentCS.width, height: parentCS.height },
      rect: { w: parentRect.width, h: parentRect.height }
    } : null,
    bodyClass: document.body.className,
    builderRootExists: !!document.getElementById('mf-builder-root'),
    builderRootDisplay: document.getElementById('mf-builder-root') ? getComputedStyle(document.getElementById('mf-builder-root')).display : null,
    inlineStyle: popup.style.cssText,
    classList: popup.className
  };
});
console.log(JSON.stringify(probe, null, 2));
await browser.close();
