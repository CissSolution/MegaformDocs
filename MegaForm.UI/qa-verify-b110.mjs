import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = 'E:/MENU SPECS/tmp-qa-b110';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

// 1. Open builder page
await page.goto('http://localhost:5005/?mfpanel=builder&formId=4', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

// Screenshot 1: default state
await page.screenshot({ path: path.join(outDir, '01-default.png'), fullPage: false });

// 2. Check if we are on builder (look for canvas dropzone)
const hasCanvas = await page.locator('#mf-canvas-dropzone').count() > 0;
console.log('Has canvas:', hasCanvas);

if (!hasCanvas) {
  // Possibly redirected to login; capture anyway
  await page.screenshot({ path: path.join(outDir, '01-login-redirect.png'), fullPage: false });
  console.log('Redirected or canvas missing. Will use synthetic DOM for CSS checks.');
} else {
  // 3. Collapse left panel
  const leftBtn = page.locator('#mf-left-collapse-btn');
  if (await leftBtn.count() > 0) {
    await leftBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, '02-left-collapsed.png'), fullPage: false });
  }

  // 4. Expand left, collapse right
  const leftOpenBtn = page.locator('#mf-left-open-btn');
  if (await leftOpenBtn.count() > 0) {
    await leftOpenBtn.click();
    await page.waitForTimeout(800);
  }
  const rightBtn = page.locator('#mf-right-collapse-btn');
  if (await rightBtn.count() > 0) {
    await rightBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, '03-right-collapsed.png'), fullPage: false });
  }

  // 5. Expand right back
  const rightOpenBtn = page.locator('#mf-right-open-btn');
  if (await rightOpenBtn.count() > 0) {
    await rightOpenBtn.click();
    await page.waitForTimeout(800);
  }

  // 6. Hover a top-level field outside row to see drag handle
  // Find fields not inside rows
  const topFields = await page.locator('#mf-canvas-dropzone > .mf-canvas-item.mf-canvas-field:not(.mf-row-field)').all();
  console.log('Top-level fields count:', topFields.length);
  if (topFields.length > 0) {
    const field = topFields[0];
    await field.scrollIntoViewIfNeeded();
    await field.hover();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '04-hover-topfield-handle.png'), fullPage: false });

    // Check computed styles of drag handle
    const handle = field.locator('.mf-drag-handle');
    const styles = await handle.evaluate(el => {
      const c = window.getComputedStyle(el);
      return {
        opacity: c.opacity,
        pointerEvents: c.pointerEvents,
        display: c.display,
        width: c.width,
        height: c.height,
        left: c.left,
        top: c.top
      };
    });
    console.log('Drag handle styles:', JSON.stringify(styles, null, 2));
    fs.writeFileSync(path.join(outDir, '04-handle-styles.json'), JSON.stringify(styles, null, 2));
  }

  // 7. Measure right panel width when collapsed vs expanded
  const rightPanel = page.locator('#mf-panel-right');
  const rightBox = await rightPanel.boundingBox();
  console.log('Right panel box:', JSON.stringify(rightBox));
  fs.writeFileSync(path.join(outDir, 'panel-boxes.json'), JSON.stringify({ rightExpanded: rightBox }, null, 2));

  // 8. Try a quick drag on a top-level field to see clone
  if (topFields.length > 1) {
    const field = topFields[1];
    await field.scrollIntoViewIfNeeded();
    const box = await field.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(200);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 60);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, '05-dragging-topfield.png'), fullPage: false });
      await page.mouse.up();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, '06-after-drop.png'), fullPage: false });
    }
  }
}

await browser.close();
console.log('QA screenshots saved to', outDir);
