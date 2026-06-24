// QA — Server-side fallback + Save-time normalization for missing optionsConnectionKey.
// 1) Load /xx?formid=1256 → Department options must populate (server fallback).
// 2) POST a fake save with SQL field missing optionsConnectionKey → response must save
//    the field with "DashboardDatabase" auto-filled.
import { chromium } from 'playwright-core';
const BASE='http://dnn10322_megatest.ai'; const PAGE='/Shop/New-Arrivals'; const USER='host'; const PASS='dnnhost';
const CHROME='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function login(page) {
  await page.goto(BASE+'/Login?ReturnUrl='+encodeURIComponent(PAGE), { waitUntil:'networkidle', timeout:60000 });
  await page.waitForSelector('input[id$=txtUsername]', { timeout: 30000 });
  await page.fill('input[id$=txtUsername]', USER);
  await page.fill('input[id$=txtPassword]', PASS);
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }).catch(()=>{}),
    page.locator('input[id$=cmdLogin],a[id$=cmdLogin],button:has-text("Login")').first().click(),
  ]);
  await page.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await login(page);

  // [Test A] Server-side fallback — form 1256's department field has no connection key
  await page.goto(BASE + '/xx?formid=1256', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  const optCount = await page.evaluate(() => {
    return (document.querySelector('select[name="department"]')?.options.length) || 0;
  });
  console.log('[A] Server-side fallback — Department option count =', optCount, optCount > 1 ? 'PASS' : 'FAIL');

  // [Test B] Save-time normalization — POST a temporary form via API with SQL field but no conn key.
  // We stay on /xx?formid=1256 because that page has a real MegaForm module instance
  // (ServicesFramework binds moduleId from the active module — moduleId=0 returns 400).
  const saveResult = await page.evaluate(async () => {
    const mid = window.__MF_PLATFORM__?.moduleId || 0;
    const sf = window.jQuery?.ServicesFramework?.(mid);
    const h = sf ? { 'Content-Type': 'application/json', RequestVerificationToken: sf.getAntiForgeryValue(), ModuleId: String(sf.getModuleId()), TabId: String(sf.getTabId()) } : {};
    const schema = {
      fields: [
        { key: 'name', type: 'Text', label: 'Name' },
        { key: 'dept', type: 'Select', label: 'Dept',
          properties: { optionsSource: 'sql', optionsDatabaseType: 'SqlServer', optionsSql: 'SELECT LogTypeKey, LogConfigID FROM EventLog' }
        }
      ],
      settings: {}, version: '1.0'
    };
    const body = {
      FormId: 0,
      Title: 'QA_SqlConn_Default_Test_' + Date.now(),
      Description: '',
      SchemaJson: JSON.stringify(schema),
      SettingsJson: '{}',
      ThemeJson: '{}',
      Status: 'Draft',
      SubmitButtonText: 'Submit',
      SuccessMessage: 'ok',
      RedirectUrl: '',
      RulesJson: '[]'
    };
    const r = await fetch('/DesktopModules/MegaForm/API/Form/Save', { method: 'POST', credentials: 'same-origin', headers: h, body: JSON.stringify(body) });
    const saveResp = await r.json();
    const fid = Number(saveResp.formId || saveResp.FormId);
    if (!fid) return { ok: false, status: r.status, body: saveResp };
    // Re-fetch the saved schema
    const r2 = await fetch('/DesktopModules/MegaForm/API/Form/Get?formId=' + fid, { credentials: 'same-origin', headers: h });
    const saved = await r2.json();
    return { ok: true, formId: fid, schemaJson: saved.SchemaJson || saved.schemaJson };
  });
  if (!saveResult.ok) {
    console.log('[B] Save failed:', saveResult);
    process.exit(1);
  }
  const savedSchema = JSON.parse(saveResult.schemaJson);
  const dept = savedSchema.fields.find(f => f.key === 'dept');
  const connKey = dept?.properties?.optionsConnectionKey;
  console.log('[B] Save-time normalize — FormId', saveResult.formId, 'optionsConnectionKey =', JSON.stringify(connKey), connKey === 'DashboardDatabase' ? 'PASS' : 'FAIL');

  // Cleanup
  await page.evaluate(async (fid) => {
    const sf = window.jQuery?.ServicesFramework?.(0);
    const h = sf ? { RequestVerificationToken: sf.getAntiForgeryValue(), ModuleId: String(sf.getModuleId()), TabId: String(sf.getTabId()) } : {};
    await fetch('/DesktopModules/MegaForm/API/Form/Delete?formId=' + fid, { method: 'POST', credentials: 'same-origin', headers: h });
  }, saveResult.formId);

  const pass = optCount > 1 && connKey === 'DashboardDatabase';
  console.log(pass ? '\n=== PASS ===' : '\n=== FAIL ===');
  await browser.close();
  process.exit(pass ? 0 : 2);
})().catch(e => { console.error(e); process.exit(1); });
