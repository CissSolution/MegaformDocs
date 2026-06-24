import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5070/login', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const keys = Object.keys(window).filter(k => /oqtane|site|state|anti|forgery|token|interop/i.test(k));
  const vals = {};
  for (const k of keys) {
    try { vals[k] = typeof window[k]; } catch {}
  }
  // try common names
  const candidates = ['SiteState', 'siteState', 'Oqtane', 'oqtane', 'interop'];
  for (const c of candidates) {
    try {
      const v = (window)[c];
      vals[c + '_type'] = typeof v;
      if (v && typeof v === 'object') {
        const keys2 = Object.keys(v).filter(k => /anti|forgery|token|site/i.test(k));
        vals[c + '_keys'] = keys2;
        for (const k2 of keys2) vals[c + '.' + k2] = String(v[k2]).slice(0,200);
      }
    } catch {}
  }
  return vals;
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
