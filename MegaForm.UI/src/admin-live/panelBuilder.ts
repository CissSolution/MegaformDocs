// ============================================================
// MegaForm Admin Live Style Editor — Panel HTML Builder
// ============================================================

import { h } from '@shared/dom';
import { t } from '../i18n';
import type { ControlDef, ControlGroup, ThemePreset, PaneId } from './types';
import { LiveCssInspector } from './cssInspector';
import { getCssVar, toHex, getFirstPx, SHADOW_PRESETS } from './cssUtils';
import { FONT_FAMILIES } from './presets';

// ── Shell ────────────────────────────────────────────────────

export function buildShell(editUrl: string): HTMLElement {
  const root = h('div', { id: 'mf-live-root' });
  root.appendChild(h('div', { class: 'mf-le-overlay', id: 'mf-le-overlay' }));
  root.appendChild(h('button', {
    class: 'mf-le-trigger', id: 'mf-le-trigger', type: 'button',
    title: t('live.title'), 'aria-label': t('live.open'), 'aria-expanded': 'false',
  }, h('i', { class: 'fas fa-sliders-h mf-le-trigger-icon' })));
  root.appendChild(buildPanel(editUrl));
  root.appendChild(h('div', { class: 'mf-le-toast', id: 'mf-le-toast', role: 'status', 'aria-live': 'polite' }));
  return root;
}

function buildPanel(editUrl: string): HTMLElement {
  const panel = h('aside', {
    class: 'mf-le-panel', id: 'mf-le-panel',
    role: 'complementary', 'aria-label': t('live.title'), 'aria-hidden': 'true',
  });
  panel.appendChild(buildHeader());
  panel.appendChild(buildActionBar(editUrl));
  panel.appendChild(buildTabs());

  const body = h('div', { class: 'mf-le-body', id: 'mf-le-body' });
  const panes: PaneId[] = ['theme', 'layout', 'typography', 'inputs', 'button', 'css'];
  panes.forEach((paneId, i) => {
    body.appendChild(h('div', {
      class: `mf-le-pane${i === 0 ? ' active' : ''}`,
      id: `mf-le-pane-${paneId}`,
      role: 'tabpanel', 'aria-labelledby': `mf-le-tab-${paneId}`,
    }));
  });
  panel.appendChild(body);
  panel.appendChild(buildFooter());
  return panel;
}


function buildFooter(): HTMLElement {
  return h('div', { class: 'mf-le-pane-footer', id: 'mf-le-pane-footer' },
    h('span', null, 'Build badge'),
    h('code', { id: 'mf-le-badge-code' }, LiveCssInspector.BADGE),
  );
}

function buildHeader(): HTMLElement {
  return h('div', { class: 'mf-le-header' },
    h('div', { class: 'mf-le-header-icon' }, h('i', { class: 'fas fa-paint-brush' })),
    h('div', { class: 'mf-le-header-text' },
      h('div', { class: 'mf-le-title' }, t('live.title')),
      h('div', { class: 'mf-le-subtitle' }, t('live.subtitle')),
    ),
    h('span', { class: 'mf-le-live-badge' }, h('span', { class: 'mf-le-live-dot' }), 'LIVE'),
    h('button', { type: 'button', class: 'mf-le-close', id: 'mf-le-close', 'aria-label': t('live.close') },
      h('i', { class: 'fas fa-times' }),
    ),
  );
}

function buildActionBar(editUrl: string): HTMLElement {
  return h('div', { class: 'mf-le-actions' },
    h('button', { type: 'button', class: 'mf-le-btn mf-le-btn-save', id: 'mf-le-save' },
      h('i', { class: 'fas fa-save' }),  ' ' + t('live.save'),
    ),
    h('button', { type: 'button', class: 'mf-le-btn mf-le-btn-reset', id: 'mf-le-reset' },
      h('i', { class: 'fas fa-undo' }),  ' ' + t('live.reset'),
    ),
    // FEATURE v20260406: Export current Live Editor CSS vars → form ThemeJson
    // Bridges the gap between per-module Live Editor state and per-form Theme Designer.
    h('button', { type: 'button', class: 'mf-le-btn mf-le-btn-export', id: 'mf-le-export-theme',
      title: 'Save current style as the form\'s permanent theme (visible everywhere)' },
      h('i', { class: 'fas fa-cloud-upload-alt' }), ' Export to Theme',
    ),
    h('a', { href: editUrl, class: 'mf-le-btn mf-le-btn-edit', target: '_top' },
      h('i', { class: 'fas fa-pencil-alt' }),  ' ' + t('live.edit_form'),
    ),
  );
}


function buildTabs(): HTMLElement {
  const tabs = h('div', { class: 'mf-le-tabs', role: 'tablist', id: 'mf-le-tabs' });
  const defs: Array<{ id: PaneId; label: string; icon: string }> = [
    { id: 'theme',      label: t('live.tab_theme'),  icon: 'fa-palette' },
    { id: 'layout',     label: t('live.tab_layout'), icon: 'fa-expand-arrows-alt' },
    { id: 'typography', label: t('live.tab_typography'),   icon: 'fa-font' },
    { id: 'inputs',     label: t('live.tab_inputs'), icon: 'fa-edit' },
    { id: 'button',     label: t('live.tab_button'), icon: 'fa-hand-pointer' },
    { id: 'css',        label: 'CSS', icon: 'fa-code' },
  ];
  defs.forEach((tab, i) => {
    tabs.appendChild(h('button', {
      type: 'button', role: 'tab',
      class: `mf-le-tab${i === 0 ? ' active' : ''}`,
      id: `mf-le-tab-${tab.id}`,
      'data-pane': tab.id,
      'aria-selected': i === 0 ? 'true' : 'false',
      'aria-controls': `mf-le-pane-${tab.id}`,
    }, h('i', { class: `fas ${tab.icon}` }), h('span', null, tab.label)));
  });
  // Inspect button — trong tab bar, cuối cùng bên phải
  tabs.appendChild(h('button', {
    type: 'button',
    class: 'mf-le-tab mf-le-tab-inspect',
    id: 'mf-le-inspect-btn',
    title: t('live.inspect'),
    'aria-pressed': 'false',
    'data-pane': '',
  }, h('i', { class: 'fas fa-crosshairs' }), h('span', null, 'Pick')));
  return tabs;
}

// ── Theme pane ───────────────────────────────────────────────

export function buildThemePane(
  pane: HTMLElement,
  formWrapper: HTMLElement,
  themes: ThemePreset[],
  activeThemeKey: string,
): void {
  pane.innerHTML = '';

  // Preset grid
  const sec1 = h('div', { class: 'mf-le-section' });
  sec1.appendChild(h('div', { class: 'mf-le-section-title' }, 'Preset Themes'));
  const grid = h('div', { class: 'mf-le-theme-grid' });
  themes.forEach(t => {
    const btn = h('button', {
      type: 'button',
      class: `mf-le-swatch${activeThemeKey === t.key ? ' active' : ''}`,
      'data-theme': t.key,
      'aria-pressed': activeThemeKey === t.key ? 'true' : 'false',
      title: t.name,
    },
      h('span', { class: 'mf-le-swatch-dot', style: `background:${t.primaryColor}` }),
      h('span', { class: 'mf-le-swatch-name' }, t.name),
    );
    grid.appendChild(btn);
  });
  sec1.appendChild(grid);
  pane.appendChild(sec1);

  // Quick colors
  const sec2 = h('div', { class: 'mf-le-section' });
  sec2.appendChild(h('div', { class: 'mf-le-section-title' }, 'Quick Colors'));
  [
    { var: '--mf-primary',  label: 'Primary Accent' },
    { var: '--mf-page-bg',  label: 'Page Background' },
    { var: '--mf-form-bg',  label: 'Form Background' },
  ].forEach(q => sec2.appendChild(buildColorRow(formWrapper, q.var, q.label)));
  pane.appendChild(sec2);

  // Extra class
  const sec3 = h('div', { class: 'mf-le-section' });
  sec3.appendChild(h('div', { class: 'mf-le-section-title' }, 'Custom CSS Class'));
  const label = h('label', { class: 'mf-le-label', htmlFor: 'mf-le-extra-class' }, 'Additional class on form wrapper');
  const extra = h('input', {
    type: 'text', class: 'mf-le-input mf-le-input-full',
    id: 'mf-le-extra-class',
    placeholder: 'my-custom-class',
    value: getExtraClass(formWrapper),
    spellcheck: 'false',
  }) as HTMLInputElement;
  sec3.appendChild(label);
  sec3.appendChild(extra);
  pane.appendChild(sec3);
}

function getExtraClass(fw: HTMLElement): string {
  return [...fw.classList].filter(c => c !== 'mf-form-wrapper' && !c.startsWith('mf-theme-')).join(' ');
}

// ── Control pane — renders multiple sections ─────────────────

export function buildControlPane(
  pane: HTMLElement,
  groups: ControlGroup[],
  formWrapper: HTMLElement,
  formInner: HTMLElement | null,
): void {
  pane.innerHTML = '';
  groups.forEach(group => {
    const section = h('div', { class: 'mf-le-section' });
    section.appendChild(h('div', { class: 'mf-le-section-title' }, group.title));
    group.controls.forEach(ctrl => {
      const targetEl = ctrl.target === 'inner' && formInner ? formInner : formWrapper;
      section.appendChild(buildControl(targetEl, ctrl));
    });
    pane.appendChild(section);
  });
}

// ── Individual control builders ──────────────────────────────

function buildControl(fw: HTMLElement, ctrl: ControlDef): HTMLElement {
  switch (ctrl.type) {
    case 'color':  return buildColorRow(fw, ctrl.var, ctrl.label, ctrl.hint);
    case 'range':  return buildRangeRow(fw, ctrl);
    case 'select': return buildSelectRow(fw, ctrl);
    case 'shadow': return buildShadowRow(fw, ctrl);
    case 'font':   return buildFontRow(fw, ctrl);
    default:       return buildTextRow(fw, ctrl);
  }
}

// Color row
function buildColorRow(fw: HTMLElement, varName: string, label: string, hint?: string): HTMLElement {
  const currentVal = getCssVar(fw, varName);
  const hexVal = toHex(currentVal);
  const colorInput = h('input', {
    type: 'color', class: 'mf-le-color-picker',
    id: `mf-le-col-${varName.replace(/--/g, '')}`,
    'data-var': varName, 'data-pair': `mf-le-txt-${varName.replace(/--/g, '')}`,
    value: hexVal, title: label,
  }) as HTMLInputElement;
  const textInput = h('input', {
    type: 'text', class: 'mf-le-color-text',
    id: `mf-le-txt-${varName.replace(/--/g, '')}`,
    'data-var': varName, 'data-pair': `mf-le-col-${varName.replace(/--/g, '')}`,
    value: currentVal || hexVal, placeholder: hexVal, spellcheck: 'false',
  }) as HTMLInputElement;
  return buildRow(label, h('div', { class: 'mf-le-color-wrap' }, colorInput, textInput), hint);
}

// Range row
function buildRangeRow(fw: HTMLElement, ctrl: ControlDef): HTMLElement {
  const currentVal = getCssVar(fw, ctrl.var);
  const numVal = getFirstPx(currentVal) || (ctrl.min ?? 0);
  const unit = ctrl.unit ?? 'px';
  const safeId = ctrl.var.replace(/--/g, '');
  const rangeInput = h('input', {
    type: 'range', class: 'mf-le-range',
    id: `mf-le-rng-${safeId}`,
    'data-var': ctrl.var, 'data-unit': unit,
    min: String(ctrl.min ?? 0), max: String(ctrl.max ?? 100), step: String(ctrl.step ?? 1),
    value: String(numVal),
  }) as HTMLInputElement;
  const valLabel = h('span', { class: 'mf-le-range-val', id: `mf-le-rvl-${safeId}` }, `${numVal}${unit}`);
  return buildRow(ctrl.label, h('div', { class: 'mf-le-range-wrap' }, rangeInput, valLabel), ctrl.hint);
}

// Select row
function buildSelectRow(fw: HTMLElement, ctrl: ControlDef): HTMLElement {
  const currentVal = getCssVar(fw, ctrl.var);
  const sel = h('select', {
    class: 'mf-le-select',
    id: `mf-le-sel-${ctrl.var.replace(/--/g, '')}`,
    'data-var': ctrl.var,
  }) as HTMLSelectElement;
  (ctrl.options ?? []).forEach(opt => {
    const o = h('option', { value: opt.value }, opt.label) as HTMLOptionElement;
    if (currentVal === opt.value || currentVal.trim() === opt.value) o.selected = true;
    sel.appendChild(o);
  });
  return buildRow(ctrl.label, sel, ctrl.hint);
}

// Text row
function buildTextRow(fw: HTMLElement, ctrl: ControlDef): HTMLElement {
  const currentVal = getCssVar(fw, ctrl.var);
  const input = h('input', {
    type: 'text', class: 'mf-le-input mf-le-input-full',
    id: `mf-le-inp-${ctrl.var.replace(/--/g, '')}`,
    'data-var': ctrl.var,
    value: currentVal, placeholder: ctrl.hint ?? '',
    spellcheck: 'false',
  }) as HTMLInputElement;
  return buildRowCol(ctrl.label, input, ctrl.hint);
}

// Shadow picker row
function buildShadowRow(fw: HTMLElement, ctrl: ControlDef): HTMLElement {
  const currentVal = getCssVar(fw, ctrl.var);
  const safeId = ctrl.var.replace(/--/g, '');

  const sel = h('select', {
    class: 'mf-le-select mf-le-shadow-preset',
    id: `mf-le-shp-${safeId}`, 'data-target-input': `mf-le-sha-${safeId}`,
  }) as HTMLSelectElement;

  SHADOW_PRESETS.forEach(p => {
    const o = h('option', { value: p.value }, p.label) as HTMLOptionElement;
    if (p.value === currentVal) o.selected = true;
    sel.appendChild(o);
  });

  const textInput = h('input', {
    type: 'text', class: 'mf-le-input mf-le-input-full mf-le-shadow-text',
    id: `mf-le-sha-${safeId}`, 'data-var': ctrl.var,
    value: currentVal, placeholder: '0 4px 20px rgba(0,0,0,0.1)',
    spellcheck: 'false',
  }) as HTMLInputElement;

  // sync select → textInput
  sel.addEventListener('change', () => {
    textInput.value = sel.value;
  });

  const wrap = h('div', { class: 'mf-le-shadow-wrap' }, sel, textInput);
  return buildRowCol(ctrl.label, wrap);
}

// Font picker row
function buildFontRow(fw: HTMLElement, ctrl: ControlDef): HTMLElement {
  const currentVal = getCssVar(fw, ctrl.var);
  const safeId = ctrl.var.replace(/--/g, '');

  const sel = h('select', {
    class: 'mf-le-select mf-le-font-select',
    id: `mf-le-fnt-${safeId}`, 'data-var': ctrl.var,
  }) as HTMLSelectElement;

  FONT_FAMILIES.forEach(f => {
    const o = h('option', { value: f.value, 'data-url': f.url ?? '' }, f.label) as HTMLOptionElement;
    // Match loosely — check if option value contains first font name
    const firstFont = f.value.split(',')[0].replace(/'/g, '').trim().toLowerCase();
    const curFirst = currentVal.split(',')[0].replace(/'/g, '').trim().toLowerCase();
    if (firstFont === curFirst) o.selected = true;
    sel.appendChild(o);
  });

  // Preview strip
  const preview = h('div', { class: 'mf-le-font-preview', id: `mf-le-fpv-${safeId}` },
    'AaBbCc 123 — The quick brown fox',
  );
  preview.style.fontFamily = currentVal;

  const wrap = h('div', { class: 'mf-le-font-wrap' }, sel, preview);
  return buildRowCol(ctrl.label, wrap);
}

// ── Row layouts ──────────────────────────────────────────────

function buildRow(labelText: string, control: HTMLElement, hint?: string): HTMLElement {
  const labelEl = h('label', { class: 'mf-le-label' }, labelText);
  if (hint) labelEl.appendChild(h('small', null, hint));
  return h('div', { class: 'mf-le-row' }, labelEl, control);
}

function buildRowCol(labelText: string, control: HTMLElement, hint?: string): HTMLElement {
  const labelEl = h('label', { class: 'mf-le-label' }, labelText);
  if (hint) labelEl.appendChild(h('small', null, hint));
  return h('div', { class: 'mf-le-row-col' }, labelEl, control);
}
