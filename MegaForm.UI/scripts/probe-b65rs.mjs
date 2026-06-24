// [B65r+s] Verify Terms & Privacy widget palette tile + QR logo fix is in bundle.
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

await page.goto(SITE + '/megaform/Home/mfFormId/1270?mfFormId=1270#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(15000);

// Switch to WIDGETS tab + look for Terms & Privacy tile
await page.evaluate(() => {
  const wTab = document.querySelector('.mf-ptab[data-tab="widgets"]');
  if (wTab) wTab.click();
});
await page.waitForTimeout(800);

const paletteCheck = await page.evaluate(() => {
  const tiles = Array.from(document.querySelectorAll('.mf-palette-item'));
  const termsTiles = tiles.filter(t => /terms.*privacy/i.test(t.textContent || ''));
  const qrTiles = tiles.filter(t => /qr code/i.test(t.textContent || ''));
  return {
    totalTiles: tiles.length,
    termsTiles: termsTiles.map(t => ({
      label: (t.textContent || '').trim().slice(0, 40),
      dataType: t.getAttribute('data-type') || t.getAttribute('data-widget') || ''
    })),
    qrTiles: qrTiles.map(t => ({
      label: (t.textContent || '').trim().slice(0, 30),
      dataType: t.getAttribute('data-type') || t.getAttribute('data-widget') || ''
    }))
  };
});

await page.screenshot({ path: 'qa-out/b65rs-palette.png', fullPage: false });

await browser.close();
console.log(JSON.stringify(paletteCheck, null, 2));
