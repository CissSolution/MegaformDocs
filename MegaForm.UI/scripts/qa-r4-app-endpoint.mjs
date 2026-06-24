// R4 QA — per-app SQL endpoints.
// Logs in as host, then hits two seeded endpoints + tests the security gate.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(`${BASE}/Login?returnurl=/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
try {
  await page.waitForSelector('input[name*="Username"], input[id*="Username"]', { timeout: 6000 });
  await page.locator('input[name*="Username"], input[id*="Username"]').first().fill('host');
  await page.locator('input[name*="Password"], input[id*="Password"]').first().fill('dnnhost');
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }),
    page.locator('input[type="submit"][value*="Login"], a[id*="cmdLogin"], button[id*="cmdLogin"]').first().click(),
  ]);
} catch (e) { console.warn('login form differed:', e?.message); }

// Test orders/recent-orders
const ordersResult = await page.evaluate(async () => {
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/AppEndpoint?app=orders&endpoint=recent-orders', { credentials: 'same-origin' });
  return { status: r.status, body: await r.text() };
});
console.log('orders/recent-orders:', ordersResult.status);

// Test suppliers/product-catalog
const productsResult = await page.evaluate(async () => {
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/AppEndpoint?app=suppliers&endpoint=product-catalog', { credentials: 'same-origin' });
  return { status: r.status, body: await r.text() };
});
console.log('suppliers/product-catalog:', productsResult.status);

// Test bogus endpoint
const bogusResult = await page.evaluate(async () => {
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/AppEndpoint?app=bogus&endpoint=na', { credentials: 'same-origin' });
  return { status: r.status, body: await r.text() };
});

// Test bogus SQL injection: try an endpoint URL with sql injection in params
const sqlInjectResult = await page.evaluate(async () => {
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/AppEndpoint?app=orders&endpoint=recent-orders&malicious=DROP%20DATABASE', { credentials: 'same-origin' });
  return { status: r.status, body: (await r.text()).slice(0, 200) };
});

const report = {
  ordersResult: { status: ordersResult.status, badge: ordersResult.body.includes('AppEndpoint v20260531-R4-01'), rowCountMentioned: ordersResult.body.includes('rowCount'), bodySnippet: ordersResult.body.slice(0, 400) },
  productsResult: { status: productsResult.status, rowCountMentioned: productsResult.body.includes('rowCount'), bodySnippet: productsResult.body.slice(0, 400) },
  bogusResult,
  sqlInjectResult,
  consoleErrors: errs
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'r4-app-endpoint-report.json'), JSON.stringify(report, null, 2));
await browser.close();
