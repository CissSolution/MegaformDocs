// One-shot: inspect form 9 (australia) live state on :5000.
import crypto from 'node:crypto';
import { launch, login, getForm } from './lib.mjs';
const sha = s => crypto.createHash('sha256').update(String(s ?? ''), 'utf8').digest('hex').slice(0, 12);

const { browser, page } = await launch(true);
try {
  const ok = await login(page);
  if (!ok) { console.log('LOGIN FAILED'); process.exit(1); }
  const id = Number(process.argv[2] || 9);
  const f = await getForm(page, id);
  if (f.__error) { console.log('getForm error:', f.__error); process.exit(1); }
  // settings can be nested or stringified depending on endpoint
  let settings = f.Settings || f.settings || {};
  if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch {} }
  let schema = f.Schema || f.schema || {};
  if (typeof schema === 'string') { try { schema = JSON.parse(schema); } catch {} }
  const sj = f.SettingsJson || f.settingsJson;
  if (sj && typeof sj === 'string') { try { settings = JSON.parse(sj); } catch {} }
  const out = {
    id,
    title: f.Title || f.title || schema.title,
    status: f.Status || f.status,
    theme: settings.theme,
    templateGuideSlug: settings.templateGuideSlug ?? '(UNDEFINED)',
    customHtml_len: (settings.customHtml || '').length,
    customCss_len: (settings.customCss || '').length,
    customCss_hash: sha(settings.customCss || ''),
    themeCssOverrides: settings.themeCssOverrides ? Object.keys(settings.themeCssOverrides) : [],
    fieldCount: Array.isArray(schema.fields) ? schema.fields.length : '?',
    settingsKeys: Object.keys(settings).slice(0, 30),
  };
  console.log(JSON.stringify(out, null, 2));
} finally { await browser.close(); }
