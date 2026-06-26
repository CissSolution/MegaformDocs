import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const OUT = join(process.cwd(), 'qa5000', 'out');
const IDS = [4, 5, 9, 10, 11, 12];

function dispOf(f) {
  const d = f.optionDisplay || f.choiceDisplay || f.optionVariant ||
    (f.properties && f.properties.optionDisplay) || (f.widgetProps && f.widgetProps.optionDisplay) || '';
  return d;
}
function walk(fields, cb) {
  for (const f of (fields || [])) {
    cb(f);
    if (f.type === 'Row' && Array.isArray(f.columns)) for (const c of f.columns) walk(c.fields || [], cb);
  }
}

for (const id of IDS) {
  let form;
  try { form = JSON.parse(readFileSync(join(OUT, `form-${id}.json`), 'utf8')); } catch (e) { console.log(`form ${id}: no file`); continue; }
  const schema = JSON.parse(form.SchemaJson || form.schemaJson || '{}');
  const settings = JSON.parse(form.SettingsJson || form.settingsJson || '{}');
  const html = settings.customHtml || '';
  const css = settings.customCss || '';
  console.log('\n========== FORM ' + id + ' ==========');
  console.log('formLevel keys:', Object.keys(form).filter(k => /guide|slug|template|name|title/i.test(k)).map(k => k + '=' + JSON.stringify(form[k]).slice(0, 40)).join(' '));
  console.log('settings keys:', Object.keys(settings).join(','));
  console.log('theme:', settings.theme, '| templateGuideSlug:', settings.templateGuideSlug, '| multiPage:', settings.multiPage);
  console.log('customContent keys:', Object.keys(settings.customContent || {}).join(','));
  console.log('customScripts keys:', Object.keys(settings.customScripts || {}).join(','));
  // tokens
  const tok = [...new Set((html.match(/\{\{(field|content|form|script):[a-zA-Z0-9_\-]+\}\}/g) || []))];
  console.log('tokens(' + tok.length + '):', tok.join(' '));
  // step mechanism
  const dataStep = (html.match(/data-step\s*=\s*["']?(\d+)/g) || []);
  const stepperCls = [...new Set((html.match(/class="[^"]*(step|wizard|rail|nav)[^"]*"/gi) || []))].slice(0, 6);
  console.log('data-step nodes:', dataStep.length, '| step/rail classes:', stepperCls.join(' | '));
  // fields
  const fields = schema.fields || [];
  const lines = [];
  walk(fields, f => {
    if (f.type === 'Row') return;
    const d = dispOf(f);
    const opts = Array.isArray(f.options) ? f.options.length : 0;
    lines.push(`${f.key}<${f.type}${d ? ':' + d : ''}${opts ? ' opt=' + opts : ''}>`);
  });
  console.log('FIELDS(' + lines.length + '):', lines.join(' '));
  // root selector guess
  const root = (html.match(/<div[^>]*class="(mfp[^"]*)"/) || [])[1] || '';
  console.log('rootClass:', root);
}
