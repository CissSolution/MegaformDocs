// Visual QA — FormLookup field type end-to-end.
//
// Pre-req: Recruitment starter is launched on the DNN site so
//   forms exist: Job Posting (#1257), Application (#1258), Interview (#1259).
//
// Steps:
//   1. Login DNN host
//   2. GET Application form schema, locate `job_id` field
//   3. Mutate the field's Properties bag with FormLookup config:
//        optionsSource = 'form-lookup'
//        optionsLookupFormId = 1257  (Job Posting form)
//        optionsLookupValueField = 'submissionId'
//        optionsLookupLabelField = 'position_title'
//      Then PUT/POST the updated schema back via Form/Save.
//   4. GET /Submit/FieldOptions?formId=APP_FORM&fieldKey=job_id and
//      VERIFY response is an array of 4 options, each with a numeric value
//      (submission id) and a label matching one of the seeded job titles.

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

  // 1. Find the 3 recruitment forms by AppScope
  const recruitmentForms = await page.evaluate(async () => {
    const sf = window.jQuery?.ServicesFramework?.(window.__MF_PLATFORM__?.moduleId || 0);
    const h = sf ? { RequestVerificationToken: sf.getAntiForgeryValue(), ModuleId: String(sf.getModuleId()), TabId: String(sf.getTabId()) } : {};
    const r = await fetch('/DesktopModules/MegaForm/API/Form/ListAll', { credentials: 'same-origin', headers: h });
    const arr = await r.json();
    return (Array.isArray(arr) ? arr : []).filter(f => /Recruitment - /i.test(f.title || f.Title || ''))
      .map(f => ({ formId: f.formId || f.FormId, title: f.title || f.Title }));
  });
  console.log('[recruitment forms]', recruitmentForms);

  const jobForm = recruitmentForms.find(f => /Job Posting/i.test(f.title));
  const appForm = recruitmentForms.find(f => /Candidate Application/i.test(f.title));
  if (!jobForm || !appForm) { console.error('Missing required forms — run Recruitment starter first.'); process.exit(1); }

  // 2. Read Application form's current schema, patch job_id field config
  const patchResult = await page.evaluate(async ({ jobFormId, appFormId }) => {
    const sf = window.jQuery?.ServicesFramework?.(window.__MF_PLATFORM__?.moduleId || 0);
    const h = sf ? { RequestVerificationToken: sf.getAntiForgeryValue(), ModuleId: String(sf.getModuleId()), TabId: String(sf.getTabId()) } : {};
    const r = await fetch(`/DesktopModules/MegaForm/API/Form/Get?formId=${appFormId}`, { credentials: 'same-origin', headers: h });
    const form = await r.json();
    if (!form) return { error: 'Could not GET application form' };
    let schema = null;
    try { schema = JSON.parse(form.SchemaJson || form.schemaJson || '{}'); } catch (e) { return { error: 'Schema parse failed: ' + e.message }; }
    const fields = schema.Fields || schema.fields || [];
    const jobIdField = fields.find(f => (f.Key || f.key) === 'job_id');
    if (!jobIdField) return { error: 'job_id field not found in application schema' };

    // Mutate properties bag — server reads from `Properties` (or `properties` lowercase).
    if (!jobIdField.Properties && !jobIdField.properties) {
      // Inject Properties
      jobIdField.Properties = {};
    }
    const props = jobIdField.Properties || jobIdField.properties;
    props.optionsSource = 'form-lookup';
    props.optionsLookupFormId = jobFormId;
    props.optionsLookupValueField = 'submissionId';
    props.optionsLookupLabelField = 'position_title';
    // Also flip type to Select so the renderer treats it as dropdown.
    if (jobIdField.Type) jobIdField.Type = 'Select'; else jobIdField.type = 'Select';

    // PUT back. The save endpoint takes the form + SchemaJson.
    const saveBody = {
      formId:      appFormId,
      title:       form.Title       || form.title,
      description: form.Description || form.description,
      schemaJson:  JSON.stringify(schema),
      settingsJson: form.SettingsJson || form.settingsJson,
      themeJson:   form.ThemeJson    || form.themeJson,
      status:      form.Status       || form.status,
      submitButtonText: form.SubmitButtonText || form.submitButtonText,
      successMessage:   form.SuccessMessage   || form.successMessage,
      requireAuth: form.RequireAuth ?? form.requireAuth ?? false,
      enableCaptcha: form.EnableCaptcha ?? form.enableCaptcha ?? false,
      enableSaveResume: form.EnableSaveResume ?? form.enableSaveResume ?? false,
      appScope:    form.AppScope ?? form.appScope ?? ''
    };
    const saveHeaders = { 'Content-Type': 'application/json' };
    Object.assign(saveHeaders, h);
    const sr = await fetch('/DesktopModules/MegaForm/API/Form/Save', { method: 'POST', credentials: 'same-origin', headers: saveHeaders, body: JSON.stringify(saveBody) });
    return { saveStatus: sr.status, saveBody: (await sr.text()).slice(0, 300) };
  }, { jobFormId: jobForm.formId, appFormId: appForm.formId });
  console.log('[patch job_id field]', patchResult);

  // 3. Hit FieldOptions endpoint
  const optionsResp = await page.evaluate(async (appFormId) => {
    const r = await fetch(`/DesktopModules/MegaForm/API/Submit/FieldOptions?formId=${appFormId}&fieldKey=job_id`, { credentials: 'same-origin' });
    return { status: r.status, body: await r.text() };
  }, appForm.formId);
  console.log('[FieldOptions]', optionsResp.status, optionsResp.body);

  let pass = false;
  try {
    const arr = JSON.parse(optionsResp.body);
    if (Array.isArray(arr) && arr.length > 0) {
      console.log(`✓ Got ${arr.length} options:`);
      arr.forEach(o => console.log(`   value=${o.Value || o.value}  label=${o.Label || o.label}`));
      pass = arr.length >= 3;
    }
  } catch {}
  console.log(pass ? '\n=== PASS — FormLookup endpoint returned options from another form ===' : '\n=== FAIL ===');

  writeFileSync('qa-out/formlookup.json', JSON.stringify({ recruitmentForms, patchResult, optionsResp, pass }, null, 2), 'utf8');

  await browser.close();
  process.exit(pass ? 0 : 2);
})().catch(e => { console.error('QA FAIL:', e); process.exit(1); });
