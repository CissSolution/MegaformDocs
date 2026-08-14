#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const cases = [
  { slug: 'botanical-thankyou', formId: 186, root: '.mfp-botanical-thankyou', height: 96 },
  { slug: 'massage-bodychart-terracotta', formId: 129, root: '.mfp-mbc', height: 88 },
  { slug: 'realestate-registration', formId: 187, root: '.mfp-realestate-registration', height: 92 },
];
const outDir = resolve('qa-out/final/gallery-signature-audit');
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const item of cases) {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    page.setDefaultTimeout(60000);
    await page.goto(`http://megaclean008.ai/mfqa-wide?mfFormId=${item.formId}&sigqa=${Date.now()}`, {
      waitUntil: 'networkidle', timeout: 90000,
    });
    const root = page.locator(item.root);
    await root.waitFor({ state: 'visible' });
    const canvas = root.locator('canvas.mf-signature-canvas');
    const hidden = root.locator('input[type=hidden][name=signature]');
    const clear = root.locator('.mf-sig-clear');
    const counts = {
      root: await root.count(), canvas: await canvas.count(), hidden: await hidden.count(), clear: await clear.count(),
    };
    if (counts.root !== 1 || counts.canvas !== 1 || counts.hidden !== 1 || counts.clear !== 1) {
      throw new Error(`${item.slug}: incomplete widget ${JSON.stringify(counts)}`);
    }

    await page.screenshot({ path: resolve(outDir, `${item.slug}-top.png`), fullPage: false });
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    if (!box) throw new Error(`${item.slug}: canvas has no bounds`);
    await page.mouse.move(box.x + box.width * .16, box.y + box.height * .62);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .34, box.y + box.height * .25, { steps: 8 });
    await page.mouse.move(box.x + box.width * .52, box.y + box.height * .70, { steps: 8 });
    await page.mouse.move(box.x + box.width * .76, box.y + box.height * .32, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction((rootSelector) => {
      const input = document.querySelector(`${rootSelector} input[type=hidden][name=signature]`);
      return String(input?.value || '').startsWith('data:image/png;base64,');
    }, item.root);
    const drawnLength = (await hidden.inputValue()).length;
    await page.screenshot({ path: resolve(outDir, `${item.slug}-signature.png`), fullPage: false });
    await clear.click();
    const clearedLength = (await hidden.inputValue()).length;

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    await page.evaluate(() => window.scrollTo(0, 0));
    const mobile = await root.evaluate((element) => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      rootWidth: element.getBoundingClientRect().width,
    }));
    await page.screenshot({ path: resolve(outDir, `${item.slug}-mobile.png`), fullPage: false });
    const result = {
      ...item, counts, canvas: { width: Math.round(box.width), height: Math.round(box.height) },
      drawnLength, clearedLength, mobile,
      pass: drawnLength > 100 && clearedLength === 0
        && Math.abs(box.height - item.height) <= 2
        && mobile.documentWidth <= mobile.viewportWidth,
    };
    results.push(result);
    console.log(`${item.slug}: ${result.pass ? 'PASS' : 'FAIL'}`, result);
    await page.close();
  }
} finally {
  await browser.close();
}

writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(results, null, 2));
if (results.some((result) => !result.pass)) process.exitCode = 1;
