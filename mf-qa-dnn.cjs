const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  
  // DNN Login with dnnhost
  await page.goto('http://DNN10322_MegaTest.AI/Login', { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(2000);
  await page.fill('#dnn_ctr_Login_Login_DNN_txtUsername', 'host');
  await page.fill('#dnn_ctr_Login_Login_DNN_txtPassword', 'dnnhost');
  await page.press('#dnn_ctr_Login_Login_DNN_txtPassword', 'Enter');
  await page.waitForLoadState('load', { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(8000);
  
  const loginState = await page.evaluate(() => ({
    title: document.title,
    hasLogin: !!document.querySelector('a[href*="Login"]'),
    hasLogout: !!document.querySelector('a[href*="Logoff"]')
  }));
  console.log('DNN login state:', JSON.stringify(loginState));
  await page.screenshot({ path: 'tmp-qa/dnn-after-login.png' });
  
  if (loginState.hasLogout) {
    // Builder form 1267
    await page.goto('http://DNN10322_MegaTest.AI/megaform/Home/mfFormId/1267?mfFormId=1267#mf-builder', { waitUntil: 'load', timeout: 180000 });
    await page.waitForTimeout(15000);
    await page.screenshot({ path: 'tmp-qa/dnn-builder-1267.png' });
    console.log('✓ DNN builder 1267 saved');
    
    // Add fields
    await page.click('.mf-palette-item[data-type="Text"]'); await page.waitForTimeout(800);
    await page.click('.mf-palette-item[data-type="Email"]'); await page.waitForTimeout(800);
    await page.click('.mf-palette-item[data-type="Select"]'); await page.waitForTimeout(800);
    await page.screenshot({ path: 'tmp-qa/dnn-builder-fields.png' });
    console.log('✓ DNN with fields saved');
    
    // Click field
    const field = await page.$('.mf-canvas-field[data-type="Text"]');
    if (field) {
      await field.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'tmp-qa/dnn-builder-selected.png' });
      console.log('✓ DNN selected saved');
    }
    
    // Design mode
    const designBtn = await page.$('[data-mf-mode="design"], #mf-mode-pill-design');
    if (designBtn) {
      await designBtn.click();
      await page.waitForTimeout(5000);
      await page.screenshot({ path: 'tmp-qa/dnn-builder-design.png' });
      console.log('✓ DNN Design mode saved');
    }
  }
  
  await browser.close();
})();
