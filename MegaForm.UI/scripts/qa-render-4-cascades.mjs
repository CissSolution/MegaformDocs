// Render the 4 cascade forms (336-339) and verify real data appears at each level.
// Flow per form:
//   1. Goto /xx?formid=N
//   2. Snapshot Customer Select options (should have >= 20 options)
//   3. Pick customer #1 → wait → check Order Select options populate
//   4. Pick first order → wait → check items widget populates with product rows
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const FORMS = [
  { id: 336, label: 'A', title: 'All-Select + DataRepeater', itemSelector: '.mfw-data-repeater, [data-widget="DataRepeater"]' },
  { id: 337, label: 'B', title: 'All-Select + Razor table',   itemSelector: '.mfw-content-slider, .mf-razor-content, .mfw-razor, [data-widget="Razor"]' },
  { id: 338, label: 'C', title: 'Razor MasterDetailList',     itemSelector: '.mf-razor-md, .mf-razor-content, [data-widget="Razor"]' },
  { id: 339, label: 'D', title: 'Mixed (DataRepeater + Razor)', itemSelector: '.mfw-data-repeater, .mf-razor-content, [data-widget="Razor"]' },
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.clearCookies();
const page = await ctx.newPage();

// Login first — public form view may require auth on this portal
await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

const out = [];

for (const F of FORMS) {
  console.log(`\n=== Form ${F.label} (#${F.id}): ${F.title} ===`);
  try {
    await page.goto(`${BASE}/xx?formid=${F.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    await page.waitForTimeout(3000);
    await page.goto(`${BASE}/xx?formid=${F.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await page.waitForTimeout(6000);

  // PROBE 1: customer select populated?
  const p1 = await page.evaluate(() => {
    const sel = document.querySelector('select[name="customer_id"], [data-field-key="customer_id"] select');
    if (!sel) {
      const allSelects = Array.from(document.querySelectorAll('select')).map(s => ({
        name: s.name, id: s.id, optCount: s.options.length, sample: s.options.length > 1 ? s.options[1]?.textContent?.slice(0, 30) : ''
      }));
      const formMarker = document.querySelector('.mf-form, [data-form-id]');
      return {
        error: 'no customer select',
        allSelects: allSelects.slice(0, 8),
        hasFormMarker: !!formMarker,
        formMarkerAttr: formMarker ? formMarker.getAttribute('data-form-id') : null
      };
    }
    const opts = Array.from(sel.options).filter(o => o.value);
    return {
      optCount: opts.length,
      firstFew: opts.slice(0, 5).map(o => ({ v: o.value, l: o.textContent?.trim().slice(0, 40) })),
      lastFew: opts.slice(-3).map(o => ({ v: o.value, l: o.textContent?.trim().slice(0, 40) }))
    };
  });
  console.log('Customer select:', JSON.stringify(p1));
  await page.screenshot({ path: join(OUT, `qa-cascade-render-${F.label}-1-customer.png`), fullPage: false });

  // Pick a customer (first non-empty option)
  const pickedCustomer = await page.evaluate(() => {
    const sel = document.querySelector('select[name="customer_id"], [data-field-key="customer_id"] select');
    if (!sel) return null;
    const opt = Array.from(sel.options).find(o => o.value);
    if (!opt) return null;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { v: opt.value, l: opt.textContent?.trim() };
  });
  console.log('Picked customer:', JSON.stringify(pickedCustomer));
  await page.waitForTimeout(2500);

  // PROBE 2: order select populated (or for Form C: Razor master list)
  const p2 = await page.evaluate(() => {
    const orderSel = document.querySelector('select[name="order_id"], [data-field-key="order_id"] select');
    if (orderSel) {
      const opts = Array.from(orderSel.options).filter(o => o.value);
      return {
        type: 'select',
        optCount: opts.length,
        firstFew: opts.slice(0, 3).map(o => ({ v: o.value, l: o.textContent?.trim().slice(0, 60) }))
      };
    }
    // No order select — probably a Razor MasterDetailList instead
    const mdRows = document.querySelectorAll('.mf-razor-md-row');
    if (mdRows.length > 0) {
      return {
        type: 'razor-md',
        rowCount: mdRows.length,
        firstFew: Array.from(mdRows).slice(0, 3).map(r => (r.textContent || '').trim().slice(0, 80))
      };
    }
    // Or a DataRepeater orders list
    const drRows = document.querySelectorAll('.mfw-data-repeater tbody tr, .mfw-data-repeater [data-row]');
    if (drRows.length > 0) {
      return {
        type: 'datarepeater-orders',
        rowCount: drRows.length,
        firstFew: Array.from(drRows).slice(0, 3).map(r => (r.textContent || '').trim().slice(0, 80))
      };
    }
    return { type: 'none', dump: document.body.innerHTML.length };
  });
  console.log('Level 2 (orders):', JSON.stringify(p2));
  await page.screenshot({ path: join(OUT, `qa-cascade-render-${F.label}-2-orders.png`), fullPage: false });

  // Pick first order (if order_select exists) OR click first MasterDetail row
  const pickedOrder = await page.evaluate(() => {
    const orderSel = document.querySelector('select[name="order_id"], [data-field-key="order_id"] select');
    if (orderSel) {
      const opt = Array.from(orderSel.options).find(o => o.value);
      if (!opt) return null;
      orderSel.value = opt.value;
      orderSel.dispatchEvent(new Event('change', { bubbles: true }));
      return { kind: 'select-pick', value: opt.value, label: opt.textContent?.trim() };
    }
    const mdBtn = document.querySelector('.mf-razor-md-row .mf-razor-md-toggle, [data-mf-razor-action="loadDetail"]');
    if (mdBtn) {
      mdBtn.click();
      return { kind: 'md-toggle-click' };
    }
    return null;
  });
  console.log('Picked order:', JSON.stringify(pickedOrder));
  await page.waitForTimeout(2500);

  // PROBE 3: items widget populated?
  const p3 = await page.evaluate((sel) => {
    // Look for product names — should appear after order pick
    const widget = document.querySelector(sel) || document.querySelector('.mfw-content-slider, .mf-razor-content, .mfw-data-repeater, .mf-razor-md-detail.is-open');
    if (!widget) return { type: 'none' };
    const text = widget.textContent || '';
    const rows = widget.querySelectorAll('tr, .mf-razor-md-row, [data-row]');
    const imgs = widget.querySelectorAll('img');
    return {
      widget: widget.tagName + '.' + widget.className.split(' ')[0],
      textLen: text.length,
      rowCount: rows.length,
      imgCount: imgs.length,
      textSnippet: text.slice(0, 300).trim().replace(/\s+/g, ' ')
    };
  }, F.itemSelector);
  console.log('Level 3 (items):', JSON.stringify(p3));
  await page.screenshot({ path: join(OUT, `qa-cascade-render-${F.label}-3-items.png`), fullPage: true });

  out.push({
    form: F.label, formId: F.id, title: F.title,
    customerSelect: p1,
    pickedCustomer,
    level2: p2,
    pickedOrder,
    level3: p3
  });
}

writeFileSync(join(OUT, 'qa-cascade-render-results.json'), JSON.stringify(out, null, 2));
console.log('\n========== SUMMARY ==========');
out.forEach(r => {
  console.log(`\n[${r.form}] #${r.formId}: ${r.title}`);
  console.log(`  Customers loaded: ${r.customerSelect.optCount || 0}`);
  console.log(`  Level 2 type=${r.level2.type} count=${r.level2.optCount || r.level2.rowCount || 0}`);
  console.log(`  Level 3 widget=${r.level3.widget || 'NONE'} rows=${r.level3.rowCount || 0} textLen=${r.level3.textLen || 0}`);
});

await browser.close();
