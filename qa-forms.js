const { chromium } = require('playwright');
const urls = require('./form-urls.json');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const results = [];

  for (const item of urls) {
    try {
      await page.goto(item.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);
      const info = await page.evaluate(() => {
        const html = document.documentElement;
        const body = document.body;
        const overflowX = html.scrollWidth - window.innerWidth;
        const overflowY = body.scrollHeight - window.innerHeight;
        // find a submit-like button
        const submit = document.querySelector('button[type="submit"], .mf-submit, .mfp-submit, .mf-btn-primary, input[type="submit"]');
        let submitInfo = null;
        if (submit) {
          const rect = submit.getBoundingClientRect();
          submitInfo = {
            text: submit.innerText?.trim().slice(0, 40) || submit.value,
            inDom: true,
            visible: rect.height > 0 && rect.width > 0,
            top: rect.top,
            bottom: rect.bottom,
          };
        }
        // find theme selector
        const themeSelector = document.querySelector('[data-mf-script-root="theme_selector"], .mf-theme-selector, .theme-selector');
        return { overflowX, overflowY, submitInfo, hasThemeSelector: !!themeSelector };
      });
      results.push({ ...item, ...info });
      console.log(`${item.name.padEnd(45)} overflowX=${info.overflowX} submit=${info.submitInfo ? (info.submitInfo.visible ? 'visible' : 'hidden') : 'MISSING'}`);
    } catch (e) {
      results.push({ ...item, error: e.message });
      console.log(`${item.name.padEnd(45)} ERROR: ${e.message}`);
    }
  }

  await browser.close();
  require('fs').writeFileSync('qa-forms-result.json', JSON.stringify(results, null, 2));
  console.log('\nDone. Wrote qa-forms-result.json');
})();
