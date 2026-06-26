// End-to-end keep-style AI edit case runner on :5000.
// Usage: node qa5000/run-case.mjs <formId> <slug> <caseId> <expectColorChange:0|1> "<userPrompt>"
import { launch, login, getForm, getAiConfig, saveForm, shot, OUT } from './lib.mjs';
import { buildSystemPrompt, callAi, validateOps, applyOps, loadFacts, sha } from './ai-core.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , formIdArg, slug, caseId, expectColorArg, userPrompt] = process.argv;
const formId = parseInt(formIdArg, 10);
const expectColor = expectColorArg === '1';
const RENDER = `http://localhost:5000/api/MegaForm/render/${formId}`;

function parse(form) {
  return {
    schema: JSON.parse(form.schemaJson || form.SchemaJson || '{}'),
    settings: JSON.parse(form.settingsJson || form.SettingsJson || '{}'),
    raw: form,
  };
}
// SHELL_HASH = customHtml structure only (tokens removed, text-in-tags stripped) — same
// recipe as the facts generator's shellSha256. Invariant under set_html_text + options edits.
function shellHash(html) {
  return sha(String(html || '').replace(/\{\{[^}]*\}\}/g, '').replace(/>[^<]*</g, '><')).slice(0, 16);
}
function tagCount(html) { return (String(html || '').match(/<[a-zA-Z\/!]/g) || []).length; }
function fingerprint(settings) {
  return {
    cssHash: sha(settings.customCss || '').slice(0, 16),
    htmlHash: sha(settings.customHtml || '').slice(0, 16),
    shellHash: shellHash(settings.customHtml || ''),
    tags: tagCount(settings.customHtml || ''),
    theme: settings.theme || '',
    themeOverrides: JSON.stringify(settings.themeCssOverrides || {}),
  };
}

const { browser, page } = await launch(true);
const log = (m) => console.log(`[${caseId}] ${m}`);
const result = { caseId, formId, slug, userPrompt, pass: false, steps: [] };
try {
  const ok = await login(page);
  log('login ' + ok);

  // BEFORE
  const before = parse(await getForm(page, formId));
  const fpBefore = fingerprint(before.settings);
  await page.goto(RENDER + '?nc=' + Date.now() + Math.round(Math.random() * 1e6), { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await shot(page, `${caseId}-before.png`, { full: true });
  log('before fp ' + JSON.stringify(fpBefore));

  // AI
  const cfg = await getAiConfig(page);
  if (cfg.__error || !cfg.apiKey) throw new Error('no AI key: ' + JSON.stringify(cfg).slice(0, 120));
  const system = buildSystemPrompt(slug, before.schema, before.settings);
  const facts = loadFacts(slug);
  const ai = await callAi(cfg, system, userPrompt);
  result.ops = ai.ops; result.explain = ai.explain;
  log(`AI returned ${ai.ops.length} ops: ` + ai.ops.map(o => o.op + (o.key ? ':' + o.key : '') + (o.path ? '.' + o.path : '')).join(', '));

  // GATE
  const errors = validateOps(ai.ops, before.schema, facts);
  result.gateErrors = errors;
  if (errors.length) { log('GATE REJECT: ' + errors.join(' | ')); throw new Error('gate rejected ops'); }
  log('gate OK (' + ai.ops.length + ' ops on-map)');

  // APPLY (deep clone so we mutate fresh copies)
  const schema = JSON.parse(JSON.stringify(before.schema));
  const settings = JSON.parse(JSON.stringify(before.settings));
  const applied = applyOps(ai.ops, schema, settings);
  const isStructural = applied.structural;
  const isShellText = applied.touchedShellText;

  // BUILD SAVE DTO (round-trip, preserve binding + status)
  const r = before.raw;
  const dto = {
    FormId: formId,
    ModuleId: r.moduleId || r.ModuleId,
    SiteId: r.siteId || r.SiteId,
    Title: schema.title || r.title || r.Title,
    Status: r.status || r.Status || 'Published',
    SubmitButtonText: settings.submitButtonText || r.submitButtonText || 'Submit',
    SuccessMessage: settings.successMessage || r.successMessage || '',
    RedirectUrl: r.redirectUrl || r.RedirectUrl || '',
    SchemaJson: JSON.stringify(schema),
    SettingsJson: JSON.stringify(settings),
    ThemeJson: r.themeJson || r.ThemeJson || null,
    RulesJson: r.rulesJson || r.RulesJson || null,
    WorkflowJson: r.workflowJson || r.WorkflowJson || null,
    PreserveModuleBindingOnSave: true,
  };
  const save = await saveForm(page, dto);
  result.save = save;
  log('save -> ' + save.status + ' ' + (save.ok ? 'OK' : save.text));
  if (!save.ok) throw new Error('save failed');

  // AFTER
  await page.waitForTimeout(800);
  const after = parse(await getForm(page, formId));
  const fpAfter = fingerprint(after.settings);
  await page.goto(RENDER + '?nc=' + Date.now() + Math.round(Math.random() * 1e6), { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await shot(page, `${caseId}-after.png`, { full: true });
  log('after  fp ' + JSON.stringify(fpAfter));

  // ASSERTIONS
  const checks = [];
  // CSS_HASH invariant ALWAYS (even color change goes via themeCssOverrides)
  checks.push(['CSS_HASH invariant', fpBefore.cssHash === fpAfter.cssHash]);
  checks.push(['THEME invariant', fpBefore.theme === fpAfter.theme]);
  // SHELL_HASH (structure) invariant unless a field was legitimately added/removed.
  if (!isStructural) checks.push(['SHELL_HASH invariant (structure)', fpBefore.shellHash === fpAfter.shellHash]);
  // For pure data ops (no shell-text edit, no structural), customHtml stays byte-identical.
  if (!isStructural && !isShellText) checks.push(['customHtml byte-invariant (data-only)', fpBefore.htmlHash === fpAfter.htmlHash]);
  // A shell-text rebrand must change customHtml bytes but keep structure (tags) identical.
  if (isShellText && !isStructural) checks.push(['shell text changed, tag count identical', fpBefore.htmlHash !== fpAfter.htmlHash && fpBefore.tags === fpAfter.tags]);
  if (expectColor) checks.push(['themeCssOverrides changed (color)', fpBefore.themeOverrides !== fpAfter.themeOverrides]);
  // content actually changed somewhere
  const changed = JSON.stringify(before.schema) !== JSON.stringify(after.schema)
    || JSON.stringify(before.settings.customContent || {}) !== JSON.stringify(after.settings.customContent || {})
    || fpBefore.themeOverrides !== fpAfter.themeOverrides;
  checks.push(['content/schema changed (applied & persisted)', changed]);
  // no orphan: every {{field:key}} token has a field
  const afterKeys = new Set(JSON.stringify(after.schema).match(/"key":"([a-z0-9_]+)"/gi)?.map(s => s.replace(/"key":"|"/g, '')) || []);
  const tokens = [...new Set((after.settings.customHtml || '').match(/\{\{field:([a-z0-9_]+)\}\}/gi) || [])].map(t => t.replace(/\{\{field:|\}\}/g, ''));
  const orphans = tokens.filter(t => !afterKeys.has(t));
  checks.push(['zero orphan placeholders', orphans.length === 0]);

  result.checks = checks.map(([n, p]) => ({ n, p }));
  result.fpBefore = fpBefore; result.fpAfter = fpAfter;
  result.pass = checks.every(([, p]) => p);
  checks.forEach(([n, p]) => log((p ? 'PASS ' : 'FAIL ') + n));
  log(result.pass ? '✅ CASE PASS' : '❌ CASE FAIL');
} catch (e) {
  result.error = String(e && e.message || e);
  log('ERROR ' + result.error);
} finally {
  writeFileSync(join(OUT, `${caseId}-result.json`), JSON.stringify(result, null, 2));
  await browser.close();
}
process.exit(result.pass ? 0 : 1);
