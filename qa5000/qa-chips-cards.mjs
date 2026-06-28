// [2026-06-28] Two NEW dedicated controls Chips + Cards (split out from Radio/Checkbox).
// Prove end-to-end in the wizard: palette tiles -> wizard preview -> Create -> schema types
// Chips/Cards -> SSR renders premium chip/card markup (checkbox vs radio) -> client hydrate
// matches SSR (TS/C# parity) -> selectable (chips=multi, cards=single).
import { launch, login, BASE, OUT, shot } from './lib.mjs';
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${x ? '  — ' + x : ''}`); };

const { browser, page, errs } = await launch(false);
try {
  if (!await login(page)) { console.log('LOGIN FAILED'); process.exit(2); }
  await page.goto(`${BASE}/?mfpanel=dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  await page.evaluate(() => { try { window.MegaFormWizard?.open(); } catch {} });
  await page.waitForSelector('#mf-wizard-root', { timeout: 8000 }).catch(() => {});
  await page.fill('#mf-wizard-root .mfw-in', 'Chips Cards QA');
  const blank = page.locator('#mf-wizard-root .mfw-pick', { hasText: 'Blank Form' }).first();
  if (await blank.count()) await blank.click();
  await page.waitForTimeout(300);
  await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click();
  await page.waitForTimeout(600);

  // Palette must have dedicated Chips + Choice Cards tiles (curated).
  const labels = await page.evaluate(() => Array.from(document.querySelectorAll('#mf-wizard-root .mfw-pick span')).map(s => s.textContent));
  ok('palette has "Chips" tile', labels.includes('Chips'));
  ok('palette has "Choice Cards" tile', labels.includes('Choice Cards'));

  const addTile = async (label) => { const t = page.locator('#mf-wizard-root .mfw-pick', { hasText: new RegExp('^' + label.replace(/[()/]/g, '\\$&') + '$') }).first(); if (await t.count()) { await t.click(); await page.waitForTimeout(220); } };
  await addTile('Chips');
  await addTile('Choice Cards');
  await page.waitForTimeout(300);
  await shot(page, 'qa-cc-1-wizard.png');

  // Wizard preview renders pills + card tiles.
  const prev = await page.evaluate(() => {
    const side = document.querySelector('#mf-wizard-root .mfw-side');
    const pills = Array.from(side.querySelectorAll('span')).filter(s => /^Option \d$/.test(s.textContent || '') && /border-radius:\s*999px/.test(s.getAttribute('style') || '')).length;
    const cardRows = Array.from(side.querySelectorAll('div')).filter(d => /border-radius:\s*12px/.test(d.getAttribute('style') || '') && /Option/.test(d.textContent || '')).length;
    return { pills, cardRows };
  });
  ok('wizard preview shows chip pills', prev.pills >= 3, prev.pills + ' pills');
  ok('wizard preview shows card tiles', prev.cardRows >= 3, prev.cardRows + ' cards');

  // Create.
  const cont = async () => { await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click(); await page.waitForTimeout(500); };
  await cont(); await cont(); await cont();
  await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.cta').first().click();
  let booted = false;
  for (let i = 0; i < 45; i++) { booted = await page.evaluate(() => { const B = window.MegaFormBuilder; return !!(B && B.state && B.state.schema && B.state.schema.fields && B.state.schema.fields.length); }).catch(() => false); if (booted) break; await page.waitForTimeout(1000); }
  const formId = (page.url().match(/formId=(\d+)/) || [])[1];
  ok('builder booted', booted, 'formId ' + formId);

  const info = await page.evaluate(() => { const s = window.MegaFormBuilder.state.schema; const find = (t) => (s.fields || []).find(f => f.type === t); const c = find('Chips'); const d = find('Cards'); return { types: (s.fields || []).map(f => f.type), chipsOpts: c && (c.options || []).length, cardsOpts: d && (d.options || []).length }; });
  console.log('  schema:', JSON.stringify(info));
  ok('schema has Chips field (3 options)', info.types.includes('Chips') && info.chipsOpts === 3);
  ok('schema has Cards field (3 options)', info.types.includes('Cards') && info.cardsOpts === 3);

  // SSR raw HTML parity.
  const ssr = await page.evaluate(async (id) => { const r = await fetch('/api/MegaForm/render/' + id, { credentials: 'same-origin' }); return await r.text(); }, formId);
  const ssrChips = /mf-option-group--chips/.test(ssr) && /mf-option-item--chips/.test(ssr) && /<input[^>]*class="mf-option-control"[^>]*type="checkbox"|<input[^>]*type="checkbox"[^>]*class="mf-option-control"/.test(ssr);
  const ssrCards = /mf-option-group--cards/.test(ssr) && /mf-option-item--cards/.test(ssr) && /mf-option-check/.test(ssr) && /<input[^>]*class="mf-option-control"[^>]*type="radio"|<input[^>]*type="radio"[^>]*class="mf-option-control"/.test(ssr);
  ok('SSR: Chips renders chip markup + checkbox inputs', ssrChips);
  ok('SSR: Cards renders card markup + radio inputs + check tick', ssrCards);

  // Client hydrate parity: load the form page, check the live DOM matches.
  await page.goto(`${BASE}/api/MegaForm/render/${formId}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1800);
  const client = await page.evaluate(() => {
    const chipsGrp = document.querySelector('.mf-option-group--chips');
    const cardsGrp = document.querySelector('.mf-option-group--cards');
    return {
      chips: !!chipsGrp,
      chipsInput: chipsGrp ? (chipsGrp.querySelector('input.mf-option-control')?.type) : null,
      chipsCount: chipsGrp ? chipsGrp.querySelectorAll('.mf-option-item').length : 0,
      cards: !!cardsGrp,
      cardsInput: cardsGrp ? (cardsGrp.querySelector('input.mf-option-control')?.type) : null,
      cardCheck: cardsGrp ? !!cardsGrp.querySelector('.mf-option-check') : false,
    };
  });
  console.log('  client DOM:', JSON.stringify(client));
  ok('client: chip group present, checkbox inputs', client.chips && client.chipsInput === 'checkbox' && client.chipsCount === 3);
  ok('client: card group present, radio inputs + check', client.cards && client.cardsInput === 'radio' && client.cardCheck);
  await shot(page, 'qa-cc-2-render.png');

  // Selectable behavior: chips=multi, cards=single.
  const behavior = await page.evaluate(() => {
    const chipInputs = Array.from(document.querySelectorAll('.mf-option-group--chips .mf-option-control'));
    const cardInputs = Array.from(document.querySelectorAll('.mf-option-group--cards .mf-option-control'));
    chipInputs[0]?.click(); chipInputs[1]?.click();
    const chipsMulti = chipInputs[0]?.checked && chipInputs[1]?.checked;
    cardInputs[0]?.click();
    const c0 = cardInputs[0]?.checked;
    cardInputs[1]?.click();
    const cardsSingle = !cardInputs[0]?.checked && cardInputs[1]?.checked;
    return { chipsMulti, cardsSingle, c0 };
  });
  ok('Chips = multi-select (2 stay checked)', behavior.chipsMulti);
  ok('Cards = single-select (picking 2nd deselects 1st)', behavior.cardsSingle);
  await page.waitForTimeout(300);
  await shot(page, 'qa-cc-3-selected.png');

  const fatal = errs.filter(e => /Cannot read|is not a function|TypeError|undefined is not/.test(e));
  ok('no fatal console errors', fatal.length === 0, fatal.slice(0, 2).join(' | '));

  console.log(`\n===== RESULT: ${fail ? '❌ ' + fail + ' FAILED' : '✅ ALL PASS'} =====`);
  if (errs.length) console.log('console errors:', errs.slice(-5));
} catch (e) { console.error('FATAL', e); fail++; await shot(page, 'qa-cc-error.png').catch(() => {}); } finally { await browser.close(); process.exit(fail ? 1 : 0); }
