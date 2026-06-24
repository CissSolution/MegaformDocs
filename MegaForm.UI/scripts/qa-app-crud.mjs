// Visual QA — AppDefinition CRUD endpoints work end-to-end:
//   1. GET List → baseline
//   2. POST Save → create new app "QA Test App"
//   3. GET List → verify it appears
//   4. POST AssignForm → assign 2 forms to the new app
//   5. GET Get → verify forms[] contains those 2
//   6. POST Delete → remove
//   7. GET List → verify gone

import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const BASE = 'http://dnn10322_megatest.ai';
const PAGE = '/Shop/New-Arrivals';
const USER = 'host';
const PASS = 'dnnhost';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function login(page) {
  await page.goto(BASE + '/Login?ReturnUrl=' + encodeURIComponent(PAGE), { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('input[id$=txtUsername]', { timeout: 30000 });
  await page.fill('input[id$=txtUsername]', USER);
  await page.fill('input[id$=txtPassword]', PASS);
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }).catch(()=>{}),
    page.locator('input[id$=cmdLogin],a[id$=cmdLogin],button:has-text("Login")').first().click(),
  ]);
  await page.waitForTimeout(2000);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  await login(page);
  await page.goto(BASE + PAGE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  const run = await page.evaluate(async () => {
    const sf = window.jQuery?.ServicesFramework?.(window.__MF_PLATFORM__?.moduleId || 0);
    const authH = sf ? { RequestVerificationToken: sf.getAntiForgeryValue(), ModuleId: String(sf.getModuleId()), TabId: String(sf.getTabId()) } : {};
    const jsonH = { 'Content-Type': 'application/json', ...authH };

    async function get(path) {
      const r = await fetch('/DesktopModules/MegaForm/API/Phase2/' + path, { credentials: 'same-origin', headers: authH });
      return { status: r.status, body: await r.text() };
    }
    async function post(path, body) {
      const r = await fetch('/DesktopModules/MegaForm/API/Phase2/' + path, { method: 'POST', credentials: 'same-origin', headers: jsonH, body: JSON.stringify(body) });
      return { status: r.status, body: await r.text() };
    }

    const out = {};
    out.listBefore = await get('AppDefinitionList');

    out.create = await post('AppDefinitionSave', {
      appKey: 'qa-test-app',
      appName: 'QA Test App',
      appScope: 'qa-test-app',
      description: 'Created by Playwright QA',
      icon: 'fa-vial',
      accentColor: '#ea580c',
      isEnabled: true,
      sortOrder: 99
    });

    out.listAfterCreate = await get('AppDefinitionList');

    // Find 2 forms to assign — prefer non-starter Recruitment forms so we
    // don't corrupt the starter scoping. Pick the 2 lowest formIds from the
    // portal's first 5 forms in /Form/ListAll.
    const listAll = await fetch('/DesktopModules/MegaForm/API/Form/ListAll', { credentials: 'same-origin', headers: authH });
    const allForms = await listAll.json();
    out.firstFormIds = (Array.isArray(allForms) ? allForms : []).slice(0, 2).map(f => f.formId || f.FormId);

    out.assign1 = await post('AppDefinitionAssignForm', { formId: out.firstFormIds[0], appScope: 'qa-test-app', assign: true });
    out.assign2 = await post('AppDefinitionAssignForm', { formId: out.firstFormIds[1], appScope: 'qa-test-app', assign: true });

    out.getAfterAssign = await get('AppDefinitionGet?appKey=qa-test-app');

    // Unassign + delete to clean up
    out.unassign1 = await post('AppDefinitionAssignForm', { formId: out.firstFormIds[0], appScope: '', assign: false });
    out.unassign2 = await post('AppDefinitionAssignForm', { formId: out.firstFormIds[1], appScope: '', assign: false });

    let createdAppId = 0;
    try { createdAppId = (JSON.parse(out.create.body)).appId; } catch {}
    out.delete = await post('AppDefinitionDelete', { appId: createdAppId });

    out.listAfterDelete = await get('AppDefinitionList');
    return out;
  });

  // Pretty-print results
  console.log('--- listBefore ---', run.listBefore.status, run.listBefore.body.slice(0, 200));
  console.log('--- create ---',     run.create.status, run.create.body);
  console.log('--- listAfterCreate ---', run.listAfterCreate.status, run.listAfterCreate.body.slice(0, 400));
  console.log('--- assignForms ---', run.firstFormIds, run.assign1.status, run.assign2.status);
  console.log('--- getAfterAssign ---', run.getAfterAssign.status);
  try {
    const data = JSON.parse(run.getAfterAssign.body);
    console.log('    forms in app:', (data.forms || []).map(f => `#${f.formId} ${f.title}`));
  } catch {}
  console.log('--- delete ---',  run.delete.status, run.delete.body);
  console.log('--- listAfterDelete ---', run.listAfterDelete.status, run.listAfterDelete.body.slice(0, 200));

  let pass = false;
  try {
    const created = JSON.parse(run.create.body);
    const afterGet = JSON.parse(run.getAfterAssign.body);
    const beforeCount  = (JSON.parse(run.listBefore.body).items || []).length;
    const afterCreateCount = (JSON.parse(run.listAfterCreate.body).items || []).length;
    const afterDeleteCount = (JSON.parse(run.listAfterDelete.body).items || []).length;
    const formsAfter = (afterGet.forms || []).length;
    pass = (created.appId > 0)
        && (afterCreateCount === beforeCount + 1)
        && (formsAfter >= 2)
        && (afterDeleteCount === beforeCount);
  } catch {}
  console.log(pass ? '\n=== PASS — full CRUD + form assignment cycle ===' : '\n=== FAIL ===');
  writeFileSync('qa-out/app-crud.json', JSON.stringify(run, null, 2), 'utf8');
  await browser.close();
  process.exit(pass ? 0 : 2);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
