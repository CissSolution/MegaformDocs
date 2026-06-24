// Inspect what /Submissions/Get returns on DNN vs what the detail shell needs.
// User reports the Data View tab inputs are all EMPTY even though the row
// shows real subject/snippet → values aren't reaching the shell.

import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const BASE = 'http://dnn10322_megatest.ai';
const PAGE = '/Shop/New-Arrivals';
const USER = 'host';
const PASS = 'dnnhost';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function dnnLogin(page) {
  await page.goto(BASE + '/Login?ReturnUrl=' + encodeURIComponent(PAGE), { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('input[id$=txtUsername]', { timeout: 30000 });
  await page.fill('input[id$=txtUsername]', USER);
  await page.fill('input[id$=txtPassword]', PASS);
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }).catch(()=>{}),
    page.locator('input[id$=cmdLogin],a[id$=cmdLogin],button:has-text("Login")').first().click(),
  ]);
  await page.waitForTimeout(2000);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  const consoleErrs = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 400)); });
  page.on('pageerror', e => consoleErrs.push('[pageerror] ' + String(e).slice(0, 400)));

  await dnnLogin(page);
  await page.goto(BASE + PAGE + '#mf-submissions', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // List the first 10 submission IDs the inbox is showing so we pick one.
  const subs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.mf-sx-row')).slice(0, 10).map(r => ({
      id: Number(r.getAttribute('data-mf-sub-id') || 0),
      formId: Number(r.getAttribute('data-mf-form-id') || 0),
      who: r.querySelector('.mf-sx-row-sender')?.textContent?.trim(),
      formTitle: r.querySelector('.mf-sx-row-pill')?.textContent?.trim(),
      subject: r.querySelector('.mf-sx-row-subject')?.textContent?.trim(),
    }));
  });
  console.log('[first 10 rows]', JSON.stringify(subs, null, 2));

  // Pick the first LEAVE REQUEST submission (skip PO ones that the user said are too simple).
  const target = subs.find(s => /leave/i.test(s.formTitle || '')) || subs[0];
  if (!target || !target.id) {
    console.log('No row to inspect — bailing.');
    await browser.close();
    return;
  }
  console.log('[selected]', JSON.stringify(target));

  // Direct fetch of the detail endpoint — bypass the shell so we see raw shape.
  const rawDetail = await page.evaluate(async (id) => {
    const tries = [
      '/DesktopModules/MegaForm/API/Submission/Get?submissionId=' + id,
      '/DesktopModules/MegaForm/API/Submissions/Get?submissionId=' + id,
      '/DesktopModules/MegaForm/API/Submissions/' + id,
    ];
    const out = [];
    for (const url of tries) {
      try {
        const r = await fetch(url, { credentials: 'same-origin' });
        const t = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(t); } catch {}
        out.push({
          url,
          status: r.status,
          keys: parsed ? Object.keys(parsed) : null,
          valuesType: parsed?.values ? Array.isArray(parsed.values) ? 'array' : typeof parsed.values : 'missing',
          valuesKeys: parsed?.values && !Array.isArray(parsed.values) ? Object.keys(parsed.values).slice(0, 20) : null,
          sampleValuePair: parsed?.values ? Object.entries(parsed.values).slice(0, 3) : null,
          submissionDataJson: parsed?.submission?.dataJson || parsed?.Submission?.DataJson || null,
          schemaFieldsCount: Array.isArray(parsed?.schema?.fields) ? parsed.schema.fields.length :
                             Array.isArray(parsed?.Schema?.Fields) ? parsed.Schema.Fields.length : null,
          schemaFieldsSample: (parsed?.schema?.fields || parsed?.Schema?.Fields || []).slice(0, 5).map(f => ({ key: f.key || f.Key, label: f.label || f.Label, type: f.type || f.Type })),
        });
        if (r.ok) break;
      } catch (e) {
        out.push({ url, error: String(e) });
      }
    }
    return out;
  }, target.id);
  console.log('[raw detail]', JSON.stringify(rawDetail, null, 2));

  // Now click the row and inspect the rendered modal
  await page.evaluate((id) => {
    const row = document.querySelector(`.mf-sx-row[data-mf-sub-id="${id}"]`);
    if (row) row.click();
  }, target.id);
  await page.waitForTimeout(2500);

  const modalState = await page.evaluate(() => {
    const ov = document.querySelector('.mf-sx-modal-overlay');
    if (!ov) return { hasOverlay: false };
    const inputs = Array.from(ov.querySelectorAll('input, textarea')).slice(0, 12).map(el => ({
      type: el.tagName + ':' + (el.getAttribute('type') || ''),
      value: (el.value || '').slice(0, 120),
      name: el.getAttribute('name'),
      placeholder: el.getAttribute('placeholder'),
    }));
    return {
      hasOverlay: true,
      title: ov.querySelector('.mf-sx-modal-title')?.textContent,
      tabs: Array.from(ov.querySelectorAll('.mf-modal-tab')).map(t => t.textContent?.trim()),
      activeTabText: ov.querySelector('.mf-modal-tab.active')?.textContent?.trim(),
      inputCount: inputs.length,
      inputs,
      dataTabHtmlPreview: (ov.querySelector('.mf-subdetail-shell')?.innerHTML || '').slice(0, 600),
    };
  });
  console.log('[modal]', JSON.stringify(modalState, null, 2));
  console.log('[console errors]', consoleErrs.slice(0, 8));

  await page.screenshot({ path: 'qa-out/dnn-submission-detail.png', fullPage: false });
  writeFileSync('qa-out/dnn-submission-detail.json', JSON.stringify({ subs, target, rawDetail, modalState, consoleErrs }, null, 2), 'utf8');

  await browser.close();
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
