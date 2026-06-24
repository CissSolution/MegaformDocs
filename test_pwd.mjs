import { chromium } from 'playwright';
async function tryLogin(pwd) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5070/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.fill('#username', 'host');
  await page.fill('#password', pwd);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {}),
    page.click('button.btn-primary:has-text("Login")')
  ]);
  const url = page.url();
  const cookies = await page.context().cookies();
  const authCookie = cookies.find(c => c.name.includes('.AspNetCore.Identity'));
  await browser.close();
  return { pwd, url, hasAuth: !!authCookie, authName: authCookie?.name };
}
console.log(JSON.stringify(await tryLogin('Minh@2002'), null, 2));
console.log(JSON.stringify(await tryLogin('abc@ABC1024'), null, 2));
