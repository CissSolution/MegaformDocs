import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const user = process.argv[3] || 'admin';
const pass = process.argv[4] || 'dnnhost';
const outDir = path.resolve(process.argv[5] || 'qa-out/admin-responsive-surfaces');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = { site, viewports: [] };

async function login(page) {
  await page.goto(site + '/Login?returnurl=%2fmfqa-admin', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('input[id*="txtUsername"]').fill(user);
  await page.locator('input[id*="txtPassword"]').fill(pass);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
    page.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click(),
  ]);
  await page.goto(site + '/mfqa-admin?responsiveqa=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !!window.MegaFormWizard?.open, null, { timeout: 90000 });
  await page.waitForTimeout(2000);
}

async function metrics(page, surface) {
  return page.evaluate((surfaceName) => {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const selector = (el) => {
      if (el.id) return '#' + el.id;
      const cls = Array.from(el.classList || []).slice(0, 3).join('.');
      return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
    };
    const offenders = Array.from(document.querySelectorAll('body *')).map((el) => {
      const r = el.getBoundingClientRect();
      return { selector: selector(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    }).filter((x) => x.width > 0 && (x.right > vw + 1 || x.left < -1 || x.scrollWidth > x.clientWidth + 2))
      .sort((a, b) => Math.max(b.right - vw, b.scrollWidth - b.clientWidth) - Math.max(a.right - vw, a.scrollWidth - a.clientWidth))
      .slice(0, 25);
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    };
    return {
      surface: surfaceName,
      viewport: { width: vw, height: vh },
      document: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      body: { scrollWidth: document.body.scrollWidth, scrollHeight: document.body.scrollHeight },
      rects: {
        dashboard: rect('#mf-dash-root'), layout: rect('.mf-layout'), inset: rect('.mf-inset'), main: rect('.mf-main'),
        wizard: rect('#mf-wizard-root'), wizardBody: rect('.mfw-body'), wizardMain: rect('.mfw-main'), wizardSide: rect('.mfw-side'), wizardFooter: rect('.mfw-foot'),
        aiOverlay: rect('#mfd-ai-form-creator-root'), aiModal: rect('.mfd-ai-modal'), aiWorkspace: rect('.mfd-ai-workspace'),
        aiChat: rect('.mfd-ai-chat'), aiPreview: rect('.mfd-ai-preview-pane'),
      },
      offenders,
    };
  }, surface);
}

for (const viewport of [{ name: 'desktop', width: 1365, height: 675 }, { name: 'tablet', width: 1024, height: 768 }, { name: 'iphone14', width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  await login(page);
  const run = { viewport, surfaces: [] };

  run.surfaces.push(await metrics(page, 'dashboard'));
  await page.screenshot({ path: path.join(outDir, `${viewport.name}-01-dashboard.png`) });

  const opened = await page.evaluate(() => { window.MegaFormWizard.open(); return true; });
  if (opened) {
    await page.waitForSelector('#mf-wizard-root');
    run.surfaces.push(await metrics(page, 'wizard'));
    await page.screenshot({ path: path.join(outDir, `${viewport.name}-02-wizard.png`) });
    await page.locator('.mfw-cancel').click();
  }

  const ai = page.locator('button, a').filter({ hasText: /Create with AI|Tạo với AI/i }).first();
  if (await ai.count()) {
    await ai.click();
    await page.waitForTimeout(700);
    run.surfaces.push(await metrics(page, 'ai-designer'));
    await page.screenshot({ path: path.join(outDir, `${viewport.name}-03-ai.png`) });
  }

  report.viewports.push(run);
  await context.close();
}

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
