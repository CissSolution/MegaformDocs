// Visual QA: drive AI chat with "resize form to 100%" on form 333, capture
// (a) tool calls AI makes, (b) ops it emits, (c) after Apply — does the
// form actually grow to full width?
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const PROMPT = 'Resize the form to 100% width — make it span the full container.';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.clearCookies();
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

// Pre-set AI to use local Claude bridge
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
  page.waitForLoadState('domcontentloaded'),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click()
]);

try { await page.goto(`${BASE}/xx?mfFormId=333#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(3000); await page.goto(`${BASE}/xx?mfFormId=333#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(12000);

// Snapshot the schema before AI runs
const before = await page.evaluate(() => {
  const s = window.MegaFormBuilder?.state?.schema;
  return {
    title: s?.title,
    theme: s?.settings?.theme,
    themeCssOverrides: s?.settings?.themeCssOverrides ? JSON.stringify(s.settings.themeCssOverrides) : null,
    customCssLen: (s?.settings?.customCss || '').length
  };
});
console.log('=== Before ===');
console.log(JSON.stringify(before, null, 2));

// Open chat + send prompt
await page.evaluate(() => document.getElementById('mf-ai-bubble')?.click());
await page.waitForTimeout(800);
await page.evaluate((p) => {
  const inp = document.getElementById('mf-ai-input');
  if (!inp) return;
  inp.value = p;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('mf-ai-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}, PROMPT);

// Track tool calls
const toolCallsSeen = new Set();
let waited = 0;
let hasApply = false;
while (waited < 360000) {
  await page.waitForTimeout(3000);
  waited += 3000;
  const tick = await page.evaluate(() => {
    const log = document.getElementById('mf-ai-log');
    const text = log ? log.textContent || '' : '';
    const tail = text.slice(-600);
    // Extract tool names from "AI calling: <tool>" patterns
    const toolMatches = text.match(/AI calling:\s*([^…\n]+)/g) || [];
    const buttons = Array.from(document.querySelectorAll('button'));
    const apply = buttons.find(b => /^apply/i.test((b.textContent || '').trim()));
    return {
      tail: tail.replace(/\s+/g, ' ').slice(-160),
      tools: toolMatches,
      hasApply: !!apply,
      working: /AI thinking|AI calling/i.test(tail)
    };
  });
  for (const m of tick.tools) toolCallsSeen.add(m.replace(/AI calling:\s*/, '').trim());
  process.stdout.write(tick.hasApply ? 'A' : (tick.working ? '.' : '='));
  if (waited % 30000 === 0) {
    console.log(`\n[${Math.round(waited/1000)}s] tail=${tick.tail}`);
  }
  if (tick.hasApply && !tick.working) { hasApply = true; break; }
}
console.log(`\n\n=== Tool calls AI made ===`);
console.log([...toolCallsSeen].join('\n'));

if (!hasApply) {
  console.log('AI never proposed ops in time');
  await browser.close();
  process.exit(0);
}

// Inspect proposed ops BEFORE clicking Apply
const proposedOps = await page.evaluate(() => {
  // The chat-message shows the JSON of ops; grab the last "AI proposes" card
  const log = document.getElementById('mf-ai-log');
  if (!log) return null;
  const text = log.textContent || '';
  // Extract any inline ops list
  const m = text.match(/"ops":\s*(\[[\s\S]*?\])/);
  return m ? m[1].slice(0, 1500) : '(no inline ops match)';
});
console.log('\n=== Ops AI proposed ===');
console.log(proposedOps);

// Click Apply
await page.evaluate(() => {
  Array.from(document.querySelectorAll('button')).find(b => /^apply/i.test((b.textContent || '').trim()))?.click();
});
await page.waitForTimeout(5000);

// Snapshot the schema after Apply
const after = await page.evaluate(() => {
  const s = window.MegaFormBuilder?.state?.schema;
  return {
    themeCssOverrides: s?.settings?.themeCssOverrides ? JSON.stringify(s.settings.themeCssOverrides) : null,
    customCssLen: (s?.settings?.customCss || '').length,
    // Did customCss change?
    customCssDelta: (s?.settings?.customCss || '').length
  };
});
console.log('\n=== After Apply (in-memory schema) ===');
console.log(JSON.stringify(after, null, 2));

await page.screenshot({ path: join(OUT, 'qa-ai-resize-builder.png'), fullPage: false });

// Now save schema via direct API to commit
const saveResp = await page.evaluate(async () => {
  const B = window.MegaFormBuilder;
  if (!B?.state) return null;
  const sf = window.$?.ServicesFramework?.(0);
  const token = sf?.getAntiForgeryValue?.() || '';
  const payload = {
    FormId: B.state.formId,
    Title: B.state.schema.title,
    Description: B.state.schema.description || '',
    SchemaJson: JSON.stringify(B.state.schema),
    SettingsJson: JSON.stringify(B.state.schema.settings || {}),
    Status: 'Draft'
  };
  const r = await fetch('/DesktopModules/MegaForm/API/Form/Save?portalId=0', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', RequestVerificationToken: token },
    body: JSON.stringify(payload)
  });
  return { status: r.status };
});
console.log('Save resp:', JSON.stringify(saveResp));
await page.waitForTimeout(2000);

// Render the form and measure actual width
const renderPage = await ctx.newPage();
await renderPage.goto(`${BASE}/xx?formid=333`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await renderPage.waitForTimeout(5000);
const renderResult = await renderPage.evaluate(() => {
  const inner = document.querySelector('.mf-form-wrapper > .mf-form-inner');
  if (!inner) return { error: 'no inner' };
  const cs = getComputedStyle(inner);
  return {
    width: inner.getBoundingClientRect().width,
    maxWidth: cs.maxWidth,
    bodyWidth: document.body.getBoundingClientRect().width
  };
});
console.log('\n=== Rendered form 333 after AI Apply ===');
console.log(JSON.stringify(renderResult, null, 2));
console.log(`Verdict: form is ${Math.round((renderResult.width / renderResult.bodyWidth) * 100)}% of body width`);
await renderPage.screenshot({ path: join(OUT, 'qa-ai-resize-final.png'), fullPage: false });

writeFileSync(join(OUT, 'qa-ai-resize-results.json'), JSON.stringify({
  before, toolCalls: [...toolCallsSeen], proposedOps, after, saveResp, renderResult, errs
}, null, 2));

await browser.close();
