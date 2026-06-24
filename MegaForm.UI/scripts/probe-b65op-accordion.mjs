// [B65o+p] Verify:
// 1. Design Studio is accordion (not popup) — click expands inline
// 2. FORM THEME section removed from Form Settings
// 3. Submit button options visible in Custom HTML accordion
// 4. Help tips render with hover tooltip
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

await page.goto(SITE + '/megaform/Home/mfFormId/1264?mfFormId=1264#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(15000);

const launcherShape = await page.evaluate(() => {
  const launcher = document.getElementById('mf-design-launcher');
  if (!launcher) return { ok: false };
  return {
    isAccordion: launcher.classList.contains('mf-design-accordion'),
    accItems: Array.from(launcher.querySelectorAll('.mf-design-acc-item')).map(it => ({
      id: it.getAttribute('data-mf-acc-id'),
      hasHead: !!it.querySelector('[data-mf-design-toggle]'),
      hasBody: !!it.querySelector('[data-mf-acc-body]'),
      expanded: it.classList.contains('expanded')
    }))
  };
});

// Click Form Settings accordion head
await page.evaluate(() => {
  const head = document.querySelector('[data-mf-design-toggle="settings"]');
  if (head) head.click();
});
await page.waitForTimeout(1500);

const settingsExpanded = await page.evaluate(() => {
  const item = document.querySelector('[data-mf-acc-id="settings"]');
  const body = item ? item.querySelector('[data-mf-acc-body="settings"]') : null;
  const settingsContent = body ? body.querySelector('#mf-tab-settings') : null;
  const noBackdrop = !document.querySelector('.mf-design-modal-backdrop');
  const formThemeSec = settingsContent ? Array.from(settingsContent.querySelectorAll('h6')).find(h => /form theme/i.test(h.textContent || '')) : null;
  const helpTipCount = settingsContent ? settingsContent.querySelectorAll('.mf-help-tip').length : 0;
  return {
    expanded: item ? item.classList.contains('expanded') : false,
    bodyHasContent: !!settingsContent,
    contentLen: settingsContent ? settingsContent.innerHTML.length : 0,
    noModal: noBackdrop,
    formThemeRemoved: !formThemeSec,
    helpTipCount
  };
});

await page.screenshot({ path: 'qa-out/b65op-01-settings-expanded.png', fullPage: false });

// Click Custom HTML to test Submit button options
await page.evaluate(() => {
  const head = document.querySelector('[data-mf-design-toggle="html"]');
  if (head) head.click();
});
await page.waitForTimeout(1500);

const htmlExpanded = await page.evaluate(() => {
  const item = document.querySelector('[data-mf-acc-id="html"]');
  const body = item ? item.querySelector('[data-mf-acc-body="html"]') : null;
  const htmlContent = body ? body.querySelector('#mf-tab-html') : null;
  return {
    expanded: item ? item.classList.contains('expanded') : false,
    settingsCollapsed: !document.querySelector('[data-mf-acc-id="settings"]')?.classList.contains('expanded'),
    hasFullWidthInput: !!document.getElementById('mf-setting-submit-fullwidth'),
    hasAlignSelect: !!document.getElementById('mf-setting-submit-align'),
    hasVariantSelect: !!document.getElementById('mf-setting-submit-variant'),
    helpTipCount: htmlContent ? htmlContent.querySelectorAll('.mf-help-tip').length : 0
  };
});

await page.screenshot({ path: 'qa-out/b65op-02-html-expanded.png', fullPage: false });

// Test toggle Submit fullwidth + check form-actions class
await page.evaluate(() => {
  const cb = document.getElementById('mf-setting-submit-fullwidth');
  if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  const sel = document.getElementById('mf-setting-submit-align');
  if (sel) { sel.value = 'right'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
});
await page.waitForTimeout(1500);

const submitWidget = await page.evaluate(() => {
  const iframe = document.querySelector('.mf-theme-preview-frame');
  let inIframe = null;
  if (iframe && iframe.contentDocument) {
    const actions = iframe.contentDocument.querySelector('.mf-form-actions');
    inIframe = actions ? actions.className : null;
  }
  const onBuilder = document.querySelector('.mf-form-actions');
  return {
    builderClass: onBuilder ? onBuilder.className : null,
    iframeClass: inIframe
  };
});

await browser.close();
console.log(JSON.stringify({ launcherShape, settingsExpanded, htmlExpanded, submitWidget }, null, 2));
