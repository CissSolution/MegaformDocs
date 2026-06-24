// End-to-end browser-driven QA tour for MegaForm on local Oqtane.
// Logs in as host, walks through every MegaForm surface a user would touch,
// captures full-page screenshot + browser console errors per stop, and emits
// a JSON summary so we can spot broken pages without manual clicking.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE   = 'http://localhost:5050';
const USER   = 'host';
const PASS   = 'abc@ABC1024';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT    = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

function nowTag() { return new Date().toISOString().replace(/[:.]/g, '-'); }

async function runDateFilterTest(page, log, label) {
  await page.waitForSelector('.mf-gm-row', { timeout: 15000 }).catch(()=>{});
  const baseline = await page.evaluate(() => {
    const rows = document.querySelectorAll('.mf-gm-row');
    return { total: rows.length, visible: Array.from(rows).filter(r => r.offsetParent !== null).length };
  });
  log.push(`${label} baseline total=${baseline.total} visible=${baseline.visible}`);
  for (const key of ['overdue','due-today','due-week','recv-today']) {
    const nav = page.locator(`[data-mf-date="${key}"]`).first();
    if (await nav.count() === 0) { log.push(`${label} ${key}: nav missing`); continue; }
    await nav.click();
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => {
      const rows = document.querySelectorAll('.mf-gm-row');
      const visible = Array.from(rows).filter(r => r.offsetParent !== null);
      return {
        total: rows.length,
        visible: visible.length,
        sample: visible.slice(0,1).map(r => ({
          due: r.getAttribute('data-mf-due'),
          recv: r.getAttribute('data-mf-recv'),
          who: r.querySelector('.sender')?.innerText || ''
        }))
      };
    });
    log.push(`${label} ${key}: ${after.visible}/${after.total} sample=${JSON.stringify(after.sample)}`);
    await page.screenshot({ path: `qa-out/tour-${label}-${key}.png`, fullPage: false });
  }
  // Clear filter for next test
  const allNav = page.locator('[data-mf-date].active').first();
  if (await allNav.count() > 0) await allNav.click();
}

async function loginAsHost(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#username', { timeout: 15000 });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  // The login button has class "btn btn-primary" and text "Login"
  await page.locator('button.btn-primary:has-text("Login")').first().click();
  // Wait for redirect away from /login
  await page.waitForFunction(() => !location.pathname.toLowerCase().includes('/login'), null, { timeout: 20000 }).catch(()=>{});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(()=>{});
  await page.waitForTimeout(1500);
  const loggedIn = await page.evaluate(() => {
    const txt = document.body.innerText || '';
    // Oqtane shows a logout link / host menu for signed-in users
    return /logout|signed in|host/i.test(txt) && !document.querySelector('#username');
  });
  return loggedIn;
}

async function scrollAndShoot(page, outPath) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let y = 0;
      const step = 400;
      const tick = () => {
        window.scrollTo(0, y);
        y += step;
        if (y < document.documentElement.scrollHeight + window.innerHeight) {
          setTimeout(tick, 120);
        } else {
          window.scrollTo(0, 0);
          setTimeout(resolve, 300);
        }
      };
      tick();
    });
  });
  await page.screenshot({ path: outPath, fullPage: true });
}

// Each stop: navigate, optionally do extra actions, capture diagnostics.
const STOPS = [
  { key: '01-home-root',         url: `${BASE}/`,                            waitFor: 'body' },
  { key: '02-home-business',     url: `${BASE}/business`,                    waitFor: 'body' },
  { key: '03-home-home',         url: `${BASE}/home`,                        waitFor: 'body' },
  { key: '04-leave-board-vk',    url: `${BASE}/business?vk=leave-request-board`, waitFor: '[data-mf-listview="1"], .mf-gm' },
  { key: '05-mfpanel-inbox',     url: `${BASE}/?mfpanel=inbox`,              waitFor: 'body' },
  { key: '06-mfpanel-workflowmap', url: `${BASE}/?mfpanel=workflowmap`,      waitFor: 'body' },
  { key: '07-tutoring-root',     url: `${BASE}/`,                            waitFor: '[data-mf-listview="1"], .mflv-shell',
    action: async (page, log) => {
      // Click the first row in the tutoring listview to open the submission detail modal
      const row = await page.locator('.mflv-row, [data-mf-row], tr[data-mf-submission-id]').first();
      if (await row.count() > 0) {
        await row.click({ timeout: 8000 }).catch(()=>{});
        await page.waitForTimeout(2000);
        // Now click the Flow process tab if visible
        const flowTab = page.locator('button:has-text("Flow process"), [data-mf-tab="flow"]').first();
        if (await flowTab.count() > 0) {
          await flowTab.click({ timeout: 5000 }).catch(()=>{});
          await page.waitForTimeout(1500);
          log.push('clicked Flow process tab');
        }
      } else {
        log.push('no clickable row found in tutoring listview');
      }
    }
  },
  { key: '09-click-form-builder', url: `${BASE}/business`, waitFor: 'body',
    action: async (page, log) => {
      // Click "Form Builder" admin link if visible
      const btn = page.locator('a:has-text("Form Builder"), button:has-text("Form Builder")').first();
      if (await btn.count() > 0) {
        await btn.click({ timeout: 8000 }).catch((e)=>log.push('click err: '+e.message));
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(()=>{});
        await page.waitForTimeout(3000);
        log.push('navigated to ' + page.url());
      } else {
        log.push('Form Builder button not found');
      }
    }
  },
  { key: '10-click-form-dashboard', url: `${BASE}/business`, waitFor: 'body',
    action: async (page, log) => {
      const btn = page.locator('a:has-text("Form Dashboard"), button:has-text("Form Dashboard")').first();
      if (await btn.count() > 0) {
        await btn.click({ timeout: 8000 }).catch((e)=>log.push('click err: '+e.message));
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(()=>{});
        await page.waitForTimeout(3000);
        log.push('navigated to ' + page.url());
      } else {
        log.push('Form Dashboard button not found');
      }
    }
  },
  { key: '11-sidebar-filter-leave', url: `${BASE}/business?vk=leave-request-board`, waitFor: '.mf-gm',
    action: async (page, log) => {
      // Wait for rows to be present and capture initial count + first row text
      await page.waitForSelector('.mf-gm-row', { timeout: 10000 }).catch(()=>{});
      const before = await page.evaluate(() => {
        const rows = document.querySelectorAll('.mf-gm-row');
        const first = rows[0]?.innerText || '';
        return { count: rows.length, firstRowSample: first.replace(/\s+/g, ' ').slice(0, 140) };
      });
      log.push('before: count=' + before.count + ' first="' + before.firstRowSample + '"');
      // Click the "Annual leave" sidebar nav
      const annual = page.locator('[data-mf-filter="Annual"]').first();
      if (await annual.count() > 0) {
        await annual.click();
        await page.waitForTimeout(1500);
        const after = await page.evaluate(() => {
          const rows = document.querySelectorAll('.mf-gm-row');
          const isActive = document.querySelector('[data-mf-filter="Annual"]')?.classList.contains('active');
          return { count: rows.length, active: !!isActive };
        });
        log.push('after Annual click: count=' + after.count + ' active=' + after.active);
      }
      // Restore All
      const all = page.locator('[data-mf-filter=""]').first();
      if (await all.count() > 0) { await all.click(); await page.waitForTimeout(800); }
    }
  },
  { key: '12-sidebar-filter-doc', url: `${BASE}/`, waitFor: '.mf-gm-d',
    action: async (page, log) => {
      await page.waitForSelector('.mf-gm-row', { timeout: 10000 }).catch(()=>{});
      const before = await page.evaluate(() => {
        const rows = document.querySelectorAll('.mf-gm-row');
        return { count: rows.length, firstRow: rows[0]?.innerText.replace(/\s+/g,' ').slice(0,140) || '' };
      });
      log.push('doc before: count=' + before.count + ' first="' + before.firstRow + '"');
      const inc = page.locator('[data-mf-filter="Incoming"]').first();
      if (await inc.count() > 0) {
        await inc.click();
        await page.waitForTimeout(1500);
        const after = await page.evaluate(() => document.querySelectorAll('.mf-gm-row').length);
        log.push('after Incoming click: count=' + after);
      }
    }
  },
  { key: '13-doc-date-filters', url: `${BASE}/`, waitFor: '.mf-gm-d',
    action: async (page, log) => { await runDateFilterTest(page, log, 'doc'); }
  },
  { key: '14-leave-date-filters', url: `${BASE}/business?vk=leave-request-board`, waitFor: '.mf-gm',
    action: async (page, log) => { await runDateFilterTest(page, log, 'leave'); }
  },
  { key: '15-proposal-date-filters', url: `${BASE}/home?vk=proposal-review-board`, waitFor: '.mf-gm-p',
    action: async (page, log) => { await runDateFilterTest(page, log, 'proposal'); }
  },
  { key: '08-leave-row-click', url: `${BASE}/business?vk=leave-request-board`, waitFor: '.mf-gm',
    action: async (page, log) => {
      const row = page.locator('.mf-gm-row[data-mflv-action="view"]').first();
      const cnt = await row.count();
      log.push('mf-gm-row.view count=' + cnt);
      if (cnt > 0) {
        await row.click({ timeout: 8000 }).catch((e)=>log.push('click err: '+e.message));
        await page.waitForTimeout(2500);
        const modalOpen = await page.evaluate(() => !!document.querySelector('.mflv-form-modal, .mf-modal-body'));
        log.push('detail modal opened: ' + modalOpen);
        if (modalOpen) {
          // Try clicking Flow process tab
          const flowTab = page.locator('button:has-text("Flow process"), [data-mf-tab="flow"], button:has-text("Flow")').first();
          if (await flowTab.count() > 0) {
            await flowTab.click({ timeout: 5000 }).catch(()=>{});
            await page.waitForTimeout(2000);
            log.push('clicked Flow tab');
          }
        }
      }
    }
  },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);

  const consoleLog = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleLog.push({ type: msg.type(), text: msg.text().slice(0, 400) });
    }
  });
  page.on('pageerror', (err) => {
    consoleLog.push({ type: 'pageerror', text: String(err).slice(0, 400) });
  });
  page.on('requestfailed', (req) => {
    consoleLog.push({ type: 'reqfail', text: `${req.method()} ${req.url().slice(0, 200)} -> ${req.failure()?.errorText || '?'}` });
  });

  const summary = { loggedIn: false, stops: [] };

  // Step 1: login
  summary.loggedIn = await loginAsHost(page);
  console.log('[login]', summary.loggedIn ? 'OK as host' : 'FAILED (continuing as anon)');

  // Step 2: walk every stop
  for (const stop of STOPS) {
    // Reset console log per stop
    const before = consoleLog.length;
    const actionLog = [];
    const result = { key: stop.key, url: stop.url };
    try {
      await page.goto(stop.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      // Give Blazor a moment to hydrate
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(()=>{});
      if (stop.waitFor) {
        await page.waitForSelector(stop.waitFor, { timeout: 15000 }).catch(()=>{});
      }
      await page.waitForTimeout(1500);
      if (stop.action) {
        try { await stop.action(page, actionLog); }
        catch (e) { actionLog.push('action error: ' + String(e).slice(0,200)); }
      }

      // Capture DOM diagnostics
      const diag = await page.evaluate(() => {
        const text = (document.body.innerText || '').slice(0, 600);
        const mounts = {
          listview:   !!document.querySelector('[data-mf-listview="1"]'),
          gmail:      !!document.querySelector('.mf-gm, .mf-gm-d, .mf-gm-p'),
          dashboard:  !!document.querySelector('#mf-dashboard-root'),
          builder:    !!document.querySelector('#mf-builder-root'),
          taskInbox:  !!document.querySelector('.mf-dnn-task-layout, #mf-my-task-list'),
          workflowMap:!!document.querySelector('[data-mf-workflow-map-badge]'),
          formMount:  !!document.querySelector('[id^="mf-form-"]'),
          loadingForm: /Loading form/.test(document.body.innerText || ''),
          notPublished: /not published yet/.test(document.body.innerText || ''),
          noModule:   /No form configured/.test(document.body.innerText || ''),
        };
        const moduleMenu = !!document.querySelector('[class*="MegaForm" i], [data-module*="MegaForm" i]');
        return { text, mounts, moduleMenu, title: document.title };
      });

      const png = join(OUT, `tour-${stop.key}.png`);
      await scrollAndShoot(page, png);

      result.diag = diag;
      result.screenshot = png;
      result.consoleEvents = consoleLog.slice(before);
      result.actionLog = actionLog;
    } catch (err) {
      result.error = String(err).slice(0, 400);
      result.consoleEvents = consoleLog.slice(before);
    }
    summary.stops.push(result);
    const flag = result.error
      ? '✗'
      : (result.diag?.mounts?.loadingForm
          ? '!'
          : (result.consoleEvents?.some(e => e.type === 'pageerror' || e.type === 'reqfail') ? '?' : '·'));
    console.log(`[${flag}] ${stop.key.padEnd(30)} ${
      result.error ? result.error
      : `mounts=${Object.entries(result.diag?.mounts || {}).filter(([,v])=>v).map(([k])=>k).join(',') || 'none'} events=${result.consoleEvents.length}`
    }`);
  }

  writeFileSync(join(OUT, 'tour-summary.json'), JSON.stringify(summary, null, 2));
  await browser.close();
  console.log('\nDone. Summary at qa-out/tour-summary.json');
})();
