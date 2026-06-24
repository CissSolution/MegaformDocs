// QA: create 4 cascade forms via AI chat, then visually verify each
// pulls real data from Customers / OM_Orders / OM_OrderItems / Products.
//
// Form A — All Selects + DataRepeater for order items
// Form B — All Selects + Razor custom template table for items
// Form C — Select + Razor MasterDetailList (combines orders & items)
// Form D — DataRepeater for orders + Razor for items (mixed)
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const FORMS = [
  {
    label: 'Form A',
    title: 'Order Browser (All-Select + DataRepeater)',
    prompt: 'Tạo form quản lý đơn hàng với 3 cấp cascade: 1) Select Customer (SQL: Customers.Id, Customers.FullName). 2) Select Order (SQL: OM_Orders WHERE CustomerId = :customer_id, label format "#Id - OrderDate - Status", dependsOn=customer_id). 3) DataRepeater hiển thị order items (SQL: OM_OrderItems JOIN Products ON Products.Id=OM_OrderItems.ProductId WHERE OM_OrderItems.OrderId = :order_id, columns: Products.name, OM_OrderItems.Quantity, OM_OrderItems.UnitPrice, dependsOn=order_id). Title: "Order Browser - DataRepeater".',
    fieldShape: {
      hasSelect: true, hasDataRepeater: true, hasRazor: false
    }
  },
  {
    label: 'Form B',
    title: 'Order Browser (All-Select + Razor table)',
    prompt: 'Tạo form quản lý đơn hàng với 3 cấp cascade: 1) Select Customer (SQL: Customers.Id, Customers.FullName). 2) Select Order (SQL: OM_Orders WHERE CustomerId = :customer_id, dependsOn=customer_id). 3) Razor widget tự viết template hiển thị order items (SQL: OM_OrderItems JOIN Products ON Products.Id=OM_OrderItems.ProductId WHERE OM_OrderItems.OrderId = :order_id, dependsOn=order_id). Razor template: bảng HTML với cột name, Quantity, UnitPrice và dòng total cuối cùng. Title: "Order Browser - Razor table".',
    fieldShape: {
      hasSelect: true, hasDataRepeater: false, hasRazor: true
    }
  },
  {
    label: 'Form C',
    title: 'Order Browser (Razor MasterDetailList)',
    prompt: 'Tạo form quản lý đơn hàng cascade 2 cấp: 1) Select Customer (SQL: Customers.Id, Customers.FullName). 2) Razor widget DÙNG TEMPLATE "MasterDetailList" (đã có sẵn) — masterQuery OM_Orders WHERE CustomerId = :customer_id, detailQuery OM_OrderItems JOIN Products WHERE OrderId = :parentId. parameters: ParentIdColumn=Id, ParentLabelColumn=OrderDate, ChildColumns="name,Quantity,UnitPrice". dependsOn=customer_id. Title: "Order Browser - MasterDetailList".',
    fieldShape: {
      hasSelect: true, hasDataRepeater: false, hasRazor: true
    }
  },
  {
    label: 'Form D',
    title: 'Order Browser (DataRepeater orders + Razor items)',
    prompt: 'Tạo form quản lý đơn hàng cascade 3 cấp mix widgets: 1) Select Customer (SQL: Customers.Id, Customers.FullName). 2) DataRepeater hiển thị orders (SQL: OM_Orders WHERE CustomerId = :customer_id, columns: Id, OrderDate, Status, dependsOn=customer_id). 3) Select Order (SQL: OM_Orders WHERE CustomerId = :customer_id, label format "#Id - OrderDate", dependsOn=customer_id). 4) Razor tự viết hiển thị order items chi tiết (SQL: OM_OrderItems JOIN Products WHERE OrderId = :order_id, dependsOn=order_id). Title: "Order Browser - Mixed".',
    fieldShape: {
      hasSelect: true, hasDataRepeater: true, hasRazor: true
    }
  }
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.clearCookies();
const page = await ctx.newPage();

await page.addInitScript(() => {
  try {
    localStorage.setItem('megaform-ai', JSON.stringify({
      provider: 'openai',
      baseUrl: 'http://localhost:8787/v1',
      model: 'gpt-4o',
      apiKey: 'local-bridge'
    }));
  } catch (e) {}
});

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

// Helper: get antiforgery token
async function getToken() {
  return await page.evaluate(() => {
    try { return window.$?.ServicesFramework?.(0)?.getAntiForgeryValue?.() || ''; }
    catch { return ''; }
  });
}

// Process each form
const results = [];
for (let i = 0; i < FORMS.length; i++) {
  const F = FORMS[i];
  console.log(`\n========== ${F.label}: ${F.title} ==========`);

  // Reset builder
  try { await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
  catch { await page.waitForTimeout(3000); await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
  await page.waitForTimeout(13000);
  await page.evaluate(() => {
    const B = window.MegaFormBuilder;
    if (B?.state) {
      B.state.formId = 0;
      B.state.schema = { title: '', description: '', fields: [], settings: {} };
      B.state.isDirty = false;
      B.callModule?.('canvas', 'render');
    }
  });
  await page.waitForTimeout(800);

  // Open AI chat
  await page.evaluate(() => document.getElementById('mf-ai-bubble')?.click());
  await page.waitForTimeout(800);

  // Send prompt
  await page.evaluate((p) => {
    const inp = document.getElementById('mf-ai-input');
    if (!inp) return;
    inp.value = p;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('mf-ai-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }, F.prompt);

  // Wait for Apply button (up to 8 min)
  let waited = 0;
  let hasApply = false;
  while (waited < 480000) {
    await page.waitForTimeout(3000);
    waited += 3000;
    hasApply = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).some(b => /^apply/i.test((b.textContent || '').trim()));
    });
    process.stdout.write(hasApply ? 'A' : '.');
    if (hasApply) break;
  }
  console.log(`\n[${F.label}] Apply ready: ${hasApply} (after ${waited}ms)`);

  if (!hasApply) {
    results.push({ form: F.label, error: 'AI never proposed ops', waited });
    continue;
  }

  // Click Apply
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button')).find(b => /^apply/i.test((b.textContent || '').trim()))?.click();
  });
  await page.waitForTimeout(5000);

  // Set title + save via direct API
  const token = await getToken();
  const saveRes = await page.evaluate(async ({ title, token }) => {
    const B = window.MegaFormBuilder;
    if (!B?.state) return { error: 'no builder' };
    B.state.schema.title = title;
    const payload = {
      FormId: 0,
      Title: title,
      Description: 'Auto-generated by cascade QA',
      SchemaJson: JSON.stringify(B.state.schema),
      SettingsJson: JSON.stringify(B.state.schema.settings || {}),
      Status: 'Draft',
      IsActive: true
    };
    const r = await fetch('/DesktopModules/MegaForm/API/Form/Save?portalId=0', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', RequestVerificationToken: token },
      body: JSON.stringify(payload)
    });
    const body = await r.json();
    return { status: r.status, formId: body.formId, fields: B.state.schema.fields.map(f => ({ type: f.type, key: f.key, label: f.label, hasDependsOn: !!f.dependsOn?.length, hasMasterQuery: !!f.widgetProps?.masterQuery, hasSqlQuery: !!f.sqlQuery })) };
  }, { title: F.title, token });
  console.log(`[${F.label}] Save:`, JSON.stringify(saveRes));

  await page.screenshot({ path: join(OUT, `qa-cascade-${F.label.replace(/\s+/g, '_')}-builder.png`), fullPage: false });

  results.push({ form: F.label, title: F.title, ...saveRes, waited });
}

writeFileSync(join(OUT, 'qa-cascade-forms-results.json'), JSON.stringify(results, null, 2));
console.log('\n\n========== ALL FORMS RESULTS ==========');
console.log(JSON.stringify(results, null, 2));
await browser.close();
