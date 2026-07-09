// ============================================================
// Renderer Types & Helpers
// ============================================================

import type { FormField } from '@core/types';
import { addressPartsForScheme, combineAddress, type AddressScheme } from './composite-address';

export interface RendererConfig {
  formId: number;
  /** Mount point: CSS selector string (e.g. '#mf-form-mount') or HTMLElement.
   *  renderer.buildSkeleton() injects all required DOM into this element.
   *  If the skeleton already exists (DNN pre-builds it), buildSkeleton() is a no-op. */
  container?: string | HTMLElement;
  apiBaseUrl: string;
  /** Legacy alias — some callers pass apiBase instead of apiBaseUrl */
  apiBase?: string;
  schema: {
    fields: FormField[];
    settings?: Record<string, unknown>;
    Fields?: FormField[];
    Settings?: Record<string, unknown>;
  } | null;
  theme?: Record<string, unknown> | null;
  honeypotField?: string;
  loadTimestamp?: number;
  enableSaveResume?: boolean;
  enableCaptcha?: boolean;
  isPreview?: boolean;
  resumeToken?: string;
  prefilledData?: Record<string, unknown> | null;
  title?: string;
  description?: string;
  submitButtonText?: string;
  successMessage?: string;
  rules?: unknown[];
}

export interface ShowIfConditionRule {
  sourceType?: 'Field' | 'Role' | 'Permission' | 'Query' | 'User' | 'field' | 'role' | 'permission' | 'query' | 'user';
  key?: string;
  field?: string;
  fieldKey?: string;
  condition?: string;
  operator?: string;
  value?: string;
}

export interface ShowIfRule {
  operator: 'And' | 'Or';
  conditions: ShowIfConditionRule[];
  rules?: ShowIfConditionRule[];
}

/** HTML-escape a string */
export function esc(s: string | undefined | null): string {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

const cp1252Reverse: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84,
  0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

function mojibakeScore(value: string): number {
  return (value.match(/[ÃÂÄÅÆÐÑ]/g) || []).length + (value.match(/[€�‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g) || []).length;
}

/** Best-effort display repair for UTF-8 text decoded as Windows-1252. */
export function displayText(value: string | undefined | null): string {
  const raw = String(value ?? '');
  if (!raw || !/[ÃÂÄÅÆÐÑ€�‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/.test(raw)) return raw;
  try {
    const bytes: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      const code = raw.charCodeAt(i);
      if (code <= 0xff) bytes.push(code);
      else if (cp1252Reverse[code]) bytes.push(cp1252Reverse[code]);
      else return raw;
    }
    const repaired = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    return mojibakeScore(repaired) < mojibakeScore(raw) ? repaired : raw;
  } catch {
    return raw;
  }
}

/** Flatten all fields including those nested inside Row columns */
export function flattenFields(fields: FormField[]): FormField[] {
  const result: FormField[] = [];
  (fields || []).forEach(f => {
    if (f.type === 'Row' && f.columns) {
      result.push(f);
      f.columns.forEach(col => {
        (col.fields || []).forEach(cf => result.push(cf));
      });
    } else {
      result.push(f);
    }
  });
  return result;
}

/** Normalize PascalCase → camelCase for a single field */
export function normalizeField(f: any): void {
  f.key = f.key || f.Key;
  f.type = f.type || f.Type;
  f.label = f.label || f.Label;
  f.required = f.required || f.Required;
  f.placeholder = f.placeholder || f.Placeholder || '';
  f.helpText = f.helpText || f.HelpText || '';
  f.defaultValue = f.defaultValue || f.DefaultValue || '';
  f.options = f.options || f.Options || [];
  f.validation = f.validation || f.Validation || {};
  f.width = f.width || f.Width || '100%';
  f.htmlContent = f.htmlContent || f.HtmlContent || '';
  f.fileSettings = f.fileSettings || f.FileSettings || null;
  f.showIf = f.showIf || f.ShowIf || null;
  f.widgetProps = f.widgetProps || f.WidgetProps || null;
  if (f.widgetProps && typeof f.widgetProps === 'object') {
    const widgetPlaceholder = (f.widgetProps as any).placeholder;
    if ((!widgetPlaceholder && f.placeholder) || widgetPlaceholder === '') {
      (f.widgetProps as any).placeholder = f.placeholder || '';
    }
    if ((!f.placeholder || f.placeholder === '') && widgetPlaceholder) {
      f.placeholder = String(widgetPlaceholder);
    }
  }
  f.prefillParam = f.prefillParam || f.PrefillParam || '';
  f.properties = f.properties || f.Properties || null;

  if (f.type === 'Row') {
    var rawColumns: any = f.columns != null ? f.columns : f.Columns;
    if (Array.isArray(rawColumns)) {
      f.columns = rawColumns;
    } else {
      var count = parseInt(String(rawColumns == null ? '' : rawColumns), 10);
      if (!Number.isFinite(count) || count <= 0) count = 1;
      count = Math.min(Math.max(count, 1), 4);
      var flatFields = Array.isArray(f.fields || f.Fields) ? (f.fields || f.Fields) : [];
      var normalizedFlat = flatFields.slice();
      var chunkSize = Math.max(1, Math.ceil((normalizedFlat.length || 1) / count));
      var columns: any[] = [];
      for (var ci = 0; ci < count; ci++) {
        var start = ci * chunkSize;
        var end = ci === count - 1 ? normalizedFlat.length : Math.min(normalizedFlat.length, start + chunkSize);
        var span = ci === count - 1 ? (12 - ((count - 1) * Math.floor(12 / count))) : Math.floor(12 / count);
        if (span <= 0) span = 6;
        columns.push({ span: span, fields: normalizedFlat.slice(start, end) });
      }
      f.columns = columns;
    }
    f.columns.forEach((col: any) => {
      col.span = col.span || col.Span || 6;
      col.fields = col.fields || col.Fields || [];
      normalizeFields(col.fields);
    });
    delete f.fields;
    delete f.Fields;
  }
}

/** Normalize a list of fields recursively */
export function normalizeFields(fields: any[]): void {
  if (!fields) return;
  fields.forEach(normalizeField);
}

/** Normalize entire schema */
export function normalizeSchema(config: RendererConfig): void {
  if (!config.schema) return;
  const s = config.schema as any;
  if (s.Fields && !s.fields) s.fields = s.Fields;
  if (s.Settings && !s.settings) s.settings = s.Settings;
  if (s.settings) {
    s.settings.customHtml = s.settings.customHtml || s.settings.CustomHtml || '';
    s.settings.customCss = s.settings.customCss || s.settings.CustomCss || '';
    s.settings.customContent = s.settings.customContent || s.settings.CustomContent || {};
    if (!s.settings.customContent || typeof s.settings.customContent !== 'object') s.settings.customContent = {};
  }
  // [ContentRootMerge v20260501-04] Some authored templates put content keys at
  // the schema root under "content" (or "Content") instead of nesting them under
  // settings.customContent. Merge them so {{content:xxx}} resolution works
  // regardless of authoring style. settings.customContent wins on conflict.
  const rootContent = (s.content || s.Content || null) as Record<string, unknown> | null;
  if (rootContent && typeof rootContent === 'object') {
    if (!s.settings) s.settings = {};
    if (!s.settings.customContent || typeof s.settings.customContent !== 'object') s.settings.customContent = {};
    for (const k in rootContent) {
      if (Object.prototype.hasOwnProperty.call(rootContent, k) && s.settings.customContent[k] === undefined) {
        s.settings.customContent[k] = rootContent[k];
      }
    }
  }
  if (s.fields) normalizeFields(s.fields);

  // [HtmlFieldTokens v20260501-04] Pre-substitute {{form:title|description|submit}}
  // and {{content:xxx}} tokens inside Html field htmlContent so templates that
  // render Html fields outside of customHtml shell still resolve their tokens.
  // Affects standard render path AND templates that use {{field:gallery_html}}
  // with content tokens inside the Html field.
  substituteHtmlFieldTokens(config);
}

// ═══ COMPOSITE CONTROLS [v1 2026-06-14] — ADDITIVE, non-breaking ════════════
// One business field → several sub-inputs → stored as ONE value. Core "Composite"
// type + presets (phone/name/address). Parts carry data-mf-part (NOT name); only a
// hidden input has name=key, so getFieldValue/collectFormData/validateForm read it
// through the EXISTING default path — zero changes to collect/validate/submit.
// [Composite v1.1] `type:'select'` + `options` lets a part render a dropdown
// (e.g. phone country dial-code) instead of a free-text input. Omitted → text.
// [Composite v1.2] `row` groups parts into layout rows (renderer breaks them into
// .mf-composite-row); `hidden` lets a template hide an optional sub-input (e.g. Apt,
// Country) without deleting it. Both optional → phone/name stay a single row.
// [Composite v1.3 2026-06-15] Parts gained a full admin-configurable shape to match
// the WPForms/Gravity-style designer: `sublabel` (small hint under the input, e.g.
// "First"), per-part validation (`required`/`minLength`/`maxLength`/`pattern`/`patternMsg`)
// enforced client-side in validateForm(), and a broader `type` union (email/tel/number/
// date/textarea/password/url) so a sub-input can be more than text|select. All optional
// and additive — untouched presets keep rendering exactly as before.
export type CompositePartType = 'text' | 'select' | 'email' | 'tel' | 'number' | 'date' | 'textarea' | 'password' | 'url' | 'country';
export interface CompositePart {
  key: string;
  placeholder?: string;
  label?: string;       // accessible name (screen-reader) + designer label
  sublabel?: string;    // small muted hint rendered UNDER the sub-input (Gravity-style)
  width?: string;       // raw px/% OR a fraction token: 1/6 1/4 1/3 1/2 2/3 3/4 full
  flex?: number;
  maxLength?: number;
  minLength?: number;
  def?: string;
  type?: CompositePartType;
  options?: Array<{ value: string; label?: string }>;
  row?: number;
  hidden?: boolean;
  required?: boolean;   // per-part required (separate from the whole-field required)
  pattern?: string;     // regex source string, validated client-side
  patternMsg?: string;  // custom message shown when the pattern fails
  // [Composite v1.4] input mask + numeric value bounds + cross-part match.
  mask?: string;        // mask pattern: #=digit A=letter *=alnum, anything else literal (e.g. ###-##-####)
  inputMode?: string;   // inputmode attr hint (e.g. 'numeric')
  min?: number;         // numeric VALUE lower bound (type:'number'); != minLength (char count)
  max?: number;         // numeric VALUE upper bound (type:'number')
  matchKey?: string;    // this part must equal the value of the sibling part with this key (confirm email/password)
  matchMsg?: string;    // custom message when the match fails
  allowed?: string[];   // country part: restrict the selectable iso2 list (empty → all)
  dateAge?: boolean;    // for DOB: validate minAge/maxAge against the full date (uses siblings day/month/year)
  minAge?: number;      // minimum age in years (DOB)
  maxAge?: number;      // maximum age in years (DOB)
  sep?: string;         // [v20260616] literal separator rendered AFTER this part's cell, OUTSIDE
                        //   the box (e.g. DOB day/month → "/" → "DD / MMMM / YYYY"; time hour → ":").
}

// Fraction tokens → flex-basis percentage. Lets the designer offer friendly column
// widths (25% / 33% / 50% …) that map onto the existing flex-row layout. A fraction
// part sizes to its share and does NOT grow past it (mock parity — leftover row space
// stays empty), while flex/auto parts still grow to fill.
export const COMPOSITE_WIDTH_FRACTIONS: Record<string, number> = {
  '1/6': 16.6667, '1/5': 20, '1/4': 25, '1/3': 33.3333, '2/5': 40,
  '1/2': 50, '3/5': 60, '2/3': 66.6667, '3/4': 75, '4/5': 80, 'full': 100, '1/1': 100,
};
export function compositeCellStyle(p: CompositePart): string {
  if (p && p.flex) return `flex:${p.flex} 1 0;min-width:0;`;
  const w = p && p.width ? String(p.width).trim() : '';
  if (w) {
    if (Object.prototype.hasOwnProperty.call(COMPOSITE_WIDTH_FRACTIONS, w)) {
      const pct = COMPOSITE_WIDTH_FRACTIONS[w];
      return `flex:0 1 calc(${pct}% - 6px);min-width:0;`;
    }
    // raw css length (px/%/rem/em) → fixed basis, mirrors the original preset behavior
    return `flex:0 0 ${w};width:${w};min-width:0;`;
  }
  return 'flex:1 1 0;min-width:0;';
}

// Common international dial codes for the phone composite's country dropdown.
export const COMPOSITE_DIAL_CODES: Array<{ value: string; label?: string }> = [
  { value: '+1', label: '+1 (US/CA)' }, { value: '+44', label: '+44 (UK)' },
  { value: '+61', label: '+61 (AU)' }, { value: '+33', label: '+33 (FR)' },
  { value: '+49', label: '+49 (DE)' }, { value: '+34', label: '+34 (ES)' },
  { value: '+39', label: '+39 (IT)' }, { value: '+84', label: '+84 (VN)' },
  { value: '+81', label: '+81 (JP)' }, { value: '+82', label: '+82 (KR)' },
  { value: '+86', label: '+86 (CN)' }, { value: '+91', label: '+91 (IN)' },
  { value: '+65', label: '+65 (SG)' }, { value: '+971', label: '+971 (AE)' },
  { value: '+966', label: '+966 (SA)' }, { value: '+55', label: '+55 (BR)' },
];

export const COMPOSITE_PRESETS: Record<string, { parts: CompositePart[]; combine: (v: Record<string, string>) => string }> = {
  phone: {
    parts: [
      // [Composite v1.4] Country part now renders the rich flag dropdown (reused from
      // the retired Phone Pro widget) instead of a plain `+1 (US/CA)` <select>. Stores
      // the dial code as its value so combine() is unchanged.
      { key: 'country', width: '116px', def: '+1', type: 'country' },
      { key: 'area', placeholder: 'Area', width: '74px', maxLength: 4 },
      { key: 'number', placeholder: 'Phone number', flex: 1, type: 'tel' },
      { key: 'ext', placeholder: 'Ext', width: '74px' },
    ],
    combine: (v) => { let s = [v.country, v.area, v.number].filter(Boolean).join(' '); if (v.ext) s += ' ext ' + v.ext; return s.trim(); },
  },
  name: {
    parts: [
      { key: 'first', placeholder: 'First name', flex: 1 },
      { key: 'last', placeholder: 'Last name', flex: 1 },
    ],
    combine: (v) => [v.first, v.last].filter(Boolean).join(' '),
  },
  address: {
    // Default parts (US scheme) — the real layout is resolved per-scheme in
    // compositePartsFor(); this entry exists so COMPOSITE_PRESETS.address.combine is
    // found by bindComposites() (keyed by data-preset="address").
    parts: addressPartsForScheme('us'),
    combine: combineAddress,
  },
  // [Composite v1.4] US Social Security Number — single masked field (###-##-####).
  // Showcases the shared mask engine; combine is the masked value as-is.
  ssn: {
    parts: [
      { key: 'ssn', type: 'tel', mask: '###-##-####', placeholder: '___-__-____', label: 'Social Security Number', maxLength: 11, inputMode: 'numeric', pattern: '^\\d{3}-\\d{2}-\\d{4}$', patternMsg: 'Enter a valid 9-digit SSN' },
    ],
    combine: (v) => v.ssn || '',
  },
  // [Composite v1.4] Full name — prefix, first, middle, last, suffix.
  name_plus: {
    parts: [
      { key: 'prefix', label: 'Prefix', sublabel: 'Prefix', placeholder: 'Mr / Ms / Dr', width: '90px', type: 'select', options: [{ value: '', label: 'Prefix' }, { value: 'Mr', label: 'Mr' }, { value: 'Mrs', label: 'Mrs' }, { value: 'Ms', label: 'Ms' }, { value: 'Dr', label: 'Dr' }, { value: 'Prof', label: 'Prof' }] },
      { key: 'first', label: 'First name', sublabel: 'First', placeholder: 'First name', flex: 1, required: true },
      { key: 'middle', label: 'Middle name', sublabel: 'Middle', placeholder: 'Middle', width: '90px' },
      { key: 'last', label: 'Last name', sublabel: 'Last', placeholder: 'Last name', flex: 1, required: true },
      { key: 'suffix', label: 'Suffix', sublabel: 'Suffix', placeholder: 'Jr / Sr / III', width: '90px', type: 'select', options: [{ value: '', label: 'Suffix' }, { value: 'Jr', label: 'Jr' }, { value: 'Sr', label: 'Sr' }, { value: 'II', label: 'II' }, { value: 'III', label: 'III' }] },
    ],
    combine: (v) => [v.prefix, v.first, v.middle, v.last, v.suffix].filter(Boolean).join(' '),
  },
  // [Composite v1.4] Date of birth (D/M/Y selects). The year part enforces numeric
  // bounds so authors can cap min/max birth years; validation.ts also supports minAge/maxAge.
  dob: {
    parts: (() => {
      const thisYear = new Date().getFullYear();
      const years: Array<{ value: string; label: string }> = [{ value: '', label: 'Year' }];
      for (let y = thisYear; y >= thisYear - 120; y--) years.push({ value: String(y), label: String(y) });
      const days: Array<{ value: string; label: string }> = [{ value: '', label: 'Day' }];
      for (let d = 1; d <= 31; d++) days.push({ value: String(d), label: String(d) });
      const months: Array<{ value: string; label: string }> = [
        { value: '', label: 'Month' },
        { value: '1', label: 'January' }, { value: '2', label: 'February' },
        { value: '3', label: 'March' }, { value: '4', label: 'April' },
        { value: '5', label: 'May' }, { value: '6', label: 'June' },
        { value: '7', label: 'July' }, { value: '8', label: 'August' },
        { value: '9', label: 'September' }, { value: '10', label: 'October' },
        { value: '11', label: 'November' }, { value: '12', label: 'December' },
      ];
      return [
        { key: 'day', label: 'Day', sublabel: 'Day', placeholder: 'Day', width: '80px', type: 'select', options: days, sep: '/' },
        { key: 'month', label: 'Month', sublabel: 'Month', placeholder: 'Month', width: '120px', type: 'select', options: months, sep: '/' },
        { key: 'year', label: 'Year', sublabel: 'Year', placeholder: 'Year', width: '100px', type: 'select', options: years, dateAge: true, minAge: 0, maxAge: 120 },
      ];
    })(),
    combine: (v) => {
      const d = v.day, m = v.month, y = v.year;
      if (d && m && y) return `${y}-${('0' + m).slice(-2)}-${('0' + d).slice(-2)}`;
      return [d, m, y].filter(Boolean).join('/');
    },
  },
  // [Composite v1.4] Time (hh:mm AM/PM).
  time: {
    parts: [
      { key: 'hour', label: 'Hour', sublabel: 'Hour', placeholder: 'HH', width: '80px', type: 'select', options: [{ value: '', label: 'Hour' }].concat(Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))), sep: ':' },
      { key: 'minute', label: 'Minute', sublabel: 'Minute', placeholder: 'MM', width: '80px', type: 'select', options: [{ value: '', label: 'Minute' }].concat(Array.from({ length: 60 }, (_, i) => ({ value: ('0' + i).slice(-2), label: ('0' + i).slice(-2) }))) },
      { key: 'ampm', label: 'AM/PM', sublabel: 'AM/PM', placeholder: 'AM/PM', width: '80px', type: 'select', options: [{ value: '', label: 'AM/PM' }, { value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }] },
    ],
    combine: (v) => {
      if (v.hour && v.minute && v.ampm) return `${v.hour}:${v.minute} ${v.ampm}`;
      return [v.hour, v.minute, v.ampm].filter(Boolean).join(' ');
    },
  },
  // [Composite v1.4] Confirm Email — primary + confirm with cross-part match validation.
  email_confirm: {
    parts: [
      { key: 'email', label: 'Email', sublabel: 'Email', placeholder: 'Email', flex: 1, type: 'email', required: true },
      { key: 'email_confirm', label: 'Confirm Email', sublabel: 'Confirm', placeholder: 'Confirm email', flex: 1, type: 'email', required: true, matchKey: 'email', matchMsg: 'Emails do not match' },
    ],
    combine: (v) => v.email || '',
  },
  // [Composite v1.4] Confirm Password — primary + confirm with cross-part match validation.
  password_confirm: {
    parts: [
      { key: 'password', label: 'Password', sublabel: 'Password', placeholder: 'Password', flex: 1, type: 'password', required: true },
      { key: 'password_confirm', label: 'Confirm Password', sublabel: 'Confirm', placeholder: 'Confirm password', flex: 1, type: 'password', required: true, matchKey: 'password', matchMsg: 'Passwords do not match' },
    ],
    combine: (v) => v.password || '',
  },

  // ── [Composite Registry v20260616] NEW data-driven field-group widgets (Layout tab) ──
  //    Each is still ONE Composite control (one combined value); metadata + palette tile
  //    live in COMPOSITE_PRESET_META below. Add a preset = one entry here + one META row.
  // Date range — start + end date → "start → end".
  date_range: {
    parts: [
      { key: 'start', label: 'Start date', sublabel: 'Start', placeholder: 'Start', flex: 1, type: 'date', required: true },
      { key: 'end', label: 'End date', sublabel: 'End', placeholder: 'End', flex: 1, type: 'date', required: true },
    ],
    combine: (v) => [v.start, v.end].filter(Boolean).join(' → '),
  },
  // Money — currency select + amount number → "USD 100".
  money: {
    parts: [
      { key: 'currency', label: 'Currency', sublabel: 'Currency', placeholder: 'Currency', width: '120px', type: 'select', def: 'USD', options: [
        { value: 'USD', label: 'USD ($)' }, { value: 'EUR', label: 'EUR (€)' }, { value: 'GBP', label: 'GBP (£)' },
        { value: 'JPY', label: 'JPY (¥)' }, { value: 'VND', label: 'VND (₫)' }, { value: 'AUD', label: 'AUD ($)' },
        { value: 'CAD', label: 'CAD ($)' }, { value: 'CNY', label: 'CNY (¥)' }, { value: 'INR', label: 'INR (₹)' },
      ] },
      { key: 'amount', label: 'Amount', sublabel: 'Amount', placeholder: '0.00', flex: 1, type: 'number', min: 0, required: true },
    ],
    combine: (v) => [v.currency, v.amount].filter((x) => x !== '' && x != null).join(' '),
  },
  // Measurement — value number + unit select → "5 kg".
  measurement: {
    parts: [
      { key: 'amount', label: 'Value', sublabel: 'Value', placeholder: '0', flex: 1, type: 'number', required: true },
      { key: 'unit', label: 'Unit', sublabel: 'Unit', placeholder: 'Unit', width: '120px', type: 'select', def: 'kg', options: [
        { value: 'kg', label: 'kg' }, { value: 'g', label: 'g' }, { value: 'lb', label: 'lb' }, { value: 'oz', label: 'oz' },
        { value: 'm', label: 'm' }, { value: 'cm', label: 'cm' }, { value: 'mm', label: 'mm' }, { value: 'ft', label: 'ft' },
        { value: 'in', label: 'in' }, { value: 'L', label: 'L' }, { value: 'ml', label: 'ml' },
      ] },
    ],
    combine: (v) => [v.amount, v.unit].filter((x) => x !== '' && x != null).join(' '),
  },
  // Price range — min + max number → "100 - 500".
  price_range: {
    parts: [
      { key: 'min', label: 'Minimum', sublabel: 'Min', placeholder: 'Min', flex: 1, type: 'number', min: 0 },
      { key: 'max', label: 'Maximum', sublabel: 'Max', placeholder: 'Max', flex: 1, type: 'number', min: 0 },
    ],
    combine: (v) => (v.min || v.max) ? [v.min || '?', v.max || '?'].join(' - ') : '',
  },
  // Contact block — name + email + phone → "name · email · phone".
  full_contact: {
    parts: [
      { key: 'name', label: 'Full name', sublabel: 'Name', placeholder: 'Full name', flex: 1, required: true },
      { key: 'email', label: 'Email', sublabel: 'Email', placeholder: 'Email', flex: 1, type: 'email', required: true },
      { key: 'phone', label: 'Phone', sublabel: 'Phone', placeholder: 'Phone', flex: 1, type: 'tel' },
    ],
    combine: (v) => [v.name, v.email, v.phone].filter(Boolean).join(' · '),
  },

  // ── [Unify v2 2026-06-18] Single-part SCALAR presets ──────────────────────────────
  //    Short Text / Long Text / Email / Number / Website URL are now ALSO Composite
  //    fields (one preset each) so the whole text-input family shares ONE engine — while
  //    each keeps its own separate palette tile (see COMPOSITE_PRESET_META below).
  //    CRITICAL backward-compat: each is ONE part whose combine() returns the RAW scalar,
  //    so DataJson stores the exact same plain string a native Text/Email/Number/Url always
  //    did — zero value-shape change. The lone part inherits the field placeholder (and, for
  //    number, the field's numeric min/max) via compositePartsFor(). Format/length validation
  //    runs at field level (validation.ts effType) + server (FormValidationService case
  //    Composite by-preset). Legacy stored type:'Text'/'Email'/… keep their native paths.
  text:     { parts: [{ key: 'text',   flex: 1 }],                   combine: (v) => v.text || '' },
  textarea: { parts: [{ key: 'text',   flex: 1, type: 'textarea', rows: 4 } as any], combine: (v) => v.text || '' },
  email:    { parts: [{ key: 'email',  flex: 1, type: 'email' }],    combine: (v) => v.email || '' },
  number:   { parts: [{ key: 'number', flex: 1, type: 'number' }],   combine: (v) => v.number || '' },
  url:      { parts: [{ key: 'url',    flex: 1, type: 'url' }],      combine: (v) => v.url || '' },
};

// [Unify v2 2026-06-18] Presets whose Composite field is a single native scalar control —
// it renders, validates, indexes and anti-spam-scores exactly like its base type. Every
// type-keyed dispatcher (renderer / client-validate / builder-properties / server-validate /
// indexer / antispam) maps such a preset back to this base type. Keep in sync with the C#
// MegaForm.Core CompositePresetRegistry scalar map.
export const SCALAR_PRESET_BASETYPE: Record<string, 'Text' | 'Textarea' | 'Email' | 'Number' | 'Url'> = {
  text: 'Text', textarea: 'Textarea', email: 'Email', number: 'Number', url: 'Url',
};
/** '' if `preset` is not a single-part scalar preset, else its base field type. */
export function scalarPresetBaseType(preset?: string | null): string {
  return (preset && SCALAR_PRESET_BASETYPE[preset]) || '';
}

// ── [Composite Registry v20260616] Single source of preset METADATA ──────────────────
// Pairs with COMPOSITE_PRESETS (parts + combine). Drives everything DERIVED per preset:
// the palette tiles (builder field-plugins), the createFieldFromTemplate alias→preset
// rewrite (builder core), and BOTH preset <select> dropdowns (inline rail + designer
// modal). To add a preset: one COMPOSITE_PRESETS entry + one row here. Nothing else.
export interface CompositePresetMeta {
  label: string;            // field label + <select> option text (e.g. 'Phone Number')
  tileLabel?: string;       // palette tile label if it differs (e.g. 'Phone (parts)')
  alias: string;            // palette tile type, e.g. 'CompositePhone' → rewritten to {type:'Composite',preset}
  icon: string;             // FontAwesome class
  color: string;            // tile icon background
  category: 'basic' | 'layout' | 'widgets';
  sortOrder: number;
}
export const COMPOSITE_PRESET_META: Record<string, CompositePresetMeta> = {
  // Existing 9 — keep category 'basic' + exact current icons/colors/labels (no visual change).
  phone:            { label: 'Phone Number', tileLabel: 'Phone (parts)', alias: 'CompositePhone', icon: 'fa-phone', color: '#14b8a6', category: 'basic', sortOrder: 66 },
  name:             { label: 'Full Name', alias: 'CompositeName', icon: 'fa-user', color: '#6366f1', category: 'basic', sortOrder: 67 },
  name_plus:        { label: 'Full Name + Prefix/Suffix', tileLabel: 'Full Name +', alias: 'CompositeNamePlus', icon: 'fa-user-tag', color: '#6366f1', category: 'basic', sortOrder: 67.5 },
  address:          { label: 'Address', alias: 'CompositeAddress', icon: 'fa-map-marker-alt', color: '#f97316', category: 'layout', sortOrder: 79 },
  ssn:              { label: 'SSN', alias: 'CompositeSsn', icon: 'fa-id-card', color: '#ef4444', category: 'basic', sortOrder: 69 },
  dob:              { label: 'Date of Birth', alias: 'CompositeDob', icon: 'fa-birthday-cake', color: '#ec4899', category: 'basic', sortOrder: 70 },
  time:             { label: 'Time', alias: 'CompositeTime', icon: 'fa-clock', color: '#06b6d4', category: 'basic', sortOrder: 71 },
  email_confirm:    { label: 'Email + Confirm', alias: 'CompositeEmailConfirm', icon: 'fa-envelope', color: '#3b82f6', category: 'basic', sortOrder: 72 },
  password_confirm: { label: 'Password + Confirm', alias: 'CompositePasswordConfirm', icon: 'fa-lock', color: '#64748b', category: 'basic', sortOrder: 73 },
  // NEW field-group widgets — category 'layout' so they appear in the builder's Layout tab.
  date_range:       { label: 'Date Range', alias: 'CompositeDateRange', icon: 'fa-calendar-week', color: '#8b5cf6', category: 'layout', sortOrder: 80 },
  money:            { label: 'Money / Amount', alias: 'CompositeMoney', icon: 'fa-money-bill-wave', color: '#22c55e', category: 'layout', sortOrder: 81 },
  measurement:      { label: 'Measurement', alias: 'CompositeMeasurement', icon: 'fa-ruler-combined', color: '#0ea5e9', category: 'layout', sortOrder: 82 },
  price_range:      { label: 'Price Range', alias: 'CompositePriceRange', icon: 'fa-tags', color: '#f59e0b', category: 'layout', sortOrder: 83 },
  full_contact:     { label: 'Contact Block', alias: 'CompositeFullContact', icon: 'fa-address-card', color: '#6366f1', category: 'layout', sortOrder: 84 },
  // [Unify v2 2026-06-18] The text-input family — each a SEPARATE palette tile (same label/
  // icon/colour as the retired native plugins) but backed by one Composite engine. sortOrder
  // mirrors the old native order so the Basic tab looks unchanged. The native Text/Textarea/
  // Email/Number/Url plugins are flipped to category:'hidden' (still registered → legacy
  // type:'Text'… fields keep their native render + properties).
  text:     { label: 'Short Text',  alias: 'CompositeText',     icon: 'fa-font',       color: '#4a90d9', category: 'basic', sortOrder: 10 },
  textarea: { label: 'Long Text',   alias: 'CompositeTextarea', icon: 'fa-align-left', color: '#5ba85b', category: 'basic', sortOrder: 20 },
  email:    { label: 'Email',       alias: 'CompositeEmail',    icon: 'fa-envelope',   color: '#e67e22', category: 'basic', sortOrder: 30 },
  number:   { label: 'Number',      alias: 'CompositeNumber',   icon: 'fa-hashtag',    color: '#9b59b6', category: 'basic', sortOrder: 40 },
  url:      { label: 'Website URL', alias: 'CompositeUrl',      icon: 'fa-link',       color: '#2980b9', category: 'basic', sortOrder: 76 },
};

/** All preset keys in registry order. */
export function compositePresetKeys(): string[] { return Object.keys(COMPOSITE_PRESET_META); }
/** Field/select label for a preset key. */
export function compositePresetLabel(preset: string): string {
  return (COMPOSITE_PRESET_META[preset] && COMPOSITE_PRESET_META[preset].label) || preset;
}
/** Palette tile label (falls back to the field label). */
export function compositeTileLabel(preset: string): string {
  const m = COMPOSITE_PRESET_META[preset];
  return (m && (m.tileLabel || m.label)) || preset;
}
/** alias (palette tile type) → preset key, e.g. { CompositePhone: 'phone', … }. */
export function compositeAliasToPresetMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(COMPOSITE_PRESET_META)) out[COMPOSITE_PRESET_META[k].alias] = k;
  return out;
}

export function compositePartsFor(field: FormField): CompositePart[] {
  const wp: any = (field as any).widgetProps || {};
  if (wp.parts && wp.parts.length) return wp.parts;
  const preset = wp.preset || (field as any).preset || '';
  // Address is template-based: layout + sub-inputs come from the chosen scheme
  // (US/International/Canada/UK) unless the author has overridden `parts` above.
  if (preset === 'address') return addressPartsForScheme((wp.addressScheme || 'us') as AddressScheme) as CompositePart[];
  const base = (COMPOSITE_PRESETS[preset] && COMPOSITE_PRESETS[preset].parts) || [];
  // [Unify v2 2026-06-18] A single-part scalar preset (text/email/number/url/…) inherits the
  // field's OWN placeholder so a unified Short Text/Email/etc. shows the same placeholder a
  // native input would; the number preset also inherits the field's numeric min/max bounds.
  if (SCALAR_PRESET_BASETYPE[preset] && base.length === 1) {
    const part: any = Object.assign({}, base[0]);
    const ph = (field as any).placeholder;
    if (ph) part.placeholder = ph;
    const fv: any = (field as any).validation || {};
    if (preset === 'number') {
      if (fv.min != null && fv.min !== '') part.min = fv.min;
      if (fv.max != null && fv.max !== '') part.max = fv.max;
    }
    return [part as CompositePart];
  }
  return base;
}

// [Composite a11y] Each sub-input needs its OWN accessible name so a screen reader
// announces "Area code, Phone number, Extension" instead of three nameless boxes
// (WAI-ARIA composite-widget requirement). Order: author override (part.label) →
// known-key map → placeholder → humanized key. Kept here so inputs.ts (CSR markup)
// and any future SSR branch derive the identical name.
const COMPOSITE_PART_LABELS: Record<string, string> = {
  country: 'Country code', area: 'Area code', number: 'Phone number', ext: 'Extension',
  prefix: 'Prefix', first: 'First name', middle: 'Middle name', last: 'Last name', suffix: 'Suffix',
  street: 'Street address', street2: 'Apartment, suite, etc.', city: 'City',
  state: 'State / Province', zip: 'ZIP / Postal code', country_addr: 'Country',
  day: 'Day', month: 'Month', year: 'Year',
  hour: 'Hour', minute: 'Minute', ampm: 'AM/PM',
};
export function compositePartLabel(p: CompositePart): string {
  if (p && p.label) return p.label;
  if (p && p.sublabel) return p.sublabel;
  const k = (p && p.key) || '';
  if (k && COMPOSITE_PART_LABELS[k]) return COMPOSITE_PART_LABELS[k];
  if (p && p.placeholder) return p.placeholder;
  return k ? k.charAt(0).toUpperCase() + k.slice(1).replace(/[_-]+/g, ' ') : 'Field';
}

/** Calculate age in years from day/month/year values (all strings). Returns NaN if invalid. */
export function calculateAge(day: string, month: string, year: string): number {
  const d = Number(day), m = Number(month), y = Number(year);
  if (!d || !m || !y || Number.isNaN(d) || Number.isNaN(m) || Number.isNaN(y)) return NaN;
  const today = new Date();
  let age = today.getFullYear() - y;
  const mNow = today.getMonth() + 1;
  const dNow = today.getDate();
  if (m > mNow || (m === mNow && d > dNow)) age--;
  return age;
}

/** Replace {{form:*}} and {{content:*}} tokens inside every Html field's
 *  htmlContent. Run as a pre-render normalization step so the Html branch in
 *  inputs.ts can innerHTML the value as-is. */
function substituteHtmlFieldTokens(config: RendererConfig): void {
  if (!config.schema || !config.schema.fields) return;
  const s = config.schema as any;
  const settings = (s.settings || {}) as any;
  const customContent = (settings.customContent || {}) as Record<string, unknown>;
  const formTitle = String(config.title || '').trim();
  const formDescription = String(config.description || '').trim();
  const formSubmit = String(config.submitButtonText || 'Submit').trim();

  function htmlEsc(value: string): string {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function applyTokens(html: string): string {
    if (!html || html.indexOf('{{') === -1) return html;
    return String(html)
      .replace(/\{\{form:title\}\}/gi, htmlEsc(formTitle))
      .replace(/\{\{form:description\}\}/gi, htmlEsc(formDescription))
      .replace(/\{\{form:submit\}\}/gi, htmlEsc(formSubmit))
      .replace(/\{\{content:([a-zA-Z0-9_-]+)\}\}/g, (_m, key) => htmlEsc(String(customContent[key] ?? '')));
  }
  function visitField(f: any): void {
    if (!f) return;
    if ((f.type === 'Html' || f.Type === 'Html') && (f.htmlContent || f.HtmlContent)) {
      const next = applyTokens(String(f.htmlContent || f.HtmlContent || ''));
      f.htmlContent = next;
      if (f.HtmlContent !== undefined) f.HtmlContent = next;
    }
    const cols = f.columns || f.Columns;
    if (Array.isArray(cols)) {
      cols.forEach((col: any) => {
        const colFields = (col && (col.fields || col.Fields)) || [];
        if (Array.isArray(colFields)) colFields.forEach(visitField);
      });
    }
  }
  s.fields.forEach(visitField);
}
