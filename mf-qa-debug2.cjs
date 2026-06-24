const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  
  // Try dnnhost password
  await page.goto('http://DNN10322_MegaTest.AI/Login', { waitUntil: 'load', timeout: 180000 });
  await page.fill('#dnn_ctr_Login_Login_DNN_txtUsername', 'host');
  await page.fill('#dnn_ctr_Login_Login_DNN_txtPassword', 'dnnhost');
  await page.press('#dnn_ctr_Login_Login_DNN_txtPassword', 'Enter');
  await page.waitForTimeout(8000);
  
  const state = await page.evaluate(() => ({
    title: document.title,
    hasLogin: !!document.querySelector('a[href*="Login"]'),
    hasLogout: !!document.querySelector('a[href*="Logoff"]')
  }));
  console.log('With dnnhost:', JSON.stringify(state));
  await page.screenshot({ path: 'tmp-qa/debug-dnn-dnnhost.png' });
  
  // Try Minh@2002 with button click
  await page.goto('http://DNN10322_MegaTest.AI/Login', { waitUntil: 'load', timeout: 180000 });
  await page.fill('#dnn_ctr_Login_Login_DNN_txtUsername', 'host');
  await page.fill('#dnn_ctr_Login_Login_DNN_txtPassword', 'Minh@2002');
  const btn = await page.$('input[type="submit"], button[type="submit"], .dnnPrimaryAction');
  if (btn) await btn.click();
  else await page.press('#dnn_ctr_Login_Login_DNN_txtPassword', 'Enter');
  await page.waitForTimeout(8000);
  
  const state2 = await page.evaluate(() => ({
    title: document.title,
    hasLogin: !!document.querySelector('a[href*="Login"]'),
    hasLogout: !!document.querySelector('a[href*="Logoff"]')
  }));
  console.log('With Minh@2002:', JSON.stringify(state2));
  await page.screenshot({ path: 'tmp-qa/debug-dnn-minh.png' });
  
  await browser.close();
})();
