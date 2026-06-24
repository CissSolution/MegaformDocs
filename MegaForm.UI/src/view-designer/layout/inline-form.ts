/**
 * Layout Designer v2 — Auto-generated property form
 *
 * Builds a typed inspector form from a BlockDefV2's PropDef[] schema.
 * Each field is rendered with an appropriate editor (text input, color
 * picker, select dropdown, textarea, token chip-picker, etc.) and emits
 * a `change` callback whenever any value is edited.
 *
 * This replaces the previous "raw HTML textarea" approach. Admin sees a
 * clean form with named fields like "Title", "Background color", "Image
 * URL" — never the underlying HTML.
 */

import type { BlockDefV2, PropDef } from './blocks-v2';

export interface InlineFormOpts {
  host: HTMLElement;
  block: BlockDefV2;
  values: Record<string, any>;
  /** Called each time a value changes; new merged values object passed. */
  onChange: (newValues: Record<string, any>) => void;
}

export function renderInlineForm(opts: InlineFormOpts): void {
  const { host, block, values, onChange } = opts;
  host.innerHTML = '';
  host.classList.add('mfldv2-form');

  // Group props by `group` attribute (default: 'Chung')
  const grouped = new Map<string, PropDef[]>();
  block.props.forEach((p) => {
    const g = p.group || 'General';
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(p);
  });

  const state: Record<string, any> = { ...values };

  const emit = () => onChange({ ...state });

  grouped.forEach((props, groupName) => {
    const section = document.createElement('fieldset');
    section.className = 'mfldv2-form-section';
    section.innerHTML = `<legend class="mfldv2-form-legend">${escapeHtml(groupName)}</legend>`;
    props.forEach((p) => {
      // Visibility predicate
      if (p.showWhen && !p.showWhen(state)) return;
      const row = renderField(p, state, (next) => {
        state[p.key] = next;
        emit();
      });
      section.appendChild(row);
    });
    host.appendChild(section);
  });
}

function renderField(p: PropDef, state: Record<string, any>, onValueChange: (v: any) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = `mfldv2-form-row mfldv2-form-row-${p.type}`;

  const label = document.createElement('label');
  label.className = 'mfldv2-form-label';
  label.textContent = p.label;
  row.appendChild(label);

  const value = state[p.key];

  let editor: HTMLElement;
  switch (p.type) {
    case 'textarea':
      editor = renderTextarea(value, p, onValueChange);
      break;
    case 'number':
      editor = renderNumber(value, p, onValueChange);
      break;
    case 'color':
      editor = renderColor(value, p, onValueChange);
      break;
    case 'select':
      editor = renderSelect(value, p, onValueChange);
      break;
    case 'check':
      editor = renderCheck(value, p, onValueChange);
      break;
    case 'token':
      editor = renderToken(value, p, onValueChange);
      break;
    case 'url':
    case 'image':
    case 'icon':
    case 'text':
    default:
      editor = renderText(value, p, onValueChange);
      break;
  }
  row.appendChild(editor);

  if (p.help) {
    const help = document.createElement('span');
    help.className = 'mfldv2-form-help';
    help.textContent = p.help;
    row.appendChild(help);
  }

  return row;
}

function renderText(value: any, p: PropDef, onChange: (v: any) => void): HTMLElement {
  const input = document.createElement('input');
  input.type = p.type === 'url' || p.type === 'image' ? 'url' : 'text';
  input.className = 'mfldv2-form-input';
  input.value = String(value ?? '');
  if (p.placeholder) input.placeholder = p.placeholder;
  input.addEventListener('input', () => onChange(input.value));
  return input;
}

function renderTextarea(value: any, p: PropDef, onChange: (v: any) => void): HTMLElement {
  const ta = document.createElement('textarea');
  ta.className = 'mfldv2-form-textarea';
  ta.rows = 4;
  ta.value = String(value ?? '');
  if (p.placeholder) ta.placeholder = p.placeholder;
  ta.addEventListener('input', () => onChange(ta.value));
  return ta;
}

function renderNumber(value: any, p: PropDef, onChange: (v: any) => void): HTMLElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'mfldv2-form-input';
  input.value = String(value ?? '');
  input.addEventListener('input', () => onChange(Number(input.value || 0)));
  return input;
}

function renderColor(value: any, p: PropDef, onChange: (v: any) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'mfldv2-form-color';

  const swatch = document.createElement('input');
  swatch.type = 'color';
  swatch.className = 'mfldv2-form-color-swatch';
  swatch.value = sanitizeColor(value);

  const text = document.createElement('input');
  text.type = 'text';
  text.className = 'mfldv2-form-input';
  text.value = String(value ?? '');

  swatch.addEventListener('input', () => { text.value = swatch.value; onChange(swatch.value); });
  text.addEventListener('input', () => { const sc = sanitizeColor(text.value); if (sc) swatch.value = sc; onChange(text.value); });

  wrap.appendChild(swatch);
  wrap.appendChild(text);
  return wrap;
}

function sanitizeColor(v: any): string {
  const s = String(v ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : '#cccccc';
}

function renderSelect(value: any, p: PropDef, onChange: (v: any) => void): HTMLElement {
  const sel = document.createElement('select');
  sel.className = 'mfldv2-form-select';
  (p.options || []).forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    if (String(value) === String(o.value)) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function renderCheck(value: any, p: PropDef, onChange: (v: any) => void): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'mfldv2-form-check';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = !!value;
  box.addEventListener('change', () => onChange(box.checked));
  wrap.appendChild(box);
  const txt = document.createElement('span');
  txt.textContent = p.placeholder || 'Enabled';
  wrap.appendChild(txt);
  return wrap;
}

function renderToken(value: any, p: PropDef, onChange: (v: any) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'mfldv2-form-token';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'mfldv2-form-input';
  input.value = String(value ?? '');
  if (p.placeholder) input.placeholder = p.placeholder;
  input.addEventListener('input', () => onChange(input.value));

  wrap.appendChild(input);

  if (p.tokens && p.tokens.length) {
    const chips = document.createElement('div');
    chips.className = 'mfldv2-form-chips';
    p.tokens.forEach((tok) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'mfldv2-form-chip';
      chip.textContent = tok;
      chip.addEventListener('click', () => {
        const start = input.selectionStart || input.value.length;
        const before = input.value.slice(0, start);
        const after = input.value.slice(start);
        input.value = before + tok + after;
        input.focus();
        const pos = start + tok.length;
        input.setSelectionRange(pos, pos);
        onChange(input.value);
      });
      chips.appendChild(chip);
    });
    wrap.appendChild(chips);
  }
  return wrap;
}

function escapeHtml(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
}
