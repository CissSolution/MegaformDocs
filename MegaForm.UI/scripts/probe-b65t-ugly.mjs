// [B65t] Diagnose visual issues: 2 thick gray bars + label overlap in iframe
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

await page.goto(SITE + '/megaform/Home/mfFormId/1270?mfFormId=1270#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(15000);

// Click THEME tab
await page.evaluate(() => { const t = document.querySelector('#mf-tab-link-theme'); if (t) t.click(); });
await page.waitForTimeout(4500);
await page.screenshot({ path: 'qa-out/b65t-01-theme-mode.png', fullPage: false });

const diag = await page.evaluate(() => {
  const iframe = document.querySelector('.mf-theme-preview-frame');
  if (!iframe) return { hasIframe: false };
  const doc = iframe.contentDocument;
  if (!doc) return { hasIframe: true, hasDoc: false };
  // Find labels that overlap
  const labels = Array.from(doc.querySelectorAll('label, .mf-label, .mf-form-label'));
  const labelInfo = labels.slice(0, 8).map(l => {
    const r = l.getBoundingClientRect();
    return { text: (l.textContent || '').trim().slice(0, 30), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
  });
  // Find FlexGrid items + their --lg-y placements
  const items = Array.from(doc.querySelectorAll('.mf-flexgrid-item, [data-field-key]')).slice(0, 10);
  const items2 = items.map(i => {
    const r = i.getBoundingClientRect();
    const s = i.getAttribute('style') || '';
    return { cls: i.className.slice(0, 80), y: Math.round(r.y), h: Math.round(r.height), style: s.slice(0, 100) };
  });
  // Find scrollbars / vertical bars
  const docW = doc.documentElement.scrollWidth;
  const docH = doc.documentElement.scrollHeight;
  const winW = doc.documentElement.clientWidth;
  const winH = doc.documentElement.clientHeight;
  // Find any thick bar-like elements
  const candidates = Array.from(doc.querySelectorAll('*')).filter(el => {
    const r = el.getBoundingClientRect();
    return r.width < 12 && r.height > 100 && r.x > 400;
  }).slice(0, 8);
  const barsInfo = candidates.map(c => {
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    return { tag: c.tagName, cls: c.className.toString().slice(0, 60), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor };
  });
  return { hasIframe: true, hasDoc: true, labelInfo, items2, docW, docH, winW, winH, barsInfo, iframeOverflowX: getComputedStyle(doc.documentElement).overflowX, iframeOverflowY: getComputedStyle(doc.documentElement).overflowY };
});

// Dump iframe HTML structure around overlapping labels
const dump = await page.evaluate(() => {
  const iframe = document.querySelector('.mf-theme-preview-frame');
  if (!iframe) return null;
  const doc = iframe.contentDocument;
  if (!doc) return null;
  const fields = doc.querySelector('.mf-fields-container');
  return fields ? fields.outerHTML.slice(0, 4000) : (doc.body.innerHTML || '').slice(0, 4000);
});
await browser.close();
console.log(JSON.stringify(diag, null, 2));
console.log('==DUMP==');
console.log(dump);
