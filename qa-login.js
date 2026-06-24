const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const outDir = 'e:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um/tmp-qa';
  const fs = require('fs');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  
  await page.goto('http://localhost:5005/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // Target inputs by placeholder to avoid the search box
  await page.fill('input[placeholder="Username"]', 'host');
  await page.fill('input[placeholder="Password"]', 'Minh@2002');
  
  // Click the Login button inside the login form area (not search)
  // The login form is likely the second form on the page
  const forms = await page.$$('form');
  console.log('Form count:', forms.length);
  
  // Try clicking by text on the page within the main content area
  const loginBtn = await page.$('main button:has-text("Login"), .container button:has-text("Login"), [class*="login"] button:has-text("Login"), button.btn-primary:has-text("Login")');
  if (loginBtn) {
    await loginBtn.click();
    console.log('Clicked specific login button');
  } else {
    // Fallback: click the second form's submit button
    const buttons = await page.$$('button:has-text("Login")');
    console.log('Login button count:', buttons.length);
    if (buttons.length > 0) {
      await buttons[buttons.length - 1].click();
      console.log('Clicked last Login button');
    }
  }
  
  await page.waitForTimeout(6000);
  console.log('URL after login:', page.url());
  await page.screenshot({ path: outDir + '/after-login.png', fullPage: true });
  
  // Navigate to homepage with edit
  await page.goto('http://localhost:5005/?edit=true&refresh=true', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: outDir + '/homepage-edit.png', fullPage: true });
  
  const html = await page.content();
  console.log('Has admin dock:', html.includes('mf-oq-admin-dock'));
  console.log('Has Settings:', html.includes('>Settings<'));
  console.log('Has Form Builder:', html.includes('Form Builder'));
  console.log('Has Form Dashboard:', html.includes('Form Dashboard'));
  console.log('Has Business Starters:', html.includes('Business Starters'));
  console.log('Has Render Module:', html.includes('Render Module'));
  
  await browser.close();
})();
