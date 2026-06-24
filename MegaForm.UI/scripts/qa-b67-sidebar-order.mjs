// B6.7 QA — verify sidebar section order: Apps first, then Calendar, then Status.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

await page.goto(`${BASE}/Login?returnurl=/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
try {
  await page.waitForSelector('input[name*="Username"]', { timeout: 6000 });
  await page.locator('input[name*="Username"]').first().fill('host');
  await page.locator('input[name*="Password"]').first().fill('dnnhost');
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }),
    page.locator('input[type="submit"][value*="Login"], a[id*="cmdLogin"]').first().click(),
  ]);
} catch (e) { console.warn('login differed', e?.message); }

await page.goto(`${BASE}/xx#mf-submissions`, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3000);

const order = await page.evaluate(() => {
  const aside = document.querySelector('[data-mf-sx-side]');
  if (!aside) return null;
  const grps = Array.from(aside.querySelectorAll('.mf-sx-grp'));
  return grps.map(g => (g.textContent || '').trim());
});

await page.screenshot({ path: join(OUT, 'b67-sidebar-reordered.png'), fullPage: true });

console.log(JSON.stringify({ groupOrder: order }, null, 2));
writeFileSync(join(OUT, 'b67-sidebar-report.json'), JSON.stringify({ groupOrder: order }, null, 2));
await browser.close();
