// B4: set settings.templateGuideSlug on every premium form (data-only). Verified:
// re-fetch + assert customCss hash UNCHANGED so an original is never corrupted.
// (The guide itself loads via GetTemplateGuide once migration 01060036 is seeded;
//  the slug is harmless until then and B3 keep-style does not need it.)
import crypto from 'node:crypto';
import { launch, login, getForm, saveForm } from './lib.mjs';
import { sanitizeForSave } from './ai-core.mjs';
const sha = s => crypto.createHash('sha256').update(String(s ?? ''), 'utf8').digest('hex').slice(0, 12);

const THEME_SLUG = {
  'down-under-reef-premium': 'tpl-down-under-australia',
  'bulgaria-discovery-premium': 'tpl-bulgaria-discovery-programme',
  'euro-youth-premium': 'tpl-euro-youth-application',
  'festa-italiana-premium': 'tpl-festa-italiana',
  'intake-ocean-premium': 'tpl-intake-acme-ocean',
};
const FORMS = (process.argv[2] ? process.argv[2].split(',') : ['4', '5', '9', '10', '11', '12', '13', '14', '15']).map(Number);

const { browser, page } = await launch(true);
try {
  if (!await login(page)) { console.log('LOGIN FAILED'); process.exit(1); }
  for (const id of FORMS) {
    const f = await getForm(page, id);
    if (f.__error) { console.log(`form ${id}: ${f.__error}`); continue; }
    const schema = JSON.parse(f.schemaJson || f.SchemaJson || '{}');
    const settings = JSON.parse(f.settingsJson || f.SettingsJson || '{}');
    const theme = settings.theme || '';
    const slug = THEME_SLUG[theme];
    const beforeCss = sha(settings.customCss || '');
    if (!slug) { console.log(`form ${id}: theme "${theme}" not a premium template — skip`); continue; }
    if (settings.templateGuideSlug === slug) { console.log(`form ${id}: slug already "${slug}" — skip`); continue; }
    settings.templateGuideSlug = slug;
    const clean = sanitizeForSave(schema, settings);
    const dto = {
      FormId: id,
      ModuleId: f.moduleId || f.ModuleId,
      SiteId: f.siteId || f.SiteId || 1,
      Title: f.title || schema.title,
      Description: f.description || '',
      Status: f.status || 'Published',
      SubmitButtonText: settings.submitButtonText || 'Submit',
      SuccessMessage: settings.successMessage || '',
      SchemaJson: JSON.stringify(clean.schema),
      SettingsJson: JSON.stringify(clean.settings),
      PreserveModuleBindingOnSave: true,
    };
    const res = await saveForm(page, dto);
    // verify round-trip
    const f2 = await getForm(page, id);
    const s2 = JSON.parse(f2.settingsJson || f2.SettingsJson || '{}');
    const afterCss = sha(s2.customCss || '');
    const ok = s2.templateGuideSlug === slug && afterCss === beforeCss;
    console.log(`form ${id} (${theme}): save ${res.status} → slug=${s2.templateGuideSlug} | customCss ${beforeCss}${afterCss === beforeCss ? '==' : '!='}${afterCss} ${ok ? '✅' : '❌'}`);
  }
} catch (e) { console.error('FATAL', e); } finally { await browser.close(); }
