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
