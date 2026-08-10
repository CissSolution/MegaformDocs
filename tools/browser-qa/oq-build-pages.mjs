/**
 * One Oqtane page per seeded form: create the page, drop a MegaForm module on it, bind the form.
 *
 * Everything runs as a same-origin fetch from a logged-in Blazor page, because that is the only
 * context that carries the Oqtane auth cookie and the site/module headers the API insists on.
 *
 * Traps this script already pays for (do not "simplify" them away):
 *   - POST /api/page answers 200 with an EMPTY BODY and creates the page anyway, so the new id has
 *     to be read back from GET /api/page?siteid=1
 *   - a page POSTed with another page's permissionList gets ZERO permission rows and is then
 *     invisible to GET /api/page and 403 on GET /api/page/{id} - so every page is re-PUT with its
 *     permissions re-keyed to its own id
 *   - GET /api/pagemodule?siteid=1 is 404 on Oqtane 10.2.1, so idempotency is by page path only
 *   - the form binding is the Oqtane key `MegaForm:FormId` (DNN's MegaForm_FormId triple does not
 *     exist here); Index.razor treats a positive form id as "configured" on its own
 *
 *   node tools/browser-qa/oq-build-pages.mjs [--site http://localhost:5130] [--dry]
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SITE = arg('site', 'http://localhost:5130').replace(/\/$/, '');
const USER = arg('user', 'host');
const PASS = arg('pass', 'abc@ABC1024');
const SITEID = Number(arg('siteid', '1'));
const DRY = process.argv.includes('--dry');

// path -> { form id on OQTANE, page title }.  Ids come from MF_Forms.devBulkSeed.sourceFile.
const PAGES = [
  ['mf-xmas-sale', 25, 'Christmas Offer - EuroYouth Application'],
  ['mf-xmas-newsletter', 30, 'Christmas Newsletter - EuroYouth'],
  ['mf-agency-flyer', 26, 'Agency Flyer - EuroYouth Application'],
  ['mf-first-book', 24, "Baby's First Book - Registration"],
  ['mf-gold-suite', 28, 'Gold Suite - Membership Application'],
  ['mf-rose-wellness', 29, 'EuroYouth 2026 - Registration'],
  ['mf-newsletter-amber', 27, 'Newsletter Signup'],
  ['mf-job-application', 21, 'Apply for Position'],
  ['mf-lagoon-booking', 22, 'Reserve Your Perfect Stay'],
  ['mf-product-order', 23, 'Create Order'],
  ['mf-golden-pro', 18, 'Golden Pro - Agent Registration'],
  ['mf-invoice-navy', 19, 'Invoice Request - Navy and Orange'],
  ['mf-invoice-spinera', 20, 'Spinera Invoice - Blue'],
  ['mf-invoice-codexo', 31, 'Codexo Invoice - Cyan'],
  ['mf-corporate-reg', 17, 'Registration Form - Corporate Blue'],
  ['mf-ielts-report', 16, 'IELTS Test Report Form'],
  ['mf-massage-intake', 15, 'Massage Therapy - Client Intake'],
  ['mf-massage-body', 18 - 4, 'Massage Session Plan and Body Chart'],   // 14
  ['mf-festa-italiana', 32, 'Festa Italiana'],
  ['mf-document-registration', 70, 'EuroYouth Document Registration'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// ---- login ------------------------------------------------------------------------------------
await page.goto(`${SITE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
let authed = await page.evaluate(() => document.body.innerText.includes('Logout'));
if (!authed) {
  for (let i = 0; i < 60 && !(await page.$('input[type=password]')); i++) await page.waitForTimeout(1000);
  await page.evaluate(({ u, p }) => {
    const inputs = [...document.querySelectorAll('input')];
    const pw = inputs.find((i) => i.type === 'password');
    const un = inputs.slice(0, inputs.indexOf(pw)).reverse()
      .find((i) => i.type === 'text' || i.type === '' || !i.type);
    const set = (el, v) => {
      el.focus(); el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    };
    set(un, u); set(pw, p);
  }, { u: USER, p: PASS });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^\s*login\s*$/i.test(x.textContent || ''));
    if (b) b.click();
  });
  for (let i = 0; i < 40 && !authed; i++) {
    await page.waitForTimeout(1000);
    authed = await page.evaluate(() => document.body.innerText.includes('Logout'));
  }
}
console.log('session:', authed ? 'authenticated' : 'ANONYMOUS');
if (!authed) { await browser.close(); process.exit(2); }

// ---- everything else runs in page context -----------------------------------------------------
const result = await page.evaluate(async ({ pages, siteId, dry }) => {
  const H = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-OQTANE-SITEID': String(siteId) };
  const get = async (u) => {
    const r = await fetch(u, { credentials: 'same-origin', headers: H });
    const t = await r.text();
    try { return { ok: r.ok, status: r.status, json: t ? JSON.parse(t) : null }; }
    catch { return { ok: r.ok, status: r.status, text: t.slice(0, 300) }; }
  };
  const post = async (u, body) => {
    const r = await fetch(u, { method: 'POST', credentials: 'same-origin', headers: H, body: JSON.stringify(body) });
    const t = await r.text();
    try { return { ok: r.ok, status: r.status, json: t ? JSON.parse(t) : null }; }
    catch { return { ok: r.ok, status: r.status, text: t.slice(0, 300) }; }
  };
  const put = async (u, body) => {
    const r = await fetch(u, { method: 'PUT', credentials: 'same-origin', headers: H, body: JSON.stringify(body) });
    return { ok: r.ok, status: r.status };
  };

  const log = [];
  const site = (await get(`/api/site/${siteId}`)).json;
  let all = (await get(`/api/page?siteid=${siteId}`)).json || [];
  const home = all.find((p) => (p.path || '') === '') || all[0];
  if (!home) return { error: 'no home page' };

  const defs = (await get(`/api/moduledefinition?siteid=${siteId}`)).json || [];
  const def = defs.find((d) => (d.ModuleDefinitionName || d.moduleDefinitionName || '').indexOf('MegaForm') >= 0);
  if (!def) return { error: 'MegaForm module definition not found', defs: defs.length };
  const defName = def.ModuleDefinitionName || def.moduleDefinitionName;

  const out = [];
  for (const [path, formId, title] of pages) {
    let pg = all.find((p) => (p.path || '') === path);
    if (!pg) {
      if (dry) { out.push({ path, formId, action: 'would-create' }); continue; }
      const body = {
        SiteId: siteId, ParentId: null, Name: title, Title: title, Path: path,
        Order: 100, Url: '', ThemeType: home.themeType || site.defaultThemeType,
        DefaultContainerType: home.defaultContainerType || site.defaultContainerType,
        HeadContent: '', BodyContent: '', Icon: '', IsNavigation: false, IsClickable: true,
        IsPersonalizable: false, UserId: null, IsDeleted: false, EffectiveDate: null,
        ExpiryDate: null, PermissionList: (home.permissionList || home.PermissionList || []),
      };
      await post('/api/page', body);                       // 200 with an empty body, still created
      all = (await get(`/api/page?siteid=${siteId}`)).json || [];
      pg = all.find((p) => (p.path || '') === path);
      if (!pg) { out.push({ path, formId, error: 'page not created' }); continue; }

      // re-key the permissions to the new page or the page is invisible to the API
      const fresh = (await get(`/api/page/${pg.pageId || pg.PageId}`)).json;
      if (fresh) {
        const id = pg.pageId || pg.PageId;
        const list = (fresh.permissionList || fresh.PermissionList || []).map((p) => ({
          ...p, permissionId: 0, PermissionId: 0,
          entityName: 'Page', EntityName: 'Page', entityId: id, EntityId: id,
        }));
        await put(`/api/page/${id}`, { ...fresh, permissionList: list, PermissionList: list });
      }
    }
    const pageId = pg.pageId || pg.PageId;

    // module + pagemodule (GET /api/pagemodule is 404 on 10.2.1, so this is create-only)
    const mod = await post('/api/module', {
      SiteId: siteId, PageModuleId: -1, ModuleDefinitionName: defName,
      AllPages: false, PermissionList: (home.permissionList || home.PermissionList || []),
    });
    const moduleId = mod.json && (mod.json.moduleId || mod.json.ModuleId);
    if (!moduleId) { out.push({ path, pageId, formId, error: 'module not created', status: mod.status }); continue; }
    const pm = await post('/api/pagemodule', {
      PageId: pageId, ModuleId: moduleId, Title: title, Pane: 'Default', Order: 1,
      ContainerType: home.defaultContainerType || site.defaultContainerType,
      EffectiveDate: null, ExpiryDate: null,
    });
    out.push({ path, pageId, moduleId, formId, pageModule: pm.status });
  }
  return { home: home.path, defName, out, log };
}, { pages: PAGES, siteId: SITEID, dry: DRY });

console.log(JSON.stringify(result, null, 1).slice(0, 6000));
writeFileSync('qa-out/_oq-pages.json', JSON.stringify(result, null, 1));
await browser.close();
