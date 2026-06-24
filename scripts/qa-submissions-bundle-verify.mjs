#!/usr/bin/env node
// ============================================================
// QA Script: Verify Submissions Shell Bundle Load
// Chụp screenshot + network log để xác định inbox cũ có còn
// được load không, và bundle mới có mount đúng không.
// ============================================================

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = process.env.MF_BASE || 'http://localhost:5005';
const OUT_DIR = process.env.MF_QA_OUT || path.join(process.cwd(), 'tmp-qa');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT_PATH = path.join(OUT_DIR, `submissions-verify-${TIMESTAMP}.json`);
const SCREENSHOT_PATH = path.join(OUT_DIR, `submissions-verify-${TIMESTAMP}.png`);

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ bypassCache: true });
  const page = await context.newPage();

  const networkLog = [];
  const consoleLog = [];

  page.on('request', req => {
    const url = req.url();
    if (url.includes('.js') || url.includes('.css')) {
      networkLog.push({ phase: 'request', url, resourceType: req.resourceType() });
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('.js') || url.includes('.css')) {
      networkLog.push({
        phase: 'response',
        url,
        status: res.status(),
        resourceType: res.request().resourceType(),
        contentType: res.headers()['content-type'] || '',
      });
    }
  });

  page.on('console', msg => {
    consoleLog.push({ type: msg.type(), text: msg.text(), location: msg.location()?.url });
  });

  page.on('pageerror', err => {
    consoleLog.push({ type: 'pageerror', text: err.message });
  });

  console.log(`[QA] Navigating to ${BASE}/?mfpanel=submissions ...`);
  await page.goto(`${BASE}/?mfpanel=submissions`, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait cho lazy scripts và mount
  await page.waitForTimeout(2500);

  // Evaluate DOM + window state
  const domState = await page.evaluate(() => {
    const root = document.getElementById('mf-submissions-root');
    const inboxRoot = document.querySelector('[data-mf-submission-inbox="1"]');
    return {
      rootExists: !!root,
      inboxRootExists: !!inboxRoot,
      rootDataset: root ? {
        shellMode: root.dataset.shellMode,
        submissionInbox: root.dataset.mfSubmissionInbox,
        platform: root.dataset.platform,
      } : null,
      hasInitSubmissions: typeof window.MegaForm?.initSubmissions === 'function',
      hasInitInbox: typeof window.MegaForm?.initSubmissionInbox === 'function',
      scripts: Array.from(document.querySelectorAll('script[src]')).map(s => s.src),
      styles: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(s => s.href),
      bodyClass: document.body.className,
      bodyInnerTextLength: document.body.innerText.length,
    };
  });

  // Check visual indicators
  const hasStatsBar = await page.locator('.mf-stats-bar').count() > 0;
  const hasSheet = await page.locator('.mf-detail-sheet').count() > 0;
  const hasInboxList = await page.locator('.mf-inbox-list, .mf-submission-inbox-root').count() > 0;
  const hasGmailToolbar = await page.locator('.mf-inbox-toolbar, [data-inbox-toolbar]').count() > 0;

  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

  const inboxRequests = networkLog.filter(x => x.url.includes('submission-inbox'));
  const submissionsRequests = networkLog.filter(x => x.url.includes('megaform-submissions.js'));
  const submissionsCssRequests = networkLog.filter(x => x.url.includes('megaform-submissions-ts.css'));

  const report = {
    timestamp: TIMESTAMP,
    url: `${BASE}/?mfpanel=submissions`,
    domState,
    visual: { hasStatsBar, hasSheet, hasInboxList, hasGmailToolbar },
    network: { inboxRequests, submissionsRequests, submissionsCssRequests, totalNetwork: networkLog.length },
    console: consoleLog,
    screenshot: SCREENSHOT_PATH,
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log('\n========== QA REPORT ==========');
  console.log('Screenshot :', SCREENSHOT_PATH);
  console.log('JSON report:', REPORT_PATH);
  console.log('\n--- DOM State ---');
  console.log(JSON.stringify(domState, null, 2));
  console.log('\n--- Visual Checks ---');
  console.log('hasStatsBar    :', hasStatsBar);
  console.log('hasSheet       :', hasSheet);
  console.log('hasInboxList   :', hasInboxList, '(should be FALSE)');
  console.log('hasGmailToolbar:', hasGmailToolbar, '(should be FALSE)');
  console.log('\n--- Network (JS/CSS) ---');
  console.log('inbox requests     :', inboxRequests.length, '(should be 0)');
  inboxRequests.forEach(x => console.log('  ❌', x.url));
  console.log('submissions.js     :', submissionsRequests.length, '(should be >= 1)');
  submissionsRequests.forEach(x => console.log('  ✅', x.url, x.status));
  console.log('submissions-ts.css :', submissionsCssRequests.length, '(should be >= 1)');
  submissionsCssRequests.forEach(x => console.log('  ✅', x.url, x.status));
  console.log('\n--- Console Errors ---');
  const errors = consoleLog.filter(c => c.type === 'error' || c.type === 'pageerror');
  console.log('Errors:', errors.length);
  errors.forEach(e => console.log('  ⚠️', e.text));

  await browser.close();

  // Exit code
  let fail = false;
  if (inboxRequests.length > 0) { console.log('\n❌ FAIL: inbox bundle vẫn được load'); fail = true; }
  if (submissionsRequests.length === 0) { console.log('\n❌ FAIL: megaform-submissions.js không được load'); fail = true; }
  if (submissionsCssRequests.length === 0) { console.log('\n❌ FAIL: megaform-submissions-ts.css không được load'); fail = true; }
  if (!domState.hasInitSubmissions) { console.log('\n❌ FAIL: window.MegaForm.initSubmissions không tồn tại'); fail = true; }
  if (hasInboxList || hasGmailToolbar) { console.log('\n❌ FAIL: Gmail-style inbox DOM vẫn hiển thị'); fail = true; }

  if (fail) {
    console.log('\n👉 Gợi ý fix:');
    console.log('   1. Hard refresh browser (Ctrl+F5)');
    console.log('   2. Restart Oqtane dev server (dotnet watch run)');
    console.log('   3. Xóa browser cache hoặc mở Incognito');
    process.exit(1);
  }

  console.log('\n✅ PASS: Tất cả checks đều đúng.');
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
