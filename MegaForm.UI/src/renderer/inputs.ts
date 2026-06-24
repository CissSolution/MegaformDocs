// ============================================================
// Input Rendering — generates HTML for each field type
// ============================================================

import type { FormField } from '@core/types';
import { displayText, esc, compositePartsFor, compositePartLabel, compositeCellStyle, scalarPresetBaseType } from './helpers';
import { renderCountryPickerControl } from './country-picker';
import { evaluateCondition } from './conditional';

export const RENDERER_SIGNATURE_SIZING_BADGE = 'RendererSignatureSizing v20260423-02';

type OptionDisplay = 'default' | 'chips' | 'cards';
type ChoiceOption = FormField['options'] extends Array<infer T> ? T & Record<string, any> : Record<string, any>;

function optionProps(field: FormField): Record<string, any> {
  return {
    ...(((field as any).properties || {}) as Record<string, any>),
    ...(((field as any).widgetProps || {}) as Record<string, any>),
    ...(field as any),
  };
}

function getOptionDisplay(field: FormField): OptionDisplay {
  const props = optionProps(field);
  const raw = String(props.optionDisplay || props.choiceDisplay || props.optionVariant || '').toLowerCase().trim();
  if (raw === 'chip' || raw === 'chips' || raw === 'pill' || raw === 'pills' || raw === 'tags') return 'chips';
  if (raw === 'card' || raw === 'cards' || raw === 'rich-card' || raw === 'rich-cards' || raw === 'richcards') return 'cards';
  return 'default';
}

function optionHtmlEnabled(field: FormField, opt?: ChoiceOption): boolean {
  const props = optionProps(field);
  return props.allowOptionHtml === true ||
    props.optionLabelMode === 'html' ||
    opt?.allowHtml === true ||
    !!(opt?.richHtml || opt?.labelHtml || opt?.html);
}

function sanitizeOptionHtml(html: string): string {
  if (typeof document === 'undefined') return esc(html);
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const allowedTags = new Set(['a','b','br','code','div','em','i','li','ol','p','small','span','strong','sub','sup','u','ul']);
  const globalAttrs = new Set(['class','title','aria-label']);
  const walk = (node: Node): void => {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.parentNode?.removeChild(child);
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (!allowedTags.has(tag)) {
        const text = document.createTextNode(el.textContent || '');
        el.parentNode?.replaceChild(text, el);
        return;
      }
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = attr.value || '';
        const allowed = globalAttrs.has(name) || (tag === 'a' && ['href','target','rel'].includes(name));
        if (!allowed || name.startsWith('on') || name === 'style' || /^\s*javascript:/i.test(value)) {
          el.removeAttribute(attr.name);
        }
      });
      if (tag === 'a') {
        el.setAttribute('rel', 'noopener noreferrer');
        if (!el.getAttribute('target')) el.setAttribute('target', '_blank');
      }
      walk(el);
    });
  };
  walk(template.content);
  return template.innerHTML;
}

function renderOptionPart(field: FormField, opt: ChoiceOption, value: unknown, htmlCapable = false): string {
  const text = String(value ?? '');
  if (!text) return '';
  return htmlCapable && optionHtmlEnabled(field, opt) ? sanitizeOptionHtml(text) : esc(displayText(text));
}

function getOptionGroupClass(field: FormField): string {
  const count = Array.isArray(field.options) ? field.options.length : 0;
  const parsed = parseInt(String((field as any).optionColumns || ''), 10);
  const display = getOptionDisplay(field);
  const cols = parsed > 0 ? Math.min(Math.max(parsed, 1), 4) : (display === 'cards' ? 1 : (count >= 9 ? 3 : count >= 6 ? 2 : 1));
  const classes = ['mf-option-group'];
  if (display !== 'default') classes.push(`mf-option-group--${display}`);
  if (cols > 1) classes.push('mf-option-group--cols', `mf-cols-${cols}`);
  else if (parsed === 1) classes.push('mf-cols-1');
  return classes.join(' ');
}

// [SignaturePlaceholder v20260502-07] Inject a single <style> tag that hides
// the placeholder once the wrapper drops its .mf-signature-empty class
// (interactive.ts toggles it on first stroke / restores on Clear).
function ensureSignaturePlaceholderCss(): void {
  const ID = 'mf-signature-placeholder-css';
  if (typeof document === 'undefined' || document.getElementById(ID)) return;
  const style = document.createElement('style');
  style.id = ID;
  style.textContent =
    '.mf-signature-field:not(.mf-signature-empty) .mf-signature-placeholder{opacity:0;visibility:hidden;}' +
    '@media print{.mf-signature-placeholder{display:none!important;}}';
  document.head.appendChild(style);
}

function getSignatureCanvasHeight(field: FormField): number {
  const candidates = [
    (field.widgetProps as any)?.height,
    (field.properties as any)?.height,
  ];

  for (const candidate of candidates) {
    const parsed = parseInt(String(candidate ?? ''), 10);
    if (Number.isFinite(parsed) && parsed >= 80 && parsed <= 240) return parsed;
  }

  return 120;
}

function renderOptionItem(inputType: 'radio' | 'checkbox', name: string, opt: ChoiceOption, checked: boolean, field: FormField): string {
  const display = getOptionDisplay(field);
  const value = String(opt.value ?? opt.label ?? '');
  const labelSource = opt.richHtml || opt.labelHtml || opt.html || opt.label || opt.value || '';
  const labelHtml = renderOptionPart(field, opt, labelSource, true);
  const description = opt.description ?? opt.desc ?? opt.helpText ?? opt.subLabel ?? '';
  const meta = opt.meta ?? opt.location ?? opt.kicker ?? '';
  const icon = opt.icon ?? opt.iconHtml ?? '';
  const badge = opt.badge ?? '';
  const classes = ['mf-option-item'];
  if (display !== 'default') classes.push(`mf-option-item--${display}`);
  if (checked) classes.push('is-checked');
  if (optionHtmlEnabled(field, opt)) classes.push('mf-option-item--html');
  const iconHtml = icon ? `<span class="mf-option-icon" aria-hidden="true">${renderOptionPart(field, opt, icon, true)}</span>` : '';
  const metaHtml = meta ? `<span class="mf-option-meta">${renderOptionPart(field, opt, meta, true)}</span>` : '';
  const descHtml = description ? `<span class="mf-option-desc">${renderOptionPart(field, opt, description, true)}</span>` : '';
  const badgeHtml = badge ? `<span class="mf-option-badge">${renderOptionPart(field, opt, badge, false)}</span>` : '';
  const checkHtml = display === 'cards' ? '<span class="mf-option-check" aria-hidden="true">&#10003;</span>' : '';
  return `<label class="${classes.join(' ')}">` +
    `<input class="mf-option-control" type="${inputType}" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}>` +
    `<span class="mf-option-ui">${iconHtml}<span class="mf-option-copy"><span class="mf-option-label">${labelHtml}</span>${metaHtml}${descHtml}</span>${badgeHtml}${checkHtml}</span>` +
    `</label>`;
}

function getRatingStyle(field: FormField): 'star' | 'emoji' | 'heart' | 'thumbs' {
  const raw = String((field.widgetProps as any)?.ratingStyle || (field.properties as any)?.ratingStyle || (field as any).ratingStyle || 'star').toLowerCase();
  if (raw === 'emoji' || raw === 'heart' || raw === 'thumbs') return raw;
  return 'star';
}

function renderRatingInput(field: FormField, id: string, name: string, val: string, ro: string): string {
  const style = getRatingStyle(field);
  const current = style === 'thumbs' ? val : String(parseInt(val, 10) || 0);
  const disabled = ro ? ' aria-disabled="true"' : '';
  const common = `class="mf-rating mf-rating--${style}" id="${id}-rating" data-name="${esc(name)}" data-value="${esc(current)}" data-style="${style}"${disabled}`;
  let h = `<div ${common}>`;

  if (style === 'emoji') {
    const items = [
      { value: '1', label: 'Very dissatisfied', icon: '&#9785;' },
      { value: '2', label: 'Dissatisfied', icon: '&#9785;' },
      { value: '3', label: 'Neutral', icon: '&#9786;' },
      { value: '4', label: 'Satisfied', icon: '&#9786;' },
      { value: '5', label: 'Very satisfied', icon: '&#9786;' },
    ];
    h += `<div class="mf-rating-items" role="radiogroup" aria-label="${esc(field.label || 'Rating')}">`;
    items.forEach(item => {
      const active = current === item.value ? ' is-active' : '';
      h += `<button type="button" class="mf-rating-item${active}" data-val="${item.value}" aria-label="${esc(item.label)}">${item.icon}</button>`;
    });
    h += `</div>`;
  } else if (style === 'heart') {
    h += `<div class="mf-rating-items" role="radiogroup" aria-label="${esc(field.label || 'Rating')}">`;
    for (let i = 1; i <= 5; i++) {
      const active = i <= parseInt(current, 10) ? ' is-active' : '';
      h += `<button type="button" class="mf-rating-item${active}" data-val="${i}" aria-label="${i} of 5 hearts"><span class="mf-rating-on">&#9829;</span><span class="mf-rating-off">&#9825;</span></button>`;
    }
    h += `</div>`;
  } else if (style === 'thumbs') {
    h += `<div class="mf-rating-items" role="radiogroup" aria-label="${esc(field.label || 'Helpful rating')}">`;
    h += `<button type="button" class="mf-rating-item${current === 'up' ? ' is-active' : ''}" data-val="up" aria-label="Thumbs up">&#128077;</button>`;
    h += `<button type="button" class="mf-rating-item${current === 'down' ? ' is-active' : ''}" data-val="down" aria-label="Thumbs down">&#128078;</button>`;
    h += `</div>`;
  } else {
    h += `<div class="mf-rating-items" role="radiogroup" aria-label="${esc(field.label || 'Rating')}">`;
    for (let i = 1; i <= 5; i++) {
      const active = i <= parseInt(current, 10) ? ' is-active' : '';
      h += `<button type="button" class="mf-rating-item mf-star${active}" data-val="${i}" aria-label="${i} of 5 stars"><span class="mf-rating-on">&#9733;</span><span class="mf-rating-off">&#9734;</span></button>`;
    }
    h += `</div>`;
  }

  h += `<input type="hidden" name="${esc(name)}" value="${esc(current === '0' ? '' : current)}">`;
  h += `<div class="mf-rating-value">${style === 'thumbs' ? (current ? esc(current) : '') : (parseInt(current, 10) > 0 ? `${esc(current)} out of 5` : '')}</div>`;
  return h + '</div>';
}

function renderSegmentedDatePicker(field: FormField, id: string, name: string, val: string, ph: string, ro: string): string {
  const props = { ...((field as any).properties || {}), ...((field as any).widgetProps || {}) } as Record<string, any>;
  const rawMode = String(props.datePickerMode || props.mode || 'date-only').toLowerCase();
  const mode = rawMode === 'date-time' || rawMode === 'datetime'
    ? 'date-time'
    : rawMode === 'month-year' || rawMode === 'monthyear'
      ? 'month-year'
      : 'date-only';
  const timeFormat = String(props.timeFormat || '24h').toLowerCase() === '12h' ? '12h' : '24h';
  const minuteStep = Math.max(1, Math.min(30, parseInt(String(props.minuteStep || 1), 10) || 1));
  const placeholder = ph || (mode === 'date-time' ? 'Select date & time...' : mode === 'month-year' ? 'Select month...' : 'Select date...');
  const disabled = ro ? 'true' : 'false';
  const labels = {
    apply: props.applyText || props.applyLabel || 'Apply',
    clear: props.clearText || props.clearLabel || 'Clear',
    today: props.todayText || props.todayLabel || 'Today',
    day: props.dayText || 'Day',
    month: props.monthText || 'Month',
    year: props.yearText || 'Year',
    hour: props.hourText || 'Hour',
    minute: props.minuteText || 'Minute',
    ampm: props.ampmText || 'AM/PM',
  };

  return `<div class="mf-date-input-wrap mf-dtp" id="${id}-dtp"` +
    ` data-mf-dtp="1" data-mode="${esc(mode)}" data-time-format="${esc(timeFormat)}"` +
    ` data-minute-step="${minuteStep}" data-value="${esc(val)}" data-placeholder="${esc(placeholder)}"` +
    ` data-disabled="${disabled}" data-readonly="${disabled}"` +
    ` data-label-apply="${esc(labels.apply)}" data-label-clear="${esc(labels.clear)}" data-label-today="${esc(labels.today)}"` +
    ` data-label-day="${esc(labels.day)}" data-label-month="${esc(labels.month)}" data-label-year="${esc(labels.year)}"` +
    ` data-label-hour="${esc(labels.hour)}" data-label-minute="${esc(labels.minute)}" data-label-ampm="${esc(labels.ampm)}">` +
      `<input type="hidden" class="mf-dtp-hidden" id="${id}" name="${esc(name)}" value="${esc(val)}">` +
      `<button type="button" class="mf-dtp-trigger mf-input" aria-haspopup="listbox" aria-expanded="false"${ro ? ' disabled' : ''}>` +
        `<span class="mf-date-icon mf-date-icon-left" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg></span>` +
        `<span class="mf-dtp-value">${esc(placeholder)}</span>` +
        `<span class="mf-dtp-chevron" aria-hidden="true"></span>` +
      `</button>` +
      `<div class="mf-dtp-panel" role="listbox" aria-label="${esc(field.label || 'Date picker')}"></div>` +
    `</div>`;
}

function renderCalendarDatePicker(field: FormField, id: string, name: string, val: string, ph: string, ro: string): string {
  const props = { ...((field as any).properties || {}), ...((field as any).widgetProps || {}) } as Record<string, any>;
  const rawMode = String(props.datePickerMode || props.mode || 'date-only').toLowerCase();
  const mode = rawMode === 'date-time' || rawMode === 'datetime'
    ? 'date-time'
    : rawMode === 'month-year' || rawMode === 'monthyear'
      ? 'month-year'
      : 'date-only';
  const placeholder = ph || (mode === 'date-time' ? 'Select date & time...' : mode === 'month-year' ? 'Select month...' : 'Select date...');
  const disabled = ro ? 'true' : 'false';
  const labels = {
    apply: props.applyText || props.applyLabel || 'Apply',
    clear: props.clearText || props.clearLabel || 'Clear',
    today: props.todayText || props.todayLabel || 'Today',
    previous: props.previousMonthText || 'Previous month',
    next: props.nextMonthText || 'Next month',
    time: props.timeText || 'Time:',
    weekdays: props.weekdayLabels || 'SU,MO,TU,WE,TH,FR,SA',
    months: props.monthLabels || 'January,February,March,April,May,June,July,August,September,October,November,December',
  };

  return `<div class="mf-date-input-wrap mf-cal" id="${id}-cal"` +
    ` data-mf-cal="1" data-mode="${esc(mode)}" data-value="${esc(val)}" data-placeholder="${esc(placeholder)}"` +
    ` data-disabled="${disabled}" data-readonly="${disabled}"` +
    ` data-label-apply="${esc(labels.apply)}" data-label-clear="${esc(labels.clear)}" data-label-today="${esc(labels.today)}"` +
    ` data-label-prev="${esc(labels.previous)}" data-label-next="${esc(labels.next)}" data-label-time="${esc(labels.time)}"` +
    ` data-weekdays="${esc(labels.weekdays)}" data-months="${esc(labels.months)}">` +
      `<input type="hidden" class="mf-cal-hidden" id="${id}" name="${esc(name)}" value="${esc(val)}">` +
      `<button type="button" class="mf-cal-trigger mf-input" aria-haspopup="dialog" aria-expanded="false"${ro ? ' disabled' : ''}>` +
        `<span class="mf-cal-value">${esc(placeholder)}</span>` +
        `<span class="mf-date-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg></span>` +
      `</button>` +
      `<div class="mf-cal-panel" role="dialog" aria-label="${esc(field.label || 'Calendar date picker')}"></div>` +
    `</div>`;
}

function getSelectVariant(field: FormField): 'native' | 'multi-select' | 'multi-column' {
  const props = { ...((field as any).properties || {}), ...((field as any).widgetProps || {}) } as Record<string, any>;
  const raw = String(props.selectVariant || props.variant || '').toLowerCase();
  if (raw === 'multiselect' || raw === 'multi-select' || raw === 'tags' || raw === 'chips') return 'multi-select';
  if (raw === 'multicolumn' || raw === 'multi-column' || raw === 'combobox' || raw === 'multi-column-combobox') return 'multi-column';
  return 'native';
}

function csvValues(val: string): string[] {
  const raw = String(val || '').trim();
  if (!raw) return [];
  if (raw.charAt(0) === '[') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(v => String(v));
    } catch (_e) { /* keep csv fallback */ }
  }
  return raw.split(',').map(v => v.trim()).filter(Boolean);
}

function optionJson(field: FormField): string {
  return esc(encodeURIComponent(JSON.stringify((field.options || []).map(opt => ({
    value: String(opt.value ?? ''),
    label: displayText(opt.label ?? opt.value ?? ''),
  })))));
}

function jsonDataAttr(value: unknown): string {
  return esc(encodeURIComponent(JSON.stringify(value)));
}

function renderMultiSelect(field: FormField, id: string, name: string, val: string, ph: string, ro: string, req: string): string {
  const props = { ...((field as any).properties || {}), ...((field as any).widgetProps || {}) } as Record<string, any>;
  const selected = csvValues(val);
  const maxTags = Math.max(0, parseInt(String(props.maxTags || props.maxSelections || 0), 10) || 0);
  // [B46 IssueFix 5a] Renderer reads field.placeholder (passed in as `ph`) AND
  // widgetProps.placeholder so Builder edits via either path land correctly.
  // English "Select options..." is the last-resort fallback when both empty.
  const placeholder = ph || props.placeholder || 'Select options...';
  return `<div class="mf-ms" id="${id}-ms" data-mf-ms="1" data-options="${optionJson(field)}"` +
    ` data-placeholder="${esc(placeholder)}" data-search-placeholder="${esc(props.searchPlaceholder || 'Search...')}"` +
    ` data-no-options="${esc(props.noOptionsText || 'All options selected')}" data-no-match="${esc(props.noMatchText || 'No options match')}"` +
    ` data-max-tags="${maxTags}" data-searchable="${props.searchable === false ? 'false' : 'true'}" data-clearable="${props.clearable === false ? 'false' : 'true'}"` +
    ` data-readonly="${ro ? 'true' : 'false'}" data-disabled="${ro ? 'true' : 'false'}">` +
      `<input type="hidden" class="mf-ms-hidden" id="${id}" name="${esc(name)}" value="${esc(selected.join(','))}"${req}>` +
      `<button type="button" class="mf-ms-trigger" aria-haspopup="listbox" aria-expanded="false"${ro ? ' disabled' : ''}>` +
        `<span class="mf-ms-tags"></span>` +
        `<span class="mf-ms-actions"><span class="mf-ms-clear" aria-hidden="true">&times;</span><span class="mf-ms-chevron" aria-hidden="true"></span></span>` +
      `</button>` +
      `<div class="mf-ms-panel" role="listbox" aria-label="${esc(field.label || 'Multi select')}"></div>` +
    `</div>`;
}

function parseColumns(raw: any): Array<{ key: string; label: string; width?: string }> {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(c => ({ key: String(c.key || ''), label: String(c.label || c.key || ''), width: c.width ? String(c.width) : undefined })).filter(c => c.key);
  const text = String(raw || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parseColumns(parsed);
  } catch (_e) { /* csv fallback */ }
  return text.split(',').map(part => {
    const bits = part.split(':').map(s => s.trim());
    return { key: bits[0], label: bits[1] || bits[0], width: bits[2] };
  }).filter(c => c.key);
}

function renderMultiColumnCombo(field: FormField, id: string, name: string, val: string, ph: string, ro: string, req: string): string {
  const props = { ...((field as any).properties || {}), ...((field as any).widgetProps || {}) } as Record<string, any>;
  const columns = parseColumns(props.columns || props.multiColumnColumns);
  if (!columns.length) columns.push({ key: 'label', label: 'Name', width: '50%' }, { key: 'value', label: 'Value', width: '50%' });
  // [B46 IssueFix 5a] Honour widgetProps.placeholder when field.placeholder empty.
  const placeholder = ph || props.placeholder || 'Select an option...';
  const opts = (field.options || []).map(opt => {
    const anyOpt = opt as any;
    const row: Record<string, string> = {
      id: String(opt.value ?? ''),
      value: String(opt.value ?? ''),
      label: displayText(opt.label ?? opt.value ?? ''),
    };
    columns.forEach(col => {
      row[col.key] = displayText(anyOpt[col.key] ?? (col.key === 'label' ? opt.label : col.key === 'value' || col.key === 'id' ? opt.value : ''));
    });
    return row;
  });
  return `<div class="mf-mccb" id="${id}-mccb" data-mf-mccb="1"` +
    ` data-options="${jsonDataAttr(opts)}" data-columns="${jsonDataAttr(columns)}"` +
    ` data-placeholder="${esc(placeholder)}" data-search-placeholder="${esc(props.searchPlaceholder || 'Search...')}"` +
    ` data-display-key="${esc(props.displayKey || columns[0].key || 'label')}" data-no-options="${esc(props.noOptionsText || 'No options available')}"` +
    ` data-no-match="${esc(props.noMatchText || 'No options match')}" data-searchable="${props.searchable === false ? 'false' : 'true'}"` +
    ` data-readonly="${ro ? 'true' : 'false'}" data-disabled="${ro ? 'true' : 'false'}">` +
      `<input type="hidden" class="mf-mccb-hidden" id="${id}" name="${esc(name)}" value="${esc(val)}"${req}>` +
      `<button type="button" class="mf-mccb-trigger" aria-haspopup="listbox" aria-expanded="false"${ro ? ' disabled' : ''}>` +
        `<span class="mf-mccb-value">${esc(placeholder)}</span>` +
        `<span class="mf-mccb-actions"><span class="mf-mccb-clear" aria-hidden="true">&times;</span><span class="mf-mccb-chevron" aria-hidden="true"></span></span>` +
      `</button>` +
      `<div class="mf-mccb-panel" role="listbox" aria-label="${esc(field.label || 'Multi column dropdown')}"></div>` +
    `</div>`;
}


/** Render the input HTML for a field */
export function renderInput(field: FormField, formId: number, formData: Record<string, unknown>): string {
  const id = `mf-${formId}-${field.key}`;
  const name = field.key;
  const val = String(formData[field.key] ?? field.defaultValue ?? '');
  const ph = field.placeholder || '';
  const ro = field.readOnly ? ' readonly disabled' : '';
  const req = field.required ? ' required' : '';

  // [B46] Field-level height prop → inline style on the input. Accepts bare numbers
  // ("38" → "38px"), explicit units ("38px", "3rem"), or empty/undefined → no style.
  // Reading both `field.height` (canonical field-level prop) and
  // `field.widgetProps.height` / `field.properties.height` (legacy widget shapes)
  // so AI-generated forms and older drafts keep working.
  const heightAttr = (() => {
    const raw =
      (field as any).height ||
      (field as any).widgetProps?.height ||
      (field as any).properties?.height ||
      '';
    if (!raw) return '';
    const s = String(raw).trim();
    if (!s) return '';
    const norm = /^\d+(\.\d+)?$/.test(s) ? `${s}px` : s;
    return ` style="height:${esc(norm)};min-height:${esc(norm)};"`;
  })();

  switch (field.type) {
    case 'Text':
    case 'Phone':
    case 'Url': {
      const inputType = field.type === 'Phone' ? 'tel' : field.type === 'Url' ? 'url' : 'text';
      return `<input type="${inputType}" class="mf-input" id="${id}" name="${name}" value="${esc(val)}" placeholder="${esc(ph)}"${ro}${req}${heightAttr}>`;
    }
    case 'Email':
      return `<input type="email" class="mf-input" id="${id}" name="${name}" value="${esc(val)}" placeholder="${esc(ph)}"${ro}${req}${heightAttr}>`;

    case 'Number': {
      const v = field.validation || {};
      const minA = (v as any).min != null ? ` min="${(v as any).min}"` : '';
      const maxA = (v as any).max != null ? ` max="${(v as any).max}"` : '';
      return `<input type="number" class="mf-input" id="${id}" name="${name}" value="${esc(val)}" placeholder="${esc(ph)}"${minA}${maxA}${ro}${req}${heightAttr}>`;
    }
    case 'Date': {
      // [DatePickerFix v20260601-B15] Wrap is now click-to-open: clicking the
      // calendar icon OR anywhere on the visible row calls input.showPicker().
      // The native ::-webkit-calendar-picker-indicator was hidden, so without
      // this handler the only way to open the picker was to type a date.
      // The `lang` attribute hints the browser at the wanted locale display
      // format (vi → dd/mm/yyyy). Real configurable formats live behind a
      // separate Date2 widget — this fix is the minimum-viable UX repair.
      const props = { ...((field as any).properties || {}), ...((field as any).widgetProps || {}) } as Record<string, any>;
      // [v20260610-DatePickerOnlyCalendar] Segmented dropdown columns removed.
      // Only Calendar grid remains — matches the single canonical UX pattern.
      return renderCalendarDatePicker(field, id, name, val, ph, ro);
    }

    case 'Textarea': {
      // [B46] Textarea uses `rows` (line count) + optional explicit `height`.
      // If `rows` provided, emit rows="N"; if `height` provided, use it as the
      // sole min-height (overrides the default 100px floor in megaform.css).
      const rowsRaw =
        (field as any).rows ??
        (field as any).widgetProps?.rows ??
        (field as any).properties?.rows;
      const rowsNum = rowsRaw != null && rowsRaw !== '' ? parseInt(String(rowsRaw), 10) : NaN;
      const rowsAttr = !isNaN(rowsNum) && rowsNum > 0 ? ` rows="${rowsNum}"` : '';
      return `<textarea class="mf-textarea" id="${id}" name="${name}" placeholder="${esc(ph)}"${ro}${req}${rowsAttr}${heightAttr}>${esc(val)}</textarea>`;
    }

    case 'Select': {
      const variant = getSelectVariant(field);
      if (variant === 'multi-select') return renderMultiSelect(field, id, name, val, ph, ro, req);
      if (variant === 'multi-column') return renderMultiColumnCombo(field, id, name, val, ph, ro, req);
      // [B46 IssueFix 5a] Honour widgetProps.placeholder when field.placeholder
      // is empty so the Builder can override the "Select..." copy via either path.
      const selectProps = { ...((field as any).properties || {}), ...((field as any).widgetProps || {}) } as Record<string, any>;
      const selectPlaceholder = ph || selectProps.placeholder || 'Select...';
      let h = `<div class="mf-select-wrap"><select class="mf-select" id="${id}" name="${name}"${ro}${req}${heightAttr}>`;
      h += `<option value="">${esc(selectPlaceholder)}</option>`;
      (field.options || []).forEach(opt => {
        const sel = val === opt.value ? ' selected' : '';
        h += `<option value="${esc(opt.value)}"${sel}>${esc(displayText(opt.label))}</option>`;
      });
      return h + `</select><span class="mf-select-chevron" aria-hidden="true"></span></div>`;
    }
    case 'MultiSelect':
      return renderMultiSelect(field, id, name, val, ph, ro, req);
    case 'Radio': {
      let h = `<div class="${getOptionGroupClass(field)}">`;
      (field.options || []).forEach(opt => {
        h += renderOptionItem('radio', name, opt, val === opt.value, field);
      });
      return h + '</div>';
    }
    case 'Checkbox': {
      const selectedVals = Array.isArray(val) ? val : (val ? val.split(',') : []);
      let h = `<div class="${getOptionGroupClass(field)}">`;
      (field.options || []).forEach(opt => {
        h += renderOptionItem('checkbox', name, opt, selectedVals.includes(opt.value), field);
      });
      return h + '</div>';
    }
    case 'File': {
      const fs = field.fileSettings || {};
      const accept = fs.allowedExtensions?.join(',') || '';
      const multi = (fs.maxFiles ?? 1) > 1 ? ' multiple' : '';
      return `<div class="mf-file-dropzone" id="${id}-zone">` +
        `<div class="mf-file-dropzone-inner">` +
        `<div class="mf-file-icon"><svg viewBox="0 0 24 24"><path d="M12 3v12M17 8l-5-5-5 5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg></div>` +
        `<div class="mf-file-text">Drop files here or click to upload</div>` +
        `<div class="mf-file-hint">${esc(accept ? `${accept} up to ${fs.maxSizeMB || 10}MB` : `Up to ${fs.maxSizeMB || 10}MB`)}</div>` +
        `</div>` +
        `<input type="file" name="${name}" id="${id}" style="display:none;"${accept ? ` accept="${accept}"` : ''}${multi}>` +
        `<div class="mf-file-list" id="${id}-list"></div></div>`;
    }
    case 'Rating': {
      return renderRatingInput(field, id, name, val, ro);
    }
    case 'Signature': {
      // [SignaturePlaceholder v20260502-07] Pen-icon + "Sign here" hint shown
      // until user starts drawing. Renderer's BUILT-IN signature (this branch)
      // is what public form view actually shows on Oqtane/Web/DNN — the
      // widget plugin (mfw-sig-*) only registers in builder mode. Without
      // this placeholder the empty canvas gives no affordance for what to do.
      // Wrapper has position:relative inline so the absolutely-positioned
      // placeholder overlays the canvas. interactive.ts toggles
      // .mf-signature-empty on the wrapper. Inject one-time CSS rule that
      // hides .mf-signature-placeholder when the wrapper has no .mf-signature-empty
      // class (i.e. user has drawn something).
      ensureSignaturePlaceholderCss();
      const signatureHeight = getSignatureCanvasHeight(field);
      const sigProps = (field.widgetProps || field.properties || {}) as any;
      const clearText = sigProps.clearText || 'Clear';
      const undoText = sigProps.undoText || 'Undo';
      const placeholderText = sigProps.placeholderText || 'Sign here';
      return `<div class="mf-signature-field mf-signature-empty" data-mf-signature-badge="${RENDERER_SIGNATURE_SIZING_BADGE}">` +
        `<div class="mf-signature-canvas-wrap">` +
        `<canvas id="${id}-canvas" class="mf-signature-canvas" width="400" height="${signatureHeight}"></canvas>` +
        `<div class="mf-signature-placeholder" aria-hidden="true">` +
          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15.7 21.3a1 1 0 0 1-1.4 0l-1.6-1.6a1 1 0 0 1 0-1.4l5.6-5.6a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4z"/><path d="m18 13-1.4-6.9a1 1 0 0 0-.7-.8L3.2 2a1 1 0 0 0-1.2 1.2l3.4 12.7a1 1 0 0 0 .8.7L13 18"/><path d="m2.3 2.3 7.3 7.3"/><circle cx="11" cy="11" r="2"/></svg>` +
          `<span>${esc(placeholderText)}</span>` +
        `</div>` +
        `</div>` +
        `<div class="mf-signature-actions"><button type="button" class="mf-sig-clear" data-canvas="${id}-canvas"><span aria-hidden="true">&#9003;</span> ${esc(clearText)}</button><button type="button" class="mf-sig-undo" disabled><span aria-hidden="true">&#8630;</span> ${esc(undoText)}</button></div>` +
        `<input type="hidden" name="${name}" id="${id}"></div>`;
    }

    case 'UniqueId': {
      // [B36] UniqueId is server-generated on submit — it must NOT show as a
      // form input at all. Renders ONLY a hidden input on the form; the value
      // surfaces in the submission detail / inbox after submit.
      // Opt-in: set widgetProps.showPreview=true to keep the old placeholder.
      const showPrev = !!(field.widgetProps as any)?.showPreview;
      if (val) {
        return showPrev
          ? `<div class="mf-uid-display" style="font-family:monospace;font-size:15px;font-weight:600;color:#6366f1;padding:8px 12px;background:#f5f3ff;border:1px solid #e0e7ff;border-radius:6px;">${esc(val)}</div>` +
            `<input type="hidden" name="${name}" id="${id}" value="${esc(val)}">`
          : `<input type="hidden" name="${name}" id="${id}" value="${esc(val)}">`;
      }
      if (!showPrev) {
        return `<input type="hidden" name="${name}" id="${id}" value="">`;
      }
      const prefix = (field.widgetProps as any)?.prefix || '';
      const padding = (field.widgetProps as any)?.padding || 5;
      const preview = prefix + '0'.repeat(padding).slice(0, -1) + '1';
      return `<div class="mf-uid-preview" style="font-family:monospace;font-size:13px;color:#94a3b8;padding:8px 12px;background:#f8fafc;border:1px dashed #d1d5db;border-radius:6px;">` +
        `<i class="fas fa-fingerprint" style="margin-right:6px;"></i>Auto-generated on submit: <span style="color:#6366f1;">${esc(preview)}…</span></div>` +
        `<input type="hidden" name="${name}" id="${id}" value="">`;
    }
    case 'Composite': {
      // [Composite v1] One business field → several sub-inputs → ONE stored value.
      const cParts = compositePartsFor(field);
      const cPreset = (field as any).widgetProps?.preset || (field as any).preset || '';
      if (!cParts.length) {
        // No parts/preset configured → graceful fallback to a single text input.
        return `<input type="text" class="mf-input" id="${id}" name="${name}" value="${esc(val)}" placeholder="${esc(ph)}"${ro}${req}>`;
      }
      // [Composite a11y] WAI-ARIA composite-widget: the group is ONE tab stop and
      // arrow keys rove between parts (wired in interactive.ts). nav='roving' (default)
      // emits the roving tabindex (first part tabbable, rest -1); nav='tab' opts out
      // and leaves every part a natural tab stop (legacy behavior).
      const cNav = (field as any).widgetProps?.nav || 'roving';
      // Address is a multi-row grid → default to 2-axis arrow nav ('both'); single-row
      // composites (phone/name) default to horizontal ← →.
      const cOrient = (field as any).widgetProps?.orient || (cPreset === 'address' ? 'both' : 'horizontal');
      // [B268] Sub-label position: 'bottom' (default, hint below the box) | 'top' (label above the
      // box) | 'hidden' (placeholder only). Authorable in the Composite (Input) Designer.
      const cLabelPos = String((field as any).widgetProps?.labelPos || 'bottom');
      // [Composite v1.2] Template-based layout: a part with `hidden` is omitted; parts
      // are grouped into `.mf-composite-row` by their `row` index (default 0 = single
      // row). The roving tabindex is keyed on the GLOBAL visible-part index (gi).
      const visibleParts = cParts.filter((p: any) => !p.hidden);
      // [Composite v1.3] Each part lives in a `.mf-composite-cell` (column flex) that
      // carries the width sizing + an optional sub-label below — so the input itself is
      // always full-width inside its cell. data-mf-part stays on the input/select so the
      // keyboard/combine controller in interactive.ts is unaffected.
      const cellStyle = (p: any) => compositeCellStyle(p);
      const inputTypeAttr = (t: string): string => {
        switch (t) {
          case 'email': return 'email';
          case 'number': return 'number';
          case 'tel': case 'phone': return 'tel';
          case 'date': return 'date';
          case 'password': return 'password';
          case 'url': return 'url';
          default: return 'text';
        }
      };
      // [Unify v2 2026-06-18] For a single-part SCALAR preset (text/email/number/url/…) the
      // lone part IS the stored value, so seed it with `val` — otherwise a prefilled / edited
      // scalar composite would show an EMPTY box while the hidden held the saved value.
      const cIsScalarSingle = !!scalarPresetBaseType(cPreset) && cParts.length === 1;
      const renderPart = (p: any, gi: number): string => {
        const pv = cIsScalarSingle
          ? String(val == null ? '' : val)
          : ((p.def != null && !val) ? String(p.def) : '');
        const al = compositePartLabel(p);                              // per-part accessible name
        const tabIdx = cNav === 'roving' ? ` tabindex="${gi === 0 ? '0' : '-1'}"` : '';
        const reqAttr = p.required ? ' aria-required="true" data-mf-required="1"' : '';
        const partStyle = 'width:100%;min-width:0;';
        let control: string;
        // [Composite v1.4] Country part → reuse the rich flag dropdown (was Phone Pro).
        // The picker emits a <button data-mf-part> carrying the dial code as its value,
        // so bindComposites() reads/combines it exactly like any other part.
        if (p.type === 'country') {
          control = renderCountryPickerControl({
            // [Composite v3 2026-06-19] Phone stores the dial code (+1); Address stores
            // the ISO-2 code (US/GB). The part opts into iso2 via valueMode:'iso2'.
            value: pv || p.def || '',
            valueMode: (p as any).valueMode === 'iso2' ? 'iso2' : 'dial',
            // [B268] Compact flag-only trigger for phone (dial mode) — hide the redundant "+1" chip;
            // the dial code is still the stored value + shown in the open list. Address (iso2) keeps
            // its country-code chip. Per-part override via p.showCode.
            showCode: (p as any).showCode || ((p as any).valueMode === 'iso2' ? 'iso2' : 'none'),
            partKey: p.key,
            ariaLabel: al,
            tabIndex: cNav === 'roving' ? (gi === 0 ? 0 : -1) : null,
            required: !!p.required,
            readonly: !!ro,
            searchPlaceholder: p.placeholder || undefined,
            allowed: Array.isArray((p as any).allowed) ? (p as any).allowed : undefined,
          });
        }
        // [Composite v1.1] Dropdown part (e.g. phone dial-code, address State/Country).
        // data-mf-part is on the <select> so bindComposites() reads its .value identically.
        else if (p.type === 'select') {
          const opts = Array.isArray(p.options) ? p.options : [];
          const optHtml = opts.map((o: any) => {
            const ov = String(o && o.value != null ? o.value : o);
            const ol = o && o.label != null ? String(o.label) : ov;
            return `<option value="${esc(ov)}"${ov === pv ? ' selected' : ''}>${esc(ol)}</option>`;
          }).join('');
          control = `<select class="mf-input mf-composite-part" data-mf-part="${esc(p.key)}" aria-label="${esc(al)}"${tabIdx}${reqAttr}${ro} style="${partStyle}">${optHtml}</select>`;
        } else if (p.type === 'textarea') {
          control = `<textarea class="mf-input mf-composite-part" data-mf-part="${esc(p.key)}" aria-label="${esc(al)}"${tabIdx}${reqAttr} placeholder="${esc(p.placeholder || p.label || '')}"${ro} rows="${esc(String((p as any).rows || 2))}" style="${partStyle}">${esc(pv)}</textarea>`;
        } else {
          const ml = p.maxLength ? ` maxlength="${p.maxLength}"` : '';
          // [Composite v1.4] mask → data-mf-mask (bindMasks formats it); inputmode hint;
          // numeric VALUE bounds become min/max attrs on a number input.
          const maskAttr = p.mask ? ` data-mf-mask="${esc(String(p.mask))}"` : '';
          const imAttr = p.inputMode ? ` inputmode="${esc(String(p.inputMode))}"` : (p.mask ? ' inputmode="numeric"' : '');
          const numAttr = (p.type === 'number')
            ? `${p.min != null ? ` min="${esc(String(p.min))}"` : ''}${p.max != null ? ` max="${esc(String(p.max))}"` : ''}`
            : '';
          control = `<input type="${inputTypeAttr(p.type || 'text')}" class="mf-input mf-composite-part" data-mf-part="${esc(p.key)}" aria-label="${esc(al)}"${tabIdx}${reqAttr} placeholder="${esc(p.placeholder || p.label || '')}" value="${esc(pv)}"${ml}${maskAttr}${imAttr}${numAttr}${ro} style="${partStyle}">`;
        }
        // Sub-label (Gravity-style hint). Positioned per cLabelPos: 'top' (above), 'bottom' (default,
        // below) or 'hidden'. A required part appends a red *.
        const subTxt = (p.sublabel != null && String(p.sublabel) !== '') ? String(p.sublabel) : '';
        const subHtml = (cLabelPos !== 'hidden' && (subTxt || p.required))
          ? `<small class="mf-composite-sub mf-composite-sub--${cLabelPos === 'top' ? 'top' : 'bottom'}">${esc(subTxt)}${p.required ? ' <span class="mf-composite-req" aria-hidden="true">*</span>' : ''}</small>`
          : '';
        // [v20260616] Literal separator OUTSIDE the box (e.g. DOB "DD / MMMM / YYYY").
        const sepHtml = p.sep
          ? `<span class="mf-composite-sep" aria-hidden="true" style="align-self:flex-start;display:flex;align-items:center;height:38px;padding:0 2px;color:#64748b;font-weight:700;">${esc(String(p.sep))}</span>`
          : '';
        const cellInner = cLabelPos === 'top' ? `${subHtml}${control}` : `${control}${subHtml}`;
        return `<div class="mf-composite-cell" style="${cellStyle(p)}">${cellInner}</div>${sepHtml}`;
      };
      let gi = 0;
      const rowOrder: number[] = [];
      const rowMap: Record<number, string[]> = {};
      visibleParts.forEach((p: any) => {
        const r = (p.row == null ? 0 : p.row);
        if (rowMap[r] == null) { rowMap[r] = []; rowOrder.push(r); }
        rowMap[r].push(renderPart(p, gi));
        gi++;
      });
      const rowsHtml = rowOrder.map((r) => `<div class="mf-composite-row" style="display:flex;gap:8px;align-items:stretch;">${rowMap[r].join('')}</div>`).join('');
      return `<div class="mf-composite" role="group" aria-label="${esc(field.label || name)}" data-key="${esc(name)}" data-preset="${esc(cPreset)}" data-mf-nav="${esc(cNav)}" data-mf-orient="${esc(cOrient)}" style="display:flex;flex-direction:column;gap:8px;">${rowsHtml}</div>` +
        `<input type="hidden" name="${name}" id="${id}" value="${esc(val)}">`;
    }
    default: {
      // Check if MegaFormWidgets can handle this type
      const W = (window as any).MegaFormWidgets;
      if (W?.widgetTypes?.[field.type]) {
        return W.renderWidget(field, formId, val);
      }
      return `<input type="text" class="mf-input" id="${id}" name="${name}" value="${esc(val)}" placeholder="${esc(ph)}"${ro}${req}>`;
    }
  }
}

/** Render a single field as a complete DOM element (label + input + help + error) */
export function renderSingleFieldElement(field: FormField, formId: number, formData: Record<string, unknown>): HTMLElement {
  if (field.type === 'Hidden') {
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = field.key;
    hidden.value = String(field.defaultValue || formData[field.key] || '');
    return hidden;
  }
  // [B36] UniqueId without showPreview behaves like Hidden — no label, no
  // chrome, just an empty hidden input that the server-side submit handler
  // fills with the generated value before persisting.
  if (field.type === 'UniqueId' && !((field.widgetProps as any)?.showPreview)) {
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = field.key;
    hidden.value = String(formData[field.key] || '');
    return hidden;
  }

  const group = document.createElement('div');
  group.className = 'mf-field-group';
  group.setAttribute('data-key', field.key);
  group.setAttribute('data-type', field.type);

  if (field.showIf) {
    group.setAttribute('data-show-if', JSON.stringify(field.showIf));
    if (!evaluateCondition(field.showIf as any)) group.style.display = 'none';
  }

  let html = '';
  if (field.type === 'Section') {
    if (field.properties?.pageBreak) {
      html += `<div class="mf-page-anchor" data-mf-page-break-key="${esc(field.key || '')}" hidden></div>`;
    } else {
      html += `<div class="mf-section-break"><div class="mf-section-title">${esc(field.label)}</div></div>`;
    }
    group.innerHTML = html;
    return group;
  }
  if (field.type === 'Html') {
    html += `<div class="mf-html-block">${field.htmlContent || ''}</div>`;
    group.innerHTML = html;
    return group;
  }

  const W = (window as any).MegaFormWidgets;
  const isWidgetSelfLabeled = W?.widgetTypes?.[field.type]
    && field.type !== 'Rating'
    && field.type !== 'Signature'
    && field.type !== 'Appointment';

  if (!isWidgetSelfLabeled) {
    html += `<label class="mf-field-label" for="mf-${formId}-${field.key}">`;
    html += esc(field.label);
    if (field.required) html += ' <span class="mf-required">*</span>';
    html += '</label>';
  }
  html += renderInput(field, formId, formData);
  if (!isWidgetSelfLabeled && field.helpText) html += `<div class="mf-field-help">${esc(field.helpText)}</div>`;
  html += `<div class="mf-field-error" id="mf-err-${field.key}"></div>`;

  group.innerHTML = html;
  return group;
}

/** Render a Row field as a CSS grid with column children */
export function renderRowElement(field: FormField, formId: number, formData: Record<string, unknown>): HTMLElement {
  const rowDiv = document.createElement('div');
  rowDiv.className = 'mf-row';
  rowDiv.style.display = 'grid';
  rowDiv.style.gap = 'var(--mf-field-gap, 20px)';
  rowDiv.style.gridTemplateColumns = (field.columns || []).map(c => `${c.span}fr`).join(' ');
  rowDiv.style.marginBottom = 'var(--mf-field-gap, 20px)';

  (field.columns || []).forEach(col => {
    const colDiv = document.createElement('div');
    colDiv.className = 'mf-row-column';
    (col.fields || []).forEach(cf => {
      colDiv.appendChild(renderSingleFieldElement(cf, formId, formData));
    });
    rowDiv.appendChild(colDiv);
  });

  if (field.showIf) {
    rowDiv.setAttribute('data-show-if', JSON.stringify(field.showIf));
    if (!evaluateCondition(field.showIf as any)) rowDiv.style.display = 'none';
  }

  return rowDiv;
}

// ============================================================
// [FlexGrid P1 v20260601-B16] Render a FlexGrid field — a 12-column
// CSS Grid with per-item placement (x/y/w/h) for 3 breakpoints
// (sm / md / lg). Items are real form fields (Text / Email / Select / etc.),
// rendered via renderSingleFieldElement. Schema:
//
//   {
//     "key": "grid_main",
//     "type": "FlexGrid",
//     "gridConfig": { "cols": 12, "rowHeight": 64, "gap": 12 },
//     "items": [
//       { "id": "i1", "field": { ... full field config ... },
//         "placement": { "lg": {"x":0,"y":0,"w":6,"h":1},
//                        "md": {"x":0,"y":0,"w":12,"h":1},
//                        "sm": {"x":0,"y":0,"w":12,"h":1} } },
//       ...
//     ]
//   }
//
// Each item's CSS vars (--lg-x, --lg-w, --md-x, --md-w, --sm-x, --sm-w …)
// are read by media-queried CSS in megaform.css. Legacy Row fields stay
// unaffected — this is a parallel codepath.
// ============================================================

interface FlexGridPlacement { x: number; y: number; w: number; h: number; }
interface FlexGridItem {
  id?: string;
  field?: FormField;     // full nested field config (rendered inline)
  placement?: { lg?: FlexGridPlacement; md?: FlexGridPlacement; sm?: FlexGridPlacement };
}
interface FlexGridConfig { cols?: number; rowHeight?: number; gap?: number; }

function _clamp(v: any, min: number, max: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function renderFlexGridElement(field: FormField, formId: number, formData: Record<string, unknown>): HTMLElement {
  const root = document.createElement('div');
  root.className = 'mf-flexgrid';
  root.setAttribute('data-mf-grid-key', String(field.key || ''));

  const cfg = ((field as any).gridConfig || {}) as FlexGridConfig;
  const cols = _clamp(cfg.cols, 1, 24, 12);
  const rowHeight = _clamp(cfg.rowHeight, 20, 400, 64);
  const gap = _clamp(cfg.gap, 0, 64, 12);

  root.style.setProperty('--mf-grid-cols', String(cols));
  root.style.setProperty('--mf-grid-rh', rowHeight + 'px');
  root.style.setProperty('--mf-grid-gap', gap + 'px');

  const items = Array.isArray((field as any).items) ? ((field as any).items as FlexGridItem[]) : [];
  items.forEach((it, idx) => {
    if (!it || !it.field) return;

    // Resolve placement per breakpoint with sensible fallbacks:
    //   lg defaults to full-width 1-row
    //   md defaults to lg
    //   sm defaults to full-width 1-row (always stack on mobile)
    const lg = it.placement?.lg || { x: 0, y: idx, w: cols, h: 1 };
    const md = it.placement?.md || lg;
    const sm = it.placement?.sm || { x: 0, y: idx, w: cols, h: 1 };

    const cell = document.createElement('div');
    cell.className = 'mf-flexgrid-item';
    cell.setAttribute('data-mf-grid-id', String(it.id || ('item-' + idx)));
    // 1-based for CSS grid-column / grid-row
    cell.style.setProperty('--lg-x', String(_clamp(lg.x, 0, cols - 1, 0) + 1));
    cell.style.setProperty('--lg-y', String(_clamp(lg.y, 0, 999, 0) + 1));
    cell.style.setProperty('--lg-w', String(_clamp(lg.w, 1, cols, cols)));
    cell.style.setProperty('--lg-h', String(_clamp(lg.h, 1, 12, 1)));
    cell.style.setProperty('--md-x', String(_clamp(md.x, 0, cols - 1, 0) + 1));
    cell.style.setProperty('--md-y', String(_clamp(md.y, 0, 999, 0) + 1));
    cell.style.setProperty('--md-w', String(_clamp(md.w, 1, cols, cols)));
    cell.style.setProperty('--md-h', String(_clamp(md.h, 1, 12, 1)));
    cell.style.setProperty('--sm-x', String(_clamp(sm.x, 0, cols - 1, 0) + 1));
    cell.style.setProperty('--sm-y', String(_clamp(sm.y, 0, 999, 0) + 1));
    cell.style.setProperty('--sm-w', String(_clamp(sm.w, 1, cols, cols)));
    cell.style.setProperty('--sm-h', String(_clamp(sm.h, 1, 12, 1)));

    // Nested FlexGrid: recurse
    if (it.field.type === 'FlexGrid') {
      cell.appendChild(renderFlexGridElement(it.field, formId, formData));
    } else {
      cell.appendChild(renderSingleFieldElement(it.field, formId, formData));
    }
    root.appendChild(cell);
  });

  if (field.showIf) {
    root.setAttribute('data-show-if', JSON.stringify(field.showIf));
    if (!evaluateCondition(field.showIf as any)) root.style.display = 'none';
  }
  return root;
}
