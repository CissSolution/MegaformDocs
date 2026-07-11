#!/usr/bin/env node
/*
 * gen-template-facts.cjs — Auto-generate <slug>.facts.json from premium template JSON.
 *
 * The facts file is the DETERMINISTIC MAP the AI loads before editing a premium form,
 * so it never has to inspect/guess the shell. It lists every field with its display
 * kind (chips/cards/input), the step it belongs to, the css-class inventory, and the
 * exact {{field:KEY}} / {{content:KEY}} token positions. Regenerating after any edit
 * keeps facts in sync with the form (anti-drift, handoff NT3 / KB-2).
 *
 * Source:  Samples/FormTemplates/Premium/<slug>.json  (normalized template export)
 * Output:  <slug>.facts.json written to ALL 3 platform TemplateGuides dirs.
 *
 * Pure / deterministic — no AI, no network. Run inside pack.cmd before verify.
 *
 * Usage:
 *   node MegaForm.UI/tools/gen-template-facts.cjs           # all templates -> 3 dirs
 *   node MegaForm.UI/tools/gen-template-facts.cjs --check    # generate to temp, diff, exit 1 on drift
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(REPO, 'Samples', 'FormTemplates', 'Premium');
const GUIDE_DIRS = [
  path.join(REPO, 'MegaForm.Oqtane.Server', 'wwwroot', 'Modules', 'MegaForm', 'Resources', 'TemplateGuides'),
  path.join(REPO, 'MegaForm.DNN', 'Resources', 'TemplateGuides'),
  path.join(REPO, 'MegaForm.Web', 'wwwroot', 'Modules', 'MegaForm', 'Resources', 'TemplateGuides'),
];

const sha256 = (s) => crypto.createHash('sha256').update(String(s == null ? '' : s), 'utf8').digest('hex');

// ── helpers ───────────────────────────────────────────────────────────────
// Flatten fields. A Row is rendered in customHtml by ONE {{field:rowKey}} token that
// expands both columns, so its leaf children have no individual token — we record the
// Row entry AND tag each child with parentRow so the placeholder check is correct.
function flattenFields(fields, out = [], parentRow = null) {
  for (const f of (fields || [])) {
    if (f && f.type === 'Row' && Array.isArray(f.columns)) {
      out.push(f); // the Row itself carries the {{field:rowKey}} placeholder
      for (const c of f.columns) flattenFields(c.fields || [], out, f.key);
    } else if (f && f.key) {
      if (parentRow) f.__parentRow = parentRow;
      out.push(f);
    }
  }
  return out;
}

function displayKind(f) {
  const d = String(
    f.optionDisplay || f.choiceDisplay || f.optionVariant ||
    (f.properties && (f.properties.optionDisplay || f.properties.optionVariant)) ||
    (f.widgetProps && (f.widgetProps.optionDisplay || f.widgetProps.optionVariant)) || ''
  ).toLowerCase();
  if (d === 'chips' || d === 'chip') return 'chips';
  if (d === 'cards' || d === 'card') return 'cards';
  if (['Radio', 'Select', 'Checkbox', 'MultiSelect'].includes(f.type)) return 'choice';
  return 'input';
}

// Split customHtml into step segments using data-step / in-step boundaries, then map
// each {{field:KEY}} token to the step it falls inside. Works for the customHtml-wizard
// pattern used by every premium template (data-step="N" blocks driven by a customScript).
function deriveSteps(html, fieldKeys) {
  // Collect indices of step-block openers in document order.
  const re = /<([a-z0-9]+)[^>]*\bdata-step\s*=\s*["']?(\d+)["']?[^>]*>/gi;
  const marks = [];
  let m;
  while ((m = re.exec(html)) !== null) marks.push({ idx: m.index, step: parseInt(m[2], 10) });
  if (!marks.length) {
    // Fallback: left-rail wizards (intake) use class="in-step ..." rail items but render
    // all fields in one panel — treat as a single content-driven step set.
    const railSteps = (html.match(/class="[^"]*\bin-step\b(?![-\w])[^"]*"/gi) || []).length;
    return { mechanism: railSteps ? 'rail-content' : 'single', anchor: railSteps ? 'in-step' : null, count: railSteps || 1, steps: [] };
  }
  // Slice [start,nextStart) per marker in `ordered` and bucket the {{field:KEY}} tokens.
  const segmentBy = (ordered) => {
    const out = [];
    for (let i = 0; i < ordered.length; i++) {
      const start = ordered[i].idx;
      const end = i + 1 < ordered.length ? ordered[i + 1].idx : html.length;
      const seg = html.slice(start, end);
      const keys = (seg.match(/\{\{field:([a-zA-Z0-9_\-]+)\}\}/g) || []).map(t => t.replace(/\{\{field:|\}\}/g, ''));
      out.push({ index: ordered[i].step, fieldKeys: keys });
    }
    return out;
  };
  // A premium shell repeats each data-step="N" TWICE: the stepper-NAV item (rendered
  // first, holds NO field tokens) and the content PANEL (holds the {{field:KEY}}
  // tokens). Deduping by FIRST occurrence picks the nav markers, whose final segment
  // then swallows every field token into the last step (the bug). So build BOTH a
  // keep-first and a keep-last ordered set, segment each, and keep whichever spreads
  // tokens across MORE non-empty steps — the content-panel set wins. Single-marker
  // templates (one data-step per number) tie and fall back to keep-first (unchanged).
  const firstSeen = new Set(), firstOrdered = [];
  for (const mk of marks) { if (!firstSeen.has(mk.step)) { firstSeen.add(mk.step); firstOrdered.push(mk); } }
  const lastByStep = new Map();
  for (const mk of marks) lastByStep.set(mk.step, mk);            // later occurrence overwrites
  const lastOrdered = [...lastByStep.values()].sort((a, b) => a.idx - b.idx);
  const firstSteps = segmentBy(firstOrdered);
  const lastSteps = segmentBy(lastOrdered);
  const nonEmpty = (arr) => arr.filter(s => s.fieldKeys.length).length;
  const useLast = nonEmpty(lastSteps) > nonEmpty(firstSteps);
  const ordered = useLast ? lastOrdered : firstOrdered;
  const steps = useLast ? lastSteps : firstSteps;
  return { mechanism: 'customHtml-wizard', anchor: 'data-step', count: ordered.length, steps };
}

function tokenInventory(html) {
  const fieldToks = [...new Set((html.match(/\{\{field:[a-zA-Z0-9_\-]+\}\}/g) || []))];
  const contentToks = [...new Set((html.match(/\{\{content:[a-zA-Z0-9_\-]+\}\}/g) || []))].map(t => t.replace(/\{\{content:|\}\}/g, ''));
  const scriptToks = [...new Set((html.match(/\{\{script:[a-zA-Z0-9_\-]+\}\}/g) || []))].map(t => t.replace(/\{\{script:|\}\}/g, ''));
  const formToks = [...new Set((html.match(/\{\{form:[a-zA-Z0-9_\-]+\}\}/g) || []))].map(t => t.replace(/\{\{form:|\}\}/g, ''));
  return { fieldToks, contentToks, scriptToks, formToks };
}

// Visible text nodes in the shell (hero headings, section/field span labels, step
// labels, button text) — the literal strings the AI may rebrand via set_html_text
// without touching structure. Excludes tokens/whitespace/pure punctuation.
function extractShellTexts(html) {
  const out = [];
  const seen = new Set();
  const re = />([^<>{}]+)</g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let t = m[1].replace(/\s+/g, ' ').trim();
    if (!t || t.length < 2 || t.length > 90) continue;
    if (/^[\d\s.,:;|/\\*°•·–—-]+$/.test(t)) continue; // pure punctuation/number-ish (keep step nums separately)
    if (/\{\{/.test(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.slice(0, 60);
}

// [B5 2026-06-27] Scoped COLOUR custom-properties the AI may retint via
// themeCssOverrides for a C8 colour change. Premium templates scope their palette
// under template-specific vars (e.g. --au-primary, --in-primary) — the generic
// --primary is INERT for them, so C8 must target THESE names. Captures the first
// (:root-scope) definition of every --var whose value is a solid colour.
function extractColorVars(css) {
  const out = {};
  const re = /(--[a-z0-9][\w-]*)\s*:\s*([^;{}]+);/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    const name = m[1].trim();
    const val = m[2].trim();
    if (/^#[0-9a-f]{3,8}$/i.test(val) || /^(rgb|hsl)a?\(/i.test(val)) {
      if (!(name in out)) out[name] = val;            // keep first (root) definition
    }
  }
  // Order primary/accent/brand/ink first so the guide highlights the useful ones.
  const rank = (n) => /(primary|accent|brand|ink|main|heading|title|button|cta)/i.test(n) ? 0 : 1;
  const ordered = {};
  Object.keys(out).sort((a, b) => rank(a) - rank(b)).slice(0, 24).forEach(k => { ordered[k] = out[k]; });
  return ordered;
}

function detectChipCardClass(css, kind) {
  // Find the most specific scoped selector that styles chip/card option items.
  const needle = kind === 'chips' ? /chip/i : /(card|programme|tile|option-item--cards)/i;
  const sels = (css.match(/\.[a-zA-Z][\w\-]*(?:[ .>][.a-zA-Z][\w\-]*)*\s*\{/g) || [])
    .map(s => s.replace(/\s*\{$/, '').trim())
    .filter(s => needle.test(s));
  return [...new Set(sels)].slice(0, 8);
}

// ── core: build facts for one normalized template object ────────────────────
function buildFacts(tpl) {
  const slug = tpl.slug;
  const settings = tpl.settings || {};
  const html = tpl.customHtml || settings.customHtml || '';
  const css = tpl.customCss || settings.customCss || '';
  const theme = tpl.theme || settings.theme || '';
  const flat = flattenFields(tpl.fields || []);
  const fieldKeys = flat.map(f => f.key);
  const { fieldToks, contentToks, scriptToks, formToks } = tokenInventory(html);
  const stepInfo = deriveSteps(html, fieldKeys);

  // [native-step detect 20260630] The premium→native migration (premium-native-migration.ts)
  // STRIPS the wizard JS (scriptTokens emptied, root gains class `mfp-native-generated`,
  // settings.premiumNativePageBreak=true) but KEEPS the data-step panels — the NATIVE renderer
  // (Section + pageBreak), NOT a customScript, now drives navigation. Relabel the mechanism so the
  // AI guidance (C4/C5) describes native Section/pageBreak steps instead of a now-DELETED wizard
  // script. (Fixes stale stepMechanism='customHtml-wizard' on migrated templates.)
  const isPremiumNative = stepInfo.anchor === 'data-step' && (
    settings.premiumNativePageBreak === true || settings.PremiumNativePageBreak === true ||
    /\bmfp-native-generated\b/.test(html) || scriptToks.length === 0
  );
  if (isPremiumNative) { stepInfo.mechanism = 'premium-native'; }

  // map key -> step index (0-based; preserve step 0 explicitly)
  const keyStep = {};
  for (const s of stepInfo.steps) for (const k of s.fieldKeys) keyStep[k] = s.index;
  const stepOf = (k) => Object.prototype.hasOwnProperty.call(keyStep, k) ? keyStep[k] : null;

  const fields = flat.map(f => {
    const tok = '{{field:' + f.key + '}}';
    const ownTok = html.indexOf(tok) >= 0;
    const viaRow = f.__parentRow ? html.indexOf('{{field:' + f.__parentRow + '}}') >= 0 : false;
    const ent = {
      key: f.key,
      type: f.type,
      label: f.label || '',
      display: displayKind(f),
      optionCount: Array.isArray(f.options) ? f.options.length : 0,
      step: stepOf(f.key) !== null ? stepOf(f.key) : (f.__parentRow ? stepOf(f.__parentRow) : null),
      placeholder: f.__parentRow && !ownTok ? '{{field:' + f.__parentRow + '}}' : tok,
      inCustomHtml: ownTok || viaRow,
      required: !!f.required,
    };
    if (f.__parentRow) ent.renderedViaRow = f.__parentRow;
    return ent;
  });

  // root selector = the richest mfp class list on any element (prefer one carrying mfp-<name>).
  // customHtml may use single OR double quotes for attributes.
  const classLists = (html.match(/class=["']([^"']*\bmfp\b[^"']*)["']/g) || [])
    .map(s => s.replace(/^class=["']|["']$/g, '').trim());
  let rootCls = classLists.find(c => /\bmfp-[a-z]/.test(c)) || classLists[0] || '';
  const rootSelector = rootCls ? '.' + rootCls.split(/\s+/).filter(Boolean).join('.') : (theme ? '.mfp' : '');

  // css class inventory (top-level class tokens, deduped, scoped ones first)
  const cssClasses = [...new Set((css.match(/\.[a-zA-Z][\w\-]+/g) || []).map(s => s.slice(1)))]
    .filter(c => !/^(googleapis|com|gstatic)$/.test(c));

  // A field is "missing" only if neither its own token nor its parent-Row token exists —
  // EXCEPT structural/layout markers (Section page-breaks like premium_step_N, plain Html
  // blocks) which are rendered by position, never via a {{field:KEY}} token. Flagging them
  // as "missing" wrongly invited the AI to inject tokens for them and break the native shell.
  const STRUCTURAL_NO_TOKEN = new Set(['Section', 'Html']);
  const missingFieldPlaceholders = fields
    .filter(f => !f.inCustomHtml && !STRUCTURAL_NO_TOKEN.has(f.type))
    .map(f => f.key);
  const orphanFieldPlaceholders = fieldToks
    .map(t => t.replace(/\{\{field:|\}\}/g, ''))
    .filter(k => !fieldKeys.includes(k));

  const chipFields = fields.filter(f => f.display === 'chips').map(f => f.key);
  const cardFields = fields.filter(f => f.display === 'cards').map(f => f.key);
  const shellTexts = extractShellTexts(html);
  const colorVars = extractColorVars(css);

  return {
    _comment: 'AUTO-GENERATED by gen-template-facts.cjs — DO NOT EDIT BY HAND. Regenerate after any template change.',
    slug,
    templateGuideSlug: tpl.templateGuideSlug || ('tpl-' + slug),
    theme,
    title: tpl.title || '',
    tokenStyle: 'double',           // {{field:KEY}}
    rootSelector,
    stepMechanism: stepInfo.mechanism,
    stepAnchor: stepInfo.anchor,
    stepCount: stepInfo.count,
    steps: stepInfo.steps,
    fields,
    chipFields,
    cardFields,
    chipSelectors: chipFields.length ? detectChipCardClass(css, 'chips') : [],
    cardSelectors: cardFields.length ? detectChipCardClass(css, 'cards') : [],
    colorVars,
    contentTokens: contentToks,
    scriptTokens: scriptToks,
    formTokens: formToks,
    shellTexts,
    cssClassCount: cssClasses.length,
    cssClasses: cssClasses.slice(0, 120),
    missingFieldPlaceholders,
    orphanFieldPlaceholders,
    hashes: {
      customCssSha256: sha256(css),
      customHtmlSha256: sha256(html),
      // shell hash = customHtml with all {{...}} tokens + tag text stripped (structure only)
      shellSha256: sha256(html.replace(/\{\{[^}]*\}\}/g, '').replace(/>[^<]*</g, '><')),
    },
    counts: { fields: fields.length, fieldTokens: fieldToks.length, steps: stepInfo.count },
    immutable: ['customHtml structure (tag tree + classes)', 'customCss (byte-invariant)', 'settings.theme', 'field keys'],
    mutableDataOnly: ['field.label', 'field.options[] (chips/cards)', 'field.placeholder', 'field.required', 'settings.customContent[*]', 'title', 'description'],
    generatedFrom: tpl._source || (slug + '.json'),
  };
}

// ── build a COMPACT, deterministic guide.md from facts + template ───────────
// chat.ts injects only guideText.slice(0,6000), so the body must stay terse. The
// per-operation "formulas" are generic but parameterised by THIS template's facts
// (chip/card field keys, step anchor, content tokens) so the AI fills slots, not guesses.
function buildGuide(facts, tpl) {
  const f = facts;
  const settings = tpl.settings || {};
  const content = settings.customContent || {};
  const contentKeys = Object.keys(content);
  // LEAN frontmatter (machine map). Full fields[]/steps[] live in <slug>.facts.json;
  // here we keep only what the gate + AI need so guide.md stays under the inject cap.
  const fm = {
    templateGuideSlug: f.templateGuideSlug,
    slug: f.slug,
    theme: f.theme,
    rootSelector: f.rootSelector,
    tokenStyle: f.tokenStyle,
    stepMechanism: f.stepMechanism,
    stepAnchor: f.stepAnchor,
    stepCount: f.stepCount,
    stepFieldKeys: f.steps.map(s => ({ step: s.index, keys: s.fieldKeys })),
    chipFields: f.chipFields,
    cardFields: f.cardFields,
    contentTokens: f.contentTokens,
    colorVars: f.colorVars,
    lockedKeys: f.fields.filter(x => x.type !== 'Row').map(x => x.key),
    missingFieldPlaceholders: f.missingFieldPlaceholders,
    shellTexts: f.shellTexts,
    allowedOps: ['set_form_meta', 'set_field_property', 'set_html_text', 'add_field', 'remove_field'],
    forbiddenOps: ['replace_form_schema', 'set customHtml/customCss/theme'],
    immutable: f.immutable,
    customCssSha256: f.hashes.customCssSha256,
    shellSha256: f.hashes.shellSha256,
  };
  const chip = f.chipFields[0] || '<chipFieldKey>';
  const card = f.cardFields[0] || '<cardFieldKey>';
  const lastStep = f.stepCount ? (f.steps.length ? f.steps[f.steps.length - 1].index : f.stepCount - 1) : 0;
  const tableRows = f.fields.filter(x => x.type !== 'Row')
    .map(x => `| ${x.key} | ${x.type} | ${x.display} | ${x.step == null ? '-' : x.step} | ${x.optionCount || ''} |`).join('\n');
  const contentDict = contentKeys.length
    ? contentKeys.map(k => `- \`${k}\`: "${String(content[k]).slice(0, 60).replace(/\n/g, ' ')}"`).join('\n')
    : '_(none — this template has no {{content:*}} tokens)_';

  const body = `# AI Edit Guide — ${f.title || f.slug}

Theme \`${f.theme}\` · root \`${f.rootSelector}\` · ${f.fields.filter(x => x.type !== 'Row').length} fields · ${f.stepCount} steps (${f.stepMechanism}).

## DETERMINISTIC EDIT PROTOCOL (follow exactly — do NOT improvise structure/CSS)
This is a PREMIUM form. Its look lives in \`settings.customHtml\` + \`settings.customCss\` + \`settings.theme\`, which are **IMMUTABLE**. You may ONLY emit these ops, and ONLY against keys/tokens listed in the frontmatter map:
- \`set_form_meta\` — title, description, submitButtonText, successMessage, \`customContent.<token>\`, or \`themeCssOverrides\` (color only).
- \`set_field_property\` — label / placeholder / required / options (on an EXISTING key).
- \`add_field\` — append a new field (the dispatcher injects its \`{{field:KEY}}\` into the right panel).
- \`remove_field\` — delete a field + its token.
NEVER emit \`customHtml\`, \`customCss\`, \`theme\`, or \`replace_form_schema\` for this form. NEVER rename a key in \`lockedKeys\`. Emit \`designDecision:"preserve"\` on every op.

## Field map
| key | type | display | step | options |
|-----|------|---------|------|---------|
${tableRows}

## Content tokens ({{content:*}} — editable text shown in the shell)
${contentDict}

## Editable shell text (hardcoded headings/labels — change via set_html_text, NOT customHtml)
Some visible text (hero heading, step labels, section/field captions) is baked into customHtml as plain text, NOT a field.label or token. To rebrand it, emit set_html_text with the EXACT current string (from this list) — it does a text-only swap that keeps the tag tree + CSS byte-identical:
${(f.shellTexts || []).slice(0, 28).map(t => '- "' + t.replace(/"/g, '\\"') + '"').join('\n') || '_(none)_'}

## Formulas (fill the slots — never change the op shape)
- **C1 Change content/title**: form title \`{op:"set_form_meta", title:"New title", designDecision:"preserve"}\`; a field's editable label \`{op:"set_field_property", key:"<key>", path:"label", value:"New label", designDecision:"preserve"}\`; a {{content:*}} token \`{op:"set_form_meta", customContent:{"<token>":"New text"}, designDecision:"preserve"}\`; **a hardcoded shell heading/caption** \`{op:"set_html_text", find:"<exact current text from the list above>", replace:"New text", designDecision:"preserve"}\` (text-only swap; never include HTML tags in find/replace).
- **C6 Edit CHIP options** (fields: ${f.chipFields.join(', ') || 'none'}): \`{op:"set_field_property", key:"${chip}", path:"options", value:[{"value":"v1","label":"Label 1"},…], designDecision:"preserve"}\`. Keep the field's \`optionDisplay:"chips"\` — set ONLY options. The chip look (\`.mf-option-group--chips\`) is in customCss and stays.
- **C7 Edit CARD options** (fields: ${f.cardFields.join(', ') || 'none'}): \`{op:"set_field_property", key:"${card}", path:"options", value:[{"value":"v1","label":"Title","meta":"Subtitle","description":"…"},…], designDecision:"preserve"}\`. Keep \`optionDisplay:"cards"\`. Card chrome (\`.mf-option-group--cards\`) stays. ⚠ ICONS — do NOT invent, change, or remove icons: MegaForm's rich-choice catalog/theme owns icon assignment. If an option ALREADY has an \`icon\`, keep it byte-for-byte; if it has none, OMIT the \`icon\` field (never emit a plain descriptive word like "city"/"beach" — it renders as literal text). Edit ONLY \`label\`/\`meta\`/\`description\`/\`value\`.
- **C2 Add field**: \`{op:"add_field", type:"Text", key:"new_key", label:"…", step:${lastStep}, designDecision:"preserve"}\` — the dispatcher inserts \`{{field:new_key}}\` into the matching \`${f.stepAnchor || 'panel'}\` block. Pick a snake_case key not already used.
- **C3 Remove field**: \`{op:"remove_field", key:"<key>", designDecision:"preserve"}\` — removes the field and its token; leaves zero orphan placeholders.
- **C8 Change COLOUR (only if the user explicitly asks)**: \`{op:"set_form_meta", themeCssOverrides:{"<scoped-var>":"#hex",…}, designDecision:"preserve"}\`. ⚠ This template scopes its palette under TEMPLATE-SPECIFIC vars — target THOSE exact names (the generic \`--primary\`/\`--accent\` are INERT here). Available colour vars (current value):\n${Object.keys(f.colorVars || {}).length ? Object.entries(f.colorVars).slice(0, 14).map(([k, v]) => `  - \`${k}\`: ${v}`).join('\n') : '  - _(none detected — fall back to --primary/--accent)_'}\n  NEVER edit customCss for colour — customCss must stay byte-identical (sha256 \`${f.hashes.customCssSha256.slice(0, 12)}…\`).
- **C4/C5 Add/Remove step** (ADVANCED — ${f.stepMechanism}): ${f.stepMechanism === 'premium-native'
    ? 'steps are NATIVE — driven by `Section` fields with `properties.pageBreak:true` (one marker per step) alongside the `' + (f.stepAnchor || 'data-step') + '` panels in customHtml. There is NO wizard script. To ADD a step: append a new `' + (f.stepAnchor || 'data-step') + '` panel block via `customHtmlAppend` (NEVER touch customCss), add a `Section` field with `properties.pageBreak:true`, and place the new fields/placeholders inside that panel. To REMOVE: delete the panel + its `Section` marker + its fields.'
    : 'steps are `' + (f.stepAnchor || 'panel') + '` blocks in customHtml driven by `' + (f.scriptTokens[0] || 'the wizard script') + '`. Clone an existing `' + (f.stepAnchor || 'panel') + '` block via `customHtmlAppend` (NEVER touch customCss), renumber the stepper, and add the new fields with placeholders.'} Only attempt if the user explicitly asks. If unsure, ask the user instead of guessing.

## Hard invariants (a change that breaks any of these is a FAILURE — refuse the op)
- customCss sha256 stays \`${f.hashes.customCssSha256.slice(0, 16)}…\` · customHtml shell sha256 stays \`${f.hashes.shellSha256.slice(0, 16)}…\` (unless C2/C4 legitimately add a node).
- \`settings.theme\` stays \`${f.theme}\`. Every field keeps a \`{{field:key}}\` (own or via Row). Zero orphan/zero floating-outside-card fields.
`;

  return '---\n' + JSON.stringify(fm, null, 2) + '\n---\n' + body;
}

// ── normalize a raw template/form JSON into the shape buildFacts wants ──────
function normalize(raw, fileName) {
  // Form export shape: { SchemaJson, SettingsJson } strings.
  if (raw.SchemaJson || raw.schemaJson) {
    const schema = JSON.parse(raw.SchemaJson || raw.schemaJson || '{}');
    const settings = JSON.parse(raw.SettingsJson || raw.settingsJson || '{}');
    return {
      slug: raw.slug || path.basename(fileName, '.json'),
      templateGuideSlug: settings.templateGuideSlug || raw.templateGuideSlug,
      theme: settings.theme,
      title: raw.Name || raw.title || schema.title || '',
      fields: schema.fields || [],
      customHtml: settings.customHtml || '',
      customCss: settings.customCss || '',
      settings,
      _source: fileName,
    };
  }
  // Flat template shape (Samples/FormTemplates/Premium/*.json).
  const settings = raw.settings || {};
  return {
    slug: raw.slug || path.basename(fileName, '.json'),
    templateGuideSlug: raw.templateGuideSlug || settings.templateGuideSlug,
    theme: raw.theme || settings.theme,
    title: raw.title || '',
    fields: raw.fields || [],
    customHtml: raw.customHtml || settings.customHtml || '',
    customCss: raw.customCss || settings.customCss || '',
    settings: Object.assign({}, settings, { customContent: settings.customContent || raw.customContent }),
    _source: fileName,
  };
}

function listTemplateFiles() {
  if (!fs.existsSync(SRC_DIR)) return [];
  return fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.json')).map(f => path.join(SRC_DIR, f));
}

function main() {
  const check = process.argv.includes('--check');
  const files = listTemplateFiles();
  if (!files.length) { console.error('[gen-facts] no template JSON found in ' + SRC_DIR); process.exit(0); }
  for (const d of GUIDE_DIRS) if (!check) fs.mkdirSync(d, { recursive: true });

  let drift = 0, written = 0;
  for (const file of files) {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { console.error('[gen-facts] bad JSON ' + file + ': ' + e.message); process.exit(1); }
    const tpl = normalize(raw, path.basename(file));
    if (!tpl.customHtml) { console.log('[gen-facts] skip (no customHtml): ' + tpl.slug); continue; }
    const facts = buildFacts(tpl);
    const json = JSON.stringify(facts, null, 2);
    const guide = buildGuide(facts, tpl);
    const factsName = tpl.slug + '.facts.json';
    const guideName = tpl.slug + '.guide.md';
    for (const d of GUIDE_DIRS) {
      for (const [name, payload] of [[factsName, json], [guideName, guide]]) {
        const dest = path.join(d, name);
        if (check) {
          const prev = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
          if (prev.trim() !== payload.trim()) { drift++; console.error('[gen-facts] DRIFT: ' + dest); }
        } else {
          fs.writeFileSync(dest, payload);
          written++;
        }
      }
    }
    console.log(`[gen-facts] ${tpl.slug}: ${facts.counts.fields} fields, ${facts.stepCount} steps (${facts.stepMechanism}), chips=[${facts.chipFields}] cards=[${facts.cardFields}] guide=${guide.length}b` +
      (facts.missingFieldPlaceholders.length ? ` ⚠ missing=[${facts.missingFieldPlaceholders}]` : ''));
  }
  if (check && drift) { console.error(`[gen-facts] ${drift} drifted facts file(s) — run gen-template-facts.cjs`); process.exit(1); }
  console.log(`[gen-facts] done. ${check ? 'check OK' : written + ' files written across ' + GUIDE_DIRS.length + ' platform dirs'}.`);
}

if (require.main === module) main();
module.exports = { buildFacts, normalize };
