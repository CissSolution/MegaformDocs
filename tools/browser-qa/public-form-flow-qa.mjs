// The anti-regression baseline for locking down an API: what does a PUBLIC form page actually
// call, as an ANONYMOUS visitor, from first paint through a real submit?
//
// Run it BEFORE changing an authorization gate and again AFTER. If the endpoint list is unchanged
// and every call still succeeds, the lockdown did not touch the public path. Reading the code and
// concluding "nothing public calls ModuleConfig" is a guess; this is a measurement.
//
//   node tools/browser-qa/public-form-flow-qa.mjs [site] [formPath] [outDir] [--submit]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const formPath = process.argv[3] || '/mfqa-form';
const outDir = path.resolve(process.argv[4] || 'qa-out/public-flow');
const doSubmit = process.argv.includes('--submit');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
// A brand-new context with no cookies: this is a stranger arriving at the page.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const api = [];
const failures = [];
const consoleErrors = [];
page.on('response', (r) => {
  const u = r.url();
  // Wide on purpose: the DNN public form is server-rendered and may submit as a plain POST rather
  // than an API call. A filter that only matched /API/ reported ZERO calls and proved nothing about
  // the submit path.
  if (/megaform/i.test(u) || r.request().method() !== 'GET') {
    const row = { status: r.status(), method: r.request().method(), url: u.replace(site, '') };
    api.push(row);
    if (r.status() >= 400) failures.push(row);
  }
});
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 180)); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 180)));

await page.goto(site + formPath, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(9000);

const render = await page.evaluate(() => {
  const wrap = document.querySelector('.mf-form-wrapper, [id^="mf-form-wrapper"], form .mf-field-group');
  const fields = document.querySelectorAll('.mf-field-group, .mf-field').length;
  const inputs = document.querySelectorAll('.mf-form-wrapper input, .mf-form-wrapper select, .mf-form-wrapper textarea').length;
  const submit = document.querySelector('.mf-submit-btn, button[type="submit"], input[type="submit"]');
  return {
    wrapperPresent: !!wrap,
    fieldGroups: fields,
    inputs,
    submitLabel: submit ? (submit.textContent || submit.value || '').trim().slice(0, 40) : null,
    // styled? a public form with no CSS is the same class of bug as the panel had
    linkColor: (() => { const a = document.querySelector('.mf-form-wrapper a'); return a ? getComputedStyle(a).color : null; })(),
    megaSheets: Array.from(document.styleSheets).map((s) => s.href || '').filter((h) => /megaform/i.test(h)).length,
  };
});
await page.screenshot({ path: path.join(outDir, 'public-form.png') });

let submitResult = null;
let submitBlockers = [];
if (doSubmit) {
  // Fill what is required, then send it. Marked so the row is identifiable afterwards.
  const stamp = 'QA-PUBLIC-FLOW ' + new Date().toISOString();
  // fill() rather than assigning .value: a native <input type=date> ignores a raw value assignment
  // from script, which is why the first version of this harness left "DATE OF BIRTH *" empty and
  // client-side validation silently refused to submit. The button looked broken; the harness was.
  const boxes = page.locator('.mf-form-wrapper input:visible, .mf-form-wrapper textarea:visible');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    const el = boxes.nth(i);
    const type = ((await el.getAttribute('type')) || 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'file', 'checkbox', 'radio'].indexOf(type) >= 0) continue;
    const value = type === 'email' ? 'qa.public.flow@example.invalid'
      : type === 'date' ? '2026-08-10'
      : type === 'time' ? '09:00'
      : type === 'number' ? '1'
      : type === 'tel' ? '0900000000'
      : stamp;
    await el.fill(value).catch(() => {});
  }
  const sels = page.locator('.mf-form-wrapper select:visible');
  const sn = await sels.count();
  for (let i = 0; i < sn; i++) {
    await sels.nth(i).selectOption({ index: 1 }).catch(() => {});
  }
  await page.evaluate(() => {
    document.querySelectorAll('.mf-form-wrapper input[type=radio]').forEach((r, i) => { if (i === 0) r.click(); });
    document.querySelectorAll('.mf-form-wrapper input[type=checkbox][required]').forEach((c) => { if (!c.checked) c.click(); });
  });
  await page.waitForTimeout(1000);
  // Anything still empty and required is why a submit would be refused - report it rather than
  // letting the run end in a mysterious "successVisible: false".
  submitBlockers = await page.evaluate(() => Array.from(
    document.querySelectorAll('.mf-form-wrapper [required]'))
    .filter((el) => !el.value && el.type !== 'radio' && el.type !== 'checkbox')
    .map((el) => el.name || el.id || el.className).slice(0, 8));
  const btn = page.locator('.mf-submit-btn, button[type="submit"]').first();
  if (await btn.count()) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(9000);
  }
  submitResult = await page.evaluate(() => ({
    // eslint-disable-next-line
    successVisible: !!document.querySelector('.mf-success, .mf-thankyou, .mf-form-success'),
    bodyHint: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
  }));
  await page.screenshot({ path: path.join(outDir, 'public-form-after-submit.png') });
}

const moduleConfigCalls = api.filter((r) => /ModuleConfig/i.test(r.url));
const report = { site, formPath, render, submitResult, submitBlockers, apiCalls: api, failures, moduleConfigCalls, consoleErrors };
fs.writeFileSync(path.join(outDir, 'public-flow.json'), JSON.stringify(report, null, 2));

console.log(`\n=== anonymous visitor at ${formPath} ===`);
console.log(' render:', JSON.stringify(render));
if (submitResult) console.log(' submit:', JSON.stringify(submitResult));
console.log(`\n api calls (${api.length}):`);
api.forEach((r) => console.log(`   ${String(r.status).padEnd(5)} ${r.method.padEnd(5)} ${r.url}`));
console.log(`\n >>> ModuleConfig calls from the PUBLIC page: ${moduleConfigCalls.length}`);
moduleConfigCalls.forEach((r) => console.log(`     ${r.status} ${r.method} ${r.url}`));
console.log(` failed calls: ${failures.length}`);
failures.forEach((r) => console.log(`     ${r.status} ${r.method} ${r.url}`));
console.log(` console errors: ${consoleErrors.length ? consoleErrors.slice(0, 4).join(' | ') : 'none'}`);
await browser.close();
