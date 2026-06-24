// Block 6 QA — WinForm-style shell.
//   1) Login as host
//   2) Visit Submissions inbox
//   3) Verify ribbon, status bar, F-key bar rendered
//   4) Toggle layout → master-detail
//   5) Click a row → detail panel renders
//   6) Press F5 → list refreshes (calls 'refresh' action)
//   7) Press Esc → detail panel closes
//   8) Screenshot before + after

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

// Login
await page.goto(`${BASE}/Login?returnurl=/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
try {
  await page.waitForSelector('input[name*="Username"], input[id*="Username"]', { timeout: 6000 });
  await page.locator('input[name*="Username"], input[id*="Username"]').first().fill('host');
  await page.locator('input[name*="Password"], input[id*="Password"]').first().fill('dnnhost');
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }),
    page.locator('input[type="submit"][value*="Login"], a[id*="cmdLogin"], button[id*="cmdLogin"]').first().click(),
  ]);
} catch (e) { console.warn('login form differed:', e?.message); }

// Visit the Submissions inbox
await page.goto(`${BASE}/xx#mf-submissions`, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3500);

// SHELL inspection
const shell = await page.evaluate(() => {
  const detailHost = document.querySelector('[data-mf-detail-host]');
  return {
    hasRibbon: !!document.querySelector('[data-mf-ribbon]'),
    ribbonButtons: Array.from(document.querySelectorAll('[data-mf-ribbon-act]')).map(b => b.getAttribute('data-mf-ribbon-act')),
    hasStatusbar: !!document.querySelector('[data-mf-statusbar]'),
    statusRecords: document.querySelector('.mf-sx-status-records')?.textContent || null,
    statusUser:    document.querySelector('[data-mf-status-user]')?.textContent  || null,
    hasFkeys: !!document.querySelector('[data-mf-fkeys]'),
    fkeyCount: document.querySelectorAll('.mf-sx-fkey').length,
    hasWorkSplit: !!document.querySelector('[data-mf-work]'),
    detailHostExists: !!detailHost,
    detailHidden: detailHost ? getComputedStyle(detailHost).display : 'no-host',
    inboxBadge: document.querySelector('[data-mf-submission-inbox-badge]')?.getAttribute('data-mf-submission-inbox-badge') || null,
  };
});

await page.screenshot({ path: join(OUT, 'b6-01-list-only.png'), fullPage: true });

// Click "Layout" ribbon button to switch to master-detail
const ribbonCount = await page.locator('[data-mf-ribbon-act="layout-toggle"]').count();
console.log('layout-toggle count:', ribbonCount);
// Click via direct JS invocation (bypasses Playwright visibility check) so we can verify the wiring.
await page.evaluate(() => {
  const btn = document.querySelector('[data-mf-ribbon-act="layout-toggle"]');
  if (btn) btn.click();
});
await page.waitForTimeout(400);
const afterToggle = await page.evaluate(() => {
  const detailHost = document.querySelector('[data-mf-detail-host]');
  return {
    workLayout: document.querySelector('[data-mf-work]')?.getAttribute('data-mf-layout') || null,
    layoutBtnState: document.querySelector('[data-mf-ribbon-act="layout-toggle"]')?.getAttribute('data-mf-layout') || null,
    layoutBtnLabel: document.querySelector('[data-mf-ribbon-act="layout-toggle"] .mf-sx-ribbon-lbl')?.textContent || null,
    detailDisplay: detailHost ? getComputedStyle(detailHost).display : 'no-host',
  };
});

await page.screenshot({ path: join(OUT, 'b6-02-master-detail.png'), fullPage: true });

// Click a submission row (data-mf-submission-id) — should render inline detail
const sidRows = await page.locator('[data-mf-submission-id]').count();
let detailRenderResult = { triedClick: false };
if (sidRows > 0) {
  detailRenderResult.triedClick = true;
  await page.evaluate(() => {
    const row = document.querySelector('[data-mf-submission-id]');
    if (row) row.click();
  });
  await page.waitForTimeout(1200);
  detailRenderResult.detailIframe = !!(await page.locator('[data-mf-detail-iframe]').count());
  detailRenderResult.detailHeadText = await page.locator('.mf-sx-detail-head strong').first().textContent().catch(() => '');
}
await page.screenshot({ path: join(OUT, 'b6-03-detail-open.png'), fullPage: true });

// F5 → refresh action
let f5Fired = false;
await page.evaluate(() => { (window).__mfF5Fired = false; });
const refreshBtn = page.locator('[data-mf-act="refresh"]').first();
await refreshBtn.evaluate(el => el.addEventListener('click', () => { (window).__mfF5Fired = true; }, { once: true }));
await page.keyboard.press('F5');
await page.waitForTimeout(400);
f5Fired = await page.evaluate(() => (window).__mfF5Fired);

// Esc → close detail
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const afterEsc = await page.evaluate(() => ({
  detailEmpty: !!document.querySelector('.mf-sx-detail-empty'),
  iframeStillThere: !!document.querySelector('[data-mf-detail-iframe]'),
}));

// Toggle layout back via JS
await page.evaluate(() => {
  const btn = document.querySelector('[data-mf-ribbon-act="layout-toggle"]');
  if (btn) btn.click();
});
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, 'b6-04-list-only-again.png'), fullPage: true });

const report = {
  shell,
  afterToggle,
  detailRenderResult,
  f5Fired,
  afterEsc,
  consoleErrors: errs
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'b6-winform-report.json'), JSON.stringify(report, null, 2));
await browser.close();
