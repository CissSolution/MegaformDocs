// [B24 QA] Verify field widget preview renders inside FlexGrid cells.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

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

const probe = await page.evaluate(() => {
  const cells = Array.from(document.querySelectorAll('.mf-canvas-flexgrid .mf-flexgrid-item'));
  return {
    cellCount: cells.length,
    cellsHavePreview: cells.every(c => !!c.querySelector('.mf-flexgrid-item-preview')),
    cellsHaveGrip:    cells.every(c => !!c.querySelector('.mf-flexgrid-item-grip')),
    firstCellHTML: (cells[0]?.innerHTML || '').slice(0, 500),
    previewSnippets: cells.slice(0, 8).map(c => ({
      label: (c.querySelector('.mf-field-preview-label .mf-inline-label-text')?.textContent || '').trim(),
      hasInput: !!c.querySelector('.mf-field-preview-input'),
    })),
  };
});

console.log(JSON.stringify(probe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-flexgrid-b24-preview.png'), fullPage: false });
await browser.close();
