// Quick visual inspection of Blog on DNN site
// Screenshots saved to monitor/out/blog-inspect/

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE   = 'http://dnn10322_megaf.ai';
const USER   = 'host';
const PASS   = 'dnnhost';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT    = join(process.cwd(), 'monitor', 'out', 'blog-inspect');
mkdirSync(OUT, { recursive: true });

async function dnnLogin(page) {
  await page.goto(`${BASE}/Login?ReturnUrl=/`, { waitUntil: 'networkidle', timeout: 60000 });
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
  page.setDefaultTimeout(45000);

  const consoleEvents = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleEvents.push({ type: m.type(), text: m.text().slice(0, 400) }); });
  page.on('pageerror', e => consoleEvents.push({ type: 'pageerror', text: String(e).slice(0, 400) }));
  page.on('requestfailed', r => consoleEvents.push({ type: 'reqfail', text: `${r.method()} ${r.url().slice(0, 200)} -> ${r.failure()?.errorText || '?'}` }));

  const results = [];
  const tag = new Date().toISOString().replace(/[:.]/g, '-');

  // ── Helper ──
  async function inspect(label, url, extraAction) {
    const before = consoleEvents.length;
    console.log(`[→] ${label} ...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    if (extraAction) await extraAction();

    const diag = await page.evaluate(() => {
      const txt = (document.body.innerText || '').slice(0, 800);
      return {
        title: document.title,
        hasFormMount: !!document.querySelector('[id^="mf-form-"]'),
        hasListView: !!document.querySelector('[data-mf-listview="1"]'),
        hasDashboard: !!document.querySelector('#mf-dashboard-root'),
        hasBuilder: !!document.querySelector('#mf-builder-root'),
        hasWorkflowInbox: !!document.querySelector('.mf-dnn-task-layout, #mf-my-task-list'),
        hasMfPlatform: !!window.__MF_PLATFORM__,
        loadingForm: /Loading form/.test(txt),
        notPublished: /not published yet/i.test(txt),
        noModule: /No form configured/i.test(txt),
        bodyPreview: txt.slice(0, 300),
      };
    });

    const png = join(OUT, `${label}-${tag}.png`);
    await page.screenshot({ path: png, fullPage: true });

    const evts = consoleEvents.slice(before);
    results.push({ label, url, diag, png, consoleEvents: evts });
    const ok = !diag.loadingForm && !diag.notPublished && !diag.noModule && evts.filter(e => e.type === 'pageerror' || e.type === 'reqfail').length === 0;
    console.log(`[${ok ? '✓' : '✗'}] ${label.padEnd(30)} title="${diag.title}" mounts=${Object.entries(diag).filter(([k,v]) => v===true).map(([k])=>k).join(',') || 'none'} errors=${evts.length}`);
    return diag;
  }

  // ── 1. Anonymous homepage ──
  await inspect('01-homepage', `${BASE}/`);

  // ── 2. Login ──
  console.log('[→] logging in as host ...');
  await dnnLogin(page);
  console.log('[✓] logged in');

  // ── 3. Admin Dashboard ──
  await inspect('02-admin-dashboard', `${BASE}/#mf-dashboard`);

  // ── 4. Blog Home (public view) ──
  await inspect('03-blog-home', `${BASE}/?vk=blog-home`);

  // ── 5. Blog Detail ──
  await inspect('04-blog-detail', `${BASE}/?vk=blog-detail`);

  // ── 6. Blog Admin Dashboard ──
  await inspect('05-blog-admin-dashboard', `${BASE}/?vk=blog-admin-dashboard`);

  // ── 7. Blog Recent ──
  await inspect('06-blog-recent', `${BASE}/?vk=blog-recent`);

  // ── 8. Form 1264 (Posts) renderer ──
  await inspect('07-form-1264-posts', `${BASE}/?formId=1264`);

  // ── 9. Form 1266 (Comments) renderer ──
  await inspect('08-form-1266-comments', `${BASE}/?formId=1266`);

  // ── 10. Submissions for Posts ──
  await inspect('09-submissions-posts', `${BASE}/#mf-submissions`);

  // ── Summary ──
  const summary = {
    tag,
    baseUrl: BASE,
    results: results.map(r => ({
      label: r.label,
      url: r.url,
      title: r.diag.title,
      ok: !r.diag.loadingForm && !r.diag.notPublished && !r.diag.noModule,
      mounts: Object.entries(r.diag).filter(([k,v]) => v===true && k.startsWith('has')).map(([k])=>k),
      errors: r.consoleEvents.filter(e => e.type === 'pageerror' || e.type === 'reqfail').map(e => e.text),
      screenshot: r.png,
    }))
  };

  writeFileSync(join(OUT, `summary-${tag}.json`), JSON.stringify(summary, null, 2));
  await browser.close();

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  Inspection complete`);
  console.log(`  Screenshots: ${OUT}`);
  console.log(`  Summary:     ${join(OUT, `summary-${tag}.json`)}`);
  console.log(`═══════════════════════════════════════`);
})();
