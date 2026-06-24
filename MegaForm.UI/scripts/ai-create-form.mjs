// Drive the AI chat bot in the Builder to create the cascade form
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
const pageErrs = [];
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
page.on('pageerror', e => pageErrs.push(e.message));

// 1. Login
await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

// 2. Open the builder on an existing form (any form works; chat creates new ones)
// Inject local AI config into localStorage BEFORE the builder loads
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

try { await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(12000);

// 3. Inspect AI config + open bubble
const env = await page.evaluate(async () => {
  const ai = window.MF_AI;
  let cfg = null;
  let err = null;
  if (ai && typeof ai.getConfig === 'function') {
    try { cfg = await ai.getConfig(); } catch (e) { err = String(e?.message || e); }
  }
  return {
    hasMfAi: !!ai,
    hasGetConfig: !!(ai && ai.getConfig),
    cfg: cfg ? { provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl, hasKey: !!cfg.apiKey, keyLen: (cfg.apiKey || '').length } : null,
    cfgError: err,
    hasBubble: !!document.getElementById('mf-ai-bubble'),
    hasPanel: !!document.getElementById('mf-ai-panel'),
    hasInput: !!document.getElementById('mf-ai-input'),
  };
});
console.log('=== AI env ===');
console.log(JSON.stringify(env, null, 2));
await page.screenshot({ path: join(OUT, 'ai-step1-builder.png'), fullPage: false });

// 4. Click the bubble to open the chat panel
const opened = await page.evaluate(() => {
  const bubble = document.getElementById('mf-ai-bubble');
  if (!bubble) return { error: 'no bubble' };
  bubble.click();
  return { clicked: true };
});
await page.waitForTimeout(800);
console.log('Bubble click:', opened);
await page.screenshot({ path: join(OUT, 'ai-step2-bubble-open.png'), fullPage: false });

// 5. Fill the prompt and submit
const submitResult = await page.evaluate((prompt) => {
  const inp = document.getElementById('mf-ai-input');
  if (!inp) return { error: 'no input' };
  inp.value = prompt;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  const form = document.getElementById('mf-ai-form');
  if (!form) return { error: 'no form' };
  // Submit via form submit event so chat.ts handler runs
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return { submitted: true, inputValue: inp.value.slice(0, 60) };
}, PROMPT);
console.log('Submit:', submitResult);
await page.waitForTimeout(2000);
await page.screenshot({ path: join(OUT, 'ai-step3-after-submit.png'), fullPage: false });

// 6. Wait until the AI is truly done — no thinking/calling markers + stable.
// AI Form Assistant emits "AI thinking…" + "AI calling: <tool>…" markers
// while it's tool-using. Wait for 30s of no markers AND no DOM changes.
let waited = 0;
let stable = 0;
let prevLen = 0;
while (waited < 480000) {  // up to 8 min for local LLM
  await page.waitForTimeout(3000);
  waited += 3000;
  const tick = await page.evaluate(() => {
    const log = document.getElementById('mf-ai-log');
    const text = log ? log.textContent || '' : '';
    const tail = text.slice(-400);
    return {
      logLen: log ? log.innerHTML.length : 0,
      working: /AI thinking|AI calling|thinking…|calling…|đang/i.test(tail),
      fieldCount: window.MegaFormBuilder?.state?.schema?.fields?.length || 0,
      tail: tail.slice(-180).trim().replace(/\s+/g, ' ')
    };
  });
  process.stdout.write(tick.working ? '.' : (tick.logLen !== prevLen ? '+' : '='));
  if (!tick.working) {
    if (tick.logLen === prevLen) {
      stable++;
      if (stable >= 10) break;  // 30s stable = done
    } else stable = 0;
  } else {
    stable = 0;
  }
  prevLen = tick.logLen;
  if (waited % 30000 === 0) {
    console.log(`\n[${Math.round(waited/1000)}s] fields=${tick.fieldCount} working=${tick.working}`);
    console.log(`tail: ${tick.tail}`);
  }
}
console.log('\nwaited:', waited, 'ms');

// 7. Capture final state
const final = await page.evaluate(() => {
  const log = document.getElementById('mf-ai-log');
  const msgs = log ? Array.from(log.children).map(el => ({
    cls: el.className,
    text: (el.textContent || '').slice(0, 500).trim()
  })) : [];
  // Try to find any indication a form was created (toolbar form id, current schema)
  const B = window.MegaFormBuilder;
  return {
    messageCount: msgs.length,
    messages: msgs.slice(-8),
    currentFormId: B && B.state ? B.state.formId : null,
    currentFormTitle: B && B.state && B.state.schema ? B.state.schema.title : null,
    currentFields: B && B.state && B.state.schema && B.state.schema.fields
      ? B.state.schema.fields.map(f => ({ type: f.type, key: f.key, label: f.label, hasWidgetProps: !!f.widgetProps }))
      : []
  };
});
writeFileSync(join(OUT, 'ai-final-state.json'), JSON.stringify(final, null, 2));
console.log('\n=== Final state ===');
console.log('Form ID:', final.currentFormId);
console.log('Title:', final.currentFormTitle);
console.log('Fields:', final.currentFields.length);
console.log(JSON.stringify(final.currentFields, null, 2));
console.log('\nLast AI messages:');
final.messages.forEach((m, i) => console.log(`[${i}] ${m.cls}: ${m.text.slice(0, 240)}`));
await page.screenshot({ path: join(OUT, 'ai-step4-final.png'), fullPage: false });

if (pageErrs.length) {
  console.log('\nPage errors:', JSON.stringify(pageErrs.slice(0, 5), null, 2));
}
if (consoleErrs.length) {
  console.log('\nConsole errors:', JSON.stringify(consoleErrs.slice(0, 10), null, 2));
}

await browser.close();
