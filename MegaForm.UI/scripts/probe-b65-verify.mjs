// [B65] Verify 4 user-reported bugs via real browser:
// (a) form not in heavy box + no horizontal scrollbar + neutral page bg
// (b) right pane scrollable
// (c) preset switch (Tech Startup) keeps page bg neutral, form readable
// (d) theme header has no duplicate device toggle
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

// Open form 342 builder (Contact Us — the user's reference form)
await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=342#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(14000);

// Click THEME tab
await page.evaluate(() => {
  const t = document.querySelector('#mf-tab-link-theme, .mf-right-tab[data-tab="theme"]');
  if (t) t.click();
});
await page.waitForTimeout(4500);

await page.screenshot({ path: 'qa-out/b65-01-theme-default.png', fullPage: false });

// Dim (a)+(c): measure iframe body bg + form-wrapper bg + iframe horizontal scrollbar + theme class
const iframeStateDefault = await page.evaluate(() => {
  const iframe = document.querySelector('.mf-theme-preview-frame');
  if (!iframe) return { ok: false };
  const doc = iframe.contentDocument;
  if (!doc || !doc.body) return { ok: false };
  const cs = (el) => el ? getComputedStyle(el) : null;
  const body = doc.body;
  const wrapper = doc.querySelector('.mf-form-wrapper');
  const inner = doc.querySelector('.mf-form-inner');
  const formCard = doc.querySelector('.mf-form');
  const win = iframe.contentWindow;
  const horizScroll = doc.documentElement.scrollWidth > doc.documentElement.clientWidth;
  return {
    ok: true,
    bodyBg: cs(body).backgroundColor,
    wrapperBg: wrapper ? cs(wrapper).backgroundColor : null,
    wrapperShadow: wrapper ? cs(wrapper).boxShadow.slice(0,80) : null,
    innerBg: inner ? cs(inner).backgroundColor : null,
    formCardBg: formCard ? cs(formCard).backgroundColor : null,
    horizScrollbarPresent: horizScroll,
    bodyClasses: body.className,
    docWidth: doc.documentElement.scrollWidth,
    docViewport: doc.documentElement.clientWidth
  };
});

// Click Tech Startup preset
await page.evaluate(() => {
  const tiles = Array.from(document.querySelectorAll('[data-preset]'));
  const tech = tiles.find(t => (t.textContent || '').toLowerCase().includes('tech startup'));
  if (tech) tech.click();
});
await page.waitForTimeout(3500);

await page.screenshot({ path: 'qa-out/b65-02-theme-techstartup.png', fullPage: false });

const iframeStateTech = await page.evaluate(() => {
  const iframe = document.querySelector('.mf-theme-preview-frame');
  if (!iframe) return { ok: false };
  const doc = iframe.contentDocument;
  if (!doc || !doc.body) return { ok: false };
  const cs = (el) => el ? getComputedStyle(el) : null;
  const body = doc.body;
  const wrapper = doc.querySelector('.mf-form-wrapper');
  const inner = doc.querySelector('.mf-form-inner');
  const formCard = doc.querySelector('.mf-form');
  const horizScroll = doc.documentElement.scrollWidth > doc.documentElement.clientWidth;
  return {
    ok: true,
    bodyBg: cs(body).backgroundColor,
    wrapperBg: wrapper ? cs(wrapper).backgroundColor : null,
    formCardBg: formCard ? cs(formCard).backgroundColor : null,
    horizScrollbarPresent: horizScroll,
    bodyClasses: body.className,
    wrapperClasses: wrapper ? wrapper.className : null,
    docWidth: doc.documentElement.scrollWidth,
    docViewport: doc.documentElement.clientWidth
  };
});

// Dim (b): right pane scroll capability
const rightPaneScroll = await page.evaluate(() => {
  const candidates = ['.mf-theme-body', '.mf-right-tab-content', '#mf-tab-theme', '.mf-panel-right'];
  const found = [];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) {
      const cs = getComputedStyle(el);
      found.push({
        sel,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        canScroll: el.scrollHeight > el.clientHeight,
        overflowY: cs.overflowY,
        maxHeight: cs.maxHeight
      });
    }
  }
  // Try scrolling
  const body = document.querySelector('.mf-theme-body');
  let scrollOk = false;
  let scrollAfter = 0;
  if (body) {
    body.scrollTop = 500;
    scrollAfter = body.scrollTop;
    scrollOk = scrollAfter > 0;
  }
  return { found, scrollOk, scrollAfter };
});

// Dim (d): no device toggle in theme header
const themeHeader = await page.evaluate(() => {
  const toolbar = document.querySelector('.mf-theme-toolbar');
  if (!toolbar) return { ok: false };
  const deviceGroup = toolbar.querySelector('#mf-theme-device-group');
  const buttons = Array.from(toolbar.querySelectorAll('button'));
  return {
    ok: true,
    hasDeviceGroup: !!deviceGroup,
    buttonCount: buttons.length,
    buttonTexts: buttons.map(b => (b.textContent || '').trim().slice(0, 30))
  };
});

await browser.close();

const result = { iframeStateDefault, iframeStateTech, rightPaneScroll, themeHeader, consoleErrorsLen: consoleErrors.length };
writeFileSync('qa-out/b65-probe.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
