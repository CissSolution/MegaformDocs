// End-to-end test: open premium form 333, ask AI to convert to consultation form
// preserving design, then verify ops are EXTRACTED (Apply button appears)
// rather than dumped as raw JSON text.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const PROMPT = 'CHUYEN DOI form nay thanh 1 form tu van du hoc, giu nguyen thiet ke chung custom html va custom css cua form premium';

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

try { await page.goto(`${BASE}/xx?mfFormId=333#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(3000); await page.goto(`${BASE}/xx?mfFormId=333#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(14000);

// Snapshot the original schema (so we can prove design is preserved)
const before = await page.evaluate(() => {
  const B = window.MegaFormBuilder;
  const s = B?.state?.schema;
  return {
    title: s?.title,
    fieldCount: s?.fields?.length || 0,
    customHtmlLen: (s?.settings?.customHtml || '').length,
    customCssLen: (s?.settings?.customCss || '').length,
    theme: s?.settings?.theme
  };
});
console.log('=== Before ===');
console.log(JSON.stringify(before, null, 2));

// Open chat + submit
await page.evaluate(() => document.getElementById('mf-ai-bubble')?.click());
await page.waitForTimeout(800);
await page.evaluate((p) => {
  const inp = document.getElementById('mf-ai-input');
  if (!inp) return;
  inp.value = p;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('mf-ai-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}, PROMPT);

// Wait for either Apply button OR a chat_message-with-JSON-text (the bug)
let waited = 0;
let outcome = null;
while (waited < 600000) {
  await page.waitForTimeout(3000);
  waited += 3000;
  const tick = await page.evaluate(() => {
    const log = document.getElementById('mf-ai-log');
    const text = log ? log.textContent || '' : '';
    const tail = text.slice(-600);
    const btns = Array.from(document.querySelectorAll('button'));
    const apply = btns.find(b => /^apply/i.test((b.textContent || '').trim()));
    // Bug signature: chat shows literal `{"op":...` or `{"ops":[`
    const showsJsonText = /\{"ops":\[|\{"op":"set_form_meta"/.test(text);
    return {
      working: /AI thinking|AI calling|thinking…|calling…/i.test(tail),
      hasApply: !!apply,
      showsJsonText,
      tail: tail.slice(-160).replace(/\s+/g, ' ').trim()
    };
  });
  process.stdout.write(tick.hasApply ? 'A' : (tick.showsJsonText ? 'B' : (tick.working ? '.' : '=')));
  if (waited % 30000 === 0) {
    console.log(`\n[${Math.round(waited/1000)}s] tail=${tick.tail}`);
  }
  if (tick.hasApply && !tick.working) { outcome = 'apply-ready'; break; }
  if (tick.showsJsonText && !tick.working) { outcome = 'bug-still-present'; break; }
}
console.log(`\nOutcome: ${outcome}, waited: ${waited}ms`);

const final = await page.evaluate(() => {
  const log = document.getElementById('mf-ai-log');
  const lastMsgs = log ? Array.from(log.children).slice(-4).map(el => ({
    cls: el.className,
    text: (el.textContent || '').slice(0, 300).trim()
  })) : [];
  const btns = Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean);
  return { lastMsgs, applyableButtons: btns.filter(t => /apply|discard|preview/i.test(t)) };
});
console.log('\n=== Final chat messages ===');
final.lastMsgs.forEach((m, i) => console.log(`[${i}] ${m.cls.slice(0,30)}: ${m.text.slice(0, 200)}`));
console.log('\nButtons:', final.applyableButtons);

writeFileSync(join(OUT, 'qa-form333-result.json'), JSON.stringify({ before, outcome, waited, final }, null, 2));
await page.screenshot({ path: join(OUT, 'qa-form333-final.png'), fullPage: false });
await browser.close();
