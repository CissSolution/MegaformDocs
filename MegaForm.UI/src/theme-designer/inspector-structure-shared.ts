export const TD_STRUCTURE_TREE_BADGE = 'TDStructureTree v20260414-04';
export const TD_INSPECT_TREE_SYNC_BADGE = 'TDInspectTreeSync v20260414-04';
export const TD_INSPECT_CSS_RULES_BADGE = 'TDInspectCssRules v20260414-04';
export const MFI_SELECTION_EVENT = 'mfi:selection';

export interface MfiSelectionDetail {
  nodeId: string;
  templatePath?: string;
  selector: string;
  label: string;
  isLive: boolean;
  tagName: string;
  className: string;
}

const PRIORITY_CLASSES = [
  'mf-form-wrapper',
  'mfp',
  'mfp-container',
  'mfp-card',
  'mfp-card-header',
  'mfp-card-body',
  'mfp-section',
  'mfp-section-title',
  'mfp-body',
  'mf-fields-container',
  'mf-row',
  'mf-field-group',
  'mf-field-label',
  'mf-input',
  'mf-select',
  'mf-textarea',
  'mf-form-actions',
  'mf-btn',
  'mf-btn-submit',
  'mf-btn-prev',
  'mf-btn-next',
];

const STRUCTURE_CLASSES = new Set(PRIORITY_CLASSES.concat([
  'mfp-page','mf-form','mf-form-inner','mf-form-title','mf-form-description',
  'mf-section-break','mf-section-title','mf-html-block','mf-field-help',
  'mf-field-sublabel','mf-option-item','mf-option-group','mf-progress-bar',
  'mf-success-message','mf-error-message','mf-ref-number','mfp-actions',
  'mfp-hero','mfp-hero-overlay'
]));

export function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getStructureClass(el: Element | null): string {
  if (!el || !(el instanceof HTMLElement)) return '';
  for (const className of PRIORITY_CLASSES) {
    if (el.classList.contains(className)) return className;
  }
  for (const className of Array.from(el.classList)) {
    if (STRUCTURE_CLASSES.has(className)) return className;
  }
  return el.classList[0] || '';
}

export function isStructureCandidate(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tagName = el.tagName.toLowerCase();
  if (['script', 'style', 'link', 'meta', 'head'].includes(tagName)) return false;
  if (el.id === 'mf-mount') return false;
  if (getStructureClass(el)) return true;
  return ['form', 'section', 'header', 'footer', 'label', 'button'].includes(tagName);
}

export function getStructureLabel(el: Element | null): string {
  if (!el || !(el instanceof HTMLElement)) return 'node';
  const tagName = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const classes = Array.from(el.classList || []).filter(Boolean).slice(0, 2).map((className) => `.${className}`).join('');
  return `${tagName}${id}${classes}` || tagName;
}

export function getNodeLookupSelector(nodeId: string): string {
  const safe = String(nodeId || '').replace(/"/g, '\\"');
  return `[data-mfi-node-id="${safe}"]`;
}
