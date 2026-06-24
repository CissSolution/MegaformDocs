// Comprehensive Playwright E2E suite for BYOM L1-L4 (with L5 token fix verification).
// Runs 11 test cases against the live DNN host and prints PASS/FAIL per case + summary.
//
// Usage: node scripts/smoke-byom-e2e.mjs
import { chromium } from 'playwright-core';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const API = '/DesktopModules/MegaForm/API/UserTemplate';

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok ? 'PASS' : 'FAIL';
  const line = `[${tag}] ${name}`;
  if (ok) {
    console.log(line + (detail ? ` :: ${detail}` : ''));
  } else {
    console.log(line + (detail ? ` :: ${detail}` : ''));
  }
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.clearCookies();
const page = await ctx.newPage();

try {
  // ----- Login -----
  await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
  await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
  await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click();
  await page.waitForTimeout(4000);

  // Helper: in-page fetch returning {status, text, json}
  async function call(method, url, body) {
    return await page.evaluate(async ({ method, url, body }) => {
      const headers = { 'Content-Type': 'application/json' };
      const tokenEl = document.querySelector('input[name="__RequestVerificationToken"]');
      if (tokenEl && tokenEl.value) headers['RequestVerificationToken'] = tokenEl.value;
      const res = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers,
        body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      return { status: res.status, text, json };
    }, { method, url, body });
  }

  // ----- T1: LIST -----
  try {
    const r = await call('GET', `${API}/List`);
    const isArr = Array.isArray(r.json);
    const count = isArr ? r.json.length : -1;
    const ok = r.status === 200 && isArr && count >= 15;
    record('T1 LIST returns 200 + array + count>=15',
      ok,
      `status=${r.status} isArray=${isArr} count=${count}`);
  } catch (e) {
    record('T1 LIST returns 200 + array + count>=15', false, `EXCEPTION ${e.message}`);
  }

  // ----- T2: DETAIL HelloBYOM -----
  try {
    const r = await call('GET', `${API}/Detail?name=HelloBYOM`);
    const j = r.json || {};
    const kind = j.Kind ?? j.kind;
    const tpath = j.TemplateVirtualPath ?? j.templateVirtualPath ?? '';
    const params = j.Params ?? j.params ?? [];
    const endsTemplateHtml = typeof tpath === 'string' && /template\.html$/i.test(tpath);
    const paramsLen = Array.isArray(params) ? params.length : -1;
    const ok = r.status === 200 && kind === 0 && endsTemplateHtml && paramsLen >= 1;
    record('T2 DETAIL HelloBYOM = Kind=0 + template.html + Params>=1',
      ok,
      `status=${r.status} kind=${kind} tpath=${tpath} paramsLen=${paramsLen}`);
  } catch (e) {
    record('T2 DETAIL HelloBYOM = Kind=0 + template.html + Params>=1', false, `EXCEPTION ${e.message}`);
  }

  // ----- T3: DETAIL 404 -----
  try {
    const r = await call('GET', `${API}/Detail?name=NonExistentXYZ`);
    const ok = r.status === 404;
    record('T3 DETAIL NonExistentXYZ returns 404', ok, `status=${r.status}`);
  } catch (e) {
    record('T3 DETAIL NonExistentXYZ returns 404', false, `EXCEPTION ${e.message}`);
  }

  // ----- T4: SOURCE GET basic -----
  try {
    const r = await call('GET', `${API}/Source?name=HelloBYOM`);
    const j = r.json || {};
    const content = j.content ?? j.Content ?? '';
    const writable = j.writable ?? j.Writable;
    const hasHello = typeof content === 'string' && /Hello from BYOM/i.test(content);
    const ok = r.status === 200 && hasHello && writable === true;
    record('T4 SOURCE GET HelloBYOM contains "Hello from BYOM" + writable=true',
      ok,
      `status=${r.status} hasHello=${hasHello} writable=${writable}`);
  } catch (e) {
    record('T4 SOURCE GET HelloBYOM contains "Hello from BYOM" + writable=true', false, `EXCEPTION ${e.message}`);
  }

  // ----- T5: SOURCE GET whitelist (.exe) -----
  try {
    const r = await call('GET', `${API}/Source?name=HelloBYOM&file=evil.exe`);
    const ok = r.status === 400;
    record('T5 SOURCE GET evil.exe -> 400', ok, `status=${r.status}`);
  } catch (e) {
    record('T5 SOURCE GET evil.exe -> 400', false, `EXCEPTION ${e.message}`);
  }

  // ----- T6: SOURCE GET path traversal -----
  try {
    const r = await call('GET', `${API}/Source?name=HelloBYOM&file=../../../etc/hosts`);
    const ok = r.status === 400;
    record('T6 SOURCE GET ../../../etc/hosts -> 400', ok, `status=${r.status}`);
  } catch (e) {
    record('T6 SOURCE GET ../../../etc/hosts -> 400', false, `EXCEPTION ${e.message}`);
  }

  // ----- T7: RENDER HelloBYOM (post-L5 fix) -----
  try {
    const r = await call('POST', `${API}/Render`, {
      Name: 'HelloBYOM',
      FormId: 0,
      FieldKey: 'demo',
      Row: { greeting: 'Xin chao L5' },
      Form: {},
      Params: {}
    });
    const j = r.json || {};
    const html = j.html ?? j.Html ?? '';
    const hasGreeting = typeof html === 'string' && /Xin chao L5/i.test(html);
    const ok = r.status === 200 && hasGreeting;
    record('T7 RENDER HelloBYOM with greeting=Xin chao L5 -> html contains "Xin chao L5"',
      ok,
      `status=${r.status} hasGreeting=${hasGreeting} htmlSnip=${String(html).slice(0, 160)}`);
  } catch (e) {
    record('T7 RENDER HelloBYOM (L5 token fix)', false, `EXCEPTION ${e.message}`);
  }

  // ----- T8: RENDER ProductCard basic -----
  try {
    const r = await call('POST', `${API}/Render`, {
      Name: 'ProductCard',
      FormId: 0,
      FieldKey: 'demo',
      Row: { name: 'Test', price: '99' },
      Form: {},
      Params: {}
    });
    const j = r.json || {};
    const html = j.html ?? j.Html ?? '';
    const hasTest = typeof html === 'string' && /Test/.test(html);
    const ok = r.status === 200 && hasTest;
    record('T8 RENDER ProductCard with name=Test -> html contains "Test"',
      ok,
      `status=${r.status} hasTest=${hasTest} htmlSnip=${String(html).slice(0, 160)}`);
  } catch (e) {
    record('T8 RENDER ProductCard basic', false, `EXCEPTION ${e.message}`);
  }

  // ----- T9: RENDER unknown widget -----
  try {
    const r = await call('POST', `${API}/Render`, { Name: 'NonExistentXYZ' });
    const ok = r.status === 404;
    record('T9 RENDER NonExistentXYZ -> 404', ok, `status=${r.status}`);
  } catch (e) {
    record('T9 RENDER NonExistentXYZ -> 404', false, `EXCEPTION ${e.message}`);
  }

  // ----- T10: REFRESH -----
  try {
    const r = await call('POST', `${API}/Refresh`, {});
    const j = r.json || {};
    const count = j.count ?? j.Count ?? j.discovered ?? j.Discovered ?? (Array.isArray(j) ? j.length : null);
    const ok = r.status === 200 && (typeof count === 'number' || count !== null);
    record('T10 REFRESH -> 200 with discovered count',
      ok,
      `status=${r.status} count=${count} bodySnip=${r.text.slice(0, 200)}`);
  } catch (e) {
    record('T10 REFRESH', false, `EXCEPTION ${e.message}`);
  }

  // ----- T11: SOURCE PUT round-trip and revert -----
  try {
    // Step A: Get original
    const r1 = await call('GET', `${API}/Source?name=HelloBYOM&file=template.html`);
    const j1 = r1.json || {};
    const original = j1.content ?? j1.Content ?? '';
    if (r1.status !== 200 || typeof original !== 'string' || !original.length) {
      throw new Error(`Step A GET failed status=${r1.status} contentLen=${original?.length}`);
    }

    // Step B: PUT new content (controller routes "PUT" via HTTP POST + ActionName=Source)
    const newContent = '<div>L5 test</div>';
    const r2 = await call('POST', `${API}/Source`, {
      Name: 'HelloBYOM',
      File: 'template.html',
      Content: newContent
    });
    if (r2.status !== 200) {
      throw new Error(`Step B PUT failed status=${r2.status} body=${r2.text.slice(0, 200)}`);
    }

    // Step C: GET to verify
    const r3 = await call('GET', `${API}/Source?name=HelloBYOM&file=template.html`);
    const j3 = r3.json || {};
    const after = j3.content ?? j3.Content ?? '';
    const verifiedNew = typeof after === 'string' && after.trim() === newContent;

    // Step D: PUT revert (POST + ActionName=Source)
    const r4 = await call('POST', `${API}/Source`, {
      Name: 'HelloBYOM',
      File: 'template.html',
      Content: original
    });
    if (r4.status !== 200) {
      throw new Error(`Step D PUT revert failed status=${r4.status} body=${r4.text.slice(0, 200)}`);
    }

    // Step E: Final GET to confirm revert
    const r5 = await call('GET', `${API}/Source?name=HelloBYOM&file=template.html`);
    const j5 = r5.json || {};
    const final = j5.content ?? j5.Content ?? '';
    const reverted = typeof final === 'string' && final.trim() === original.trim();

    const ok = verifiedNew && reverted;
    record('T11 SOURCE PUT round-trip + revert',
      ok,
      `verifiedNew=${verifiedNew} reverted=${reverted} originalLen=${original.length} finalLen=${final.length}`);
  } catch (e) {
    record('T11 SOURCE PUT round-trip + revert', false, `EXCEPTION ${e.message}`);
  }

} finally {
  await browser.close();
}

const passed = results.filter(r => r.ok).length;
const failed = results.length - passed;
console.log('');
console.log('=== SUMMARY ===');
console.log(`PASS ${passed}/${results.length}`);
if (failed > 0) {
  console.log('--- Failures ---');
  for (const r of results.filter(x => !x.ok)) {
    console.log(`  ${r.name} :: ${r.detail || '(no detail)'}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
