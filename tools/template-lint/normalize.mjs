// Structure normalizer — converts a template JSON to manifest v2 shape.
// SAFE-BY-CONSTRUCTION rules (mirrors BuilderTemplateCatalogStore.Normalize serving):
//   • served customHtml/customCss = top-level camelCase ?? settings  → that exact
//     byte content becomes settings.* (single source), top-level + dual-case removed.
//   • customScripts/customContent/theme/themeSelector: top-level copy removed ONLY
//     when settings already has the key (server drops top-level anyway); when settings
//     lacks it the top-level key is LEFT untouched (dormant — behavior preserved).
//   • adds manifestVersion:2 + settings.themeCompatibility from policy-map.json.
// usage: node normalize.mjs <folder> [--apply]   (dry-run prints actions without --apply)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const folder = path.resolve(process.argv[2]);
const apply = process.argv.includes('--apply');
const policyMap = JSON.parse(fs.readFileSync(path.join(here, 'policy-map.json'), 'utf8'));

const served = (raw, s, key) =>
  (typeof raw[key] === 'string' && raw[key] !== '') ? raw[key]
    : (typeof s[key] === 'string' ? s[key] : '');

for (const f of fs.readdirSync(folder).filter((x) => x.endsWith('.json')).sort()) {
  const file = path.join(folder, f);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const s = (raw.settings && typeof raw.settings === 'object') ? raw.settings : (raw.settings = {});
  const actions = [];

  for (const key of ['customHtml', 'customCss']) {
    const cap = key.charAt(0).toUpperCase() + key.slice(1);
    const val = served(raw, s, key);
    if (s[key] !== val) { s[key] = val; actions.push(`settings.${key} := served bytes (${val.length}B)`); }
    if (key in raw) { delete raw[key]; actions.push(`del top.${key}`); }
    if (cap in raw) { delete raw[cap]; actions.push(`del top.${cap} (dual-case)`); }
    if (cap in s) { delete s[cap]; actions.push(`del settings.${cap} (dual-case)`); }
  }

  for (const key of ['customScripts', 'customContent', 'theme', 'themeSelector']) {
    if (key in raw && s[key] != null) { delete raw[key]; actions.push(`del top.${key} (settings copy exists)`); }
    else if (key in raw) actions.push(`KEEP top.${key} (dormant — settings lacks it)`);
  }

  const slug = raw.slug || f.replace(/\.json$/, '');
  const pol = policyMap[slug] || policyMap[f] || null;
  if (!pol) { actions.push('WARN: no policy-map entry'); }
  else {
    s.themeCompatibility = pol;
    raw.manifestVersion = 2;
    actions.push(`manifest v2 policy=${pol.policy}`);
  }

  console.log(`\n${f}:`);
  for (const a of actions) console.log('  - ' + a);
  if (apply) fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
}
console.log(apply ? '\nAPPLIED.' : '\nDRY RUN (pass --apply to write).');
