import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = 'E:/MENU SPECS/tmp-qa-b110';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

// Enable console logging
const consoleLogs = [];
page.on('console', msg => {
  const text = msg.text();
  if (text.includes('404') || text.includes('500') || msg.type() === 'error') {
    consoleLogs.push({ type: msg.type(), text });
  }
});
page.on('pageerror', err => consoleLogs.push({ type: 'pageerror', text: err.message }));

// 1. Go to site and handle login if needed
await page.goto('http://localhost:5005/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

// Check if we are on a login page
const loginBtn = page.locator('button[type="submit"], input[type="submit"]').filter({ hasText: /Login|Sign In|Log in/i });
const hasLoginForm = await page.locator('input[name="username"], input[name="UserName"], input[name="email"], #username, #UserName').count() > 0;
console.log('Has login form:', hasLoginForm);

if (hasLoginForm) {
  // Try common Oqtane selectors
  const userInput = page.locator('input[name="username"], input[name="UserName"], input[name="email"], #username, #UserName').first();
  const passInput = page.locator('input[name="password"], input[name="Password"], #password, #Password').first();
  const submitBtn = page.locator('button[type="submit"], input[type="submit"]').filter({ hasText: /Login|Sign In|Log in/i }).first();

  if (await userInput.count() > 0 && await passInput.count() > 0) {
    await userInput.fill('host');
    await passInput.fill('Minh@2002');
    await submitBtn.click();
    await page.waitForTimeout(4000);
  }
}

await page.screenshot({ path: path.join(outDir, 'login-after.png'), fullPage: false });

// 2. Navigate to builder formId=4 (Design mode from screenshot)
await page.goto('http://localhost:5005/?mfpanel=builder&formId=4', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(outDir, 'real-04-design.png'), fullPage: false });

// Click Build tab if present
const buildTab = page.locator('text=Build').filter({ has: page.locator('..') }).first();
if (await page.locator('button:has-text("Build"), a:has-text("Build"), [role="tab"]:has-text("Build")').count() > 0) {
  const btns = await page.locator('button:has-text("Build"), a:has-text("Build"), [role="tab"]:has-text("Build")').all();
  for (const b of btns) {
    const vis = await b.isVisible().catch(() => false);
    if (vis) { await b.click(); break; }
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, 'real-04-build.png'), fullPage: false });
}

// 3. Navigate to builder formId=2 (from second screenshot)
await page.goto('http://localhost:5005/?mfpanel=builder&formId=2', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(outDir, 'real-02-build.png'), fullPage: false });

// Try to click Design tab
const designTab = page.locator('button:has-text("Design"), a:has-text("Design"), [role="tab"]:has-text("Design")').first();
if (await designTab.count() > 0) {
  const vis = await designTab.isVisible().catch(() => false);
  if (vis) {
    await designTab.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(outDir, 'real-02-design.png'), fullPage: false });
  }
}

// 4. Save console logs
fs.writeFileSync(path.join(outDir, 'console-errors.json'), JSON.stringify(consoleLogs.slice(0, 100), null, 2));
console.log('Console errors count:', consoleLogs.length);

await browser.close();
