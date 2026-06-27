// [2026-06-27] A wizard-built STANDARD form (chips/card/row/…) must render with the SAME
// clean "pure-grid" premium card the AI creator emits — NO "card thừa" double frame — without
// being a premium template. Compare the wizard form's render structure to an AI form's.
import { launch, login, BASE, OUT, shot } from './lib.mjs';
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${x ? '  — ' + x : ''}`); };
// Count nested "card" frames around the form: an outer .mf-form-wrapper that is ALSO
// card-styled (border+bg+radius) WHILE containing an inner .mfp-card == double card ("thừa").
const AI_FORM_ID = process.argv[2] || '29';

const { browser, page, errs } = await launch(false);
try {
  if (!await login(page)) { console.log('LOGIN FAILED'); process.exit(2); }
  await page.goto(`${BASE}/?mfpanel=dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Build a standard form with the premium building blocks.
  await page.evaluate(() => { try { window.MegaFormWizard?.open(); } catch {} });
  await page.waitForSelector('#mf-wizard-root', { timeout: 8000 }).catch(() => {});
  await page.fill('#mf-wizard-root .mfw-in', 'Wizard Premium Look QA');
  const blank = page.locator('#mf-wizard-root .mfw-pick', { hasText: 'Blank Form' }).first();
  if (await blank.count()) await blank.click();
  await page.waitForTimeout(300);
  await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click();
  await page.waitForTimeout(600);
  const addTile = async (label) => { const t = page.locator('#mf-wizard-root .mfw-pick', { hasText: new RegExp('^' + label.replace(/[()/]/g, '\\$&') + '$') }).first(); if (await t.count()) { await t.click(); await page.waitForTimeout(220); } };
  for (const l of ['Full Name', 'Chips / Tags', 'Card / Section', 'Email', 'Short Text']) await addTile(l);
  const cont = async () => { await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click(); await page.waitForTimeout(500); };
  await cont(); await cont(); await cont();
  await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.cta').first().click();

  let booted = false;
  for (let i = 0; i < 45; i++) { booted = await page.evaluate(() => { const B = window.MegaFormBuilder; return !!(B && B.state && B.state.schema && B.state.schema.fields && B.state.schema.fields.length); }).catch(() => false); if (booted) break; await page.waitForTimeout(1000); }
  const formId = (page.url().match(/formId=(\d+)/) || [])[1];
  ok('wizard form created', booted && !!formId, 'formId ' + formId);

  // The wizard form's settings must carry the SAME pure-grid shell as AI.
  const sx = await page.evaluate(() => { const set = window.MegaFormBuilder.state.schema.settings || {}; const html = String(set.customHtml || ''); return { pureGrid: /mfp-pure-grid/.test(html), card: /mfp-card/.test(html), theme: set.theme }; });
  console.log('  wizard settings:', JSON.stringify(sx));
  ok('wizard form uses pure-grid shell (mfp-pure-grid)', sx.pureGrid);
  ok('wizard form has single mfp-card', sx.card);
  ok('wizard form theme = pure-grid-premium', sx.theme === 'pure-grid-premium');

  // Structural compare wizard render vs AI render.
  const analyze = async (id) => page.evaluate(async (id) => {
    const r = await fetch('/api/MegaForm/render/' + id, { credentials: 'same-origin' });
    const t = await r.text();
    const doc = new DOMParser().parseFromString(t, 'text/html');
    const pureGrid = !!doc.querySelector('.mfp-pure-grid');
    const cards = doc.querySelectorAll('.mfp-card').length;
    // double card = an .mf-form-wrapper that is card-styled by compat CSS while wrapping .mfp-card
    const wrappers = doc.querySelectorAll('.mf-form-wrapper').length;
    const chips = !!doc.querySelector('[class*="chip"], [class*="multiselect"], select[multiple], .mf-select');
    return { status: r.status, pureGrid, cards, wrappers, hasMfp: !!doc.querySelector('.mfp') };
  }, id);
  const w = await analyze(formId);
  const a = await analyze(AI_FORM_ID);
  console.log('  wizard render:', JSON.stringify(w), '| AI(' + AI_FORM_ID + ') render:', JSON.stringify(a));
  ok('wizard render 200', w.status === 200);
  ok('wizard render uses pure-grid (.mfp-pure-grid) like AI', w.pureGrid && a.pureGrid);
  ok('wizard render single .mfp-card (no extra card)', w.cards === 1, w.cards + ' mfp-card');
  ok('wizard structure matches AI (mfp + pure-grid + 1 card)', w.hasMfp === a.hasMfp && w.pureGrid === a.pureGrid && w.cards === a.cards, `w=${JSON.stringify(w)} a=${JSON.stringify(a)}`);

  // Visual screenshots for side-by-side.
  await page.goto(`${BASE}/api/MegaForm/render/${formId}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200); await shot(page, 'qa-wizlook-1-wizard.png');
  await page.goto(`${BASE}/api/MegaForm/render/${AI_FORM_ID}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200); await shot(page, 'qa-wizlook-2-ai.png');

  console.log(`\n===== RESULT: ${fail ? '❌ ' + fail + ' FAILED' : '✅ ALL PASS'} =====`);
  if (errs.length) console.log('console errors:', errs.slice(-5));
} catch (e) { console.error('FATAL', e); fail++; await shot(page, 'qa-wizlook-error.png').catch(() => {}); } finally { await browser.close(); process.exit(fail ? 1 : 0); }
