const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  
  // Mock
  await page.goto('http://localhost:3000/builder', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'tmp-qa/ref-mock.png' });
  console.log('1. Mock reference saved');
  
  // DNN Login
  await page.goto('http://DNN10322_MegaTest.AI/Login', { waitUntil: 'load', timeout: 180000 });
  await page.fill('#dnn_ctr_Login_Login_DNN_txtUsername', 'host');
  await page.fill('#dnn_ctr_Login_Login_DNN_txtPassword', 'Minh@2002');
  await page.press('#dnn_ctr_Login_Login_DNN_txtPassword', 'Enter');
  await page.waitForLoadState('load', { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(4000);
  
  // DNN Builder form 1267 (has more fields)
  await page.goto('http://DNN10322_MegaTest.AI/megaform/Home/mfFormId/1267?mfFormId=1267&_=' + Date.now() + '#mf-builder', { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(15000);
  
  const paletteCount = await page.evaluate(() => document.querySelectorAll('.mf-palette-item').length);
  console.log('Palette items:', paletteCount);
  
  await page.screenshot({ path: 'tmp-qa/ref-dnn-build.png' });
  console.log('2. DNN Build mode saved');
  
  // Design mode
  await page.click('#mf-mode-pill-design, [data-mf-mode="design"], .w-mode-pill button:last-child');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'tmp-qa/ref-dnn-design.png' });
  console.log('3. DNN Design mode saved');
  
  await browser.close();
})();
