// Diagnose why the user reports sidebar clicks not working.
// Logs in, goes to leave board, inspects EVERY clickable sidebar element,
// programmatically clicks each filter, then captures before/after state.

import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5050';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function loginAsHost(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.fill('#username', 'host');
  await page.fill('#password', 'abc@ABC1024');
  await page.locator('button.btn-primary:has-text("Login")').first().click();
  await page.waitForFunction(() => !location.pathname.toLowerCase().includes('/login'), null, { timeout: 20000 }).catch(()=>{});
  await page.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text().slice(0,200)}`); });
  page.on('pageerror', e => errors.push(`[pageerror] ${String(e).slice(0,200)}`));

  await loginAsHost(page);
  await page.goto(`${BASE}/business?vk=leave-request-board`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.mf-gm', { timeout: 15000 });
  await page.waitForSelector('.mf-gm-row', { timeout: 15000 }).catch(()=>{});
  await page.waitForTimeout(2000);

  // 1. Dump every clickable thing in sidebar
  const sidebarInspect = await page.evaluate(() => {
    const navs = document.querySelectorAll('.mf-gm-side .nav');
    return Array.from(navs).map(n => {
      const cs = getComputedStyle(n);
      return {
        text: n.innerText.replace(/\s+/g, ' ').trim().slice(0, 30),
        filter: n.getAttribute('data-mf-filter'),
        date: n.getAttribute('data-mf-date'),
        cursor: cs.cursor,
        pointerEvents: cs.pointerEvents,
        listeners: !!(n.onclick || n.__events),
        active: n.classList.contains('active'),
      };
    });
  });
  console.log('=== sidebar items ===');
  sidebarInspect.forEach(s => console.log(JSON.stringify(s)));

  // 2. Check inline script presence + execution side-effects
  const scriptState = await page.evaluate(() => ({
    inlineScripts: document.querySelectorAll('.mflv-shell script').length,
    plainScripts: document.querySelectorAll('script:not([src])').length,
    windowFlag: window.__mfLeaveDateFilter ?? '(undef)',
    rowCount: document.querySelectorAll('.mf-gm-row').length,
    rowsWithDueAttr: document.querySelectorAll('.mf-gm-row[data-mf-due]').length,
    firstRowDue: document.querySelector('.mf-gm-row')?.getAttribute('data-mf-due'),
    firstRowRecv: document.querySelector('.mf-gm-row')?.getAttribute('data-mf-recv'),
  }));
  console.log('=== script state ===');
  console.log(JSON.stringify(scriptState, null, 2));

  // 3. Click "Ends this week" → check rows hidden
  const before = await page.evaluate(() => Array.from(document.querySelectorAll('.mf-gm-row')).filter(r => r.offsetParent).length);
  console.log('visible rows before click =', before);
  const dueWeek = page.locator('[data-mf-date="due-week"]').first();
  if (await dueWeek.count() === 0) { console.log('!! due-week nav NOT in DOM'); }
  else {
    await dueWeek.click({ timeout: 5000 });
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => {
      const all = document.querySelectorAll('.mf-gm-row');
      const visible = Array.from(all).filter(r => r.offsetParent);
      return {
        total: all.length,
        visible: visible.length,
        sampleVisible: visible.slice(0,3).map(r => ({
          due: r.getAttribute('data-mf-due'),
          inlineStyle: r.style.display,
          who: r.querySelector('.sender')?.innerText
        })),
        sampleHidden: Array.from(all).filter(r => !r.offsetParent).slice(0,3).map(r => ({
          due: r.getAttribute('data-mf-due'),
          inlineStyle: r.style.display,
          who: r.querySelector('.sender')?.innerText
        })),
        activeDate: document.querySelector('[data-mf-date].active')?.getAttribute('data-mf-date'),
      };
    });
    console.log('=== after due-week click ===');
    console.log(JSON.stringify(after, null, 2));
    await page.screenshot({ path: 'qa-out/sidebar-diag-after-week.png', fullPage: false });
  }

  // 4. Click "Annual leave" → check filter
  await page.waitForTimeout(500);
  const annual = page.locator('[data-mf-filter="Annual"]').first();
  if (await annual.count() > 0) {
    await annual.click();
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => {
      const visible = Array.from(document.querySelectorAll('.mf-gm-row')).filter(r => r.offsetParent);
      return {
        visible: visible.length,
        searchInput: document.querySelector('.mflv-search-input')?.value,
        sample: visible.slice(0,3).map(r => r.querySelector('.pill')?.innerText)
      };
    });
    console.log('=== after Annual click ===');
    console.log(JSON.stringify(after, null, 2));
    await page.screenshot({ path: 'qa-out/sidebar-diag-after-annual.png', fullPage: false });
  }

  if (errors.length) {
    console.log('=== console errors / pageerrors ===');
    errors.forEach(e => console.log(e));
  } else {
    console.log('(no console errors)');
  }

  await browser.close();
})();
