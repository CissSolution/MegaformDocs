/**
 * Shared text-only HTML rebrand for premium keep-style editing.
 *
 * ONE mechanism used by BOTH AI surfaces (the user's "one engine" principle):
 *   - ops.ts `set_html_text` op (chat assistant ops-loop)
 *   - ai-form-creator.ts builder AI Designer (premium edit → preserve shell)
 *
 * Swaps replace the TEXT CONTENT of matching text nodes only — the tag
 * structure + every attribute (and therefore settings.customCss selectors and
 * the SHELL_HASH) stay byte-identical. This is how a premium hero/step/caption
 * is rebranded ("Discover Australia" → "Đăng ký Khai báo Thuế") without touching
 * the design. `find` must match an existing text node exactly; `replace` must be
 * plain text (no `<` `>`), so a swap can never inject markup.
 */

export interface HtmlTextSwap { find: string; replace: string; }
export interface HtmlTextSwapResult {
  html: string;
  applied: Array<{ find: string; replace: string; hits: number }>;
  rejected: Array<{ find: string; reason: string }>;
}

const norm = (s: unknown): string => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/**
 * Every distinct text-node string in `html` (content between `>` and `<`,
 * excluding `{{token}}` placeholders and tags). This is the authoritative
 * allowlist of strings a rebrand may target — derived from the form's own
 * customHtml, so no template-guide seeding is required for safety.
 */
export function collectHtmlTextNodes(html: string): string[] {
  const out = new Set<string>();
  String(html || '').replace(/>([^<>{}]+)</g, (full, inner) => {
    const t = norm(inner);
    if (t) out.add(t);
    return full;
  });
  return Array.from(out);
}

/**
 * Apply text-only swaps to `html`. A swap hits EVERY text node whose normalised
 * content equals the normalised `find` (the same caption can repeat — e.g. a
 * stepper label and a section heading — so the rebrand is complete). Rejects a
 * swap when: find is empty; replace contains a tag; or (when `allow` is given)
 * find is not in the allowlist; or no text node matched. Never throws.
 */
export function applyHtmlTextSwaps(html: string, swaps: HtmlTextSwap[], allow?: string[]): HtmlTextSwapResult {
  let cur = String(html || '');
  const applied: HtmlTextSwapResult['applied'] = [];
  const rejected: HtmlTextSwapResult['rejected'] = [];
  const allowSet = allow && allow.length ? new Set(allow.map(norm)) : null;
  for (const sw of swaps || []) {
    const find = norm(sw && sw.find);
    const replace = String(sw && sw.replace != null ? sw.replace : '');
    if (!find) { rejected.push({ find: String((sw && sw.find) || ''), reason: 'empty find' }); continue; }
    if (/[<>]/.test(replace)) { rejected.push({ find, reason: 'replace contains a tag (< or >)' }); continue; }
    if (allowSet && !allowSet.has(find)) { rejected.push({ find, reason: 'find is not an existing text node' }); continue; }
    let hits = 0;
    cur = cur.replace(/>([^<>{}]+)</g, (full, inner) => {
      if (norm(inner) === find) { hits++; return '>' + replace + '<'; }
      return full;
    });
    if (hits) applied.push({ find, replace, hits });
    else rejected.push({ find, reason: 'no matching text node' });
  }
  return { html: cur, applied, rejected };
}
