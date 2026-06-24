const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  
  // === 1. MOCK ===
  await page.goto('http://localhost:3000/builder', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tmp-qa/v4-mock.png' });
  console.log('✓ Mock');
  
  // === 2. OQTANE ===
  await page.goto('http://localhost:5005/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);
  const pwd = await page.$('input[type="password"]');
  if (pwd) {
    await page.fill('input[type="text"], #username', 'host');
    await page.fill('input[type="password"], #password', 'Minh@2002');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4000);
  }
  
  await page.goto('http://localhost:5005/?mfpanel=builder&formId=2', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(15000);
  await page.screenshot({ path: 'tmp-qa/v4-oqtane.png' });
  console.log('✓ Oqtane');
  
  // === 3. DNN ===
  await page.goto('http://DNN10322_MegaTest.AI/Login', { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(2000);
  const dnnUser = await page.$('#dnn_ctr_Login_Login_DNN_txtUsername');
  if (dnnUser) {
    await page.fill('#dnn_ctr_Login_Login_DNN_txtUsername', 'host');
    await page.fill('#dnn_ctr_Login_Login_DNN_txtPassword', 'Minh@2002');
    await page.press('#dnn_ctr_Login_Login_DNN_txtPassword', 'Enter');
    await page.waitForTimeout(8000);
  }
  
  await page.goto('http://DNN10322_MegaTest.AI/megaform/Home/mfFormId/1267?mfFormId=1267#mf-builder', { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(20000);
  await page.screenshot({ path: 'tmp-qa/v4-dnn.png' });
  console.log('✓ DNN');
  
  await browser.close();
})();
