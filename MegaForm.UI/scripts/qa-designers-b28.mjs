// [B28 QA] Three designers + ProductLineItems removed.
// Token Designer already passed in B26 — re-verify quickly.
// Slider Designer: add a ContentSlider field, open designer, verify style cards, slides tab, settings tab.
// ImageChoice Designer: add an ImageChoice field, open designer, verify card-style picker, options tab, settings tab.
// Palette: ProductLineItems must NOT be present; ImageChoice must STILL be present.
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

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

try { await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(7000);

// PROBE A — palette: ProductLineItems gone, ImageChoice present
const paletteProbe = await page.evaluate(() => {
  const widgetsTab = document.querySelector('.mf-palette-tab[data-tab="widgets"], [data-palette-tab="widgets"]');
  if (widgetsTab) widgetsTab.click();
  // Look at the entire palette HTML for the two widget cards
  const palette = document.querySelector('.mf-palette, #mf-palette, .mf-builder-left, [data-mf-palette]') || document.body;
  const html = palette ? palette.innerHTML : document.body.innerHTML;
  return {
    hasProductLineItems: /ProductLineItems|product-line-items|Product Line/i.test(html),
    hasImageChoice: /ImageChoice|image-choice|Image Choice/i.test(html),
    hasContentSlider: /ContentSlider|content-slider|Content Slider/i.test(html),
    pluginNames: Object.keys((window.MegaFormWidgets && window.MegaFormWidgets._registry) || {}).sort(),
  };
});
console.log('=== PROBE A (palette) ===');
console.log(JSON.stringify(paletteProbe, null, 2));

// PROBE B — Slider Designer
const sliderProbe = await page.evaluate(async () => {
  const B = window.MegaFormBuilder;
  if (!B) return { error: 'no MegaFormBuilder' };
  // Inject a ContentSlider field programmatically + select it
  const fields = B.state.schema.fields || (B.state.schema.fields = []);
  fields.push({
    type: 'ContentSlider',
    key: 'qa_slider',
    label: 'QA Slider',
    widgetProps: {
      style: 'cards',
      items: [
        { imageUrl: '', title: 'A', description: '', badge: '', meta: '' },
        { imageUrl: '', title: 'B', description: '', badge: '', meta: '' }
      ]
    }
  });
  const idx = fields.length - 1;
  B.state.selectedFieldIndex = idx;
  if (B.callModule) {
    B.callModule('canvas', 'render');
    B.callModule('properties', 'renderProperties', fields[idx]);
  }
  await new Promise(r => setTimeout(r, 600));
  const btn = document.getElementById('mf-open-slider-designer');
  if (!btn) return { hasBtn: false };
  btn.click();
  await new Promise(r => setTimeout(r, 500));
  const modal = document.getElementById('mf-slider-designer-modal');
  if (!modal) return { hasBtn: true, modalOpened: false };
  const styleCards = modal.querySelectorAll('.mf-slider-designer-style-card');
  return {
    hasBtn: true,
    modalOpened: true,
    styleCardCount: styleCards.length,
    styleLabels: Array.from(styleCards).map(c => (c.querySelector('.mf-slider-designer-style-label')?.textContent || '').trim()),
    activeStyle: (modal.querySelector('.mf-slider-designer-style-card.is-active .mf-slider-designer-style-label')?.textContent || '').trim(),
    tabCount: modal.querySelectorAll('.mf-token-designer-tab').length,
    countBadge: (modal.querySelector('#mf-slider-designer-count')?.textContent || '').trim()
  };
});
console.log('=== PROBE B (Slider Designer) ===');
console.log(JSON.stringify(sliderProbe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-designers-b28-slider.png'), fullPage: false });

// PROBE C — Slider Designer Slides tab + style change
const sliderSlidesProbe = await page.evaluate(async () => {
  const modal = document.getElementById('mf-slider-designer-modal');
  if (!modal) return { error: 'modal gone' };
  // Switch style to 'fade' first
  const cards = modal.querySelectorAll('.mf-slider-designer-style-card');
  if (cards[1]) cards[1].click();
  const styleSet = window.MegaFormBuilder.state.schema.fields[window.MegaFormBuilder.state.selectedFieldIndex].widgetProps.style;
  // Switch to Slides tab
  modal.querySelector('.mf-token-designer-tab[data-tab="slides"]').click();
  await new Promise(r => setTimeout(r, 200));
  const slidesPane = modal.querySelector('[data-pane="slides"]');
  const rows = slidesPane.querySelectorAll('.mf-slider-designer-row');
  return {
    styleAfterClick: styleSet,
    slideRowCount: rows.length,
    firstRowHasUpload: !!rows[0]?.querySelector('.mf-slider-designer-upload'),
    firstRowHasGallery: !!rows[0]?.querySelector('.mf-slider-designer-gallery'),
    firstRowHasUrlInput: !!rows[0]?.querySelector('.mf-slider-designer-url'),
    firstRowHasTitleInput: !!rows[0]?.querySelector('.mf-slider-designer-title'),
    hasAddBtn: !!slidesPane.querySelector('.mf-slider-designer-add')
  };
});
console.log('=== PROBE C (Slider Slides + style change) ===');
console.log(JSON.stringify(sliderSlidesProbe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-designers-b28-slider-slides.png'), fullPage: false });

// Close slider modal
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// PROBE D — ImageChoice Designer
const icProbe = await page.evaluate(async () => {
  const B = window.MegaFormBuilder;
  if (!B) return { error: 'no MegaFormBuilder' };
  const fields = B.state.schema.fields;
  fields.push({
    type: 'ImageChoice',
    key: 'qa_imgchoice',
    label: 'QA ImgChoice',
    options: [
      { value: 'a', label: 'Option A', image: '' },
      { value: 'b', label: 'Option B', image: '' }
    ],
    widgetProps: { columns: 3, multiSelect: false, cardStyle: 'bordered', selectedColor: '#4f46e5' }
  });
  const idx = fields.length - 1;
  B.state.selectedFieldIndex = idx;
  B.callModule('canvas', 'render');
  B.callModule('properties', 'renderProperties', fields[idx]);
  await new Promise(r => setTimeout(r, 600));
  const btn = document.getElementById('mf-open-ic-designer');
  if (!btn) return { hasBtn: false };
  btn.click();
  await new Promise(r => setTimeout(r, 500));
  const modal = document.getElementById('mf-ic-designer-modal');
  if (!modal) return { hasBtn: true, modalOpened: false };
  const styleCards = modal.querySelectorAll('.mf-slider-designer-style-card');
  return {
    hasBtn: true,
    modalOpened: true,
    styleCardCount: styleCards.length,
    styleLabels: Array.from(styleCards).map(c => (c.querySelector('.mf-slider-designer-style-label')?.textContent || '').trim()),
    countBadge: (modal.querySelector('#mf-ic-designer-count')?.textContent || '').trim(),
    tabCount: modal.querySelectorAll('.mf-token-designer-tab').length
  };
});
console.log('=== PROBE D (ImageChoice Designer) ===');
console.log(JSON.stringify(icProbe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-designers-b28-imagechoice.png'), fullPage: false });

// PROBE E — ImageChoice Options tab
const icOptionsProbe = await page.evaluate(async () => {
  const modal = document.getElementById('mf-ic-designer-modal');
  if (!modal) return { error: 'modal gone' };
  modal.querySelector('.mf-token-designer-tab[data-tab="options"]').click();
  await new Promise(r => setTimeout(r, 200));
  const optsPane = modal.querySelector('[data-pane="options"]');
  const rows = optsPane.querySelectorAll('.mf-slider-designer-row');
  return {
    optionRowCount: rows.length,
    firstRowHasUpload: !!rows[0]?.querySelector('.mf-ic-upload'),
    firstRowHasGallery: !!rows[0]?.querySelector('.mf-ic-gallery'),
    firstRowHasUrl: !!rows[0]?.querySelector('.mf-ic-url'),
    firstRowHasLabel: !!rows[0]?.querySelector('.mf-ic-label'),
    firstRowHasPrice: !!rows[0]?.querySelector('.mf-ic-price'),
    hasAddBtn: !!optsPane.querySelector('.mf-ic-designer-add')
  };
});
console.log('=== PROBE E (ImageChoice Options) ===');
console.log(JSON.stringify(icOptionsProbe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-designers-b28-imagechoice-options.png'), fullPage: false });

// PROBE F — Token Designer still works (regression check)
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const tdProbe = await page.evaluate(() => {
  const td = window.MFTokenDesigner;
  return { tdExists: !!td, hasOpen: !!(td && td.open), hasUploadHelper: !!(td && td.uploadImage), hasGalleryHelper: !!(td && td.openGalleryPicker) };
});
console.log('=== PROBE F (TokenDesigner helpers exposed) ===');
console.log(JSON.stringify(tdProbe, null, 2));

console.log('=== CONSOLE ERRORS ===');
console.log(JSON.stringify(consoleErrs.slice(0, 10), null, 2));
await browser.close();
