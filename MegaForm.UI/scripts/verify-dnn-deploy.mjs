// Verify MegaForm deployment on dnn10322_megaf.ai/xx
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE   = 'http://dnn10322_megaf.ai';
const PAGE   = '/xx';
const USER   = 'host';
const PASS   = 'dnnhost';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT    = join(process.cwd(), 'monitor', 'out', 'deploy-verify');
mkdirSync(OUT, { recursive: true });

async function dnnLogin(page) {
  await page.goto(`${BASE}/Login?ReturnUrl=${encodeURIComponent(PAGE)}`, { waitUntil: 'networkidle', timeout: 60000 });
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
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleEvents.push({ type: m.type(), text: m.text().slice(0,400) }); });
  page.on('pageerror', e => consoleEvents.push({ type: 'pageerror', text: String(e).slice(0,400) }));
  page.on('requestfailed', r => consoleEvents.push({ type: 'reqfail', text: `${r.method()} ${r.url().slice(0,200)} -> ${r.failure()?.errorText||'?'}` }));

  console.log('[1] Login...');
  await dnnLogin(page);
  console.log('[1] Logged in. URL:', page.url());

  const stops = [
    { label: 'dashboard', url: `${BASE}${PAGE}#mf-dashboard`, wait: '#mf-dashboard-root, .mf-dashboard, [id^="mf-"]' },
    { label: 'builder', url: `${BASE}${PAGE}#mf-builder`, wait: '#mf-builder-root, .mf-builder' },
    { label: 'submissions', url: `${BASE}${PAGE}#mf-submissions`, wait: '.mf-submissions, #mf-submissions-root, [id^="mf-submissions"]' },
    { label: 'blog-home', url: `${BASE}${PAGE}?vk=blog-home`, wait: 'body' },
    { label: 'blog-detail', url: `${BASE}${PAGE}?vk=blog-detail`, wait: 'body' },
    { label: 'blog-admin-dashboard', url: `${BASE}${PAGE}?vk=blog-admin-dashboard`, wait: 'body' },
    { label: 'form-1264-posts', url: `${BASE}${PAGE}?formId=1264`, wait: 'body' },
  ];

  for (const stop of stops) {
    const before = consoleEvents.length;
    console.log(`[→] ${stop.label} ...`);
    await page.goto(stop.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const diag = await page.evaluate(() => {
      const txt = (document.body.innerText || '').slice(0, 1000);
      return {
        title: document.title,
        url: location.href,
        hasFormMount: !!document.querySelector('[id^="mf-form-"]'),
        hasListView: !!document.querySelector('[data-mf-listview="1"]'),
        hasDashboard: !!document.querySelector('#mf-dashboard-root'),
        hasBuilder: !!document.querySelector('#mf-builder-root'),
        hasTaskInbox: !!document.querySelector('.mf-dnn-task-layout, #mf-my-task-list'),
        hasMfPlatform: !!window.__MF_PLATFORM__,
        platform: window.__MF_PLATFORM__?.platform || 'none',
        apiBase: window.__MF_PLATFORM__?.apiBase || 'none',
        moduleId: window.__MF_PLATFORM__?.moduleId || 'none',
        formId: window.__MF_PLATFORM__?.formId || 'none',
        loadingForm: /Loading form/.test(txt),
        notPublished: /not published yet/i.test(txt),
        noModule: /No form configured/i.test(txt),
        bodyPreview: txt.slice(0, 200),
      };
    });

    const png = join(OUT, `${stop.label}.png`);
    await page.screenshot({ path: png, fullPage: true });

    const errs = consoleEvents.slice(before).filter(e => e.type === 'pageerror' || e.type === 'reqfail');
    const ok = diag.hasMfPlatform && !diag.loadingForm && !diag.notPublished && !diag.noModule;
    console.log(`[${ok?'✓':'✗'}] ${stop.label.padEnd(25)} platform=${diag.platform} moduleId=${diag.moduleId} formId=${diag.formId} errors=${errs.length}`);
    if (!ok) {
      console.log(`    loadingForm=${diag.loadingForm} notPublished=${diag.notPublished} noModule=${diag.noModule}`);
      console.log(`    body: ${diag.bodyPreview.slice(0,120)}`);
    }
  }

  // Check if Blog starter is seeded by looking for formIds
  console.log('\n[→] Checking Blog starter seed status via API...');
  const platformState = await page.evaluate(() => {
    const p = window.__MF_PLATFORM__ || {};
    return { platform: p.platform, apiBase: p.apiBase, moduleId: p.moduleId, tabId: p.tabId, portalId: p.portalId };
  });
  console.log('Platform:', JSON.stringify(platformState));

  // Try to list forms via API
  if (platformState.apiBase) {
    try {
      const formsResp = await page.evaluate(async (apiBase) => {
        const r = await fetch(`${apiBase}/Form/List?pageSize=50`, { credentials: 'same-origin' });
        return { status: r.status, text: await r.text() };
      }, platformState.apiBase);
      console.log('Forms API status:', formsResp.status);
      // Parse to find Blog forms
      try {
        const formsData = JSON.parse(formsResp.text);
        const blogForms = (formsData.items || formsData.Items || []).filter(f => {
          const title = (f.title || f.Title || '').toLowerCase();
          return title.includes('blog') || title.includes('post') || title.includes('comment') || title.includes('reader');
        });
        console.log('Blog-related forms:', blogForms.map(f => ({ id: f.formId || f.FormId, title: f.title || f.Title })));
      } catch (e) {
        console.log('Could not parse forms response');
      }
    } catch (e) {
      console.log('Forms API error:', e.message);
    }
  }

  await browser.close();
  console.log(`\n[Screenshots] ${OUT}`);
})();
