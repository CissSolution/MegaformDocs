// Final probe focused on the actual selectors discovered, plus discovering the real MegaForm dashboard URL.
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

// ------------- Discover real MegaForm dashboard URL by browsing site nav -------------
await page.goto(ROOT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);
const allLinks = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(a => ({ href: a.getAttribute('href'), txt: (a.textContent || '').trim().slice(0, 40) })).filter(l => /dash|admin|megaform|form\b/i.test(l.href + ' ' + l.txt)).slice(0, 30));
report.steps.candidateLinks = allLinks;

// MegaForm dashboard is at /xx (the module's default page). Let's try /xx
await page.goto(ROOT + '/xx?_=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000);
await page.screenshot({ path: path.join(OUT_DIR, 'b58fn-01-xx-noformid.png'), fullPage: true });
const dashAtXx = await page.evaluate(() => {
  // many possible dashboard classes
  const cards = Array.from(document.querySelectorAll('[class*="mf-dash"], [class*="dash-card"], [class*="form-tile"], [class*="form-card"]')).filter(e => !/am-/.test(e.className));
  const firstCard = cards[0];
  let firstHtml = '', btns = [];
  if (firstCard) {
    firstHtml = (firstCard.outerHTML || '').slice(0, 2500);
    btns = Array.from(firstCard.querySelectorAll('button, a.btn, [class*="btn"]')).map(b => ({ t: (b.textContent || '').trim().slice(0, 40), title: b.getAttribute('title') || '', cls: b.className }));
  }
  return {
    cardCount: cards.length,
    sampleClasses: [...new Set(cards.map(c => c.className))].slice(0, 10),
    firstHtml,
    firstCardButtons: btns,
    reportButtonAnywhere: Array.from(document.querySelectorAll('button, a')).filter(e => /report/i.test(e.textContent || '') || /report/i.test(e.getAttribute('title') || '')).slice(0, 5).map(e => ({ tag: e.tagName, txt: (e.textContent || '').trim().slice(0, 30), cls: e.className }))
  };
});
report.steps.dashboardAtXx = dashAtXx;

// ------------- Form 339 builder, focus on widget cards (mf-field-group) -------------
await page.goto(ROOT + '/xx?mfFormId=339&_=' + Date.now() + '#mf-builder', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(13000);
await page.screenshot({ path: path.join(OUT_DIR, 'b58fn-02-form339-builder.png'), fullPage: true });

const form339Widgets = await page.evaluate(() => {
  const groups = Array.from(document.querySelectorAll('.mf-field-group, [data-type]')).filter(e => {
    const t = (e.getAttribute('data-type') || '').toLowerCase();
    return ['razor','dynamiclabel','datarepeater'].includes(t);
  });
  return groups.map(g => {
    const cardTopButtons = g.querySelectorAll(':scope > button, :scope > .mf-widget-toolbar button, :scope .mf-widget-buttons button, button.mf-open-unified-designer, button.mf-open-designer, button.mf-razor-studio-btn, button.mf-layout-designer-btn');
    // collect any visible button inside, dedupe by text
    const allBtns = Array.from(g.querySelectorAll('button')).filter(b => {
      const r = b.getBoundingClientRect();
      const t = (b.textContent || '').trim().toLowerCase();
      // skip generic icon-only buttons like duplicate/delete handles which are <span> usually
      return r.width > 30 && /design|studio|layout/i.test(t);
    });
    return {
      type: g.getAttribute('data-type'),
      cls: g.className,
      cardTopButtonCount: cardTopButtons.length,
      designerActionButtons: allBtns.map(b => (b.textContent || '').trim().slice(0, 40)),
      outerSnippet: (g.outerHTML || '').slice(0, 1500)
    };
  });
});
report.steps.form339Widgets = form339Widgets;

// ------------- Form 266 builder, DynamicLabel buttons -------------
await page.goto(ROOT + '/xx?mfFormId=266&_=' + Date.now() + '#mf-builder', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(13000);
await page.screenshot({ path: path.join(OUT_DIR, 'b58fn-03-form266-builder.png'), fullPage: true });
const form266Widgets = await page.evaluate(() => {
  const groups = Array.from(document.querySelectorAll('.mf-field-group, [data-type]')).filter(e => {
    const t = (e.getAttribute('data-type') || '').toLowerCase();
    return ['dynamiclabel'].includes(t);
  });
  return groups.map(g => {
    const allBtns = Array.from(g.querySelectorAll('button')).filter(b => /design|studio|layout/i.test((b.textContent || '').trim()));
    return {
      type: g.getAttribute('data-type'),
      designerActionButtons: allBtns.map(b => (b.textContent || '').trim()),
      outerSnippet: (g.outerHTML || '').slice(0, 1500)
    };
  });
});
report.steps.form266Widgets = form266Widgets;

// ------------- THEME tab left rail using DISCOVERED selectors -------------
// rail uses .mf-tlr-section* and contains buttons IMAGES/FONTS/INSPECT/STRUCTURE
await page.goto(ROOT + '/xx?mfFormId=339&_=' + Date.now() + '#mf-builder', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(12000);
// click THEME
await page.evaluate(() => { const e = document.querySelector('#mf-tab-link-theme'); if (e) e.click(); });
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(OUT_DIR, 'b58fn-04-form339-theme.png'), fullPage: true });

const themeRail = await page.evaluate(() => {
  // find the LEFT rail when theme is active — it's wherever .mf-tlr-section lives
  const sec = document.querySelector('.mf-tlr-section');
  if (!sec) {
    // also check if old palette is still visible
    const palette = document.querySelector('.mf-field-palette');
    return { tlrFound: false, paletteStillVisible: palette ? palette.getBoundingClientRect().width > 0 : false };
  }
  // walk up to find the rail container
  let rail = sec;
  for (let i = 0; i < 6 && rail.parentElement; i++) rail = rail.parentElement;
  const txt = rail.textContent || '';
  // find the 4 expected tabs as buttons
  const tabSelectors = ['IMAGES','FONTS','INSPECT','STRUCTURE'];
  const tabs = tabSelectors.map(label => {
    const m = Array.from(rail.querySelectorAll('button, .mf-tab, [role="tab"]')).find(b => new RegExp('^\\s*' + label + '\\s*$', 'i').test((b.textContent || '').trim()));
    return { label, found: !!m, cls: m ? m.className : null };
  });
  // also: is the old palette/element list hidden when theme is active?
  const palette = document.querySelector('.mf-field-palette');
  const paletteVisible = palette ? (palette.getBoundingClientRect().width > 0 && palette.getBoundingClientRect().height > 0) : false;
  return {
    tlrFound: true,
    hasImages: /IMAGES/.test(txt),
    hasFonts: /FONTS/.test(txt),
    hasInspect: /INSPECT/.test(txt),
    hasStructure: /STRUCTURE/.test(txt),
    tabs,
    railWidth: rail.getBoundingClientRect().width,
    paletteStillVisible: paletteVisible,
    innerHtmlHead: (rail.innerHTML || '').slice(0, 1500)
  };
});
report.steps.themeLeftRail = themeRail;

// click a preset and watch the form CSS variables / iframe
const presetClickEffect = await page.evaluate(() => {
  const preset = document.querySelectorAll('.mf-theme-preset')[1]; // pick "Modern Blue"
  if (!preset) return { presetCount: 0 };
  // capture some CSS variables BEFORE
  const root = document.documentElement;
  const before = {
    primary: getComputedStyle(root).getPropertyValue('--mf-primary') || getComputedStyle(root).getPropertyValue('--primary'),
    bg: getComputedStyle(root).getPropertyValue('--mf-page-bg')
  };
  preset.click();
  return { clicked: true, before, after: 'check-next' };
});
await page.waitForTimeout(2000);
const presetAfter = await page.evaluate(() => {
  const root = document.documentElement;
  return {
    primary: getComputedStyle(root).getPropertyValue('--mf-primary') || getComputedStyle(root).getPropertyValue('--primary'),
    bg: getComputedStyle(root).getPropertyValue('--mf-page-bg'),
    activePresetClass: document.querySelector('.mf-theme-preset.active, .mf-theme-preset[data-active="true"]')?.textContent?.trim() || null
  };
});
report.steps.presetClickEffect = { presetClickEffect, presetAfter };
await page.screenshot({ path: path.join(OUT_DIR, 'b58fn-05-after-preset.png'), fullPage: true });

// ------------- Open Unified Designer by clicking the actual button -------------
await page.goto(ROOT + '/xx?mfFormId=339&_=' + Date.now() + '#mf-builder', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(12000);

const openedDesigner = await page.evaluate(() => {
  // find Open Unified Designer button anywhere
  const btn = Array.from(document.querySelectorAll('button')).find(b => /open\s*unified\s*designer/i.test((b.textContent || '').trim()));
  if (!btn) return { btnFound: false, buttonTextsSample: Array.from(document.querySelectorAll('button')).slice(0, 30).map(b => (b.textContent || '').trim().slice(0, 30)) };
  btn.click();
  return { btnFound: true, btnText: (btn.textContent || '').trim() };
});
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(OUT_DIR, 'b58fn-06-unified-designer-open.png'), fullPage: true });

const modalState = await page.evaluate(() => {
  const modal = document.querySelector('.mf-unified-designer, .mf-widget-designer-shell, .mf-designer-modal, [class*="unified-designer" i], [class*="designer-shell" i], [class*="widget-designer" i], .mf-modal[class*="designer" i]');
  if (!modal) {
    // any overlay-like element with role=dialog
    const dlg = document.querySelector('[role="dialog"], .mf-modal-backdrop, .mf-modal-shell');
    return {
      designerModalFound: false,
      anyDialogFound: !!dlg,
      dialogCls: dlg ? dlg.className : null
    };
  }
  // look for sparkle/ai button
  const sparkleBtn = modal.querySelector('button[title*="AI" i], button[aria-label*="AI" i], button[class*="sparkle" i], .mf-ai-toggle, .mf-ai-sparkle');
  let sparkleByText = null;
  if (!sparkleBtn) {
    sparkleByText = Array.from(modal.querySelectorAll('button')).find(b => /✨/.test(b.textContent || '') || /sparkle/i.test(b.className || '') || /\bAI\b/.test(b.textContent || '') || /AI/i.test(b.getAttribute('title') || ''));
  }
  const sp = sparkleBtn || sparkleByText;
  return {
    designerModalFound: true,
    modalCls: modal.className,
    modalRect: (() => { const r = modal.getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, y: r.y }; })(),
    sparkleFound: !!sp,
    sparkleCls: sp ? sp.className : null,
    sparkleOuter: sp ? (sp.outerHTML || '').slice(0, 300) : ''
  };
});
report.steps.unifiedDesigner = { openedDesigner, modalState };

// click sparkle if found
if (modalState.sparkleFound) {
  await page.evaluate(() => {
    const sp = document.querySelector('button[title*="AI" i], button[aria-label*="AI" i], .mf-ai-toggle, .mf-ai-sparkle');
    if (sp) sp.click();
  });
  await page.waitForTimeout(1500);
  const drawer = await page.evaluate(() => {
    const d = document.querySelector('.mf-ai-drawer, .mf-ai-panel, [class*="ai-drawer" i], [class*="ai-panel" i]');
    if (!d) return { drawer: false };
    const r = d.getBoundingClientRect();
    return { drawer: true, cls: d.className, visibleW: r.width, x: r.x, hasOpenClass: /\bopen\b/i.test(d.className) };
  });
  report.steps.aiDrawer = drawer;
}

// ------------- Appointment widget probe in form 335 -------------
await page.goto(ROOT + '/xx?mfFormId=335&_=' + Date.now() + '#mf-builder', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(12000);
const apptInfo = await page.evaluate(() => {
  const grp = Array.from(document.querySelectorAll('.mf-field-group, [data-type]')).find(g => /^appointment$/i.test(g.getAttribute('data-type') || ''));
  if (!grp) {
    // list all groups for context
    return { found: false, allTypes: [...new Set(Array.from(document.querySelectorAll('.mf-field-group, [data-type]')).map(g => g.getAttribute('data-type')).filter(Boolean))] };
  }
  grp.click();
  return { found: true, cls: grp.className, outer: (grp.outerHTML || '').slice(0, 1500) };
});
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(OUT_DIR, 'b58fn-07-form335-appt-clicked.png'), fullPage: true });

const apptProps = await page.evaluate(() => {
  // Field properties panel — when a field is selected, the right rail shows props
  const rightPanel = document.querySelector('.mf-right-panel, .mf-builder-right, [class*="right-panel" i], #mf-right-rail');
  if (!rightPanel) {
    // fallback: any visible panel with "Field" tab content
    return { found: false };
  }
  const txt = rightPanel.textContent || '';
  return {
    found: true,
    cls: rightPanel.className,
    hasVariant: /variant/i.test(txt),
    hasColumns: /\bcolumns\b/i.test(txt),
    hasCalendar: /calendar/i.test(txt),
    hasMode: /\bmode\b/i.test(txt),
    hasTimeFormat: /timeformat|time\s*format/i.test(txt),
    visiblePanelTextSample: txt.replace(/\s+/g, ' ').slice(0, 1500)
  };
});
report.steps.appointmentProps = { apptInfo, apptProps };

// ------------- Phone widget on form 335 RUNTIME (not builder) -------------
await page.goto(ROOT + '/xx?formid=335&_=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000);
const phoneRuntime = await page.evaluate(() => {
  const shells = Array.from(document.querySelectorAll('.mfp-phone-shell'));
  const proWrappers = Array.from(document.querySelectorAll('.mfp-phone-pro'));
  return {
    shellCount: shells.length,
    proCount: proWrappers.length,
    firstShellClass: shells[0] ? shells[0].className : null,
    isNational: shells[0] ? /is-national/.test(shells[0].className) : null,
    firstShellOuter: shells[0] ? (shells[0].outerHTML || '').slice(0, 1000) : '',
    hasCountryButton: !!document.querySelector('.mfp-country-btn, .mfp-flag-btn, .mfp-phone-shell button')
  };
});
report.steps.phoneRuntime = phoneRuntime;

// ------------- WRITE -------------
report.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT_DIR, 'b58fn-probe.json'), JSON.stringify(report, null, 2));
console.log('=== FINAL PROBE DONE ===');
console.log(JSON.stringify(report, null, 2));
await browser.close();
