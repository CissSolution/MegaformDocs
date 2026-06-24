const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  
  // DNN Login
  await page.goto('http://DNN10322_MegaTest.AI/Login', { waitUntil: 'load', timeout: 180000 });
  await page.fill('#dnn_ctr_Login_Login_DNN_txtUsername', 'host');
  await page.fill('#dnn_ctr_Login_Login_DNN_txtPassword', 'Minh@2002');
  await page.press('#dnn_ctr_Login_Login_DNN_txtPassword', 'Enter');
  await page.waitForLoadState('load', { timeout: 120000 }).catch(() => null);
  await page.waitForTimeout(5000);
  
  // Go to builder - wait for skeleton then builder
  await page.goto('http://DNN10322_MegaTest.AI/megaform/Home/mfFormId/1267?mfFormId=1267#mf-builder', { waitUntil: 'load', timeout: 180000 });
  console.log('Page loaded, waiting for builder boot...');
  
  // Wait for builder root
  await page.waitForSelector('#mf-builder-root', { timeout: 60000 });
  await page.waitForTimeout(12000);
  
  // Check if builder loaded
  const hasBuilder = await page.evaluate(() => !!document.querySelector('.mf-canvas-field, .mf-palette-item'));
  console.log('Builder loaded:', hasBuilder);
  
  await page.screenshot({ path: 'tmp-qa/dnn-build-raw.png' });
  console.log('DNN Build saved');
  
  await browser.close();
})();
