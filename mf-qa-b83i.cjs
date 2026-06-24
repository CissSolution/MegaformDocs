const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  
  // Oqtane builder
  await page.goto('http://localhost:5005/?mfpanel=builder&formId=2', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'tmp-qa/oqtane-builder-b83i.png', fullPage: false });
  console.log('Oqtane screenshot saved');
  
  // Mock reference
  await page.goto('http://localhost:3000/builder', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'tmp-qa/mock-builder-ref.png', fullPage: false });
  console.log('Mock screenshot saved');
  
  await browser.close();
})();
