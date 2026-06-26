// Pull full schemas for the 6 premium forms on :5000 (ground truth for facts generation).
import { launch, login, isLoggedIn, getForm, OUT } from './lib.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IDS = [4, 5, 9, 10, 11, 12];

const { browser, page } = await launch(true);
try {
  const ok = await login(page);
  console.log('login ->', ok, '| isLoggedIn:', await isLoggedIn(page));
  for (const id of IDS) {
    const form = await getForm(page, id);
    if (form && form.__error) { console.log(`form ${id}: ERROR ${form.__error}`); continue; }
    writeFileSync(join(OUT, `form-${id}.json`), JSON.stringify(form, null, 2));
    // Parse schema/settings to summarize.
    let schema = {}, settings = {};
    try { schema = JSON.parse(form.SchemaJson || form.schemaJson || '{}'); } catch {}
    try { settings = JSON.parse(form.SettingsJson || form.settingsJson || '{}'); } catch {}
    const s = settings || {};
    const fields = (schema.fields || schema.Fields || []);
    const customHtml = s.customHtml || s.CustomHtml || '';
    const customCss = s.customCss || s.CustomCss || '';
    console.log(`form ${id}: name="${form.Name || form.name || ''}" theme="${s.theme || ''}" guideSlug="${s.templateGuideSlug || ''}" fields=${fields.length} customHtml=${customHtml.length}b customCss=${customCss.length}b multiPage=${!!s.multiPage}`);
  }
} catch (e) {
  console.error('FATAL', e);
} finally {
  await browser.close();
}
