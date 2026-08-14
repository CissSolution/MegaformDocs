#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const outDir = resolve('qa-out/final/rose-festival-widget');
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
page.setDefaultTimeout(60000);

await page.goto(`http://megaclean008.ai/mfqa-wide?mfFormId=204&roseqa=${Date.now()}`, {
  waitUntil: 'networkidle', timeout: 90000,
});

const scope = page.locator('#dnn_ctr10653_ModuleContent');
const root = scope.locator('.mfp.rose-festival');
await root.waitFor({ state: 'visible' });
const canvas = scope.locator('.rose-section-finish canvas.mf-signature-canvas');
const hidden = scope.locator('.rose-section-finish input[type=hidden][name=signature]');
const clear = scope.locator('.rose-section-finish .mf-sig-clear');
const corners = scope.locator('.rose-card-corner');
const counts = {
  root: await root.count(), canvas: await canvas.count(), hidden: await hidden.count(),
  clear: await clear.count(), corners: await corners.count(),
};
if (counts.root !== 1 || counts.canvas !== 1 || counts.hidden !== 1 || counts.clear !== 1) {
  throw new Error(`Rose widget incomplete: ${JSON.stringify(counts)}`);
}

await page.screenshot({ path: resolve(outDir, 'top-800.png'), fullPage: false });
await canvas.scrollIntoViewIfNeeded();
const box = await canvas.boundingBox();
if (!box) throw new Error('Signature canvas has no bounds');
await page.mouse.move(box.x + 30, box.y + 60);
await page.mouse.down();
await page.mouse.move(box.x + 95, box.y + 25, { steps: 8 });
await page.mouse.move(box.x + 165, box.y + 70, { steps: 8 });
await page.mouse.move(box.x + 240, box.y + 35, { steps: 8 });
await page.mouse.up();
await page.waitForFunction(() => String(document.querySelector('#dnn_ctr10653_ModuleContent input[name=signature]')?.value || '').startsWith('data:image/png;base64,'));
const drawnLength = (await hidden.inputValue()).length;
await page.screenshot({ path: resolve(outDir, 'signature-800.png'), fullPage: false });
await clear.click();
const clearedLength = (await hidden.inputValue()).length;

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await page.evaluate(() => window.scrollTo(0, 0));
const mobile = await root.evaluate((el) => ({
  documentWidth: document.documentElement.scrollWidth,
  viewportWidth: document.documentElement.clientWidth,
  rootWidth: el.getBoundingClientRect().width,
  cardWidth: el.querySelector('.rose-card')?.getBoundingClientRect().width || 0,
}));
await page.screenshot({ path: resolve(outDir, 'mobile-390.png'), fullPage: false });

const report = {
  counts, drawnLength, clearedLength, canvas: { width: Math.round(box.width), height: Math.round(box.height) },
  mobile, pass: counts.corners === 0 && drawnLength > 100 && clearedLength === 0
    && mobile.documentWidth <= mobile.viewportWidth,
};
writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(report.pass ? 'PASS' : 'FAIL', report);
await browser.close();
if (!report.pass) process.exitCode = 1;
