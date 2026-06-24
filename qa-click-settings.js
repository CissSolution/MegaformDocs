const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const outDir = 'e:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um/tmp-qa';
  
  // Login
  await page.goto('http://localhost:5005/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.fill('input[placeholder="Username"]', 'host');
  await page.fill('input[placeholder="Password"]', 'Minh@2002');
  const loginBtn = await page.$('button:has-text("Login")');
  if (loginBtn) await loginBtn.click();
  await page.waitForTimeout(5000);
  
  // Go to homepage edit
  await page.goto('http://localhost:5005/?edit=true&refresh=true', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);
  
  // Click Settings button
  const settingsBtn = await page.$('button:has-text("Settings")');
  if (settingsBtn) {
    await settingsBtn.click();
    console.log('Clicked Settings button');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: outDir + '/settings-panel-open.png', fullPage: true });
    console.log('Settings panel screenshot saved');
  } else {
    console.log('Settings button not found');
  }
  
  await browser.close();
})();
