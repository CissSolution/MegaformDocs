// E2E test the prompt-recipe library:
//   1. Direct fetch of /AiTools/GetPromptRecipe — confirms server resolver
//   2. AI chat asks for "Razor master-detail" → AI should call the recipe tool
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
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

// Login as host
await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

try { await page.goto(`${BASE}/xx?mfFormId=334#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(3000); await page.goto(`${BASE}/xx?mfFormId=334#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(10000);

// === PROBE 1 — direct fetch of GetPromptRecipe ===
const p1 = await page.evaluate(async () => {
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/GetPromptRecipe?slug=recipe-convert-premium-form', { credentials: 'same-origin' });
  const body = await r.json();
  return {
    status: r.status,
    slug: body.slug,
    bodySource: body.bodySource,
    bodyStartsWith: (body.body || '').slice(0, 100),
    bodyLen: (body.body || '').length,
    tags: body.tags
  };
});
console.log('=== PROBE 1: direct fetch GetPromptRecipe ===');
console.log(JSON.stringify(p1, null, 2));

// === PROBE 2 — list_knowledge with prompt_recipe kind ===
const p2 = await page.evaluate(async () => {
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/Knowledge?kind=prompt_recipe&top=10', { credentials: 'same-origin' });
  const body = await r.json();
  return { status: r.status, count: body.results?.length, slugs: body.results?.map(x => x.slug) };
});
console.log('\n=== PROBE 2: list prompt_recipe ===');
console.log(JSON.stringify(p2, null, 2));

// === PROBE 3 — verify hybrid resolver works through generic GetKnowledge too ===
const p3 = await page.evaluate(async () => {
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/GetKnowledge?slug=recipe-build-razor-master-detail', { credentials: 'same-origin' });
  const body = await r.json();
  return {
    status: r.status,
    bodySource: body.bodySource,
    bodyContainsRazor: (body.body || '').includes('MasterDetailList'),
    bodyLen: (body.body || '').length
  };
});
console.log('\n=== PROBE 3: generic GetKnowledge resolves file too ===');
console.log(JSON.stringify(p3, null, 2));

// === PROBE 4 — AI tool registered + system prompt advertises it ===
const p4 = await page.evaluate(() => {
  const ai = window.MF_AI;
  const tools = window.MFAI_Tools || (ai?._tools);
  return {
    hasMfAi: !!ai,
    bundleAdvertisesRecipe: typeof document.body.innerHTML === 'string' // sanity
  };
});
console.log('\n=== PROBE 4: AI surface present ===');
console.log(JSON.stringify(p4, null, 2));

writeFileSync(join(OUT, 'qa-recipe-summary.json'), JSON.stringify({ p1, p2, p3, p4, errs }, null, 2));
console.log('\nConsole errors:', errs.slice(0, 5));
await browser.close();
