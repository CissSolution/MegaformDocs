// ============================================================
// Input Mask — lightweight caret-aware auto-format
// ============================================================
// [Composite v1.4 2026-06-15] Shared mask engine for Composite parts (SSN, EIN,
// dates, cards, …). A part declares `mask` (e.g. '###-##-####') and the renderer
// stamps it as `data-mf-mask`; bindMasks() then formats-as-you-type with caret
// preservation. Mask grammar:
//   #  = a digit          [0-9]
//   A  = a letter         [A-Za-z]
//   *  = alphanumeric     [0-9A-Za-z]
//   anything else        = a literal that is auto-inserted (e.g. - / space)
// The stored value IS the masked string (what bindComposites combines), so the
// completeness check in validation.ts compares value length to mask length.

function maskClass(mc: string): RegExp | null {
  if (mc === '#') return /[0-9]/;
  if (mc === 'A') return /[A-Za-z]/;
  if (mc === '*') return /[0-9A-Za-z]/;
  return null; // literal
}

const ALNUM = /[0-9A-Za-z]/;

/** Format `raw` against `mask`, dropping invalid chars and inserting literals.
 *  Trailing literals are trimmed so Backspace never gets stuck on a separator. */
export function formatWithMask(raw: string, mask: string): string {
  const r = String(raw || '');
  const m = String(mask || '');
  if (!m) return r;
  let out = '';
  let ri = 0;
  for (let mi = 0; mi < m.length; mi++) {
    if (ri >= r.length) break;
    const cls = maskClass(m[mi]);
    if (cls) {
      let placed = false;
      while (ri < r.length) {
        const ch = r[ri++];
        if (cls.test(ch)) { out += ch; placed = true; break; }
      }
      if (!placed) break; // ran out of valid input for this slot
    } else {
      out += m[mi]; // literal
    }
  }
  // strip trailing literal separators (non-alphanumeric) → clean backspace
  let end = out.length;
  while (end > 0 && !ALNUM.test(out[end - 1])) end--;
  return out.slice(0, end);
}

/** Wire every un-bound [data-mf-mask] input within `scope`. Idempotent.
 *  Must run BEFORE bindComposites so the combined value reads the masked text. */
export function bindMasks(scope?: Document | HTMLElement): void {
  const root: Document | HTMLElement = scope || document;
  const nodes = root.querySelectorAll<HTMLInputElement>('input[data-mf-mask]:not([data-mask-bound])');
  nodes.forEach((input) => {
    const mask = input.getAttribute('data-mf-mask') || '';
    if (!mask) return;
    input.setAttribute('data-mask-bound', '1');
    // Format any prefilled value once.
    if (input.value) input.value = formatWithMask(input.value, mask);

    input.addEventListener('input', () => {
      const before = input.value;
      let caret: number | null = null;
      try { caret = input.selectionStart; } catch { caret = null; }
      const formatted = formatWithMask(before, mask);
      if (formatted === before) return;
      if (caret == null) { input.value = formatted; return; }
      // Count alphanumeric (input-class) chars before the caret, then re-place the
      // caret after that many input chars in the freshly formatted string.
      const inputCharsBeforeCaret = before.slice(0, caret).replace(/[^0-9A-Za-z]/g, '').length;
      input.value = formatted;
      let pos = 0, seen = 0;
      while (pos < formatted.length && seen < inputCharsBeforeCaret) {
        if (ALNUM.test(formatted[pos])) seen++;
        pos++;
      }
      while (pos < formatted.length && !ALNUM.test(formatted[pos])) pos++; // skip past literals
      try { input.setSelectionRange(pos, pos); } catch { /* type w/o selection */ }
    });
  });
}
