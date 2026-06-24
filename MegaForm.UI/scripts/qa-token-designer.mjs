// [B26 QA] HTML Token Designer popup — verify:
//  1. "Open Token Designer" button mounted in HTML tab
//  2. Click opens modal with 3 tabs (Text / Image / Form)
//  3. Image tokens detected by name heuristic
//  4. Gallery picker opens, lists images (or empty state)
//  5. Esc closes, Done closes
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrs = [];
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 30000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

try { await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(6000);

// Switch to HTML tab
const htmlTabClicked = await page.evaluate(() => {
  const tab = document.querySelector('#mf-tab-link-html, a.mf-right-tab[data-tab="html"]');
  if (!tab) return false;
  tab.click();
  return true;
});
await page.waitForTimeout(800);
console.log('HTML tab clicked:', htmlTabClicked);

// Seed Custom HTML with a mix of text + image tokens for the test
await page.evaluate(() => {
  const B = window.MegaFormBuilder;
  if (!B || !B.state || !B.state.schema) return;
  B.state.schema.settings = B.state.schema.settings || {};
  const sampleHtml = [
    '<section class="hero">',
    '  <img src="{{content:hero_image}}" class="hero-bg"/>',
    '  <h1>{{content:hero_title}}</h1>',
    '  <p>{{content:hero_tagline}}</p>',
    '</section>',
    '<section class="slider">',
    '  <img src="{{content:slider_image_1}}"/>',
    '  <img src="{{content:slider_image_2}}"/>',
    '  <img src="{{content:slider_image_3}}"/>',
    '</section>',
    '<footer><img src="{{content:logo_url}}"/><small>{{content:footer_text}}</small></footer>'
  ].join('\n');
  B.state.schema.settings.customHtml = sampleHtml;
  B.state.schema.settings.CustomHtml = sampleHtml;
  // re-render inline editor to surface the button + sync token list
  const ed = document.getElementById('mf-custom-html-editor');
  if (ed) { ed.value = sampleHtml; ed.dispatchEvent(new Event('input', {bubbles:true})); }
});
await page.waitForTimeout(400);

// PROBE 1 — button presence
const probe1 = await page.evaluate(() => {
  const btn = document.getElementById('mf-open-token-designer');
  return {
    buttonExists: !!btn,
    buttonText: btn ? (btn.textContent || '').trim() : null,
    buttonVisible: btn ? btn.getBoundingClientRect().width > 0 : false,
    htmlEditorValue: (document.getElementById('mf-custom-html-editor') || {}).value || '',
  };
});
console.log('=== PROBE 1 (button) ===');
console.log(JSON.stringify(probe1, null, 2));
await page.screenshot({ path: join(OUT, 'qa-token-designer-01-button.png'), fullPage: false });

// PROBE 2 — open modal
const openResult = await page.evaluate(() => {
  const btn = document.getElementById('mf-open-token-designer');
  if (!btn) return { opened: false, reason: 'no button' };
  btn.click();
  return { opened: !!document.getElementById('mf-token-designer-modal') };
});
await page.waitForTimeout(500);
console.log('Open result:', openResult);
await page.screenshot({ path: join(OUT, 'qa-token-designer-02-modal-text.png'), fullPage: false });

// PROBE 3 — text tab content
const probe3 = await page.evaluate(() => {
  const modal = document.getElementById('mf-token-designer-modal');
  if (!modal) return null;
  const tabs = Array.from(modal.querySelectorAll('.mf-token-designer-tab'));
  const activeTab = modal.querySelector('.mf-token-designer-tab.active');
  const textPane = modal.querySelector('[data-pane="text"]');
  const rows = textPane ? Array.from(textPane.querySelectorAll('.mf-token-row')) : [];
  return {
    tabsCount: tabs.length,
    tabLabels: tabs.map(t => (t.textContent || '').replace(/\s+/g, ' ').trim()),
    activeTab: (activeTab && activeTab.getAttribute('data-tab')) || null,
    textRowCount: rows.length,
    textRowLabels: rows.map(r => (r.querySelector('.mf-token-row-label')?.textContent || '').trim()),
  };
});
console.log('=== PROBE 3 (text pane) ===');
console.log(JSON.stringify(probe3, null, 2));

// PROBE 4 — switch to Image tab
const imgPaneProbe = await page.evaluate(() => {
  const modal = document.getElementById('mf-token-designer-modal');
  const imgTab = modal && modal.querySelector('.mf-token-designer-tab[data-tab="image"]');
  if (!imgTab) return null;
  imgTab.click();
  const imgPane = modal.querySelector('[data-pane="image"]');
  const rows = imgPane ? Array.from(imgPane.querySelectorAll('.mf-token-row-image')) : [];
  return {
    activePane: 'image',
    imageRowCount: rows.length,
    imageRowLabels: rows.map(r => (r.querySelector('.mf-token-row-label')?.textContent || '').trim()),
    firstRowHasUploadBtn: !!(rows[0] && rows[0].querySelector('.mf-token-image-upload')),
    firstRowHasGalleryBtn: !!(rows[0] && rows[0].querySelector('.mf-token-image-gallery')),
    firstRowHasUrlInput: !!(rows[0] && rows[0].querySelector('.mf-token-image-url')),
  };
});
await page.waitForTimeout(400);
console.log('=== PROBE 4 (image pane) ===');
console.log(JSON.stringify(imgPaneProbe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-token-designer-03-modal-image.png'), fullPage: false });

// PROBE 5 — open gallery picker, verify endpoint resolves
const galleryProbe = await page.evaluate(async () => {
  const modal = document.getElementById('mf-token-designer-modal');
  const galleryBtn = modal && modal.querySelector('.mf-token-image-gallery');
  if (!galleryBtn) return { opened: false, reason: 'no gallery btn' };
  galleryBtn.click();
  await new Promise(r => setTimeout(r, 800));
  const overlay = document.getElementById('mf-token-gallery-overlay');
  if (!overlay) return { opened: false, reason: 'no overlay' };
  // Wait for fetch to settle
  await new Promise(r => setTimeout(r, 800));
  const cards = overlay.querySelectorAll('.mf-token-gallery-card');
  const empty = overlay.querySelector('.mf-token-designer-empty');
  return {
    opened: true,
    cardCount: cards.length,
    emptyShown: !!empty,
    emptyText: empty ? (empty.textContent || '').trim().slice(0, 120) : null,
    hasSearch: !!overlay.querySelector('.mf-token-gallery-search'),
  };
});
console.log('=== PROBE 5 (gallery) ===');
console.log(JSON.stringify(galleryProbe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-token-designer-04-gallery.png'), fullPage: false });

// PROBE 6 — Esc closes overlays
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const closedProbe = await page.evaluate(() => ({
  modalGone: !document.getElementById('mf-token-designer-modal'),
  galleryGone: !document.getElementById('mf-token-gallery-overlay'),
}));
console.log('=== PROBE 6 (close via Esc) ===');
console.log(JSON.stringify(closedProbe, null, 2));

// PROBE 7 — verify gallery endpoint shape directly
const apiProbe = await page.evaluate(async () => {
  try {
    const r = await fetch('/DesktopModules/MegaForm/API/Upload/List', { credentials: 'same-origin' });
    const t = await r.text();
    let json = null;
    try { json = JSON.parse(t); } catch (e) {}
    return { status: r.status, hasItemsArray: !!(json && Array.isArray(json.items)), itemCount: json && Array.isArray(json.items) ? json.items.length : null, raw: t.slice(0, 200) };
  } catch (e) { return { error: String(e) }; }
});
console.log('=== PROBE 7 (API /Upload/List) ===');
console.log(JSON.stringify(apiProbe, null, 2));

console.log('=== CONSOLE ERRORS ===');
console.log(JSON.stringify(consoleErrs.slice(0, 10), null, 2));
await browser.close();
