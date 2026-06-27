// Probe BuilderTemplates/List on :5000 to learn the real catalog shape the wizard will consume.
import { launch, login, BASE } from './lib.mjs';
const { browser, page } = await launch(true);
try {
  if (!await login(page)) { console.log('LOGIN FAILED'); process.exit(2); }
  await page.goto(`${BASE}/?mfpanel=dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  const out = await page.evaluate(async () => {
    const root = document.getElementById('mf-dashboard-root') || document.querySelector('[data-mf-module-id]');
    const moduleId = root ? Number(root.getAttribute('data-mf-module-id') || root.getAttribute('data-module-id') || 0) : 0;
    const siteId = root ? Number(root.getAttribute('data-mf-site-id') || root.getAttribute('data-site-id') || 0) : 0;
    const bearer = window.__MF_TOKEN;
    let url = '/api/MegaForm/BuilderTemplates/List';
    if (moduleId) url += '?authmoduleid=' + moduleId + '&authsiteid=' + siteId;
    const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    if (moduleId) headers['X-OQTANE-MODULEID'] = String(moduleId);
    if (siteId) headers['X-OQTANE-SITEID'] = String(siteId);
    const r = await fetch(url, { credentials: 'same-origin', headers });
    if (!r.ok) return { status: r.status, error: (await r.text()).slice(0, 200) };
    const list = await r.json();
    return {
      status: r.status, count: list.length,
      sample: list.slice(0, 60).map(t => ({
        id: t.id || t.Id, title: t.title || t.Title,
        cat: t.category || t.Category, folder: t.folder || t.Folder, rel: t.relativePath || t.RelativePath,
        nFields: (t.fields || t.Fields || []).length,
        hasHtml: !!((t.settings || t.Settings || {}).customHtml || (t.settings || t.Settings || {}).CustomHtml || t.customHtml || t.CustomHtml),
        hasScripts: Object.keys(((t.settings || t.Settings || {}).customScripts) || ((t.settings || t.Settings || {}).CustomScripts) || {}).length,
      })),
    };
  });
  console.log(JSON.stringify(out, null, 1));
} catch (e) { console.error('FATAL', e); } finally { await browser.close(); }
