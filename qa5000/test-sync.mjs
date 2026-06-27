// Unit test for syncFieldPlaceholders (node mirror of @shared/custom-html-insert).
// Verifies Row-sub-field de-dup + step-aware insertion on real australia customHtml.
import { readFileSync } from 'node:fs';
import { launch, login, getForm } from './lib.mjs';

// ── mirror of insertIntoCardBody (fallback) ──
function lastMatchIndex(s, rx) { let m, last = -1; rx.lastIndex = 0; while ((m = rx.exec(s)) !== null) { last = m.index; if (m.index === rx.lastIndex) rx.lastIndex++; } return last; }
function insertIntoCardBody(html, block) {
  const src = String(html || ''); if (!src) return src + block;
  const a = lastMatchIndex(src, /<div[^>]*\bclass\s*=\s*["'][^"']*\bactions\b[^"']*["'][^>]*>/gi); if (a >= 0) return src.slice(0, a) + block + src.slice(a);
  const s = lastMatchIndex(src, /<(?:button|input)[^>]*\btype\s*=\s*["']submit["'][^>]*>/gi); if (s >= 0) return src.slice(0, s) + block + src.slice(s);
  const t = src.lastIndexOf('{{form:submit}}'); if (t >= 0) { const e = src.lastIndexOf('<', t); return src.slice(0, e >= 0 ? e : t) + block + src.slice(e >= 0 ? e : t); }
  const c = src.lastIndexOf('</div>'); if (c >= 0) return src.slice(0, c) + block + src.slice(c); return src + block;
}
function insertFieldIntoStep(html, block, step) {
  const src = String(html || ''); const esc = String(step).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openRe = new RegExp('<([a-z0-9]+)[^>]*\\bdata-step\\s*=\\s*["\']?' + esc + '["\']?[^>]*>', 'gi');
  const opens = []; let m; while ((m = openRe.exec(src)) !== null) { opens.push({ idx: m.index, tag: m[1].toLowerCase() }); if (m.index === openRe.lastIndex) openRe.lastIndex++; }
  if (!opens.length) return null;
  const anyRe = /<[a-z0-9]+[^>]*\bdata-step\s*=\s*["']?\d+["']?[^>]*>/gi; const allIdx = []; while ((m = anyRe.exec(src)) !== null) { allIdx.push(m.index); if (m.index === anyRe.lastIndex) anyRe.lastIndex++; }
  const endOf = start => { for (const i of allIdx) if (i > start) return i; return src.length; };
  const panel = opens.find(o => /\{\{field:/.test(src.slice(o.idx, endOf(o.idx)))) || opens[opens.length - 1];
  const segStart = panel.idx, segEnd = endOf(panel.idx), seg = src.slice(segStart, segEnd);
  let cp = seg.lastIndexOf('</' + panel.tag + '>'); if (cp < 0) cp = Math.max(seg.lastIndexOf('</section>'), seg.lastIndexOf('</div>'));
  if (cp < 0) return src.slice(0, segEnd) + block + src.slice(segEnd);
  const at = segStart + cp; return src.slice(0, at) + block + src.slice(at);
}
function syncFieldPlaceholders(html, fields) {
  let src = String(html || ''); if (!src) return src;
  const ownKeys = [], subKeys = new Set(), validKeys = new Set();
  (function walk(arr, parentRow, parentStep) { for (const f of arr || []) { if (!f || !f.key) continue; const key = String(f.key); validKeys.add(key); const step = (f.step != null ? f.step : parentStep); if (f.type === 'Row' && Array.isArray(f.columns)) { ownKeys.push({ key, step }); for (const c of f.columns) walk(c.fields || [], f, step); } else if (parentRow) subKeys.add(key); else if (f.type === 'Hidden' || f.type === 'Section') {} else ownKeys.push({ key, step }); } })(fields, null, null);
  const seen = new Set();
  src = src.replace(/\{\{field:([a-zA-Z0-9_\-]+)\}\}/g, (full, key) => { if (subKeys.has(key) || !validKeys.has(key)) return ''; if (seen.has(key)) return ''; seen.add(key); return full; });
  src = src.replace(/<div\s+class=["']mf-custom-field["']>\s*<\/div>/gi, '');
  const isWizard = /\bdata-step\s*=/.test(src);
  const stepAt = pos => { const r = /<[a-z0-9]+[^>]*\bdata-step\s*=\s*["']?(\d+)["']?[^>]*>/gi; let mm, s = null; while ((mm = r.exec(src)) !== null) { if (mm.index <= pos) s = parseInt(mm[1], 10); else break; } return s; };
  for (const { key, step } of ownKeys) {
    if (src.indexOf('{{field:' + key + '}}') >= 0) continue;
    const block = '<div class="mf-custom-field">{{field:' + key + '}}</div>';
    let target = step;
    if (isWizard && target == null) { const idx = ownKeys.findIndex(o => o.key === key); for (let j = idx - 1; j >= 0; j--) { const p = src.indexOf('{{field:' + ownKeys[j].key + '}}'); if (p >= 0) { target = stepAt(p); break; } } if (target == null) for (let j = idx + 1; j < ownKeys.length; j++) { const p = src.indexOf('{{field:' + ownKeys[j].key + '}}'); if (p >= 0) { target = stepAt(p); break; } } }
    let next = (isWizard && target != null) ? insertFieldIntoStep(src, block, target) : null;
    if (next == null) next = insertIntoCardBody(src, block);
    src = next;
  }
  return src;
}

// ── diagnostics ──
const norm = s => String(s).replace(/\s+/g, ' ').trim();
function report(label, html, fields) {
  const stepAt = pos => { const r = /<[a-z0-9]+[^>]*\bdata-step\s*=\s*["']?(\d+)["']?[^>]*>/gi; let mm, s = 'OUT'; while ((mm = r.exec(html)) !== null) { if (mm.index <= pos) s = parseInt(mm[1], 10); else break; } return s; };
  const toks = [...html.matchAll(/\{\{field:([a-z0-9_\-]+)\}\}/gi)].map(m => ({ key: m[1], step: stepAt(m.index) }));
  const counts = {}; toks.forEach(t => counts[t.key] = (counts[t.key] || 0) + 1);
  const dup = Object.entries(counts).filter(([, n]) => n > 1).map(([k, n]) => `${k}×${n}`);
  const sub = new Set(); (function w(a, p) { for (const f of a || []) { if (f.type === 'Row' && f.columns) { for (const c of f.columns) w(c.fields, true); } else if (p && f.key) sub.add(f.key); } })(fields, false);
  const subTok = toks.filter(t => sub.has(t.key)).map(t => t.key);
  console.log(`\n[${label}] tokens (key@step): ${toks.map(t => t.key + '@' + t.step).join(', ')}`);
  console.log(`  duplicates: ${dup.length ? dup.join(',') : 'none'} | row-subfield-with-token: ${subTok.length ? subTok.join(',') : 'none'}`);
}

const { browser, page } = await launch(true);
try {
  await login(page);
  // CASE A: current (broken) form 13
  const f13 = await getForm(page, 13);
  const s13 = JSON.parse(f13.settingsJson || f13.SettingsJson || '{}');
  const sc13 = JSON.parse(f13.schemaJson || f13.SchemaJson || '{}');
  report('A BEFORE (form13 broken)', s13.customHtml || '', sc13.fields);
  const fixed = syncFieldPlaceholders(s13.customHtml || '', sc13.fields);
  report('A AFTER (synced)', fixed, sc13.fields);

  // CASE B: clean australia + 3 new fields (tin after nationality=step0, passport step0, extra step2)
  const tpl = JSON.parse(readFileSync('Samples/FormTemplates/Premium/down-under-australia.json', 'utf8'));
  const html = tpl.settings.customHtml;
  const fields = JSON.parse(JSON.stringify(tpl.fields));
  // insert new top-level fields after nationality + into step 2-ish (no step prop → derive from neighbor)
  const idxNat = fields.findIndex(f => f.key === 'nationality');
  fields.splice(idxNat + 1, 0, { key: 'tin', type: 'Text', label: 'TIN', options: [] }, { key: 'passport', type: 'Text', label: 'Passport', options: [] });
  report('B BEFORE (clean australia + tin/passport in schema, no tokens)', html, fields);
  const fixedB = syncFieldPlaceholders(html, fields);
  report('B AFTER (synced — tin/passport should land in step 0 after nationality)', fixedB, fields);
} finally { await browser.close(); }
