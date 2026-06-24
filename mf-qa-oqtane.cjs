const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  
  // Oqtane login
  await page.goto('http://localhost:5005/login', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.fill('#username', 'host');
  await page.fill('#password', 'Minh@2002');
  await page.click('button:has-text("Login")');
  await page.waitForTimeout(4000);
  
  const loginState = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    hasLoginForm: !!document.querySelector('#password')
  }));
  console.log('After Oqtane login:', JSON.stringify(loginState));
  await page.screenshot({ path: 'tmp-qa/oqtane-after-login.png' });
  
  // Try builder
  await page.goto('http://localhost:5005/?mfpanel=builder&formId=2', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(15000);
  
  const builderState = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    hasBuilderRoot: !!document.getElementById('mf-builder-root'),
    hasCanvas: !!document.querySelector('.mf-canvas-dropzone, .mf-canvas-field'),
    bodyClasses: document.body.className
  }));
  console.log('Builder state:', JSON.stringify(builderState));
  await page.screenshot({ path: 'tmp-qa/oqtane-builder.png' });
  
  await browser.close();
})();
