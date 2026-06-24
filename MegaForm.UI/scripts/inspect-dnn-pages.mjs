// Find which DNN page has the MegaForm module
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
  await page.goto(`${BASE}/Login?ReturnUrl=/Shop/New-Arrivals`, { waitUntil: 'networkidle', timeout: 60000 });
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

  const results = [];
  const tag = new Date().toISOString().replace(/[:.]/g, '-');

  async function inspect(label, url, needsLogin) {
    if (needsLogin) {
      console.log(`[→] ${label} (login first) ...`);
      await dnnLogin(page);
    } else {
      console.log(`[→] ${label} ...`);
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);

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
        hasWorkflowMap: !!document.querySelector('[data-mf-workflow-map-badge]'),
        hasMfPlatform: !!window.__MF_PLATFORM__,
        platform: window.__MF_PLATFORM__?.platform || 'none',
        apiBase: window.__MF_PLATFORM__?.apiBase || 'none',
        moduleId: window.__MF_PLATFORM__?.moduleId || 'none',
        formId: window.__MF_PLATFORM__?.formId || 'none',
        loadingForm: /Loading form/.test(txt),
        notPublished: /not published yet/i.test(txt),
        noModule: /No form configured/i.test(txt),
        megaformMentions: (txt.match(/MegaForm/gi) || []).length,
        blogMentions: (txt.match(/blog|post|article/gi) || []).length,
        bodyPreview: txt.slice(0, 200),
      };
    });

    const png = join(OUT, `${label}-${tag}.png`);
    await page.screenshot({ path: png, fullPage: true });

    const hasMf = diag.hasFormMount || diag.hasListView || diag.hasDashboard || diag.hasBuilder || diag.hasTaskInbox || diag.hasWorkflowMap || diag.hasMfPlatform;
    results.push({ label, url, hasMf, diag, png });
    console.log(`[${hasMf ? '★' : '·'}] ${label.padEnd(30)} platform=${diag.platform} moduleId=${diag.moduleId} formId=${diag.formId} megaformMentions=${diag.megaformMentions} blogMentions=${diag.blogMentions}`);
  }

  // Anonymous checks
  await inspect('anon-homepage', `${BASE}/`, false);
  await inspect('anon-shop-newarrivals', `${BASE}/Shop/New-Arrivals`, false);
  await inspect('anon-blog-home', `${BASE}/Shop/New-Arrivals?vk=blog-home`, false);
  await inspect('anon-form-1264', `${BASE}/Shop/New-Arrivals?formId=1264`, false);

  // Logged-in checks
  await inspect('admin-dashboard', `${BASE}/Shop/New-Arrivals#mf-dashboard`, true);
  await inspect('admin-builder', `${BASE}/Shop/New-Arrivals#mf-builder`, false);
  await inspect('admin-submissions', `${BASE}/Shop/New-Arrivals#mf-submissions`, false);
  await inspect('blog-home-loggedin', `${BASE}/Shop/New-Arrivals?vk=blog-home`, false);
  await inspect('blog-detail-loggedin', `${BASE}/Shop/New-Arrivals?vk=blog-detail`, false);
  await inspect('blog-admin-dash-loggedin', `${BASE}/Shop/New-Arrivals?vk=blog-admin-dashboard`, false);
  await inspect('form-1264-loggedin', `${BASE}/Shop/New-Arrivals?formId=1264`, false);
  await inspect('form-1266-loggedin', `${BASE}/Shop/New-Arrivals?formId=1266`, false);

  // Also check if there are any MegaForm links in the nav menu
  console.log('\n[→] scanning nav links for MegaForm references...');
  const navLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="MegaForm"], a[href*="megaform"], a[href*="blog"], a[href*="form"], a[href*="Form"]'))
      .map(a => ({ text: a.innerText.trim(), href: a.href }))
      .filter((v, i, a) => a.findIndex(t => t.href === v.href) === i)
      .slice(0, 20);
  });
  console.log('nav links:', JSON.stringify(navLinks, null, 2));

  writeFileSync(join(OUT, `page-discovery-${tag}.json`), JSON.stringify({ results, navLinks }, null, 2));
  await browser.close();

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  Pages with MegaForm detected:`);
  results.filter(r => r.hasMf).forEach(r => console.log(`    ★ ${r.label}: ${r.url}`));
  console.log(`  Screenshots: ${OUT}`);
  console.log(`═══════════════════════════════════════`);
})();
