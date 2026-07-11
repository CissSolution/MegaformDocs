// [2026-06-27 ①] Full field palette derived from the builder field-plugin registry.
// The wizard is a thin creation surface, so each entry produces a BUILDER-SAFE default
// MegaForm field (arrays/objects backfilled; the builder refines it after creation).
//
// Composite presets come straight from the registry's COMPOSITE_PRESET_META (the single
// source of truth — renderer/helpers), so the wizard palette never drifts from the builder.
// A Composite field is canonically { type:'Composite', widgetProps:{ preset } } — the parts
// (phone country/number, name first/last, address rows, dob d/m/y…) are derived at render.
import { COMPOSITE_PRESET_META } from '../../renderer/helpers';
import { defaultChipOptions, defaultCardOptions } from '@shared/choice-defaults';

// Canonical MegaForm field — backfill arrays/objects so the builder never .map()s undefined.
export function mfField(type: string, key: string, label: string, required: boolean, extra?: any): any {
  return Object.assign({
    key, type, label, required: !!required,
    placeholder: '', helpText: '', defaultValue: '', cssClass: '', width: '100%',
    readOnly: false, prefillParam: '', validation: {}, options: [], showIf: null,
    htmlContent: '', fileSettings: null, properties: {},
  }, extra || {});
}

function opts(): any[] {
  return ['Option 1', 'Option 2', 'Option 3'].map(o => ({ label: o, value: o.toLowerCase().replace(/\s+/g, '_') }));
}

export interface FieldDef {
  key: string; label: string; icon: string; group: string; curated: boolean;
  preview: string; // visual hint for preview.ts
  build: (key: string, label: string, required: boolean) => any;
}

// Which composite presets are common enough for the curated (default) palette.
const COMPOSITE_CURATED: Record<string, boolean> = { text: true, textarea: true, email: true, phone: true, number: true, name: true };
// Composite preview hint (most are scalar inputs; some render multi-part).
const COMPOSITE_PREVIEW: Record<string, string> = { textarea: 'textarea', name: 'name', name_plus: 'name', address: 'address', full_contact: 'name', date_range: 'date', dob: 'date', time: 'date' };
// Group composites: the scalar text family under 'text', the rest under 'composite'.
const COMPOSITE_TEXT_FAMILY: Record<string, boolean> = { text: true, textarea: true, email: true, number: true, url: true };

const compositeDefs: FieldDef[] = Object.keys(COMPOSITE_PRESET_META).map((preset) => {
  const m: any = (COMPOSITE_PRESET_META as any)[preset];
  return {
    key: preset, label: m.label, icon: m.icon,
    group: COMPOSITE_TEXT_FAMILY[preset] ? 'text' : 'composite',
    curated: !!COMPOSITE_CURATED[preset],
    preview: COMPOSITE_PREVIEW[preset] || 'input',
    build: (key: string, label: string, required: boolean) => mfField('Composite', key, label, required, { widgetProps: { preset } }),
  };
});

const otherDefs: FieldDef[] = [
  { key: 'select', label: 'Dropdown', icon: 'fa-caret-down', group: 'choice', curated: true, preview: 'choice', build: (k, l, r) => mfField('Select', k, l, r, { options: opts() }) },
  { key: 'multiselect', label: 'Multi-Select', icon: 'fa-list-check', group: 'choice', curated: false, preview: 'choice', build: (k, l, r) => mfField('Select', k, l, r, { options: opts(), widgetProps: { selectVariant: 'multi-select' } }) },
  { key: 'chips', label: 'Chips', icon: 'fa-tags', group: 'choice', curated: true, preview: 'chips', build: (k, l, r) => mfField('Chips', k, l, r, { options: defaultChipOptions() }) },
  { key: 'cards', label: 'Choice Cards', icon: 'fa-grip', group: 'choice', curated: true, preview: 'cards', build: (k, l, r) => mfField('Cards', k, l, r, { options: defaultCardOptions(), allowOptionHtml: true }) },
  { key: 'multicolumn', label: 'Multi-Column Combo', icon: 'fa-table-columns', group: 'choice', curated: false, preview: 'choice', build: (k, l, r) => mfField('Select', k, l, r, { options: opts(), widgetProps: { selectVariant: 'multi-column' } }) },
  { key: 'radio', label: 'Radio Group', icon: 'fa-circle-dot', group: 'choice', curated: true, preview: 'choice', build: (k, l, r) => mfField('Radio', k, l, r, { options: opts() }) },
  { key: 'checkbox', label: 'Checkbox', icon: 'fa-square-check', group: 'choice', curated: true, preview: 'checkbox', build: (k, l, r) => mfField('Checkbox', k, l, r, { options: opts() }) },
  { key: 'date', label: 'Date', icon: 'fa-calendar', group: 'datetime', curated: true, preview: 'date', build: (k, l, r) => mfField('Date', k, l, r) },
  { key: 'rating', label: 'Rating', icon: 'fa-star', group: 'advanced', curated: true, preview: 'rating', build: (k, l, r) => mfField('Rating', k, l, r, { properties: { ratingStyle: 'star', max: 5 } }) },
  { key: 'file', label: 'File Upload', icon: 'fa-paperclip', group: 'advanced', curated: true, preview: 'file', build: (k, l, r) => mfField('File', k, l, r, { fileSettings: { maxFiles: 1, maxSizeMb: 10, accept: '' } }) },
  { key: 'signature', label: 'Signature', icon: 'fa-signature', group: 'advanced', curated: false, preview: 'signature', build: (k, l, r) => mfField('Signature', k, l, r) },
  { key: 'richtext', label: 'Rich Text', icon: 'fa-paragraph', group: 'advanced', curated: false, preview: 'textarea', build: (k, l, r) => mfField('RichText', k, l, r) },
  { key: 'uniqueid', label: 'Unique ID', icon: 'fa-fingerprint', group: 'advanced', curated: false, preview: 'input', build: (k, l, r) => mfField('UniqueId', k, l, r, { properties: { prefix: '', pattern: '' } }) },
  { key: 'captcha', label: 'Captcha', icon: 'fa-shield-halved', group: 'advanced', curated: false, preview: 'input', build: (k, l, r) => mfField('Captcha', k, l, r) },
  { key: 'terms', label: 'Terms & Privacy', icon: 'fa-file-contract', group: 'advanced', curated: false, preview: 'checkbox', build: (k, l, r) => mfField('TermsPrivacy', k, l, r, { widgetProps: {} }) },
  // Layout
  { key: 'row', label: 'Row / 2 Columns', icon: 'fa-table-columns', group: 'layout', curated: true, preview: 'row', build: (k, l) => mfField('Row', k, l || 'Row', false, { columns: [{ span: 6, fields: [] }, { span: 6, fields: [] }] }) },
  { key: 'row3', label: '3 Columns', icon: 'fa-table-cells', group: 'layout', curated: false, preview: 'row3', build: (k, l) => mfField('Row', k, l || 'Columns', false, { columns: [{ span: 4, fields: [] }, { span: 4, fields: [] }, { span: 4, fields: [] }] }) },
  { key: 'card', label: 'Card Container', icon: 'fa-square-full', group: 'layout', curated: true, preview: 'card', build: (k, l) => mfField('Section', k, l || 'Card', false, { properties: { pageBreak: false, card: true } }) },
  { key: 'flexgrid', label: 'Flex Grid (12-col)', icon: 'fa-table-cells-large', group: 'layout', curated: false, preview: 'row3', build: (k, l) => mfField('FlexGrid', k, l || 'Grid', false, { columns: [], properties: { cols: 12 } }) },
  { key: 'section', label: 'Section / Page Break', icon: 'fa-grip-lines', group: 'layout', curated: false, preview: 'section', build: (k, l) => mfField('Section', k, l || 'Section', false, { properties: { pageBreak: false } }) },
  { key: 'heading', label: 'Heading / HTML', icon: 'fa-heading', group: 'layout', curated: false, preview: 'html', build: (k, l) => mfField('Html', k, l || 'Heading', false, { htmlContent: '<h3>' + (l || 'Heading') + '</h3>' }) },
  { key: 'hidden', label: 'Hidden Field', icon: 'fa-eye-slash', group: 'layout', curated: false, preview: 'input', build: (k, l) => mfField('Hidden', k, l, false, { defaultValue: '' }) },
  // Payment — emit the MODERN unified 'Payment' widget (+ provider) instead of the legacy
  // 'StripePayment'/'PayPalPayment' field types. Legacy types have no public-render widget
  // (the plugin only registers 'Payment') and no asset-manifest/autoload case → they render
  // as a blank/text fallback on the live form. 'Payment'+provider loads correctly end-to-end.
  { key: 'stripe', label: 'Stripe Payment', icon: 'fa-credit-card', group: 'payment', curated: false, preview: 'input', build: (k, l) => mfField('Payment', k, l || 'Payment', false, { widgetProps: { provider: 'stripe' } }) },
  { key: 'paypal', label: 'PayPal Payment', icon: 'fa-brands fa-paypal', group: 'payment', curated: false, preview: 'input', build: (k, l) => mfField('Payment', k, l || 'Payment', false, { widgetProps: { provider: 'paypal' } }) },
];

export const FIELD_CATALOG: FieldDef[] = compositeDefs.concat(otherDefs);

// Legacy / mini-template aliases → catalog keys.
const ALIAS: Record<string, string> = { fullname: 'name', dropdown: 'select' };
function resolveKey(key: string): string { return ALIAS[key] || key; }

const _byKey: Record<string, FieldDef> = {};
FIELD_CATALOG.forEach(d => { _byKey[d.key] = d; });

export function fieldDef(key: string): FieldDef | null { return _byKey[resolveKey(key)] || null; }
export function catalogLabel(key: string): string { const d = fieldDef(key); return d ? d.label : 'Field'; }
export function catalogIcon(key: string): string { const d = fieldDef(key); return d ? d.icon : 'fa-font'; }
export function catalogPreview(key: string): string { const d = fieldDef(key); return d ? d.preview : 'input'; }
export function curatedFields(): FieldDef[] { return FIELD_CATALOG.filter(d => d.curated); }

/** Build a BUILDER-SAFE MegaForm field for a palette key. Returns null for unknown keys. */
export function buildFieldFromCatalog(key: string, fieldKey: string, label: string, required: boolean): any | null {
  const d = fieldDef(key);
  return d ? d.build(fieldKey, label, required) : null;
}

// Ordered groups for the "more fields" expansion.
export const FIELD_GROUPS: Array<{ id: string; label: string }> = [
  { id: 'text', label: 'Text' },
  { id: 'composite', label: 'Contact & composite' },
  { id: 'choice', label: 'Choice' },
  { id: 'datetime', label: 'Date & time' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'layout', label: 'Layout' },
  { id: 'payment', label: 'Payment' },
];
export function fieldsInGroup(groupId: string): FieldDef[] { return FIELD_CATALOG.filter(d => d.group === groupId); }
