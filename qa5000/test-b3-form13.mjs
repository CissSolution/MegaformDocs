// B3 END-TO-END: drive the SAME keep-style transform the builder AI Designer now
// runs, against form 13 (= live COPY of premium form 9 "down-under-australia"),
// with the REAL OpenAI provider. Proves: AI rebrands CONTENT to the user's request
// while customCss + shell tag-structure stay byte-identical (keep-style).
import crypto from 'node:crypto';
import { launch, login, getForm, saveForm, getAiConfig, shot, OUT } from './lib.mjs';
import { callAi, sanitizeForSave } from './ai-core.mjs';
import { syncFieldPlaceholders } from './sync-mirror.mjs';
import { join } from 'node:path';

const sha = s => crypto.createHash('sha256').update(String(s ?? ''), 'utf8').digest('hex').slice(0, 12);
const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const structure = h => String(h || '').replace(/>([^<>{}]+)</g, '><'); // strip text → tag skeleton
function collect(html) { const o = new Set(); String(html || '').replace(/>([^<>{}]+)</g, (f, i) => { const t = norm(i); if (t) o.add(t); return f; }); return [...o]; }
function ensureSafe(f) {
  if (!f || typeof f !== 'object') return f;
  if (f.type === 'Row') { if (!Array.isArray(f.columns)) f.columns = []; f.columns.forEach(c => { if (c && Array.isArray(c.fields)) c.fields.forEach(ensureSafe); }); }
  if (!Array.isArray(f.options)) f.options = [];
  if (f.validation == null || typeof f.validation !== 'object') f.validation = {};
  if (f.properties == null || typeof f.properties !== 'object') f.properties = {};
  if (f.widgetProps == null || typeof f.widgetProps !== 'object') f.widgetProps = {};
  return f;
}
function mergeFields(existing, aiFields) {
  const byKey = {}; for (const f of existing || []) if (f && f.key) byKey[String(f.key)] = f;
  const SAFE = ['label', 'placeholder', 'required', 'helpText', 'defaultValue', 'options']; const out = [];
  for (const af of aiFields || []) {
    if (!af || !af.key) continue;
    const orig = byKey[String(af.key)];
    if (orig) { const m = JSON.parse(JSON.stringify(orig)); for (const k of SAFE) { if (af[k] === undefined) continue; if (k === 'options' && !Array.isArray(orig.options)) continue; m[k] = af[k]; } out.push(ensureSafe(m)); }
    else out.push(ensureSafe({ key: af.key, type: af.type || 'Text', label: af.label || af.key, required: !!af.required, placeholder: af.placeholder || '', helpText: af.helpText || '', options: Array.isArray(af.options) ? af.options : [], defaultValue: af.defaultValue ?? '', validation: {}, properties: {}, widgetProps: {} }));
  }
  return out;
}
function applySwaps(html, swaps, allow) {
  let cur = String(html || ''); const A = allow && allow.length ? new Set(allow.map(norm)) : null; const applied = [];
  for (const sw of swaps || []) {
    const find = norm(sw.find), rep = String(sw.replace ?? '');
    if (!find || /[<>]/.test(rep) || (A && !A.has(find))) continue;
    let hits = 0; cur = cur.replace(/>([^<>{}]+)</g, (f, i) => { if (norm(i) === find) { hits++; return '>' + rep + '<'; } return f; });
    if (hits) applied.push({ find, rep, hits });
  }
  return { html: cur, applied };
}

const FORM_ID = Number(process.argv[2] || 13);
const REQUEST = process.argv[3] ||
  'Đổi nội dung form thành: Đăng ký Khai báo Thuế tại Hoa Kỳ, làm thủ tục xuất nhập cảnh. ' +
  'Đổi tiêu đề + mô tả + các chữ tiêu đề/bước trong giao diện cho khớp chủ đề mới, và thêm field Tax Identification Number (TIN), Passport Number, Arrival Date, Departure Date. GIỮ NGUYÊN thiết kế/màu/bố cục.';

const { browser, page } = await launch(true);
try {
  if (!await login(page)) { console.log('LOGIN FAILED'); process.exit(1); }
  const cfg0 = await getAiConfig(page, 1);
  if (cfg0.__error || !cfg0.apiKey) { console.log('NO AI KEY', JSON.stringify(cfg0).slice(0, 120)); process.exit(1); }
  const cfg = { baseUrl: cfg0.baseUrl, apiKey: cfg0.apiKey, model: cfg0.model || 'gpt-4o' };

  const f = await getForm(page, FORM_ID);
  const schema = JSON.parse(f.schemaJson || f.SchemaJson || '{}');
  let settings = JSON.parse(f.settingsJson || f.SettingsJson || '{}');
  const beforeShellHash = sha(structure(settings.customHtml || ''));
  const shellTexts = collect(settings.customHtml || '');
  console.log('BEFORE  title:', JSON.stringify(schema.title || settings.title));
  console.log('BEFORE  theme:', settings.theme, '| customCss hash:', sha(settings.customCss || ''), '| SHELL hash:', beforeShellHash, '| #shellTexts:', shellTexts.length);

  // BEFORE render screenshot
  await page.goto(`http://localhost:5000/api/MegaForm/render/${FORM_ID}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, `b3-${FORM_ID}-BEFORE.png`), fullPage: true });

  // ── Build the SAME keep-style prompt the builder AI Designer (B3) sends ──
  const compactFields = (schema.fields || []).map(x => ({ key: x.key, type: x.type, label: x.label, step: x.step }));
  const system = [
    'You are MegaForm AI editing an EXISTING PREMIUM form on the builder canvas. Output ONLY JSON {"schema":{"version","title","description","fields","settings"},"htmlTextSwaps":[{"find","replace"}],"explain"}. No prose, no markdown fences.',
    'The look (customHtml + customCss + theme) is IMMUTABLE — do NOT emit customHtml or customCss, do NOT change theme. They are preserved automatically.',
    '- ALWAYS set schema.title AND schema.description to the rebranded copy.',
    '- Apply the request by editing fields (relabel / add / remove). Keep every existing field key/order unless asked to change it.',
    '- In schema.settings put ONLY themeCssOverrides (colour) — OMIT customHtml/customCss/theme.',
    '- To rebrand HARDCODED copy baked into the shell (hero title + subtitle, EVERY stepper label, eyebrow/step numbers, section headings + captions, button text), add {"find":"<exact current text>","replace":"<new text>"} to htmlTextSwaps. find MUST be one of SHELL TEXTS below verbatim; replace MUST be plain text (no tags). Rebrand EVERY shell text that names the OLD theme/topic — leave NO old wording behind.',
    'CURRENT FIELDS: ' + JSON.stringify(compactFields),
    'CURRENT TITLE: ' + JSON.stringify(schema.title || settings.title || ''),
    'SHELL TEXTS (exact strings you may rebrand): ' + JSON.stringify(shellTexts),
  ].join('\n');

  const ai = await callAi(cfg, system, REQUEST);
  // callAi returns {ops,...} shaped for the ops path; re-parse raw for our schema shape
  let obj = {}; try { obj = JSON.parse(ai.raw); } catch { const m = ai.raw && ai.raw.match(/\{[\s\S]*\}/); if (m) try { obj = JSON.parse(m[0]); } catch {} }
  const outSchema = obj.schema && Array.isArray(obj.schema.fields) ? obj.schema : null;
  if (!outSchema) { console.log('AI did not return a schema. raw:', String(ai.raw).slice(0, 300)); process.exit(1); }
  const swaps = Array.isArray(obj.htmlTextSwaps) ? obj.htmlTextSwaps : [];
  console.log('\nAI returned', outSchema.fields.length, 'fields,', swaps.length, 'htmlTextSwaps');

  // ── Apply the SAME B3 keep-style post-processing ──
  const aiOverrides = (outSchema.settings && outSchema.settings.themeCssOverrides) || {};
  const r = applySwaps(settings.customHtml || '', swaps, shellTexts);
  console.log('applied swaps:', JSON.stringify(r.applied.map(a => a.find + ' -> ' + a.rep)));
  const newSettings = Object.assign({}, settings, {
    customHtml: r.html,
    customCss: settings.customCss,          // byte-identical
    theme: settings.theme,                  // unchanged
    themeCssOverrides: Object.assign({}, settings.themeCssOverrides || {}, aiOverrides),
    title: outSchema.title || settings.title,
    description: outSchema.description ?? settings.description,
  });
  const mergedFields = mergeFields(schema.fields || [], outSchema.fields);
  const rowOK = (mergedFields.find(x => x.type === 'Row') || {}).columns;
  console.log('builder-safe merge: Row has columns?', Array.isArray(rowOK) ? rowOK.length + ' cols' : 'NO ROW', '| fields:', mergedFields.length);
  // [structure fix] Place new-field tokens into their data-step panel + drop Row-subfield/orphan/dup tokens.
  newSettings.customHtml = syncFieldPlaceholders(newSettings.customHtml, mergedFields);
  const newSchema = { version: schema.version || '1.0', fields: mergedFields, title: outSchema.title || schema.title, description: outSchema.description ?? schema.description };
  const clean = sanitizeForSave(newSchema, newSettings);

  // ── Save to the COPY ──
  const dto = {
    FormId: FORM_ID,
    ModuleId: f.moduleId || f.ModuleId,
    SiteId: f.siteId || f.SiteId || 1,
    Title: clean.settings.title || newSchema.title,
    Description: clean.settings.description || '',
    Status: 'Published',
    SubmitButtonText: clean.settings.submitButtonText || 'Submit',
    SuccessMessage: clean.settings.successMessage || '',
    SchemaJson: JSON.stringify(clean.schema),
    SettingsJson: JSON.stringify(clean.settings),
    PreserveModuleBindingOnSave: true,
  };
  const res = await saveForm(page, dto);
  console.log('SAVE ->', res.status, res.text.slice(0, 80));

  // ── Re-fetch + assert ──
  const f2 = await getForm(page, FORM_ID);
  const s2 = JSON.parse(f2.settingsJson || f2.SettingsJson || '{}');
  const sc2 = JSON.parse(f2.schemaJson || f2.SchemaJson || '{}');
  const afterCssHash = sha(s2.customCss || '');
  const afterShellHash = sha(structure(s2.customHtml || ''));
  console.log('\nAFTER   title:', JSON.stringify(sc2.title || s2.title));
  console.log('AFTER   theme:', s2.theme, '| customCss hash:', afterCssHash, '| SHELL hash:', afterShellHash);

  // AFTER render screenshot
  await page.goto(`http://localhost:5000/api/MegaForm/render/${FORM_ID}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, `b3-${FORM_ID}-AFTER.png`), fullPage: true });

  const cssOK = afterCssHash === sha(settings.customCss || '');
  const shellOK = afterShellHash === beforeShellHash;
  const themeOK = s2.theme === settings.theme;
  const titleChanged = String(sc2.title || s2.title) !== String(schema.title || settings.title);
  const rebranded = /Hoa Kỳ|Thuế|Tax|U\.S/i.test(s2.customHtml || '');
  console.log('\n==== VERDICT ====');
  console.log('customCss byte-invariant :', cssOK ? 'PASS' : 'FAIL');
  console.log('SHELL structure invariant:', shellOK ? 'PASS' : 'FAIL');
  console.log('theme unchanged          :', themeOK ? 'PASS' : 'FAIL');
  console.log('title changed            :', titleChanged ? 'PASS' : 'FAIL');
  console.log('shell text rebranded     :', rebranded ? 'PASS' : 'FAIL');
  console.log('screenshots:', `b3-${FORM_ID}-BEFORE.png`, `b3-${FORM_ID}-AFTER.png`, 'in', OUT);
  console.log('OVERALL:', (cssOK && shellOK && themeOK && titleChanged) ? '✅ KEEP-STYLE PROVEN' : '❌ CHECK ABOVE');
} catch (e) { console.error('FATAL', e); } finally { await browser.close(); }
