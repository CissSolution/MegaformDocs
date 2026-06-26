// Create AI-test COPIES of the showcase premium forms so the originals (4,5,9,10,12)
// stay untouched (handoff safety rule). Copies render via /api/MegaForm/render/{newId}.
import { launch, login, getForm, saveForm, OUT } from './lib.mjs';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = [
  { id: 9, slug: 'down-under-australia', title: 'Australia — AI Test Copy' },
  { id: 10, slug: 'festa-italiana', title: 'Festa — AI Test Copy' },
  { id: 12, slug: 'intake-acme-ocean', title: 'Intake — AI Test Copy' },
];
const MAPFILE = join(OUT, 'copies.json');

const { browser, page } = await launch(true);
const map = existsSync(MAPFILE) ? JSON.parse(readFileSync(MAPFILE, 'utf8')) : {};
try {
  await login(page);
  for (const s of SRC) {
    if (map[s.slug] && map[s.slug].newId) { console.log(`${s.slug}: copy already exists -> ${map[s.slug].newId}`); continue; }
    const f = await getForm(page, s.id);
    if (f.__error) { console.log(`${s.slug}: GET ${s.id} ${f.__error}`); continue; }
    const dto = {
      FormId: 0,
      ModuleId: f.moduleId || f.ModuleId,
      SiteId: f.siteId || f.SiteId || 1,
      Title: s.title,
      Status: 'Published',
      SubmitButtonText: f.submitButtonText || 'Submit',
      SuccessMessage: f.successMessage || '',
      SchemaJson: f.schemaJson || f.SchemaJson,
      SettingsJson: f.settingsJson || f.SettingsJson,
      ThemeJson: f.themeJson || null,
      RulesJson: f.rulesJson || null,
      WorkflowJson: f.workflowJson || null,
      PreserveModuleBindingOnSave: true,
    };
    const res = await saveForm(page, dto);
    let newId = 0;
    try { newId = JSON.parse(res.text).formId; } catch {}
    map[s.slug] = { from: s.id, newId, title: s.title };
    console.log(`${s.slug}: copy of ${s.id} -> ${res.status} newId=${newId}`);
  }
  // bulgaria copy already exists as form 11
  map['bulgaria-discovery-programme'] = map['bulgaria-discovery-programme'] || { from: 4, newId: 11, title: 'Bulgaria — AI Convert Test' };
  writeFileSync(MAPFILE, JSON.stringify(map, null, 2));
  console.log('MAP', JSON.stringify(map));
} catch (e) { console.error('FATAL', e); } finally { await browser.close(); }
