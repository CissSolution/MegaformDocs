// Continue the AI flow: re-open builder, re-submit prompt, then click Apply
// once the AI proposes changes, and verify the form was saved.
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

// Open a NEW empty form so the AI starts fresh. Use formId=0 + new=1 if supported.
try { await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(14000);

// Force a NEW form so the cascade goes into its own form (not modifying 326)
await page.evaluate(() => {
  const B = window.MegaFormBuilder;
  if (!B || !B.state) return;
  // Reset the in-memory schema to empty
  B.state.formId = 0;
  B.state.schema = { title: '', description: '', fields: [], settings: {} };
  B.state.isDirty = false;
  B.callModule && B.callModule('canvas', 'render');
});
await page.waitForTimeout(800);

// Open chat bubble
await page.evaluate(() => document.getElementById('mf-ai-bubble')?.click());
await page.waitForTimeout(800);

// Submit prompt
await page.evaluate((prompt) => {
  const inp = document.getElementById('mf-ai-input');
  if (!inp) return;
  inp.value = prompt;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('mf-ai-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}, PROMPT);

console.log('Submitted prompt, waiting for AI to propose...');

// Wait until "Apply" button appears
let applyFound = false;
let waited = 0;
while (waited < 480000) {
  await page.waitForTimeout(3000);
  waited += 3000;
  const tick = await page.evaluate(() => {
    const log = document.getElementById('mf-ai-log');
    const text = log ? log.textContent || '' : '';
    const tail = text.slice(-400);
    // Look for the Apply button (could be styled in many ways)
    const buttons = Array.from(document.querySelectorAll('button'));
    const applyBtn = buttons.find(b => {
      const t = (b.textContent || '').trim().toLowerCase();
      return t === 'apply' || t.startsWith('apply ') || t === 'áp dụng';
    });
    return {
      working: /AI thinking|AI calling|thinking…|calling…|đang/i.test(tail),
      hasApply: !!applyBtn,
      applyVisible: applyBtn ? (applyBtn.offsetWidth > 0 || getComputedStyle(applyBtn).display !== 'none') : false,
      fieldCount: window.MegaFormBuilder?.state?.schema?.fields?.length || 0,
      tail: tail.slice(-160).replace(/\s+/g, ' ').trim()
    };
  });
  process.stdout.write(tick.hasApply ? 'A' : (tick.working ? '.' : '='));
  if (waited % 30000 === 0) {
    console.log(`\n[${Math.round(waited/1000)}s] working=${tick.working} hasApply=${tick.hasApply} fields=${tick.fieldCount}`);
    console.log(`tail: ${tick.tail}`);
  }
  if (tick.hasApply && !tick.working) {
    applyFound = true;
    break;
  }
}
console.log('\nApply button found:', applyFound);

// Click Apply
if (applyFound) {
  const applyResult = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const applyBtn = buttons.find(b => {
      const t = (b.textContent || '').trim().toLowerCase();
      return t === 'apply' || t.startsWith('apply ') || t === 'áp dụng';
    });
    if (!applyBtn) return { clicked: false };
    applyBtn.click();
    return { clicked: true, text: applyBtn.textContent?.trim() };
  });
  console.log('Apply click:', applyResult);
  await page.waitForTimeout(8000);
}

// Final state
const final = await page.evaluate(() => {
  const B = window.MegaFormBuilder;
  return {
    formId: B?.state?.formId || null,
    title: B?.state?.schema?.title || null,
    fields: B?.state?.schema?.fields?.map(f => ({
      type: f.type, key: f.key, label: f.label,
      widgetProps: f.widgetProps ? Object.keys(f.widgetProps).slice(0, 10) : null
    })) || [],
    isDirty: B?.state?.isDirty || false
  };
});
writeFileSync(join(OUT, 'ai-applied-state.json'), JSON.stringify(final, null, 2));
console.log('\n=== Final state ===');
console.log(JSON.stringify(final, null, 2));
await page.screenshot({ path: join(OUT, 'ai-applied.png'), fullPage: false });

console.log('\nConsole errs:', consoleErrs.slice(0, 5));
await browser.close();
