// Live browser inspection of actual site state
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE   = 'http://dnn10322_megaf.ai';
const PAGE   = '/xx';
const USER   = 'host';
const PASS   = 'dnnhost';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT    = join(process.cwd(), 'monitor', 'out', 'live-inspect');
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
  page.setDefaultTimeout(60000);

  await dnnLogin(page);

  // 1. Read __MF_PLATFORM__ state
  console.log('[1] Reading __MF_PLATFORM__ state...');
  await page.goto(`${BASE}${PAGE}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  const platform = await page.evaluate(() => {
    const p = window.__MF_PLATFORM__ || {};
    return {
      platform: p.platform,
      moduleId: p.moduleId,
      instanceId: p.instanceId,
      tabId: p.tabId,
      portalId: p.portalId,
      formId: p.formId,
      apiBase: p.apiBase,
      dashboardUrl: p.dashboardUrl,
      rendererHostUrl: p.rendererHostUrl,
    };
  });
  console.log('__MF_PLATFORM__:', JSON.stringify(platform, null, 2));
  await page.screenshot({ path: join(OUT, '01-page-xx.png'), fullPage: true });

  // 2. Dashboard — list forms
  console.log('[2] Dashboard form list...');
  await page.goto(`${BASE}${PAGE}#mf-dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4000);
  const forms = await page.evaluate(() => {
    const rows = document.querySelectorAll('.mf-form-row, [data-mf-form-id], tr');
    return Array.from(rows).slice(0, 30).map(r => {
      const cells = r.querySelectorAll('td');
      return {
        id: r.getAttribute('data-mf-form-id') || '',
        text: r.innerText.replace(/\s+/g, ' ').trim().slice(0, 120),
      };
    }).filter(x => x.text);
  });
  console.log('Dashboard rows:', JSON.stringify(forms, null, 2));
  await page.screenshot({ path: join(OUT, '02-dashboard.png'), fullPage: true });

  // 3. Blog views with vk
  const views = [
    { label: 'blog-home', url: `${BASE}${PAGE}?vk=blog-home` },
    { label: 'blog-detail', url: `${BASE}${PAGE}?vk=blog-detail` },
    { label: 'blog-editorial-board', url: `${BASE}${PAGE}?vk=blog-editorial-board` },
    { label: 'blog-archive', url: `${BASE}${PAGE}?vk=blog-archive` },
    { label: 'blog-admin-dashboard', url: `${BASE}${PAGE}?vk=blog-admin-dashboard` },
  ];

  for (const v of views) {
    console.log(`[→] ${v.label} ...`);
    await page.goto(v.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);

    const state = await page.evaluate(() => {
      const p = window.__MF_PLATFORM__ || {};
      const txt = (document.body.innerText || '').slice(0, 400);
      return {
        url: location.href,
        title: document.title,
        formId: p.formId,
        moduleId: p.moduleId,
        hasFormMount: !!document.querySelector('[id^="mf-form-"]'),
        hasListView: !!document.querySelector('[data-mf-listview="1"]'),
        bodyPreview: txt,
      };
    });
    console.log(`[${state.formId > 0 ? '✓' : '✗'}] ${v.label}: formId=${state.formId} moduleId=${state.moduleId} listView=${state.hasListView}`);
    await page.screenshot({ path: join(OUT, `03-${v.label}.png`), fullPage: true });
  }

  // 4. Direct form IDs
  const formIds = [255, 256, 257, 258];
  for (const fid of formIds) {
    console.log(`[→] formId=${fid} ...`);
    await page.goto(`${BASE}${PAGE}?formId=${fid}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => {
      const p = window.__MF_PLATFORM__ || {};
      const txt = (document.body.innerText || '').slice(0, 200);
      const h1 = document.querySelector('h1, h2, .mf-form-title, [class*="title"]');
      return {
        formId: p.formId,
        title: document.title,
        heading: h1 ? h1.innerText.slice(0, 80) : '',
        body: txt,
      };
    });
    console.log(`    formId=${state.formId} title="${state.title}" heading="${state.heading}"`);
    await page.screenshot({ path: join(OUT, `04-form-${fid}.png`), fullPage: true });
  }

  // 5. API — list forms
  console.log('[5] Calling API to list forms...');
  const apiResult = await page.evaluate(async (apiBase) => {
    try {
      const r = await fetch(`${apiBase}Form/List?pageSize=100`, { credentials: 'same-origin' });
      const text = await r.text();
      try {
        const data = JSON.parse(text);
        const items = (data.items || data.Items || []);
        return {
          status: r.status,
          total: items.length,
          blogForms: items.filter(f => {
            const t = (f.title || f.Title || '').toLowerCase();
            return t.includes('blog') || t.includes('post') || t.includes('comment') || t.includes('reader') || t.includes('category');
          }).map(f => ({ id: f.formId || f.FormId, title: f.title || f.Title })),
        };
      } catch {
        return { status: r.status, text: text.slice(0, 300) };
      }
    } catch (e) {
      return { error: e.message };
    }
  }, platform.apiBase);
  console.log('API result:', JSON.stringify(apiResult, null, 2));

  await browser.close();
  console.log(`\n[Screenshots] ${OUT}`);
})();
