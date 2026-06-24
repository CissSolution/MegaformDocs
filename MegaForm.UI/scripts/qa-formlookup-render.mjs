// Visual QA — FormLookup renders as <select> populated from another form.
// Loads the standalone test HTML, waits for MegaFormRenderer to fetch options
// via /Submit/FieldOptions, inspects the job_id <select>'s child <option>s.

import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const URL = 'http://dnn10322_megatest.ai/Portals/_default/Containers/formlookup-test.html';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const fieldOptionsHits = [];

  page.on('request', req => {
    if (/Submit\/FieldOptions/i.test(req.url())) fieldOptionsHits.push({ url: req.url(), method: req.method() });
  });
  page.on('response', async resp => {
    if (/Submit\/FieldOptions/i.test(resp.url())) {
      try {
        const body = await resp.text();
        fieldOptionsHits.push({ kind: 'response', status: resp.status(), body: body.slice(0, 500) });
      } catch {}
    }
  });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  // Renderer is async — give it time to fetch + populate
  await page.waitForTimeout(4000);

  // Inspect ALL selects on page + look up job_id specifically
  const dom = await page.evaluate(() => {
    const out = {};
    out.allSelects = Array.from(document.querySelectorAll('select')).map(s => ({
      id: s.id, name: s.getAttribute('name'), optCount: s.options.length
    }));
    out.byJobIdName  = !!document.querySelector('select[name="job_id"]');
    out.byJobIdId    = !!document.querySelector('[id$="-job_id"]');
    const sel = document.querySelector('select[name="job_id"], [id$="-job_id"]');
    if (sel) {
      out.found = true;
      out.tag = sel.tagName;
      out.id = sel.id;
      out.options = Array.from(sel.querySelectorAll('option')).map(o => ({ value: o.value, label: (o.textContent||'').trim() }));
      out.optCount = out.options.length;
    } else {
      out.found = false;
      out.bodyClasses = document.body.className;
      out.title = document.title;
      out.containers = Array.from(document.querySelectorAll('[id*="megaform"], [id*="mf-"]')).slice(0,5).map(e => ({ id: e.id, tag: e.tagName }));
    }
    return out;
  });
  console.log('[DOM]', JSON.stringify(dom, null, 2));
  console.log('[FieldOptions network hits]', JSON.stringify(fieldOptionsHits, null, 2));

  await page.screenshot({ path: 'qa-out/formlookup-render.png', fullPage: false });

  const realOptions = dom.options ? dom.options.filter(o => o.value && /\d+/.test(o.value)) : [];
  const pass = dom.found && realOptions.length >= 3;
  console.log(pass ? '\n=== PASS — job_id rendered as <select> with ' + realOptions.length + ' job posting options ===' : '\n=== FAIL ===');

  writeFileSync('qa-out/formlookup-render.json', JSON.stringify({ dom, fieldOptionsHits, pass }, null, 2), 'utf8');
  await browser.close();
  process.exit(pass ? 0 : 2);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
