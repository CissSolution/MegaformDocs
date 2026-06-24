// [FlexGrid P6 QA] Convert Row → FlexGrid migration.
//  - Form 327 has 2 Row fields (top: 3-col Name/Email/Phone, stack: 2-col Country+City / Address)
//  - Click the new "Convert to FlexGrid" button (.mf-row-to-flexgrid)
//  - Confirm dialog automatically accepted
//  - Verify schema after: 2 FlexGrid containers with mapped items
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// Auto-accept the confirm() prompt
page.on('dialog', async dialog => { await dialog.accept(); });

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 30000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

try { await page.goto(`${BASE}/xx?mfFormId=327#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=327#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(6000);

const before = await page.evaluate(() => {
  return {
    rowCount: document.querySelectorAll('.mf-canvas-row').length,
    flexGridCount: document.querySelectorAll('.mf-canvas-flexgrid').length,
    hasConvertBtn: !!document.querySelector('.mf-row-to-flexgrid'),
  };
});
console.log('=== BEFORE migration ===');
console.log(JSON.stringify(before, null, 2));
await page.screenshot({ path: join(OUT, 'qa-flexgrid-p6-01-before.png'), fullPage: false });

// Click the FIRST convert button (header_row)
await page.click('.mf-row-to-flexgrid');
await page.waitForTimeout(800);

const after1 = await page.evaluate(() => {
  const fgs = Array.from(document.querySelectorAll('.mf-canvas-flexgrid'));
  return {
    rowCount: document.querySelectorAll('.mf-canvas-row').length,
    flexGridCount: fgs.length,
    fgItemCounts: fgs.map(fg => fg.querySelectorAll('.mf-flexgrid-item').length),
  };
});
console.log('=== AFTER 1st row converted ===');
console.log(JSON.stringify(after1, null, 2));
await page.screenshot({ path: join(OUT, 'qa-flexgrid-p6-02-after1.png'), fullPage: false });

// Convert the second row too
await page.click('.mf-row-to-flexgrid');
await page.waitForTimeout(800);

const after2 = await page.evaluate(() => {
  const fgs = Array.from(document.querySelectorAll('.mf-canvas-flexgrid'));
  return {
    rowCount: document.querySelectorAll('.mf-canvas-row').length,
    flexGridCount: fgs.length,
    fgItemCounts: fgs.map(fg => fg.querySelectorAll('.mf-flexgrid-item').length),
    // Sample first flexgrid item placements
    firstFgItemsPlacement: Array.from(fgs[0]?.querySelectorAll('.mf-flexgrid-item') || []).map(c => ({
      x: c.style.getPropertyValue('--lg-x'),
      y: c.style.getPropertyValue('--lg-y'),
      w: c.style.getPropertyValue('--lg-w'),
      label: c.querySelector('.mf-flexgrid-item-label span')?.textContent || '',
    })),
  };
});
console.log('=== AFTER both rows converted ===');
console.log(JSON.stringify(after2, null, 2));
await page.screenshot({ path: join(OUT, 'qa-flexgrid-p6-03-after2.png'), fullPage: false });

await browser.close();
