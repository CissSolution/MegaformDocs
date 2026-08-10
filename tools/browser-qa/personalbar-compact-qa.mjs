import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const user = process.argv[3] || 'admin';
const pass = process.argv[4] || 'dnnhost';
const outDir = path.resolve(process.argv[5] || 'qa-out/personalbar-b421');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const viewport = { width: Number(process.argv[6] || 1365), height: Number(process.argv[7] || 675) };
const context = await browser.newContext({ viewport });
const page = await context.newPage();
const browserLog = [];
page.on('console', (msg) => browserLog.push({ type: msg.type(), text: msg.text() }));
page.on('pageerror', (error) => browserLog.push({ type: 'pageerror', text: error.message }));
page.on('requestfailed', (req) => browserLog.push({ type: 'requestfailed', text: req.url(), detail: req.failure()?.errorText }));

await page.goto(site + '/Login?returnurl=%2fmf-templates%2fmf-xmas-sale', {
  waitUntil: 'domcontentloaded', timeout: 90000,
});
if (await page.locator('input[id*="txtUsername"]').count()) {
  await page.locator('input[id*="txtUsername"]').fill(user);
  await page.locator('input[id*="txtPassword"]').fill(pass);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
    page.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click(),
  ]);
}
await page.goto(site + '/mf-templates/mf-xmas-sale?pbqa=' + Date.now(), {
  waitUntil: 'domcontentloaded', timeout: 90000,
});
await page.waitForTimeout(7000);
await page.screenshot({ path: path.join(outDir, '01-page.png') });

const discovery = [];
for (const frame of page.frames()) {
  const info = await frame.evaluate(() => ({
    url: location.href,
    title: document.title,
    viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
    matches: Array.from(document.querySelectorAll('a,button,[role="button"],li,span,h3'))
      .filter((el) => (el.textContent || '').trim() === 'MegaForm')
      .map((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return {
          tag: el.tagName, id: el.id, className: String(el.className || ''),
          visible: s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0,
          rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
        };
      }),
  }));
  discovery.push(info);
}

fs.writeFileSync(path.join(outDir, 'discovery.json'), JSON.stringify(discovery, null, 2));
let pbFrame = page.frames().find((frame) => frame.url().includes('/Dnn.PersonaBar/'));

// Open the panel rather than hoping it is open: MegaForm sits inside the Content group of the
// Persona Bar rail, and a fresh browser context always starts with every panel closed.
if (pbFrame && !(await pbFrame.locator('.mf-pb-table').count())) {
  try {
    await pbFrame.locator('li#Content').first().click();
    await pbFrame.waitForTimeout(600);
    await pbFrame.locator('li#MegaForm').first().click();
    await pbFrame.waitForSelector('.mf-pb-table', { timeout: 45000 });
    await page.waitForTimeout(2500);
  } catch (openError) {
    fs.writeFileSync(path.join(outDir, 'open-error.txt'), String(openError));
  }
  pbFrame = page.frames().find((frame) => frame.url().includes('/Dnn.PersonaBar/'));
}
const metrics = pbFrame ? await pbFrame.evaluate(() => {
  const rect = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      rect: { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) },
      client: { width: el.clientWidth, height: el.clientHeight },
      scroll: { width: el.scrollWidth, height: el.scrollHeight },
      display: s.display, visibility: s.visibility, color: s.color, background: s.backgroundColor,
    };
  };
  return {
    document: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
    bodyText: (document.querySelector('#megaform-headerPanel')?.textContent || '') + ' ' + (document.querySelector('#megaform-bodyPanel')?.textContent || ''),
    assets: {
      scripts: Array.from(document.scripts).map((x) => x.src).filter((x) => /MegaForm/i.test(x)),
      styles: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((x) => x.href).filter((x) => /MegaForm/i.test(x)),
    },
    rects: {
      header: rect('#megaform-headerPanel'), body: rect('#megaform-bodyPanel'), stats: rect('.mf-pb-stats'),
      toolbar: rect('.mf-pb-toolbar'), tableWrap: rect('.mf-pb-table-wrap'), table: rect('.mf-pb-table'), pager: rect('.mf-pb-pager'),
    },
    density: {
      className: document.querySelector('#megaform-bodyPanel')?.getAttribute('data-mf-w') || null,
      wrapperClientWidth: document.querySelector('.mf-pb-table-wrap')?.clientWidth || 0,
      wrapperScrollWidth: document.querySelector('.mf-pb-table-wrap')?.scrollWidth || 0,
      horizontalOverflow: (document.querySelector('.mf-pb-table-wrap')?.scrollWidth || 0)
        - (document.querySelector('.mf-pb-table-wrap')?.clientWidth || 0),
      visibleColumns: Array.from(document.querySelectorAll('.mf-pb-table thead th'))
        .filter((th) => getComputedStyle(th).display !== 'none')
        .map((th) => th.textContent.trim()),
      rowHeight: Math.round(document.querySelector('.mf-pb-table tbody tr')?.getBoundingClientRect().height || 0),
      metaShown: document.querySelector('.mf-pb-meta')
        ? getComputedStyle(document.querySelector('.mf-pb-meta')).display !== 'none'
        : null,   // null = this build has no meta line at all (i.e. it is not C512)
    },
  };
}) : null;
await page.screenshot({ path: path.join(outDir, '02-settled.png') });
let interactions = null;
if (pbFrame) {
  await pbFrame.locator('.mf-pb-addto').first().click();
  await pbFrame.waitForSelector('.mf-pb-drop', { timeout: 30000 });
  interactions = {
    addToPage: await pbFrame.evaluate(() => {
      const el = document.querySelector('.mf-pb-drop');
      const r = el.getBoundingClientRect();
      return {
        rect: { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) },
        viewport: { width: innerWidth, height: innerHeight },
        confirmEnabled: !document.querySelector('.mf-pb-confirm')?.disabled,
      };
    }),
  };
  await page.screenshot({ path: path.join(outDir, '03-add-to-page.png') });
  await pbFrame.locator('.mf-pb-cancel').click();

  const firstTitle = await pbFrame.locator('.mf-pb-formtitle').first().textContent();
  await pbFrame.locator('.mf-pb-next').click();
  await pbFrame.waitForFunction((before) => document.querySelector('.mf-pb-formtitle')?.textContent !== before, firstTitle, { timeout: 30000 });
  await page.waitForTimeout(700);
  interactions.nextPageInfo = await pbFrame.locator('.mf-pb-pageinfo').textContent();
  interactions.nextFirstTitle = await pbFrame.locator('.mf-pb-formtitle').first().textContent();
  await page.screenshot({ path: path.join(outDir, '04-next-page.png') });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }),
    pbFrame.locator('.mf-pb-dashboard').click(),
  ]);
  await page.waitForSelector('#mf-dash-root', { timeout: 90000 });
  await page.waitForTimeout(1500);
  interactions.dashboard = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.mf-hd-ac .mf-btn')).map((el) => {
      const r = el.getBoundingClientRect();
      return { title: el.getAttribute('title'), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
    });
    return {
      url: location.href,
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      headerScrollWidth: document.querySelector('.mf-hd')?.scrollWidth || 0,
      headerClientWidth: document.querySelector('.mf-hd')?.clientWidth || 0,
      buttons,
    };
  });
  await page.screenshot({ path: path.join(outDir, '05-dashboard.png') });
}
const report = { discovery, metrics, interactions, browserLog };
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
