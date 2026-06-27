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

  // Drop sub-field / orphan / duplicate tokens.
  const seen = new Set<string>();
  src = src.replace(/\{\{field:([a-zA-Z0-9_\-]+)\}\}/g, (full, key) => {
    if (subKeys.has(key) || !validKeys.has(key)) return '';
    if (seen.has(key)) return '';
    seen.add(key);
    return full;
  });
  // Remove wrappers we just emptied (so no blank field rows linger).
  src = src.replace(/<div\s+class=["']mf-custom-field["']>\s*<\/div>/gi, '');

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
