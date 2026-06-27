// Surgical dark-background fix for the australia (down-under-reef) shell ONLY.
// Root cause: the template's white-card rule is gated on .mf-form-wrapper custom-shell
// markers; headless render + some DNN skins don't set them, so .mfp stays transparent
// (DoubleCardFix) and the navy text is unreadable on a dark page. We re-assert the SAME
// card chrome on the bare .mfp.mfp-australia (marker-independent). Australia-only — other
// premium shells keep their intentional transparent outer.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, login, getForm, saveForm } from './lib.mjs';
import { sanitizeForSave } from './ai-core.mjs';

const MARK = 'BgFix v20260627b australia card surface';
// A later (0,4,0)!important rule (the strip / a malformed template rule) forces .mfp
// transparent, so the bare-root and even a (0,4,0) override lose. Use (0,5,0) selectors
// for the marked contexts (proven to win) + the bare root for marker-less renders.
const BLOCK =
  `\n/* [${MARK}] DoubleCardFix + a late !important rule force .mfp transparent; australia's ` +
  `body has no inner card of its own, so the navy text becomes unreadable on a dark page. ` +
  `Re-assert the white card surface at high specificity. Australia-only — other premium ` +
  `shells keep their intentional transparent outer. */\n` +
  `.mfp.mfp-australia,\n` +
  `.mf-form-wrapper.mf-custom-shell-mode .mfp.mfp-australia,\n` +
  `.mf-form-wrapper[data-mf-has-custom-html].mf-custom-shell-mode .mfp.mfp-australia,\n` +
  `.mf-form-wrapper[class*="mf-theme-"].mf-custom-shell-mode .mfp.mfp-australia{` +
  `background:var(--au-surface,#fff)!important;max-width:768px!important;margin:0 auto!important;` +
  `border:1px solid var(--au-border,#d2ece8)!important;border-radius:39px!important;overflow:hidden!important;` +
  `box-shadow:0 24px 60px -28px rgba(11,179,155,.45)!important}\n` +
  `@media(max-width:640px){.mfp.mfp-australia,.mf-form-wrapper.mf-custom-shell-mode .mfp.mfp-australia{max-width:100%!important;border-radius:24px!important}}\n`;

function withFix(css) {
  if (!css) return css;
  // strip any prior BgFix block (always appended last) so re-runs replace, not stack.
  const at = css.indexOf('/* [BgFix');
  const base = at >= 0 ? css.slice(0, at).replace(/\s+$/, '') : css.replace(/\s+$/, '');
  return base + '\n' + BLOCK;
}

// 1) Template source
const tplPath = join(process.cwd(), 'Samples', 'FormTemplates', 'Premium', 'down-under-australia.json');
const tpl = JSON.parse(readFileSync(tplPath, 'utf8'));
const had = tpl.customCss.indexOf(MARK) >= 0;
tpl.customCss = withFix(tpl.customCss);
if (tpl.settings) tpl.settings.customCss = tpl.customCss;
writeFileSync(tplPath, JSON.stringify(tpl, null, 2));
console.log(`template down-under-australia.json: ${had ? 'already had fix' : 'fix appended'} (customCss ${tpl.customCss.length}b)`);

// 2) Live forms 9 (original) + 13 (copy)
const { browser, page } = await launch(true);
try {
  await login(page);
  for (const id of [9, 13]) {
    const f = await getForm(page, id);
    if (f.__error) { console.log(`form ${id}: ${f.__error}`); continue; }
    const schema = JSON.parse(f.schemaJson || '{}');
    const settings = JSON.parse(f.settingsJson || '{}');
    const before = (settings.customCss || '').length;
    if ((settings.customCss || '').indexOf(MARK) >= 0) { console.log(`form ${id}: already fixed`); continue; }
    settings.customCss = withFix(settings.customCss);
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
    console.log(`form ${id}: customCss ${before} -> ${settings.customCss.length}b, save ${res.status} ${res.ok ? 'OK' : res.text}`);
  }
} finally { await browser.close(); }
