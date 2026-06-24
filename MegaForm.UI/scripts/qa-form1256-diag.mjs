// Diagnose why form 1256's Department dropdown (SQL) is empty.
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
  await page.goto(BASE + PAGE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1000);

  // Call FieldOptions for department on form 1256
  const out = await page.evaluate(async () => {
    const sf = window.jQuery?.ServicesFramework?.(0);
    const h = sf ? { RequestVerificationToken: sf.getAntiForgeryValue(), ModuleId: String(sf.getModuleId()), TabId: String(sf.getTabId()) } : {};
    const r = await fetch('/DesktopModules/MegaForm/API/Submit/FieldOptions?formId=1256&fieldKey=department', {
      credentials: 'same-origin', headers: h
    });
    return { status: r.status, body: await r.text() };
  });
  console.log('FieldOptions response:', out.status);
  console.log('Body:', out.body.slice(0, 800));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
