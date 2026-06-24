// Deep trace of Form A Level 3 — capture network + widget DOM after picks
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.clearCookies();
const page = await ctx.newPage();

const net = [];
page.on('response', async r => {
  const url = r.url();
  if (/Subform|DataRepeater|FieldOptions|Razor|sql|widget/i.test(url)) {
    try {
      const body = await r.text();
      net.push({ url: url.replace(BASE, ''), status: r.status(), body: body.slice(0, 200) });
    } catch (e) { net.push({ url: url.replace(BASE, ''), status: r.status() }); }
  }
});
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

await page.goto(`${BASE}/xx?formid=336`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);

// Initial DOM snapshot — what's there
const initial = await page.evaluate(() => {
  return {
    selectCount: document.querySelectorAll('select').length,
    selectNames: Array.from(document.querySelectorAll('select')).map(s => s.name),
    dataRepeaters: document.querySelectorAll('.mfw-data-repeater, [data-mfw-widget="DataRepeater"]').length,
    allWidgets: Array.from(document.querySelectorAll('[class*="mfw-"]')).slice(0, 10).map(e => e.className.split(' ')[0]),
    bodyTextLen: document.body.textContent.length
  };
});
console.log('=== Initial DOM ===');
console.log(JSON.stringify(initial, null, 2));

// Pick customer 18
await page.evaluate(() => {
  const sel = document.querySelector('select[name="customer_id"]');
  if (!sel) return;
  sel.value = '18';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(2500);

// Pick first order
await page.evaluate(() => {
  const sel = document.querySelector('select[name="order_id"]');
  if (!sel) return;
  const opt = Array.from(sel.options).find(o => o.value);
  if (opt) {
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
await page.waitForTimeout(5000); // wait longer for AJAX

// Final DOM trace
const final = await page.evaluate(() => {
  const dataRepeaters = Array.from(document.querySelectorAll('.mfw-data-repeater, [data-mfw-widget="DataRepeater"]'));
  const allTrs = document.querySelectorAll('tr, [data-row]');
  const orderItemsWidget = document.querySelector('[data-field-key="order_items"], [data-field-key="order_items_table"]');
  return {
    dataRepeaterCount: dataRepeaters.length,
    drInnerLen: dataRepeaters.map(d => (d.innerHTML || '').length),
    drTexts: dataRepeaters.map(d => (d.textContent || '').slice(0, 200).trim()),
    allTrCount: allTrs.length,
    orderItemsWrap: !!orderItemsWidget,
    orderItemsHtml: orderItemsWidget ? orderItemsWidget.outerHTML.slice(0, 500) : null,
    allFieldKeys: Array.from(document.querySelectorAll('[data-field-key]')).map(e => e.getAttribute('data-field-key'))
  };
});
console.log('\n=== After order pick ===');
console.log(JSON.stringify(final, null, 2));
await page.screenshot({ path: join(OUT, 'qa-form336-after-order-pick.png'), fullPage: true });

console.log('\n=== Network captures ===');
console.log(JSON.stringify(net.slice(-15), null, 2));
console.log('\n=== Console errors ===');
console.log(JSON.stringify(errs.slice(0, 8), null, 2));

await browser.close();
