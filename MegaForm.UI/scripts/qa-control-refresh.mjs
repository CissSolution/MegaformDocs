import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

const BASE = process.env.MF_QA_BASE || 'http://dnn10322_megaf.ai';
const USER = process.env.MF_QA_USER || 'host';
const PASS = process.env.MF_QA_PASS || 'dnnhost';
const CHROME = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = fileURLToPath(new URL('../qa-out/control-refresh/', import.meta.url));

const now = Date.now();

async function login(page) {
  await page.goto(`${BASE}/Login?ReturnUrl=${encodeURIComponent('/Contact')}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('input[id$=txtUsername]', { timeout: 30000 });
  await page.fill('input[id$=txtUsername]', USER);
  await page.fill('input[id$=txtPassword]', PASS);
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}),
    page.locator('input[id$=cmdLogin],a[id$=cmdLogin],button:has-text("Login")').first().click(),
  ]);
  await page.waitForTimeout(1500);
}

function qaSchema() {
  return {
    version: '1.0',
    appScope: 'control-refresh-qa',
    fields: [
      { key: 'order_date', label: 'Order date', type: 'Date', required: true, helpText: 'Pick the date for this order.' },
      {
        key: 'request_type',
        label: 'Request type',
        type: 'Select',
        required: true,
        placeholder: 'Choose a request type',
        options: [
          { value: 'quote', label: 'Quote request' },
          { value: 'support', label: 'Support case' },
          { value: 'delivery', label: 'Delivery update' },
          { value: 'bui-van-ha', label: 'BÃ¹i VÄƒn HÃ ' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        key: 'attachment',
        label: 'Supporting document',
        type: 'File',
        helpText: 'Attach PDF, DOCX, or PNG files up to 10MB.',
        fileSettings: { maxSizeMB: 10, maxFiles: 3, allowedExtensions: ['.pdf', '.doc', '.docx', '.png'] },
      },
      {
        key: 'contact_phone',
        label: 'Phone',
        type: 'Composite',
        widgetProps: {
          preset: 'phone',
          nav: 'roving',
          orient: 'horizontal',
          helperText: 'International input with country picker and dial prefix.',
        },
      },
      { key: 'star_rating', label: 'Star rating', type: 'Rating', widgetProps: { ratingStyle: 'star' } },
      { key: 'emoji_rating', label: 'Emoji rating', type: 'Rating', widgetProps: { ratingStyle: 'emoji' } },
      { key: 'heart_rating', label: 'Heart rating', type: 'Rating', widgetProps: { ratingStyle: 'heart' } },
      { key: 'thumb_rating', label: 'Helpful?', type: 'Rating', widgetProps: { ratingStyle: 'thumbs' } },
      { key: 'customer_signature', label: 'Signature', type: 'Signature', required: true, widgetProps: { height: 104, placeholderText: 'Draw your name', clearText: 'Reset signature', undoText: 'Back' } },
    ],
    settings: {},
  };
}

async function saveQaForm(page) {
  await page.goto(`${BASE}/Contact?qa=form-host-${now}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);

  return await page.evaluate(async ({ title, schema }) => {
    const anyWindow = window;
    const platform = anyWindow.__MF_PLATFORM__ || {};
    const mid = Number(platform.moduleId || platform.ModuleId || 0);
    const sf = anyWindow.jQuery?.ServicesFramework?.(mid);
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    if (sf) {
      headers.RequestVerificationToken = sf.getAntiForgeryValue();
      headers.ModuleId = String(sf.getModuleId());
      headers.TabId = String(sf.getTabId());
    }
    const body = {
      FormId: 0,
      Title: title,
      Description: 'QA form for refreshed Date, File Upload, Signature, Rating, Phone Pro, and Select controls.',
      Status: 'Published',
      SchemaJson: JSON.stringify(schema),
      SettingsJson: JSON.stringify({ appScope: 'control-refresh-qa' }),
      ThemeJson: '{}',
      PreserveModuleBindingOnSave: true,
    };
    const r = await fetch('/DesktopModules/MegaForm/API/Form/Save', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
    if (!r.ok) return { ok: false, status: r.status, payload, hasSf: !!sf, moduleId: mid };
    return { ok: true, status: r.status, payload, hasSf: !!sf, moduleId: mid };
  }, { title: `QA Control Refresh ${now}`, schema: qaSchema() });
}

async function main() {
  const fs = await import('node:fs/promises');
  await fs.mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const authCtx = await browser.newContext({ viewport: { width: 1365, height: 900 }, ignoreHTTPSErrors: true });
  let page = await authCtx.newPage();
  page.setDefaultTimeout(30000);

  await login(page);
  const save = await saveQaForm(page);
  console.log('[save]', JSON.stringify(save));
  if (!save.ok) throw new Error(`Save failed: ${JSON.stringify(save)}`);
  const formId = Number(save.payload.formId || save.payload.FormId);
  if (!formId) throw new Error(`No formId returned: ${JSON.stringify(save.payload)}`);
  await authCtx.close();

  const renderCtx = await browser.newContext({ viewport: { width: 1365, height: 900 }, ignoreHTTPSErrors: true });
  page = await renderCtx.newPage();
  page.setDefaultTimeout(30000);

  const publicUrl = `${BASE}/xx?formid=${formId}&qa=${now}`;
  await page.goto(publicUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.mf-field, .megaform-renderer, form', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}\\dnn-control-refresh-desktop.png`, fullPage: true });

  const checks = await page.evaluate(() => ({
    title: document.title,
    dateWrap: !!document.querySelector('.mf-date-input-wrap input[type="date"]'),
    selectWrap: !!document.querySelector('.mf-select-wrap select'),
    fileDrop: !!document.querySelector('.mf-file-dropzone .mf-file-dropzone-inner'),
    signature: !!document.querySelector('.mf-signature-field .mf-signature-canvas'),
    phone: !!document.querySelector('.mfp-phone-pro .mfp-phone-shell'),
    ratingStyles: Array.from(document.querySelectorAll('.mf-rating')).map(el => el.getAttribute('data-style')),
    fieldCount: document.querySelectorAll('.mf-field').length,
    visibleText: document.body.innerText.slice(0, 500),
  }));
  console.log('[checks]', JSON.stringify(checks));

  await page.locator('.mf-rating--star .mf-rating-item').nth(3).click({ timeout: 3000 }).catch(() => {});
  await page.locator('.mf-rating--emoji .mf-rating-item').nth(4).click({ timeout: 3000 }).catch(() => {});
  await page.locator('.mf-rating--heart .mf-rating-item').nth(2).click({ timeout: 3000 }).catch(() => {});
  await page.locator('.mf-rating--thumbs .mf-rating-item').first().click({ timeout: 3000 }).catch(() => {});
  await page.locator('.mf-select-wrap select').first().selectOption('support', { timeout: 3000 }).catch(() => {});
  await page.locator('.mfp-phone-country-trigger').first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}\\dnn-control-refresh-click-states.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(publicUrl + '&mobile=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.mf-field, .megaform-renderer, form', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}\\dnn-control-refresh-mobile.png`, fullPage: true });

  console.log('[result]', JSON.stringify({ formId, publicUrl, outDir: OUT }));
  await renderCtx.close();
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
