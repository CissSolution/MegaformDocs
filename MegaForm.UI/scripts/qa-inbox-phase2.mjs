// Phase-2 visual QA: verify the Gmail chrome regions render correctly
// (topbar + sidebar with sections + toolbar + list shell + right rail).
// No data load yet — that's Phase 3.

import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5050';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text().slice(0, 200)}`); });
  page.on('pageerror', e => errors.push(`[pageerror] ${String(e).slice(0, 200)}`));

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.setContent(`<!doctype html>
<html><head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="${BASE}/Modules/MegaForm/css/megaform-submission-inbox.css" />
</head><body style="margin:0; background:#eef2f7;">
  <div id="host" data-mf-submission-inbox="1"></div>
  <script src="${BASE}/Modules/MegaForm/js/megaform-submission-inbox.js"></script>
</body></html>`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  const diag = await page.evaluate(() => {
    const has = (sel) => !!document.querySelector(sel);
    const count = (sel) => document.querySelectorAll(sel).length;
    const text = (sel) => (document.querySelector(sel)?.innerText || '').trim().slice(0, 100);
    return {
      runtimeBadge: window.__MF_SUBMISSION_INBOX_RUNTIME_BADGE__,
      mountClass: document.querySelector('#host')?.className,
      regions: {
        topbar:    has('.mf-sx-top'),
        brand:     text('.mf-sx-brand'),
        searchBox: has('.mf-sx-search-input'),
        sidebar:   has('.mf-sx-side'),
        composeBtn:has('.mf-sx-compose'),
        main:      has('.mf-sx-main'),
        toolbar:   has('.mf-sx-tools'),
        list:      has('.mf-sx-list'),
        rail:      has('.mf-sx-rail'),
      },
      sidebar: {
        groups:   count('.mf-sx-grp'),
        groupTexts: Array.from(document.querySelectorAll('.mf-sx-grp')).map(g => g.innerText),
        navItems: count('.mf-sx-nav'),
        calendarItems: count('.mf-sx-nav[data-mf-date]'),
        statusItems:   count('.mf-sx-nav[data-mf-filter]'),
        activeNav: text('.mf-sx-nav.is-active'),
      },
      emptyState: {
        present: has('.mf-sx-empty'),
        title:   text('.mf-sx-empty-title'),
      },
      computed: {
        rootWidth:  Math.round(document.querySelector('#host')?.getBoundingClientRect().width || 0),
        rootHeight: Math.round(document.querySelector('#host')?.getBoundingClientRect().height || 0),
        sideWidth:  Math.round(document.querySelector('.mf-sx-side')?.getBoundingClientRect().width || 0),
        railWidth:  Math.round(document.querySelector('.mf-sx-rail')?.getBoundingClientRect().width || 0),
      },
    };
  });
  console.log(JSON.stringify(diag, null, 2));
  await page.screenshot({ path: 'qa-out/inbox-phase2.png', fullPage: false });
  console.log(errors.length ? '\n--- ERRORS ---\n' + errors.join('\n') : '(0 errors)');
  await browser.close();
})();
