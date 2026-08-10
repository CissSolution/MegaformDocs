/**
 * Seed the Oqtane QA site's forms from App_Data\MegaForm\Templates (recursive), the Oqtane twin of
 * tools/browser-qa/dnn-seed-templates.mjs.
 *
 * Oqtane differs from DNN in three ways that matter here:
 *   - the API is /api/MegaForm/BuilderTemplates/DevBulkCreateForms, and it needs the
 *     X-OQTANE-MODULEID / X-OQTANE-SITEID headers (module authorisation), not a DNN module header
 *   - login is a Blazor form: poll for the password box instead of guessing a delay
 *   - DevBulkCreateForms binds every form to a seed-bucket module, never to a page module, so a
 *     page still has to be built for each form afterwards
 *
 *   node tools/browser-qa/oq-seed-forms.mjs [--site http://localhost:5130] [--module 36]
 */
import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SITE = arg('site', 'http://localhost:5130').replace(/\/$/, '');
const USER = arg('user', 'host');
const PASS = arg('pass', 'abc@ABC1024');
const MODULE = arg('module', '36');
const SITEID = arg('siteid', '1');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto(`${SITE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
let authed = await page.evaluate(() => document.body.innerText.includes('Logout'));
if (!authed) {
  // Blazor renders the login form only once the circuit is up.
  for (let i = 0; i < 60 && !(await page.$('input[type=password]')); i++) await page.waitForTimeout(1000);
  const filled = await page.evaluate(({ u, p }) => {
    const inputs = [...document.querySelectorAll('input')];
    const pw = inputs.find((i) => i.type === 'password');
    if (!pw) return 'no-password-field';
    const un = inputs.slice(0, inputs.indexOf(pw)).reverse()
      .find((i) => i.type === 'text' || i.type === '' || !i.type);
    if (!un) return 'no-username-field';
    const set = (el, v) => {
      el.focus(); el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    };
    set(un, u); set(pw, p);
    return 'filled';
  }, { u: USER, p: PASS });
  console.log('login fill:', filled);
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /^\s*login\s*$/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  // Oqtane may perform a full navigation immediately after the Blazor click. During that short
  // window page.evaluate throws "Execution context was destroyed"; treat it as progress and poll
  // again on the new document instead of aborting the whole seed.
  for (let i = 0; i < 40 && !authed; i++) {
    await page.waitForTimeout(1000);
    authed = await page.evaluate(() => document.body.innerText.includes('Logout')).catch(() => false);
  }
}
console.log('session:', authed ? 'authenticated' : 'ANONYMOUS');
if (!authed) { await browser.close(); process.exit(2); }

const out = await page.evaluate(async ({ moduleId, siteId }) => {
  const url = `/api/MegaForm/BuilderTemplates/DevBulkCreateForms?authmoduleid=${moduleId}&authsiteid=${siteId}`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        'X-OQTANE-MODULEID': String(moduleId), 'X-OQTANE-SITEID': String(siteId),
      },
      body: '{}',
    });
    return { status: r.status, body: (await r.text()).slice(0, 3000) };
  } catch (e) { return { status: 0, body: 'fetch failed: ' + e.message }; }
}, { moduleId: MODULE, siteId: SITEID });

console.log('HTTP', out.status);
const m = out.body.match(/"totalTemplates":(\d+).*?"created":(\d+),"updated":(\d+),"failed":(\d+)/);
console.log(m ? `templates ${m[1]}  created ${m[2]}  updated ${m[3]}  failed ${m[4]}`
              : out.body.slice(0, 800));
await browser.close();
process.exit(out.status === 200 ? 0 : 1);
