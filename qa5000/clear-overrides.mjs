// Restore original colours: clear the inert C8 themeCssOverrides the AI test set on the
// copies (they used generic --primary/--accent which the premium templates don't read, so
// they had no visual effect — but clear them so the forms are back to their original state).
import { launch, login, getForm, saveForm } from './lib.mjs';
import { sanitizeForSave } from './ai-core.mjs';

const ids = (process.argv[2] || '11,13,14,15').split(',').map(Number);
const { browser, page } = await launch(true);
try {
  await login(page);
  for (const id of ids) {
    const f = await getForm(page, id);
    if (f.__error) { console.log(`form ${id}: ${f.__error}`); continue; }
    const schema = JSON.parse(f.schemaJson || '{}');
    const settings = JSON.parse(f.settingsJson || '{}');
    const had = JSON.stringify(settings.themeCssOverrides || {});
    if (had === '{}') { console.log(`form ${id}: already {} (nothing to clear)`); continue; }
    settings.themeCssOverrides = {};
    sanitizeForSave(schema, settings);
    const dto = {
      FormId: id, ModuleId: f.moduleId, SiteId: f.siteId || 1, Title: f.title,
      Status: f.status || 'Published', SubmitButtonText: f.submitButtonText || 'Submit',
      SuccessMessage: f.successMessage || '',
      SchemaJson: JSON.stringify(schema), SettingsJson: JSON.stringify(settings),
      ThemeJson: f.themeJson || null, RulesJson: f.rulesJson || null, WorkflowJson: f.workflowJson || null,
      PreserveModuleBindingOnSave: true,
    };
    await page.goto('http://localhost:5000/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
    const res = await saveForm(page, dto);
    console.log(`form ${id}: cleared themeCssOverrides ${had} -> {} , save ${res.status}`);
  }
} finally { await browser.close(); }
