const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  
  // === DNN LOGIN DEBUG ===
  await page.goto('http://DNN10322_MegaTest.AI/Login', { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(2000);
  
  // Check if already logged in
  const loginLink = await page.$('a[href*="Login"]');
  console.log('Login link exists:', !!loginLink);
  
  await page.fill('#dnn_ctr_Login_Login_DNN_txtUsername', 'host');
  await page.fill('#dnn_ctr_Login_Login_DNN_txtPassword', 'Minh@2002');
  
  // Click login button instead of Enter
  const loginBtn = await page.$('#dnn_ctr_Login_Login_DNN_cmdLogin');
  if (loginBtn) {
    await loginBtn.click();
    console.log('Clicked DNN login button');
  } else {
    await page.press('#dnn_ctr_Login_Login_DNN_txtPassword', 'Enter');
    console.log('Pressed Enter');
  }
  
  await page.waitForTimeout(8000);
  
  const afterLogin = await page.evaluate(() => ({
    title: document.title,
    hasLoginLink: !!document.querySelector('a[href*="Login"]'),
    hasLogout: !!document.querySelector('a[href*="Logoff"]'),
    userName: document.querySelector('.userName, .dnnUserName')?.textContent?.trim() || 'none'
  }));
  console.log('After login:', JSON.stringify(afterLogin));
  
  await page.screenshot({ path: 'tmp-qa/debug-dnn-after-login.png' });
  
  // === OQTANE DEBUG ===
  const oqtPage = await ctx.newPage();
  await oqtPage.goto('http://localhost:5005/login', { waitUntil: 'load', timeout: 60000 });
  await oqtPage.waitForTimeout(2000);
  
  const oqtLogin = await oqtPage.evaluate(() => ({
    title: document.title,
    hasForm: !!document.querySelector('form'),
    inputs: Array.from(document.querySelectorAll('input')).map(i => ({ type: i.type, name: i.name, id: i.id })),
    buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim())
  }));
  console.log('Oqtane login page:', JSON.stringify(oqtLogin));
  
  await oqtPage.screenshot({ path: 'tmp-qa/debug-oqtane-login.png' });
  
  await browser.close();
})();
