// Scroll-aware Visual QA for MegaForm board views on local Oqtane.
// - Launches Chrome via playwright-core (uses system Chrome — no extra browser download).
// - Logs in as host on the local Oqtane site.
// - Visits the 3 board URLs the user is verifying.
// - Waits for the listview mount to hydrate, then SCROLLS through the page
//   capturing one full-page screenshot per view + DOM signature checks that
//   prove the Outlook/SharePoint wrapper + row templates are actually rendered.
//
// Output: ./qa-out/*.png + console JSON summary

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE   = 'http://localhost:5050';
const USER   = 'host';
const PASS   = 'host';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// Each ?vk= only resolves on the page that hosts the module whose configured
// FormId owns that view. Module 190 (form 10 = Leave) lives at /business;
// Module 154 (form 7 = Document Exchange) lives at the Site 1 root /;
// Module 159 (form 6 = Proposal) lives at /home; Module 193 (form 13 = Proposal)
// lives at the chronicle alias /sitename.
const VIEWS = [
  { key: 'leave-request-board',     url: `${BASE}/business?vk=leave-request-board`,    sig: 'mf-ol-rail',     badge: /LeaveOutlookInbox v20260516-10/ },
  { key: 'document-routing-board',  url: `${BASE}/?vk=document-routing-board`,         sig: 'mf-ol-rail',     badge: /DocumentCardOutlook v20260516-10/ },
  { key: 'proposal-review-board',   url: `${BASE}/home?vk=proposal-review-board`,      sig: 'mf-sp-site',     badge: /ProposalSharePointSite v20260516-10/ },
];

const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

async function loginIfNeeded(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Try Oqtane host login form.
  const userInput = await page.locator('input[name="Username"], input#Username, input[type=text]').first();
  if (await userInput.count()) {
    try { await userInput.fill(USER, { timeout: 5000 }); } catch {}
    const passInput = await page.locator('input[name="Password"], input#Password, input[type=password]').first();
    try { await passInput.fill(PASS, { timeout: 5000 }); } catch {}
    const loginBtn = await page.locator('button:has-text("Login"), button[type=submit], input[type=submit]').first();
    try { await loginBtn.click({ timeout: 5000 }); } catch {}
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(()=>{});
  }
}

async function autoScrollAndShoot(page, outPath) {
  // Scroll the whole document so any lazy-render pieces fire, then take a full-page screenshot.
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

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);

  const results = [];

  await loginIfNeeded(page);

  for (const v of VIEWS) {
    const r = { key: v.key, url: v.url };
    try {
      await page.goto(v.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      // Wait for Blazor hydration + listview mount.
      await page.waitForFunction(() => {
        const mount = document.querySelector('[data-mf-listview="1"], .mf-listview');
        if (!mount) return false;
        // Either rows rendered or wrapper template attribute populated.
        const hasRows = mount.querySelectorAll('.item, [data-mf-row]').length > 0;
        const wrapperAttr = (mount.getAttribute('data-mf-wrapper-template') || '').length > 0;
        const hasOutlook = document.querySelector('.mf-ol-rail, .mf-sp-site') !== null;
        return hasRows || wrapperAttr || hasOutlook;
      }, null, { timeout: 30000 }).catch(()=>{});
      // Give late paints a moment.
      await page.waitForTimeout(1200);

      const png = join(OUT, `${v.key}.png`);
      await autoScrollAndShoot(page, png);

      const diag = await page.evaluate(() => {
        const mount = document.querySelector('[data-mf-listview="1"], .mf-listview');
        const wrapperAttr = mount?.getAttribute('data-mf-wrapper-template') || '';
        const html = document.body.innerHTML;
        const findBadge = (re) => { const m = html.match(re); return m ? m[0] : null; };
        // Pull the dataset for the mount to see what form / view is loaded.
        const ds = mount ? { ...mount.dataset } : {};
        // Inspect the runtime badge written by listview/runtime.ts.
        const shell = document.querySelector('[data-mf-listview-badge]');
        const runtimeBadge = shell ? shell.getAttribute('data-mf-listview-badge') : null;
        return {
          mountFound: !!mount,
          wrapperAttrLen: wrapperAttr.length,
          wrapperHead: wrapperAttr.slice(0, 160),
          rowsRendered: mount ? mount.querySelectorAll('.item, [data-mf-row]').length : 0,
          hasOutlookRail: !!document.querySelector('.mf-ol-rail'),
          hasSharepointSite: !!document.querySelector('.mf-sp-site'),
          hasWrapperEmpty: !!document.querySelector('.mflv-wrapper-empty'),
          hasDefaultTable: !!document.querySelector('table.mf-grid, table.mf-listview-table'),
          badges: {
            leave:    findBadge(/LeaveOutlookInbox v20260516-10/),
            document: findBadge(/DocumentCardOutlook v20260516-10/),
            proposal: findBadge(/ProposalSharePointSite v20260516-10/),
            po:       findBadge(/PurchaseOrderSharePoint v20260516-10/),
          },
          mountDataset: ds,
          runtimeBadge,
          activeViewKeyChip: (document.querySelector('.mf-dnn-task-chip') || {}).textContent || null,
          docTitle: document.title,
        };
      });

      r.ok = true;
      r.shot = png;
      r.diag = diag;
    } catch (err) {
      r.ok = false;
      r.error = String(err);
    }
    results.push(r);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(r, null, 2));
  }

  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(results, null, 2));
  await browser.close();
})();
