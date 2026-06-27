// [2026-06-27 ③] Prove premium templates are EDITABLE in the wizard: the Fields step shows
// the premium fields per step and lets you ADD/REMOVE them; on Create, customHtml is
// reconciled (new tokens land in the right data-step panel; removed fields cleaned) and the
// form still renders + the data-step shell stays intact.
import { launch, login, BASE, OUT, shot } from './lib.mjs';
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${x ? '  — ' + x : ''}`); };
const tokenKeys = (html) => { const s = new Set(); const r = /\{\{field:([a-zA-Z0-9_\-]+)\}\}/g; let m; while ((m = r.exec(html || '')) !== null) s.add(m[1]); return [...s]; };
const stepCount = (html) => (String(html || '').match(/data-step\s*=/g) || []).length;

const { browser, page, errs } = await launch(false);
try {
  if (!await login(page)) { console.log('LOGIN FAILED'); process.exit(2); }
  await page.goto(`${BASE}/?mfpanel=dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Baseline: fetch the catalog, pick a premium multi-step template (prefer Bulgaria).
  const base = await page.evaluate(async () => {
    const root = document.getElementById('mf-dashboard-root') || document.querySelector('[data-mf-module-id]');
    const moduleId = root ? Number(root.getAttribute('data-mf-module-id') || 0) : 0, siteId = root ? Number(root.getAttribute('data-mf-site-id') || 0) : 0;
    const h = { Accept: 'application/json' }; if (window.__MF_TOKEN) h['Authorization'] = 'Bearer ' + window.__MF_TOKEN;
    if (moduleId) h['X-OQTANE-MODULEID'] = String(moduleId); if (siteId) h['X-OQTANE-SITEID'] = String(siteId);
    const r = await fetch('/api/MegaForm/Permissions/Catalog?formId=0', { credentials: 'same-origin', headers: h }).catch(() => null);
    const list = await (await fetch('/api/MegaForm/BuilderTemplates/List' + (moduleId ? ('?authmoduleid=' + moduleId + '&authsiteid=' + siteId) : ''), { credentials: 'same-origin', headers: h })).json();
    const prem = list.filter(t => { const s = t.settings || t.Settings || {}; return !!(s.customHtml || s.CustomHtml); });
    const pick = prem.find(t => /bulgaria/i.test(t.title || t.Title || '')) || prem[0];
    const s = pick.settings || pick.Settings || {};
    return { title: pick.title || pick.Title, html: s.customHtml || s.CustomHtml || '' };
  });
  const baseTokens = tokenKeys(base.html), baseSteps = stepCount(base.html);
  console.log('  baseline template:', base.title, '| tokens:', baseTokens.length, '| data-step:', baseSteps);
  ok('baseline is a multi-step premium template', baseSteps > 1 && baseTokens.length > 3);

  // Open wizard → pick that premium template.
  await page.evaluate(() => { try { window.MegaFormWizard?.open(); } catch {} });
  await page.waitForSelector('#mf-wizard-root', { timeout: 8000 }).catch(() => {});
  await page.fill('#mf-wizard-root .mfw-in', 'Premium Edit QA');
  await page.waitForTimeout(2500);
  const card = page.locator('#mf-wizard-root .mfw-pick', { hasText: base.title }).first();
  ok('premium template card present', await card.count() > 0, base.title);
  await card.click();
  await page.waitForTimeout(500);

  // → Fields (premium editor). Must show editable per-step cards.
  await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click();
  await page.waitForTimeout(700);
  const editor = await page.evaluate(() => {
    const root = document.getElementById('mf-wizard-root');
    return { isEditor: /Edit /.test(root.textContent) && !!root.querySelector('select.mfw-in'), stepCards: root.querySelectorAll('.mfw-card').length, rows: root.querySelectorAll('button[title="Remove field"]').length, selects: root.querySelectorAll('select.mfw-in').length };
  });
  console.log('  premium editor:', JSON.stringify(editor));
  ok('premium editor visible (per-step add/remove)', editor.isEditor && editor.stepCards >= 2 && editor.rows > 3);
  await shot(page, 'qa-pedit-1-editor.png');

  // ADD a Short Text to step 1 and an Email to step 2 (per-step add selects).
  const selects = page.locator('#mf-wizard-root .mfw-card select.mfw-in');
  await selects.nth(0).selectOption('text'); await page.waitForTimeout(500);
  await selects.nth(1).selectOption('email'); await page.waitForTimeout(500);
  // REMOVE the last field of the last step.
  const lastCardTrash = page.locator('#mf-wizard-root .mfw-card').last().locator('button[title="Remove field"]').last();
  if (await lastCardTrash.count()) { await lastCardTrash.click(); await page.waitForTimeout(500); }
  await shot(page, 'qa-pedit-2-edited.png');

  // Create.
  const cont = async () => { await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click(); await page.waitForTimeout(500); };
  await cont(); await cont(); await cont(); // workflow, design, publish
  await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.cta').first().click();

  let booted = false;
  for (let i = 0; i < 45; i++) { booted = await page.evaluate(() => { const B = window.MegaFormBuilder; return !!(B && B.state && B.state.schema && B.state.schema.fields && B.state.schema.fields.length); }).catch(() => false); if (booted) break; await page.waitForTimeout(1000); }
  const url = page.url(); const formId = (url.match(/formId=(\d+)/) || [])[1];
  ok('builder booted', booted, url);

  const after = await page.evaluate(() => { const s = window.MegaFormBuilder.state.schema; const set = s.settings || {}; return { html: String(set.customHtml || ''), fields: (s.fields || []).length }; });
  const afterTokens = tokenKeys(after.html), afterSteps = stepCount(after.html);
  const newTokens = afterTokens.filter(k => baseTokens.indexOf(k) < 0);
  const orphanLabels = (after.html.match(/<label\b[^>]*au-field[^>]*>(?:(?!<\/label>)[\s\S])*?<\/label>/gi) || []).filter(b => !/\{\{field:/.test(b) && !/<(?:input|select|textarea)\b/i.test(b)).length;
  console.log('  after edit: tokens', afterTokens.length, '(base', baseTokens.length + ') new:', JSON.stringify(newTokens), '| data-step:', afterSteps, '| formId', formId);
  ok('data-step panels intact (structure preserved)', afterSteps === baseSteps, afterSteps + ' vs ' + baseSteps);
  ok('net token count = base + 1 (added 2, removed 1)', afterTokens.length === baseTokens.length + 1, afterTokens.length + ' vs ' + (baseTokens.length + 1));
  ok('new field tokens inserted (≥1 new)', newTokens.length >= 1, newTokens.join(','));
  ok('no orphan au-field labels after reconcile', orphanLabels === 0, orphanLabels + ' orphan labels');
  // New tokens must sit INSIDE a data-step panel (not appended outside the shell).
  const newInsideStep = newTokens.every(k => { const p = after.html.indexOf('{{field:' + k + '}}'); const before = after.html.slice(0, p); return /data-step\s*=/.test(before); });
  ok('new tokens are inside a data-step panel', newTokens.length === 0 || newInsideStep);

  // Render the edited premium form.
  if (formId) {
    const render = await page.evaluate(async (id) => { const r = await fetch('/api/MegaForm/render/' + id, { credentials: 'same-origin' }); const t = await r.text(); return { status: r.status, dataStep: (t.match(/data-step\s*=/g) || []).length, len: t.length }; }, formId);
    console.log('  render:', JSON.stringify(render));
    ok('render 200 + premium shell intact', render.status === 200 && render.dataStep === baseSteps);
    await page.goto(`${BASE}/api/MegaForm/render/${formId}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await shot(page, 'qa-pedit-3-render.png');
  }

  console.log(`\n===== RESULT: ${fail ? '❌ ' + fail + ' FAILED' : '✅ ALL PASS'} =====`);
  if (errs.length) console.log('console errors (last 6):', errs.slice(-6));
} catch (e) { console.error('FATAL', e); fail++; await shot(page, 'qa-pedit-error.png').catch(() => {}); } finally { await browser.close(); process.exit(fail ? 1 : 0); }
