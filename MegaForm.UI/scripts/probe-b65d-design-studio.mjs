// [B65d] Verify on megatest:
// (a) BASIC palette: dark navy bg + tile structure intact
// (b) EMBED tab removed
// (c) FIELD tab renamed to "Design" + SETTINGS/HTML labels hidden
// (d) Click Design card → popup modal opens with corresponding section content
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGE: ' + e.message));

await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

await page.goto(SITE + '/xx?mfFormId=1264#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(14000);

await page.screenshot({ path: 'qa-out/b65d-design-01-basic.png', fullPage: false });

// (a) Left panel BASIC + (b) EMBED removed + (c) labels
const tabsAndPanel = await page.evaluate(() => {
  const panel = document.querySelector('#mf-panel-left');
  const panelCs = panel ? getComputedStyle(panel) : null;
  const body = document.querySelector('.mf-panel-body');
  const bodyCs = body ? getComputedStyle(body) : null;
  const rightTabs = Array.from(document.querySelectorAll('.mf-right-tab[data-tab]')).map(t => {
    const cs = getComputedStyle(t);
    return {
      dataTab: t.getAttribute('data-tab'),
      label: (t.querySelector('.mf-tab-lbl') || {}).textContent || '',
      display: cs.display,
      visible: cs.display !== 'none' && cs.visibility !== 'hidden'
    };
  });
  const fieldTabLabel = rightTabs.find(t => t.dataTab === 'field');
  const embedTabPresent = rightTabs.find(t => t.dataTab === 'embed');
  const settingsTabVisible = rightTabs.find(t => t.dataTab === 'settings');
  const htmlTabVisible = rightTabs.find(t => t.dataTab === 'html');
  return {
    panelBg: panelCs ? panelCs.backgroundColor : null,
    panelBodyBg: bodyCs ? bodyCs.backgroundColor : null,
    rightTabsAll: rightTabs.map(t => t.dataTab + ':' + t.label + ':' + (t.visible ? 'V' : 'H')),
    fieldLabel: fieldTabLabel ? fieldTabLabel.label : null,
    embedPresent: !!embedTabPresent,
    settingsVisible: settingsTabVisible ? settingsTabVisible.visible : null,
    htmlVisible: htmlTabVisible ? htmlTabVisible.visible : null
  };
});

// Click Field design card to open popup
await page.evaluate(() => {
  // Make sure FIELD tab is active first
  const fieldTab = document.querySelector('#mf-tab-link-field');
  if (fieldTab) fieldTab.click();
});
await page.waitForTimeout(800);

await page.screenshot({ path: 'qa-out/b65d-design-02-launcher.png', fullPage: false });

const launcherProbe = await page.evaluate(() => {
  const launcher = document.querySelector('#mf-design-launcher');
  if (!launcher) return { ok: false };
  const cards = launcher.querySelectorAll('[data-mf-design-open]');
  return {
    ok: true,
    cardCount: cards.length,
    cardLabels: Array.from(cards).map(c => {
      const t = c.querySelector('.mf-design-card-title');
      return t ? t.textContent.trim() : '';
    })
  };
});

// Click Settings popup
await page.evaluate(() => {
  const btn = document.querySelector('[data-mf-design-open="settings"]');
  if (btn) btn.click();
});
await page.waitForTimeout(1500);

await page.screenshot({ path: 'qa-out/b65d-design-03-settings-popup.png', fullPage: false });

const popupProbe = await page.evaluate(() => {
  const backdrop = document.querySelector('#mf-design-modal-backdrop, .mf-design-modal-backdrop');
  if (!backdrop) return { ok: false };
  const modal = backdrop.querySelector('.mf-design-modal');
  const title = backdrop.querySelector('.mf-design-modal-title');
  const settingsBody = backdrop.querySelector('#mf-tab-settings');
  return {
    ok: true,
    title: title ? title.textContent.trim() : '',
    hasSettingsBody: !!settingsBody,
    settingsBodyHasContent: settingsBody ? settingsBody.querySelectorAll('.mf-prop-group, .mf-evoq-card').length : 0,
    modalWidth: modal ? Math.round(modal.getBoundingClientRect().width) : 0,
    modalHeight: modal ? Math.round(modal.getBoundingClientRect().height) : 0
  };
});

await browser.close();
const r = { tabsAndPanel, launcherProbe, popupProbe, errCount: errs.length };
console.log(JSON.stringify(r, null, 2));
