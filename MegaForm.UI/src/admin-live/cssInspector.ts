// ============================================================
// MegaForm Admin Live — CSS Inspector Pane
// Dedicated live-CSS editor for picked DOM elements
// ============================================================

import { h } from '@shared/dom';
import { toHex } from './cssUtils';

interface CssPropDef {
  prop: string;
  label: string;
  type: 'color' | 'text' | 'select';
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
}

interface InspectorSelectionState {
  label: string;
  selector: string;
  liveSelector: string;
}

const STATE_MARKER = '__MF_LIVE_INSPECTOR_STATE__';
const STYLE_ID = 'mf-le-css-inspector-overrides';
const UI_STYLE_ID = 'mf-le-css-inspector-ui';
const LIVE_ATTR = 'data-mf-live-selected';

const COMMON_PROPS = [
  'background-color',
  'background-image',
  'padding',
  'margin',
  'gap',
  'border',
  'border-radius',
  'box-shadow',
  'color',
];

const PROP_DEFS: CssPropDef[] = [
  { prop: 'background-color', label: 'Background', type: 'color' },
  { prop: 'background-image', label: 'Background Image', type: 'text', placeholder: 'none | url(...) | linear-gradient(...)' },
  { prop: 'padding', label: 'Padding', type: 'text', placeholder: 'e.g. 24px 32px' },
  { prop: 'margin', label: 'Margin', type: 'text', placeholder: 'e.g. 0 auto 24px' },
  { prop: 'gap', label: 'Gap', type: 'text', placeholder: 'e.g. 12px' },
  { prop: 'border', label: 'Border', type: 'text', placeholder: 'e.g. 1px solid #d0d5dd' },
  { prop: 'border-radius', label: 'Border Radius', type: 'text', placeholder: 'e.g. 20px' },
  { prop: 'box-shadow', label: 'Box Shadow', type: 'text', placeholder: 'e.g. 0 12px 40px rgba(0,0,0,.14)' },
  { prop: 'opacity', label: 'Opacity', type: 'text', placeholder: '0 - 1' },
  {
    prop: 'display', label: 'Display', type: 'select', options: [
      { label: 'block', value: 'block' },
      { label: 'flex', value: 'flex' },
      { label: 'grid', value: 'grid' },
      { label: 'inline-block', value: 'inline-block' },
      { label: 'none', value: 'none' },
    ],
  },
  { prop: 'width', label: 'Width', type: 'text', placeholder: 'e.g. 100%' },
  { prop: 'max-width', label: 'Max Width', type: 'text', placeholder: 'e.g. 720px' },
  { prop: 'height', label: 'Height', type: 'text', placeholder: 'e.g. 240px' },
  { prop: 'color', label: 'Text Color', type: 'color' },
];

function escapeCssIdent(input: string): string {
  const esc = (window as any).CSS?.escape;
  if (typeof esc === 'function') return esc(input);
  return String(input).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

function isTransparent(value: string): boolean {
  const v = String(value || '').trim().toLowerCase();
  return v === 'transparent' || v === 'rgba(0, 0, 0, 0)' || v === 'rgba(0,0,0,0)' || v === 'initial';
}

function getPropDef(prop: string): CssPropDef | undefined {
  return PROP_DEFS.find(def => def.prop === prop);
}

function selectorPart(el: HTMLElement): string {
  const attrField = el.getAttribute('data-field-id') || el.getAttribute('data-id') || el.getAttribute('name');
  if (attrField) {
    const attrName = el.getAttribute('name') ? 'name' : (el.getAttribute('data-field-id') ? 'data-field-id' : 'data-id');
    return `${el.tagName.toLowerCase()}[${attrName}="${String(attrField).replace(/"/g, '\\"')}"]`;
  }

  const preferredClasses = [...el.classList]
    .filter(c => /^(mf-|mfp-)/.test(c) && !/(active|open|hover|focus|selected|editing|current|show|hide|disabled|error)/.test(c))
    .slice(0, 2);

  if (preferredClasses.length) {
    return `${el.tagName.toLowerCase()}.${preferredClasses.map(escapeCssIdent).join('.')}`;
  }

  let index = 1;
  let sib = el.previousElementSibling as HTMLElement | null;
  while (sib) {
    if (sib.tagName === el.tagName) index += 1;
    sib = sib.previousElementSibling as HTMLElement | null;
  }
  return `${el.tagName.toLowerCase()}:nth-of-type(${index})`;
}

function buildStableSelector(root: HTMLElement, el: HTMLElement): string {
  if (el === root) return '.mf-form-wrapper';
  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== root && cur !== document.body) {
    parts.unshift(selectorPart(cur));
    cur = cur.parentElement;
  }
  return `.mf-form-wrapper ${parts.join(' > ')}`.trim();
}

function serializeState(overrides: Record<string, Record<string, string>>): string {
  try {
    return encodeURIComponent(JSON.stringify(overrides || {}));
  } catch {
    return '';
  }
}

function deserializeState(raw: string): Record<string, Record<string, string>> {
  if (!raw) return {};
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function buildCssText(
  overrides: Record<string, Record<string, string>>,
  livePreview?: { selector?: string; liveSelector?: string },
): string {
  const rules = Object.entries(overrides)
    .map(([selector, props]) => {
      const decl = Object.entries(props)
        .filter(([_, value]) => String(value || '').trim() !== '')
        .map(([prop, value]) => `${prop}:${value} !important`)
        .join(';');
      if (!decl) return '';
      const selectors = new Set<string>();
      if (selector) selectors.add(selector);
      if (livePreview?.selector === selector && livePreview.liveSelector) selectors.add(livePreview.liveSelector);
      return `${Array.from(selectors).join(',')}{${decl}}`;
    })
    .filter(Boolean)
    .join('\n');

  if (!rules) return '';
  return `/*${STATE_MARKER}:${serializeState(overrides)}__*/\n${rules}`;
}

function extractMarkerState(cssText: string): Record<string, Record<string, string>> {
  const match = String(cssText || '').match(new RegExp(`/\\*${STATE_MARKER}:(.*?)__\\*/`));
  return match?.[1] ? deserializeState(match[1]) : {};
}

function ensureUiStyles(): void {
  if (document.getElementById(UI_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = UI_STYLE_ID;
  style.textContent = `
  .mf-le-pane-footer{margin-top:auto;padding:10px 14px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:11px;font-weight:700;letter-spacing:.04em;display:flex;align-items:center;justify-content:space-between;gap:8px;}
  .mf-le-pane-footer code{font-size:10px;background:#fff;border:1px solid #dbe4f0;border-radius:999px;padding:3px 8px;color:#0f172a;}
  .mf-le-ci-card{border:1px solid #dbe4f0;border-radius:18px;background:linear-gradient(180deg,#ffffff 0%,#fbfdff 100%);padding:14px;margin-bottom:14px;box-shadow:0 12px 34px rgba(15,23,42,.08);}
  .mf-le-ci-head{display:flex;flex-direction:column;gap:8px;margin-bottom:12px;}
  .mf-le-ci-title{font-size:13px;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:8px;}
  .mf-le-ci-note{font-size:11px;color:#64748b;line-height:1.55;}
  .mf-le-ci-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;}
  .mf-le-ci-selector{font-size:11px;background:#0f172a;color:#e2e8f0;border-radius:12px;padding:9px 11px;overflow:auto;white-space:nowrap;}
  .mf-le-ci-subtle{font-size:11px;color:#94a3b8;line-height:1.45;}
  .mf-le-ci-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 14px;}
  .mf-le-ci-btn{border:1px solid #dbe4f0;background:#fff;color:#0f172a;border-radius:999px;padding:7px 11px;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s ease;}
  .mf-le-ci-btn:hover{background:#f8fafc;border-color:#cbd5e1;transform:translateY(-1px);}
  .mf-le-ci-grid{display:flex;flex-direction:column;gap:10px;}
  .mf-le-ci-row{display:grid;grid-template-columns:minmax(0,1fr);gap:7px;padding:10px 11px;border:1px solid #edf2f7;border-radius:14px;background:#fff;}
  .mf-le-ci-meta{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
  .mf-le-ci-label{font-size:11px;font-weight:800;color:#334155;display:flex;flex-direction:column;gap:2px;}
  .mf-le-ci-value{font-size:10px;color:#94a3b8;font-weight:600;line-height:1.35;}
  .mf-le-ci-field{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;}
  .mf-le-ci-field--solo{grid-template-columns:minmax(0,1fr);}
  .mf-le-ci-input,.mf-le-ci-select{width:100%;min-width:0;height:36px;border:1px solid #dbe4f0;border-radius:12px;padding:7px 11px;font-size:12px;background:#fff;color:#0f172a;box-sizing:border-box;}
  .mf-le-ci-input:focus,.mf-le-ci-select:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12);}
  .mf-le-ci-input.mf-le-ci-color-text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
  .mf-le-ci-color-wrap{display:grid;grid-template-columns:42px minmax(0,1fr);gap:8px;align-items:center;}
  .mf-le-ci-color{width:42px;height:36px;border:1px solid #dbe4f0;border-radius:12px;padding:2px;background:#fff;cursor:pointer;}
  .mf-le-ci-remove{height:36px;min-width:38px;border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:12px;cursor:pointer;font-weight:900;transition:all .15s ease;}
  .mf-le-ci-remove:hover{background:#fee2e2;transform:translateY(-1px);}
  .mf-le-ci-divider{margin:14px 0 8px;padding-top:12px;border-top:1px dashed #dbe4f0;font-size:11px;font-weight:800;color:#475569;}
  .mf-le-ci-add-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:8px;align-items:center;}
  .mf-le-ci-empty{font-size:12px;color:#64748b;border:1px dashed #cbd5e1;border-radius:14px;padding:14px;background:#f8fafc;}
  .mf-le-ci-add-inline{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;}
  @media (max-width: 540px){
    .mf-le-ci-field,.mf-le-ci-add-grid,.mf-le-ci-add-inline{grid-template-columns:minmax(0,1fr);}
    .mf-le-ci-remove{width:100%;}
  }
  `;
  document.head.appendChild(style);
}

export class LiveCssInspector {
  static readonly BADGE = 'LiveInspectCss v20260407-02';

  private readonly formWrapper: HTMLElement;
  private readonly onChange?: () => void;
  private styleEl: HTMLStyleElement | null = null;
  private selectedEl: HTMLElement | null = null;
  private selected: InspectorSelectionState | null = null;
  private overrides: Record<string, Record<string, string>> = {};
  private savedSerializedState = '';
  private currentPane: HTMLElement | null = null;
  private customPropName = '';
  private customPropValue = '';

  constructor(formWrapper: HTMLElement, onChange?: () => void) {
    this.formWrapper = formWrapper;
    this.onChange = onChange;
    ensureUiStyles();
    this.loadExistingState();
  }

  private ensureStyleEl(): HTMLStyleElement {
    if (!this.styleEl) {
      this.styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    }
    if (!this.styleEl) {
      this.styleEl = document.createElement('style');
      this.styleEl.id = STYLE_ID;
      document.head.appendChild(this.styleEl);
    }
    return this.styleEl;
  }

  private loadExistingState(): void {
    const style = document.getElementById('mf-live-override') as HTMLStyleElement | null;
    if (!style?.textContent) {
      this.savedSerializedState = serializeState({});
      return;
    }
    this.overrides = extractMarkerState(style.textContent);
    this.savedSerializedState = serializeState(this.overrides);
    this.applyOverrides();
  }

  captureSerializedState(): string {
    return serializeState(this.overrides);
  }

  restoreSerializedState(serialized: string): void {
    this.overrides = deserializeState(serialized);
    this.savedSerializedState = serialized || serializeState({});
    this.applyOverrides();
    if (this.currentPane) this.render(this.currentPane);
  }

  restoreSavedState(): void {
    this.overrides = deserializeState(this.savedSerializedState);
    this.applyOverrides();
    if (this.currentPane) this.render(this.currentPane);
  }

  setSelectedElement(el: HTMLElement, label: string): void {
    if (this.selectedEl && this.selectedEl !== el) this.selectedEl.removeAttribute(LIVE_ATTR);
    const token = `sel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    el.setAttribute(LIVE_ATTR, token);
    this.selectedEl = el;
    this.selected = {
      label,
      selector: buildStableSelector(this.formWrapper, el),
      liveSelector: `.mf-form-wrapper [${LIVE_ATTR}="${token}"]`,
    };
    this.applyOverrides();
    if (this.currentPane) this.render(this.currentPane);
  }

  getCustomCssText(): string {
    return buildCssText(this.overrides);
  }

  render(pane: HTMLElement): void {
    this.currentPane = pane;
    pane.innerHTML = '';

    const card = h('div', { class: 'mf-le-ci-card' });
    const head = h('div', { class: 'mf-le-ci-head' },
      h('div', { class: 'mf-le-ci-title' },
        h('span', { class: 'mf-le-ci-chip' }, 'Live CSS'),
        'CSS Inspector',
      ),
      h('div', { class: 'mf-le-ci-note' }, 'Pick an element inside the form, then edit background, spacing, border, radius, or add/remove any CSS property. Changes apply instantly.'),
    );
    card.appendChild(head);

    if (!this.selected || !this.selectedEl) {
      card.appendChild(h('div', { class: 'mf-le-ci-empty' }, 'Click Pick, then click any form element to inspect it.'));
      pane.appendChild(card);
      return;
    }

    card.appendChild(h('div', { class: 'mf-le-ci-selector' }, this.selected.selector));
    card.appendChild(h('div', { class: 'mf-le-ci-subtle' }, `${this.selected.label} · live preview is forced onto the exact picked element, then saved using the stable selector above.`));

    const actions = h('div', { class: 'mf-le-ci-actions' },
      h('button', { type: 'button', class: 'mf-le-ci-btn', onClick: () => this.setProp('background-color', 'transparent') }, 'Transparent BG'),
      h('button', { type: 'button', class: 'mf-le-ci-btn', onClick: () => this.removeProp('background-color') }, 'Clear BG'),
      h('button', { type: 'button', class: 'mf-le-ci-btn', onClick: () => this.removeProp('background-image') }, 'Clear BG Image'),
      h('button', { type: 'button', class: 'mf-le-ci-btn', onClick: () => this.clearCurrentSelector() }, 'Clear element overrides'),
    );
    card.appendChild(actions);

    const grid = h('div', { class: 'mf-le-ci-grid' });
    const visibleProps = this.getVisibleProps();
    visibleProps.forEach(prop => grid.appendChild(this.buildPropRow(prop)));
    card.appendChild(grid);

    card.appendChild(h('div', { class: 'mf-le-ci-divider' }, 'Add more properties'));
    card.appendChild(this.buildPresetAddRow(visibleProps));
    card.appendChild(this.buildCustomAddRow());

    pane.appendChild(card);
  }

  private getVisibleProps(): string[] {
    const selector = this.selected?.selector;
    const existing = selector ? Object.keys(this.overrides[selector] || {}) : [];
    return Array.from(new Set([...COMMON_PROPS, ...existing]));
  }

  private buildPropRow(prop: string): HTMLElement {
    const def = getPropDef(prop) || { prop, label: prop, type: 'text' as const };
    const currentComputed = this.getComputedValue(prop);
    const row = h('div', { class: 'mf-le-ci-row' });
    const meta = h('div', { class: 'mf-le-ci-meta' },
      h('div', { class: 'mf-le-ci-label' },
        def.label,
        h('span', { class: 'mf-le-ci-value' }, currentComputed ? `Current: ${currentComputed}` : 'Current: none'),
      ),
    );
    row.appendChild(meta);

    if (def.type === 'color') {
      row.appendChild(this.wrapField(this.buildColorControl(prop), prop));
    } else if (def.type === 'select') {
      const current = this.getValue(prop);
      const sel = h('select', { class: 'mf-le-ci-select' }) as HTMLSelectElement;
      sel.appendChild(h('option', { value: '' }, '— remove override —'));
      (def.options || []).forEach(opt => sel.appendChild(h('option', { value: opt.value }, opt.label)));
      sel.value = current && (def.options || []).some(o => o.value === current) ? current : '';
      sel.addEventListener('change', () => {
        if (!sel.value) this.removeProp(prop);
        else this.setProp(prop, sel.value);
      });
      row.appendChild(this.wrapField(sel, prop, true));
    } else {
      const input = h('input', {
        type: 'text',
        class: 'mf-le-ci-input',
        value: this.getValue(prop),
        placeholder: def.placeholder || currentComputed || prop,
      }) as HTMLInputElement;
      input.addEventListener('input', () => {
        const val = input.value.trim();
        if (!val) this.removeProp(prop);
        else this.setProp(prop, val);
      });
      row.appendChild(this.wrapField(input, prop, true));
    }

    return row;
  }

  private wrapField(control: HTMLElement, prop: string, solo = false): HTMLElement {
    const field = h('div', { class: `mf-le-ci-field${solo ? ' mf-le-ci-field--solo' : ''}` });
    field.appendChild(control);
    field.appendChild(h('button', {
      type: 'button',
      class: 'mf-le-ci-remove',
      title: `Remove ${prop}`,
      onClick: () => this.removeProp(prop),
    }, '×'));
    return field;
  }

  private buildColorControl(prop: string): HTMLElement {
    const current = this.getValue(prop);
    const wrap = h('div', { class: 'mf-le-ci-color-wrap' });
    const color = h('input', { type: 'color', class: 'mf-le-ci-color', value: toHex(current || this.getComputedValue(prop) || '#000000') }) as HTMLInputElement;
    const text = h('input', {
      type: 'text',
      class: 'mf-le-ci-input mf-le-ci-color-text',
      value: current,
      placeholder: this.getComputedValue(prop) || '#000000',
    }) as HTMLInputElement;

    color.addEventListener('input', () => {
      text.value = color.value;
      this.setProp(prop, color.value);
    });

    text.addEventListener('input', () => {
      const value = text.value.trim();
      if (!value) {
        this.removeProp(prop);
        return;
      }
      this.setProp(prop, value);
      if (!isTransparent(value)) {
        try { color.value = toHex(value); } catch { /* ignore */ }
      }
    });

    wrap.appendChild(color);
    wrap.appendChild(text);
    return wrap;
  }

  private buildPresetAddRow(visibleProps: string[]): HTMLElement {
    const wrap = h('div', { class: 'mf-le-ci-add-inline' });
    const select = h('select', { class: 'mf-le-ci-select' }) as HTMLSelectElement;
    select.appendChild(h('option', { value: '' }, 'Add a common property…'));
    PROP_DEFS
      .filter(def => !visibleProps.includes(def.prop))
      .forEach(def => select.appendChild(h('option', { value: def.prop }, def.label)));

    const btn = h('button', { type: 'button', class: 'mf-le-ci-btn' }, '+ Add');
    btn.addEventListener('click', () => {
      if (!select.value) return;
      this.setProp(select.value, this.getComputedValue(select.value) || '');
      if (this.currentPane) this.render(this.currentPane);
    });

    wrap.appendChild(select);
    wrap.appendChild(btn);
    return wrap;
  }

  private buildCustomAddRow(): HTMLElement {
    const wrap = h('div', { class: 'mf-le-ci-add-grid' });
    const nameInput = h('input', {
      type: 'text',
      class: 'mf-le-ci-input',
      placeholder: 'property',
      value: this.customPropName,
    }) as HTMLInputElement;
    const valueInput = h('input', {
      type: 'text',
      class: 'mf-le-ci-input',
      placeholder: 'value',
      value: this.customPropValue,
    }) as HTMLInputElement;
    const addBtn = h('button', { type: 'button', class: 'mf-le-ci-btn' }, 'Add / Apply');

    nameInput.addEventListener('input', () => { this.customPropName = nameInput.value; });
    valueInput.addEventListener('input', () => { this.customPropValue = valueInput.value; });
    addBtn.addEventListener('click', () => {
      const prop = nameInput.value.trim();
      const value = valueInput.value.trim();
      if (!prop) return;
      this.setProp(prop, value || this.getComputedValue(prop) || '');
      this.customPropName = '';
      this.customPropValue = '';
      if (this.currentPane) this.render(this.currentPane);
    });

    wrap.appendChild(nameInput);
    wrap.appendChild(valueInput);
    wrap.appendChild(addBtn);
    return wrap;
  }

  private getComputedValue(prop: string): string {
    if (!this.selectedEl) return '';
    return getComputedStyle(this.selectedEl).getPropertyValue(prop).trim();
  }

  private getValue(prop: string): string {
    const selector = this.selected?.selector;
    if (!selector) return '';
    return this.overrides[selector]?.[prop] ?? '';
  }

  private setProp(prop: string, value: string): void {
    const selector = this.selected?.selector;
    if (!selector) return;
    this.overrides[selector] = this.overrides[selector] || {};
    if (String(value || '').trim()) this.overrides[selector][prop] = String(value).trim();
    else delete this.overrides[selector][prop];
    if (Object.keys(this.overrides[selector]).length === 0) delete this.overrides[selector];
    this.applyOverrides();
    this.onChange?.();
  }

  private removeProp(prop: string): void {
    const selector = this.selected?.selector;
    if (!selector || !this.overrides[selector]) {
      if (this.currentPane) this.render(this.currentPane);
      return;
    }
    delete this.overrides[selector][prop];
    if (Object.keys(this.overrides[selector]).length === 0) delete this.overrides[selector];
    this.applyOverrides();
    this.onChange?.();
    if (this.currentPane) this.render(this.currentPane);
  }

  private clearCurrentSelector(): void {
    const selector = this.selected?.selector;
    if (!selector) return;
    delete this.overrides[selector];
    this.applyOverrides();
    this.onChange?.();
    if (this.currentPane) this.render(this.currentPane);
  }

  private applyOverrides(): void {
    const styleEl = this.ensureStyleEl();
    styleEl.textContent = buildCssText(this.overrides, {
      selector: this.selected?.selector,
      liveSelector: this.selected?.liveSelector,
    });
  }
}
