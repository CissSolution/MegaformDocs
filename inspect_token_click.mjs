import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5070/login', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
await page.fill('#username', 'host');
await page.fill('#password', 'abc@ABC1024');
// Observe mutations
const mutations = await page.evaluateHandle(() => {
  const obs = [];
  const mo = new MutationObserver(recs => {
    for (const r of recs) {
      for (const n of r.addedNodes) {
        if (n.nodeType === 1) obs.push({ tag: n.tagName, name: n.name, id: n.id, outer: n.outerHTML?.slice(0,200) });
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  return obs;
});
await page.click('button.btn-primary:has-text("Login")');
await page.waitForTimeout(2000);
const added = await mutations.jsonValue();
console.log('added nodes:', JSON.stringify(added.filter(x => /input|form/i.test(x.tag)), null, 2));
// Also check cookie at this moment
const cookies = await page.evaluate(() => document.cookie);
console.log('cookies:', cookies);
await browser.close();
