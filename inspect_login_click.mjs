import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const posts = [];
page.on('request', req => {
  if (req.method() === 'POST') {
    posts.push({ url: req.url(), method: req.method(), headers: req.headers(), postData: req.postData()?.slice(0,500) });
  }
});
await page.goto('http://localhost:5070/login', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
await page.fill('#username', 'host');
await page.fill('#password', 'Minh@2002');
await page.click('button.btn-primary:has-text("Login")');
await page.waitForTimeout(5000);
console.log(JSON.stringify(posts, null, 2));
await browser.close();
