// Comprehensive B58 visual QA: verify every claim from the morning handoff via Playwright.
// Runs against http://dnn10322_megaf.ai with host/dnnhost.
// Writes qa-out/b58-probe.json + screenshots.

import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const ROOT = 'http://dnn10322_megaf.ai';
const OUT_DIR = path.join(process.cwd(), 'qa-out');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  steps: {},
  consoleErrors: [],
  pageErrors: [],
  failingClaims: []
};

function fail(claim, why) {
  report.failingClaims.push({ claim, why });
}

function logStep(name, data) {
  report.steps[name] = data;
  try { console.log('=== STEP', name, '===\n' + JSON.stringify(data, null, 2).slice(0, 4000)); } catch (_) {}
}

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('console', m => {
  if (m.type() === 'error') {
    const t = m.text();
    // dedupe noisy repeat strings but keep first 200
    if (report.consoleErrors.length < 200) report.consoleErrors.push(t);
  }
});
page.on('pageerror', e => { report.pageErrors.push(String(e && e.message || e)); });

// --- LOGIN ---
try {
  await page.goto(ROOT + '/Login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
  await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
  await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
  await page.waitForTimeout(5000);
  logStep('login', { url: page.url(), title: await page.title() });
} catch (e) {
  fail('login', 'Login flow threw: ' + (e && e.message));
}

// =====================================================
// STEP 2 — FORM 335 RUNTIME, PHONE WIDGET
// =====================================================
try {
  await page.goto(ROOT + '/xx?formid=335&_=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: path.join(OUT_DIR, 'b58-01-form335-runtime.png'), fullPage: true });

  const phoneProbe = await page.evaluate(() => {
    const shells = Array.from(document.querySelectorAll('.mfp-phone-shell'));
    const anyPhoneClass = Array.from(document.querySelectorAll('[class*="phone"]'));
    let firstHtml = '';
    let firstInputVisible = false;
    let firstHasCountryBtn = false;
    let firstShellRect = null;
    if (shells.length) {
      const s = shells[0];
      firstHtml = (s.outerHTML || '').slice(0, 2000);
      const inp = s.querySelector('input');
      firstInputVisible = !!(inp && inp.offsetWidth > 0 && inp.offsetHeight > 0);
      firstHasCountryBtn = !!s.querySelector('.mfp-country-btn, [class*="country"], button');
      const r = s.getBoundingClientRect();
      firstShellRect = { w: r.width, h: r.height, x: r.x, y: r.y };
    }
    return {
      shellCount: shells.length,
      phoneAnyCount: anyPhoneClass.length,
      firstHtml,
      firstInputVisible,
      firstHasCountryBtn,
      firstShellRect,
      sampleClasses: anyPhoneClass.slice(0, 5).map(e => e.className)
    };
  });

  // Try click first phone country dropdown if present
  let dropdownOpens = null;
  if (phoneProbe.shellCount > 0) {
    try {
      await page.locator('.mfp-phone-shell').first().scrollIntoViewIfNeeded();
      const btn = page.locator('.mfp-phone-shell .mfp-country-btn, .mfp-phone-shell button').first();
      if (await btn.count()) {
        await btn.click({ timeout: 3000 });
        await page.waitForTimeout(800);
        dropdownOpens = await page.evaluate(() => {
          const dd = document.querySelector('.mfp-country-dropdown.open, .mfp-country-list, [class*="country-dropdown"]');
          return dd ? { found: true, visible: dd.offsetWidth > 0 && dd.offsetHeight > 0, html: (dd.outerHTML || '').slice(0, 500) } : { found: false };
        });
      } else {
        dropdownOpens = { found: false, reason: 'no country btn' };
      }
    } catch (e) {
      dropdownOpens = { error: e.message };
    }
  }

  logStep('phone-form335', { ...phoneProbe, dropdownOpens });

  if (phoneProbe.shellCount === 0) fail('Phone widget shell .mfp-phone-shell present on form 335', 'No element with class .mfp-phone-shell found on form 335 runtime');
  else {
    if (!phoneProbe.firstInputVisible) fail('Phone widget input is visible', 'Inner input found but not visible (offsetWidth/Height 0)');
    if (!phoneProbe.firstHasCountryBtn) fail('Phone widget country selector button exists', 'No country button found inside .mfp-phone-shell');
    if (dropdownOpens && dropdownOpens.found === false) fail('Phone country dropdown opens on click', 'Click on country btn did not reveal dropdown');
  }
} catch (e) {
  fail('Form 335 runtime probe', 'Threw: ' + e.message);
  report.steps.phoneError = e.message;
}

// =====================================================
// STEP 3 — DASHBOARD: form cards + NEW Report button
// =====================================================
try {
  await page.goto(ROOT + '/Dashboard?_=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(7000);
  await page.screenshot({ path: path.join(OUT_DIR, 'b58-02-dashboard.png'), fullPage: true });

  const dash = await page.evaluate(() => {
    // try multiple selectors for form cards
    const cardSelectors = ['.mf-dash-form-card', '.mf-form-card', '[class*="form-card"]', '.mf-dashboard-form', '.mf-dash-card'];
    let cards = [];
    let selUsed = '';
    for (const sel of cardSelectors) {
      const found = Array.from(document.querySelectorAll(sel));
      if (found.length > cards.length) { cards = found; selUsed = sel; }
    }
    const firstCard = cards[0];
    let firstCardActionsHtml = '';
    let buttonsInFirstCard = [];
    let reportButtonGlobal = false;
    if (firstCard) {
      // find action button group within card
      const actionsGroup = firstCard.querySelector('.mf-form-card-actions, .mf-card-actions, .actions, [class*="action"]');
      firstCardActionsHtml = actionsGroup ? (actionsGroup.outerHTML || '').slice(0, 1500) : (firstCard.outerHTML || '').slice(0, 1500);
      const btns = firstCard.querySelectorAll('button, a.btn, .mf-btn');
      buttonsInFirstCard = Array.from(btns).map(b => ({
        text: (b.textContent || '').trim().slice(0, 40),
        title: b.getAttribute('title') || '',
        cls: b.className || ''
      }));
    }
    // Look for any Report button on page text
    reportButtonGlobal = !!Array.from(document.querySelectorAll('button, a')).find(el => /report/i.test(el.textContent || '') || /report/i.test(el.getAttribute('title') || ''));

    return {
      cardCount: cards.length,
      selectorUsed: selUsed,
      firstCardActionsHtml,
      buttonsInFirstCard,
      reportButtonGlobal,
      // also dump any toolbar buttons globally
      globalToolbarButtons: Array.from(document.querySelectorAll('.mf-dashboard-toolbar button, header button, [class*="toolbar"] button')).map(b => (b.textContent || '').trim().slice(0, 30)).slice(0, 30)
    };
  });
  logStep('dashboard', dash);

  if (dash.cardCount === 0) fail('Dashboard shows form cards', 'No form-card elements found on /Dashboard');
  const hasReport = dash.buttonsInFirstCard.some(b => /report/i.test(b.text) || /report/i.test(b.title) || /report/i.test(b.cls));
  if (!hasReport) fail('Dashboard form card has NEW Report button', 'No button containing "Report" found inside first form-card action group');
} catch (e) {
  fail('Dashboard probe', 'Threw: ' + e.message);
}

// =====================================================
// STEP 4 — RAZOR FORM 339 BUILDER + THEME LEFT RAIL TABS
// =====================================================
async function openBuilder(formId, screenshotPrefix) {
  await page.goto(ROOT + '/xx?formid=' + formId + '&_=' + Date.now() + '#mf-builder', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: path.join(OUT_DIR, screenshotPrefix + '-builder.png'), fullPage: true });
}

try {
  await openBuilder(339, 'b58-03-form339');

  // Click THEME tab
  const themeClicked = await page.evaluate(() => {
    const selectors = ['#mf-tab-link-theme', '.mf-right-tab[data-tab="theme"]', 'button[data-tab="theme"]', '[data-tab-id="theme"]'];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) { el.click(); return { selector: s, ok: true }; }
    }
    // try by text
    const candidates = Array.from(document.querySelectorAll('button, a, .mf-tab, .mf-right-tab'));
    const txt = candidates.find(e => /^\s*theme\s*$/i.test((e.textContent || '').trim()));
    if (txt) { txt.click(); return { selector: 'by-text', ok: true }; }
    return { ok: false };
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT_DIR, 'b58-04-form339-theme-active.png'), fullPage: true });

  const leftRail = await page.evaluate(() => {
    const candidates = ['.mf-builder-left-rail', '.mf-left-rail', '.mf-builder-left', '.mf-builder-sidebar', '[class*="left-rail"]', '#mf-builder-left'];
    let rail = null;
    let selUsed = '';
    for (const s of candidates) { const e = document.querySelector(s); if (e) { rail = e; selUsed = s; break; } }
    if (!rail) {
      // fall back: any element with IMAGES/FONTS/INSPECT/STRUCTURE text
      const all = Array.from(document.querySelectorAll('*'));
      const tabs = all.filter(e => /IMAGES|FONTS|INSPECT|STRUCTURE/i.test(e.textContent || '')).filter(e => e.children.length < 10);
      return {
        railFound: false,
        fallbackTabsHits: tabs.length,
        sampleHTML: tabs.slice(0, 3).map(e => (e.outerHTML || '').slice(0, 300))
      };
    }
    const tabBtns = Array.from(rail.querySelectorAll('button, .mf-tab, [class*="tab"]'));
    return {
      railFound: true,
      selectorUsed: selUsed,
      innerHtmlSnippet: (rail.innerHTML || '').slice(0, 4000),
      visibleWidth: rail.getBoundingClientRect().width,
      tabTexts: tabBtns.map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 30),
      hasImages: /images/i.test(rail.textContent || ''),
      hasFonts: /fonts/i.test(rail.textContent || ''),
      hasInspect: /inspect/i.test(rail.textContent || ''),
      hasStructure: /structure/i.test(rail.textContent || '')
    };
  });
  logStep('form339-theme-left-rail', { themeClicked, ...leftRail });

  if (!themeClicked.ok) fail('THEME tab is clickable in form 339 builder', 'No element matched #mf-tab-link-theme or by-text "Theme"');
  if (!leftRail.railFound) fail('Left rail container is rendered', 'Could not locate .mf-builder-left-rail / .mf-left-rail / similar');
  else {
    const expected = ['hasImages', 'hasFonts', 'hasInspect', 'hasStructure'];
    const missing = expected.filter(k => !leftRail[k]);
    if (missing.length) fail('Left rail shows IMAGES/FONTS/INSPECT/STRUCTURE when THEME is active', 'Missing words in left rail innerText: ' + missing.join(', '));
  }

  // probe right rail / canvas iframe after clicking a preset
  const rightPresetProbe = await page.evaluate(() => {
    const presets = Array.from(document.querySelectorAll('.mf-theme-preset, [data-preset], .mf-preset-tile, [class*="preset"]'));
    return { presetCount: presets.length, sample: presets.slice(0, 5).map(p => ({ cls: p.className, txt: (p.textContent || '').trim().slice(0, 30) })) };
  });
  logStep('form339-presets-found', rightPresetProbe);

  // try click first preset
  let presetEffect = null;
  if (rightPresetProbe.presetCount) {
    try {
      const before = await page.evaluate(() => {
        const f = document.querySelector('iframe.mf-theme-preview-frame, iframe#mf-builder-preview-frame, iframe[class*="preview"]');
        return f ? (f.contentDocument && f.contentDocument.body ? (f.contentDocument.body.innerHTML || '').length : -1) : -2;
      });
      await page.locator('.mf-theme-preset, [data-preset], .mf-preset-tile, [class*="preset"]').first().click({ force: true, timeout: 3000 });
      await page.waitForTimeout(2500);
      const after = await page.evaluate(() => {
        const f = document.querySelector('iframe.mf-theme-preview-frame, iframe#mf-builder-preview-frame, iframe[class*="preview"]');
        return f ? (f.contentDocument && f.contentDocument.body ? (f.contentDocument.body.innerHTML || '').length : -1) : -2;
      });
      presetEffect = { iframeBodyLenBefore: before, iframeBodyLenAfter: after, changed: before !== after };
    } catch (e) { presetEffect = { error: e.message }; }
  }
  logStep('form339-preset-click', presetEffect);
  if (rightPresetProbe.presetCount === 0) fail('Theme presets exist in right rail', 'No .mf-theme-preset / .mf-preset-tile / [data-preset] elements found');
  else if (presetEffect && presetEffect.changed === false) fail('Clicking preset changes canvas iframe content', 'iframe body innerHTML length identical before/after preset click');
} catch (e) {
  fail('Form 339 builder THEME probe', 'Threw: ' + e.message);
}

// =====================================================
// STEP 4b — STILL ON FORM 339 — RAZOR WIDGET CARD BUTTONS
// =====================================================
try {
  // Switch to DESIGNER/FIELDS tab so widget cards are listed
  await page.evaluate(() => {
    const ids = ['#mf-tab-link-fields', '#mf-tab-link-designer', '[data-tab="fields"]', '[data-tab="designer"]'];
    for (const s of ids) { const e = document.querySelector(s); if (e) { e.click(); return; } }
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT_DIR, 'b58-05-form339-fields-tab.png'), fullPage: true });

  const razorCard = await page.evaluate(() => {
    // find any field card whose type is razor
    const cards = Array.from(document.querySelectorAll('[data-field-type="razor"], [data-type="razor"], .mf-field-card[data-type="razor"], .mf-builder-field[data-type="razor"]'));
    let pick = cards[0];
    if (!pick) {
      // fall back: scan card-like elements containing "razor" word
      const all = Array.from(document.querySelectorAll('.mf-field-card, .mf-builder-field, [class*="field-card"]'));
      pick = all.find(c => /razor/i.test(c.textContent || '') || /razor/i.test(c.getAttribute('data-type') || '')) || null;
    }
    if (!pick) return { found: false, totalCards: document.querySelectorAll('.mf-field-card, .mf-builder-field').length };
    const btns = Array.from(pick.querySelectorAll('button, .mf-btn'));
    return {
      found: true,
      outer: (pick.outerHTML || '').slice(0, 2000),
      buttonCount: btns.length,
      buttonTexts: btns.map(b => ({ t: (b.textContent || '').trim().slice(0, 40), title: b.getAttribute('title') || '', cls: b.className }))
    };
  });
  logStep('form339-razor-card', razorCard);

  if (!razorCard.found) fail('Razor widget card exists in form 339 builder', 'No element with data-type="razor" or text "razor" found in fields tab');
  else if (razorCard.buttonCount !== 1) fail('Razor widget card has exactly 1 action button (B53 hard cutover)', 'Found ' + razorCard.buttonCount + ' buttons: ' + JSON.stringify(razorCard.buttonTexts));
} catch (e) {
  fail('Form 339 Razor widget card probe', 'Threw: ' + e.message);
}

// =====================================================
// STEP 5 — DYNAMICLABEL FORM 266 BUILDER, COUNT BUTTONS
// =====================================================
try {
  await openBuilder(266, 'b58-06-form266');
  // ensure fields/designer tab active
  await page.evaluate(() => {
    const ids = ['#mf-tab-link-fields', '#mf-tab-link-designer', '[data-tab="fields"]', '[data-tab="designer"]'];
    for (const s of ids) { const e = document.querySelector(s); if (e) { e.click(); return; } }
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT_DIR, 'b58-07-form266-fields-tab.png'), fullPage: true });

  const dlCard = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-field-type="dynamiclabel"], [data-type="dynamiclabel"], [data-type="dynamic-label"], [data-type="dynamicLabel"]'));
    let pick = cards[0];
    if (!pick) {
      const all = Array.from(document.querySelectorAll('.mf-field-card, .mf-builder-field, [class*="field-card"]'));
      pick = all.find(c => /dynamiclabel|dynamic\s*label/i.test(c.textContent || '') || /dynamiclabel/i.test(c.getAttribute('data-type') || '')) || null;
    }
    if (!pick) return { found: false, totalCards: document.querySelectorAll('.mf-field-card, .mf-builder-field').length };
    const btns = Array.from(pick.querySelectorAll('button, .mf-btn'));
    return {
      found: true,
      outer: (pick.outerHTML || '').slice(0, 2000),
      buttonCount: btns.length,
      buttonTexts: btns.map(b => ({ t: (b.textContent || '').trim().slice(0, 40), title: b.getAttribute('title') || '', cls: b.className }))
    };
  });
  logStep('form266-dl-card', dlCard);

  if (!dlCard.found) fail('DynamicLabel widget card exists in form 266 builder', 'No element with data-type="dynamiclabel" found');
  else if (dlCard.buttonCount !== 1) fail('DynamicLabel widget card has exactly 1 action button', 'Found ' + dlCard.buttonCount + ' buttons: ' + JSON.stringify(dlCard.buttonTexts));
} catch (e) {
  fail('Form 266 DynamicLabel probe', 'Threw: ' + e.message);
}

// =====================================================
// STEP 7 — Builder palette: MultiColumnCombo tile
// =====================================================
try {
  // back to form 339 builder, open palette
  await openBuilder(339, 'b58-08-form339-palette');
  // open palette button if collapsed
  await page.evaluate(() => {
    const triggers = ['#mf-add-field-btn', '.mf-palette-toggle', '[data-action="open-palette"]', 'button.mf-add-field'];
    for (const s of triggers) { const e = document.querySelector(s); if (e) { e.click(); return; } }
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT_DIR, 'b58-09-form339-palette-open.png'), fullPage: true });

  const palette = await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('.mf-palette-tile, .mf-field-tile, [data-palette-type], [class*="palette-tile"]'));
    const mcc = tiles.find(t => /multicolumncombo|multi.column.combo|multi-col-combo/i.test((t.textContent || '') + ' ' + (t.getAttribute('data-palette-type') || '') + ' ' + (t.getAttribute('data-type') || '')));
    const allTexts = tiles.map(t => ({ txt: (t.textContent || '').trim().slice(0, 30), type: t.getAttribute('data-palette-type') || t.getAttribute('data-type') || '' })).slice(0, 60);
    let categoryOfMcc = null;
    if (mcc) {
      // walk up to find category header
      let cur = mcc.parentElement;
      while (cur && cur !== document.body) {
        const cat = cur.querySelector(':scope > .mf-palette-category-title, :scope > h3, :scope > .mf-category-title');
        if (cat) { categoryOfMcc = (cat.textContent || '').trim(); break; }
        const cls = cur.className || '';
        if (/category|group/i.test(cls)) { categoryOfMcc = (cur.getAttribute('data-category') || cur.textContent || '').trim().slice(0, 60); break; }
        cur = cur.parentElement;
      }
    }
    return {
      tileCount: tiles.length,
      mccFound: !!mcc,
      mccOuter: mcc ? (mcc.outerHTML || '').slice(0, 800) : '',
      mccCategory: categoryOfMcc,
      allTexts
    };
  });
  logStep('builder-palette', palette);

  if (palette.tileCount === 0) fail('Builder palette is visible with tiles', 'No .mf-palette-tile / .mf-field-tile elements found');
  if (!palette.mccFound) fail('MultiColumnCombo tile visible in palette', 'No tile matched /multicolumncombo|multi-col-combo/');
} catch (e) {
  fail('Builder palette probe', 'Threw: ' + e.message);
}

// =====================================================
// STEP 8 — APPOINTMENT field properties: variant / mode / timeFormat
// =====================================================
try {
  // form 335 has Appointment widget per memory; if not present in fields, fall back
  await openBuilder(335, 'b58-10-form335-builder');
  await page.evaluate(() => {
    const ids = ['#mf-tab-link-fields', '#mf-tab-link-designer', '[data-tab="fields"]', '[data-tab="designer"]'];
    for (const s of ids) { const e = document.querySelector(s); if (e) { e.click(); return; } }
  });
  await page.waitForTimeout(2500);

  // Find appointment field card and click it
  const clicked = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-type="appointment"], [data-field-type="appointment"]'));
    let pick = cards[0];
    if (!pick) {
      const all = Array.from(document.querySelectorAll('.mf-field-card, .mf-builder-field'));
      pick = all.find(c => /appointment/i.test(c.textContent || '')) || null;
    }
    if (!pick) return { ok: false, totalCards: document.querySelectorAll('.mf-field-card').length };
    pick.click();
    return { ok: true, outer: (pick.outerHTML || '').slice(0, 600) };
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT_DIR, 'b58-11-form335-appt-selected.png'), fullPage: true });

  const propsPanel = await page.evaluate(() => {
    const panel = document.querySelector('.mf-field-properties, .mf-properties-panel, .mf-builder-right, #mf-properties-panel, [class*="properties-panel"]');
    if (!panel) return { found: false };
    const txt = panel.textContent || '';
    return {
      found: true,
      hasVariant: /variant/i.test(txt),
      hasColumns: /columns/i.test(txt),
      hasCalendar: /calendar/i.test(txt),
      hasMode: /\bmode\b/i.test(txt),
      hasTimeFormat: /timeformat|time format/i.test(txt),
      snippet: (panel.innerHTML || '').slice(0, 3000)
    };
  });
  logStep('form335-appointment-props', { clicked, propsPanel });

  if (!clicked.ok) fail('Appointment field card exists in form 335 builder', 'No card with data-type="appointment" or text "Appointment" found');
  else if (!propsPanel.found) fail('Field properties panel renders for selected field', 'No properties panel element matched');
  else {
    if (!propsPanel.hasVariant) fail('Appointment field properties expose variant prop', 'Properties panel has no "variant" text');
    if (!(propsPanel.hasColumns && propsPanel.hasCalendar)) fail('Appointment variant offers columns + calendar options', 'Missing "columns" or "calendar" labels in properties panel');
  }
} catch (e) {
  fail('Appointment field props probe', 'Threw: ' + e.message);
}

// =====================================================
// STEP 9 — Unified Designer modal + AI sparkle button
// =====================================================
try {
  // go back to form 339 (has Razor widget) and open unified designer
  await openBuilder(339, 'b58-12-form339-for-designer');
  await page.evaluate(() => {
    const ids = ['#mf-tab-link-fields', '#mf-tab-link-designer', '[data-tab="fields"]', '[data-tab="designer"]'];
    for (const s of ids) { const e = document.querySelector(s); if (e) { e.click(); return; } }
  });
  await page.waitForTimeout(2000);

  const designerOpened = await page.evaluate(() => {
    // find Razor widget card and click its single action button (Open Unified Designer)
    const all = Array.from(document.querySelectorAll('.mf-field-card, .mf-builder-field, [data-type="razor"]'));
    const card = all.find(c => /razor/i.test(c.textContent || '') || /razor/i.test(c.getAttribute('data-type') || ''));
    if (!card) return { ok: false, why: 'no razor card' };
    const btn = card.querySelector('button, .mf-btn');
    if (!btn) return { ok: false, why: 'no button' };
    btn.click();
    return { ok: true, btnText: (btn.textContent || '').trim() };
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT_DIR, 'b58-13-unified-designer.png'), fullPage: true });

  const modalProbe = await page.evaluate(() => {
    const modal = document.querySelector('.mf-unified-designer, .mf-widget-designer-shell, .mf-designer-modal, [class*="unified-designer"], [class*="designer-shell"]');
    if (!modal) return { found: false };
    // look for AI sparkle button
    const sparkleSelectors = ['.mf-ai-toggle', '.mf-ai-sparkle', '[data-action="toggle-ai"]', 'button[title*="AI"]', 'button[aria-label*="AI"]', 'button[class*="sparkle"]'];
    let sparkle = null;
    let selUsed = '';
    for (const s of sparkleSelectors) { const e = modal.querySelector(s); if (e) { sparkle = e; selUsed = s; break; } }
    if (!sparkle) {
      // fall back: scan buttons by content
      const btns = Array.from(modal.querySelectorAll('button'));
      sparkle = btns.find(b => /✨|sparkle|ai\b/i.test((b.textContent || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.getAttribute('aria-label') || ''))) || null;
      if (sparkle) selUsed = 'text-scan';
    }
    let drawerSlides = null;
    if (sparkle) {
      const beforeOpen = !!modal.querySelector('.mf-ai-drawer.open, [class*="ai-drawer"][class*="open"], .mf-ai-panel.open');
      sparkle.click();
      // mark to check after delay
      window.__sparkleClickedAt = Date.now();
      drawerSlides = { beforeOpen, clicked: true };
    }
    return {
      found: true,
      modalRect: (() => { const r = modal.getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, y: r.y }; })(),
      sparkleFound: !!sparkle,
      sparkleSelector: selUsed,
      sparkleOuter: sparkle ? (sparkle.outerHTML || '').slice(0, 400) : '',
      drawerSlides
    };
  });
  await page.waitForTimeout(1500);
  const drawerAfter = await page.evaluate(() => {
    const drawer = document.querySelector('.mf-ai-drawer, .mf-ai-panel, [class*="ai-drawer"], [class*="ai-panel"]');
    if (!drawer) return { drawerEl: false };
    const r = drawer.getBoundingClientRect();
    return {
      drawerEl: true,
      hasOpenClass: /\bopen\b/.test(drawer.className || ''),
      visibleWidth: r.width,
      visibleRight: r.right,
      offRight: r.right <= 0 || r.left >= window.innerWidth,
      cls: drawer.className
    };
  });
  logStep('unified-designer-modal', { designerOpened, modalProbe, drawerAfter });

  if (!designerOpened.ok) fail('Razor widget card opens Unified Designer modal', 'Could not click button on Razor card: ' + (designerOpened.why || ''));
  if (!modalProbe.found) fail('Unified Designer modal renders', 'No element with class .mf-unified-designer / .mf-widget-designer-shell found');
  else {
    if (!modalProbe.sparkleFound) fail('AI sparkle toggle button visible top-right of Unified Designer', 'No sparkle/ai button found inside modal');
    else if (!drawerAfter.drawerEl) fail('AI drawer panel exists in DOM', 'After clicking sparkle, no .mf-ai-drawer / .mf-ai-panel found');
    else if (drawerAfter.offRight || drawerAfter.visibleWidth === 0) fail('AI drawer slides out (visible) on sparkle click', 'Drawer present but off-screen: ' + JSON.stringify(drawerAfter));
  }
} catch (e) {
  fail('Unified Designer modal probe', 'Threw: ' + e.message);
}

// =====================================================
// FINAL WRITE
// =====================================================
report.finishedAt = new Date().toISOString();
report.consoleErrorCount = report.consoleErrors.length;
report.pageErrorCount = report.pageErrors.length;

fs.writeFileSync(path.join(OUT_DIR, 'b58-probe.json'), JSON.stringify(report, null, 2));
console.log('=== FINAL REPORT WRITTEN ===');
console.log('failingClaims count:', report.failingClaims.length);
console.log(JSON.stringify(report.failingClaims, null, 2));
console.log('=== CONSOLE ERRORS (' + report.consoleErrors.length + ') ===');
report.consoleErrors.slice(0, 30).forEach((e, i) => console.log(i, e.slice(0, 200)));
console.log('=== PAGE ERRORS (' + report.pageErrors.length + ') ===');
report.pageErrors.slice(0, 10).forEach((e, i) => console.log(i, e.slice(0, 200)));

await browser.close();
