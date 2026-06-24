const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  
  // Login DNN
  await page.goto('http://DNN10322_MegaTest.AI/Login', { waitUntil: 'load', timeout: 180000 });
  await page.fill('#dnn_ctr_Login_Login_DNN_txtUsername', 'host');
  await page.fill('#dnn_ctr_Login_Login_DNN_txtPassword', 'dnnhost');
  await page.press('#dnn_ctr_Login_Login_DNN_txtPassword', 'Enter');
  await page.waitForLoadState('load', { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(3000);
  
  // Builder
  await page.goto('http://DNN10322_MegaTest.AI/megaform/Home/mfFormId/1267?mfFormId=1267&_=' + Date.now() + '#mf-builder', { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(10000);
  await page.screenshot({ path: 'tmp-qa/dnn-builder-b83i.png', fullPage: false });
  console.log('DNN builder screenshot saved');
  
  await browser.close();
})();
