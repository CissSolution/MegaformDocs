// [2026-06-27 ④] Prove the Form Creation Wizard's Workflow step uses REAL site
// roles/users. Two layers:
//   (a) SERVER: GET /api/MegaForm/Permissions/Catalog?formId=0 → 200 + real principals
//       (the formId=0 site-level catalog change).
//   (b) UI: wizard → Workflow → approver dropdown lists real roles + "from this site" hint.
import { launch, login, BASE, OUT, shot } from './lib.mjs';
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${x ? '  — ' + x : ''}`); };

const { browser, page, errs } = await launch(false);
try {
  if (!await login(page)) { console.log('LOGIN FAILED'); process.exit(2); }
  await page.goto(`${BASE}/?mfpanel=dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);

  // ── (a) SERVER: formId=0 site-level catalog ────────────────────────────────
  const cat = await page.evaluate(async () => {
    const root = document.getElementById('mf-dashboard-root') || document.querySelector('[data-mf-module-id]');
    const moduleId = root ? Number(root.getAttribute('data-mf-module-id') || root.getAttribute('data-module-id') || 0) : 0;
    const siteId = root ? Number(root.getAttribute('data-mf-site-id') || root.getAttribute('data-site-id') || 0) : 0;
    const bearer = window.__MF_TOKEN;
    let url = '/api/MegaForm/Permissions/Catalog?formId=0';
    if (moduleId) url += '&authmoduleid=' + moduleId;
    if (siteId) url += '&authsiteid=' + siteId;
    const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    if (moduleId) headers['X-OQTANE-MODULEID'] = String(moduleId);
    if (siteId) headers['X-OQTANE-SITEID'] = String(siteId);
    try {
      const r = await fetch(url, { credentials: 'same-origin', headers });
      const body = r.ok ? await r.json() : await r.text();
      if (!r.ok) return { status: r.status, error: String(body).slice(0, 200) };
      const c = body.catalog || body.Catalog || {};
      const ps = c.principals || c.Principals || [];
      const roles = ps.filter(p => p && (p.isRole || p.IsRole)).map(p => p.roleName || p.RoleName || p.displayName || p.DisplayName);
      const users = ps.filter(p => p && (p.isUser || p.IsUser)).map(p => p.displayName || p.DisplayName || p.principalId || p.PrincipalId);
      return { status: r.status, moduleId, siteId, roleCount: roles.length, userCount: users.length, roles: roles.slice(0, 12), users: users.slice(0, 6) };
    } catch (e) { return { status: 0, error: String(e && e.message || e) }; }
  });
  console.log('  catalog(formId=0):', JSON.stringify(cat));
  ok('server: Catalog?formId=0 returns 200 (no longer 400)', cat.status === 200, 'status=' + cat.status + (cat.error ? ' ' + cat.error : ''));
  ok('server: catalog has real roles', (cat.roleCount || 0) > 0, (cat.roleCount || 0) + ' roles: ' + (cat.roles || []).join(', '));

  // ── (b) UI: wizard Workflow step ──────────────────────────────────────────
  let opened = await page.evaluate(() => { try { if (window.MegaFormWizard && window.MegaFormWizard.open) { window.MegaFormWizard.open(); return true; } } catch {} return false; });
  if (!opened) { const nf = page.locator('a.mf-btn, button.mf-btn').filter({ hasText: 'New Form' }).first(); if (await nf.count()) await nf.click(); }
  await page.waitForSelector('#mf-wizard-root', { timeout: 8000 }).catch(() => {});
  ok('wizard opened', await page.$('#mf-wizard-root') !== null);
  await page.waitForTimeout(700);

  // Setup: name (required to leave step 0), then Continue → Fields → Continue → Workflow.
  await page.fill('#mf-wizard-root .mfw-in', 'WF Roles QA');
  const cont = async () => { await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click(); await page.waitForTimeout(600); };
  await cont(); // → Fields
  await cont(); // → Workflow

  // Enable approval + add a step.
  await page.locator('#mf-wizard-root .mfw-toggle').first().click(); await page.waitForTimeout(400);
  const wfAdd = page.locator('#mf-wizard-root').getByRole('button', { name: /add step|first approval/i }).first();
  if (await wfAdd.count()) { await wfAdd.click(); await page.waitForTimeout(500); }

  // Give the catalog prefetch a moment (it usually resolved during Setup already).
  await page.waitForTimeout(800);
  const ui = await page.evaluate(() => {
    const root = document.getElementById('mf-wizard-root');
    if (!root) return null;
    const sel = root.querySelector('select.mfw-in');
    const opts = sel ? Array.from(sel.options).map(o => o.value) : [];
    const dl = root.querySelector('datalist#mfw-wf-users');
    const users = dl ? Array.from(dl.options).map(o => o.value) : [];
    const hint = (root.textContent.match(/\d+ roles · \d+ users from this site/) || [])[0]
      || (/Site directory unavailable/.test(root.textContent) ? 'FALLBACK: site directory unavailable' : '')
      || (/Loading site roles/.test(root.textContent) ? 'still loading' : '');
    return { roleOptions: opts, userCount: users.length, hint };
  });
  console.log('  wizard role dropdown:', JSON.stringify(ui));
  await shot(page, 'qa-wf-roles.png');
  ok('UI: role dropdown populated', !!(ui && ui.roleOptions && ui.roleOptions.length > 0));
  // Real Oqtane sites ship "Administrators" + "Registered Users". If the catalog loaded,
  // the dropdown must contain at least one of those (not just the static semantic list).
  const realMarkers = (ui ? ui.roleOptions : []).filter(r => /^(Administrators|Registered Users|All Users|Unauthenticated|Host Users)$/i.test(r));
  ok('UI: dropdown shows REAL site roles (not just static)', realMarkers.length > 0, 'real roles in dropdown: ' + realMarkers.join(', '));
  ok('UI: "from this site" hint shown', !!(ui && /from this site/.test(ui.hint)), 'hint="' + (ui && ui.hint) + '"');

  console.log(`\n===== RESULT: ${fail ? '❌ ' + fail + ' FAILED' : '✅ ALL PASS'} =====`);
  if (errs.length) console.log('console errors:', errs.slice(-6));
} catch (e) { console.error('FATAL', e); fail++; await shot(page, 'qa-wf-roles-error.png').catch(() => {}); } finally { await browser.close(); process.exit(fail ? 1 : 0); }
