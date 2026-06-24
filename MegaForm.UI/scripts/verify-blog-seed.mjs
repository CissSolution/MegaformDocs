// Verify Blog starter seed result
import { chromium } from 'playwright-core';

const BASE   = 'http://dnn10322_megaf.ai';
const PAGE   = '/xx';
const USER   = 'host';
const PASS   = 'dnnhost';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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

  await dnnLogin(page);

  const stops = [
    { label: 'blog-home', url: `${BASE}${PAGE}?vk=blog-home` },
    { label: 'blog-detail', url: `${BASE}${PAGE}?vk=blog-detail` },
    { label: 'blog-admin-dashboard', url: `${BASE}${PAGE}?vk=blog-admin-dashboard` },
    { label: 'blog-editorial-board', url: `${BASE}${PAGE}?vk=blog-editorial-board` },
    { label: 'blog-archive', url: `${BASE}${PAGE}?vk=blog-archive` },
    { label: 'form-255-posts', url: `${BASE}${PAGE}?formId=255` },
  ];

  for (const stop of stops) {
    console.log(`[→] ${stop.label} ...`);
    await page.goto(stop.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const diag = await page.evaluate(() => {
      const txt = (document.body.innerText || '').slice(0, 600);
      return {
        title: document.title,
        hasFormMount: !!document.querySelector('[id^="mf-form-"]'),
        hasListView: !!document.querySelector('[data-mf-listview="1"]'),
        hasDashboard: !!document.querySelector('#mf-dashboard-root'),
        loadingForm: /Loading form/.test(txt),
        notPublished: /not published yet/i.test(txt),
        noModule: /No form configured/i.test(txt),
        bodyPreview: txt.slice(0, 150),
      };
    });

    await page.screenshot({ path: `monitor/out/deploy-verify/${stop.label}.png`, fullPage: true });
    const ok = !diag.loadingForm && !diag.notPublished && !diag.noModule;
    console.log(`[${ok?'✓':'✗'}] ${stop.label.padEnd(25)} title="${diag.title}" mount=${diag.hasFormMount} listview=${diag.hasListView} dash=${diag.hasDashboard}`);
    if (!ok) console.log(`    preview: ${diag.bodyPreview}`);
  }

  await browser.close();
  console.log('[Done] Screenshots in monitor/out/deploy-verify/');
})();
