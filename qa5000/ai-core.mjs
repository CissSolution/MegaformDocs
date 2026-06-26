// Deterministic premium-edit core (provider-agnostic). Mirrors what the fixed in-product
// pipeline does: build prompt from facts+guide → call AI → validate ops against facts
// (whitelist + key existence) → apply DATA-ONLY ops keeping customHtml/customCss/theme
// byte-invariant. Used by the QA runner to prove C1/C3/C6/C7/C8 keep-style.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';

export const sha = s => crypto.createHash('sha256').update(String(s == null ? '' : s), 'utf8').digest('hex');
const REPO = process.cwd();
const GUIDE_DIR = join(REPO, 'MegaForm.Oqtane.Server', 'wwwroot', 'Modules', 'MegaForm', 'Resources', 'TemplateGuides');

export function loadFacts(slug) { return JSON.parse(readFileSync(join(GUIDE_DIR, slug + '.facts.json'), 'utf8')); }
export function loadGuide(slug) { return readFileSync(join(GUIDE_DIR, slug + '.guide.md'), 'utf8'); }

// The stored schemaJson embeds a denormalized copy of settings (customCss +
// postSubmitExperience). Round-tripping that re-embeds it on every save, so it
// compounds (form 11 ballooned to 30 MB → POST fails). Strip the embedded copy
// and cap a bloated postSubmitExperience before sending. SettingsJson stays the
// single source of truth for settings.
export function sanitizeForSave(schema, settings) {
  if (schema && typeof schema === 'object' && schema.settings) delete schema.settings;
  if (settings && settings.postSubmitExperience) {
    try { if (JSON.stringify(settings.postSubmitExperience).length > 8000) settings.postSubmitExperience = { enabled: false }; } catch { settings.postSubmitExperience = { enabled: false }; }
  }
  return { schema, settings };
}

// deep find/replace by key (handles Row.columns[].fields[])
export function findField(fields, key) {
  for (const f of fields || []) {
    if (f.key === key) return f;
    if (f.type === 'Row' && Array.isArray(f.columns)) {
      for (const c of f.columns) { const r = findField(c.fields || [], key); if (r) return r; }
    }
  }
  return null;
}
function allKeys(fields, out = []) {
  for (const f of fields || []) {
    if (f.key) out.push(f.key);
    if (f.type === 'Row' && Array.isArray(f.columns)) for (const c of f.columns) allKeys(c.fields || [], out);
  }
  return out;
}

// ── prompt construction (calculate-before-prompt; deterministic) ────────────
export function buildSystemPrompt(slug, schema, settings) {
  const guide = loadGuide(slug);
  const facts = loadFacts(slug);
  const compactFields = (facts.fields || []).filter(f => f.type !== 'Row').map(f => ({
    key: f.key, type: f.type, display: f.display, step: f.step, options: f.optionCount || 0, label: f.label,
  }));
  return [
    'You are MegaForm AI editing an EXISTING PREMIUM form. Output ONLY a JSON object {"ops":[...],"explain":"..."}. No prose, no markdown fences.',
    'The form look (settings.customHtml + settings.customCss + settings.theme) is IMMUTABLE. You MUST NOT emit customHtml, customCss, theme, or replace_form_schema. You may ONLY emit ops from the whitelist and ONLY against keys that exist.',
    '',
    'ALLOWED OPS (every op also carries designDecision:"preserve"):',
    '- {"op":"set_form_meta","title?":"","description?":"","submitButtonText?":"","successMessage?":"","customContent?":{"<token>":"text"},"themeCssOverrides?":{"--var":"#hex"}}',
    '- {"op":"set_field_property","key":"<existingKey>","path":"label|placeholder|required|options","value":<newValue>}',
    '- {"op":"set_html_text","find":"<exact current shell text>","replace":"<new text>"} (rebrand a HARDCODED heading/caption; text-only swap, find MUST be one of SHELL TEXTS below, replace MUST be plain text with no < > tags)',
    '- {"op":"add_field","type":"Text|Email|...","key":"new_snake_key","label":"","step":<int>} (only if the user asks to ADD a field)',
    '- {"op":"remove_field","key":"<existingKey>"} (only if the user asks to REMOVE a field)',
    'For options on a chips/cards field, value is an array [{"value":"v","label":"L"}] (cards may add "meta","description","icon"). Keep the field display kind (do NOT add/remove optionDisplay).',
    'When the user asks to change PURPOSE/CONTENT, also rebrand the hardcoded shell headings/captions via set_html_text using the exact strings in SHELL TEXTS (hero title, step labels, section captions) — otherwise the old brand text stays visible.',
    'Colour changes go ONLY in set_form_meta.themeCssOverrides — NEVER in customCss. Only change colour if the user explicitly asks.',
    'Never rename an existing key. Never drop fields the user did not mention.',
    '',
    'TEMPLATE DESIGN CONTRACT + FORMULAS (authoritative for this form):',
    guide.slice(0, 9000),
    '',
    'FIELD MAP (keys you may target): ' + JSON.stringify(compactFields),
    'SHELL TEXTS (exact hardcoded strings you may rebrand via set_html_text): ' + JSON.stringify(facts.shellTexts || []),
    'CURRENT TITLE: ' + JSON.stringify(schema.title || settings.title || ''),
    'CONTENT TOKENS available: ' + JSON.stringify(Object.keys(settings.customContent || {})),
  ].join('\n');
}

// ── AI call (OpenAI-compatible; provider-agnostic chat-completions) ─────────
export async function callAi(cfg, system, user) {
  const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
    body: JSON.stringify({
      model: cfg.model || 'gpt-4o',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
      max_tokens: 3000,
    }),
  });
  if (!r.ok) throw new Error('AI HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300));
  const j = await r.json();
  const txt = j.choices?.[0]?.message?.content || '{}';
  let parsed; try { parsed = JSON.parse(txt); } catch { parsed = JSON.parse((txt.match(/\{[\s\S]*\}/) || ['{}'])[0]); }
  return { ops: Array.isArray(parsed.ops) ? parsed.ops : [], explain: parsed.explain || '', raw: txt };
}

// ── GATE: validate ops against facts (whitelist + key existence) ───────────
const WHITELIST = new Set(['set_form_meta', 'set_field_property', 'set_html_text', 'add_field', 'remove_field']);
const META_ALLOWED = new Set(['title', 'description', 'submitButtonText', 'successMessage', 'customContent', 'themeCssOverrides']);
const PROP_ALLOWED = new Set(['label', 'placeholder', 'required', 'options']);

export function validateOps(ops, schema, facts) {
  const origKeys = new Set(allKeys(schema.fields));            // keys present BEFORE this batch
  const addedKeys = new Set(ops.filter(o => o.op === 'add_field' && o.key).map(o => o.key));
  const keys = new Set([...origKeys, ...addedKeys]);          // valid targets for set_field_property
  const shellSet = new Set((facts.shellTexts || []).map(s => s.replace(/\s+/g, ' ').trim()));
  const errors = [];
  for (const op of ops) {
    const name = op.op;
    if (!WHITELIST.has(name)) { errors.push(`[DET] forbidden op "${name}"`); continue; }
    // hard: no design-destroying keys anywhere
    for (const k of ['customHtml', 'customCss', 'theme', 'schema', 'fields', 'customScripts']) {
      if (k in op) errors.push(`[DET] op "${name}" carries forbidden key "${k}"`);
    }
    if (name === 'set_html_text') {
      const find = String(op.find == null ? '' : op.find).replace(/\s+/g, ' ').trim();
      if (!find) errors.push('[DET] set_html_text needs a find string');
      else if (!shellSet.has(find)) errors.push(`[DET] set_html_text find not in shellTexts: "${find.slice(0, 40)}"`);
      if (/[<>]/.test(String(op.replace == null ? '' : op.replace))) errors.push('[DET] set_html_text replace must be plain text (no tags)');
      continue;
    }
    if (name === 'set_form_meta') {
      for (const k of Object.keys(op)) {
        if (k === 'op' || k === 'designDecision' || k === 'explain') continue;
        if (!META_ALLOWED.has(k)) errors.push(`[DET] set_form_meta has non-whitelisted field "${k}"`);
      }
    } else if (name === 'set_field_property') {
      if (!keys.has(op.key)) errors.push(`[DET] set_field_property on unknown key "${op.key}"`);
      if (!PROP_ALLOWED.has(op.path)) errors.push(`[DET] set_field_property path "${op.path}" not allowed`);
    } else if (name === 'remove_field') {
      if (!keys.has(op.key)) errors.push(`[DET] remove_field unknown key "${op.key}"`);
    } else if (name === 'add_field') {
      if (!op.key || origKeys.has(op.key)) errors.push(`[DET] add_field needs a NEW key (got "${op.key}")`);
      if (!op.type) errors.push('[DET] add_field needs a type');
    }
  }
  return errors;
}

// ── APPLY data-only ops; mutate schema (+ settings) in place ───────────────
// Returns {touchedCustomHtml} so caller can assert byte-invariance for data-only cases.
export function applyOps(ops, schema, settings) {
  let touchedCustomHtml = false, touchedShellText = false, structural = false;
  for (const op of ops) {
    if (op.op === 'set_html_text') {
      const html = settings.customHtml || '';
      const wantN = String(op.find == null ? '' : op.find).replace(/\s+/g, ' ').trim();
      const repl = String(op.replace == null ? '' : op.replace);
      let hit = 0;
      // Replace EVERY text node that matches exactly (the same caption may repeat,
      // e.g. a stepper label + a section heading) so the rebrand is complete.
      const next = html.replace(/>([^<>{}]+)</g, (full, inner) => {
        if (inner.replace(/\s+/g, ' ').trim() === wantN) { hit++; return '>' + repl + '<'; }
        return full;
      });
      if (hit) { settings.customHtml = next; touchedCustomHtml = true; touchedShellText = true; }
      continue;
    }
    if (op.op === 'set_form_meta') {
      if (typeof op.title === 'string') { schema.title = op.title; settings.title = op.title; }
      if (typeof op.description === 'string') { schema.description = op.description; settings.description = op.description; }
      if (typeof op.submitButtonText === 'string') settings.submitButtonText = op.submitButtonText;
      if (typeof op.successMessage === 'string') settings.successMessage = op.successMessage;
      if (op.customContent && typeof op.customContent === 'object') {
        settings.customContent = Object.assign({}, settings.customContent, op.customContent);
      }
      if (op.themeCssOverrides && typeof op.themeCssOverrides === 'object') {
        settings.themeCssOverrides = Object.assign({}, settings.themeCssOverrides, op.themeCssOverrides);
      }
    } else if (op.op === 'set_field_property') {
      const f = findField(schema.fields, op.key);
      if (!f) continue;
      if (op.path === 'options' && Array.isArray(op.value)) f.options = op.value;
      else if (op.path === 'required') f.required = !!op.value;
      else f[op.path] = op.value;
    } else if (op.op === 'remove_field') {
      removeField(schema.fields, op.key);
      const html = settings.customHtml || '';
      const next = html.split('{{field:' + op.key + '}}').join('');
      if (next !== html) { settings.customHtml = next; touchedCustomHtml = true; }
      structural = true;
    } else if (op.op === 'add_field') {
      const nf = { key: op.key, type: op.type, label: op.label || op.key, required: !!op.required, options: op.options || [] };
      schema.fields.push(nf);
      // insert placeholder into the requested step block (or append before closing of last step)
      settings.customHtml = insertFieldPlaceholder(settings.customHtml || '', op.key, op.step);
      touchedCustomHtml = true; structural = true;
    }
  }
  return { touchedCustomHtml, touchedShellText, structural };
}

function removeField(fields, key) {
  for (let i = 0; i < (fields || []).length; i++) {
    const f = fields[i];
    if (f.key === key) { fields.splice(i, 1); return true; }
    if (f.type === 'Row' && Array.isArray(f.columns)) for (const c of f.columns) if (removeField(c.fields || [], key)) return true;
  }
  return false;
}

// Insert {{field:KEY}} just before the closing tag of the target data-step block.
function insertFieldPlaceholder(html, key, step) {
  const tok = '{{field:' + key + '}}';
  if (html.indexOf(tok) >= 0) return html;
  // find the start of the step block
  const re = new RegExp('data-step\\s*=\\s*["\\\']?' + (step == null ? '\\d+' : step) + '["\\\']?', 'i');
  const m = html.match(re);
  if (m) {
    // find the position of the LAST {{field:...}} inside that step region and insert after it
    const start = html.indexOf(m[0]);
    // crude: insert right after the next field token following the step marker
    const after = html.indexOf('}}', start);
    if (after > 0) return html.slice(0, after + 2) + tok + html.slice(after + 2);
  }
  // fallback: append at end of last field token
  const lastTok = html.lastIndexOf('}}');
  if (lastTok > 0) return html.slice(0, lastTok + 2) + tok + html.slice(lastTok + 2);
  return html + tok;
}
