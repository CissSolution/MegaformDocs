// Investigate why Razor Studio popup has rect 0x0 when mounted inside #mf-builder-root
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
  // Open Razor Studio via direct API
  window.MFRazorStudio.open({
    fieldKey: 'qa_razor', formId: 331,
    currentProps: {}, initialTemplate: '',
    onPick: function () {}, onSaveOverride: function () {}, onApplyProps: function () {}
  });
  await new Promise(r => setTimeout(r, 1200));

  const popup = document.getElementById('mf-razor-studio-popup');
  if (!popup) return { error: 'no popup' };
  const popupCS = getComputedStyle(popup);
  const popupRect = popup.getBoundingClientRect();
  const root = document.getElementById('mf-builder-root');
  const rootRect = root ? root.getBoundingClientRect() : null;
  const rootCS = root ? getComputedStyle(root) : null;
  const parent = popup.parentElement;
  const styleEl = document.getElementById('mf-razor-studio-style');
  return {
    popup: {
      parentId: parent ? parent.id : null,
      parentTag: parent ? parent.tagName : null,
      class: popup.className,
      position: popupCS.position,
      inset: popupCS.inset,
      top: popupCS.top, left: popupCS.left, right: popupCS.right, bottom: popupCS.bottom,
      width: popupCS.width, height: popupCS.height,
      display: popupCS.display,
      transform: popupCS.transform,
      rect: { w: popupRect.width, h: popupRect.height, top: popupRect.top, left: popupRect.left }
    },
    root: rootRect ? {
      position: rootCS.position,
      transform: rootCS.transform,
      filter: rootCS.filter,
      willChange: rootCS.willChange,
      perspective: rootCS.perspective,
      contain: rootCS.contain,
      rect: { w: rootRect.width, h: rootRect.height }
    } : null,
    cssInjected: !!styleEl,
    cssLen: styleEl ? styleEl.textContent.length : 0,
    cssHasOverlay: styleEl ? styleEl.textContent.includes('.mfrs-overlay') : false,
    childRect: (() => {
      const child = popup.querySelector('.mfrs-modal');
      if (!child) return null;
      const cr = child.getBoundingClientRect();
      const cs = getComputedStyle(child);
      return { w: cr.width, h: cr.height, display: cs.display, position: cs.position };
    })()
  };
});
console.log(JSON.stringify(probe, null, 2));
await browser.close();
