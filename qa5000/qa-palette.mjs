// [2026-06-27 ①] Prove the wizard's full field palette emits BUILDER-SAFE MegaForm
// fields for the real registry types (Composite presets, Select, File, Signature, Date…).
// Blank form → add curated + "more" field types → Create → builder boots (no crash) → the
// schema has the right types (Composite with widgetProps.preset, Select, File, Signature…).
import { launch, login, BASE, OUT, shot } from './lib.mjs';
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${x ? '  — ' + x : ''}`); };

const { browser, page, errs } = await launch(false);
try {
  if (!await login(page)) { console.log('LOGIN FAILED'); process.exit(2); }
  await page.goto(`${BASE}/?mfpanel=dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  await page.evaluate(() => { try { window.MegaFormWizard?.open(); } catch {} });
  await page.waitForSelector('#mf-wizard-root', { timeout: 8000 }).catch(() => {});
  ok('wizard opened', await page.$('#mf-wizard-root') !== null);

  // Setup: name + Blank.
  await page.fill('#mf-wizard-root .mfw-in', 'Palette QA');
  const blank = page.locator('#mf-wizard-root .mfw-pick', { hasText: 'Blank Form' }).first();
  if (await blank.count()) await blank.click();
  await page.waitForTimeout(300);
  await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click(); // → Fields
  await page.waitForTimeout(600);

  const addTile = async (label) => {
    const t = page.locator('#mf-wizard-root .mfw-pick', { hasText: new RegExp('^' + label + '$') }).first();
    if (await t.count()) { await t.click(); await page.waitForTimeout(180); return true; }
    return false;
  };
  // Curated tiles.
  for (const l of ['Short Text', 'Email', 'Phone Number', 'Full Name', 'Dropdown', 'Checkbox', 'Date', 'Rating', 'File Upload']) await addTile(l);
  // Expand "More fields" and add advanced/composite presets.
  const more = page.locator('#mf-wizard-root').getByRole('button', { name: /more fields/i }).first();
  if (await more.count()) { await more.click(); await page.waitForTimeout(300); }
  for (const l of ['Signature', 'Address', 'SSN', 'Multi-Select']) await addTile(l);
  await page.waitForTimeout(300);
  await shot(page, 'qa-palette-1-fields.png');

  // Through to Create.
  const cont = async () => { await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click(); await page.waitForTimeout(500); };
  await cont(); await cont(); await cont(); // workflow, design, publish
  await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.cta').first().click();

  let booted = false;
  for (let i = 0; i < 45; i++) {
    booted = await page.evaluate(() => { const B = window.MegaFormBuilder; return !!(B && B.state && B.state.schema && B.state.schema.fields && B.state.schema.fields.length); }).catch(() => false);
    if (booted) break; await page.waitForTimeout(1000);
  }
  const url = page.url();
  const formId = (url.match(/formId=(\d+)/) || [])[1];
  ok('redirected into builder', /mfpanel=builder&formId=\d+/.test(url), url);
  ok('builder booted (no crash)', booted);
  await page.waitForTimeout(1200);

  const info = await page.evaluate(() => {
    const B = window.MegaFormBuilder; const s = B && B.state && B.state.schema;
    if (!s) return null;
    const fields = (s.fields || []).map(f => ({ type: f.type, preset: (f.widgetProps && f.widgetProps.preset) || null, opts: (f.options || []).length, file: !!f.fileSettings }));
    const presets = fields.filter(f => f.type === 'Composite').map(f => f.preset);
    const types = fields.map(f => f.type);
    return { count: fields.length, types, presets, fields };
  });
  console.log('  built schema:', JSON.stringify(info && { count: info.count, types: info.types, presets: info.presets }));
  ok('schema has many fields', !!(info && info.count >= 10), (info && info.count) + ' fields');
  ok('Composite preset "name" (Full Name)', !!(info && info.presets.includes('name')));
  ok('Composite preset "address"', !!(info && info.presets.includes('address')));
  ok('Composite preset "ssn"', !!(info && info.presets.includes('ssn')));
  ok('Composite text family (Short Text/Email/Phone)', !!(info && info.presets.includes('text') && info.presets.includes('email') && info.presets.includes('phone')));
  ok('Select type present (Dropdown/Multi-Select)', !!(info && info.types.includes('Select')));
  ok('File type present', !!(info && info.types.includes('File')));
  ok('Signature type present', !!(info && info.types.includes('Signature')));
  ok('Date + Rating present', !!(info && info.types.includes('Date') && info.types.includes('Rating')));

  // Render the form anonymously — none of the field types should break the renderer.
  if (formId) {
    const render = await page.evaluate(async (id) => { const r = await fetch('/api/MegaForm/render/' + id, { credentials: 'same-origin' }); return { status: r.status, len: (await r.text()).length }; }, formId);
    console.log('  render:', JSON.stringify(render), 'formId:', formId);
    ok('render 200 (renderer handles all field types)', render.status === 200 && render.len > 1000);
    await page.goto(`${BASE}/api/MegaForm/render/${formId}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, 'qa-palette-2-render.png');
  }

  const fatal = errs.filter(e => /Cannot read|undefined|is not a function|TypeError/.test(e));
  ok('no fatal builder console errors', fatal.length === 0, fatal.slice(0, 3).join(' | '));

  console.log(`\n===== RESULT: ${fail ? '❌ ' + fail + ' FAILED' : '✅ ALL PASS'} =====`);
  if (errs.length) console.log('console errors (last 6):', errs.slice(-6));
} catch (e) { console.error('FATAL', e); fail++; await shot(page, 'qa-palette-error.png').catch(() => {}); } finally { await browser.close(); process.exit(fail ? 1 : 0); }
