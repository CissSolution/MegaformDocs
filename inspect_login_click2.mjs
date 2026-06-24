import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const reqs = [];
page.on('request', req => {
  reqs.push({ url: req.url(), method: req.method(), headers: req.headers(), postData: req.postData()?.slice(0,500) });
});
page.on('response', resp => {
  reqs.push({ type:'response', url: resp.url(), status: resp.status() });
});
await page.goto('http://localhost:5070/login', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
await page.fill('#username', 'host');
await page.fill('#password', 'abc@ABC1024');
await page.click('button.btn-primary:has-text("Login")');
await page.waitForTimeout(8000);
console.log('URL after:', page.url());
console.log(JSON.stringify(reqs.filter(r => r.method === 'POST' || r.url.includes('login') || r.url.includes('Authorization') || r.type==='response'), null, 2));
await browser.close();
