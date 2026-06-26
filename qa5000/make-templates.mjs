// Build/refresh normalized premium template JSON sources from the LIVE form exports
// (live is ground truth — the forms the AI will edit). DTO keys are camelCase.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';

const REPO = process.cwd();
const OUT = join(REPO, 'qa5000', 'out');
const PREM = join(REPO, 'Samples', 'FormTemplates', 'Premium');
const sha = s => crypto.createHash('sha256').update(String(s || ''), 'utf8').digest('hex').slice(0, 12);

function loadForm(id) {
  const f = JSON.parse(readFileSync(join(OUT, `form-${id}.json`), 'utf8'));
  const schemaJson = f.schemaJson || f.SchemaJson || '{}';
  const settingsJson = f.settingsJson || f.SettingsJson || '{}';
  return { schema: JSON.parse(schemaJson), settings: JSON.parse(settingsJson), title: f.title || f.Name || '' };
}

// id -> { slug, guide, exists(repo has rich JSON to merge) }
const MAP = {
  4: { slug: 'bulgaria-discovery-programme', guide: 'tpl-bulgaria-discovery-programme', merge: true },
  5: { slug: 'euro-youth-application', guide: 'tpl-euro-youth-application', merge: true },
  9: { slug: 'down-under-australia', guide: 'tpl-down-under-australia', merge: false },
  10: { slug: 'festa-italiana', guide: 'tpl-festa-italiana', merge: false },
  12: { slug: 'intake-acme-ocean', guide: 'tpl-intake-acme-ocean', merge: false },
};

for (const [id, meta] of Object.entries(MAP)) {
  const { schema, settings, title } = loadForm(id);
  const dest = join(PREM, meta.slug + '.json');
  let base = {};
  if (meta.merge && existsSync(dest)) {
    base = JSON.parse(readFileSync(dest, 'utf8')); // keep rich metadata (category, rules, themeSelector...)
  }
  const tpl = Object.assign(base, {
    version: base.version || '1.0',
    slug: meta.slug,
    templateGuideSlug: meta.guide,
    title: title || schema.title || base.title || meta.slug,
    theme: settings.theme,
    fields: schema.fields || [],
    customHtml: settings.customHtml || '',
    customCss: settings.customCss || '',
  });
  // refresh nested settings shell content too
  tpl.settings = Object.assign(base.settings || {}, {
    theme: settings.theme,
    multiPage: !!settings.multiPage,
    customContent: settings.customContent || {},
    customScripts: settings.customScripts || {},
    customHtml: settings.customHtml || '',
    customCss: settings.customCss || '',
  });
  writeFileSync(dest, JSON.stringify(tpl, null, 2));
  console.log(`${meta.merge ? 'refresh' : 'create'} ${meta.slug}.json  fields=${tpl.fields.length} html=${tpl.customHtml.length}b(${sha(tpl.customHtml)}) css=${tpl.customCss.length}b(${sha(tpl.customCss)}) theme=${tpl.theme} guide=${meta.guide}`);
}
