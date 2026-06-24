// Visit the actual form 1256 URL the user mentioned + capture network for FieldOptions
import { chromium } from 'playwright-core';
const BASE='http://dnn10322_megatest.ai';
const FORM_URL='/xx?formid=1256';
const CHROME='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  const reqs = [];
  page.on('response', async (r) => {
    const u = r.url();
    if (/FieldOptions|Submit\/Schema|Field\/Options/i.test(u)) {
      let body = '';
      try { body = await r.text(); } catch {}
      reqs.push({ url: u, status: r.status(), body: body.slice(0, 500) });
    }
  });
  const consoleMsgs = [];
  page.on('console', m => consoleMsgs.push('[' + m.type() + '] ' + m.text().slice(0, 300)));
  page.on('pageerror', e => consoleMsgs.push('[pageerror] ' + String(e).slice(0, 300)));

  await page.goto(BASE + FORM_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Inspect the rendered department dropdown
  const state = await page.evaluate(() => {
    const dept = document.querySelector('select[name="department"]');
    const all = Array.from(document.querySelectorAll('select')).map(s => ({
      name: s.name || s.id,
      optCount: s.options.length,
      sample: Array.from(s.options).slice(0, 5).map(o => ({ v: o.value, l: o.text }))
    }));
    return { deptOptCount: dept?.options?.length || 0, deptSample: Array.from(dept?.options || []).slice(0,8).map(o => ({ v: o.value, l: o.text })), allSelects: all };
  });

  console.log('--- All selects ---');
  console.log(JSON.stringify(state.allSelects, null, 2));
  console.log('\n--- Department detail ---');
  console.log('option count:', state.deptOptCount, 'sample:', state.deptSample);
  console.log('\n--- Network (FieldOptions / Schema) ---');
  reqs.forEach(r => console.log(r.status, r.url, '\n   ', r.body));
  console.log('\n--- Console msgs ---');
  consoleMsgs.slice(0, 20).forEach(m => console.log(' ', m));

  await page.screenshot({ path: 'qa-out/form-1256-render.png', fullPage: true });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
