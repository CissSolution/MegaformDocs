import { launch, shot, BASE } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(4000);
const dom = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('input')).map(i => ({ id: i.id, name: i.name, type: i.type, ph: i.placeholder }));
  const btns = Array.from(document.querySelectorAll('button, a.btn, input[type=submit]')).map(b => ({ tag: b.tagName, id: b.id, cls: b.className?.slice(0,40), txt: (b.textContent||b.value||'').trim().slice(0,30) }));
  return { url: location.href, title: document.title, inputs, btns: btns.slice(0, 20) };
});
console.log(JSON.stringify(dom, null, 2));
await shot(page, 'login-page.png');
await browser.close();
