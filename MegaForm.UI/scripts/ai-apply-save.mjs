// Full flow: AI prompt → Apply → set title → Save form to DB → return formId
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
      apiKey: 'local-claude-bridge-no-key-needed'
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

// Reset to NEW empty form
await page.evaluate(() => {
  const B = window.MegaFormBuilder;
  if (!B || !B.state) return;
  B.state.formId = 0;
  B.state.schema = { title: '', description: '', fields: [], settings: {} };
  B.state.isDirty = false;
  B.callModule && B.callModule('canvas', 'render');
});
await page.waitForTimeout(800);

// Open bubble + submit
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
    const a = btns.find(b => /^apply/i.test((b.textContent || '').trim()));
    return !!a;
  });
  process.stdout.write(hasApply ? 'A' : '.');
  if (hasApply) break;
}
console.log('\n');

// Click Apply
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const a = btns.find(b => /^apply/i.test((b.textContent || '').trim()));
  a?.click();
});
await page.waitForTimeout(4000);

// Manual title setter + save via toolbar
const saveResult = await page.evaluate(async () => {
  const B = window.MegaFormBuilder;
  if (!B || !B.state) return { error: 'no builder' };
  // Title — make it explicit since set_form_meta may not have stuck
  if (!B.state.schema.title) {
    B.state.schema.title = 'Tra cứu sản phẩm theo đơn hàng (AI cascade)';
    B.state.isDirty = true;
  }
  // Trigger save via toolbar module
  try {
    if (B.callModule) {
      await new Promise(r => setTimeout(r, 200));
      B.callModule('toolbar', 'saveForm');
    }
  } catch (e) {
    return { error: 'callModule failed: ' + e.message };
  }
  return { saveTriggered: true };
});
console.log('Save triggered:', saveResult);
// Wait for save to complete (toolbar may update title to include the new ID)
await page.waitForTimeout(8000);

// Final state
const final = await page.evaluate(() => {
  const B = window.MegaFormBuilder;
  return {
    formId: B?.state?.formId || null,
    title: B?.state?.schema?.title || null,
    isDirty: B?.state?.isDirty || false,
    fields: B?.state?.schema?.fields?.map(f => ({
      type: f.type, key: f.key, label: f.label,
      widgetProps: f.widgetProps || null,
      options: f.options || null,
      dependsOn: f.dependsOn || null
    })) || []
  };
});
writeFileSync(join(OUT, 'ai-saved-state.json'), JSON.stringify(final, null, 2));
console.log('\n=== Saved form ===');
console.log('Form ID:', final.formId);
console.log('Title:', final.title);
console.log('Dirty:', final.isDirty);
console.log('Fields:', final.fields.length);
console.log(JSON.stringify(final.fields, null, 2));
await page.screenshot({ path: join(OUT, 'ai-saved.png'), fullPage: false });

console.log('\nConsole errs (first 5):', consoleErrs.slice(0, 5));
await browser.close();
