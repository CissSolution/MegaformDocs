const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  
  // === 1. MOCK REFERENCE ===
  await page.goto('http://localhost:3000/builder', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tmp-qa/v3-mock.png' });
  console.log('✓ Mock saved');
  
  // === 2. OQTANE ===
  await page.goto('http://localhost:5005/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  
  // Look for login form
  const loginForm = await page.$('input[type="password"]');
  if (loginForm) {
    await page.fill('input[type="text"], input[name="username"], #username', 'host');
    await page.fill('input[type="password"], input[name="password"], #password', 'Minh@2002');
    await page.click('button[type="submit"], .btn-primary');
    await page.waitForTimeout(3000);
    console.log('✓ Oqtane logged in');
  }
  
  // Navigate to builder
  await page.goto('http://localhost:5005/?mfpanel=builder&formId=2', { waitUntil: 'networkidle', timeout: 120000 });
  console.log('✓ Oqtane builder page loaded');
  await page.waitForTimeout(12000);
  
  // Check builder state
  const state = await page.evaluate(() => ({
    hasRoot: !!document.getElementById('mf-builder-root'),
    hasCanvas: !!document.querySelector('.mf-canvas-field, .mf-canvas-dropzone'),
    hasPalette: !!document.querySelector('.mf-palette-item'),
    loaderVer: window.__MF_BUILDER_PREVIEW_CSS_BADGE__ || 'none'
  }));
  console.log('Oqtane state:', JSON.stringify(state));
  
  await page.screenshot({ path: 'tmp-qa/v3-oqtane.png' });
  console.log('✓ Oqtane saved');
  
  // === 3. DNN ===
  await page.goto('http://DNN10322_MegaTest.AI/Login', { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(2000);
  
  const dnnLogin = await page.$('#dnn_ctr_Login_Login_DNN_txtUsername');
  if (dnnLogin) {
    await page.fill('#dnn_ctr_Login_Login_DNN_txtUsername', 'host');
    await page.fill('#dnn_ctr_Login_Login_DNN_txtPassword', 'Minh@2002');
    await page.press('#dnn_ctr_Login_Login_DNN_txtPassword', 'Enter');
    await page.waitForTimeout(8000);
    console.log('✓ DNN logged in');
  }
  
  // DNN builder
  await page.goto('http://DNN10322_MegaTest.AI/megaform/Home/mfFormId/1267?mfFormId=1267#mf-builder', { waitUntil: 'networkidle', timeout: 180000 });
  console.log('✓ DNN builder page loaded');
  await page.waitForTimeout(15000);
  
  const dnnState = await page.evaluate(() => ({
    hasRoot: !!document.getElementById('mf-builder-root'),
    hasCanvas: !!document.querySelector('.mf-canvas-field, .mf-canvas-dropzone'),
    hasPalette: !!document.querySelector('.mf-palette-item'),
    title: document.title
  }));
  console.log('DNN state:', JSON.stringify(dnnState));
  
  await page.screenshot({ path: 'tmp-qa/v3-dnn.png' });
  console.log('✓ DNN saved');
  
  await browser.close();
})();
