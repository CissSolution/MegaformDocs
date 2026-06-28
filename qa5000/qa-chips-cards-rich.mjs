// [2026-06-28] Chips/Cards enhancements: (A) rich default options (icon+title+meta+desc) seeded
// on add so authors edit a full premium card; (B) Option Columns (Auto/1-4) available for
// Chips/Cards in the builder (Choice-Display picker stays hidden). Visual QA on :5000.
import { launch, login, BASE, OUT, shot } from './lib.mjs';
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${x ? '  — ' + x : ''}`); };

const { browser, page, errs } = await launch(false);
try {
  if (!await login(page)) { console.log('LOGIN FAILED'); process.exit(2); }
  await page.goto(`${BASE}/?mfpanel=dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  await page.evaluate(() => { try { window.MegaFormWizard?.open(); } catch {} });
  await page.waitForSelector('#mf-wizard-root', { timeout: 8000 }).catch(() => {});
  await page.fill('#mf-wizard-root .mfw-in', 'Rich Chips Cards QA');
  const blank = page.locator('#mf-wizard-root .mfw-pick', { hasText: 'Blank Form' }).first();
  if (await blank.count()) await blank.click();
  await page.waitForTimeout(300);
  await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click();
  await page.waitForTimeout(600);
  const addTile = async (label) => { const t = page.locator('#mf-wizard-root .mfw-pick', { hasText: new RegExp('^' + label.replace(/[()/]/g, '\\$&') + '$') }).first(); if (await t.count()) { await t.click(); await page.waitForTimeout(220); } };
  await addTile('Chips');
  await addTile('Choice Cards');
  await page.waitForTimeout(300);
  await shot(page, 'qa-ccr-1-wizard.png');

  const cont = async () => { await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click(); await page.waitForTimeout(500); };
  await cont(); await cont(); await cont();
  await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.cta').first().click();
  let booted = false;
  for (let i = 0; i < 45; i++) { booted = await page.evaluate(() => { const B = window.MegaFormBuilder; return !!(B && B.state && B.state.schema && B.state.schema.fields && B.state.schema.fields.length); }).catch(() => false); if (booted) break; await page.waitForTimeout(1000); }
  const formId = (page.url().match(/formId=(\d+)/) || [])[1];
  ok('builder booted', booted, 'formId ' + formId);

  // (A) Rich default options on the Cards field.
  const sx = await page.evaluate(() => {
    const s = window.MegaFormBuilder.state.schema;
    const cards = (s.fields || []).find(f => f.type === 'Cards');
    const chips = (s.fields || []).find(f => f.type === 'Chips');
    const o0 = cards && cards.options && cards.options[0] || {};
    return { cardsAllowHtml: !!(cards && cards.allowOptionHtml), icon: o0.icon || '', meta: o0.meta || '', desc: o0.description || '', cardOptCount: cards && (cards.options || []).length, chipOptCount: chips && (chips.options || []).length };
  });
  console.log('  cards option[0]:', JSON.stringify(sx));
  ok('Cards seeded with icon (FontAwesome)', /fa-/.test(sx.icon), sx.icon);
  ok('Cards seeded with meta sub-line', sx.meta.length > 0, sx.meta);
  ok('Cards seeded with description', sx.desc.length > 0);
  ok('Cards field allowOptionHtml = true (icons render)', sx.cardsAllowHtml);
  ok('Cards has 3 options, Chips has 3', sx.cardOptCount === 3 && sx.chipOptCount === 3);

  // (B) Builder: select the Cards field, Option Columns visible + Choice-Display hidden.
  const sel = await page.evaluate(() => {
    const B = window.MegaFormBuilder; const s = B.state.schema;
    const idx = (s.fields || []).findIndex(f => f.type === 'Cards');
    try { B.state.selectedFieldIndex = idx; B.callModule('properties', 'showProps', [s.fields[idx]]); } catch (e) { return { err: String(e) }; }
    return { idx };
  });
  await page.waitForTimeout(600);
  const panel = await page.evaluate(() => {
    const vis = (id) => { const el = document.getElementById(id); if (!el) return null; return getComputedStyle(el).display !== 'none'; };
    return { columnsWrap: vis('mf-prop-option-columns-wrap'), styleWrap: vis('mf-prop-option-style-wrap'), optionsList: !!document.querySelector('#mf-prop-options-list .mf-option-row, #mf-prop-options-list input') };
  });
  console.log('  builder panel(Cards):', JSON.stringify(panel));
  ok('builder: Option Columns control VISIBLE for Cards', panel.columnsWrap === true);
  ok('builder: Choice-Display picker HIDDEN for Cards', panel.styleWrap === false);
  await shot(page, 'qa-ccr-2-builder-panel.png');

  // (A) render: rich card markup (icon + meta + desc).
  const ssr = await page.evaluate(async (id) => { const r = await fetch('/api/MegaForm/render/' + id, { credentials: 'same-origin' }); return await r.text(); }, formId);
  ok('render: mf-option-group--cards present', /mf-option-group--cards/.test(ssr));
  ok('render: card icon (mf-option-icon + <i class="fa)', /mf-option-icon[^>]*>\s*<i class="fa/.test(ssr) || (/mf-option-icon/.test(ssr) && /<i class="fas fa-/.test(ssr)));
  ok('render: card meta sub-line (mf-option-meta)', /mf-option-meta/.test(ssr));
  ok('render: card description (mf-option-desc)', /mf-option-desc/.test(ssr));

  await page.goto(`${BASE}/api/MegaForm/render/${formId}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1800);
  // Select 1 card so the screenshot shows selected state.
  await page.evaluate(() => { const c = document.querySelector('.mf-option-group--cards .mf-option-control'); if (c) c.click(); const chip = document.querySelector('.mf-option-group--chips .mf-option-control'); if (chip) chip.click(); });
  await page.waitForTimeout(400);
  await shot(page, 'qa-ccr-3-render.png');

  const fatal = errs.filter(e => /Cannot read|is not a function|TypeError|undefined is not/.test(e));
  ok('no fatal console errors', fatal.length === 0, fatal.slice(0, 2).join(' | '));

  console.log(`\n===== RESULT: ${fail ? '❌ ' + fail + ' FAILED' : '✅ ALL PASS'} =====`);
  if (errs.length) console.log('console errors:', errs.slice(-5));
} catch (e) { console.error('FATAL', e); fail++; await shot(page, 'qa-ccr-error.png').catch(() => {}); } finally { await browser.close(); process.exit(fail ? 1 : 0); }
