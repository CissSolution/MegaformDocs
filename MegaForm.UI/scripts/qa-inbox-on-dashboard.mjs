// Phase-5 QA: navigate to the user's actual URL and verify the Gmail
// Submission Inbox mounts there in place of the legacy table.

import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5050';
const USER = 'host';
const PASS = 'abc@ABC1024';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.locator('button.btn-primary:has-text("Login")').first().click();
  await page.waitForFunction(() => !location.pathname.toLowerCase().includes('/login'), null, { timeout: 20000 }).catch(()=>{});
  await page.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console',     m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text().slice(0, 200)}`); });
  page.on('pageerror',   e => errors.push(`[pageerror] ${String(e).slice(0, 200)}`));
  page.on('requestfailed', r => {
    const url = r.url();
    if (url.includes('unsplash') || url.includes('_blazor/disconnect') || url.includes('Drawer_Animation')) return;
    errors.push(`[reqfail] ${r.method()} ${url.slice(0, 160)} ${r.failure()?.errorText || ''}`);
  });

  await login(page);
  console.log('[login] OK');

  // First navigate to Dashboard so we know the SPA route works
  await page.goto(`${BASE}/business`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Try clicking "Submissions" in the Dashboard sidebar
  const subsLink = page.locator('a:has-text("Submissions"), .mf-sidebar a[href*="submissions"]').first();
  if (await subsLink.count() > 0) {
    await subsLink.click();
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(()=>{});
    await page.waitForTimeout(2500);
  } else {
    // Fall back: navigate directly to a submissions URL
    await page.goto(`${BASE}/business/dao-tuan-hung/*/194/submissions`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);
  }
  const url = page.url();
  console.log('[navigated to]', url);

  // Wait for the new bundle's badge to appear
  await page.waitForSelector('[data-mf-submission-inbox-badge]', { timeout: 15000 }).catch(()=>{});
  await page.waitForTimeout(2500);

  const diag = await page.evaluate(() => {
    const root = document.querySelector('[data-mf-submission-inbox="1"]');
    const badge = root?.getAttribute('data-mf-submission-inbox-badge');
    const has = (sel) => !!document.querySelector(sel);
    const count = (sel) => document.querySelectorAll(sel).length;
    const text = (sel) => (document.querySelector(sel)?.innerText || '').trim().slice(0, 120);
    const firstRow = document.querySelector('.mf-sx-row');
    return {
      url: location.href,
      title: document.title,
      mountFound: !!root,
      runtimeBadge: badge,
      chrome: {
        topbar:  has('.mf-sx-top'),
        side:    has('.mf-sx-side'),
        main:    has('.mf-sx-main'),
        rail:    has('.mf-sx-rail'),
      },
      sidebar: {
        groups:        count('.mf-sx-grp'),
        calendarItems: count('.mf-sx-nav[data-mf-date]'),
        statusItems:   count('.mf-sx-nav[data-mf-filter]'),
        byFormItems:   count('.mf-sx-nav[data-mf-form-id]'),
        byFormHostText:text('[data-mf-by-form-host]'),
      },
      rows: {
        total:      count('.mf-sx-row'),
        firstWho:   firstRow?.querySelector('.mf-sx-row-sender')?.textContent?.trim(),
        firstPill:  firstRow?.querySelector('.mf-sx-row-pill')?.textContent?.trim(),
        firstSubj:  firstRow?.querySelector('.mf-sx-row-subject')?.textContent?.trim()?.slice(0, 80),
        firstTime:  firstRow?.querySelector('.mf-sx-row-time')?.textContent?.trim(),
      },
      pagerText: text('[data-mf-pager-text]'),
      legacyStillPresent: {
        legacyTable: has('table.mf-admin-table, .mf-submissions-table, table.mf-grid'),
        legacyShell: has('.mf-admin-content .mf-admin-title'),
      },
    };
  });
  console.log(JSON.stringify(diag, null, 2));
  await page.screenshot({ path: 'qa-out/inbox-on-dashboard.png', fullPage: false });
  console.log(errors.length ? '\n--- ERRORS ---\n' + errors.join('\n') : '(0 errors)');
  await browser.close();
})();
