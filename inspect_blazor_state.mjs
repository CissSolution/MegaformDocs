import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5070/login', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const out = {};
  for (const k of Object.keys(window)) {
    if (/Blazor|blazor|dotnet|__blazor|oqtane/i.test(k)) {
      try {
        const v = window[k];
        out[k] = { type: typeof v, keys: v && typeof v === 'object' ? Object.keys(v).slice(0,20) : undefined };
      } catch {}
    }
  }
  return out;
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
