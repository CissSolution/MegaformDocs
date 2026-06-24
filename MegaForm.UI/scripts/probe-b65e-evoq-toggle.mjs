// [B65e] Verify Evoq pattern + HTML editor on megatest:
// 1. Open Form Settings popup → After Submit section
// 2. Verify cards: Confirmation Message + Respondent Email + Provide Download + Redirect URL
// 3. Each card has ON/OFF pill toggle
// 4. Confirmation Message card has HTML editor with toolbar
// 5. Clicking toggle changes label On/Off + collapses body
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

await page.goto(SITE + '/xx?mfFormId=1264#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(14000);

// Click Field tab + Form Settings card to open popup
await page.evaluate(() => {
  const fieldTab = document.querySelector('#mf-tab-link-field');
  if (fieldTab) fieldTab.click();
});
await page.waitForTimeout(500);
// Bring viewport to top first
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await page.evaluate(() => {
  const btn = document.querySelector('[data-mf-design-open="settings"]');
  if (btn) btn.click();
});
await page.waitForTimeout(2000);
// Force a paint frame
await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
await page.waitForTimeout(500);

// Check popup state right now
const popupVisible = await page.evaluate(() => {
  const b = document.querySelector('.mf-design-modal-backdrop');
  if (!b) return { backdrop: false };
  const cs = getComputedStyle(b);
  const modal = b.querySelector('.mf-design-modal');
  const mcs = modal ? getComputedStyle(modal) : null;
  return {
    backdrop: true,
    backdropDisplay: cs.display,
    backdropZIndex: cs.zIndex,
    modalDisplay: mcs ? mcs.display : null,
    modalWidth: modal ? Math.round(modal.getBoundingClientRect().width) : 0,
    modalHeight: modal ? Math.round(modal.getBoundingClientRect().height) : 0,
    modalTop: modal ? Math.round(modal.getBoundingClientRect().top) : 0
  };
});
console.log('POPUP STATE: ' + JSON.stringify(popupVisible));

await page.screenshot({ path: 'qa-out/b65e-01-popup-open.png', fullPage: false });

// Scroll into After Submit section
await page.evaluate(() => {
  const sec = document.querySelector('.mf-evoq-group');
  if (sec) sec.scrollIntoView({ block: 'start' });
});
await page.waitForTimeout(800);
await page.screenshot({ path: 'qa-out/b65e-02-after-submit-cards.png', fullPage: false });

const cardsProbe = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.mf-evoq-card[data-mf-evoq-section]'));
  return cards.map(c => {
    const section = c.getAttribute('data-mf-evoq-section');
    const title = (c.querySelector('.mf-evoq-card-title') || {}).textContent || '';
    const toggleInput = c.querySelector('.mf-evoq-toggle-input');
    const toggleLabel = (c.querySelector('.mf-evoq-toggle-label') || {}).textContent || '';
    const checked = toggleInput ? toggleInput.checked : null;
    const hasHtmlEditor = !!c.querySelector('.mf-html-editor');
    const isOff = c.classList.contains('is-off');
    return { section, title: title.trim(), checked, toggleLabel: toggleLabel.trim(), hasHtmlEditor, isOff };
  });
});

// Toggle Confirmation Message OFF
const toggleAfter = await page.evaluate(() => {
  const input = document.querySelector('#mf-setting-confirmation-on');
  if (!input) return null;
  input.click();
  const card = input.closest('.mf-evoq-card');
  const label = (card.querySelector('.mf-evoq-toggle-label') || {}).textContent || '';
  return {
    nowChecked: input.checked,
    isOffAfterToggle: card.classList.contains('is-off'),
    label: label.trim()
  };
});

await page.waitForTimeout(500);
await page.screenshot({ path: 'qa-out/b65e-03-toggled-off.png', fullPage: false });

// Test HTML editor: type Bold text via execCommand
const editorTest = await page.evaluate(() => {
  // Re-enable confirmation
  const input = document.querySelector('#mf-setting-confirmation-on');
  if (input && !input.checked) input.click();
  const area = document.querySelector('.mf-evoq-card[data-mf-evoq-section="confirmation"] .mf-html-editor-area');
  if (!area) return { ok: false };
  area.focus();
  area.innerHTML = 'Thank you for submitting!';
  // Find Bold button and simulate mousedown
  const boldBtn = document.querySelector('.mf-evoq-card[data-mf-evoq-section="confirmation"] [data-mf-html-cmd="bold"]');
  // select all text
  const range = document.createRange();
  range.selectNodeContents(area);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  // execute bold directly
  document.execCommand('bold', false);
  area.dispatchEvent(new Event('input', { bubbles: true }));
  return {
    ok: true,
    areaHtmlAfterBold: area.innerHTML.slice(0, 200),
    hasBoldBtn: !!boldBtn,
    textareaVal: (document.querySelector('#mf-setting-success-msg') || {}).value || ''
  };
});

await browser.close();
console.log(JSON.stringify({ cardsProbe, toggleAfter, editorTest }, null, 2));
