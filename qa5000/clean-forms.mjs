// Repair the round-trip bloat: strip the settings copy embedded in schemaJson +
// cap a ballooned postSubmitExperience, then re-save. Keeps the AI rebrand content,
// removes the megabytes. Run after the bloat was discovered.
import { launch, login, getForm, saveForm } from './lib.mjs';
import { sanitizeForSave } from './ai-core.mjs';

const IDS = process.argv.slice(2).map(Number);
const targets = IDS.length ? IDS : [11, 13, 14, 15];

const { browser, page } = await launch(true);
try {
  await login(page);
  for (const id of targets) {
    const f = await getForm(page, id);
    if (f.__error) { console.log(`form ${id}: GET ${f.__error}`); continue; }
    const beforeLen = (f.schemaJson || '').length + (f.settingsJson || '').length;
    let schema, settings;
    try { schema = JSON.parse(f.schemaJson || '{}'); settings = JSON.parse(f.settingsJson || '{}'); }
    catch (e) { console.log(`form ${id}: parse-err ${e.message}`); continue; }
    sanitizeForSave(schema, settings);
    const dto = {
      FormId: id, ModuleId: f.moduleId, SiteId: f.siteId || 1, Title: f.title,
      Status: f.status || 'Published', SubmitButtonText: f.submitButtonText || 'Submit',
      SuccessMessage: f.successMessage || '',
      SchemaJson: JSON.stringify(schema), SettingsJson: JSON.stringify(settings),
      ThemeJson: f.themeJson || null, RulesJson: f.rulesJson || null, WorkflowJson: f.workflowJson || null,
      PreserveModuleBindingOnSave: true,
    };
    const afterLen = dto.SchemaJson.length + dto.SettingsJson.length;
    await page.goto('http://localhost:5000/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
    const res = await saveForm(page, dto);
    // verify post-save size
    const v = await getForm(page, id);
    const vLen = (v.schemaJson || '').length + (v.settingsJson || '').length;
    console.log(`form ${id}: ${beforeLen}b -> sent ${afterLen}b -> save ${res.status} -> now ${vLen}b`);
  }
} catch (e) { console.error('FATAL', e); } finally { await browser.close(); }
