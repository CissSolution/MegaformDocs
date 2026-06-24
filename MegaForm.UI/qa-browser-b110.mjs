import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = 'E:/MENU SPECS/tmp-qa-b110';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: false, slowMo: 50 });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

await page.goto('http://localhost:5005/?mfpanel=builder&formId=4', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(4000);

await page.screenshot({ path: path.join(outDir, 'browser-01-initial.png'), fullPage: false });

const hasCanvas = await page.locator('#mf-canvas-dropzone').count() > 0;
console.log('Has canvas:', hasCanvas);

if (hasCanvas) {
  // Collapse left
  await page.locator('#mf-left-collapse-btn').click().catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, 'browser-02-left-collapsed.png'), fullPage: false });

  // Expand left, collapse right
  await page.locator('#mf-left-open-btn').click().catch(() => {});
  await page.waitForTimeout(500);
  await page.locator('#mf-right-collapse-btn').click().catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, 'browser-03-right-collapsed.png'), fullPage: false });

  // Expand right
  await page.locator('#mf-right-open-btn').click().catch(() => {});
  await page.waitForTimeout(500);

  // Hover top-level field
  const topFields = await page.locator('#mf-canvas-dropzone > .mf-canvas-item.mf-canvas-field:not(.mf-row-field)').all();
  if (topFields.length > 0) {
    await topFields[0].hover();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, 'browser-04-hover-topfield.png'), fullPage: false });
  }

  // Try drag a top-level field
  if (topFields.length > 1) {
    const field = topFields[1];
    const box = await field.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(200);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 80);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, 'browser-05-dragging.png'), fullPage: false });
      await page.mouse.up();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, 'browser-06-after-drop.png'), fullPage: false });
    }
  }
} else {
  console.log('No canvas — possibly login page');
  await page.screenshot({ path: path.join(outDir, 'browser-01-login.png'), fullPage: false });
}

await browser.close();
