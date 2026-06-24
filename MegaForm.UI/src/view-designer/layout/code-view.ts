/**
 * Layout Designer — code view (plain monospace textarea).
 *
 * Why a textarea instead of Monaco/CodeMirror:
 *   - The popup must stay lightweight (Sortable + DOM diff already cover
 *     the main UX).
 *   - HTML editing rarely benefits from full AST tooling; ctrl+F, line
 *     breaks, and the live preview in Split mode cover the common cases.
 *
 * Two-way sync rule:
 *   - When the user types in the textarea, we DO NOT re-parse on every
 *     keystroke (would clobber cursor + lose unanchored regions). We re-
 *     parse only on blur / mode-switch — debounce keeps Visual fresh
 *     without thrashing.
 */

export interface CodeViewHandle {
  el: HTMLElement;
  setValue: (html: string) => void;
  getValue: () => string;
  focus: () => void;
}

export interface CodeViewOpts {
  initial: string;
  onCommit: (html: string) => void;       // debounced — fires on idle
  onWarn?: (msg: string) => void;
}

export function createCodeView(opts: CodeViewOpts): CodeViewHandle {
  const wrap = document.createElement('div');
  wrap.className = 'mf-ld-code';

  const head = document.createElement('div');
  head.className = 'mf-ld-code-head';
  head.innerHTML =
    '<span>HTML (canonical)</span>' +
    '<span class="mf-ld-spacer" style="flex:1"></span>' +
    '<span class="mf-ld-code-warn" data-warn></span>';
  wrap.appendChild(head);

  const ta = document.createElement('textarea');
  ta.className = 'mf-ld-code-textarea';
  ta.spellcheck = false;
  ta.value = opts.initial || '';
  wrap.appendChild(ta);

  let debounce: number | null = null;
  ta.addEventListener('input', () => {
    if (debounce) window.clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      try { opts.onCommit(ta.value); } catch { /* ignore */ }
    }, 450);
  });
  ta.addEventListener('blur', () => {
    if (debounce) { window.clearTimeout(debounce); debounce = null; }
    try { opts.onCommit(ta.value); } catch { /* ignore */ }
  });

  return {
    el: wrap,
    setValue(html: string) {
      if (ta.value !== html) ta.value = html;
    },
    getValue() { return ta.value; },
    focus() { ta.focus(); },
  };
}
