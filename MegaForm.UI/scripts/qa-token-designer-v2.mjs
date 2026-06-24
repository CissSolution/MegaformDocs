// QA v2 — Token Designer popup (B26 wiring + B27 redesign of Razor)
// Seed customHtml FIRST, then switch to HTML tab, then click "Open Token Designer",
// then verify modal structure + image gallery API.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 90000 });
await page.waitForTimeout(9000);

console.log('=== 1. Seed customHtml + force HTML tab ===');
const step1 = await page.evaluate(() => {
  const B = window.MegaFormBuilder;
  if (!B) return { err: 'no Builder' };
  // Seed tokens
  B.state.schema.settings = B.state.schema.settings || {};
  const html = `<section><h1>{{content:brand_name}}</h1><p>{{content:brand_tagline}}</p></section>
<img src="{{content:logo_url}}"/>
<img src="{{content:slider_image_1}}"/>
<img src="{{content:hero_bg}}"/>`;
  B.state.schema.settings.customHtml = html;
  // Force HTML tab via the same selector dom.ts uses
  const link = document.getElementById('mf-tab-link-html');
  if (!link) return { seeded: true, htmlTabExists: false };
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return { seeded: true, htmlTabExists: true, customHtmlLen: html.length };
});
console.log(JSON.stringify(step1, null, 2));
await page.waitForTimeout(2500);

console.log('=== 2. Verify button mounted in HTML tab ===');
const step2 = await page.evaluate(() => {
  const btn = document.getElementById('mf-open-token-designer');
  const editor = document.getElementById('mf-custom-html-editor');
  if (btn) {
    // Re-fire input to ensure parseContentTokenKeys runs
    if (editor) {
      editor.value = window.MegaFormBuilder.state.schema.settings.customHtml;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  return {
    buttonExists: !!btn,
    buttonText: btn?.textContent?.trim(),
    buttonVisible: btn ? (btn.offsetWidth > 0) : false,
    designerLoaded: !!window.MFTokenDesigner,
  };
});
console.log(JSON.stringify(step2, null, 2));
await page.screenshot({ path: join(OUT, 'qa-token-v2-01-html-tab.png'), fullPage: false });

console.log('=== 3. Click button → modal opens ===');
const step3 = await page.evaluate(() => {
  const btn = document.getElementById('mf-open-token-designer');
  if (!btn) {
    // Fallback: invoke programmatically
    if (window.MFTokenDesigner && typeof window.MFTokenDesigner.open === 'function') {
      window.MFTokenDesigner.open();
      return { clicked: 'programmatic-fallback' };
    }
    return { err: 'no button + no designer' };
  }
  btn.click();
  return { clicked: 'button' };
});
console.log(JSON.stringify(step3, null, 2));
await page.waitForTimeout(1500);

console.log('=== 4. Probe modal: tabs + text rows + image rows ===');
const step4 = await page.evaluate(() => {
  const modal = document.getElementById('mf-token-designer-modal');
  if (!modal) return { err: 'modal not present' };
  const tabs = Array.from(modal.querySelectorAll('.mf-token-designer-tab')).map(t => ({
    label: t.textContent.trim().replace(/\s+/g, ' '),
    active: t.classList.contains('active'),
  }));
  const textRows = Array.from(modal.querySelectorAll('[data-pane="text"] .mf-token-row')).map(r => ({
    label: r.querySelector('.mf-token-row-label')?.textContent?.trim(),
    tag: r.querySelector('.mf-token-row-tag')?.textContent?.trim(),
  }));
  // Force image pane visible for counting
  const imgPane = modal.querySelector('[data-pane="image"]');
  const wasHidden = imgPane.style.display === 'none';
  imgPane.style.display = '';
  const imageRows = Array.from(modal.querySelectorAll('[data-pane="image"] .mf-token-row-image')).map(r => ({
    label: r.querySelector('.mf-token-row-label')?.textContent?.trim(),
    hasUpload: !!r.querySelector('.mf-token-image-upload'),
    hasGallery: !!r.querySelector('.mf-token-image-gallery'),
  }));
  if (wasHidden) imgPane.style.display = 'none';
  return {
    badge: modal.querySelector('.mf-token-designer-badge')?.textContent,
    tabs, textRows, imageRows,
  };
});
console.log(JSON.stringify(step4, null, 2));
// Force modal to top + ensure paint
await page.evaluate(() => {
  const m = document.getElementById('mf-token-designer-modal');
  if (m) { m.style.zIndex = '2147483647'; m.style.position = 'fixed'; }
});
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, 'qa-token-v2-02-text-tab.png'), fullPage: false });

console.log('=== 5. Switch to Image tokens tab + screenshot ===');
await page.evaluate(() => {
  const t = Array.from(document.querySelectorAll('.mf-token-designer-tab')).find(x => x.getAttribute('data-tab') === 'image');
  t?.click();
});
await page.waitForTimeout(700);
// Force modal to top before screenshot
await page.evaluate(() => {
  const m = document.getElementById('mf-token-designer-modal');
  if (m) m.style.zIndex = '2147483647';
});
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, 'qa-token-v2-03-image-tab.png'), fullPage: false });

console.log('=== 6. Edit a text token + check schema sync ===');
const step6 = await page.evaluate(() => {
  const t = Array.from(document.querySelectorAll('.mf-token-designer-tab')).find(x => x.getAttribute('data-tab') === 'text');
  t?.click();
  const ta = document.querySelector('[data-pane="text"] .mf-token-row-input');
  if (!ta) return { err: 'no text textarea' };
  ta.value = 'MegaForm Inc.';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  // Schema sync check
  const cc = window.MegaFormBuilder.state.schema.settings.customContent || {};
  return {
    edited: 'MegaForm Inc.',
    schemaBrandName: cc.brand_name,
    dirty: window.MegaFormBuilder.state.isDirty,
  };
});
console.log(JSON.stringify(step6, null, 2));

console.log('=== 7. Open Gallery overlay ===');
await page.evaluate(() => {
  const t = Array.from(document.querySelectorAll('.mf-token-designer-tab')).find(x => x.getAttribute('data-tab') === 'image');
  t?.click();
});
await page.waitForTimeout(500);
const step7 = await page.evaluate(() => {
  const gal = document.querySelector('[data-pane="image"] .mf-token-image-gallery');
  if (!gal) return { err: 'no gallery btn in image pane' };
  gal.click();
  return { clicked: true };
});
console.log(JSON.stringify(step7, null, 2));
await page.waitForTimeout(2500);
const step7b = await page.evaluate(() => {
  const overlay = document.getElementById('mf-token-gallery-overlay');
  if (!overlay) return { err: 'no overlay' };
  return {
    overlayInDom: true,
    title: overlay.querySelector('.mf-token-gallery-title')?.textContent,
    cardCount: overlay.querySelectorAll('.mf-token-gallery-card').length,
    loadingHidden: !overlay.querySelector('.mf-token-gallery-loading'),
    empty: !!overlay.querySelector('.mf-token-designer-empty'),
    emptyText: overlay.querySelector('.mf-token-designer-empty')?.textContent?.slice(0, 80),
  };
});
console.log(JSON.stringify(step7b, null, 2));
await page.screenshot({ path: join(OUT, 'qa-token-v2-04-gallery.png'), fullPage: false });

console.log('=== 8. Form-strings tab ===');
await page.evaluate(() => {
  const overlay = document.getElementById('mf-token-gallery-overlay');
  if (overlay) overlay.remove();
  const t = Array.from(document.querySelectorAll('.mf-token-designer-tab')).find(x => x.getAttribute('data-tab') === 'form');
  t?.click();
});
await page.waitForTimeout(400);
const step8 = await page.evaluate(() => {
  return {
    formRowCount: document.querySelectorAll('[data-pane="form"] .mf-token-row').length,
    formLabels: Array.from(document.querySelectorAll('[data-pane="form"] .mf-token-row-label')).map(x => x.textContent.trim()),
  };
});
console.log(JSON.stringify(step8, null, 2));
await page.screenshot({ path: join(OUT, 'qa-token-v2-05-form-strings.png'), fullPage: false });

console.log('=== ERRORS ===');
console.log(JSON.stringify(errs.slice(0, 5), null, 2));
await browser.close();
