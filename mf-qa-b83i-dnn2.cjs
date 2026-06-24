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
  
  // Form 1273 (plain)
  await page.goto('http://DNN10322_MegaTest.AI/megaform/Home/mfFormId/1273?mfFormId=1273&_=' + Date.now() + '#mf-builder', { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: 'tmp-qa/dnn-builder-1273-b83i.png', fullPage: false });
  console.log('DNN form 1273 screenshot saved');
  
  // Click first field to see selected state
  const firstField = await page.$('.mf-canvas-field[data-index="0"]');
  if (firstField) {
    await firstField.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tmp-qa/dnn-builder-1273-selected.png', fullPage: false });
    console.log('DNN selected field screenshot saved');
  }
  
  await browser.close();
})();
