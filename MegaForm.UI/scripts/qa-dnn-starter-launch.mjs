// Visual QA — DNN Business Starters → Launch.
//
// Reproduces the 400 the user reported on the DNN site:
//   dnn10322_megatest.ai/Shop/New-Arrivals#mf-dashboard
//   POST /DesktopModules/MegaForm/API/Starter/Launch → 400 (Bad Request)
//
// What it does:
//   1. Logs in via DNN /Login as host/dnnhost
//   2. Navigates to the page from the screenshot
//   3. Hooks fetch + page.on('response') to capture EVERY request to
//      /Starter/Launch, including request headers/body + response body
//   4. Opens the Business Starters modal, clicks Launch Document Exchange
//   5. Dumps payload + response to qa-out/dnn-starter-launch.json so we know
//      EXACTLY why the controller rejected the request.

import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const BASE  = 'http://dnn10322_megatest.ai';
const PAGE  = '/Shop/New-Arrivals';
const USER  = 'host';
const PASS  = 'dnnhost';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function dnnLogin(page) {
  await page.goto(BASE + '/Login?ReturnUrl=' + encodeURIComponent(PAGE), { waitUntil: 'networkidle', timeout: 60000 });
  // DNN classic login form: #dnn_ctr_Login_Login_DNN_txtUsername / #dnn_ctr_Login_Login_DNN_txtPassword
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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  const launchRequests = [];
  const consoleEvents = [];

  page.on('console', m => {
    consoleEvents.push({ type: m.type(), text: m.text().slice(0, 600) });
  });
  page.on('pageerror', e => consoleEvents.push({ type: 'pageerror', text: String(e).slice(0, 600) }));

  // Capture every request to /Starter/* — both headers and body
  page.on('request', req => {
    const url = req.url();
    if (!/\/Starter\//i.test(url)) return;
    launchRequests.push({
      step: 'request',
      url,
      method: req.method(),
      headers: req.headers(),
      postData: req.postData()
    });
  });
  page.on('response', async resp => {
    const url = resp.url();
    if (!/\/Starter\//i.test(url)) return;
    let body = null;
    try { body = await resp.text(); } catch (_e) { body = '<<unreadable>>'; }
    launchRequests.push({
      step: 'response',
      url,
      status: resp.status(),
      headers: resp.headers(),
      body
    });
  });

  console.log('[step] login');
  await dnnLogin(page);
  console.log('[step] login OK, location =', page.url());

  console.log('[step] navigate to dashboard page');
  await page.goto(BASE + PAGE + '#mf-dashboard', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);

  // Dump key window state so we can confirm shim + platform context are sane.
  const platformState = await page.evaluate(() => {
    const p = window.__MF_PLATFORM__ || {};
    const sf = (window.jQuery && window.jQuery.ServicesFramework) ? window.jQuery.ServicesFramework(p.moduleId || p.instanceId || 0) : null;
    return {
      hasPlatform: !!window.__MF_PLATFORM__,
      platformKeys: Object.keys(p),
      moduleId: p.moduleId,
      instanceId: p.instanceId,
      tabId: p.tabId,
      portalId: p.portalId,
      apiBase: p.apiBase,
      hasJQuery: !!window.jQuery,
      hasServicesFramework: !!(window.jQuery && window.jQuery.ServicesFramework),
      hasMFStarter: !!(window.MFStarter && typeof window.MFStarter.launch === 'function'),
      sfModuleId: sf ? sf.getModuleId() : null,
      sfTabId:    sf ? sf.getTabId()    : null,
      sfAntiforgery: sf ? (sf.getAntiForgeryValue() || '').slice(0, 20) + '...' : null
    };
  });
  console.log('[platform]', JSON.stringify(platformState, null, 2));

  console.log('[step] open Business Starters modal');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button.mf-btn'))
      .find(b => /business starters/i.test(b.textContent || ''));
    if (btn) btn.click();
    else throw new Error('Business Starters button not found');
  });
  await page.waitForTimeout(1500);

  console.log('[step] click Launch on Document Exchange (the one user clicked)');
  const clickResult = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.mf-modal, .mf-modal-card, [role="dialog"], .mf-sat-overlay, .mf-modal-overlay, .mf-modal-body'));
    // Find the Launch button inside the Document Exchange card.
    // Strategy: scan all buttons that contain "Launch", pair them to their containing
    // card by sibling header text.
    const buttons = Array.from(document.querySelectorAll('button')).filter(b => /launch/i.test(b.textContent || ''));
    const matches = [];
    for (const b of buttons) {
      const card = b.closest('div');
      const headers = card ? Array.from(card.querySelectorAll('strong')).map(s => s.textContent.trim()) : [];
      matches.push({ headers, label: b.textContent.trim() });
    }
    // Pick the one whose card contains "Document Exchange"
    const docBtn = buttons.find(b => {
      let p = b;
      for (let i = 0; i < 6 && p; i++) { p = p.parentElement; if (!p) break; }
      return p && /document exchange/i.test(p.textContent || '');
    });
    if (!docBtn) return { found: false, matches };
    docBtn.click();
    return { found: true, matches };
  });
  console.log('[click]', JSON.stringify(clickResult, null, 2));

  // Wait long enough for the POST + console errors. Starter setup seeds
  // ~20 sample submissions through the workflow engine so it can take 30-90s.
  console.log('[step] waiting for /Starter/Launch response (up to 120s)…');
  for (let i = 0; i < 120; i++) {
    if (launchRequests.some(e => e.step === 'response')) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'qa-out/dnn-starter-launch.png', fullPage: false });
  writeFileSync('qa-out/dnn-starter-launch.json', JSON.stringify({
    platformState,
    clickResult,
    launchRequests,
    consoleEvents: consoleEvents.slice(-30)
  }, null, 2), 'utf8');

  console.log('=== captured', launchRequests.length, 'Starter/* request+response events ===');
  for (const e of launchRequests) {
    if (e.step === 'request') {
      console.log('REQUEST', e.method, e.url);
      console.log('  body:', e.postData);
      console.log('  headers (selected):', JSON.stringify({
        'content-type': e.headers['content-type'],
        'requestverificationtoken': e.headers['requestverificationtoken'] ? '(present)' : '(missing)',
        'moduleid': e.headers['moduleid'],
        'tabid': e.headers['tabid']
      }));
    } else {
      console.log('RESPONSE', e.status, e.url);
      console.log('  body:', (e.body || '').slice(0, 1200));
    }
  }

  await browser.close();
})().catch(e => { console.error('QA FAIL:', e); process.exit(1); });
