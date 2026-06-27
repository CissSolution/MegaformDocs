// [2026-06-27 ②/③] Prove the wizard loads REAL templates and emits a PREMIUM
// (custom-shell) template FAITHFULLY: Setup → pick a premium library template →
// Fields shows the read-only premium notice → Create → builder opens with the
// template's customHtml/customCss/customScripts intact → render shows data-step shell.
import { launch, login, BASE, OUT, shot } from './lib.mjs';
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${x ? '  — ' + x : ''}`); };

const { browser, page, errs } = await launch(false);
try {
  if (!await login(page)) { console.log('LOGIN FAILED'); process.exit(2); }
  await page.goto(`${BASE}/?mfpanel=dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Open wizard.
  let opened = await page.evaluate(() => { try { if (window.MegaFormWizard?.open) { window.MegaFormWizard.open(); return true; } } catch {} return false; });
  if (!opened) { const nf = page.locator('a.mf-btn, button.mf-btn').filter({ hasText: 'New Form' }).first(); if (await nf.count()) await nf.click(); }
  await page.waitForSelector('#mf-wizard-root', { timeout: 8000 }).catch(() => {});
  ok('wizard opened', await page.$('#mf-wizard-root') !== null);

  // Setup: name + wait for the real template library to load.
  await page.fill('#mf-wizard-root .mfw-in', 'Premium Template QA');
  await page.waitForTimeout(2500); // template list fetch
  const libCount = await page.evaluate(() => {
    const root = document.getElementById('mf-wizard-root');
    const txt = root ? root.textContent : '';
    const m = txt.match(/\((\d+) from this site\)/);
    return m ? Number(m[1]) : 0;
  });
  ok('real template library loaded', libCount > 0, libCount + ' templates');

  // Pick the first PREMIUM card in the library (badge "Premium").
  const premiumCard = page.locator('#mf-wizard-root .mfw-pick', { has: page.locator('.mfw-badge', { hasText: 'Premium' }) }).first();
  ok('premium template card present', await premiumCard.count() > 0);
  const premiumTitle = await premiumCard.locator('b').first().textContent().catch(() => '');
  await premiumCard.click();
  await page.waitForTimeout(600);
  await shot(page, 'qa-tpl-1-setup.png');

  // Continue → Fields: must show the premium read-only notice (no palette).
  const cont = async () => { await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click(); await page.waitForTimeout(600); };
  await cont();
  const fieldsInfo = await page.evaluate(() => {
    const root = document.getElementById('mf-wizard-root');
    const txt = root ? root.textContent : '';
    return { isPremiumNotice: /Premium template/.test(txt) && /kept exactly as designed/.test(txt), hasPalette: !!root.querySelector('.mfw-pick') };
  });
  ok('Fields step shows premium notice (structure locked)', fieldsInfo.isPremiumNotice);
  ok('Fields step has NO editable palette for premium', !fieldsInfo.hasPalette);
  await shot(page, 'qa-tpl-2-fields-premium.png');

  // Through Workflow → Design → Publish → Create.
  await cont(); // Workflow
  await cont(); // Design
  await cont(); // Publish
  await shot(page, 'qa-tpl-3-publish.png');
  const createBtn = page.locator('#mf-wizard-root .mfw-foot .mfw-btn.cta').first();
  ok('Create Form button present', await createBtn.count() > 0);
  await createBtn.click();

  // Wait for builder boot.
  let booted = false;
  for (let i = 0; i < 45; i++) {
    booted = await page.evaluate(() => { const B = window.MegaFormBuilder; return !!(B && B.state && B.state.schema && B.state.schema.fields && B.state.schema.fields.length); }).catch(() => false);
    if (booted) break; await page.waitForTimeout(1000);
  }
  const url = page.url();
  const formId = (url.match(/formId=(\d+)/) || [])[1];
  ok('redirected into builder', /mfpanel=builder&formId=\d+/.test(url), url);
  ok('builder booted with schema', booted);
  await page.waitForTimeout(1200);

  // Inspect the created premium form's schema.
  const info = await page.evaluate(() => {
    const B = window.MegaFormBuilder; const s = B && B.state && B.state.schema;
    if (!s) return null;
    const set = s.settings || {};
    const html = String(set.customHtml || '');
    return {
      fields: (s.fields || []).length,
      hasCustomHtml: html.length > 100,
      steps: (html.match(/data-step\s*=/g) || []).length,
      hasCustomCss: String(set.customCss || '').length > 50,
      scripts: Object.keys(set.customScripts || {}).length,
    };
  });
  console.log('  created premium schema:', JSON.stringify(info), 'from template:', premiumTitle, 'formId:', formId);
  ok('faithful: customHtml preserved (custom-shell)', !!(info && info.hasCustomHtml));
  ok('faithful: data-step panels present', !!(info && info.steps > 0), (info && info.steps) + ' data-step');
  ok('faithful: customCss preserved', !!(info && info.hasCustomCss));
  ok('faithful: customScripts preserved (*_wizard)', !!(info && info.scripts > 0), (info && info.scripts) + ' scripts');

  // Render the new form anonymously and confirm the premium shell renders.
  if (formId) {
    const render = await page.evaluate(async (id) => {
      const r = await fetch('/api/MegaForm/render/' + id, { credentials: 'same-origin' });
      const t = await r.text();
      return { status: r.status, hasDataStep: /data-step\s*=/.test(t), len: t.length };
    }, formId);
    console.log('  render:', JSON.stringify(render));
    ok('render: premium shell renders (data-step in HTML)', render.status === 200 && render.hasDataStep);
    await page.goto(`${BASE}/api/MegaForm/render/${formId}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await shot(page, 'qa-tpl-4-render.png');
  }

  console.log(`\n===== RESULT: ${fail ? '❌ ' + fail + ' FAILED' : '✅ ALL PASS'} =====`);
  if (errs.length) console.log('console errors:', errs.slice(-6));
} catch (e) { console.error('FATAL', e); fail++; await shot(page, 'qa-tpl-error.png').catch(() => {}); } finally { await browser.close(); process.exit(fail ? 1 : 0); }
