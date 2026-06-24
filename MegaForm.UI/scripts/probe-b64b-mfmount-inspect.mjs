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

await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=333#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(14000);

await page.evaluate(() => {
  const t = document.querySelector('#mf-tab-link-theme, .mf-right-tab[data-tab="theme"]');
  if (t) t.click();
});
await page.waitForTimeout(5000);

// Click STRUCTURE tab
await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.mf-tlr-tab'));
  const s = tabs.find(t => (t.textContent || '').trim().toUpperCase() === 'STRUCTURE');
  if (s) s.click();
});
await page.waitForTimeout(2000);

const report = await page.evaluate(() => {
  const iframe = document.querySelector('.mf-theme-preview-frame, iframe#mf-builder-preview-frame');
  if (!iframe) return { ok: false, reason: 'no iframe' };
  const doc = iframe.contentDocument;
  if (!doc) return { ok: false, reason: 'no doc' };
  const body = doc.body;
  const bodyHtml = body ? body.innerHTML.slice(0, 800) : '(no body)';
  const bodyChildrenCount = body ? body.children.length : 0;
  const mfMount = doc.getElementById('mf-mount');
  const mfMountHtml = mfMount ? mfMount.innerHTML.slice(0, 800) : '(no mf-mount)';
  const mfMountChildren = mfMount ? Array.from(mfMount.children).map(c => ({ tag: c.tagName, cls: c.className.slice(0, 80), id: c.id })) : [];
  // Try to invoke MFThemeTabAdapter's structure refresh or rebuild manually
  let walkerTopChildren = [];
  if (body) {
    for (let i = 0; i < body.children.length && i < 10; i++) {
      const c = body.children[i];
      walkerTopChildren.push({ tag: c.tagName, cls: c.className.slice(0, 80), id: c.id, childCount: c.children.length });
    }
  }
  // Test isInteresting equivalent
  const interestingCheck = (el) => {
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'meta', 'link', 'br'].includes(tag)) return false;
    if (/\bmf-/.test(el.className || '')) return true;
    if (el.id) return true;
    return false;
  };
  let walkOk = [];
  if (body) {
    Array.from(body.children).forEach(c => {
      walkOk.push({ tag: c.tagName, cls: c.className.slice(0, 60), interesting: interestingCheck(c) });
    });
  }
  return { ok: true, bodyChildrenCount, walkerTopChildren, walkOk, mfMountChildren, mfMountHtmlLen: mfMount ? mfMount.innerHTML.length : 0, mfMountHtmlPreview: mfMountHtml };
});

await browser.close();
console.log(JSON.stringify(report, null, 2));
