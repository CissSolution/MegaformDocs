// Who can reach the MegaForm Persona Bar panel, and what can they call?
//
// The panel is admin-only by intent (PersonaBarMenu defaultPermissions=Administrators, and
// MegaFormController gates on the Administrators role). "By intent" is not evidence, so this
// measures three callers against the same endpoints:
//
//   anonymous   not signed in at all
//   registered  a real DNN account with ONLY the Registered Users role - created for this run
//               and deleted at the end
//   admin       the control group; everything here must work
//
// It records, for the registered user: whether DNN renders the Persona Bar at all, whether the
// MegaForm entry appears in it, and the status of every panel + module API call. Anything that
// answers 200 for a plain Registered user is a finding, not a feature.
//
//   node tools/browser-qa/pb-access-control-qa.mjs [site] [adminUser] [adminPass] [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const adminUser = process.argv[3] || 'admin';
const adminPass = process.argv[4] || 'dnnhost';
const outDir = path.resolve(process.argv[5] || 'qa-out/pb-access');
fs.mkdirSync(outDir, { recursive: true });

const TEST_USER = 'qa.normal.' + String(process.argv[6] || '1');
const TEST_PASS = 'Qa#Normal2026!x';
const TEST_MAIL = TEST_USER + '@example.invalid';

// Endpoints the panel and the hosted SPA rely on. Read-only on purpose.
const PANEL_API = [
  '/API/personaBar/MegaForm/GetDashboard',
  '/API/personaBar/MegaForm/GetForms?pageIndex=0&pageSize=5',
  '/API/personaBar/MegaForm/GetPages?searchTerm=',
];
const MODULE_API = [
  '/DesktopModules/MegaForm/API/Form/ListAll?portalId=0',
  '/DesktopModules/MegaForm/API/Form/List?portalId=0&pageSize=5',
  '/DesktopModules/MegaForm/API/Phase2/PinnedPages',
  '/DesktopModules/MegaForm/API/Phase2/AppDefinitionList',
  '/DesktopModules/MegaForm/API/BuilderTemplates/List',
  '/DesktopModules/MegaForm/API/ModuleConfig/EmailSettings',
  '/DesktopModules/MegaForm/API/ModuleConfig/ConnectionsList',
  '/DesktopModules/MegaForm/API/AiTools/SqlConnections',
  '/DesktopModules/MegaForm/API/AiAssistant/DefaultConfig',
  '/DesktopModules/MegaForm/API/Theme/List',
  '/DesktopModules/MegaForm/API/Workflow/MyInbox',
];

const browser = await chromium.launch({ headless: true });

async function login(ctx, user, pass) {
  const p = await ctx.newPage();
  await p.goto(site + '/Login', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.locator('input[id*="txtUsername"]').fill(user);
  await p.locator('input[id*="txtPassword"]').fill(pass);
  await Promise.all([p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
                     p.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click()]);
  const ok = !(await p.locator('input[id*="txtUsername"]').count());
  return { page: p, ok };
}

const probe = (page, urls) => page.evaluate(async (list) => {
  const out = [];
  for (const u of list) {
    try {
      const r = await fetch(u, { credentials: 'include' });
      const t = await r.text();
      out.push({ url: u, status: r.status, bytes: t.length, body: r.ok ? '' : t.slice(0, 90).replace(/\s+/g, ' ') });
    } catch (e) { out.push({ url: u, status: -1, bytes: 0, body: String(e && e.message).slice(0, 90) }); }
  }
  return out;
}, urls);

const results = {};

// ── 1. anonymous ──────────────────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(site + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  results.anonymous = {
    personaBarPresent: !!p.frames().find((f) => f.url().includes('/Dnn.PersonaBar/index.html')),
    panelApi: await probe(p, PANEL_API),
    moduleApi: await probe(p, MODULE_API),
  };
  await ctx.close();
}

// ── 2. create a Registered-only user, as admin ────────────────────────────────────────────────
const adminCtx = await browser.newContext();
const { page: adminPage, ok: adminOk } = await login(adminCtx, adminUser, adminPass);
if (!adminOk) { console.error('admin login failed'); await browser.close(); process.exit(2); }

const created = await adminPage.evaluate(async ({ u, p, m }) => {
  const tokenEl = document.querySelector('input[name="__RequestVerificationToken"]');
  const token = tokenEl ? tokenEl.value : '';
  const r = await fetch('/API/PersonaBar/Users/CreateUser', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'RequestVerificationToken': token },
    body: JSON.stringify({ firstName: 'QA', lastName: 'Normal', userName: u, email: m,
                           password: p, authorize: true, randomPassword: false, question: '', answer: '' }),
  });
  return { status: r.status, body: (await r.text()).slice(0, 300) };
}, { u: TEST_USER, p: TEST_PASS, m: TEST_MAIL });
results.createUser = created;

// ── 3. the registered user ────────────────────────────────────────────────────────────────────
if (created.status >= 200 && created.status < 300) {
  const ctx = await browser.newContext();
  const { page: p, ok } = await login(ctx, TEST_USER, TEST_PASS);
  results.registered = { loginOk: ok };
  if (ok) {
    await p.goto(site + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await p.waitForTimeout(4000);
    const pb = p.frames().find((f) => f.url().includes('/Dnn.PersonaBar/index.html'));
    results.registered.personaBarPresent = !!pb;
    results.registered.megaFormMenuVisible = pb
      ? await pb.locator('li#MegaForm').count().then((n) => n > 0).catch(() => false)
      : false;
    results.registered.panelApi = await probe(p, PANEL_API);
    results.registered.moduleApi = await probe(p, MODULE_API);
    // Can they simply open the admin dashboard page?
    const r = await p.goto(site + '/mfqa-admin', { waitUntil: 'domcontentloaded', timeout: 90000 });
    results.registered.adminPageStatus = r ? r.status() : null;
    results.registered.adminPageShowsDashboard = await p.locator('#mf-dashboard-root, #mf-dash-root').count();
    await p.screenshot({ path: path.join(outDir, 'registered-mfqa-admin.png') });
  }
  await ctx.close();
}

// ── 4. admin control group ────────────────────────────────────────────────────────────────────
results.admin = {
  panelApi: await probe(adminPage, PANEL_API),
  moduleApi: await probe(adminPage, MODULE_API),
};

// ── 5. clean up the test user ─────────────────────────────────────────────────────────────────
results.cleanup = await adminPage.evaluate(async (u) => {
  const tokenEl = document.querySelector('input[name="__RequestVerificationToken"]');
  const token = tokenEl ? tokenEl.value : '';
  const list = await fetch('/API/PersonaBar/Users/GetUsers?searchText=' + encodeURIComponent(u) + '&filter=0&pageIndex=0&pageSize=5',
    { credentials: 'include' }).then((r) => r.json()).catch(() => null);
  const found = list && list.Results && list.Results[0];
  if (!found) return { deleted: false, why: 'user not found for deletion' };
  const del = await fetch('/API/PersonaBar/Users/DeleteUser', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'RequestVerificationToken': token },
    body: JSON.stringify({ userId: found.userId }),
  });
  const hard = await fetch('/API/PersonaBar/Users/HardDeleteUser', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'RequestVerificationToken': token },
    body: JSON.stringify({ userId: found.userId }),
  }).catch(() => null);
  return { deleted: del.status < 300, deleteStatus: del.status, hardStatus: hard ? hard.status : null, userId: found.userId };
}, TEST_USER);

fs.writeFileSync(path.join(outDir, 'access-control.json'), JSON.stringify(results, null, 2));

const line = (who, rows) => rows.map((r) => `  ${String(r.status).padEnd(5)} ${r.url}`).join('\n');
console.log('\n=== ANONYMOUS ===');
console.log('  persona bar rendered:', results.anonymous.personaBarPresent);
console.log(line('anon', results.anonymous.panelApi));
console.log(line('anon', results.anonymous.moduleApi));
if (results.registered) {
  console.log('\n=== REGISTERED USER (no admin role) ===');
  console.log('  login ok:', results.registered.loginOk,
              '| persona bar rendered:', results.registered.personaBarPresent,
              '| MegaForm menu visible:', results.registered.megaFormMenuVisible);
  console.log('  /mfqa-admin status:', results.registered.adminPageStatus,
              '| dashboard root on page:', results.registered.adminPageShowsDashboard);
  console.log(line('reg', results.registered.panelApi || []));
  console.log(line('reg', results.registered.moduleApi || []));
  const leaks = [...(results.registered.panelApi || []), ...(results.registered.moduleApi || [])]
    .filter((r) => r.status === 200);
  console.log(`\n  >>> reachable by a plain Registered user: ${leaks.length}`);
  leaks.forEach((r) => console.log(`      200 (${r.bytes} bytes) ${r.url}`));
} else {
  console.log('\n=== REGISTERED USER: not tested (user creation failed) ===', JSON.stringify(results.createUser));
}
console.log('\n=== ADMIN (control) ===');
console.log(line('admin', results.admin.panelApi));
console.log('\ncleanup:', JSON.stringify(results.cleanup));
await browser.close();
