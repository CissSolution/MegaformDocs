// [Razor Recipe v20260601-B27] QA — open Razor Studio on a Razor-widget
// field, verify Recipe tab is default + tile gallery renders + clicking a
// tile auto-renders the grouped params form + Apply writes widgetProps.
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
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)); });

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

// Open Builder for form 326 (has a Razor widget per recent QA)
try { await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(6500);

console.log('=== 1. PROBE — find a Razor field, open Studio ===');
const openProbe = await page.evaluate(() => {
  const B = window.MegaFormBuilder;
  if (!B || !B.state || !B.state.schema) return { err: 'no Builder state' };
  const fields = B.state.schema.fields || [];
  // Find a Razor field; if none, just spawn the Studio with a fake field
  let razorField = fields.find(f => f && f.type === 'Razor');
  if (!razorField) {
    return {
      err: 'no Razor field in form 326',
      fieldTypes: fields.map(f => f && f.type).slice(0, 10),
    };
  }
  // Open the Studio popup
  if (!window.MFRazorStudio || typeof window.MFRazorStudio.open !== 'function') {
    return { err: 'MFRazorStudio.open not loaded', badge: null };
  }
  const wp = razorField.widgetProps || {};
  window.__MF_QA_APPLY = null;
  window.MFRazorStudio.open({
    fieldKey: razorField.key,
    formId: 326,
    currentProps: wp,
    onApplyProps: (np) => { window.__MF_QA_APPLY = np; },
  });
  return {
    ok: true,
    badge: window.MFRazorStudio.badge,
    fieldKey: razorField.key,
    initialWp: JSON.parse(JSON.stringify(wp)),
  };
});
console.log(JSON.stringify(openProbe, null, 2));

if (openProbe.err && openProbe.err.includes('no Razor field')) {
  // Spawn Studio anyway with synthetic field to check UI
  await page.evaluate(() => {
    window.__MF_QA_APPLY = null;
    window.MFRazorStudio.open({
      fieldKey: 'qa_synthetic',
      formId: 326,
      currentProps: {},
      onApplyProps: (np) => { window.__MF_QA_APPLY = np; },
    });
  });
}

await page.waitForTimeout(2500);  // catalog fetch + initial render

await page.screenshot({ path: join(OUT, 'qa-razor-01-recipe-tab.png'), fullPage: false });

console.log('=== 2. PROBE — Recipe tab is default, tiles rendered ===');
const probe2 = await page.evaluate(() => {
  const popup = document.getElementById('mf-razor-studio-popup');
  if (!popup) return { err: 'popup not present' };
  const activeTab = popup.querySelector('.mfrs-tab.is-active')?.getAttribute('data-tab');
  const tiles = Array.from(popup.querySelectorAll('.mfrs-rec-tile'));
  const groups = Array.from(popup.querySelectorAll('.mfrs-rc-group-h')).map(g => g.textContent);
  return {
    activeTab,
    tileCount: tiles.length,
    tileNames: tiles.slice(0, 10).map(t => ({
      name: t.querySelector('.mfrs-rec-name')?.textContent,
      cat: t.querySelector('.mfrs-rec-cat')?.textContent,
      iconClass: t.querySelector('.mfrs-rec-icon i')?.className,
      isSelected: t.classList.contains('is-selected'),
      whenLen: (t.querySelector('.mfrs-rec-when')?.textContent || '').length,
    })),
    groupsInConfig: groups,
    primaryLabel: popup.querySelector('[data-action="primary"]')?.textContent,
    badge: popup.querySelector('.mfrs-badge')?.textContent,
  };
});
console.log(JSON.stringify(probe2, null, 2));

console.log('=== 3. CLICK — pick SqlTablePivot recipe ===');
const click = await page.evaluate(() => {
  const tile = Array.from(document.querySelectorAll('.mfrs-rec-tile'))
    .find(t => t.querySelector('.mfrs-rec-name')?.textContent === 'SqlTablePivot');
  if (!tile) return { err: 'SqlTablePivot tile not found' };
  tile.click();
  return { ok: true };
});
console.log(JSON.stringify(click, null, 2));
await page.waitForTimeout(800);

await page.screenshot({ path: join(OUT, 'qa-razor-02-pivot-selected.png'), fullPage: false });

console.log('=== 4. PROBE — selected recipe + params form structure ===');
const probe4 = await page.evaluate(() => {
  const popup = document.getElementById('mf-razor-studio-popup');
  if (!popup) return { err: 'popup gone' };
  const selectedTile = popup.querySelector('.mfrs-rec-tile.is-selected');
  const groups = Array.from(popup.querySelectorAll('.mfrs-rc-group-h')).map(g => g.textContent);
  const fields = Array.from(popup.querySelectorAll('.mfrs-rc-row[data-pname]')).map(r => ({
    name: r.getAttribute('data-pname'),
    widget: r.getAttribute('data-widget'),
    label: r.querySelector('label')?.textContent?.replace(/\*$/, ''),
    isRequired: !!r.querySelector('.req'),
  }));
  const aggregator = popup.querySelector('select#mfrs-rc-p-aggregator');
  const aggOptions = aggregator ? Array.from(aggregator.options).map(o => o.value) : [];
  return {
    selectedName: selectedTile?.querySelector('.mfrs-rec-name')?.textContent,
    h1: popup.querySelector('.mfrs-rc-h1')?.textContent?.trim(),
    when: popup.querySelector('.mfrs-rc-when')?.textContent?.slice(0, 80),
    groupHeaders: groups,
    paramFields: fields,
    aggregatorOptions: aggOptions,
    sqlPanelPresent: !!popup.querySelector('#mfrs-rc-sql'),
    previewBlockPresent: !!popup.querySelector('#mfrs-rc-prev-host'),
  };
});
console.log(JSON.stringify(probe4, null, 2));

console.log('=== 5. FILL params + apply ===');
const fill = await page.evaluate(() => {
  const set = (id, val) => { const el = document.getElementById(id); if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); } };
  set('mfrs-rc-p-rowgroupcolumn', 'Region');
  set('mfrs-rc-p-colgroupcolumn', 'Category');
  set('mfrs-rc-p-valuecolumn',    'Sales');
  set('mfrs-rc-p-aggregator',     'avg');
  set('mfrs-rc-conn',             'DashboardDatabase');
  set('mfrs-rc-sql',              'SELECT Region, Category, Sales FROM SalesFact');
  const usesql = document.getElementById('mfrs-rc-usesql'); if (usesql) usesql.checked = true;
  // Click Apply
  const primary = document.querySelector('[data-action="primary"]');
  primary?.click();
  return { applied: true, applyPayload: window.__MF_QA_APPLY };
});
console.log(JSON.stringify(fill, null, 2));
await page.waitForTimeout(400);

await page.screenshot({ path: join(OUT, 'qa-razor-03-applied.png'), fullPage: false });

console.log('=== 6. TAB switch — Advanced tab opens ===');
// Re-open Studio (Apply closed it) just to inspect Advanced
const openTab = await page.evaluate(() => {
  if (!window.MFRazorStudio) return { err: 'gone' };
  window.MFRazorStudio.open({
    fieldKey: 'qa_synthetic',
    formId: 326,
    currentProps: { templateName: 'SqlTablePivot', parameters: { rowGroupColumn: 'Region' } },
    onApplyProps: (np) => { window.__MF_QA_APPLY = np; },
  });
  return { ok: true };
});
console.log(JSON.stringify(openTab, null, 2));
await page.waitForTimeout(1800);
const advClick = await page.evaluate(() => {
  const tab = Array.from(document.querySelectorAll('.mfrs-tab')).find(t => t.getAttribute('data-tab') === 'advanced');
  if (!tab) return { err: 'no advanced tab' };
  tab.click();
  return { ok: true };
});
console.log(JSON.stringify(advClick, null, 2));
await page.waitForTimeout(700);
const advProbe = await page.evaluate(() => {
  const popup = document.getElementById('mf-razor-studio-popup');
  return {
    subTabs: Array.from(popup.querySelectorAll('.mfrs-adv-tab')).map(t => ({ label: t.textContent, active: t.classList.contains('is-active') })),
    bannerText: popup.querySelector('.mfrs-banner')?.textContent?.slice(0, 60),
  };
});
console.log(JSON.stringify(advProbe, null, 2));
await page.screenshot({ path: join(OUT, 'qa-razor-04-advanced.png'), fullPage: false });

console.log('=== CONSOLE ERRORS ===');
console.log(JSON.stringify(consoleErrs.slice(0, 5), null, 2));
await browser.close();
