// Visual-only QA — open Studio synthetic + screenshot
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 90000 });
await page.waitForTimeout(8000);

// Open Studio synthetically
await page.evaluate(() => {
  window.MFRazorStudio.open({
    fieldKey: 'qa_field',
    formId: 326,
    currentProps: {},
    onApplyProps: (np) => { window.__MF_APPLY = np; },
  });
});

// Wait for catalog fetch + tile render
await page.waitForTimeout(3500);

// Visibility check
const probe = await page.evaluate(() => {
  const popup = document.getElementById('mf-razor-studio-popup');
  if (!popup) return { err: 'no popup' };
  const rect = popup.getBoundingClientRect();
  const cs = getComputedStyle(popup);
  return {
    inDom: true,
    offsetW: popup.offsetWidth, offsetH: popup.offsetHeight,
    rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    display: cs.display, vis: cs.visibility, zIndex: cs.zIndex,
    pos: cs.position,
    tileCount: popup.querySelectorAll('.mfrs-rec-tile').length,
  };
});
console.log(JSON.stringify(probe, null, 2));

// Bring popup to top — body might have a competing z-index
await page.evaluate(() => {
  const p = document.getElementById('mf-razor-studio-popup');
  if (p) { p.style.zIndex = '2147483647'; p.style.position = 'fixed'; }
});
await page.waitForTimeout(500);

await page.screenshot({ path: join(OUT, 'qa-razor-studio-visible.png'), fullPage: false });

// Click SqlTablePivot tile
await page.evaluate(() => {
  const tile = Array.from(document.querySelectorAll('.mfrs-rec-tile'))
    .find(t => t.querySelector('.mfrs-rec-name')?.textContent === 'SqlTablePivot');
  if (tile) tile.click();
});
await page.waitForTimeout(800);
await page.screenshot({ path: join(OUT, 'qa-razor-studio-pivot.png'), fullPage: false });

// Switch to Advanced
await page.evaluate(() => {
  const tab = Array.from(document.querySelectorAll('.mfrs-tab')).find(t => t.getAttribute('data-tab') === 'advanced');
  if (tab) tab.click();
});
await page.waitForTimeout(700);
await page.screenshot({ path: join(OUT, 'qa-razor-studio-advanced.png'), fullPage: false });

await browser.close();
console.log('OK');
