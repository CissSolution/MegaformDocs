const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    console.log(`[${msg.type().toUpperCase()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.log(`[PAGEERROR] ${err.message}`);
  });

  page.on('requestfailed', req => {
    console.log(`[REQUESTFAILED] ${req.url()} => ${req.failure()?.errorText || 'unknown'}`);
  });

  try {
    await page.goto('http://localhost:5005/?mfpanel=dashboard', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(8000);
    console.log('Dashboard loaded. URL:', page.url());
    await page.screenshot({ path: 'dashboard-1.png' });

    // Try to find Submissions link by various selectors
    const selectors = [
      'a:has-text("Submissions")',
      'text=Submissions',
      '[data-mf-ic-kind="submissions"]',
      '.mf-sb-lk:has-text("Submissions")'
    ];
    let clicked = false;
    for (const sel of selectors) {
      const el = await page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        console.log('Found Submissions with selector:', sel);
        await el.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      console.log('Submissions link not found, dumping page text...');
      const text = await page.locator('body').textContent();
      console.log(text.substring(0, 800));
    }

    await page.waitForTimeout(5000);
    console.log('After Submissions click. URL:', page.url());
    await page.screenshot({ path: 'dashboard-2.png' });
  } catch (e) {
    console.log('Error:', e.message);
  }

  await browser.close();
})();
