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
  
  // Form 1273
  await page.goto('http://DNN10322_MegaTest.AI/megaform/Home/mfFormId/1273?mfFormId=1273&_=' + Date.now() + '#mf-builder', { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(10000);
  
  // Add Short Text field by clicking palette
  const shortText = await page.$('.mf-palette-item[data-type="Text"]');
  if (shortText) {
    await shortText.click();
    await page.waitForTimeout(1500);
  }
  
  // Add Email field
  const email = await page.$('.mf-palette-item[data-type="Email"]');
  if (email) {
    await email.click();
    await page.waitForTimeout(1500);
  }
  
  // Add Phone field
  const phone = await page.$('.mf-palette-item[data-type="Phone"]');
  if (phone) {
    await phone.click();
    await page.waitForTimeout(1500);
  }
  
  await page.screenshot({ path: 'tmp-qa/dnn-builder-with-fields.png', fullPage: false });
  console.log('Screenshot with fields saved');
  
  // Click first normal field (should be index 2 after the 2 rows)
  const fields = await page.$$('.mf-canvas-field');
  if (fields.length > 2) {
    await fields[2].click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tmp-qa/dnn-builder-field-selected.png', fullPage: false });
    console.log('Selected field screenshot saved');
  }
  
  await browser.close();
})();
