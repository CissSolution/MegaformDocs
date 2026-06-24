const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  
  // === OQTANE ===
  await page.goto('http://localhost:5005/');
  await page.waitForTimeout(2000);
  const loginLink = await page.$('a[href*="login"]');
  if (loginLink) await loginLink.click();
  await page.waitForTimeout(1000);
  const userInput = await page.$('input[name="username"], input[type="text"]');
  if (userInput) {
    await userInput.fill('host');
    const passInput = await page.$('input[type="password"]');
    if (passInput) {
      await passInput.fill('Minh@2002');
      const submitBtn = await page.$('button[type="submit"], button:has-text("Login")');
      if (submitBtn) await submitBtn.click();
    }
  }
  await page.waitForTimeout(3000);
  
  // Form 1 Design Mode
  await page.goto('http://localhost:5005/?mfpanel=builder&formId=1');
  await page.waitForTimeout(8000);
  const designTab = await page.$('.mf-mode-tab[data-mode="theme"], button:has-text("Design")');
  if (designTab) {
    await designTab.click();
    await page.waitForTimeout(4000);
  }
  await page.screenshot({ path: 'qa/b83j-oq-form1-design.png', fullPage: false });
  
  // Form 1 Runtime
  await page.goto('http://localhost:5005/?formId=1');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'qa/b83j-oq-form1-runtime.png', fullPage: false });
  
  // Form 3 Design Mode
  await page.goto('http://localhost:5005/?mfpanel=builder&formId=3');
  await page.waitForTimeout(8000);
  const designTab3 = await page.$('.mf-mode-tab[data-mode="theme"], button:has-text("Design")');
  if (designTab3) {
    await designTab3.click();
    await page.waitForTimeout(4000);
  }
  await page.screenshot({ path: 'qa/b83j-oq-form3-design.png', fullPage: false });
  
  // Form 3 Runtime
  await page.goto('http://localhost:5005/?formId=3');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'qa/b83j-oq-form3-runtime.png', fullPage: false });
  
  await browser.close();
  console.log('Oqtane QA screenshots saved');
})();
