// QA Fresh Test 5006 with 1.7.22 — log in, navigate to Builder, capture 4xx.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://localhost:5006';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const fourxx = [];
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('response', r => {
  const u = r.url();
  if (r.status() >= 400 && (u.includes('MegaForm') || u.includes('AiAssistant') || u.includes('Subform'))) {
    fourxx.push(r.status() + ' ' + u.replace(BASE, ''));
  }
});

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3500);
await page.evaluate(() => {
  const u = document.querySelector('input[autocomplete="username"], input[id*="Username" i]');
  const p = document.querySelector('input[type="password"]');
  if (u && p) { u.value = 'host'; p.value = 'Minh@2002'; }
});
await page.evaluate(() => {
  const b = document.querySelector('button[type="submit"], button.btn-primary, button:not([type])');
  if (b) b.click();
});
await page.waitForTimeout(5500);

// Navigate to Builder via URL the user uses
await page.goto(`${BASE}/*/36/Builder?formId=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(10000);

const probe = await page.evaluate(() => {
  const pf = window.__MF_PLATFORM__ || null;
  return {
    platform: pf?.platform,
    apiBase: pf?.apiBase,
    ai: pf?.ai,
    builder: !!window.MegaFormBuilder,
    razorStudio: !!window.MFRazorStudio,
    tokenDesigner: !!window.MFTokenDesigner,
    aiFloatBtn: !!document.querySelector('[data-mf-ai-fab], .mf-ai-fab, .mf-ai-chat-btn'),
  };
});
console.log('=== __MF_PLATFORM__ ===');
console.log(JSON.stringify(probe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-5006-1722-builder.png'), fullPage: false });
console.log('=== 4xx responses ===');
if (!fourxx.length) console.log('  (none — CLEAN)');
else fourxx.forEach(r => console.log('  ' + r));
console.log('=== Console errors ===');
errs.slice(0, 4).forEach(e => console.log('  ' + e));
await browser.close();
