// [B65d] Verify left panel:
// (a) BASIC mode (default) → dark navy bg (NOT white)
// (b) THEME mode → white bg (B64 scope intent)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

// Open builder form 1264 (Blog Publishing Starter from user's screenshot)
await page.goto(SITE + '/xx?mfFormId=1264#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(14000);

await page.screenshot({ path: 'qa-out/b65d-01-basic-mode.png', fullPage: false });

// (a) BASIC mode — measure left panel bg
const basicMode = await page.evaluate(() => {
  const panel = document.querySelector('#mf-panel-left, .mf-panel-left');
  if (!panel) return { ok: false };
  const cs = getComputedStyle(panel);
  const bodyClasses = document.body.className;
  // Also check first palette item visible
  const tile = document.querySelector('.mf-palette-item');
  const tileCs = tile ? getComputedStyle(tile) : null;
  return {
    ok: true,
    bodyClasses,
    panelBg: cs.backgroundColor,
    panelColor: cs.color,
    panelWidth: panel.getBoundingClientRect().width,
    tileBg: tileCs ? tileCs.backgroundColor : null
  };
});

// Click THEME tab
await page.evaluate(() => {
  const t = document.querySelector('#mf-tab-link-theme');
  if (t) t.click();
});
await page.waitForTimeout(4500);

await page.screenshot({ path: 'qa-out/b65d-02-theme-mode.png', fullPage: false });

const themeMode = await page.evaluate(() => {
  const panel = document.querySelector('#mf-panel-left, .mf-panel-left');
  if (!panel) return { ok: false };
  const cs = getComputedStyle(panel);
  return {
    ok: true,
    bodyClasses: document.body.className,
    panelBg: cs.backgroundColor,
    panelColor: cs.color
  };
});

await browser.close();

const result = { basicMode, themeMode };
console.log(JSON.stringify(result, null, 2));
