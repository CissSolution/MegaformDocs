// Debug: verify AssignForm actually persists AppScope on the form row
import { chromium } from 'playwright-core';

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

  const out = await page.evaluate(async () => {
    const sf = window.jQuery?.ServicesFramework?.(window.__MF_PLATFORM__?.moduleId || 0);
    const authH = sf ? { RequestVerificationToken: sf.getAntiForgeryValue(), ModuleId: String(sf.getModuleId()), TabId: String(sf.getTabId()) } : {};
    const jsonH = { 'Content-Type': 'application/json', ...authH };

    async function readForm(id) {
      const r = await fetch(`/DesktopModules/MegaForm/API/Form/Get?formId=${id}`, { credentials: 'same-origin', headers: authH });
      const f = await r.json();
      return { formId: f.FormId || f.formId, appScope: f.AppScope || f.appScope };
    }
    async function post(path, body) {
      const r = await fetch('/DesktopModules/MegaForm/API/Phase2/' + path, { method: 'POST', credentials: 'same-origin', headers: jsonH, body: JSON.stringify(body) });
      return { status: r.status, body: await r.text() };
    }

    const before = await readForm(1258);
    const create = await post('AppDefinitionSave', { appKey:'qa-test-app2', appName:'QA Test App 2', appScope:'qa-test-app2', description:'debug', icon:'fa-vial', accentColor:'#ea580c', isEnabled:true, sortOrder:99 });
    const assign = await post('AppDefinitionAssignForm', { formId: 1258, appScope: 'qa-test-app2', assign: true });
    // Read both via Form/Get AND via Phase2/AppDefinitionGet to see if cache differs
    const after = await readForm(1258);
    const appBundle = await fetch('/DesktopModules/MegaForm/API/Phase2/AppDefinitionGet?appKey=qa-test-app2', { credentials: 'same-origin', headers: authH });
    const bundleJson = await appBundle.text();

    // Skip cleanup so we can sqlcmd verify DB state after the script finishes
    return { before, create, assign, after, bundleAfterAssign: bundleJson };
  });
  console.log('BEFORE form 1258 (via Form/Get):', out.before);
  console.log('CREATE app:',  out.create);
  console.log('ASSIGN form 1258→qa-test-app2:',  out.assign);
  console.log('AFTER form 1258 (via Form/Get):',  out.after);
  console.log('App bundle after assign (via Phase2/AppDefinitionGet):');
  try {
    const j = JSON.parse(out.bundleAfterAssign);
    console.log('  app scope:', j.app?.AppScope ?? j.app?.appScope);
    console.log('  forms:', (j.forms || []).map(f => `#${f.formId} ${f.title} scope=${f.appScope}`));
  } catch { console.log('  ', out.bundleAfterAssign); }

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
