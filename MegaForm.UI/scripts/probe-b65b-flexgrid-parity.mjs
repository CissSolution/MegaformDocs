// [B65b] Verify builder THEME mode iframe shows form 342 with 2-col FlexGrid
// matching runtime view. Compare Appointment + MultiSelect y positions in both
// builder THEME iframe AND runtime /xx?formid=342.
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

// ── Builder THEME mode for form 342 ──
await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=342#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(14000);
await page.evaluate(() => { const t = document.querySelector('#mf-tab-link-theme'); if (t) t.click(); });
await page.waitForTimeout(5000);

await page.screenshot({ path: 'qa-out/b65b-01-builder-theme-342.png', fullPage: false });

const builderIframeProbe = await page.evaluate(() => {
  const iframe = document.querySelector('.mf-theme-preview-frame');
  if (!iframe) return { ok: false };
  const doc = iframe.contentDocument;
  if (!doc) return { ok: false };
  const items = Array.from(doc.querySelectorAll('.mf-flexgrid-item'));
  const labels = items.map(it => {
    const lbl = it.querySelector('label, .mf-label, [class*="label"]');
    const labelText = lbl ? (lbl.textContent || '').trim().slice(0, 30) : '';
    const r = it.getBoundingClientRect();
    return { label: labelText, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  });
  // Identify Appointment + MultiSelect specifically
  const appt = labels.find(l => /appointment/i.test(l.label));
  const multi = labels.find(l => /multiselect|multi/i.test(l.label));
  const datePicker = labels.find(l => /date picker|date/i.test(l.label));
  const lastName = labels.find(l => /last name/i.test(l.label));
  return {
    ok: true,
    iframeWidth: doc.documentElement.clientWidth,
    itemCount: items.length,
    appointment: appt,
    multiSelect: multi,
    datePicker,
    lastName,
    yDiffApptMulti: appt && multi ? Math.abs(appt.y - multi.y) : null,
    sideBySideApptMulti: appt && multi ? (Math.abs(appt.y - multi.y) < 30) : null,
    allLabels: labels.slice(0, 8)
  };
});

// ── Runtime view ──
await page.goto('http://dnn10322_megaf.ai/xx?formid=342', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(10000);

await page.screenshot({ path: 'qa-out/b65b-02-runtime-342.png', fullPage: false });

const runtimeProbe = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('.mf-flexgrid-item'));
  const labels = items.map(it => {
    const lbl = it.querySelector('label, .mf-label, [class*="label"]');
    const labelText = lbl ? (lbl.textContent || '').trim().slice(0, 30) : '';
    const r = it.getBoundingClientRect();
    return { label: labelText, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  });
  const appt = labels.find(l => /appointment/i.test(l.label));
  const multi = labels.find(l => /multiselect|multi/i.test(l.label));
  return {
    viewportWidth: document.documentElement.clientWidth,
    itemCount: items.length,
    appointment: appt,
    multiSelect: multi,
    yDiffApptMulti: appt && multi ? Math.abs(appt.y - multi.y) : null,
    sideBySideApptMulti: appt && multi ? (Math.abs(appt.y - multi.y) < 30) : null,
    allLabels: labels.slice(0, 8)
  };
});

await browser.close();
const result = { builderIframeProbe, runtimeProbe };
writeFileSync('qa-out/b65b-probe.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
