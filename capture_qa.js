const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const pages = JSON.parse(fs.readFileSync('qa_pages.json', 'utf-8'));
const outDir = path.join(__dirname, 'qa_screenshots', 'fixed');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const sizes = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 400, height: 800 },
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: sizes.desktop });
  const page = await context.newPage();

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    console.log(`[${i + 1}/${pages.length}] ${p.name}`);
    try {
      await page.setViewportSize(sizes.desktop);
      await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
      const safeName = p.name.replace(/[^a-z0-9\u00C0-\u1FFF\u2C00-\uD7FF_-]/gi, '_');
      await page.screenshot({
        path: path.join(outDir, `${String(i + 1).padStart(2, '0')}-${safeName}-desktop.png`),
        fullPage: true,
      });

      await page.setViewportSize(sizes.mobile);
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
      await page.screenshot({
        path: path.join(outDir, `${String(i + 1).padStart(2, '0')}-${safeName}-mobile.png`),
        fullPage: true,
      });
    } catch (e) {
      console.error(`  ERROR ${p.url}: ${e.message}`);
    }
  }

  await browser.close();
  console.log('Done. Screenshots in', outDir);
})();
