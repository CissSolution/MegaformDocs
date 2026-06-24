// Final Visual QA for Fresh Test Oqtane (5006):
// login as host → navigate to a MegaForm page (Dashboard or Builder)
// → capture all 4xx responses involving MegaForm/Subform/AiAssistant.
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
page.on('response', async r => {
  const url = r.url();
  if (r.status() >= 400 && (url.includes('MegaForm') || url.includes('AiAssistant') || url.includes('Subform') || url.includes('Modules/MegaForm'))) {
    fourxx.push(r.status() + ' ' + url.replace(BASE, ''));
  }
});

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3500);

const loginOk = await page.evaluate(() => {
  const u = document.querySelector('input[autocomplete="username"], input[id*="Username" i]');
  const p = document.querySelector('input[type="password"]');
  if (u && p) { u.value = 'host'; p.value = 'host'; return true; }
  return false;
});
console.log('login fields filled:', loginOk);
if (loginOk) {
  await page.evaluate(() => {
    const b = document.querySelector('button[type="submit"], button.btn-primary, button:not([type])');
    if (b) b.click();
  });
  await page.waitForTimeout(6000);
}

// Try to find a MegaForm Dashboard / Builder link
const links = await page.evaluate(() => {
  const a = Array.from(document.querySelectorAll('a'));
  return a.filter(x => /megaform|builder|dashboard/i.test(x.textContent + ' ' + (x.href || '')))
          .slice(0, 8)
          .map(x => ({ text: x.textContent.trim().slice(0, 40), href: x.href }));
});
console.log('Mega links visible:', links.length);
links.forEach(l => console.log('  ', l));

// If we have a dashboard link, navigate to it
if (links.length) {
  await page.goto(links[0].href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);
}

// Probe platform state
const platform = await page.evaluate(() => {
  const pf = window.__MF_PLATFORM__ || null;
  return {
    keys: pf ? Object.keys(pf) : null,
    platform: pf?.platform,
    apiBase: pf?.apiBase,
    ai: pf?.ai,
    href: location.href,
    hasBuilder: !!document.getElementById('mf-builder-root'),
    hasDashboard: !!document.getElementById('mf-dashboard-root'),
    aiBtn: !!document.querySelector('[data-mf-ai-fab], .mf-ai-fab, .mf-ai-chat-btn, [id*="ai-form-assistant" i]'),
  };
});
console.log('=== __MF_PLATFORM__ ===');
console.log(JSON.stringify(platform, null, 2));

await page.screenshot({ path: join(OUT, 'qa-5006-final.png'), fullPage: false });

console.log('=== 4xx responses (MegaForm-related) ===');
if (fourxx.length === 0) console.log('  (none — CLEAN)');
else fourxx.forEach(r => console.log('  ' + r));

await browser.close();
