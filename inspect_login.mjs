import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5070/login', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(5000);
const info = await page.evaluate(() => {
  const form = document.querySelector('form');
  const inputs = Array.from(document.querySelectorAll('input')).map(i => ({id:i.id,name:i.name,type:i.type,value:i.value?.slice(0,60)}));
  const buttons = Array.from(document.querySelectorAll('button')).map(b => ({text:b.textContent.trim(),type:b.type,class:b.className}));
  const tokenInp = document.querySelector('input[name="__RequestVerificationToken"]');
  const xsrf = document.cookie.split('; ').find(c => /XSRF|xsrf|antiforg/i.test(c));
  return { url: location.href, form: form ? form.outerHTML.slice(0,2000) : null, inputs, buttons, tokenInput: tokenInp ? tokenInp.value : null, xsrf };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
