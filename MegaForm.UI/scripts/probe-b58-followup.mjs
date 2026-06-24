// Follow-up probe: builder runs inside iframe(s) on /xx?mfFormId=NNN#mf-builder.
// Need to look at the host page + the inner iframe(s) to find widget cards, palette,
// dashboard form cards, and unified designer.

import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const ROOT = 'http://dnn10322_megaf.ai';
const OUT_DIR = path.join(process.cwd(), 'qa-out');
const report = { startedAt: new Date().toISOString(), steps: {}, consoleErrors: [] };

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error' && report.consoleErrors.length < 100) report.consoleErrors.push(m.text()); });

await page.goto(ROOT + '/Login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(4000);

// =========== DASHBOARD: try many selectors + iframes ===========
await page.goto(ROOT + '/Dashboard?_=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000);
await page.screenshot({ path: path.join(OUT_DIR, 'b58fu-01-dashboard.png'), fullPage: true });

const dashIframes = page.frames();
report.steps.dashFrames = dashIframes.map(f => ({ url: f.url(), name: f.name() }));

// Look across all frames for form-card-ish structures
const dashHits = [];
for (const f of dashIframes) {
  try {
    const probe = await f.evaluate(() => {
      // collect candidate elements with "card" or "form" in class
      const cands = Array.from(document.querySelectorAll('[class*="card"], [class*="form"]')).filter(e => {
        const cls = e.className || '';
        return /form/i.test(cls) && /card/i.test(cls);
      });
      const cardClasses = [...new Set(cands.map(c => c.className))].slice(0, 20);
      // Also dump any obvious 'mf-dash-' elements
      const mfDashClasses = [...new Set(Array.from(document.querySelectorAll('[class*="mf-dash"], [class*="dash-form"]')).map(e => e.className))].slice(0, 20);
      // Look for "Report" button text
      const reportButtons = Array.from(document.querySelectorAll('button, a')).filter(e => /report/i.test(e.textContent || '') || /report/i.test(e.getAttribute('title') || '')).slice(0, 10).map(e => ({ tag: e.tagName, txt: (e.textContent || '').trim().slice(0, 30), cls: e.className }));
      return { cardClasses, mfDashClasses, reportButtons, bodyLen: document.body ? document.body.innerHTML.length : 0 };
    });
    dashHits.push({ frame: f.url(), ...probe });
  } catch (_) {}
}
report.steps.dashboardScan = dashHits;

// look at full main-frame body for ANY 'form' or 'card' classes
const dashTopBody = await page.evaluate(() => {
  const classes = [...new Set(Array.from(document.querySelectorAll('[class]')).map(e => e.className).filter(c => typeof c === 'string').filter(c => /form|card|dash/i.test(c)))];
  return classes.slice(0, 80);
});
report.steps.dashboardTopBodyMatchingClasses = dashTopBody;

// =========== BUILDER form 339: look inside iframe(s) for fields/widget cards ===========
async function gotoBuilder(formId) {
  await page.goto(ROOT + '/xx?mfFormId=' + formId + '&_=' + Date.now() + '#mf-builder', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(13000);
}

await gotoBuilder(339);
await page.screenshot({ path: path.join(OUT_DIR, 'b58fu-02-form339-builder.png'), fullPage: true });

// Enumerate all frames after builder load
const builderFrames = page.frames();
report.steps.builderFrames339 = builderFrames.map(f => ({ url: f.url(), name: f.name() }));

// Scan all frames for: field cards, palette tiles, razor, dynamiclabel
const builderHits = [];
for (const f of builderFrames) {
  try {
    const probe = await f.evaluate(() => {
      const out = {
        url: location.href,
        anyMfBuilder: !!document.querySelector('#mf-builder, .mf-builder'),
        leftRailHits: [...new Set(Array.from(document.querySelectorAll('[class*="left-rail"], [class*="builder-left"], .mf-tlr-section')).map(e => e.className))].slice(0, 15),
        paletteHits: [...new Set(Array.from(document.querySelectorAll('[class*="palette"], [class*="-tile"]')).map(e => e.className))].slice(0, 20),
        fieldCardHits: [...new Set(Array.from(document.querySelectorAll('[class*="field-card"], [class*="builder-field"], [data-field-id], [data-field-type]')).map(e => e.className))].slice(0, 25),
        razorMentions: Array.from(document.querySelectorAll('[data-type*="azor" i], [data-field-type*="azor" i], [class*="razor" i]')).slice(0, 5).map(e => ({ tag: e.tagName, cls: e.className, type: e.getAttribute('data-type') || e.getAttribute('data-field-type') || '' })),
        dlMentions: Array.from(document.querySelectorAll('[data-type*="ynamic" i], [data-field-type*="ynamic" i], [class*="dynamiclabel" i], [class*="dynamic-label" i]')).slice(0, 5).map(e => ({ tag: e.tagName, cls: e.className, type: e.getAttribute('data-type') || e.getAttribute('data-field-type') || '' })),
        multiColMentions: Array.from(document.querySelectorAll('[data-palette-type*="multi" i], [data-type*="multicol" i], [class*="multicol" i]')).slice(0, 5).map(e => ({ tag: e.tagName, cls: e.className })),
        appointmentMentions: Array.from(document.querySelectorAll('[data-type*="appoint" i], [data-field-type*="appoint" i], [class*="appoint" i]')).slice(0, 5).map(e => ({ tag: e.tagName, cls: e.className })),
        unifiedDesignerMentions: [...new Set(Array.from(document.querySelectorAll('[class*="unified-designer"], [class*="designer-shell"], [class*="widget-designer"]')).map(e => e.className))],
        bodyLen: document.body ? document.body.innerHTML.length : 0
      };
      return out;
    });
    builderHits.push(probe);
  } catch (e) { builderHits.push({ url: f.url(), err: e.message }); }
}
report.steps.builder339Scan = builderHits;

// Try clicking the FIELDS tab in the main frame BEFORE scanning fields
const tabClick = await page.evaluate(() => {
  const candidates = ['#mf-tab-link-fields', '#mf-tab-link-designer', '[data-tab="fields"]', '[data-tab="designer"]'];
  for (const s of candidates) { const e = document.querySelector(s); if (e) { e.click(); return { sel: s, ok: true, text: (e.textContent || '').trim() }; } }
  // by text
  const all = Array.from(document.querySelectorAll('button, a, .mf-tab, .mf-right-tab'));
  const t = all.find(e => /^\s*(fields?|designer|builder)\s*$/i.test((e.textContent || '').trim()));
  if (t) { t.click(); return { sel: 'by-text', ok: true, text: (t.textContent || '').trim() }; }
  return { ok: false, allTabs: all.slice(0, 20).map(e => (e.textContent || '').trim().slice(0, 20)) };
});
report.steps.fieldsTabClick = tabClick;
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(OUT_DIR, 'b58fu-03-form339-after-fields-click.png'), fullPage: true });

const afterFieldsClick = await page.evaluate(() => {
  const fc = Array.from(document.querySelectorAll('.mf-field-card, .mf-builder-field, [data-field-type], [data-field-id]'));
  return {
    fieldCardCount: fc.length,
    fieldCardClasses: [...new Set(fc.map(e => e.className))].slice(0, 15),
    fieldCardTypes: [...new Set(fc.map(e => e.getAttribute('data-field-type') || e.getAttribute('data-type') || ''))].slice(0, 20),
    sampleOuter: fc.slice(0, 3).map(e => (e.outerHTML || '').slice(0, 600))
  };
});
report.steps.form339AfterFieldsClick = afterFieldsClick;

// Look for ANY Razor widget on the page (could be runtime mode rather than builder)
const razorOnPage = await page.evaluate(() => {
  return {
    razorElems: Array.from(document.querySelectorAll('[data-type="razor"], [data-field-type="razor"], .mf-razor-widget, [class*="razor"]')).slice(0, 10).map(e => ({ tag: e.tagName, cls: e.className, type: e.getAttribute('data-type') || e.getAttribute('data-field-type') || '' }))
  };
});
report.steps.razorOnPage = razorOnPage;

// ============ form 266 same =============
await gotoBuilder(266);
await page.screenshot({ path: path.join(OUT_DIR, 'b58fu-04-form266-builder.png'), fullPage: true });

const dlFramesScan = [];
for (const f of page.frames()) {
  try {
    const probe = await f.evaluate(() => ({
      url: location.href,
      dlMentions: Array.from(document.querySelectorAll('[data-type*="ynamic" i], [data-field-type*="ynamic" i], [class*="dynamic" i]')).slice(0, 8).map(e => ({ tag: e.tagName, cls: e.className, type: e.getAttribute('data-type') || e.getAttribute('data-field-type') || '' })),
      bodyLen: document.body ? document.body.innerHTML.length : 0
    }));
    dlFramesScan.push(probe);
  } catch (_) {}
}
report.steps.form266Scan = dlFramesScan;

await page.evaluate(() => {
  const ids = ['#mf-tab-link-fields', '#mf-tab-link-designer', '[data-tab="fields"]'];
  for (const s of ids) { const e = document.querySelector(s); if (e) { e.click(); return; } }
});
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(OUT_DIR, 'b58fu-05-form266-fields-clicked.png'), fullPage: true });

const form266AfterClick = await page.evaluate(() => {
  const fc = Array.from(document.querySelectorAll('.mf-field-card, .mf-builder-field, [data-field-type], [data-field-id]'));
  return {
    cardCount: fc.length,
    types: [...new Set(fc.map(e => e.getAttribute('data-field-type') || e.getAttribute('data-type') || ''))],
    dlCard: (() => {
      const dl = fc.find(c => /dynamic/i.test((c.getAttribute('data-field-type') || c.getAttribute('data-type') || '') + ' ' + (c.textContent || '')));
      if (!dl) return null;
      const btns = dl.querySelectorAll('button, .mf-btn');
      return {
        outer: (dl.outerHTML || '').slice(0, 1500),
        btnCount: btns.length,
        btnTexts: Array.from(btns).map(b => ({ t: (b.textContent || '').trim().slice(0, 30), title: b.getAttribute('title') || '' }))
      };
    })()
  };
});
report.steps.form266AfterFieldsClick = form266AfterClick;

// ============ form 335 appointment widget probe in builder ============
await gotoBuilder(335);
await page.evaluate(() => {
  const ids = ['#mf-tab-link-fields', '#mf-tab-link-designer', '[data-tab="fields"]'];
  for (const s of ids) { const e = document.querySelector(s); if (e) { e.click(); return; } }
});
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(OUT_DIR, 'b58fu-06-form335-builder-fields.png'), fullPage: true });

const form335 = await page.evaluate(() => {
  const fc = Array.from(document.querySelectorAll('.mf-field-card, .mf-builder-field, [data-field-type], [data-field-id]'));
  const types = [...new Set(fc.map(e => e.getAttribute('data-field-type') || e.getAttribute('data-type') || ''))];
  const apptCard = fc.find(c => /appoint/i.test((c.getAttribute('data-field-type') || c.getAttribute('data-type') || '') + ' ' + (c.textContent || '')));
  let propsAfterClick = null;
  if (apptCard) {
    apptCard.click();
    setTimeout(() => {}, 0);
  }
  return {
    cardCount: fc.length,
    types,
    apptFound: !!apptCard,
    apptOuter: apptCard ? (apptCard.outerHTML || '').slice(0, 600) : ''
  };
});
report.steps.form335 = form335;
await page.waitForTimeout(2500);

const propsAfter = await page.evaluate(() => {
  const panel = document.querySelector('.mf-field-properties, .mf-properties-panel, [class*="properties-panel"], [class*="field-props"], #mf-properties-panel');
  if (!panel) {
    // look broader
    const cands = [...new Set(Array.from(document.querySelectorAll('[class*="propert" i]')).map(e => e.className))].slice(0, 15);
    return { found: false, candidates: cands };
  }
  const txt = panel.textContent || '';
  return {
    found: true,
    hasVariant: /variant/i.test(txt),
    hasColumns: /columns/i.test(txt),
    hasCalendar: /calendar/i.test(txt),
    hasMode: /\bmode\b/i.test(txt),
    hasTimeFormat: /timeformat|time format/i.test(txt),
    snippet: (panel.innerHTML || '').slice(0, 2500)
  };
});
report.steps.form335ApptProps = propsAfter;

// ============ PALETTE: try opening it explicitly in form 339 ============
await gotoBuilder(339);
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const ids = ['#mf-tab-link-fields', '#mf-tab-link-designer'];
  for (const s of ids) { const e = document.querySelector(s); if (e) { e.click(); return; } }
});
await page.waitForTimeout(2500);
// try open palette
const paletteOpen = await page.evaluate(() => {
  const triggers = ['#mf-add-field-btn', '.mf-palette-toggle', '[data-action="open-palette"]', 'button.mf-add-field', '#mf-add-field', '.mf-add-field'];
  for (const s of triggers) { const e = document.querySelector(s); if (e) { e.click(); return { sel: s, ok: true }; } }
  // by text
  const all = Array.from(document.querySelectorAll('button'));
  const t = all.find(b => /add.*field|add.*widget|\+\s*add|palette/i.test((b.textContent || '').trim()) || /add/i.test(b.getAttribute('title') || ''));
  if (t) { t.click(); return { sel: 'by-text', ok: true, text: (t.textContent || '').trim() }; }
  return { ok: false, btnTexts: all.slice(0, 20).map(b => (b.textContent || '').trim().slice(0, 20)) };
});
report.steps.paletteOpen = paletteOpen;
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(OUT_DIR, 'b58fu-07-form339-palette-attempt.png'), fullPage: true });

const paletteScan = await page.evaluate(() => {
  const tiles = Array.from(document.querySelectorAll('.mf-palette-tile, [data-palette-type], [class*="palette-tile"], [class*="palette-item"], [class*="tile"]'));
  const palContainer = document.querySelector('.mf-palette, [class*="palette"]');
  return {
    paletteContainerCls: palContainer ? palContainer.className : null,
    paletteContainerOuter: palContainer ? (palContainer.outerHTML || '').slice(0, 800) : '',
    tileCount: tiles.length,
    sampleTiles: tiles.slice(0, 25).map(t => ({ txt: (t.textContent || '').trim().slice(0, 30), type: t.getAttribute('data-palette-type') || t.getAttribute('data-type') || '', cls: t.className }))
  };
});
report.steps.paletteScan = paletteScan;

// ============ WRITE ============
report.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT_DIR, 'b58fu-probe.json'), JSON.stringify(report, null, 2));
console.log('=== FOLLOWUP DONE ===');
console.log(JSON.stringify(report, null, 2).slice(0, 30000));
await browser.close();
