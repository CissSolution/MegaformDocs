// Restore form 13 from the pristine australia source (form 9) AND diagnose which
// AI-saved field shape broke the builder load (undefined .map).
import { launch, login, getForm, saveForm } from './lib.mjs';

const { browser, page } = await launch(true);
try {
  if (!await login(page)) { console.log('LOGIN FAILED'); process.exit(1); }

  // 1) Diagnose the CURRENT (broken) form 13 schema.
  const bad = await getForm(page, 13);
  const badSchema = JSON.parse(bad.schemaJson || bad.SchemaJson || '{}');
  console.log('=== form 13 (broken) field shapes ===');
  for (const f of badSchema.fields || []) {
    const miss = [];
    if (f.type === 'Row') { if (!Array.isArray(f.columns)) miss.push('columns'); }
    if (!('options' in f) || !Array.isArray(f.options)) miss.push('options');
    if (!('validation' in f)) miss.push('validation');
    if (!('properties' in f)) miss.push('properties');
    console.log(`  ${f.key} (${f.type}) missing: [${miss.join(',')}]`);
  }

  // 2) Restore from form 9 (pristine australia original).
  const src = await getForm(page, 9);
  const dto = {
    FormId: 13,
    ModuleId: bad.moduleId || bad.ModuleId,
    SiteId: bad.siteId || bad.SiteId || 1,
    Title: 'Australia — AI Test Copy',
    Description: src.description || '',
    Status: 'Published',
    SubmitButtonText: src.submitButtonText || 'Submit',
    SuccessMessage: src.successMessage || '',
    SchemaJson: src.schemaJson || src.SchemaJson,
    SettingsJson: src.settingsJson || src.SettingsJson,
    PreserveModuleBindingOnSave: true,
  };
  const res = await saveForm(page, dto);
  console.log('\nRESTORE form 13 <- form 9:', res.status, res.text.slice(0, 80));

  // 3) Confirm it loads (render 200).
  const r = await page.goto('http://localhost:5000/api/MegaForm/render/13', { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('render/13 after restore:', r.status());
} catch (e) { console.error('FATAL', e); } finally { await browser.close(); }
