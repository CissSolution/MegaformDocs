// Node mirror of @shared/custom-html-insert.{insertIntoCardBody,insertFieldIntoStep,
// syncFieldPlaceholders} — kept in lockstep so harness E2E reflects the product fix.
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
export function syncFieldPlaceholders(html, fields) {
  let src = String(html || ''); if (!src) return src;
  const ownKeys = [], subKeys = new Set(), validKeys = new Set();
  (function walk(arr, parentRow, parentStep) { for (const f of arr || []) { if (!f || !f.key) continue; const key = String(f.key); validKeys.add(key); const step = (f.step != null ? f.step : parentStep); const label = String(f.label || f.key || ''); const required = !!f.required; if (f.type === 'Row' && Array.isArray(f.columns)) { ownKeys.push({ key, step, label, required }); for (const c of f.columns) walk(c.fields || [], f, step); } else if (parentRow) subKeys.add(key); else if (f.type === 'Hidden' || f.type === 'Section') {} else ownKeys.push({ key, step, label, required }); } })(fields, null, null);
  const seen = new Set();
  src = src.replace(/\{\{field:([a-zA-Z0-9_\-]+)\}\}/g, (full, key) => { if (subKeys.has(key) || !validKeys.has(key)) return ''; if (seen.has(key)) return ''; seen.add(key); return full; });
  src = src.replace(/<div\s+class=["']mf-custom-field["']>\s*<\/div>/gi, '');
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
