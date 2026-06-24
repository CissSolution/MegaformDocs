// ============================================================
// MegaForm Admin Live — Element Inspector / CSS Picker
// Hover + click any element inside form → jump to CSS inspector / vars
// ============================================================

import type { InspectSelection, InspectTarget, PaneId } from './types';

// ── Map: CSS class → { label, pane, vars[] } ────────────────
const CLASS_MAP: Array<{ match: (el: HTMLElement) => boolean; info: InspectTarget }> = [
  {
    match: el => el.classList.contains('mf-form-inner'),
    info: { label: 'Form Container', pane: 'layout', vars: ['--mf-form-max-width', '--mf-form-radius', '--mf-form-padding'], scrollToVar: '--mf-form-max-width' },
  },
  {
    match: el => el.classList.contains('mf-form-wrapper') && !el.classList.contains('mf-form-inner'),
    info: { label: 'Page Background', pane: 'layout', vars: ['--mf-page-bg', '--mf-form-bg', '--mf-form-shadow'], scrollToVar: '--mf-page-bg' },
  },
  {
    match: el => el.classList.contains('mf-form-title'),
    info: { label: 'Form Title', pane: 'typography', vars: ['--mf-title-font-size', '--mf-title-color', '--mf-title-font-weight'], scrollToVar: '--mf-title-font-size' },
  },
  {
    match: el => el.classList.contains('mf-form-header'),
    info: { label: 'Form Header', pane: 'typography', vars: ['--mf-title-color', '--mf-title-font-size'], scrollToVar: '--mf-title-color' },
  },
  {
    match: el => el.classList.contains('mf-field-label'),
    info: { label: 'Field Label', pane: 'typography', vars: ['--mf-label-font-size', '--mf-label-color', '--mf-label-font-weight'], scrollToVar: '--mf-label-font-size' },
  },
  {
    match: el => el.classList.contains('mf-required'),
    info: { label: 'Required (*)', pane: 'typography', vars: ['--mf-required-color'], scrollToVar: '--mf-required-color' },
  },
  {
    match: el => el.classList.contains('mf-input') || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT',
    info: { label: 'Input Field', pane: 'inputs', vars: ['--mf-input-bg', '--mf-input-border', '--mf-input-radius', '--mf-input-font-size'], scrollToVar: '--mf-input-bg' },
  },
  {
    match: el => el.classList.contains('mf-option-item') || el.classList.contains('mf-option-group'),
    info: { label: 'Checkbox / Radio', pane: 'inputs', vars: ['--mf-check-color', '--mf-check-size', '--mf-check-radius'], scrollToVar: '--mf-check-color' },
  },
  {
    match: el => el.classList.contains('mf-file-drop') || el.classList.contains('mf-file-area'),
    info: { label: 'File Upload', pane: 'inputs', vars: ['--mf-file-bg', '--mf-file-border'], scrollToVar: '--mf-file-bg' },
  },
  {
    match: el => el.classList.contains('mf-help-text') || el.classList.contains('mf-field-description'),
    info: { label: 'Help Text', pane: 'typography', vars: ['--mf-help-color', '--mf-help-font-size'], scrollToVar: '--mf-help-color' },
  },
  {
    match: el => el.classList.contains('mf-btn-submit') || (el.tagName === 'BUTTON' && el.classList.contains('mf-btn')),
    info: { label: 'Submit Button', pane: 'button', vars: ['--mf-btn-bg', '--mf-btn-color', '--mf-btn-radius', '--mf-btn-font-size'], scrollToVar: '--mf-btn-bg' },
  },
  {
    match: el => el.classList.contains('mf-progress-bar') || el.classList.contains('mf-progress-fill'),
    info: { label: 'Progress Bar', pane: 'button', vars: ['--mf-progress-fill', '--mf-progress-bg', '--mf-progress-height'], scrollToVar: '--mf-progress-fill' },
  },
  {
    match: el => el.classList.contains('mf-section-title') || el.classList.contains('mf-section-header'),
    info: { label: 'Section Title', pane: 'typography', vars: ['--mf-section-title-color', '--mf-section-title-size'], scrollToVar: '--mf-section-title-color' },
  },
  {
    match: el => el.classList.contains('mf-field-group'),
    info: { label: 'Field Group', pane: 'layout', vars: ['--mf-field-gap', '--mf-form-bg'], scrollToVar: '--mf-field-gap' },
  },
  {
    match: el => el.classList.contains('mf-form') || el.classList.contains('mf-fields-container'),
    info: { label: 'Form Body', pane: 'layout', vars: ['--mf-form-bg', '--mf-form-padding', '--mf-field-gap'], scrollToVar: '--mf-form-bg' },
  },
];

function makeGenericInfo(el: HTMLElement): InspectTarget {
  const tag = el.tagName.toLowerCase();
  const cls = [...el.classList].find(c => /^(mf-|mfp-)/.test(c));
  return {
    label: cls ? `${tag}.${cls}` : `<${tag}>`,
    pane: 'css',
    vars: ['background-color', 'background-image', 'padding', 'margin'],
  };
}

function getInspectInfo(el: HTMLElement): InspectTarget {
  let cur: HTMLElement | null = el;
  while (cur && cur !== document.body) {
    for (const rule of CLASS_MAP) {
      if (rule.match(cur)) return rule.info;
    }
    cur = cur.parentElement;
  }
  return makeGenericInfo(el);
}

// ── Inspector class ──────────────────────────────────────────

type SelectionHandler = (selection: InspectSelection) => void;

export class ElementInspector {
  private active = false;
  private formWrapper: HTMLElement;
  private onSelect: SelectionHandler;
  private highlightEl: HTMLElement | null = null;
  private tooltipEl: HTMLElement | null = null;
  private lastHovered: HTMLElement | null = null;
  private toggleBtn: HTMLElement | null = null;

  private _onMove: (e: MouseEvent) => void;
  private _onClick: (e: MouseEvent) => void;
  private _onKey: (e: KeyboardEvent) => void;

  constructor(formWrapper: HTMLElement, onSelect: SelectionHandler) {
    this.formWrapper = formWrapper;
    this.onSelect = onSelect;
    this._onMove  = this.onMove.bind(this);
    this._onClick = this.onClick.bind(this);
    this._onKey   = this.onKey.bind(this);
  }

  toggle(): void {
    this.active ? this.deactivate() : this.activate();
  }

  activate(): void {
    this.active = true;
    this.formWrapper.classList.add('mf-inspect-mode');
    this.formWrapper.addEventListener('mousemove', this._onMove);
    this.formWrapper.addEventListener('click', this._onClick, true);
    document.addEventListener('keydown', this._onKey);
    this.toggleBtn?.classList.add('active');
    this.toggleBtn?.setAttribute('title', 'Inspect Mode ON — click element to open CSS inspector (Esc to exit)');
    this.ensureOverlays();
  }

  deactivate(): void {
    this.active = false;
    this.formWrapper.classList.remove('mf-inspect-mode');
    this.formWrapper.removeEventListener('mousemove', this._onMove);
    this.formWrapper.removeEventListener('click', this._onClick, true);
    document.removeEventListener('keydown', this._onKey);
    this.toggleBtn?.classList.remove('active');
    this.toggleBtn?.setAttribute('title', 'Click to inspect form elements');
    this.hideOverlays();
    this.lastHovered = null;
  }

  setToggleBtn(btn: HTMLElement): void {
    this.toggleBtn = btn;
  }

  isActive(): boolean { return this.active; }

  private onMove(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!this.formWrapper.contains(target) || target === this.highlightEl || target === this.tooltipEl) return;
    if (target === this.lastHovered) return;
    this.lastHovered = target;

    const info = getInspectInfo(target);
    this.showHighlight(target, info);
  }

  private onClick(e: MouseEvent): void {
    if (!this.active) return;
    const target = e.target as HTMLElement;
    if (!this.formWrapper.contains(target) || target === this.highlightEl || target === this.tooltipEl) return;

    const info = getInspectInfo(target);
    e.preventDefault();
    e.stopPropagation();
    this.onSelect({ element: target, target: info });
    this.flashConfirm(target);
    setTimeout(() => this.deactivate(), 250);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.deactivate();
  }

  private ensureOverlays(): void {
    if (!this.highlightEl) {
      this.highlightEl = document.createElement('div');
      this.highlightEl.className = 'mf-inspect-highlight';
      this.highlightEl.style.pointerEvents = 'none';
      document.body.appendChild(this.highlightEl);
    }
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement('div');
      this.tooltipEl.className = 'mf-inspect-tooltip';
      this.tooltipEl.style.pointerEvents = 'none';
      document.body.appendChild(this.tooltipEl);
    }
  }

  private showHighlight(el: HTMLElement, info: InspectTarget): void {
    this.ensureOverlays();
    const rect = el.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    const hl = this.highlightEl!;
    hl.style.cssText = `
      pointer-events: none;
      position: absolute;
      top: ${rect.top + scrollY}px;
      left: ${rect.left + scrollX}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      z-index: 99995;
      box-sizing: border-box;
      display:block;
    `;

    const tp = this.tooltipEl!;
    const varsPreview = info.vars.length ? info.vars.slice(0, 2).join(' · ') : 'click to inspect';
    tp.innerHTML = `
      <span class="mf-inspect-tip-label">${info.label}</span>
      <span class="mf-inspect-tip-vars">${varsPreview}</span>
      <span class="mf-inspect-tip-hint">Click to edit</span>
    `;

    const tpTop = rect.top + scrollY - 42;
    const tpLeft = Math.min(rect.left + scrollX, window.innerWidth - 260);
    tp.style.cssText = `
      pointer-events: none;
      position: absolute;
      top: ${tpTop < scrollY ? rect.bottom + scrollY + 6 : tpTop}px;
      left: ${Math.max(4, tpLeft)}px;
      z-index: 99996;
      display:flex;
    `;
  }

  private hideOverlays(): void {
    if (this.highlightEl) this.highlightEl.style.display = 'none';
    if (this.tooltipEl) this.tooltipEl.style.display = 'none';
  }

  private flashConfirm(el: HTMLElement): void {
    el.classList.add('mf-inspect-flash');
    setTimeout(() => el.classList.remove('mf-inspect-flash'), 400);
  }

  focusControl(varName: string): void {
    const safeId = varName.replace(/--/g, '');
    const ctrl = [
      document.getElementById(`mf-le-rng-${safeId}`),
      document.getElementById(`mf-le-col-${safeId}`),
      document.getElementById(`mf-le-sel-${safeId}`),
      document.getElementById(`mf-le-inp-${safeId}`),
      document.getElementById(`mf-le-fnt-${safeId}`),
    ].filter(Boolean)[0] as HTMLElement | undefined;

    if (!ctrl) return;
    ctrl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ctrl.classList.add('mf-le-control-pulse');
    setTimeout(() => ctrl.classList.remove('mf-le-control-pulse'), 1200);
    try { (ctrl as HTMLInputElement).focus(); } catch { /* ignore */ }
  }

  destroy(): void {
    this.deactivate();
    this.highlightEl?.remove();
    this.tooltipEl?.remove();
    this.highlightEl = null;
    this.tooltipEl = null;
  }
}
