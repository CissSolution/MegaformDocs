// Smoke test BYOM L2 — /API/UserTemplate/List returns discovered widgets
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.clearCookies();
const page = await ctx.newPage();

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click();
await page.waitForTimeout(4000);

// Probe: call /API/UserTemplate/List as the logged-in host user
const p1 = await page.evaluate(async () => {
  const res = await fetch('/DesktopModules/MegaForm/API/UserTemplate/List', {
    credentials: 'same-origin'
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return {
    status: res.status,
    ok: res.ok,
    bodyPreview: text.slice(0, 600),
    isArray: Array.isArray(json),
    count: Array.isArray(json) ? json.length : null,
    firstItem: Array.isArray(json) && json.length ? json[0] : null
  };
});
console.log('=== PROBE: /API/UserTemplate/List ===');
console.log(JSON.stringify(p1, null, 2));

// Probe Detail endpoint
const p2 = await page.evaluate(async () => {
  const res = await fetch('/DesktopModules/MegaForm/API/UserTemplate/Detail?name=HelloBYOM', {
    credentials: 'same-origin'
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return {
    status: res.status,
    ok: res.ok,
    bodyPreview: text.slice(0, 800),
    hasKind: json && !!json.Kind || (json && !!json.kind),
    name: json && (json.Name || json.name),
    templateVirtualPath: json && (json.TemplateVirtualPath || json.templateVirtualPath),
  };
});
console.log('=== PROBE: /API/UserTemplate/Detail?name=HelloBYOM ===');
console.log(JSON.stringify(p2, null, 2));

await browser.close();
