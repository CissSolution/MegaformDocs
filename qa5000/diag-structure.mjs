// Deep structure diagnosis of a premium wizard form's customHtml: where do field
// placeholders sit relative to data-step blocks, are any duplicated / outside steps,
// does a Row sub-field also have its own top-level token, is customScript present.
import { launch, login, getForm } from './lib.mjs';

const ID = Number(process.argv[2] || 13);
const { browser, page } = await launch(true);
try {
  await login(page);
  const f = await getForm(page, ID);
  const schema = JSON.parse(f.schemaJson || f.SchemaJson || '{}');
  const settings = JSON.parse(f.settingsJson || f.SettingsJson || '{}');
  const html = settings.customHtml || '';
  console.log('=== form', ID, '| title:', f.title, '| customHtml len:', html.length, '===');

  // 1) field keys (incl Row sub-fields)
  const flat = [];
  (function walk(arr, parentRow) { for (const x of arr || []) { if (x.type === 'Row' && Array.isArray(x.columns)) { flat.push({ key: x.key, type: 'Row' }); for (const c of x.columns) walk(c.fields || [], x.key); } else if (x.key) flat.push({ key: x.key, type: x.type, parentRow }); } })(schema.fields);
  console.log('\nSCHEMA fields:', flat.map(x => x.key + (x.parentRow ? `(in ${x.parentRow})` : '')).join(', '));

  // 2) all {{field:KEY}} tokens with their position + which data-step block they fall in
  const stepMarks = [];
  const re = /<([a-z0-9]+)[^>]*\bdata-step\s*=\s*["']?(\d+)["']?[^>]*>/gi; let m;
  while ((m = re.exec(html)) !== null) stepMarks.push({ idx: m.index, step: parseInt(m[2], 10) });
  console.log('\ndata-step blocks:', stepMarks.map(s => s.step).join(', '), '(count ' + stepMarks.length + ')');
  function stepOfPos(pos) { let s = 'OUTSIDE'; for (const mk of stepMarks) { if (pos >= mk.idx) s = mk.step; } return s; }

  const tokRe = /\{\{field:([a-zA-Z0-9_\-]+)\}\}/g; const toks = []; let t;
  while ((t = tokRe.exec(html)) !== null) toks.push({ key: t[1], pos: t.index, step: stepOfPos(t.index) });
  console.log('\nFIELD TOKENS in customHtml (key @ step):');
  const counts = {};
  for (const x of toks) { counts[x.key] = (counts[x.key] || 0) + 1; console.log(`  {{field:${x.key}}} @ step ${x.step}`); }

  // 3) duplicates + Row-subfield-with-own-token + outside-step
  const dups = Object.entries(counts).filter(([, n]) => n > 1);
  const rowSub = flat.filter(x => x.parentRow);
  const subWithToken = rowSub.filter(x => counts[x.key]);
  const outside = toks.filter(x => x.step === 'OUTSIDE');
  const schemaKeys = new Set(flat.map(x => x.key));
  const orphanToks = [...new Set(toks.map(x => x.key))].filter(k => !schemaKeys.has(k));
  const missing = flat.filter(x => x.type !== 'Row' && !x.parentRow && !counts[x.key]).map(x => x.key);

  console.log('\n=== PROBLEMS ===');
  console.log('DUPLICATE tokens   :', dups.length ? dups.map(([k, n]) => `${k}×${n}`).join(', ') : 'none');
  console.log('Row sub-field w/ own token (should render via parent Row):', subWithToken.length ? subWithToken.map(x => x.key + ' in ' + x.parentRow).join(', ') : 'none');
  console.log('Tokens OUTSIDE any step block:', outside.length ? outside.map(x => x.key).join(', ') : 'none');
  console.log('ORPHAN tokens (no field)     :', orphanToks.length ? orphanToks.join(', ') : 'none');
  console.log('MISSING (field w/o token)    :', missing.length ? missing.join(', ') : 'none');

  // 4) customScript / wizard present?
  const cs = settings.customScripts || settings.CustomScripts || {};
  console.log('\ncustomScripts keys:', Object.keys(cs).join(', ') || '(none)');
  const stepperItems = (html.match(/data-step-indicator|stepper|mfp-step\b|au-step/gi) || []).length;
  console.log('stepper markers in html:', stepperItems);

  // 5) show the tail of customHtml (where bad appends usually land)
  console.log('\n=== customHtml TAIL (last 600 chars) ===\n' + html.slice(-600));
} catch (e) { console.error('FATAL', e); } finally { await browser.close(); }
