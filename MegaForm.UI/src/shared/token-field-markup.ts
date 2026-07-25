// ============================================================
// [ThumbRealism 2026-07-24] Real MegaForm field markup for template previews/thumbnails.
//
// A custom-shell template renders {{field:KEY}} slots into MegaForm's real field DOM at
// runtime, and its customCss styles that DOM by class: .mf-input, .mf-field-label,
// .mf-option-group/--chips/--cards, .mf-option-ui, .mf-option-check … The gallery preview
// and card thumbnail used to fill those slots with bespoke .tpl-token-* markup that the
// template's CSS never targets — so the fields showed as generic grey boxes and the card
// looked NOTHING like the real form.
//
// This emits the SAME class structure the renderer emits (src/renderer/inputs.ts), so the
// template's own customCss styles it and the preview looks real. It is preview-only: inputs
// are disabled, names are dropped, no interactivity. Kept in one shared file because the
// wizard gallery and the builder gallery both need it (and previously both had a divergent
// copy of the fake version).
// ============================================================

type AnyField = Record<string, any>;

/**
 * Sensible default styling for the real .mf-* markup, for isolated preview surfaces that do NOT
 * load the renderer's own stylesheet (the thumbnail <iframe srcdoc>, and the static preview
 * fallback). A premium template's customCss is layered AFTER this and wins; this only stops an
 * un-styled field from rendering as a raw browser input when the template doesn't style it.
 */
export const MF_PREVIEW_BASE_CSS =
  '.mf-field-group{margin:0 0 12px;}'
  + '.mf-field-label{display:block;margin:0 0 5px;font-size:12px;font-weight:600;color:#0f172a;line-height:1.35;}'
  + '.mf-required{color:#e11d48;}'
  + '.mf-input,.mf-textarea,.mf-select{width:100%;box-sizing:border-box;border:1px solid #dbe4f0;border-radius:10px;background:#fff;color:#334155;font:inherit;font-size:12px;padding:8px 11px;min-height:36px;}'
  + '.mf-textarea{min-height:64px;resize:none;}'
  + '.mf-select-wrap{position:relative;}'
  + '.mf-select{-webkit-appearance:none;appearance:none;padding-right:28px;}'
  + '.mf-select-chevron{position:absolute;right:12px;top:50%;width:8px;height:8px;border-right:2px solid #94a3b8;border-bottom:2px solid #94a3b8;transform:translateY(-70%) rotate(45deg);pointer-events:none;}'
  + '.mf-file-drop,.mf-payment-preview{display:flex;align-items:center;gap:8px;color:#64748b;}'
  + '.mf-rating-preview{display:flex;gap:5px;color:#f59e0b;font-size:15px;}'
  + '.mf-option-group{display:flex;flex-direction:column;gap:8px;}'
  + '.mf-option-group--chips{flex-direction:row;flex-wrap:wrap;}'
  + '.mf-option-group--cols{display:grid;gap:8px;}'
  + '.mf-option-group.mf-cols-2{grid-template-columns:repeat(2,minmax(0,1fr));}'
  + '.mf-option-group.mf-cols-3{grid-template-columns:repeat(3,minmax(0,1fr));}'
  + '.mf-option-item{display:flex;align-items:center;gap:8px;margin:0;cursor:default;}'
  + '.mf-option-control{margin:0;accent-color:#6366f1;}'
  + '.mf-option-ui{display:flex;align-items:center;gap:8px;}'
  + '.mf-option-item--chips .mf-option-control{position:absolute;opacity:0;width:0;height:0;}'
  + '.mf-option-item--chips .mf-option-ui{padding:6px 12px;border:1px solid #dbe4f0;border-radius:999px;background:#fff;font-size:11px;font-weight:600;color:#334155;}'
  + '.mf-option-item--cards{align-items:stretch;}'
  + '.mf-option-item--cards .mf-option-control{position:absolute;opacity:0;width:0;height:0;}'
  + '.mf-option-item--cards .mf-option-ui{flex:1;padding:11px 13px;border:1px solid #dbe4f0;border-radius:12px;background:#fff;}'
  + '.mf-option-icon{color:#6366f1;}'
  + '.mf-option-copy{display:flex;flex-direction:column;gap:2px;}'
  + '.mf-option-label{font-size:12px;font-weight:600;color:#0f172a;}'
  + '.mf-option-meta,.mf-option-desc{font-size:10px;color:#94a3b8;}'
  + '.mf-option-check{margin-left:auto;color:#6366f1;}'
  + '.mf-row{display:grid;gap:14px;}'
  + '.mf-col{min-width:0;}'
  + '.mf-field-error,.mf-field-help{display:none;}';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function optionProps(field: AnyField): AnyField {
  return { ...(field?.properties || {}), ...(field?.widgetProps || {}) };
}

function fieldLabel(field: AnyField): string {
  const p = optionProps(field);
  return String(field?.label ?? field?.title ?? p.label ?? field?.key ?? 'Field');
}

function fieldPlaceholder(field: AnyField): string {
  const p = optionProps(field);
  return String(field?.placeholder ?? p.placeholder ?? '');
}

// Mirrors renderer getOptionDisplay: chips / cards / default.
function optionDisplay(field: AnyField): 'chips' | 'cards' | 'default' {
  const p = optionProps(field);
  const raw = String(p.optionDisplay || p.choiceDisplay || p.optionVariant || '').toLowerCase().trim();
  if (raw === 'chip' || raw === 'chips' || raw === 'pill' || raw === 'pills' || raw === 'tags') return 'chips';
  if (raw === 'card' || raw === 'cards' || raw === 'rich-card' || raw === 'rich-cards' || raw === 'richcards') return 'cards';
  return 'default';
}

// Mirrors renderer getOptionGroupClass column logic.
function optionGroupClass(field: AnyField): string {
  const count = Array.isArray(field?.options) ? field.options.length : 0;
  const parsed = parseInt(String(field?.optionColumns || optionProps(field).optionColumns || ''), 10);
  const display = optionDisplay(field);
  const cols = parsed > 0 ? Math.min(Math.max(parsed, 1), 4) : (display === 'cards' ? 1 : (count >= 9 ? 3 : count >= 6 ? 2 : 1));
  const classes = ['mf-option-group'];
  if (display !== 'default') classes.push('mf-option-group--' + display);
  if (cols > 1) classes.push('mf-option-group--cols', 'mf-cols-' + cols);
  else if (parsed === 1) classes.push('mf-cols-1');
  return classes.join(' ');
}

// Trimmed port of renderer resolveOptionIconHtml — glyphs/entities/HTML pass through; a bare
// token becomes a FontAwesome glyph (FA is loaded site-wide, incl. inside the preview modal).
const ICON_ALIAS: Record<string, string> = {
  mail: 'envelope', phone: 'phone', user: 'user', users: 'users', home: 'home',
  briefcase: 'briefcase', wallet: 'wallet', compass: 'compass', heart: 'heart',
  sparkles: 'wand-magic-sparkles', zap: 'bolt', megaphone: 'bullhorn', gift: 'gift',
  cake: 'birthday-cake', utensils: 'utensils', wine: 'wine-glass-alt', mountain: 'mountain',
  waves: 'water', snowflake: 'snowflake', 'map-pin': 'map-marker-alt', mappin: 'map-marker-alt',
  'graduation-cap': 'graduation-cap', graduationcap: 'graduation-cap', 'calendar-days': 'calendar-alt',
  ticket: 'ticket-alt', building2: 'building', 'building-2': 'building',
  flower2: 'seedling', 'flower-2': 'seedling', 'party-popper': 'gift', partypopper: 'gift',
};
function optionIconHtml(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/[<&]/.test(s) || /[^\x00-\x7F]/.test(s)) return s; // glyph / entity / inline HTML
  let cls: string;
  if (/^(fa-(solid|regular|light|thin|brands|duotone|sharp)|fas|far|fal|fat|fab|fad)\b/.test(s)) cls = s;
  else if (/^fa-/.test(s)) cls = 'fa-solid ' + s;
  else {
    const key = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    cls = 'fa-solid fa-' + (ICON_ALIAS[key] || key);
  }
  return '<i class="' + esc(cls) + '" aria-hidden="true"></i>';
}

// Mirrors renderer renderOptionItem. `checked` shows the design's selected-state styling
// (many skins reveal .mf-option-check only on :checked / .is-checked).
function optionItem(inputType: 'radio' | 'checkbox', opt: AnyField, field: AnyField, checked: boolean): string {
  const display = optionDisplay(field);
  const labelSource = opt?.richHtml || opt?.labelHtml || opt?.html || opt?.label || opt?.value || '';
  const labelHtml = (/[<&]/.test(String(labelSource)) && (opt?.richHtml || opt?.labelHtml || opt?.html)) ? String(labelSource) : esc(labelSource);
  const description = opt?.description ?? opt?.desc ?? opt?.helpText ?? opt?.subLabel ?? '';
  const meta = opt?.meta ?? opt?.location ?? opt?.kicker ?? '';
  const icon = opt?.icon ?? opt?.iconHtml ?? '';
  const badge = opt?.badge ?? '';
  const classes = ['mf-option-item'];
  if (display !== 'default') classes.push('mf-option-item--' + display);
  if (checked) classes.push('is-checked');
  const iconHtml = icon ? '<span class="mf-option-icon" aria-hidden="true">' + optionIconHtml(icon) + '</span>' : '';
  const metaHtml = meta ? '<span class="mf-option-meta">' + esc(meta) + '</span>' : '';
  const descHtml = description ? '<span class="mf-option-desc">' + esc(description) + '</span>' : '';
  const badgeHtml = badge ? '<span class="mf-option-badge">' + esc(badge) + '</span>' : '';
  const checkHtml = display === 'cards' ? '<span class="mf-option-check" aria-hidden="true">&#10003;</span>' : '';
  return '<label class="' + classes.join(' ') + '">'
    + '<input class="mf-option-control" type="' + inputType + '"' + (checked ? ' checked' : '') + ' disabled>'
    + '<span class="mf-option-ui">' + iconHtml
    + '<span class="mf-option-copy"><span class="mf-option-label">' + labelHtml + '</span>' + metaHtml + descHtml + '</span>'
    + badgeHtml + checkHtml + '</span></label>';
}

function labelHtmlFor(field: AnyField): string {
  const req = field?.required ? ' <span class="mf-required">*</span>' : '';
  return '<label class="mf-field-label">' + esc(fieldLabel(field)) + req + '</label>';
}

function group(field: AnyField, inner: string): string {
  const type = String(field?.type || 'Text');
  return '<div class="mf-field-group" data-key="' + esc(field?.key || '') + '" data-type="' + esc(type) + '">' + inner + '</div>';
}

/**
 * Real MegaForm markup for one field, for use inside a template preview/thumbnail.
 * The `compact` flag only trims how many options are shown (thumbnails are tiny).
 */
export function buildRealFieldMarkup(field: AnyField, compact?: boolean): string {
  const type = String(field?.type || 'Text').toLowerCase();
  const ph = esc(fieldPlaceholder(field));
  const optLimit = compact ? 4 : 8;

  if (type === 'checkbox' || type === 'radio' || type === 'multiselect') {
    const inputType: 'radio' | 'checkbox' = type === 'radio' ? 'radio' : 'checkbox';
    const opts: AnyField[] = Array.isArray(field?.options) && field.options.length
      ? field.options.slice(0, optLimit)
      : [{ label: 'Option one' }, { label: 'Option two' }];
    const items = opts.map((o, i) => optionItem(inputType, o, field, i === 0)).join('');
    return group(field, labelHtmlFor(field) + '<div class="' + optionGroupClass(field) + '">' + items + '</div>');
  }

  if (type === 'select' || type === 'dropdown') {
    const opts: AnyField[] = Array.isArray(field?.options) ? field.options.slice(0, optLimit) : [];
    const optionsHtml = opts.map((o) => '<option>' + esc(o?.label ?? o?.value ?? 'Option') + '</option>').join('');
    const sel = '<div class="mf-select-wrap"><select class="mf-select" disabled><option>'
      + (ph || 'Select…') + '</option>' + optionsHtml + '</select><span class="mf-select-chevron" aria-hidden="true"></span></div>';
    return group(field, labelHtmlFor(field) + sel);
  }

  if (type === 'textarea') {
    return group(field, labelHtmlFor(field) + '<textarea class="mf-textarea" placeholder="' + ph + '" disabled></textarea>');
  }

  if (type === 'file' || type === 'upload') {
    return group(field, labelHtmlFor(field)
      + '<div class="mf-input mf-file-drop"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> <span>' + (ph || 'Upload a file') + '</span></div>');
  }

  if (type === 'payment' || type === 'paypal' || type === 'paynow' || type === 'stripe') {
    return group(field, labelHtmlFor(field)
      + '<div class="mf-input mf-payment-preview"><i class="fa-solid fa-credit-card" aria-hidden="true"></i> <span>' + (ph || 'Card details') + '</span></div>');
  }

  if (type === 'rating') {
    return group(field, labelHtmlFor(field)
      + '<div class="mf-rating mf-rating-preview">' + '<i class="fa-solid fa-star"></i>'.repeat(5) + '</div>');
  }

  // text, email, phone, number, date, time, url, password, and everything else → the standard input.
  const inputType = type === 'email' ? 'email' : type === 'number' ? 'number' : type === 'date' ? 'date' : type === 'time' ? 'time' : 'text';
  return group(field, labelHtmlFor(field) + '<input type="' + inputType + '" class="mf-input" placeholder="' + ph + '" disabled>');
}
