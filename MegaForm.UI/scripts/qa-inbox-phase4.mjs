// Phase-4 QA: verify sidebar filters (status / date / by-form) actually
// reduce the visible row count + flip the .is-active marker.

import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5050';
const USER = 'host';
const PASS = 'abc@ABC1024';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_INBOX = `${BASE}/business/dao-tuan-hung/*/194/submissions`;

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.locator('button.btn-primary:has-text("Login")').first().click();
  await page.waitForFunction(() => !location.pathname.toLowerCase().includes('/login'), null, { timeout: 20000 }).catch(()=>{});
  await page.waitForTimeout(1500);
}

async function visibleCount(page) {
  return page.evaluate(() => {
    const rows = document.querySelectorAll('.mf-sx-row');
    return Array.from(rows).filter(r => r.offsetParent !== null).length;
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await login(page);
  await page.goto(URL_INBOX, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.mf-sx-row', { timeout: 20000 });
  await page.waitForTimeout(1500);

  const baseline = await visibleCount(page);
  const counts = await page.evaluate(() => ({
    overdue:    document.querySelector('[data-mf-date="overdue"] .mf-sx-count')?.textContent || '',
    dueToday:   document.querySelector('[data-mf-date="due-today"] .mf-sx-count')?.textContent || '',
    dueWeek:    document.querySelector('[data-mf-date="due-week"] .mf-sx-count')?.textContent || '',
    recvToday:  document.querySelector('[data-mf-date="recv-today"] .mf-sx-count')?.textContent || '',
    byFormItems:document.querySelectorAll('[data-mf-form-id]').length,
  }));
  console.log('baseline visible=', baseline);
  console.log('count badges=', counts);

  async function click(selector, label) {
    const loc = page.locator(selector).first();
    if (await loc.count() === 0) { console.log(`${label}: SKIP (selector missing)`); return; }
    await loc.click();
    await page.waitForTimeout(500);
    const after = await visibleCount(page);
    const active = await page.evaluate((s) => document.querySelector(s)?.classList.contains('is-active'), selector);
    console.log(`${label}  visible=${after}/${baseline}  active=${active}`);
  }

  // 1) Status filter: Approved
  await click('.mf-sx-nav[data-mf-filter="approved"]', 'status Approved');
  await page.screenshot({ path: 'qa-out/inbox-ph4-status-approved.png', fullPage: false });
  // back to All
  await click('.mf-sx-nav[data-mf-filter=""]', 'status All');

  // 2) Date bucket: Due this week
  await click('[data-mf-date="due-week"]', 'date Due-this-week');
  await page.screenshot({ path: 'qa-out/inbox-ph4-date-week.png', fullPage: false });
  // toggle off
  await click('[data-mf-date="due-week"]', 'date Due-week toggle-off');

  // 3) Date bucket: Overdue
  await click('[data-mf-date="overdue"]', 'date Overdue');
  await page.screenshot({ path: 'qa-out/inbox-ph4-date-overdue.png', fullPage: false });
  await click('[data-mf-date="overdue"]', 'date Overdue toggle-off');

  // 4) By form: click first form
  const firstFormSel = '[data-mf-form-id]';
  const firstFormId = await page.locator(firstFormSel).first().getAttribute('data-mf-form-id');
  await click(firstFormSel, `by-form formId=${firstFormId}`);
  await page.screenshot({ path: 'qa-out/inbox-ph4-byform.png', fullPage: false });

  // 5) Free-text search
  const inp = page.locator('.mf-sx-search-input').first();
  await inp.fill('annual');
  await page.waitForTimeout(500);
  const afterText = await visibleCount(page);
  const searchActiveCount = await page.evaluate(() => document.querySelectorAll('.mf-sx-nav.is-active').length);
  console.log(`search "annual" visible=${afterText} active-navs=${searchActiveCount}`);
  await page.screenshot({ path: 'qa-out/inbox-ph4-search-annual.png', fullPage: false });

  await browser.close();
})();
