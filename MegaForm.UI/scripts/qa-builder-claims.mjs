// Visual QA — Builder DB Panel v2 + Layout Designer v2 + Razor Studio.
// Targets form 302 (Sinh viên) which has FK Select + several field types.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

// Login
await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 30000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

async function safeGoto(url) {
  try { await page.goto(url, { waitUntil: 'commit', timeout: 60000 }); }
  catch { await page.waitForTimeout(2500); await page.goto(url, { waitUntil: 'commit', timeout: 60000 }); }
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
}

const report = { startedAt: new Date().toISOString(), checks: {} };

// ── Open Builder for form 302 ─────────────────────────────────────
await safeGoto(`${BASE}/xx?mfFormId=302#mf-builder`);
// Builder is heavy — wait for the editor canvas to mount.
await page.waitForTimeout(5000);
await page.screenshot({ path: join(OUT, 'qa-builder-01-loaded.png'), fullPage: false });

// Builder mounted check — right sidebar uses <a data-tab="..."> not buttons
const builderState = await page.evaluate(() => {
  const sideTabs = Array.from(document.querySelectorAll('a.mf-right-tab[data-tab]'))
    .map(el => ({ tab: el.getAttribute('data-tab'), label: el.querySelector('.mf-tab-lbl')?.textContent || '' }));
  return {
    url: location.href,
    hasBuilderRoot: !!document.querySelector('#mf-builder-root, .mf-builder, [data-mf-builder]'),
    rightSidebarTabs: sideTabs,
  };
});
report.builderLoad = builderState;

// ── (1) DB Panel v2 — click the DB tab via #mf-tab-link-db ─────
const dbPanelProbe = await page.evaluate(async () => {
  const dbBtn = document.querySelector('#mf-tab-link-db, a.mf-right-tab[data-tab="db"]');
  if (!dbBtn) return { clicked: false, reason: 'DB tab anchor missing' };
  dbBtn.click();
  await new Promise(r => setTimeout(r, 2500));
  // Panel content mounts into #mf-tab-db / #mf-db-tables-body
  const panel = document.querySelector('#mf-tab-db, #mf-db-tables-body, [data-mf-db-panel]');
  const text = (panel?.innerText || '').slice(0, 2200);
  return {
    clicked: true,
    panelMounted: !!panel,
    panelVisible: panel ? getComputedStyle(panel).display !== 'none' : false,
    // i18n labels — check for translated strings
    hasI18nLabels: /Tables|Schema|Connection|Database/i.test(text),
    // selected-strip — pinned tables shown above table list
    hasSelectedStrip: !!panel?.querySelector('[class*="selected"], [data-mf-selected]'),
    // AI Form button
    hasAiFormBtn: panel ? Array.from(panel.querySelectorAll('button')).some(b => /AI Form|✨|Create with AI/i.test((b.textContent || ''))) : false,
    // Watch for system tables that should be BLACKLISTED (NOT present in list)
    hasSystemTable: /aspnet_Users|AspNetUsers|MF_AI_Knowledge_History/i.test(text),
    bodyExcerpt: text.slice(0, 600),
  };
});
await page.screenshot({ path: join(OUT, 'qa-builder-02-db-panel.png'), fullPage: false });
report.checks.dbPanelV2 = dbPanelProbe;

// ── (1b) Widget Config Inspector — click "Lớp học" field on canvas ──
const inspectorProbe = await page.evaluate(async () => {
  // Switch back to FIELD tab first
  const fieldTab = document.querySelector('#mf-tab-link-field, a.mf-right-tab[data-tab="field"]');
  fieldTab?.click();
  await new Promise(r => setTimeout(r, 400));

  // Click the LAST canvas-field card directly (Lớp học is the last field on
  // form 302; canvas.ts wires click handlers on .mf-canvas-field with data-index).
  const fieldCards = Array.from(document.querySelectorAll('.mf-canvas-field[data-index]'));
  if (fieldCards.length === 0) return { clicked: false, reason: 'no .mf-canvas-field on canvas' };
  const lhCard = fieldCards[fieldCards.length - 1];
  lhCard.click();
  await new Promise(r => setTimeout(r, 800));

  const inspector = document.querySelector('#mf-tab-field') || document.querySelector('#mf-field-props');
  const props = document.querySelector('#mf-field-props');
  const text = (inspector?.innerText || '').slice(0, 800);
  return {
    clicked: true,
    fieldCardCount: fieldCards.length,
    selectedDataIndex: lhCard.getAttribute('data-index'),
    propsVisible: props ? getComputedStyle(props).display !== 'none' : false,
    hasFieldInspectorContent: /Label|Key|Options|Required|General/i.test(text),
    bodyExcerpt: text.slice(0, 500),
  };
});
await page.screenshot({ path: join(OUT, 'qa-builder-02b-widget-inspector.png'), fullPage: false });
report.checks.widgetConfigInspector = inspectorProbe;

// ── (2) Layout Designer — verify bundle is loaded + entry exists ──
// Form 302 has no DataGrid widget so we can't trigger it directly here. We
// verify the bundle is loaded (the right strings are present in window) and
// note that a hands-on trigger requires a DataGrid field on the form.
const layoutDesignerProbe = await page.evaluate(async () => {
  // Bundle indicators: the Layout Designer bundle defines specific globals
  // and the megaform-widget-data-repeater bundle hosts it.
  const bundleScripts = Array.from(document.scripts)
    .map(s => s.src)
    .filter(s => /data-repeater|grid-repeater|layout-designer/i.test(s));
  return {
    bundleLoaded: bundleScripts.length > 0,
    bundleUrls: bundleScripts,
    hasLayoutDesignerWindowFlag: !!(window).__MF_LayoutDesigner || !!(window).MegaFormLayoutDesigner,
    designerEntryDefined: typeof (window).openLayoutDesigner === 'function'
                       || typeof (window).__MF_OpenLayoutDesigner === 'function',
    note: 'A full live mount needs a DataGrid widget on the form — form 302 has none.',
  };
});
await page.screenshot({ path: join(OUT, 'qa-builder-03-layout-designer.png'), fullPage: false });
report.checks.layoutDesignerV2 = layoutDesignerProbe;

// ── (3) Razor Studio — verify bundle is loaded ────────────────
const razorProbe = await page.evaluate(async () => {
  const bundleScripts = Array.from(document.scripts)
    .map(s => s.src)
    .filter(s => /razor-studio|widget-razor/i.test(s));
  return {
    bundleLoaded: bundleScripts.length > 0,
    bundleUrls: bundleScripts,
    badge: (window).__MF_RAZOR_STUDIO_BADGE__ || null,
    razorWidgetRegistered: !!(window).MegaForm?.widgets?.razor || !!(window).MegaFormRazorWidget,
    note: 'Live mount needs a Razor widget on the form — form 302 has none. Bundle-loaded check is canonical.',
  };
});
await page.screenshot({ path: join(OUT, 'qa-builder-04-razor-studio.png'), fullPage: false });
report.checks.razorStudio = razorProbe;

report.consoleErrors = errs.slice(0, 5);
writeFileSync(join(OUT, 'qa-builder-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
