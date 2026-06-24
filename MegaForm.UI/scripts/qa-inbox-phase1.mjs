// Phase-1 visual QA for the new submission-inbox bundle.
// Loads the deployed JS + CSS into a blank page that has a
// data-mf-submission-inbox="1" mount, then verifies the scaffold rendered.

import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5050';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text().slice(0,200)}`); });
  page.on('pageerror', e => errors.push(`[pageerror] ${String(e).slice(0,200)}`));

  // Serve a minimal page from the Oqtane host so the bundle's relative URLs work.
  // page.setContent + base injects from a known origin.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  // Replace body with a test scaffold that loads the bundle.
  await page.setContent(`<!doctype html>
<html><head>
  <meta charset="utf-8" />
  <title>Submission Inbox · Phase 1 QA</title>
  <link rel="stylesheet" href="${BASE}/Modules/MegaForm/css/megaform-submission-inbox.css" />
</head><body style="margin:24px; background:#eef2f7;">
  <h2 style="font-family:Arial">Phase 1 mount target</h2>
  <div id="host" data-mf-submission-inbox="1"></div>
  <script src="${BASE}/Modules/MegaForm/js/megaform-submission-inbox.js"></script>
</body></html>`, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const diag = await page.evaluate(() => {
    const root = document.getElementById('host');
    return {
      apiBadge: window.__MF_SUBMISSION_INBOX_INDEX_BADGE__,
      runtimeBadge: window.__MF_SUBMISSION_INBOX_RUNTIME_BADGE__,
      mountClass: root?.className,
      mountedBadge: root?.getAttribute('data-mf-submission-inbox-badge'),
      hasScaffold: !!root?.querySelector('.mf-sx-scaffold-title'),
      visibleText: (root?.innerText || '').replace(/\s+/g,' ').trim().slice(0,120),
      computedBg: root ? getComputedStyle(root).backgroundColor : null,
      computedRadius: root ? getComputedStyle(root).borderRadius : null,
    };
  });
  console.log(JSON.stringify(diag, null, 2));
  await page.screenshot({ path: 'qa-out/inbox-phase1.png', fullPage: false });
  if (errors.length) {
    console.log('--- ERRORS ---');
    errors.forEach(e => console.log(e));
  } else {
    console.log('(0 errors)');
  }
  await browser.close();
})();
