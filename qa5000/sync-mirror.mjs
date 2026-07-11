// Node mirror of @shared/custom-html-insert.{insertIntoCardBody,insertFieldIntoStep,
// syncFieldPlaceholders,reorderFieldTokens} — kept in LOCKSTEP so harness E2E reflects
// the product fix. If you change one, change the other (TS ↔ this).
function lastMatchIndex(s, rx) { let m, last = -1; rx.lastIndex = 0; while ((m = rx.exec(s)) !== null) { last = m.index; if (m.index === rx.lastIndex) rx.lastIndex++; } return last; }
export function insertIntoCardBody(html, block) {
  const src = String(html || ''); if (!src) return src + block;
  const a = lastMatchIndex(src, /<div[^>]*\bclass\s*=\s*["'][^"']*\bactions\b[^"']*["'][^>]*>/gi); if (a >= 0) return src.slice(0, a) + block + src.slice(a);
  const s = lastMatchIndex(src, /<(?:button|input)[^>]*\btype\s*=\s*["']submit["'][^>]*>/gi); if (s >= 0) return src.slice(0, s) + block + src.slice(s);
  const t = src.lastIndexOf('{{form:submit}}'); if (t >= 0) { const e = src.lastIndexOf('<', t); return src.slice(0, e >= 0 ? e : t) + block + src.slice(e >= 0 ? e : t); }
  const c = src.lastIndexOf('</div>'); if (c >= 0) return src.slice(0, c) + block + src.slice(c); return src + block;
}
export function insertFieldIntoStep(html, block, step) {
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
function fieldWrapperRange(html, key) {
  const tok = '{{field:' + key + '}}'; const p = html.indexOf(tok); if (p < 0) return null;
  const lo = html.lastIndexOf('<label', p), lc = html.indexOf('</label>', p);
  if (lo >= 0 && lc > p && html.indexOf('{{field:', lo) === p) return { start: lo, end: lc + 8, html: html.slice(lo, lc + 8) };
  const d = html.lastIndexOf('<div', p), dc = html.indexOf('</div>', p);
  if (d >= 0 && dc > p && html.indexOf('{{field:', d) === p) return { start: d, end: dc + 6, html: html.slice(d, dc + 6) };
  return null;
}
function cloneSiblingWrapper(html, sibKey, newKey, newLabel, required) {
  const w = fieldWrapperRange(html, sibKey); if (!w) return null;
  let clone = w.html.split('{{field:' + sibKey + '}}').join('{{field:' + newKey + '}}');
  const texts = [...clone.matchAll(/>([^<>{}]+)</g)].map(m => m[1]).filter(t => t.replace(/\s+/g, ' ').trim().length > 1);
  if (texts.length) { const longest = texts.sort((a, b) => b.trim().length - a.trim().length)[0]; const safe = String(newLabel || newKey).replace(/[<>&]/g, c => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;')); clone = clone.replace('>' + longest + '<', '>' + safe + ' <'); }
  if (!required) clone = clone.replace(/<b[^>]*\bau-req\b[^>]*>[\s\S]*?<\/b>/i, '').replace(/\s\*\s*(?=<\/)/, '');
  return html.slice(0, w.end) + clone + html.slice(w.end);
}
function wrapperRangeAt(html, p, tokLen) {
  const lo = html.lastIndexOf('<label', p), lc = html.indexOf('</label>', p);
  if (lo >= 0 && lc > p && html.indexOf('{{field:', lo) === p) return { start: lo, end: lc + 8 };
  const d = html.lastIndexOf('<div', p), dc = html.indexOf('</div>', p);
  if (d >= 0 && dc > p && html.indexOf('{{field:', d) === p) return { start: d, end: dc + 6 };
  return { start: p, end: p + tokLen };
}
function removeBadWrappers(src, validKeys, subKeys) {
  const toks = []; const re = /\{\{field:([a-zA-Z0-9_\-]+)\}\}/g; let m;
  while ((m = re.exec(src)) !== null) { toks.push({ key: m[1], pos: m.index, len: m[0].length }); if (m.index === re.lastIndex) re.lastIndex++; }
  const seen = new Set(), bad = [];
  for (const t of toks) { const dup = validKeys.has(t.key) && !subKeys.has(t.key) && seen.has(t.key); if (subKeys.has(t.key) || !validKeys.has(t.key) || dup) bad.push(t); else seen.add(t.key); }
  for (let i = bad.length - 1; i >= 0; i--) { const r = wrapperRangeAt(src, bad[i].pos, bad[i].len); src = src.slice(0, r.start) + src.slice(r.end); }
  return src;
}
function removeOrphanSummaries(src, validKeys, subKeys, hasNameRow) {
  const keys = new Set(); const re = /data-au-summary\s*=\s*["']([a-zA-Z0-9_\-]+)["']/gi; let m;
  while ((m = re.exec(src)) !== null) keys.add(m[1]);
  for (const k of keys) {
    const valid = validKeys.has(k) || subKeys.has(k) || (k === 'name' && (hasNameRow || subKeys.has('first_name') || subKeys.has('last_name')));
    if (valid) continue;
    const rowRe = new RegExp("<div\\b[^>]*>(?:(?!</div>)[\\s\\S])*?data-au-summary\\s*=\\s*[\"']" + k + "[\"'](?:(?!</div>)[\\s\\S])*?</div>", 'gi');
    src = src.replace(rowRe, '');
  }
  return src;
}
export function syncFieldPlaceholders(html, fields) {
  let src = String(html || ''); if (!src) return src;
  const ownKeys = [], subKeys = new Set(), validKeys = new Set(); let hasNameRow = false;
  (function walk(arr, parentRow, parentStep) { for (const f of arr || []) { if (!f || !f.key) continue; const key = String(f.key); validKeys.add(key); const step = (f.step != null ? f.step : parentStep); const label = String(f.label || f.key || ''); const required = !!f.required; if (f.type === 'Row' && Array.isArray(f.columns)) { ownKeys.push({ key, step, label, required }); hasNameRow = true; for (const c of f.columns) walk(c.fields || [], f, step); } else if (parentRow) subKeys.add(key); else if (f.type === 'Hidden' || f.type === 'Section') {} else ownKeys.push({ key, step, label, required }); } })(fields, null, null);
  src = removeBadWrappers(src, validKeys, subKeys);
  src = src.replace(/<label\b[^>]*>(?:(?!<\/label>)[\s\S])*?<\/label>/gi, (blk) => (/\bau-field\b/.test(blk) && !/\{\{field:/.test(blk) && !/<(?:input|select|textarea)\b/i.test(blk)) ? '' : blk);
  src = src.replace(/<div\s+class=["']mf-custom-field["']>\s*<\/div>/gi, '');
  src = src.replace(/<div\b[^>]*\bau-(?:namerow|grid)[\w-]*\b[^>]*>\s*<\/div>/gi, '');
  src = removeOrphanSummaries(src, validKeys, subKeys, hasNameRow);
  const isWizard = /\bdata-step\s*=/.test(src);
  const stepAt = pos => { const r = /<[a-z0-9]+[^>]*\bdata-step\s*=\s*["']?(\d+)["']?[^>]*>/gi; let mm, s = null; while ((mm = r.exec(src)) !== null) { if (mm.index <= pos) s = parseInt(mm[1], 10); else break; } return s; };
  for (let i = 0; i < ownKeys.length; i++) {
    const { key, step, label, required } = ownKeys[i];
    if (src.indexOf('{{field:' + key + '}}') >= 0) continue;
    let sibKey = null;
    for (let j = i - 1; j >= 0; j--) { if (src.indexOf('{{field:' + ownKeys[j].key + '}}') >= 0) { sibKey = ownKeys[j].key; break; } }
    if (!sibKey) for (let j = i + 1; j < ownKeys.length; j++) { if (src.indexOf('{{field:' + ownKeys[j].key + '}}') >= 0) { sibKey = ownKeys[j].key; break; } }
    if (sibKey) { const cloned = cloneSiblingWrapper(src, sibKey, key, label, required); if (cloned) { src = cloned; continue; } }
    const block = '<div class="mf-custom-field">{{field:' + key + '}}</div>';
    let target = step;
    if (isWizard && target == null && sibKey) target = stepAt(src.indexOf('{{field:' + sibKey + '}}'));
    let next = (isWizard && target != null) ? insertFieldIntoStep(src, block, target) : null;
    if (next == null) next = insertIntoCardBody(src, block);
    src = next;
  }
  return src;
}

// ── REORDER (D1) — mirror of reorderFieldTokens ──
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
function splitTopLevel(inner) {
  const nodes = []; const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>|<!--[\s\S]*?-->/g;
  let depth = 0, start = 0, m;
  while ((m = tagRe.exec(inner)) !== null) {
    if (m[0].slice(0, 4) === '<!--') { if (depth === 0) { nodes.push(inner.slice(start, m.index + m[0].length)); start = m.index + m[0].length; } continue; }
    const isClose = m[0][1] === '/'; const selfClose = m[2] === '/' || VOID_TAGS.has(m[1].toLowerCase());
    if (isClose) { depth--; if (depth <= 0) { depth = 0; nodes.push(inner.slice(start, m.index + m[0].length)); start = m.index + m[0].length; } }
    else if (selfClose) { if (depth === 0) { nodes.push(inner.slice(start, m.index + m[0].length)); start = m.index + m[0].length; } }
    else depth++;
  }
  if (start < inner.length) nodes.push(inner.slice(start));
  return nodes.filter(n => n.length);
}
function reorderNode(node, idxOf) {
  const open = node.match(/^<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/);
  if (!open) return node;
  if (open[2] === '/' || VOID_TAGS.has(open[1].toLowerCase())) return node;
  const openEnd = open[0].length; const closeStart = node.lastIndexOf('</' + open[1] + '>');
  if (closeStart < openEnd) return node;
  const inner = node.slice(openEnd, closeStart);
  if (inner.indexOf('{{field:') === -1) return node;
  return node.slice(0, openEnd) + reorderContainer(inner, idxOf) + node.slice(closeStart);
}
function reorderContainer(inner, idxOf) {
  const nodes = splitTopLevel(inner).map(n => reorderNode(n, idxOf));
  if (nodes.length < 2) return nodes.join('');
  const meta = nodes.map(n => {
    const hasStep = /^<[a-z0-9]+[^>]*\bdata-step\s*=/i.test(n.replace(/^\s+/, ''));
    let min = Infinity; const tr = /\{\{field:([a-zA-Z0-9_\-]+)\}\}/g; let mm;
    while ((mm = tr.exec(n)) !== null) { if (idxOf.has(mm[1])) min = Math.min(min, idxOf.get(mm[1])); }
    return { movable: !hasStep && min !== Infinity, min };
  });
  const order = meta.map((x, i) => ({ i, min: x.min })).filter(x => meta[x.i].movable).sort((a, b) => a.min - b.min || a.i - b.i).map(x => x.i);
  if (!order.length) return nodes.join('');
  let k = 0;
  return nodes.map((n, i) => meta[i].movable ? nodes[order[k++]] : n).join('');
}
export function reorderFieldTokens(html, fields) {
  const src = String(html || ''); if (!src || src.indexOf('{{field:') === -1) return src;
  const order = [];
  (function walk(arr, parentRow) { for (const f of arr || []) { if (!f || !f.key) continue; if (f.type === 'Row' && Array.isArray(f.columns)) { order.push(String(f.key)); for (const c of f.columns) walk(c.fields || [], f); } else if (parentRow) {} else if (f.type === 'Hidden' || f.type === 'Section') {} else order.push(String(f.key)); } })(fields, null);
  const idxOf = new Map(order.map((k, i) => [k, i]));
  return splitTopLevel(src).map(n => reorderNode(n, idxOf)).join('');
}

// ── parseWizardStructure / fieldStepMap (mirror) ──
export function parseWizardStructure(html) {
  const src = String(html || '');
  if (!/\bdata-step\s*=/.test(src)) return { isWizard: false, steps: [] };
  const opens = []; const openRe = /<[a-z0-9]+[^>]*\bdata-step\s*=\s*["']?(\d+)["']?[^>]*>/gi; let m;
  while ((m = openRe.exec(src)) !== null) { opens.push({ idx: m.index, step: parseInt(m[1], 10) }); if (m.index === openRe.lastIndex) openRe.lastIndex++; }
  const bounds = opens.map(o => o.idx).concat([src.length]); const steps = [];
  for (let i = 0; i < opens.length; i++) {
    const seg = src.slice(opens[i].idx, bounds[i + 1]); const keys = [];
    const tr = /\{\{field:([a-zA-Z0-9_\-]+)\}\}/g; let tm; while ((tm = tr.exec(seg)) !== null) keys.push(tm[1]);
    if (!keys.length) continue;
    const eyebrow = ((seg.match(/class\s*=\s*["'][^"']*(?:eyebrow|kicker)[^"']*["'][^>]*>([^<]+)</i) || [])[1] || '').trim();
    const title = ((seg.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i) || [])[1] || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    steps.push({ step: opens[i].step, eyebrow, title, stepLabel: title || eyebrow, fieldKeys: keys });
  }
  return { isWizard: steps.length > 0, steps };
}
export function fieldStepMap(html) {
  const { isWizard, steps } = parseWizardStructure(html); const map = {};
  if (!isWizard) return map;
  steps.forEach((s, i) => { const label = s.stepLabel || s.title || s.eyebrow || ('Step ' + (i + 1)); for (const k of s.fieldKeys) map[k] = { ordinal: i + 1, label }; });
  return map;
}
