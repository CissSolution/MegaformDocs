import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);
await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=342#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(14000);
await page.evaluate(() => { const t = document.querySelector('#mf-tab-link-theme'); if (t) t.click(); });
await page.waitForTimeout(4500);

// Click Tech Startup
await page.evaluate(() => {
  const tiles = Array.from(document.querySelectorAll('[data-preset]'));
  const tech = tiles.find(t => (t.textContent || '').toLowerCase().includes('tech startup'));
  if (tech) tech.click();
});
await page.waitForTimeout(4000);

const diag = await page.evaluate(() => {
  const iframe = document.querySelector('.mf-theme-preview-frame');
  if (!iframe) return { ok: false };
  const doc = iframe.contentDocument;
  if (!doc || !doc.body) return { ok: false };

  // Find every element with classes containing 'mf-form' or 'mf-mount' or that has a non-transparent bg
  const dumps = [];
  function dump(el, label) {
    const cs = getComputedStyle(el);
    dumps.push({
      label,
      tag: el.tagName,
      id: el.id,
      cls: el.className.slice(0, 100),
      backgroundColor: cs.backgroundColor,
      background: cs.background.slice(0, 100),
      backgroundImage: cs.backgroundImage.slice(0, 100),
      width: cs.width,
      height: cs.height,
      padding: cs.padding,
      boxShadow: cs.boxShadow.slice(0, 80),
      // What rules apply?
      offsetLeft: el.offsetLeft,
      offsetTop: el.offsetTop,
      offsetWidth: el.offsetWidth,
      offsetHeight: el.offsetHeight
    });
  }
  dump(doc.documentElement, 'html');
  dump(doc.body, 'body');
  const mfMount = doc.getElementById('mf-mount');
  if (mfMount) dump(mfMount, '#mf-mount');
  const wrapper = doc.querySelector('.mf-form-wrapper');
  if (wrapper) dump(wrapper, '.mf-form-wrapper');
  const inner = doc.querySelector('.mf-form-inner');
  if (inner) dump(inner, '.mf-form-inner');
  const form = doc.querySelector('.mf-form');
  if (form) dump(form, '.mf-form');
  const fieldsContainer = doc.querySelector('.mf-fields-container');
  if (fieldsContainer) dump(fieldsContainer, '.mf-fields-container');
  // First field-group
  const fg = doc.querySelector('.mf-field-group, .mf-canvas-cell, [class*="mf-field"]');
  if (fg) dump(fg, 'first .mf-field*');

  // List all dark-bg elements
  const darkBgEls = [];
  doc.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
      const r = +m[1], g = +m[2], b = +m[3];
      if (r < 50 && g < 50 && b < 80 && (r + g + b > 0)) {
        darkBgEls.push({ tag: el.tagName, cls: el.className.slice(0, 80), id: el.id, bg, w: el.offsetWidth, h: el.offsetHeight });
      }
    }
  });

  return { dumps, darkBgEls: darkBgEls.slice(0, 10), darkCount: darkBgEls.length };
});

await browser.close();
console.log(JSON.stringify(diag, null, 2));
