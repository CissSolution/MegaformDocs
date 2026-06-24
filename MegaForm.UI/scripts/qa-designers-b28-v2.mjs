// [B28 QA v2] Direct-call designer test — bypasses widget-settings panel
// since opening via injected button requires plugin registry populated.
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
const consoleWarns = [];
page.on('console', m => {
  if (m.type() === 'error') consoleErrs.push(m.text());
  if (m.type() === 'warning') consoleWarns.push(m.text());
});

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

try { await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(8000);

// PROBE 1: bundle globals
const env = await page.evaluate(() => ({
  hasMegaFormBuilder: !!window.MegaFormBuilder,
  hasMFTokenDesigner: !!window.MFTokenDesigner,
  hasMFSliderDesigner: !!window.MFSliderDesigner,
  hasMFImageChoiceDesigner: !!window.MFImageChoiceDesigner,
  pluginRegistryNames: Object.keys((window.MegaFormWidgets && window.MegaFormWidgets._registry) || {}).sort(),
  pluginRegistryCount: Object.keys((window.MegaFormWidgets && window.MegaFormWidgets._registry) || {}).length,
}));
console.log('=== PROBE 1 (globals) ===');
console.log(JSON.stringify(env, null, 2));

// PROBE 2: direct call MFSliderDesigner.open with a test ContentSlider field
const sliderProbe = await page.evaluate(async () => {
  const field = {
    type: 'ContentSlider', key: 'qa_slider', label: 'QA Slider',
    widgetProps: {
      style: 'cards', height: 240, interval: 4000, autoplay: true, imageFit: 'cover',
      items: [
        { imageUrl: '', title: 'Slide A', description: 'first', badge: '', meta: '$10' },
        { imageUrl: '', title: 'Slide B', description: 'second', badge: 'NEW', meta: '$20' }
      ]
    }
  };
  window.MFSliderDesigner.open(field, function () {});
  await new Promise(r => setTimeout(r, 500));
  const modal = document.getElementById('mf-slider-designer-modal');
  if (!modal) return { opened: false };
  const styleCards = modal.querySelectorAll('.mf-slider-designer-style-card');
  const tabs = modal.querySelectorAll('.mf-token-designer-tab');
  // Switch to Slides tab
  modal.querySelector('.mf-token-designer-tab[data-tab="slides"]').click();
  await new Promise(r => setTimeout(r, 200));
  const slidePane = modal.querySelector('[data-pane="slides"]');
  const rows = slidePane.querySelectorAll('.mf-slider-designer-row');
  // Switch to Settings tab
  modal.querySelector('.mf-token-designer-tab[data-tab="settings"]').click();
  await new Promise(r => setTimeout(r, 200));
  const settingsPane = modal.querySelector('[data-pane="settings"]');
  const heightInp = settingsPane.querySelector('.mf-slider-s-height');
  const autoplayInp = settingsPane.querySelector('.mf-slider-s-autoplay');
  return {
    opened: true,
    styleCardCount: styleCards.length,
    styleLabels: Array.from(styleCards).map(c => (c.querySelector('.mf-slider-designer-style-label')?.textContent || '').trim()),
    activeStyle: (modal.querySelector('.mf-slider-designer-style-card.is-active .mf-slider-designer-style-label')?.textContent || '').trim(),
    tabCount: tabs.length,
    countBadge: (modal.querySelector('#mf-slider-designer-count')?.textContent || '').trim(),
    slideRowCount: rows.length,
    firstSlideHasUpload: !!rows[0]?.querySelector('.mf-slider-designer-upload'),
    firstSlideHasGallery: !!rows[0]?.querySelector('.mf-slider-designer-gallery'),
    firstSlideHasUrl: !!rows[0]?.querySelector('.mf-slider-designer-url'),
    firstSlideHasTitle: !!rows[0]?.querySelector('.mf-slider-designer-title'),
    hasHeightInput: !!heightInp,
    autoplayChecked: autoplayInp ? autoplayInp.checked : null,
    heightValue: heightInp ? heightInp.value : null
  };
});
console.log('=== PROBE 2 (Slider Designer direct) ===');
console.log(JSON.stringify(sliderProbe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-designers-b28v2-slider-settings.png'), fullPage: false });

// PROBE 3: change style + verify
const styleChangeProbe = await page.evaluate(async () => {
  const modal = document.getElementById('mf-slider-designer-modal');
  if (!modal) return { error: 'no modal' };
  modal.querySelector('.mf-token-designer-tab[data-tab="style"]').click();
  await new Promise(r => setTimeout(r, 150));
  const cards = modal.querySelectorAll('.mf-slider-designer-style-card');
  // Click "Fade" (idx 1)
  cards[1].click();
  await new Promise(r => setTimeout(r, 200));
  return {
    afterClickActive: (modal.querySelector('.mf-slider-designer-style-card.is-active .mf-slider-designer-style-label')?.textContent || '').trim()
  };
});
console.log('=== PROBE 3 (style change) ===');
console.log(JSON.stringify(styleChangeProbe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-designers-b28v2-slider-style.png'), fullPage: false });

// PROBE 4: gallery picker opens from slider designer
const galleryProbe = await page.evaluate(async () => {
  const modal = document.getElementById('mf-slider-designer-modal');
  modal.querySelector('.mf-token-designer-tab[data-tab="slides"]').click();
  await new Promise(r => setTimeout(r, 200));
  const row = modal.querySelector('.mf-slider-designer-row');
  row.querySelector('.mf-slider-designer-gallery').click();
  await new Promise(r => setTimeout(r, 1200));
  const overlay = document.getElementById('mf-token-gallery-overlay');
  return {
    galleryOpened: !!overlay,
    emptyShown: !!overlay?.querySelector('.mf-token-designer-empty'),
    hasSearch: !!overlay?.querySelector('.mf-token-gallery-search')
  };
});
console.log('=== PROBE 4 (gallery from slider) ===');
console.log(JSON.stringify(galleryProbe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-designers-b28v2-gallery.png'), fullPage: false });

// Close gallery + modal
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// PROBE 5: ImageChoice designer direct
const icProbe = await page.evaluate(async () => {
  const field = {
    type: 'ImageChoice', key: 'qa_ic', label: 'QA IC',
    options: [
      { value: 'a', label: 'Option A', image: '', description: 'desc A', price: 9 },
      { value: 'b', label: 'Option B', image: '', description: 'desc B', price: 19 }
    ],
    widgetProps: { columns: 3, multiSelect: false, showPrice: true, showDescription: true, cardStyle: 'bordered', selectedColor: '#4f46e5' }
  };
  window.MFImageChoiceDesigner.open(field, function () {});
  await new Promise(r => setTimeout(r, 500));
  const modal = document.getElementById('mf-ic-designer-modal');
  if (!modal) return { opened: false };
  const styleCards = modal.querySelectorAll('.mf-slider-designer-style-card');
  modal.querySelector('.mf-token-designer-tab[data-tab="options"]').click();
  await new Promise(r => setTimeout(r, 200));
  const optsPane = modal.querySelector('[data-pane="options"]');
  const rows = optsPane.querySelectorAll('.mf-slider-designer-row');
  modal.querySelector('.mf-token-designer-tab[data-tab="settings"]').click();
  await new Promise(r => setTimeout(r, 200));
  const settingsPane = modal.querySelector('[data-pane="settings"]');
  return {
    opened: true,
    styleCardCount: styleCards.length,
    styleLabels: Array.from(styleCards).map(c => (c.querySelector('.mf-slider-designer-style-label')?.textContent || '').trim()),
    optionRowCount: rows.length,
    firstHasUpload: !!rows[0]?.querySelector('.mf-ic-upload'),
    firstHasGallery: !!rows[0]?.querySelector('.mf-ic-gallery'),
    firstHasUrl: !!rows[0]?.querySelector('.mf-ic-url'),
    firstHasLabel: !!rows[0]?.querySelector('.mf-ic-label'),
    firstHasValue: !!rows[0]?.querySelector('.mf-ic-value'),
    firstHasPrice: !!rows[0]?.querySelector('.mf-ic-price'),
    hasColsSelect: !!settingsPane.querySelector('.mf-ic-s-cols'),
    hasMultiCheck: !!settingsPane.querySelector('.mf-ic-s-multi'),
    countBadge: (modal.querySelector('#mf-ic-designer-count')?.textContent || '').trim()
  };
});
console.log('=== PROBE 5 (ImageChoice direct) ===');
console.log(JSON.stringify(icProbe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-designers-b28v2-imagechoice.png'), fullPage: false });

await page.keyboard.press('Escape');

// PROBE 6: ProductLineItems registry check — should NOT be in plugin list
const pliProbe = await page.evaluate(() => {
  // Force-load all registered plugins by walking the registry
  var names = Object.keys((window.MegaFormWidgets && window.MegaFormWidgets._registry) || {}).sort();
  // Also try fetching plugin file to confirm it's not bundled
  return fetch('/DesktopModules/MegaForm/Assets/js/plugins/megaform-widget-product-line-items.js', { method: 'HEAD' })
    .then(r => ({ status: r.status, ok: r.ok, pluginsRegistered: names }))
    .catch(e => ({ error: String(e), pluginsRegistered: names }));
});
console.log('=== PROBE 6 (ProductLineItems removed) ===');
console.log(JSON.stringify(pliProbe, null, 2));

console.log('=== CONSOLE ERRORS ===');
console.log(JSON.stringify(consoleErrs.slice(0, 10), null, 2));
console.log('=== CONSOLE WARNINGS ===');
console.log(JSON.stringify(consoleWarns.slice(0, 6), null, 2));
await browser.close();
