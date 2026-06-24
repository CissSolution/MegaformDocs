// Seed Blog Publishing Starter on DNN
import { chromium } from 'playwright-core';

const BASE   = 'http://dnn10322_megaf.ai';
const PAGE   = '/xx';
const USER   = 'host';
const PASS   = 'dnnhost';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function dnnLogin(page) {
  await page.goto(`${BASE}/Login?ReturnUrl=${encodeURIComponent(PAGE + '#mf-dashboard')}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('input[id$=txtUsername]', { timeout: 30000 });
  await page.fill('input[id$=txtUsername]', USER);
  await page.fill('input[id$=txtPassword]', PASS);
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}),
    page.locator('input[id$=cmdLogin],a[id$=cmdLogin],button:has-text("Login")').first().click(),
  ]);
  await page.waitForTimeout(2000);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);

  console.log('[1] Login...');
  await dnnLogin(page);

  // Navigate to dashboard
  console.log('[2] Navigate to dashboard...');
  await page.goto(`${BASE}${PAGE}#mf-dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Look for Business Starters or Launch buttons
  const starterLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button, input'))
      .filter(el => /starter|launch|blog|business/i.test(el.innerText + ' ' + el.value + ' ' + el.title))
      .map(el => ({
        tag: el.tagName,
        text: (el.innerText || el.value || el.title || '').slice(0, 80),
        className: el.className || '',
        id: el.id || ''
      }));
  });
  console.log('[3] Starter-related elements:', JSON.stringify(starterLinks, null, 2));

  await page.screenshot({ path: 'monitor/out/deploy-verify/dashboard-full.png', fullPage: true });
  console.log('[4] Dashboard screenshot saved');

  // Try API direct call
  console.log('[5] Trying API to seed blog...');
  const platformState = await page.evaluate(() => {
    const p = window.__MF_PLATFORM__ || {};
    return { apiBase: p.apiBase, moduleId: p.moduleId, tabId: p.tabId, portalId: p.portalId };
  });
  console.log('Platform:', JSON.stringify(platformState));

  // Try Starter/Launch endpoint
  const launchEndpoints = [
    '/DesktopModules/MegaForm/API/Starter/Launch',
    '/DesktopModules/MegaForm/API/MegaForm/Starter/Launch',
    `${platformState.apiBase}Starter/Launch`,
    `${platformState.apiBase}MegaForm/Starter/Launch`,
  ];

  for (const endpoint of launchEndpoints) {
    try {
      const result = await page.evaluate(async (url, payload) => {
        try {
          const r = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          return { url, status: r.status, text: await r.text() };
        } catch (e) {
          return { url, status: 0, error: e.message };
        }
      }, `${BASE}${endpoint}`, { key: 'blog', portalId: platformState.portalId || 0 });
      console.log(`API ${endpoint}: status=${result.status}`, result.text?.slice(0,200) || result.error);
      if (result.status === 200) break;
    } catch (e) {
      console.log(`API ${endpoint} error:`, e.message);
    }
  }

  // Check forms after API call
  await page.goto(`${BASE}${PAGE}#mf-dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  const formCountAfter = await page.evaluate(() => {
    const txt = document.body.innerText || '';
    const m = txt.match(/(\d+)\s*forms/i);
    return m ? m[1] : 'unknown';
  });
  console.log('[6] Form count after seed attempt:', formCountAfter);

  await page.screenshot({ path: 'monitor/out/deploy-verify/dashboard-after-seed.png', fullPage: true });
  await browser.close();
  console.log('[Done]');
})();
