import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const BASE   = 'http://localhost:5050';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  page.on('console', m => console.log('[console]', m.type(), m.text().slice(0,200)));
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  page.on('requestfailed', r => console.log('[reqfail]', r.method(), r.url().slice(0,160), r.failure()?.errorText));

  console.log('1) goto /login');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#username', { timeout: 10000 });

  console.log('2) fill credentials');
  await page.fill('#username', 'host');
  await page.fill('#password', 'host');
  await page.screenshot({ path: 'qa-out/login-debug-before-click.png' });

  console.log('3) click login button');
  const btn = page.locator('button.btn-primary:has-text("Login")').first();
  console.log('   button count =', await btn.count());
  await btn.click();
  await page.waitForTimeout(3000);
  console.log('   url after click =', page.url());
  await page.screenshot({ path: 'qa-out/login-debug-after-click.png' });

  // Check for any error message visible
  const err = await page.evaluate(() => {
    const txt = document.body.innerText || '';
    const lines = txt.split('\n').filter(l => /error|invalid|denied|fail|incorrect|locked/i.test(l));
    return lines.slice(0, 5);
  });
  console.log('errors on page:', err);

  // Check cookies
  const cookies = await ctx.cookies();
  console.log('cookies:', cookies.map(c => c.name).join(','));

  await browser.close();
})();
