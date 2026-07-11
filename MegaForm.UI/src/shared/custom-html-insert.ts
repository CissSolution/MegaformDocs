// [v20260624-B266] Shared helper: insert an HTML block (a field-token wrapper) at the correct
// place INSIDE a custom-HTML shell's card body — before the submit/actions area — so auto-injected
// fields never land OUTSIDE the visible card (e.g. form 803 "Geolocation").
//
// Root cause it replaces: the old anchors matched the EXACT double-quoted strings
// `<div class="mfp-actions">` etc., but the shipped templates author their markup with SINGLE
// quotes (`<div class='mfp-actions'>`), so lastIndexOf() returned -1 and the code fell back to the
// document-FINAL `</div>` — which on a custom shell with trailing markup (or whose last </div>
// closes an outer container) lands the field OUTSIDE the .mfp card. This helper is:
//   - QUOTE-AGNOSTIC  (matches class="..." OR class='...')
//   - SHELL-AGNOSTIC  (any *actions* container: mfp-actions / ey-actions / mf-form-actions /
//                      mf-custom-actions, or the submit control itself, or the {{form:submit}} token)
// Used by: builder/html-sync.ts, dashboard/ai-form-creator.ts (repairCustomHtmlPlaceholders),
// ai-form-assistant/ops.ts (opReplaceFormSchema PRESERVE-SYNC).
//
// `block` is the caller's pre-formatted HTML (e.g. `<div class="mf-custom-field">{{field:k}}</div>`
// or bare `{{field:k}}` tokens). It is inserted BEFORE the first matching anchor (searched bottom-up).

export function insertIntoCardBody(html: string, block: string): string {
  const src = String(html || '');
  if (!src) return src + block;

  // 1) Before any actions container: <div ... class="...actions...">  (mfp-actions / ey-actions /
  //    mf-form-actions / mf-custom-actions). Whole actions row stays below the inserted field.
  const actionsIdx = lastMatchIndex(src, /<div[^>]*\bclass\s*=\s*["'][^"']*\bactions\b[^"']*["'][^>]*>/gi);
  if (actionsIdx >= 0) return src.slice(0, actionsIdx) + block + src.slice(actionsIdx);

  // 2) Before the last submit control (button/input type=submit) — always inside the card body.
  const submitIdx = lastMatchIndex(src, /<(?:button|input)[^>]*\btype\s*=\s*["']submit["'][^>]*>/gi);
  if (submitIdx >= 0) return src.slice(0, submitIdx) + block + src.slice(submitIdx);

  // 3) Before the element that carries the {{form:submit}} token (back up to its opening tag).
  const tokIdx = src.lastIndexOf('{{form:submit}}');
  if (tokIdx >= 0) {
    const elStart = src.lastIndexOf('<', tokIdx);
    const pos = elStart >= 0 ? elStart : tokIdx;
    return src.slice(0, pos) + block + src.slice(pos);
  }

  // 4) Last resort: before the final </div> (legacy behaviour — may be outside the card on exotic
  //    shells with no actions/submit). Warn so it is visible in dev.
  const closeIdx = src.lastIndexOf('</div>');
  if (closeIdx >= 0) {
    try { if (typeof console !== 'undefined' && console.warn) console.warn('[MegaForm B266] insertIntoCardBody: no actions/submit/{{form:submit}} anchor; inserted before final </div> (may be outside card).'); } catch (e) { /* ignore */ }
    return src.slice(0, closeIdx) + block + src.slice(closeIdx);
  }

  return src + block;
}

// [2026-06-27] Insert a field block INTO the data-step=N CONTENT panel (before that
// panel's closing tag), not before the shared actions row at the very end. Premium
// wizards carry TWO sets of data-step attributes — the stepper nav items (no field
// tokens) AND the content panels (`<section class='au-page' data-step='N'>…fields…`).
// We target the panel that actually holds field tokens (or, for an empty step, the
// LAST data-step=N opener, since panels follow the nav). Returns null when no such
// step exists so the caller can fall back to insertIntoCardBody.
export function insertFieldIntoStep(html: string, block: string, step: number | string): string | null {
  const src = String(html || '');
  const stepEsc = String(step).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openRe = new RegExp('<([a-z0-9]+)[^>]*\\bdata-step\\s*=\\s*["\']?' + stepEsc + '["\']?[^>]*>', 'gi');
  const opens: Array<{ idx: number; tag: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(src)) !== null) {
    opens.push({ idx: m.index, tag: m[1].toLowerCase() });
    if (m.index === openRe.lastIndex) openRe.lastIndex++;
  }
  if (!opens.length) return null;
  // Boundaries between ALL step blocks (any step number) so we can scope a panel.
  const anyRe = /<[a-z0-9]+[^>]*\bdata-step\s*=\s*["']?\d+["']?[^>]*>/gi;
  const allIdx: number[] = [];
  while ((m = anyRe.exec(src)) !== null) { allIdx.push(m.index); if (m.index === anyRe.lastIndex) anyRe.lastIndex++; }
  const endOf = (start: number): number => { for (const i of allIdx) if (i > start) return i; return src.length; };
  let panel = opens.find(o => /\{\{field:/.test(src.slice(o.idx, endOf(o.idx)))) || opens[opens.length - 1];
  const segStart = panel.idx;
  const segEnd = endOf(panel.idx);
  const seg = src.slice(segStart, segEnd);
  let closePos = seg.lastIndexOf('</' + panel.tag + '>');
  if (closePos < 0) closePos = Math.max(seg.lastIndexOf('</section>'), seg.lastIndexOf('</div>'));
  if (closePos < 0) return src.slice(0, segEnd) + block + src.slice(segEnd);
  const at = segStart + closePos;
  return src.slice(0, at) + block + src.slice(at);
}

// [2026-06-27] Structure-aware placeholder sync — the single source of truth for
// keeping a custom-HTML shell's {{field:KEY}} tokens consistent with the schema after
// ANY edit (AI add/remove, manual delete, rebrand). Fixes the wizard-breakage where:
//   • Row SUB-fields (first_name/last_name) got their OWN top-level token and rendered
//     twice (once via the parent Row's {{field:rowKey}}, once crammed at the end);
//   • newly-added fields were appended before the LAST shared actions row → dumped
//     outside their step panel, collapsing the 4-step wizard into one cramped page.
// Rules: a field renders via its parent Row → NO own token; Hidden/Section → no token;
// drop orphan tokens (no matching field) + duplicates (keep first); insert a missing
// field's token INTO its assigned data-step panel (wizard) else the card body.
export function syncFieldPlaceholders(html: string, fields: any[]): string {
  let src = String(html || '');
  if (!src) return src;
  const ownKeys: Array<{ key: string; step: any; label: string; required: boolean }> = [];
  const subKeys = new Set<string>();
  const validKeys = new Set<string>();
  let hasNameRow = false;
  (function walk(arr: any[], parentRow: any, parentStep: any) {
    for (const f of arr || []) {
      if (!f || !f.key) continue;
      const key = String(f.key);
      validKeys.add(key);
      const step = (f.step != null ? f.step : parentStep);
      const label = String(f.label || f.key || '');
      const required = !!f.required;
      if (f.type === 'Row' && Array.isArray(f.columns)) {
        ownKeys.push({ key, step, label, required });
        hasNameRow = true;                                  // au-template summary alias 'name' → a Row
        for (const c of f.columns) walk(c.fields || [], f, step);
      } else if (parentRow) {
        subKeys.add(key);                                   // rendered via the parent Row
      } else if (f.type === 'Hidden' || f.type === 'Section') {
        /* no token */
      } else {
        ownKeys.push({ key, step, label, required });
      }
    }
  })(fields, null, null);

  // ── REMOVE orphan / sub-field / duplicate field WRAPPERS (not just the token) ──
  // A field deleted from the schema must take its whole <label class='au-field'>…icon…
  // Phone…</label> wrapper (the label text is HARD-CODED in the shell) AND its review-step
  // summary row with it — otherwise a label with no input lingers and the review lists a
  // stale field. We walk every token right-to-left so removals never invalidate offsets.
  src = removeBadWrappers(src, validKeys, subKeys);
  // ── REMOVE token-less field labels (legacy damage: an earlier sync blanked the token but
  //    left the <label class='au-field'>…</label> behind). Only an au-field label with NO
  //    token AND NO form control is an orphan — a valid label always carries its token. ──
  src = src.replace(/<label\b[^>]*>(?:(?!<\/label>)[\s\S])*?<\/label>/gi, (blk) =>
    (/\bau-field\b/.test(blk) && !/\{\{field:/.test(blk) && !/<(?:input|select|textarea)\b/i.test(blk)) ? '' : blk);
  // ── REMOVE now-empty wrappers/containers so no blank rows linger. ──
  src = src.replace(/<div\s+class=["']mf-custom-field["']>\s*<\/div>/gi, '');
  src = src.replace(/<div\b[^>]*\bau-(?:namerow|grid)[\w-]*\b[^>]*>\s*<\/div>/gi, '');
  // ── REMOVE orphan review-step summary rows (data-au-summary='KEY' with no backing field).
  //    'name' is the au-template alias for the first_name+last_name Row, so it is valid when a
  //    Row exists. updateSummary() no-ops on absent nodes, so removing rows is always safe. ──
  src = removeOrphanSummaries(src, validKeys, subKeys, hasNameRow);

  // Insert missing own-key tokens into their step panel (wizard) or the card body.
  const isWizard = /\bdata-step\s*=/.test(src);
  // Step number of the data-step block containing position `pos` (last opener before it;
  // panels follow the stepper nav so this resolves to the content panel's step).
  const stepAt = (pos: number): number | null => {
    const r = /<[a-z0-9]+[^>]*\bdata-step\s*=\s*["']?(\d+)["']?[^>]*>/gi;
    let mm: RegExpExecArray | null; let s: number | null = null;
    while ((mm = r.exec(src)) !== null) { if (mm.index <= pos) s = parseInt(mm[1], 10); else break; }
    return s;
  };
  for (let i = 0; i < ownKeys.length; i++) {
    const { key, step, label, required } = ownKeys[i];
    if (src.indexOf('{{field:' + key + '}}') >= 0) continue;
    // Find the nearest PRECEDING sibling already placed in the shell (defines both the
    // target step AND the wrapper markup to clone, so the new field gets the template's
    // label/icon styling instead of a bare unlabelled input).
    let sibKey: string | null = null;
    for (let j = i - 1; j >= 0; j--) { if (src.indexOf('{{field:' + ownKeys[j].key + '}}') >= 0) { sibKey = ownKeys[j].key; break; } }
    if (!sibKey) for (let j = i + 1; j < ownKeys.length; j++) { if (src.indexOf('{{field:' + ownKeys[j].key + '}}') >= 0) { sibKey = ownKeys[j].key; break; } }

    // 1) Clone the sibling's field wrapper (label + token) right after it.
    if (sibKey) {
      const cloned = cloneSiblingWrapper(src, sibKey, key, label, required);
      if (cloned) { src = cloned; continue; }
    }
    // 2) Fallback: bare token into the sibling's step panel (wizard) or the card body.
    const block = '<div class="mf-custom-field">{{field:' + key + '}}</div>';
    let target: number | string | null = step;
    if (isWizard && target == null && sibKey) target = stepAt(src.indexOf('{{field:' + sibKey + '}}'));
    let next: string | null = (isWizard && target != null) ? insertFieldIntoStep(src, block, target) : null;
    if (next == null) next = insertIntoCardBody(src, block);
    src = next;
  }
  return src;
}

function htmlAttr(openTag: string, name: string): string {
  const rx = new RegExp("\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\s*=\\s*([\"'])(.*?)\\1", 'i');
  const m = String(openTag || '').match(rx);
  return m ? m[2] : '';
}

interface ElementRange { tag: string; start: number; openEnd: number; closeStart: number; end: number; open: string; html: string; }

function collectElementRanges(src: string): ElementRange[] {
  const ranges: ElementRange[] = [];
  const stack: Array<{ tag: string; start: number; openEnd: number; open: string }> = [];
  const tagRe = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9:-]*)\b[^>]*?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(src)) !== null) {
    const raw = m[0];
    if (raw.slice(0, 4) === '<!--') continue;
    const tag = (m[1] || '').toLowerCase();
    if (!tag) continue;
    const isClose = raw[1] === '/';
    const selfClose = /\/\s*>$/.test(raw) || VOID_TAGS.has(tag);
    if (!isClose && !selfClose) {
      stack.push({ tag, start: m.index, openEnd: m.index + raw.length, open: raw });
      continue;
    }
    if (!isClose) continue;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].tag !== tag) continue;
      const opened = stack.splice(i, 1)[0];
      ranges.push({
        tag,
        start: opened.start,
        openEnd: opened.openEnd,
        closeStart: m.index,
        end: m.index + raw.length,
        open: opened.open,
        html: src.slice(opened.start, m.index + raw.length),
      });
      break;
    }
  }
  return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}

function inputNamePositions(src: string, key: string): number[] {
  const escKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp("<(?:input|select|textarea)\\b[^>]*\\bname\\s*=\\s*([\"']?)" + escKey + "(?:\\[\\])?\\1[^>]*>", 'gi');
  const positions: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    positions.push(m.index);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return positions;
}

function countInputName(src: string, key: string): number {
  return inputNamePositions(src, key).length;
}

function chooseHardcodedControlRange(src: string, key: string): ElementRange | null {
  const positions = inputNamePositions(src, key);
  if (!positions.length) return null;
  const first = positions[0];
  const last = positions[positions.length - 1];
  const token = '{{field:' + key + '}}';
  const candidates = collectElementRanges(src).filter(r => {
    if (r.start > first || r.end < last) return false;
    if (r.html.indexOf(token) >= 0) return false;
    return countInputName(r.html, key) === positions.length;
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const score = (r: ElementRange): number => {
      const cls = htmlAttr(r.open, 'class');
      let s = r.end - r.start;
      if (/\b(?:field|chips|cards|programme|programmes|accom|grant|choice|choices|option|options|toggle)\b/i.test(cls)) s -= 2000;
      if (/\b(?:page|step|stepper|shell|panel|body|card|mfp)\b/i.test(cls)) s += 5000;
      if (r.tag === 'label') s -= 250;
      return s;
    };
    return score(a) - score(b);
  });
  return candidates[0] || null;
}

function ownRenderableFieldKeys(fields: any[]): string[] {
  const out: string[] = [];
  (function walk(arr: any[], parentRow: any) {
    for (const f of arr || []) {
      if (!f || !f.key) continue;
      if (f.type === 'Row' && Array.isArray(f.columns)) {
        out.push(String(f.key));
        for (const c of f.columns) walk(c.fields || [], f);
      } else if (parentRow) {
        /* rendered through parent Row */
      } else if (f.type === 'Hidden' || f.type === 'Section') {
        /* no customHtml token */
      } else {
        out.push(String(f.key));
      }
    }
  })(fields || [], null);
  return out;
}

export function replaceHardcodedControlsWithFieldTokens(html: string, fields: any[]): string {
  let src = String(html || '');
  if (!src || !Array.isArray(fields) || !fields.length) return src;
  ownRenderableFieldKeys(fields).forEach(key => {
    let guard = 0;
    while (guard++ < 20) {
      const range = chooseHardcodedControlRange(src, key);
      if (!range) break;
      const block = '<div class="mf-custom-field">{{field:' + key + '}}</div>';
      src = src.slice(0, range.start) + block + src.slice(range.end);
    }
  });
  return src;
}

// Locate the field WRAPPER element that holds {{field:KEY}} — the nearest enclosing
// <label> (premium templates bake the label text + icon inside it) or, failing that,
// the nearest <div>. Returns the wrapper's [start,end) span + its HTML.
function fieldWrapperRange(html: string, key: string): { start: number; end: number; html: string } | null {
  const tok = '{{field:' + key + '}}';
  const p = html.indexOf(tok);
  if (p < 0) return null;
  const lo = html.lastIndexOf('<label', p);
  const lc = html.indexOf('</label>', p);
  if (lo >= 0 && lc > p && html.indexOf('{{field:', lo) === p) {
    return { start: lo, end: lc + 8, html: html.slice(lo, lc + 8) };
  }
  const do2 = html.lastIndexOf('<div', p);
  const dc = html.indexOf('</div>', p);
  if (do2 >= 0 && dc > p && html.indexOf('{{field:', do2) === p) {
    return { start: do2, end: dc + 6, html: html.slice(do2, dc + 6) };
  }
  return null;
}

// Clone the sibling's wrapper for a NEW field: swap the token, replace the label text
// (the longest visible text node) with the new field's label, and drop the required (*)
// marker when the new field is optional. Returns the updated html, or null when the
// sibling has no clonable wrapper (caller falls back to a bare token).
function cloneSiblingWrapper(html: string, sibKey: string, newKey: string, newLabel: string, required: boolean): string | null {
  const w = fieldWrapperRange(html, sibKey);
  if (!w) return null;
  let clone = w.html.split('{{field:' + sibKey + '}}').join('{{field:' + newKey + '}}');
  const texts = Array.from(clone.matchAll(/>([^<>{}]+)</g))
    .map(m => m[1]).filter(t => t.replace(/\s+/g, ' ').trim().length > 1);
  if (texts.length) {
    const longest = texts.sort((a, b) => b.trim().length - a.trim().length)[0];
    const safe = String(newLabel || newKey).replace(/[<>&]/g, c => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
    clone = clone.replace('>' + longest + '<', '>' + safe + ' <');
  }
  if (!required) clone = clone.replace(/<b[^>]*\bau-req\b[^>]*>[\s\S]*?<\/b>/i, '').replace(/\s\*\s*(?=<\/)/, '');
  return html.slice(0, w.end) + clone + html.slice(w.end);
}

// Wrapper span enclosing the {{field:…}} token that STARTS at position `p` — the nearest
// <label> (premium templates bake the label text + icon inside it) else the nearest <div>,
// but only when THIS token is the wrapper's first token (so a 2-field grid label keeps each
// field's own <label>). Falls back to the bare token span. Position-based so it works on
// duplicates where a key-based lookup would always hit the first occurrence.
function wrapperRangeAt(html: string, p: number, tokLen: number): { start: number; end: number } {
  const lo = html.lastIndexOf('<label', p);
  const lc = html.indexOf('</label>', p);
  if (lo >= 0 && lc > p && html.indexOf('{{field:', lo) === p) return { start: lo, end: lc + 8 };
  const d = html.lastIndexOf('<div', p);
  const dc = html.indexOf('</div>', p);
  if (d >= 0 && dc > p && html.indexOf('{{field:', d) === p) return { start: d, end: dc + 6 };
  return { start: p, end: p + tokLen };
}

// Remove the WHOLE wrapper of every token that is a Row sub-field (rendered via the parent
// Row), an orphan (no schema field) or a duplicate (keep the first). Right-to-left so each
// splice keeps earlier offsets valid.
function removeBadWrappers(src: string, validKeys: Set<string>, subKeys: Set<string>): string {
  const toks: Array<{ key: string; pos: number; len: number }> = [];
  const re = /\{\{field:([a-zA-Z0-9_\-]+)\}\}/g; let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) { toks.push({ key: m[1], pos: m.index, len: m[0].length }); if (m.index === re.lastIndex) re.lastIndex++; }
  const seen = new Set<string>();
  const bad: Array<{ pos: number; len: number }> = [];
  for (const t of toks) {
    const dup = validKeys.has(t.key) && !subKeys.has(t.key) && seen.has(t.key);
    const isBad = subKeys.has(t.key) || !validKeys.has(t.key) || dup;
    if (isBad) bad.push(t);
    else seen.add(t.key);
  }
  for (let i = bad.length - 1; i >= 0; i--) {
    const r = wrapperRangeAt(src, bad[i].pos, bad[i].len);
    src = src.slice(0, r.start) + src.slice(r.end);
  }
  return src;
}

// Remove every review-step summary row (`<div>…<strong data-au-summary='KEY'>…</strong></div>`)
// whose KEY has no backing field. 'name' is valid when a Row exists (the au-template alias for
// first_name+last_name). Bounded so the match never escapes its own <div>.
function removeOrphanSummaries(src: string, validKeys: Set<string>, subKeys: Set<string>, hasNameRow: boolean): string {
  const keys = new Set<string>();
  const re = /data-au-summary\s*=\s*["']([a-zA-Z0-9_\-]+)["']/gi; let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) keys.add(m[1]);
  for (const k of keys) {
    const valid = validKeys.has(k) || subKeys.has(k) || (k === 'name' && (hasNameRow || subKeys.has('first_name') || subKeys.has('last_name')));
    if (valid) continue;
    const rowRe = new RegExp("<div\\b[^>]*>(?:(?!</div>)[\\s\\S])*?data-au-summary\\s*=\\s*[\"']" + k + "[\"'](?:(?!</div>)[\\s\\S])*?</div>", 'gi');
    src = src.replace(rowRe, '');
  }
  return src;
}

// ─────────────────────────────────────────────────────────────────────────────
// [2026-06-28] REORDER (D1): make builder drag-reorder of fields take effect at
// RENDER time for custom-shell forms, where LAYOUT order = customHtml token order
// (NOT schema.fields order). Moves each field WRAPPER so the token sequence inside
// every step panel matches the schema order — keeping the hard-coded label/icon
// markup with its token. Crucially this NEVER reorders the step panels themselves
// (any element carrying data-step is a fixed anchor) — whole-step reorder is D2's
// job (moveStepPanel). Call ONLY on an explicit reorder; it must NOT run on AI
// rebrand/keep-style (which must preserve the shell byte-for-byte).
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// Split an element's inner HTML into its depth-0 child nodes (elements + text), preserving
// every byte (join === input). Balanced, well-formed markup only (our shells are).
function splitTopLevel(inner: string): string[] {
  const nodes: string[] = [];
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>|<!--[\s\S]*?-->/g;
  let depth = 0, start = 0, m: RegExpExecArray | null;
  while ((m = tagRe.exec(inner)) !== null) {
    if (m[0].slice(0, 4) === '<!--') { if (depth === 0) { nodes.push(inner.slice(start, m.index + m[0].length)); start = m.index + m[0].length; } continue; }
    const isClose = m[0][1] === '/';
    const selfClose = m[2] === '/' || VOID_TAGS.has(m[1].toLowerCase());
    if (isClose) { depth--; if (depth <= 0) { depth = 0; nodes.push(inner.slice(start, m.index + m[0].length)); start = m.index + m[0].length; } }
    else if (selfClose) { if (depth === 0) { nodes.push(inner.slice(start, m.index + m[0].length)); start = m.index + m[0].length; } }
    else depth++;
  }
  if (start < inner.length) nodes.push(inner.slice(start));
  return nodes.filter(n => n.length);
}

// Recurse into a single top-level node, reordering its children, then return it reassembled.
function reorderNode(node: string, idxOf: Map<string, number>): string {
  const open = node.match(/^<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/);
  if (!open) return node;                                           // text node
  if (open[2] === '/' || VOID_TAGS.has(open[1].toLowerCase())) return node;
  const openEnd = open[0].length;
  const closeStart = node.lastIndexOf('</' + open[1] + '>');
  if (closeStart < openEnd) return node;
  const inner = node.slice(openEnd, closeStart);
  if (inner.indexOf('{{field:') === -1) return node;               // nothing to reorder below
  return node.slice(0, openEnd) + reorderContainer(inner, idxOf) + node.slice(closeStart);
}

// Reorder the token-bearing children of one container to ascending schema index. Children
// with no token (headers, review block, actions) stay anchored at their slots; a child
// carrying data-step (a step panel or stepper item) is FIXED — D1 never moves whole steps.
function reorderContainer(inner: string, idxOf: Map<string, number>): string {
  const nodes = splitTopLevel(inner).map(n => reorderNode(n, idxOf));
  if (nodes.length < 2) return nodes.join('');
  const meta = nodes.map(n => {
    const trimmed = n.replace(/^\s+/, '');
    const hasStep = /^<[a-z0-9]+[^>]*\bdata-step\s*=/i.test(trimmed);
    let min = Infinity;
    const tr = /\{\{field:([a-zA-Z0-9_\-]+)\}\}/g; let mm: RegExpExecArray | null;
    while ((mm = tr.exec(n)) !== null) { if (idxOf.has(mm[1])) min = Math.min(min, idxOf.get(mm[1]) as number); }
    return { movable: !hasStep && min !== Infinity, min };
  });
  const order = meta.map((x, i) => ({ i, min: x.min })).filter(x => meta[x.i].movable)
    .sort((a, b) => a.min - b.min || a.i - b.i).map(x => x.i);
  if (!order.length) return nodes.join('');
  let k = 0;
  return nodes.map((n, i) => meta[i].movable ? nodes[order[k++]] : n).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// [2026-06-27 #2 Steps-in-builder] Parse a custom-shell wizard's step structure from
// customHtml so the builder can SHOW which fields live in which step (and, later, let
// the user assign fields to steps / add / remove / reorder). Step membership for a
// custom-shell form lives ONLY in customHtml (the data-step CONTENT panels), invisible
// to the schema-driven canvas — this bridges that gap.
//
// PREFIX-AGNOSTIC — surveyed across all premium families (australia/bulgaria/euro-youth/
// festa). The ONE common, reliable structure is: content panels are `<… data-step='N'>`
// blocks that contain {{field:}} tokens, each headed by an <h1-3> title. Class prefixes
// differ (au-/bg-/ey-/fi-) and stepper-nav labels are NOT reliably keyed by data-step
// (bulgaria's nav has no data-step at all), so we DON'T rely on them — the panel <h2>
// title (e.g. "What brings you to Bulgaria?") is the step label. Forms with no data-step
// (e.g. intake — a single page with decorative step dots, no wizard script) → not a wizard.
export interface WizardStep { step: number; eyebrow: string; title: string; stepLabel: string; fieldKeys: string[]; }
export function parseWizardStructure(html: string): { isWizard: boolean; steps: WizardStep[] } {
  const src = String(html || '');
  if (!/\bdata-step\s*=/.test(src)) return { isWizard: false, steps: [] };

  const opens: Array<{ idx: number; step: number }> = [];
  const openRe = /<[a-z0-9]+[^>]*\bdata-step\s*=\s*["']?(\d+)["']?[^>]*>/gi; let m: RegExpExecArray | null;
  while ((m = openRe.exec(src)) !== null) { opens.push({ idx: m.index, step: parseInt(m[1], 10) }); if (m.index === openRe.lastIndex) openRe.lastIndex++; }
  const bounds = opens.map(o => o.idx).concat([src.length]);
  const steps: WizardStep[] = [];
  for (let i = 0; i < opens.length; i++) {
    const seg = src.slice(opens[i].idx, bounds[i + 1]);
    const keys: string[] = [];
    const tr = /\{\{field:([a-zA-Z0-9_\-]+)\}\}/g; let tm: RegExpExecArray | null;
    while ((tm = tr.exec(seg)) !== null) keys.push(tm[1]);
    if (!keys.length) continue;                                    // skip stepper-nav items (no tokens)
    const eyebrow = ((seg.match(/class\s*=\s*["'][^"']*(?:eyebrow|kicker)[^"']*["'][^>]*>([^<]+)</i) || [])[1] || '').trim();
    const title = ((seg.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i) || [])[1] || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    steps.push({ step: opens[i].step, eyebrow, title, stepLabel: title || eyebrow, fieldKeys: keys });
  }
  return { isWizard: steps.length > 0, steps };
}

// Convenience: fieldKey → 1-based step ordinal (the order content panels appear), for
// the builder canvas to badge each field card with its step.
export function fieldStepMap(html: string): Record<string, { ordinal: number; label: string }> {
  const { isWizard, steps } = parseWizardStructure(html);
  const map: Record<string, { ordinal: number; label: string }> = {};
  if (!isWizard) return map;
  steps.forEach((s, i) => {
    const label = s.stepLabel || s.title || s.eyebrow || ('Step ' + (i + 1));
    for (const k of s.fieldKeys) map[k] = { ordinal: i + 1, label };
  });
  return map;
}

function fieldTypeOf(f: any): string {
  return String(f?.type ?? f?.Type ?? '');
}

function fieldKeyOf(f: any): string {
  return String(f?.key ?? f?.Key ?? '').trim();
}

function fieldPropsOf(f: any): any {
  return (f && (f.properties || f.Properties)) || {};
}

function schemaPageGroups(fields: any[]): Array<{ label: string; keys: string[] }> {
  const pages: Array<{ label: string; keys: string[] }> = [{ label: '', keys: [] }];
  const pushKey = (key: string) => { if (key) pages[pages.length - 1].keys.push(key); };
  (fields || []).forEach(f => {
    const type = fieldTypeOf(f);
    const props = fieldPropsOf(f);
    if (type === 'Section') {
      if (props.pageBreak || props.PageBreak) {
        if (pages[pages.length - 1].keys.length || pages[pages.length - 1].label) pages.push({ label: '', keys: [] });
      }
      const label = String(f.label ?? f.Label ?? '');
      if (label && !pages[pages.length - 1].label) pages[pages.length - 1].label = label;
      return;
    }
    if (type === 'Hidden') return;
    if (type === 'Row' && Array.isArray(f.columns || f.Columns)) {
      pushKey(fieldKeyOf(f));
      return;
    }
    pushKey(fieldKeyOf(f));
  });
  return pages.filter(p => p.label || p.keys.length);
}

function wizardPanels(src: string): ElementRange[] {
  return collectElementRanges(src).filter(r => {
    if (!/\bdata-step\s*=/.test(r.open)) return false;
    const cls = htmlAttr(r.open, 'class');
    const looksLikePage = /\b(?:au|bg|ey|fi)-page\b|\bpage\b|data-mf-native-page/i.test(r.open);
    const looksLikeStepper = /\b(?:au|bg|ey|fi)-step\b|\bstepper\b|\bstep\b/i.test(cls) && !/\bpage\b/i.test(cls);
    if (looksLikeStepper && !looksLikePage) return false;
    return looksLikePage || /\{\{field:/.test(r.html) || /<h[1-3]\b/i.test(r.html);
  }).sort((a, b) => a.start - b.start);
}

function stripFieldWrappers(block: string): string {
  let out = String(block || '');
  const toks: Array<{ pos: number; len: number }> = [];
  const re = /\{\{field:([a-zA-Z0-9_\-]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(out)) !== null) {
    toks.push({ pos: m.index, len: m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  for (let i = toks.length - 1; i >= 0; i--) {
    const r = wrapperRangeAt(out, toks[i].pos, toks[i].len);
    out = out.slice(0, r.start) + out.slice(r.end);
  }
  return cleanupEmptyFieldShells(out);
}

function cleanupEmptyFieldShells(src: string): string {
  return String(src || '')
    .replace(/<div\s+class=["']mf-custom-field["']>\s*<\/div>/gi, '')
    .replace(/<div\b[^>]*\b(?:au|bg|ey|fi)-(?:grid|stack|chips|cards|programmes|accom|consent|toggles?)\b[^>]*>\s*<\/div>/gi, '')
    .replace(/<label\b[^>]*>\s*<\/label>/gi, '');
}

function insertPointForPanel(src: string, panel: ElementRange): number {
  const inner = src.slice(panel.openEnd, panel.closeStart);
  const actions = inner.search(/<[^>]+\bclass\s*=\s*["'][^"']*(?:actions|submit)[^"']*["'][^>]*>/i);
  if (actions >= 0) return panel.openEnd + actions;
  return panel.closeStart;
}

function updatePanelStepAndTitle(panelHtml: string, index: number, label: string): string {
  let out = String(panelHtml || '');
  out = out.replace(/\bdata-step\s*=\s*(["']?)\d+\1/i, "data-step='" + index + "'");
  out = out.replace(/\bis-active\b/g, '').replace(/\s{2,}/g, ' ');
  if (label) {
    const safe = label.replace(/[<>&]/g, c => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
    if (/<h[1-3]\b/i.test(out)) out = out.replace(/(<h[1-3][^>]*>)[\s\S]*?(<\/h[1-3]>)/i, '$1' + safe + '$2');
    out = out.replace(/(Step\s*)\d+/i, '$1' + String(index + 1).padStart(2, '0'));
  }
  return out;
}

function ensureWizardPanelCount(src: string, pages: Array<{ label: string; keys: string[] }>): string {
  let out = src;
  let panels = wizardPanels(out);
  while (panels.length < pages.length && panels.length > 0) {
    const source = panels[panels.length - 1];
    let clone = stripFieldWrappers(source.html);
    clone = updatePanelStepAndTitle(clone, panels.length, pages[panels.length]?.label || ('Step ' + (panels.length + 1)));
    out = out.slice(0, source.end) + clone + out.slice(source.end);
    panels = wizardPanels(out);
  }
  while (panels.length > pages.length && panels.length > 0) {
    const extra = panels[panels.length - 1];
    out = out.slice(0, extra.start) + out.slice(extra.end);
    panels = wizardPanels(out);
  }
  return out;
}

export function reflowWizardFieldTokensBySchemaPages(html: string, fields: any[]): string {
  let src = String(html || '');
  if (!src || !/\bdata-step\s*=/.test(src)) return src;
  const pages = schemaPageGroups(fields);
  if (pages.length <= 1) return src;

  src = ensureWizardPanelCount(src, pages);
  const desiredKeys = pages.flatMap(p => p.keys);
  const wrappers = new Map<string, string>();
  const removals: Array<{ start: number; end: number }> = [];
  desiredKeys.forEach(key => {
    if (!key || wrappers.has(key)) return;
    const r = fieldWrapperRange(src, key);
    if (!r) return;
    wrappers.set(key, r.html);
    removals.push({ start: r.start, end: r.end });
  });
  if (!wrappers.size) return src;

  removals.sort((a, b) => b.start - a.start).forEach(r => { src = src.slice(0, r.start) + src.slice(r.end); });
  src = cleanupEmptyFieldShells(src);

  const panels = wizardPanels(src);
  if (panels.length < pages.length) return src;
  const inserts: Array<{ pos: number; html: string }> = [];
  pages.forEach((page, index) => {
    const panel = panels[index];
    if (!panel) return;
    const block = page.keys.map(key => wrappers.get(key) || '<div class="mf-custom-field">{{field:' + key + '}}</div>').join('\n');
    if (block.trim()) inserts.push({ pos: insertPointForPanel(src, panel), html: block + '\n' });
  });
  inserts.sort((a, b) => b.pos - a.pos).forEach(ins => { src = src.slice(0, ins.pos) + ins.html + src.slice(ins.pos); });
  return src;
}

// Public entry: reorder field tokens across the whole shell to match schema order.
export function reorderFieldTokens(html: string, fields: any[]): string {
  const src = String(html || '');
  if (!src || src.indexOf('{{field:') === -1) return src;
  const order: string[] = [];
  (function walk(arr: any[], parentRow: any) {
    for (const f of arr || []) {
      if (!f || !f.key) continue;
      if (f.type === 'Row' && Array.isArray(f.columns)) { order.push(String(f.key)); for (const c of f.columns) walk(c.fields || [], f); }
      else if (parentRow) { /* sub-field */ }
      else if (f.type === 'Hidden' || f.type === 'Section') { /* no token */ }
      else order.push(String(f.key));
    }
  })(fields, null);
  const idxOf = new Map(order.map((k, i) => [k, i] as [string, number]));
  // Treat the whole document as one container's children and recurse.
  return splitTopLevel(src).map(n => reorderNode(n, idxOf)).join('');
}

function lastMatchIndex(s: string, rx: RegExp): number {
  let m: RegExpExecArray | null;
  let last = -1;
  rx.lastIndex = 0;
  while ((m = rx.exec(s)) !== null) {
    last = m.index;
    if (m.index === rx.lastIndex) rx.lastIndex++; // guard against zero-width matches
  }
  return last;
}
