// Call a DNN/MegaForm API from a real host session, through Playwright's request context rather
// than the page's own fetch.
//
//   node tools/browser-qa/dnn-api-request.mjs GET  /DesktopModules/MegaForm/API/AiAssistant/DefaultConfig
//   node tools/browser-qa/dnn-api-request.mjs POST /path body.json
//
// Why this exists alongside dnn-api-call.mjs: on a page that carries a MegaForm module,
// megaform-renderer.js installs a window.fetch wrapper, and an in-page fetch to some endpoints
// throws "TypeError: Failed to fetch" from inside that wrapper — which reads exactly like a network
// failure and is not one. page.request shares the browser's cookies but never enters page script.
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = (process.env.DNN_BASE_URL || 'https://dnndefender.com').replace(/\/$/, '');
const [, , method, apiPath, bodyFile] = process.argv;
if (!method || !apiPath) throw new Error('usage: <GET|POST> <apiPath> [bodyFile.json]');
if (!process.env.DNN_PASSWORD) throw new Error('Set DNN_PASSWORD.');

const mask = (v) => {
  if (v && typeof v === 'object') {
    const out = Array.isArray(v) ? [] : {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = /key|secret|token|password/i.test(k) && typeof val === 'string' && val.length > 6
        ? val.slice(0, 4) + '…(' + val.length + ' chars)'
        : mask(val);
    }
    return out;
  }
  return v;
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/?ctl=Login&returnurl=%2f`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill(process.env.DNN_USER || 'host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill(process.env.DNN_PASSWORD);
await Promise.all([
  page.waitForLoadState('networkidle', { timeout: 90000 }).catch(() => {}),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);
// Land on a real page before reading the token. Taken straight off the login response it belongs
// to the pre-auth session, and every POST answers 401 with an empty body — which reads like a
// permissions problem rather than a stale token. (Same trap megaform-records-apply.mjs hit.)
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!document.querySelector('input[name="__RequestVerificationToken"]'),
  { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1200);

const token = await page.evaluate(() =>
  document.querySelector('input[name="__RequestVerificationToken"]')?.value || '');

const headers = { RequestVerificationToken: token, 'X-Requested-With': 'XMLHttpRequest' };
const url = BASE + apiPath;
let res;
if (method.toUpperCase() === 'POST') {
  const body = bodyFile ? fs.readFileSync(bodyFile, 'utf8') : '{}';
  res = await ctx.request.post(url, { headers: { ...headers, 'Content-Type': 'application/json' }, data: body });
} else {
  res = await ctx.request.get(url, { headers });
}
const text = await res.text();
let parsed = null; try { parsed = JSON.parse(text); } catch { /* not json */ }
console.log(JSON.stringify({ status: res.status(), body: parsed ? mask(parsed) : text.slice(0, 600) }, null, 2));
await browser.close();
