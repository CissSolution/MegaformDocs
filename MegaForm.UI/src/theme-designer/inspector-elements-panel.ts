interface ElementStyleTarget {
  key: string;
  label: string;
  icon: string;
  selector: string;
  sampleSelector: string;
  hint?: string;
}

const ELEMENT_PANEL_BADGE = 'Elem 14-07';
const ELEMENT_PANEL_SYNC_BADGE = 'Map 14-07';

const TARGETS: Record<string, ElementStyleTarget> = {
  'text-input': {
    key: 'text-input',
    label: 'Text Input',
    icon: '✏️',
    selector: '.mf-field-group[data-type="Text"] .mf-input, .mf-field-group[data-type="Email"] .mf-input, .mf-field-group[data-type="Phone"] .mf-input, .mf-field-group[data-type="Url"] .mf-input, .mf-field-group[data-type="Number"] .mf-input',
    sampleSelector: '.mf-field-group[data-type="Text"] .mf-input, .mf-field-group[data-type="Email"] .mf-input, .mf-field-group[data-type="Phone"] .mf-input, .mf-field-group[data-type="Url"] .mf-input, .mf-field-group[data-type="Number"] .mf-input',
    hint: 'all text-like inputs',
  },
  'textarea': {
    key: 'textarea', label: 'Text Area', icon: '📝',
    selector: '.mf-field-group[data-type="Textarea"] .mf-textarea',
    sampleSelector: '.mf-field-group[data-type="Textarea"] .mf-textarea',
  },
  'select': {
    key: 'select', label: 'Select/Dropdown', icon: '▾',
    selector: '.mf-field-group[data-type="Select"] .mf-select',
    sampleSelector: '.mf-field-group[data-type="Select"] .mf-select',
  },
  'date': {
    key: 'date', label: 'Date Picker', icon: '📅',
    selector: '.mf-field-group[data-type="Date"] .mf-input',
    sampleSelector: '.mf-field-group[data-type="Date"] .mf-input',
  },
  'file': {
    key: 'file', label: 'File Upload', icon: '📎',
    selector: '.mf-field-group[data-type="File"] .mf-file-dropzone',
    sampleSelector: '.mf-field-group[data-type="File"] .mf-file-dropzone',
  },
  'checkbox': {
    key: 'checkbox', label: 'Checkbox', icon: '☑️',
    selector: '.mf-field-group[data-type="Checkbox"] .mf-option-item',
    sampleSelector: '.mf-field-group[data-type="Checkbox"] .mf-option-item',
  },
  'radio': {
    key: 'radio', label: 'Radio Button', icon: '🔘',
    selector: '.mf-field-group[data-type="Radio"] .mf-option-item',
    sampleSelector: '.mf-field-group[data-type="Radio"] .mf-option-item',
  },
  'toggle': {
    key: 'toggle', label: 'Toggle Switch', icon: '⏼',
    selector: '.mf-field-group[data-type="Checkbox"] .mf-option-item',
    sampleSelector: '.mf-field-group[data-type="Checkbox"] .mf-option-item',
    hint: 'toggle/checkbox style group',
  },
  'button-primary': {
    key: 'button-primary', label: 'Submit Button', icon: '🚀',
    selector: '.mf-btn-submit',
    sampleSelector: '.mf-btn-submit',
  },
  'button-secondary': {
    key: 'button-secondary', label: 'Secondary Button', icon: '↔️',
    selector: '.mf-btn-prev, .mf-btn-next, .mf-btn:not(.mf-btn-submit)',
    sampleSelector: '.mf-btn-prev, .mf-btn-next, .mf-btn:not(.mf-btn-submit)',
  },
  'section': {
    key: 'section', label: 'Section/Card', icon: '🗂️',
    selector: '.mfp-section, .mf-section-break, .mfp-card, .mf-html-block',
    sampleSelector: '.mfp-section, .mf-section-break, .mfp-card, .mf-html-block',
  },
  'heading': {
    key: 'heading', label: 'Heading', icon: '🔠',
    selector: '.mf-section-title, .mfp-form-title, .mfp-section-title, h1, h2, h3, h4, h5, h6',
    sampleSelector: '.mf-section-title, .mfp-form-title, .mfp-section-title, h1, h2, h3, h4, h5, h6',
  },
  'divider': {
    key: 'divider', label: 'Divider', icon: '➖',
    selector: 'hr, .aur-accent-bar, .mfp-accent-bar, .fr-accent-line, .aur-divider-line',
    sampleSelector: 'hr, .aur-accent-bar, .mfp-accent-bar, .fr-accent-line, .aur-divider-line',
  },
  'rating': {
    key: 'rating', label: 'Rating', icon: '⭐',
    selector: '.mf-field-group[data-type="Rating"] .mf-rating, .mf-field-group[data-type="Rating"] .mf-star',
    sampleSelector: '.mf-field-group[data-type="Rating"] .mf-rating, .mf-field-group[data-type="Rating"] .mf-star',
  },
  'signature': {
    key: 'signature', label: 'Signature', icon: '✍️',
    selector: '.mf-field-group[data-type="Signature"] canvas, .mf-field-group[data-type="Signature"]',
    sampleSelector: '.mf-field-group[data-type="Signature"] canvas, .mf-field-group[data-type="Signature"]',
  },
};

function setHeaderState(root: HTMLElement, title: string, subtitle: string): void {
  const titleEl = root.querySelector<HTMLElement>('.td-elem-title');
  const subtitleEl = root.querySelector<HTMLElement>('.td-elem-subtitle');
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
}

export class ThemeDesignerElementStylePanel {
  private readonly root: HTMLElement;
  private readonly getPreviewDocument: () => Document | null;
  private activeKey = '';

  constructor(options: { root: HTMLElement; getPreviewDocument: () => Document | null; }) {
    this.root = options.root;
    this.getPreviewDocument = options.getPreviewDocument;
  }

  bind(): void {
    this.root.querySelectorAll<HTMLElement>('.td-elem-item[data-elem]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = String(button.dataset.elem || '').trim();
        if (!key) return;
        this.activate(key);
      });
    });
  }

  private setActive(key: string): void {
    this.activeKey = key;
    this.root.querySelectorAll<HTMLElement>('.td-elem-item[data-elem]').forEach((button) => {
      button.classList.toggle('active', String(button.dataset.elem || '') === key);
    });
  }

  activate(key: string): void {
    const target = TARGETS[key];
    if (!target) return;
    this.setActive(key);
    const doc = this.getPreviewDocument();
    if (!doc) {
      setHeaderState(this.root, 'Form Elements', 'Preview not ready yet');
      return;
    }
    const sample = doc.querySelector(target.sampleSelector) as HTMLElement | null;
    const api = (window as any).__MFI;
    if (!sample || !api || typeof api.focusSharedSelector !== 'function') {
      setHeaderState(this.root, 'Form Elements', 'No matching control found in this form');
      return;
    }
    setHeaderState(this.root, `${target.label} • ${ELEMENT_PANEL_BADGE}`, `${ELEMENT_PANEL_SYNC_BADGE} • applies to all matching controls in this form`);
    api.focusSharedSelector({
      selector: target.selector,
      sampleElement: sample,
      label: target.label,
      icon: target.icon,
      hint: target.hint || 'all matching controls in this form',
      badge: `${ELEMENT_PANEL_BADGE}`,
    });
  }
}
