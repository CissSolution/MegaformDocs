// Smoke test BYOM L3 — /API/UserTemplate/Render dispatches HelloBYOM HTML
import { chromium } from 'playwright-core';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click();
await page.waitForTimeout(4000);

// Probe POST /API/UserTemplate/Render with HelloBYOM
const p1 = await page.evaluate(async () => {
  const res = await fetch('/DesktopModules/MegaForm/API/UserTemplate/Render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      Name: 'HelloBYOM',
      FormId: 0,
      FieldKey: 'demo',
      Row: { greeting: 'Xin chao tu BYOM Layer 3' },
      Form: {},
      Params: {}
    })
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return {
    status: res.status,
    ok: res.ok,
    bodyPreview: text.slice(0, 800),
    htmlContainsGreeting: typeof json?.html === 'string' && /Xin chao/i.test(json.html),
    htmlContainsHello: typeof json?.html === 'string' && /Hello from BYOM/i.test(json.html),
    kind: json?.kind,
    success: json?.success
  };
});
console.log('=== PROBE: /API/UserTemplate/Render HelloBYOM ===');
console.log(JSON.stringify(p1, null, 2));

// Probe GET /API/UserTemplate/Source for editor preload
const p2 = await page.evaluate(async () => {
  const res = await fetch('/DesktopModules/MegaForm/API/UserTemplate/Source?name=HelloBYOM', {
    credentials: 'same-origin'
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return {
    status: res.status,
    file: json?.file,
    sizeBytes: json?.sizeBytes,
    writable: json?.writable,
    contentSnippet: typeof json?.content === 'string' ? json.content.slice(0, 200) : null
  };
});
console.log('=== PROBE: /API/UserTemplate/Source?name=HelloBYOM ===');
console.log(JSON.stringify(p2, null, 2));

// Probe Monaco lazy chunk exists
const p3 = await page.evaluate(async () => {
  const res = await fetch('/DesktopModules/MegaForm/Assets/js/megaform-unified-monaco.js', {
    method: 'HEAD'
  });
  return { status: res.status, sizeBytes: res.headers.get('content-length') };
});
console.log('=== PROBE: megaform-unified-monaco.js asset ===');
console.log(JSON.stringify(p3, null, 2));

await browser.close();
