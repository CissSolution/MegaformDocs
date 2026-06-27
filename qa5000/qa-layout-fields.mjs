// [2026-06-27] Standard-form palette now offers premium building blocks (Row/Columns, Card,
// Chips/Tags) and the wizard LIVE PREVIEW renders them. Add them on a blank form → preview
// shows columns/card/chips → Create → builder boots with Row/Section/Select → render 200.
import { launch, login, BASE, OUT, shot } from './lib.mjs';
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${x ? '  — ' + x : ''}`); };

const { browser, page, errs } = await launch(false);
try {
  if (!await login(page)) { console.log('LOGIN FAILED'); process.exit(2); }
  await page.goto(`${BASE}/?mfpanel=dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  await page.evaluate(() => { try { window.MegaFormWizard?.open(); } catch {} });
  await page.waitForSelector('#mf-wizard-root', { timeout: 8000 }).catch(() => {});
  await page.fill('#mf-wizard-root .mfw-in', 'Layout Fields QA');
  const blank = page.locator('#mf-wizard-root .mfw-pick', { hasText: 'Blank Form' }).first();
  if (await blank.count()) await blank.click();
  await page.waitForTimeout(300);
  await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click(); // → Fields
  await page.waitForTimeout(600);

  // The new building blocks must be in the CURATED palette (no "More fields" needed).
  const curatedLabels = await page.evaluate(() => Array.from(document.querySelectorAll('#mf-wizard-root .mfw-pick span')).map(s => s.textContent));
  ok('Row / 2 Columns curated', curatedLabels.includes('Row / 2 Columns'));
  ok('Card / Section curated', curatedLabels.includes('Card / Section'));
  ok('Chips / Tags curated', curatedLabels.includes('Chips / Tags'));

  const addTile = async (label) => { const t = page.locator('#mf-wizard-root .mfw-pick', { hasText: new RegExp('^' + label.replace(/[()/]/g, '\\$&') + '$') }).first(); if (await t.count()) { await t.click(); await page.waitForTimeout(220); return true; } return false; };
  await addTile('Short Text');
  await addTile('Row / 2 Columns');
  await addTile('Card / Section');
  await addTile('Chips / Tags');
  await addTile('Email');
  await page.waitForTimeout(400);
  await shot(page, 'qa-layout-1-fields.png');

  // LIVE PREVIEW must render the building blocks.
  const prev = await page.evaluate(() => {
    const side = document.querySelector('#mf-wizard-root .mfw-side');
    if (!side) return null;
    const chips = Array.from(side.querySelectorAll('span')).filter(s => /^Option \d$/.test(s.textContent || '') && /border-radius:\s*999px/.test(s.getAttribute('style') || '')).length;
    const card = Array.from(side.querySelectorAll('div')).some(d => /box-shadow/.test(d.getAttribute('style') || '') && /Card/.test(d.textContent || ''));
    const rowCols = (() => { const rows = Array.from(side.querySelectorAll('div')).filter(d => { const st = d.getAttribute('style') || ''; return /display:\s*flex/.test(st) && /gap:\s*8px/.test(st); }); return rows.some(r => r.children.length >= 2); })();
    return { chips, card, rowCols };
  });
  console.log('  preview:', JSON.stringify(prev));
  ok('preview renders Chips (pills)', !!(prev && prev.chips >= 3));
  ok('preview renders Card (bordered box)', !!(prev && prev.card));
  ok('preview renders Row columns (side-by-side)', !!(prev && prev.rowCols));

  // Create.
  const cont = async () => { await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click(); await page.waitForTimeout(500); };
  await cont(); await cont(); await cont();
  await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.cta').first().click();
  let booted = false;
  for (let i = 0; i < 45; i++) { booted = await page.evaluate(() => { const B = window.MegaFormBuilder; return !!(B && B.state && B.state.schema && B.state.schema.fields && B.state.schema.fields.length); }).catch(() => false); if (booted) break; await page.waitForTimeout(1000); }
  const url = page.url(); const formId = (url.match(/formId=(\d+)/) || [])[1];
  ok('builder booted', booted, url);
  const info = await page.evaluate(() => { const s = window.MegaFormBuilder.state.schema; const types = (s.fields || []).map(f => f.type); const row = (s.fields || []).find(f => f.type === 'Row'); return { types, rowCols: row && Array.isArray(row.columns) ? row.columns.length : 0 }; });
  console.log('  schema types:', JSON.stringify(info));
  ok('schema has Row (2 columns)', info.types.includes('Row') && info.rowCols === 2);
  ok('schema has Section (Card)', info.types.includes('Section'));
  ok('schema has Select (Chips)', info.types.includes('Select'));

  if (formId) {
    const render = await page.evaluate(async (id) => { const r = await fetch('/api/MegaForm/render/' + id, { credentials: 'same-origin' }); return { status: r.status, len: (await r.text()).length }; }, formId);
    console.log('  render:', JSON.stringify(render), 'formId:', formId);
    ok('render 200 (renderer handles Row/Section/Chips)', render.status === 200 && render.len > 1000);
    await page.goto(`${BASE}/api/MegaForm/render/${formId}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1000); await shot(page, 'qa-layout-2-render.png');
  }
  const fatal = errs.filter(e => /Cannot read|undefined is not|is not a function|TypeError/.test(e));
  ok('no fatal builder console errors', fatal.length === 0, fatal.slice(0, 2).join(' | '));

  console.log(`\n===== RESULT: ${fail ? '❌ ' + fail + ' FAILED' : '✅ ALL PASS'} =====`);
  if (errs.length) console.log('console errors:', errs.slice(-5));
} catch (e) { console.error('FATAL', e); fail++; await shot(page, 'qa-layout-error.png').catch(() => {}); } finally { await browser.close(); process.exit(fail ? 1 : 0); }
