// Is ModuleConfigController really reachable by a plain Registered user?
//
// MegaFormApiController.cs:3922 carries a BARE [DnnAuthorize] (= any authenticated user) and the
// file's own comment at :3951-3954 says so out loud. This proves it from the outside, WITHOUT
// changing a single setting:
//
//   * every probe below is a GET, except one;
//   * the exception is POST ModuleConfig/DatabaseSettings/Test with an EMPTY body, which the
//     handler rejects at its own validation line ("Database provider is required.", :4867) before
//     it opens any connection or writes anything. A 400 from that line is proof the request got
//     PAST authorization - which is the whole question. A 401/403 would mean the gate holds.
//
// Nothing here posts a connection string, an SMTP host, or a payment key.
//
//   node tools/browser-qa/pb-moduleconfig-authz-probe.mjs [site] [adminUser] [adminPass] [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const adminUser = process.argv[3] || 'admin';
const adminPass = process.argv[4] || 'dnnhost';
const outDir = path.resolve(process.argv[5] || 'qa-out/pb-authz');
fs.mkdirSync(outDir, { recursive: true });

const USER = 'qa.probe.' + Date.now().toString().slice(-6);
const PASS = 'Qa#Probe2026!x';

const GETS = [
  '/DesktopModules/MegaForm/API/ModuleConfig/DefaultConnectionString',
  '/DesktopModules/MegaForm/API/ModuleConfig/DatabaseSettings',
  '/DesktopModules/MegaForm/API/ModuleConfig/PaymentSettings',
  '/DesktopModules/MegaForm/API/ModuleConfig/CaptchaSettings',
  '/DesktopModules/MegaForm/API/ModuleConfig/UploadSettings',
  '/DesktopModules/MegaForm/API/ModuleConfig/EmailSettings',
  '/DesktopModules/MegaForm/API/ModuleConfig/Get?moduleId=0',
  '/DesktopModules/MegaForm/API/ModuleConfig/Fields?formId=223',
];
const ANON_GETS = [
  '/DesktopModules/MegaForm/API/Field/Options?formId=223&fieldKey=gender',
  '/DesktopModules/MegaForm/API/Submissions/List?queryKey=all-posts&pageSize=3',
  '/DesktopModules/MegaForm/API/DataRepeater/Query?formId=223&pageSize=3',
];

const browser = await chromium.launch({ headless: true });

async function login(ctx, u, p) {
  const pg = await ctx.newPage();
  await pg.goto(site + '/Login', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await pg.locator('input[id*="txtUsername"]').fill(u);
  await pg.locator('input[id*="txtPassword"]').fill(p);
  await Promise.all([pg.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
                     pg.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click()]);
  return { pg, ok: !(await pg.locator('input[id*="txtUsername"]').count()) };
}

const runGets = (pg, urls) => pg.evaluate(async (list) => {
  const out = [];
  for (const u of list) {
    try {
      const r = await fetch(u, { credentials: 'include' });
      const t = await r.text();
      out.push({ url: u, status: r.status, bytes: t.length, sample: t.slice(0, 220).replace(/\s+/g, ' ') });
    } catch (e) { out.push({ url: u, status: -1, sample: String(e && e.message) }); }
  }
  return out;
}, urls);

const results = {};

// anonymous
{
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  await pg.goto(site + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  results.anonymous = await runGets(pg, ANON_GETS.concat(GETS));
  await ctx.close();
}

// admin creates the probe account
const actx = await browser.newContext();
const { pg: apg, ok: aok } = await login(actx, adminUser, adminPass);
if (!aok) { console.error('admin login failed'); await browser.close(); process.exit(2); }
results.create = await apg.evaluate(async ({ u, p }) => {
  const token = (document.querySelector('input[name="__RequestVerificationToken"]') || {}).value || '';
  const r = await fetch('/API/PersonaBar/Users/CreateUser', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'RequestVerificationToken': token },
    body: JSON.stringify({ firstName: 'QA', lastName: 'Probe', userName: u, email: u + '@example.invalid',
                           password: p, authorize: true, randomPassword: false, question: '', answer: '' }),
  });
  return { status: r.status };
}, { u: USER, p: PASS });

if (results.create.status < 300) {
  const ctx = await browser.newContext();
  const { pg, ok } = await login(ctx, USER, PASS);
  results.registeredLogin = ok;
  if (ok) {
    results.registeredGets = await runGets(pg, GETS);
    // the single POST: validation-only path, writes nothing, connects nowhere
    results.postAuthzProbe = await pg.evaluate(async () => {
      const token = (document.querySelector('input[name="__RequestVerificationToken"]') || {}).value || '';
      const r = await fetch('/DesktopModules/MegaForm/API/ModuleConfig/DatabaseSettings/Test', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'RequestVerificationToken': token },
        body: JSON.stringify({}),
      });
      return { status: r.status, body: (await r.text()).slice(0, 200) };
    });
  }
  await ctx.close();
}

// remove the probe account
results.cleanupSql = 'run separately';
fs.writeFileSync(path.join(outDir, 'authz-probe.json'), JSON.stringify({ user: USER, results }, null, 2));

const show = (rows) => (rows || []).forEach((r) => console.log(`  ${String(r.status).padEnd(5)} ${r.url}\n        ${r.sample || ''}`.trimEnd()));
console.log('\n=== ANONYMOUS ==='); show(results.anonymous);
console.log('\n=== REGISTERED (no admin role) ==='); show(results.registeredGets);
console.log('\n=== POST ModuleConfig/DatabaseSettings/Test with {} (validation-only) ===');
console.log(' ', JSON.stringify(results.postAuthzProbe));
console.log(`\nprobe account still present: ${USER}  (delete it)`);
await browser.close();
