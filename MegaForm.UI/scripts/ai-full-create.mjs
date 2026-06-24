// Full flow:
//  1. AI chat: prompt → Apply (creates 3 fields in memory)
//  2. Patch the 2 Select fields with cascading SQL options
//  3. Save via direct /api/Form/Save with antiforgery
//  4. Return the new formId
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const PROMPT = 'TAO 1 FORM HIEN THI SO LIEU: DROP DOWN DANH SACH CUSTOMER--> DANH SACH CAC ORDERS --> CLICK VAO ORDER SE HIEN RA DANH SACH CAC PRODUCTS CUA ORDER (UU TIEN SU DUNG RAZOR WIDGET)';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.clearCookies();
const page = await ctx.newPage();
const consoleErrs = [];
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });

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

try { await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(3000); await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(14000);

await page.evaluate(() => {
  const B = window.MegaFormBuilder;
  if (B && B.state) {
    B.state.formId = 0;
    B.state.schema = { title: '', description: '', fields: [], settings: {} };
    B.state.isDirty = false;
    B.callModule && B.callModule('canvas', 'render');
  }
});
await page.waitForTimeout(800);

// Open AI bubble + send prompt
await page.evaluate(() => document.getElementById('mf-ai-bubble')?.click());
await page.waitForTimeout(800);
await page.evaluate((p) => {
  const inp = document.getElementById('mf-ai-input');
  if (!inp) return;
  inp.value = p;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('mf-ai-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}, PROMPT);

// Wait for Apply button
let waited = 0;
while (waited < 480000) {
  await page.waitForTimeout(3000);
  waited += 3000;
  const hasApply = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.some(b => /^apply/i.test((b.textContent || '').trim()));
  });
  process.stdout.write(hasApply ? 'A' : '.');
  if (hasApply) break;
}
console.log('\nClicking Apply...');

await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const a = btns.find(b => /^apply/i.test((b.textContent || '').trim()));
  a?.click();
});
await page.waitForTimeout(4000);

// Patch schema with cascading SQL + final title; then save via direct API
const result = await page.evaluate(async () => {
  const B = window.MegaFormBuilder;
  if (!B || !B.state) return { error: 'no builder' };
  const s = B.state.schema;
  s.title = 'Tra cứu sản phẩm theo đơn hàng (AI cascade)';
  s.description = 'Customer → Orders → Products cascade demo generated via AI chat';

  // Find each field by key
  const find = k => s.fields.find(f => f.key === k);
  const cust = find('customer_id');
  const ord = find('order_id');
  const razor = find('order_products');

  if (cust) {
    cust.label = 'Khách hàng';
    cust.required = true;
    cust.optionsSource = 'sql';
    cust.connectionKey = 'DashboardDatabase';
    cust.sqlQuery = 'SELECT Id AS value, FullName AS label FROM Customers ORDER BY FullName';
    cust.placeholder = '— Chọn khách hàng —';
  }
  if (ord) {
    ord.label = 'Đơn hàng';
    ord.required = true;
    ord.optionsSource = 'sql';
    ord.connectionKey = 'DashboardDatabase';
    ord.sqlQuery = 'SELECT Id AS value, CONCAT(\'#\', Id, \' — \', CAST(OrderDate AS varchar(20)), \' (\', Status, \')\') AS label FROM OM_Orders WHERE CustomerId = :customer_id ORDER BY OrderDate DESC';
    ord.dependsOn = ['customer_id'];
    ord.placeholder = '— Chọn đơn hàng —';
  }
  if (razor) {
    razor.label = 'Sản phẩm trong đơn';
    razor.widgetProps = razor.widgetProps || {};
    razor.widgetProps.useSql = true;
    razor.widgetProps.connectionKey = 'DashboardDatabase';
    razor.widgetProps.masterQuery = 'SELECT p.[name] AS Name, p.[sku] AS Sku, i.Quantity AS Quantity, i.UnitPrice AS UnitPrice FROM dbo.OM_OrderItems i INNER JOIN dbo.Products p ON p.Id = i.ProductId WHERE i.OrderId = :order_id ORDER BY p.name';
    razor.widgetProps.queryDependsOn = ['order_id'];
    razor.widgetProps.dependsOn = ['order_id'];
  }
  B.state.isDirty = true;

  // Build the save payload (mirror what toolbar does)
  const payload = {
    FormId: 0,
    Title: s.title,
    Description: s.description,
    SchemaJson: JSON.stringify(s),
    SettingsJson: JSON.stringify(s.settings || {}),
    Status: 'Draft',
    IsActive: true
  };

  // Antiforgery token
  let token = '';
  try {
    const sf = window.$?.ServicesFramework?.(0);
    if (sf?.getAntiForgeryValue) token = sf.getAntiForgeryValue() || '';
  } catch (e) {}
  if (!token) {
    const inp = document.querySelector('input[name="__RequestVerificationToken"]');
    if (inp) token = inp.value || '';
  }

  // POST /api/Form/Save
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['RequestVerificationToken'] = token;
  let saveResp = null;
  try {
    const r = await fetch('/DesktopModules/MegaForm/API/Form/Save?portalId=0', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(payload)
    });
    const txt = await r.text();
    let parsed = null; try { parsed = JSON.parse(txt); } catch (e) {}
    saveResp = { status: r.status, ok: r.ok, body: parsed || txt.slice(0, 300) };
  } catch (e) {
    saveResp = { error: String(e?.message || e) };
  }
  return { schema: s, payloadSize: JSON.stringify(payload).length, tokenLen: token.length, saveResp };
});

writeFileSync(join(OUT, 'ai-full-create-result.json'), JSON.stringify(result, null, 2));
console.log('\n=== Save response ===');
console.log('Token len:', result.tokenLen);
console.log('Save resp:', JSON.stringify(result.saveResp, null, 2));
console.log('\nFields configured:');
result.schema.fields.forEach(f => {
  console.log(`  - ${f.type} "${f.label}" [${f.key}]`);
  if (f.sqlQuery) console.log(`    SQL: ${f.sqlQuery.slice(0, 100)}...`);
  if (f.dependsOn) console.log(`    dependsOn: ${JSON.stringify(f.dependsOn)}`);
  if (f.widgetProps?.masterQuery) console.log(`    masterQuery: ${f.widgetProps.masterQuery.slice(0, 100)}...`);
});

await page.screenshot({ path: join(OUT, 'ai-full-create.png'), fullPage: false });
console.log('\nConsole errs:', consoleErrs.slice(0, 5));
await browser.close();
