// One keep-style AI-edit case (reused by batch + CLI). Returns a structured result.
import { getForm, getAiConfig, saveForm, shot } from './lib.mjs';
import { buildSystemPrompt, callAi, validateOps, applyOps, loadFacts, sha, sanitizeForSave } from './ai-core.mjs';

const shellHash = h => sha(String(h || '').replace(/\{\{[^}]*\}\}/g, '').replace(/>[^<]*</g, '><')).slice(0, 16);
const tagCount = h => (String(h || '').match(/<[a-zA-Z\/!]/g) || []).length;
const fp = s => ({
  cssHash: sha(s.customCss || '').slice(0, 16), htmlHash: sha(s.customHtml || '').slice(0, 16),
  shellHash: shellHash(s.customHtml || ''), tags: tagCount(s.customHtml || ''),
  theme: s.theme || '', themeOverrides: JSON.stringify(s.themeCssOverrides || {}),
});
const parse = f => ({ schema: JSON.parse(f.schemaJson || f.SchemaJson || '{}'), settings: JSON.parse(f.settingsJson || f.SettingsJson || '{}'), raw: f });

export async function runCase(page, cfg, c) {
  const { formId, slug, caseId, expectColor, prompt } = c;
  const RENDER = `http://localhost:5000/api/MegaForm/render/${formId}`;
  const out = { caseId, formId, slug, cap: c.cap, prompt, pass: false, checks: [] };
  const log = m => console.log(`[${caseId}] ${m}`);
  try {
    const before = parse(await getForm(page, formId));
    const fpB = fp(before.settings);
    await page.goto(RENDER + '?nc=' + Date.now() + Math.round(Math.random() * 1e6), { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2600);
    await shot(page, `${caseId}-before.png`, { full: true });

    const system = buildSystemPrompt(slug, before.schema, before.settings);
    const facts = loadFacts(slug);
    const ai = await callAi(cfg, system, prompt);
    out.opCount = ai.ops.length;
    out.opKinds = ai.ops.reduce((a, o) => (a[o.op] = (a[o.op] || 0) + 1, a), {});
    log(`AI ${ai.ops.length} ops ` + JSON.stringify(out.opKinds));

    const errors = validateOps(ai.ops, before.schema, facts);
    out.gateErrors = errors;
    if (errors.length) { log('GATE REJECT ' + errors.slice(0, 3).join(' | ')); out.error = 'gate-reject'; return out; }

    const schema = JSON.parse(JSON.stringify(before.schema));
    const settings = JSON.parse(JSON.stringify(before.settings));
    const applied = applyOps(ai.ops, schema, settings);
    sanitizeForSave(schema, settings); // strip embedded-settings bloat vector before save

    const r = before.raw;
    const dto = {
      FormId: formId, ModuleId: r.moduleId || r.ModuleId, SiteId: r.siteId || r.SiteId || 1,
      Title: schema.title || r.title, Status: r.status || 'Published',
      SubmitButtonText: settings.submitButtonText || r.submitButtonText || 'Submit',
      SuccessMessage: settings.successMessage || r.successMessage || '',
      SchemaJson: JSON.stringify(schema), SettingsJson: JSON.stringify(settings),
      ThemeJson: r.themeJson || null, RulesJson: r.rulesJson || null, WorkflowJson: r.workflowJson || null,
      PreserveModuleBindingOnSave: true,
    };
    // Save from a stable origin page — heavy render pages can detach the fetch context.
    await page.goto('http://localhost:5000/login', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    const save = await saveForm(page, dto);
    out.save = save.status;
    if (!save.ok) { log('SAVE FAIL ' + save.status + ' ' + save.text); out.error = 'save-fail'; return out; }

    await page.waitForTimeout(700);
    const after = parse(await getForm(page, formId));
    const fpA = fp(after.settings);
    await page.goto(RENDER + '?nc=' + Date.now() + Math.round(Math.random() * 1e6), { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2600);
    await shot(page, `${caseId}-after.png`, { full: true });

    const checks = [];
    checks.push(['CSS_HASH invariant', fpB.cssHash === fpA.cssHash]);
    checks.push(['THEME invariant', fpB.theme === fpA.theme]);
    if (!applied.structural) checks.push(['SHELL_HASH invariant', fpB.shellHash === fpA.shellHash]);
    if (!applied.structural && !applied.touchedShellText) checks.push(['customHtml byte-invariant', fpB.htmlHash === fpA.htmlHash]);
    if (applied.touchedShellText && !applied.structural) checks.push(['shell-text changed, tags identical', fpB.htmlHash !== fpA.htmlHash && fpB.tags === fpA.tags]);
    if (expectColor) checks.push(['themeCssOverrides changed', fpB.themeOverrides !== fpA.themeOverrides]);
    const changed = JSON.stringify(before.schema) !== JSON.stringify(after.schema)
      || JSON.stringify(before.settings.customContent || {}) !== JSON.stringify(after.settings.customContent || {})
      || fpB.htmlHash !== fpA.htmlHash || fpB.themeOverrides !== fpA.themeOverrides;
    checks.push(['content persisted', changed]);
    const afterKeys = new Set((JSON.stringify(after.schema).match(/"key":"([a-z0-9_]+)"/gi) || []).map(s => s.replace(/"key":"|"/g, '')));
    const orphans = [...new Set((after.settings.customHtml || '').match(/\{\{field:([a-z0-9_]+)\}\}/gi) || [])].map(t => t.replace(/\{\{field:|\}\}/g, '')).filter(t => !afterKeys.has(t));
    checks.push(['zero orphan placeholders', orphans.length === 0]);

    out.checks = checks.map(([n, p]) => ({ n, p }));
    out.fpBefore = fpB; out.fpAfter = fpA; out.explain = ai.explain;
    out.pass = checks.every(([, p]) => p);
    checks.forEach(([n, p]) => log((p ? 'PASS ' : 'FAIL ') + n));
    log(out.pass ? '✅ PASS' : '❌ FAIL');
  } catch (e) { out.error = String(e && e.message || e); log('ERROR ' + out.error); }
  return out;
}
