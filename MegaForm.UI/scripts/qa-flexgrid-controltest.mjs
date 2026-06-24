// Control test: try dragging palette → main canvas (empty area below FlexGrid)
// to verify if Playwright can simulate Sortable.js drag AT ALL. If this works,
// then FlexGrid Sortable has a real bug. If this fails too, the limitation is
// in Playwright's mouse simulation vs Sortable's forceFallback mode.
import { chromium } from 'playwright-core';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 30000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

try { await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(6000);

const before = await page.evaluate(() => ({
  totalFields: window.MegaFormBuilder?.state?.schema?.fields?.length || 0,
}));
console.log('=== BEFORE: total top-level fields ===', JSON.stringify(before));

// Drag Number palette → main canvas area BELOW the FlexGrid
const palLoc    = page.locator('.mf-palette-item[data-type="Number"]').first();
const canvasLoc = page.locator('#mf-fields-container').first();
try {
  await palLoc.dragTo(canvasLoc, { targetPosition: { x: 200, y: 600 }, timeout: 5000 });
} catch (e) { console.log('dragTo err: ' + e.message); }
await page.waitForTimeout(1500);

const after = await page.evaluate(() => ({
  totalFields: window.MegaFormBuilder?.state?.schema?.fields?.length || 0,
}));
console.log('=== AFTER: total top-level fields ===', JSON.stringify(after));
console.log('Δ fields =', after.totalFields - before.totalFields);
await browser.close();
