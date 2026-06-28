/* ============================================================
   MegaForm — Built-in Field Plugins
   File: src/builder/field-plugins/_index.ts

   Đăng ký tất cả field có sẵn theo kiến trúc plugin mới.
   Mỗi plugin = 1 object, khai báo:
     - Danh tính (type, label, icon, color, category)
     - settingsGroups: group nào hiện trong settings panel
     - onSelect (optional): populate data từ field vào DOM
     - onBind   (optional): bind event listeners đặc biệt

   Để thêm field mới → thêm block ở đây (hoặc tách file riêng).
   Không cần sửa dom.ts / properties.ts / core.ts.
   ============================================================ */

import { FieldPlugins, FieldPlugin } from './_registry';
// Shared (renderer-authoritative) address-scheme layout, reused so the parts editor
// seeds the exact same sub-inputs the runtime renders.
import { addressPartsForScheme } from '../../renderer/composite-address';
// [Composite Registry v20260616] Single source of truth for composite presets — parts come
// from COMPOSITE_PRESETS, tiles + preset <select> come from COMPOSITE_PRESET_META. No more
// hand-maintained builder mirror (was MF_COMPOSITE_PRESETS, now dead).
import { COMPOSITE_PRESETS, COMPOSITE_PRESET_META, compositePresetKeys, compositePresetLabel } from '../../renderer/helpers';

function activeBuilderField(fallback: any): any {
  var B = (window as any).MegaFormBuilder;
  if (!B || !B.state) return fallback;
  var rr = B.state._rowFieldRef;
  if (rr) {
    var row = B.state.schema && B.state.schema.fields ? B.state.schema.fields[rr.rowIndex] : null;
    var child = row && row.columns && row.columns[rr.colIndex] && row.columns[rr.colIndex].fields
      ? row.columns[rr.colIndex].fields[rr.fieldIndex]
      : null;
    if (child) return child;
  }
  if (B.state.selectedFieldIndex >= 0 && B.state.schema && B.state.schema.fields) {
    return B.state.schema.fields[B.state.selectedFieldIndex] || fallback;
  }
  return fallback;
}

function markBuilderDirty(): void {
  var B = (window as any).MegaFormBuilder;
  if (B && B.state) B.state.isDirty = true;
  if (B && B.callModule) B.callModule('canvas', 'render');
}

function ensureProps(field: any): any {
  field.properties = field.properties || {};
  return field.properties;
}

function renderSelectVariantSettings(field: any, forcedVariant?: string): void {
  var group = document.getElementById('mf-prop-options-group') || document.getElementById('mf-prop-general-group');
  if (!group) return;
  var existing = document.getElementById('mf-prop-select-variant-wrap');
  if (existing) existing.remove();
  var f = activeBuilderField(field);
  var p = ensureProps(f);
  var current = forcedVariant || String(p.selectVariant || p.variant || 'native').toLowerCase();
  if (current === 'multiselect' || current === 'tags' || current === 'chips') current = 'multi-select';
  if (current === 'multicolumn' || current === 'combobox' || current === 'multi-column-combobox') current = 'multi-column';
  if (['native','multi-select','multi-column'].indexOf(current) < 0) current = 'native';
  var div = document.createElement('div');
  div.id = 'mf-prop-select-variant-wrap';
  div.className = 'form-group mt-2';
  div.innerHTML =
    '<label for="mf-prop-select-variant">Display variant</label>' +
    '<select id="mf-prop-select-variant" class="form-control form-control-sm"' + (forcedVariant ? ' disabled' : '') + '>' +
      '<option value="native">Native dropdown</option>' +
      '<option value="multi-select">MultiSelect chips</option>' +
      '<option value="multi-column">MultiColumnComboBox</option>' +
    '</select>' +
    '<small class="text-muted d-block mt-1">All variants use the same options/static SQL source and submit through the same field key.</small>' +
    '<div id="mf-prop-ms-settings" class="mt-2" style="display:none">' +
      '<label for="mf-prop-ms-max">Max selections</label>' +
      '<input id="mf-prop-ms-max" type="number" min="0" class="form-control form-control-sm" placeholder="0 = unlimited">' +
      '<label class="mt-2 d-block"><input id="mf-prop-ms-searchable" type="checkbox"> Searchable</label>' +
      '<label class="d-block"><input id="mf-prop-ms-clearable" type="checkbox"> Clear all button</label>' +
    '</div>' +
    '<div id="mf-prop-mccb-settings" class="mt-2" style="display:none">' +
      '<label for="mf-prop-mccb-columns">Columns</label>' +
      '<input id="mf-prop-mccb-columns" class="form-control form-control-sm" placeholder="label:Name:40%, value:Position:60%">' +
      '<small class="text-muted d-block mt-1">CSV shape: <code>key:Label:width</code>. SQL options can expose extra keys if server returns them.</small>' +
      '<label for="mf-prop-mccb-display" class="mt-2">Display key</label>' +
      '<input id="mf-prop-mccb-display" class="form-control form-control-sm" placeholder="label">' +
      '<label class="mt-2 d-block"><input id="mf-prop-mccb-searchable" type="checkbox"> Searchable</label>' +
    '</div>';
  group.insertBefore(div, group.children.length > 1 ? group.children[1] : null);
  var variantEl = document.getElementById('mf-prop-select-variant') as HTMLSelectElement | null;
  var maxEl = document.getElementById('mf-prop-ms-max') as HTMLInputElement | null;
  var msSearchEl = document.getElementById('mf-prop-ms-searchable') as HTMLInputElement | null;
  var msClearEl = document.getElementById('mf-prop-ms-clearable') as HTMLInputElement | null;
  var colsEl = document.getElementById('mf-prop-mccb-columns') as HTMLInputElement | null;
  var displayEl = document.getElementById('mf-prop-mccb-display') as HTMLInputElement | null;
  var mccbSearchEl = document.getElementById('mf-prop-mccb-searchable') as HTMLInputElement | null;
  if (variantEl) variantEl.value = current;
  if (maxEl) maxEl.value = String(p.maxTags || p.maxSelections || '');
  if (msSearchEl) msSearchEl.checked = p.searchable !== false;
  if (msClearEl) msClearEl.checked = p.clearable !== false;
  if (colsEl) colsEl.value = typeof p.columns === 'string' ? p.columns : (Array.isArray(p.columns) ? p.columns.map(function(c: any){ return [c.key, c.label || c.key, c.width || ''].filter(Boolean).join(':'); }).join(', ') : '');
  if (displayEl) displayEl.value = String(p.displayKey || 'label');
  if (mccbSearchEl) mccbSearchEl.checked = p.searchable !== false;
  var toggle = function() {
    var v = forcedVariant || (variantEl ? variantEl.value : 'native');
    var ms = document.getElementById('mf-prop-ms-settings') as HTMLElement | null;
    var mc = document.getElementById('mf-prop-mccb-settings') as HTMLElement | null;
    if (ms) ms.style.display = v === 'multi-select' ? '' : 'none';
    if (mc) mc.style.display = v === 'multi-column' ? '' : 'none';
  };
  var sync = function() {
    var target = activeBuilderField(field);
    var props = ensureProps(target);
    props.selectVariant = forcedVariant || (variantEl ? variantEl.value : 'native');
    if (target.type === 'MultiSelect') props.selectVariant = 'multi-select';
    if (maxEl) props.maxTags = maxEl.value ? parseInt(maxEl.value, 10) || 0 : 0;
    if (msSearchEl || mccbSearchEl) props.searchable = props.selectVariant === 'multi-column'
      ? !!(mccbSearchEl && mccbSearchEl.checked)
      : !!(msSearchEl && msSearchEl.checked);
    if (msClearEl) props.clearable = !!msClearEl.checked;
    if (colsEl) props.columns = colsEl.value || '';
    if (displayEl) props.displayKey = displayEl.value || 'label';
    toggle();
    markBuilderDirty();
  };
  toggle();
  [variantEl, msSearchEl, msClearEl, mccbSearchEl].forEach(function(el) { if (el) el.addEventListener('change', sync); });
  [maxEl, colsEl, displayEl].forEach(function(el) { if (el) el.addEventListener('input', sync); });
}

// ────────────────────────────────────────────────────────────────
//  BASIC FIELDS
// ────────────────────────────────────────────────────────────────

FieldPlugins.register({
  type: 'Text', label: 'Short Text',
  // [Unify v2 2026-06-18] Palette tile retired → now the Composite 'text' preset (separate
  // tile via COMPOSITE_PRESET_META, same label/icon). Plugin stays registered as 'hidden' so
  // legacy stored type:'Text' fields keep their native render + properties (backward compat).
  icon: 'fa-font', color: '#4a90d9', category: 'hidden', sortOrder: 10,
  settingsGroups: ['general', 'validation', 'condition'],
} as FieldPlugin);

FieldPlugins.register({
  type: 'Textarea', label: 'Long Text',
  // [Unify v2 2026-06-18] Retired tile → Composite 'textarea' preset; plugin kept hidden for legacy render/props.
  icon: 'fa-align-left', color: '#5ba85b', category: 'hidden', sortOrder: 20,
  settingsGroups: ['general', 'validation', 'condition'],
} as FieldPlugin);

FieldPlugins.register({
  type: 'Email', label: 'Email',
  // [Unify v2 2026-06-18] Retired tile → Composite 'email' preset; plugin kept hidden for legacy render/props.
  icon: 'fa-envelope', color: '#e67e22', category: 'hidden', sortOrder: 30,
  settingsGroups: ['general', 'validation', 'condition'],
} as FieldPlugin);

FieldPlugins.register({
  type: 'Number', label: 'Number',
  // [Unify v2 2026-06-18] Retired tile → Composite 'number' preset; plugin kept hidden for legacy render/props.
  icon: 'fa-hashtag', color: '#9b59b6', category: 'hidden', sortOrder: 40,
  settingsGroups: ['general', 'validation', 'condition'],
} as FieldPlugin);

FieldPlugins.register({
  type: 'Date', label: 'Date Picker',
  icon: 'fa-calendar-alt', color: '#e74c3c', category: 'basic', sortOrder: 50,
  settingsGroups: ['general', 'validation', 'condition'],
  onSelect: function(field: any) {
    var group = document.getElementById('mf-prop-general-group');
    if (!group) return;
    var existing = document.getElementById('mf-prop-date-variant-wrap');
    if (existing) existing.remove();
    var f = activeBuilderField(field);
    var p = ensureProps(f);
    // [v20260610-DatePickerOnlyCalendar] Segmented mode removed.
    var pickerVariant = 'calendar';
    var mode = String(p.datePickerMode || p.mode || 'date-only').toLowerCase();
    if (mode === 'datetime') mode = 'date-time';
    if (mode === 'monthyear') mode = 'month-year';
    if (['date-only','date-time','month-year'].indexOf(mode) < 0) mode = 'date-only';
    var div = document.createElement('div');
    div.id = 'mf-prop-date-variant-wrap';
    div.className = 'form-group mt-2';
    div.innerHTML =
      '<label>Date picker variant</label>' +
      '<div class="form-control form-control-sm" style="background:#f3f6fa;cursor:default;">Calendar grid</div>' +
      '<label for="mf-prop-date-picker-mode" class="mt-2">Date mode</label>' +
      '<select id="mf-prop-date-picker-mode" class="form-control form-control-sm">' +
        '<option value="date-only">Date only</option>' +
        '<option value="date-time">Date + time</option>' +
        '<option value="month-year">Month / year</option>' +
      '</select>' +
      '<div class="row mt-2" style="margin-left:-4px;margin-right:-4px">' +
        '<div class="col" style="padding-left:4px;padding-right:4px"><label for="mf-prop-date-clear-text">Clear text</label><input id="mf-prop-date-clear-text" class="form-control form-control-sm" placeholder="Clear"></div>' +
        '<div class="col" style="padding-left:4px;padding-right:4px"><label for="mf-prop-date-today-text">Today text</label><input id="mf-prop-date-today-text" class="form-control form-control-sm" placeholder="Today"></div>' +
        '<div class="col" style="padding-left:4px;padding-right:4px"><label for="mf-prop-date-apply-text">Apply text</label><input id="mf-prop-date-apply-text" class="form-control form-control-sm" placeholder="Apply"></div>' +
      '</div>';
    group.appendChild(div);
    var variantEl = document.getElementById('mf-prop-date-picker-variant') as HTMLSelectElement | null;
    var modeEl = document.getElementById('mf-prop-date-picker-mode') as HTMLSelectElement | null;
    var clearEl = document.getElementById('mf-prop-date-clear-text') as HTMLInputElement | null;
    var todayEl = document.getElementById('mf-prop-date-today-text') as HTMLInputElement | null;
    var applyEl = document.getElementById('mf-prop-date-apply-text') as HTMLInputElement | null;
    if (variantEl) variantEl.value = pickerVariant;
    if (modeEl) modeEl.value = mode;
    if (clearEl) clearEl.value = String(p.clearText || p.clearLabel || '');
    if (todayEl) todayEl.value = String(p.todayText || p.todayLabel || '');
    if (applyEl) applyEl.value = String(p.applyText || p.applyLabel || '');
    var sync = function() {
      var target = activeBuilderField(field);
      var props = ensureProps(target);
      props.pickerVariant = 'calendar';
      props.datePickerMode = modeEl ? modeEl.value : 'date-only';
      if (clearEl) props.clearText = clearEl.value || '';
      if (todayEl) props.todayText = todayEl.value || '';
      if (applyEl) props.applyText = applyEl.value || '';
      markBuilderDirty();
    };
    [variantEl, modeEl].forEach(function(el) { if (el) el.addEventListener('change', sync); });
    [clearEl, todayEl, applyEl].forEach(function(el) { if (el) el.addEventListener('input', sync); });
  },
} as FieldPlugin);

// [B65i] Basic "Phone" field plugin stays registered but hidden from the palette.
// The PhoneNumberPro widget has been retired; phone-with-country-flag now lives
// inside the Composite Phone preset. Legacy forms storing type:'Phone' still
// render fine because the field type and validators remain intact in renderer/Core.
FieldPlugins.register({
  type: 'Phone', label: 'Phone',
  icon: 'fa-phone', color: '#1abc9c', category: 'hidden', sortOrder: 9999,
  settingsGroups: ['general', 'validation', 'condition'],
} as FieldPlugin);

// ────────────────────────────────────────────────────────────────
//  COMPOSITE CONTROLS [v1] — one business field, several sub-inputs,
//  stored as ONE value. The 3 palette tiles below (CompositePhone/Name/
//  Address) are rewritten by core.ts createFieldFromTemplate() into a
//  single canonical type:'Composite' field + widgetProps.preset. The
//  hidden 'Composite' plugin owns the properties UI (preset + parts editor).
// ────────────────────────────────────────────────────────────────

function compositeEsc(s: any): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Builder-only mirror of the renderer COMPOSITE_PRESETS (src/renderer/helpers.ts),
// used ONLY to seed the parts editor. The renderer stays authoritative for
// untouched composites — no widgetProps.parts is written until the author edits.
var MF_COMPOSITE_DIAL_CODES = [
  { value: '+1', label: '+1 (US/CA)' }, { value: '+44', label: '+44 (UK)' }, { value: '+61', label: '+61 (AU)' },
  { value: '+33', label: '+33 (FR)' }, { value: '+49', label: '+49 (DE)' }, { value: '+34', label: '+34 (ES)' },
  { value: '+39', label: '+39 (IT)' }, { value: '+84', label: '+84 (VN)' }, { value: '+81', label: '+81 (JP)' },
  { value: '+82', label: '+82 (KR)' }, { value: '+86', label: '+86 (CN)' }, { value: '+91', label: '+91 (IN)' },
  { value: '+65', label: '+65 (SG)' }, { value: '+971', label: '+971 (AE)' }, { value: '+966', label: '+966 (SA)' },
  { value: '+55', label: '+55 (BR)' }
];
// [Composite Registry v20260616] ⚠️ DEAD literal — NO LONGER READ. compositeEffectiveParts
// below now derives parts from the single source COMPOSITE_PRESETS (renderer/helpers). Do
// NOT edit/extend this; add presets in helpers COMPOSITE_PRESETS + COMPOSITE_PRESET_META.
var MF_COMPOSITE_PRESETS: any = {
  phone: [
    // [Composite v1.4] Rich flag country-picker replaces plain dial-code <select>.
    { key: 'country', placeholder: '+1', width: '116px', def: '+1', type: 'country' },
    { key: 'area', placeholder: 'Area', width: '74px', maxLength: 4 },
    { key: 'number', placeholder: 'Phone number', flex: 1 },
    { key: 'ext', placeholder: 'Ext', width: '74px' }
  ],
  name: [
    { key: 'first', placeholder: 'First name', flex: 1 },
    { key: 'last', placeholder: 'Last name', flex: 1 }
  ],
  name_plus: (function () {
    return [
      { key: 'prefix', placeholder: 'Prefix', width: '90px', type: 'select', options: [{ value: '', label: '—' }, { value: 'Mr', label: 'Mr' }, { value: 'Mrs', label: 'Mrs' }, { value: 'Ms', label: 'Ms' }, { value: 'Dr', label: 'Dr' }, { value: 'Prof', label: 'Prof' }] },
      { key: 'first', placeholder: 'First name', flex: 1, required: true },
      { key: 'middle', placeholder: 'Middle', width: '90px' },
      { key: 'last', placeholder: 'Last name', flex: 1, required: true },
      { key: 'suffix', placeholder: 'Suffix', width: '90px', type: 'select', options: [{ value: '', label: '—' }, { value: 'Jr', label: 'Jr' }, { value: 'Sr', label: 'Sr' }, { value: 'II', label: 'II' }, { value: 'III', label: 'III' }] }
    ];
  })(),
  ssn: [
    { key: 'ssn', placeholder: '___-__-____', width: 'full', type: 'tel', mask: '###-##-####', maxLength: 11, inputMode: 'numeric', pattern: '^\\d{3}-\\d{2}-\\d{4}$', patternMsg: 'Enter a valid 9-digit SSN', required: true }
  ],
  dob: (function () {
    var thisYear = new Date().getFullYear();
    var years: any[] = [{ value: '', label: 'Year' }];
    for (var y = thisYear; y >= thisYear - 120; y--) years.push({ value: String(y), label: String(y) });
    var days: any[] = [{ value: '', label: 'Day' }];
    for (var d = 1; d <= 31; d++) days.push({ value: String(d), label: String(d) });
    var months: any[] = [
      { value: '', label: 'Month' },
      { value: '1', label: 'January' }, { value: '2', label: 'February' },
      { value: '3', label: 'March' }, { value: '4', label: 'April' },
      { value: '5', label: 'May' }, { value: '6', label: 'June' },
      { value: '7', label: 'July' }, { value: '8', label: 'August' },
      { value: '9', label: 'September' }, { value: '10', label: 'October' },
      { value: '11', label: 'November' }, { value: '12', label: 'December' }
    ];
    return [
      { key: 'day', placeholder: 'Day', width: '80px', type: 'select', options: days },
      { key: 'month', placeholder: 'Month', width: '110px', type: 'select', options: months },
      { key: 'year', placeholder: 'Year', width: '100px', type: 'select', options: years, dateAge: true, minAge: 0, maxAge: 120 }
    ];
  })(),
  time: [
    { key: 'hour', placeholder: 'Hour', width: '80px', type: 'select', options: [{ value: '', label: '—' }].concat(Array.from({ length: 12 }, function (_: any, i: number) { return { value: String(i + 1), label: String(i + 1) }; })) },
    { key: 'minute', placeholder: 'Minute', width: '80px', type: 'select', options: [{ value: '', label: '—' }].concat(Array.from({ length: 60 }, function (_: any, i: number) { return { value: ('0' + i).slice(-2), label: ('0' + i).slice(-2) }; })) },
    { key: 'ampm', placeholder: 'AM/PM', width: '80px', type: 'select', options: [{ value: '', label: '—' }, { value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }] }
  ],
  email_confirm: [
    { key: 'email', placeholder: 'Email', flex: 1, type: 'email', required: true },
    { key: 'email_confirm', placeholder: 'Confirm email', flex: 1, type: 'email', required: true, matchKey: 'email', matchMsg: 'Emails do not match' }
  ],
  password_confirm: [
    { key: 'password', placeholder: 'Password', flex: 1, type: 'password', required: true },
    { key: 'password_confirm', placeholder: 'Confirm password', flex: 1, type: 'password', required: true, matchKey: 'password', matchMsg: 'Passwords do not match' }
  ],
  address: [
    { key: 'street', placeholder: 'Street address', flex: 1 },
    { key: 'city', placeholder: 'City', width: '130px' },
    { key: 'state', placeholder: 'State', width: '72px', maxLength: 3 },
    { key: 'zip', placeholder: 'ZIP', width: '84px', maxLength: 10 }
  ]
};

function compositeEnsureWp(field: any): any {
  field.widgetProps = (field.widgetProps && typeof field.widgetProps === 'object') ? field.widgetProps : {};
  return field.widgetProps;
}
function compositeEffectiveParts(field: any): any[] {
  var wp = compositeEnsureWp(field);
  if (Array.isArray(wp.parts) && wp.parts.length) return wp.parts;
  var preset = String(wp.preset || 'name');
  if (preset === 'address') return addressPartsForScheme(wp.addressScheme || 'us').map(function (p: any) { return Object.assign({}, p); });
  // [Composite Registry v20260616] Single source: renderer/helpers COMPOSITE_PRESETS.
  var entry: any = (COMPOSITE_PRESETS as any)[preset] || (COMPOSITE_PRESETS as any).name;
  return ((entry && entry.parts) ? entry.parts : []).map(function (p: any) { return Object.assign({}, p); });
}

function compositeRenderEditor(field: any): void {
  var group = document.getElementById('mf-prop-general-group');
  if (!group) return;
  var existing = document.getElementById('mf-prop-composite-wrap');
  if (existing) existing.remove();
  var f = activeBuilderField(field);
  if (!f || f.type !== 'Composite') return;
  var wp = compositeEnsureWp(f);
  var preset = String(wp.preset || 'name');

  var div = document.createElement('div');
  div.id = 'mf-prop-composite-wrap';
  div.className = 'form-group mt-2';
  // [Composite v1.3] Inline rail = compact SUMMARY + a prominent launcher into the
  // full Composite Designer modal (the "cả hai" model: quick rail context + a rich,
  // shared-shell editor for everything else). Preset + Address-format stay inline
  // because they reshape the whole part set; per-part editing lives in the modal.
  div.innerHTML =
    '<label for="mf-prop-composite-preset">Input type</label>' +
    '<select id="mf-prop-composite-preset" class="form-control form-control-sm">' +
      // [Composite Registry v20260616] Options generated from the single source so new
      // presets (incl. Layout-tab field-groups) show up automatically.
      compositePresetKeys().map(function (k) { return '<option value="' + k + '">' + compositeEsc(compositePresetLabel(k)) + '</option>'; }).join('') +
    '</select>' +
    '<small class="text-muted d-block mt-1">One field shown as several sub-inputs, submitted as a single combined value.</small>' +
    // [Composite v1.2] Address is template-based: scheme picks sub-fields + layout.
    '<div id="mf-prop-address-scheme-wrap" class="mt-2" style="display:none;">' +
      '<label for="mf-prop-address-scheme" style="font-size:11px;color:#475569;">Address format</label>' +
      '<select id="mf-prop-address-scheme" class="form-control form-control-sm">' +
        '<option value="us">🇺🇸 United States</option>' +
        '<option value="intl">🌍 International</option>' +
        '<option value="canada">🇨🇦 Canada</option>' +
        '<option value="uk">🇬🇧 United Kingdom / Australia</option>' +
      '</select>' +
      '<small class="text-muted d-block mt-1">Swaps sub-fields, the State/Province control, ZIP/Postal label, and Country.</small>' +
    '</div>' +
    '<button type="button" id="mf-composite-open-designer" class="mf-builder-btn mt-2" style="width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;font-weight:600;">' +
      '<i class="fas fa-object-group"></i> Open Input Designer</button>' +
    '<div class="mt-2" style="font-weight:600;font-size:12px;color:#475569;display:flex;align-items:center;gap:6px;">Parts <span id="mf-composite-summary-count" style="font-weight:500;color:#94a3b8;"></span></div>' +
    '<div id="mf-composite-summary" style="display:flex;flex-direction:column;gap:5px;margin-top:4px;"></div>';
  group.appendChild(div);

  var presetEl = document.getElementById('mf-prop-composite-preset') as HTMLSelectElement | null;
  var VALID_PRESETS = compositePresetKeys();
  if (presetEl) presetEl.value = (VALID_PRESETS.indexOf(preset) >= 0 ? preset : 'name');
  var schemeWrap = document.getElementById('mf-prop-address-scheme-wrap');
  var schemeEl = document.getElementById('mf-prop-address-scheme') as HTMLSelectElement | null;
  function syncSchemeVisibility(): void {
    var cur = (activeBuilderField(field) || {}).widgetProps || {};
    var isAddr = String((presetEl && presetEl.value) || preset) === 'address';
    if (schemeWrap) schemeWrap.style.display = isAddr ? '' : 'none';
    if (schemeEl) schemeEl.value = (['us', 'intl', 'canada', 'uk'].indexOf(cur.addressScheme) >= 0 ? cur.addressScheme : 'us');
  }
  syncSchemeVisibility();

  // Compact, read-only per-part summary (pills). Full editing → the modal.
  function compositePillFor(p: any): string {
    var title = p.label || p.sublabel || (p.key ? (p.key.charAt(0).toUpperCase() + p.key.slice(1).replace(/[_-]+/g, ' ')) : 'Field');
    var w = '';
    if (p.flex) w = 'auto';
    else if (p.width) {
      var fr: any = { '1/6': 16, '1/5': 20, '1/4': 25, '1/3': 33, '2/5': 40, '1/2': 50, '3/5': 60, '2/3': 67, '3/4': 75, '4/5': 80, 'full': 100, '1/1': 100 };
      w = Object.prototype.hasOwnProperty.call(fr, String(p.width)) ? (fr[String(p.width)] + '%') : String(p.width);
    } else w = 'auto';
    return '<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:6px;background:' + (p.hidden ? '#f1f5f9' : '#f8fafc') + ';' + (p.hidden ? 'opacity:.6;' : '') + '">' +
      '<i class="fas ' + (p.hidden ? 'fa-eye-slash' : 'fa-eye') + '" style="font-size:10px;color:#94a3b8;"></i>' +
      '<span style="font-weight:600;font-size:12px;color:#334155;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + compositeEsc(title) + '</span>' +
      '<span style="font-size:10px;color:#64748b;background:#fff;border:1px solid #e2e8f0;border-radius:4px;padding:1px 5px;">' + compositeEsc(p.type || 'text') + '</span>' +
      '<span style="font-size:10px;color:#475569;background:#eef2ff;border-radius:4px;padding:1px 5px;">' + compositeEsc(w) + '</span>' +
      (p.required ? '<span style="font-size:10px;color:#4338ca;" title="Required"><i class="fas fa-asterisk"></i></span>' : '') +
    '</div>';
  }
  function buildSummary(): void {
    var host = document.getElementById('mf-composite-summary');
    if (!host) return;
    var cur = compositeEffectiveParts(activeBuilderField(field));
    var cnt = document.getElementById('mf-composite-summary-count');
    if (cnt) cnt.textContent = '(' + cur.length + ')';
    host.innerHTML = cur.map(compositePillFor).join('') ||
      '<div style="font-size:11px;color:#94a3b8;">No parts — open the designer to add some.</div>';
  }
  buildSummary();

  if (presetEl) presetEl.addEventListener('change', function () {
    var target = activeBuilderField(field);
    if (!target || target.type !== 'Composite') return;
    var twp = compositeEnsureWp(target);
    twp.preset = presetEl!.value;
    delete twp.parts;          // adopt the new preset's parts; author can re-customize
    twp.orient = (twp.preset === 'address' ? 'both' : 'horizontal');
    if (twp.preset === 'address' && !twp.addressScheme) twp.addressScheme = 'us';
    markBuilderDirty();
    syncSchemeVisibility();    // show the Address-format picker only for the address preset
    buildSummary();
  });
  if (schemeEl) schemeEl.addEventListener('change', function () {
    var target = activeBuilderField(field); if (!target || target.type !== 'Composite') return;
    var twp = compositeEnsureWp(target);
    twp.addressScheme = schemeEl!.value;
    delete twp.parts;          // adopt the scheme's parts; author can re-customize
    markBuilderDirty();
    buildSummary();
  });

  var openBtn = document.getElementById('mf-composite-open-designer');
  if (openBtn) openBtn.addEventListener('click', function () {
    var target = activeBuilderField(field);
    if (!target || target.type !== 'Composite') return;
    var cd: any = (window as any).MFCompositeDesigner;
    if (cd && typeof cd.open === 'function') {
      cd.open(target, function () {
        // designer closed → refresh inline summary + preset/scheme to match edits
        if (presetEl) presetEl.value = String((compositeEnsureWp(target).preset) || 'name');
        syncSchemeVisibility();
        buildSummary();
      });
    } else {
      var BB: any = (window as any).MegaFormBuilder;
      if (BB && BB.showToast) BB.showToast('Input Designer not loaded', 'error');
    }
  });
}

// [B172] Expose the composite parts resolver so the canvas builderPreview can
// render the REAL per-preset sub-input layout (phone country/area/number/ext,
// address rows, dob d/m/y …) instead of a generic "Composite Widget" box.
(window as any).MFCompositeParts = compositeEffectiveParts;

// [Unify v3 2026-06-18] The ONE visible "Composite" control. Owns properties for any
// type:'Composite' field AND is now a Basic-tab palette tile (was category:'hidden'):
// dropping it creates a Composite defaulting to the 'text' preset, and the Settings →
// "Composite preset" dropdown switches it to Email/Number/URL/Phone/Full Name/SSN/etc.
FieldPlugins.register({
  type: 'Composite', label: 'Input',
  icon: 'fa-object-group', color: '#10b981', category: 'basic', sortOrder: 5,
  // [Unify v2 2026-06-18] 'validation' added: field-level min/max length + pattern already
  // apply to the combined value at runtime (validation.ts) — for the scalar presets
  // (text/email/number/url) this restores the native Validation accordion.
  settingsGroups: ['general', 'validation', 'condition'],
  onSelect: function (field: any) { compositeRenderEditor(field); }
} as FieldPlugin);

// [Composite Registry v20260616] Palette tiles are generated from the single source
// COMPOSITE_PRESET_META (renderer/helpers): the existing 9 keep category 'basic', the new
// field-group widgets (date range, money, measurement, price range, contact block) use
// category 'layout' → they appear in the builder's LAYOUT tab. core.ts createFieldFromTemplate
// rewrites each tile (CompositePhone…) → a canonical { type:'Composite', widgetProps.preset }.
// [Unify v3 2026-06-18] The text-input family + the simple part-presets are folded
// behind the SINGLE visible "Composite" tile (below): drop it, then pick the type in
// the Settings → "Composite preset" dropdown. These preset tiles are flipped to
// category:'hidden' so they no longer clutter the palette — they STAY registered
// (legacy CompositePhone… fields keep mapping) and STAY in COMPOSITE_PRESET_META so the
// preset dropdown still offers every type. Kept visible: dob/time/email_confirm/
// password_confirm (basic) + address + field-group widgets (layout).
var UNIFY_HIDDEN_TILES: Record<string, number> = {
  text: 1, textarea: 1, email: 1, number: 1, url: 1, phone: 1, name: 1, name_plus: 1, ssn: 1,
};
Object.keys(COMPOSITE_PRESET_META).forEach(function (preset) {
  var m: any = (COMPOSITE_PRESET_META as any)[preset];
  FieldPlugins.register({
    type: m.alias, label: m.tileLabel || m.label,
    icon: m.icon, color: m.color,
    category: UNIFY_HIDDEN_TILES[preset] ? 'hidden' : m.category,
    sortOrder: m.sortOrder,
  } as FieldPlugin);
});

// [B65r] Terms & Privacy compliance widget — checkbox with linked Terms of
// Service + Privacy Policy text + optional marketing opt-in. Stores consent
// JSON (consent boolean + version tag + ISO timestamp + label text) so audit
// trails can prove what the user agreed to.
FieldPlugins.register({
  type: 'TermsPrivacy', label: 'Terms & Privacy',
  icon: 'fa-shield-alt', color: '#0ea5e9', category: 'widgets', sortOrder: 95,
  // [B65z-1] Consent widget — required-checkbox toggle, not text length.
  settingsGroups: ['general', 'widgetProps', 'condition'],
} as FieldPlugin);

FieldPlugins.register({
  type: 'Select', label: 'Dropdown',
  icon: 'fa-caret-square-down', color: '#3498db', category: 'basic', sortOrder: 60,
  hasOptions: true,
  settingsGroups: ['general', 'options', 'condition'],
  onSelect: function(field: any) {
    renderSelectVariantSettings(field);
  },
} as FieldPlugin);

FieldPlugins.register({
  type: 'MultiSelect', label: 'MultiSelect',
  icon: 'fa-tags', color: '#2563eb', category: 'basic', sortOrder: 62,
  hasOptions: true,
  settingsGroups: ['general', 'options', 'condition'],
  onSelect: function(field: any) {
    renderSelectVariantSettings(field, 'multi-select');
  },
} as FieldPlugin);

FieldPlugins.register({
  type: 'Radio', label: 'Single Choice',
  icon: 'fa-dot-circle', color: '#f39c12', category: 'basic', sortOrder: 65,
  hasOptions: true,
  settingsGroups: ['general', 'options', 'condition'],
} as FieldPlugin);

FieldPlugins.register({
  type: 'Checkbox', label: 'Multiple Choice',
  icon: 'fa-check-square', color: '#27ae60', category: 'basic', sortOrder: 70,
  hasOptions: true,
  settingsGroups: ['general', 'options', 'condition'],
} as FieldPlugin);

// [Chips/Cards 2026-06-28] Dedicated chip + selectable-card option controls, split out from
// Radio/Checkbox so authors get a one-click control instead of a hidden display variant.
// Chips = multi-select pills; Cards = single-select tiles. Rendering forces the chips/cards
// skin by type (inputs.ts + FormHtmlRenderer.cs), reusing .mf-option-group--chips/--cards so
// they inherit the premium chip/card look from megaform.css and every premium template.
FieldPlugins.register({
  type: 'Chips', label: 'Chips',
  icon: 'fa-tags', color: '#8b5cf6', category: 'basic', sortOrder: 71,
  hasOptions: true,
  settingsGroups: ['general', 'options', 'condition'],
} as FieldPlugin);

FieldPlugins.register({
  type: 'Cards', label: 'Choice Cards',
  icon: 'fa-grip', color: '#0ea5e9', category: 'basic', sortOrder: 72,
  hasOptions: true,
  settingsGroups: ['general', 'options', 'condition'],
} as FieldPlugin);

FieldPlugins.register({
  type: 'File', label: 'File Upload',
  icon: 'fa-paperclip', color: '#e74c3c', category: 'basic', sortOrder: 75,
  settingsGroups: ['general', 'file', 'condition'],
} as FieldPlugin);

FieldPlugins.register({
  type: 'Url', label: 'Website',
  // [Unify v2 2026-06-18] Retired tile → Composite 'url' preset; plugin kept hidden for legacy render/props.
  icon: 'fa-link', color: '#2980b9', category: 'hidden', sortOrder: 77,
  settingsGroups: ['general', 'validation', 'condition'],
} as FieldPlugin);

FieldPlugins.register({
  type: 'Rating', label: 'Rating',
  icon: 'fa-star', color: '#f1c40f', category: 'basic', sortOrder: 78,
  settingsGroups: ['general', 'condition'],
  onSelect: function(field: any, _container: HTMLElement) {
    var group = document.getElementById('mf-prop-general-group');
    if (!group) return;
    var existing = document.getElementById('mf-prop-rating-style-wrap');
    if (existing) existing.remove();
    var wp = field.widgetProps || (field.widgetProps = {});
    var current = String(wp.ratingStyle || 'star').toLowerCase();
    if (['star','emoji','heart','thumbs'].indexOf(current) < 0) current = 'star';
    var div = document.createElement('div');
    div.id = 'mf-prop-rating-style-wrap';
    div.className = 'form-group mt-2';
    div.innerHTML =
      '<label for="mf-prop-rating-style">Rating style</label>' +
      '<select id="mf-prop-rating-style" class="form-control form-control-sm">' +
        '<option value="star">Star Rating</option>' +
        '<option value="emoji">Emoji Rating</option>' +
        '<option value="heart">Heart Rating</option>' +
        '<option value="thumbs">Thumbs Rating</option>' +
      '</select>' +
      '<small class="text-muted d-block mt-1">Matches the refreshed Rating Controls mock.</small>';
    group.appendChild(div);
    var sel = document.getElementById('mf-prop-rating-style') as HTMLSelectElement | null;
    if (!sel) return;
    sel.value = current;
    sel.addEventListener('change', function() {
      var B = (window as any).MegaFormBuilder;
      var f = B && B.state && B.state.selectedFieldIndex >= 0 ? B.state.schema.fields[B.state.selectedFieldIndex] : field;
      if (!f.widgetProps) f.widgetProps = {};
      f.widgetProps.ratingStyle = sel.value || 'star';
      if (B && B.state) B.state.isDirty = true;
      if (B && B.callModule) B.callModule('canvas', 'render');
    });
  },
} as FieldPlugin);

FieldPlugins.register({
  type: 'Signature', label: 'Signature',
  icon: 'fa-signature', color: '#8e44ad', category: 'basic', sortOrder: 80,
  settingsGroups: ['general', 'condition'],
} as FieldPlugin);

FieldPlugins.register({
  type: 'RichText', label: 'Rich Text',
  icon: 'fa-align-left', color: '#0891b2', category: 'basic', sortOrder: 82,
  settingsGroups: ['general', 'condition'],
} as FieldPlugin);

// ── UniqueId — có onSelect và onBind đặc biệt ─────────────────
FieldPlugins.register({
  type: 'UniqueId', label: 'Unique ID',
  icon: 'fa-fingerprint', color: '#16a085', category: 'basic', sortOrder: 85,
  settingsGroups: ['uniqueid', 'condition'],

  onSelect: function(field: any, container: HTMLElement) {
    var wp = field.widgetProps || {};
    var set = function(id: string, val: any) {
      var el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.value = String(val);
    };
    set('mf-prop-uid-prefix',  wp.prefix     || '');
    set('mf-prop-uid-padding', wp.padding    || 5);
    set('mf-prop-uid-start',   wp.startValue || 1);
    set('mf-prop-uid-suffix',  wp.suffixType || 'none');
    updateUidPreview(wp);
  },

  onBind: function(field: any, _container: HTMLElement, onChange: () => void) {
    var ids = ['mf-prop-uid-prefix','mf-prop-uid-padding','mf-prop-uid-start','mf-prop-uid-suffix'];
    ids.forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      var handler = function(this: HTMLInputElement) {
        var B = (window as any).MegaFormBuilder;
        if (!B || B.state.selectedFieldIndex < 0) return;
        var f = B.state.schema.fields[B.state.selectedFieldIndex];
        if (f.type !== 'UniqueId') return;
        if (!f.widgetProps) f.widgetProps = {};
        f.widgetProps.prefix     = (document.getElementById('mf-prop-uid-prefix')  as HTMLInputElement)?.value || '';
        f.widgetProps.padding    = parseInt((document.getElementById('mf-prop-uid-padding') as HTMLInputElement)?.value) || 5;
        f.widgetProps.startValue = parseInt((document.getElementById('mf-prop-uid-start')   as HTMLInputElement)?.value) || 1;
        f.widgetProps.suffixType = (document.getElementById('mf-prop-uid-suffix')  as HTMLInputElement)?.value || 'none';
        updateUidPreview(f.widgetProps);
        B.state.isDirty = true;
        onChange();
      };
      el.addEventListener('change', handler);
      if (id === 'mf-prop-uid-prefix') el.addEventListener('input', handler);
    });
  },
} as FieldPlugin);

FieldPlugins.register({
  type: 'Captcha', label: 'CAPTCHA',
  icon: 'fa-shield-alt', color: '#7f8c8d', category: 'basic', sortOrder: 90,
  settingsGroups: ['general', 'condition'],
} as FieldPlugin);

// [B54] MultiColumnCombo — standalone widget version of the multi-column
// dropdown. Distinct from the Select `selectVariant=multi-column` flow so
// the same widget can be used SQL-backed without forcing a Select base.
FieldPlugins.register({
  type: 'MultiColumnCombo', label: 'Multi-Column Combo',
  icon: 'fa-table', color: '#0ea5e9', category: 'basic', sortOrder: 92,
  settingsGroups: ['general', 'condition'],
} as FieldPlugin);

// ────────────────────────────────────────────────────────────────
//  LAYOUT FIELDS
// ────────────────────────────────────────────────────────────────

FieldPlugins.register({
  type: 'Row', label: 'Row / Columns',
  icon: 'fa-columns', color: '#6366f1', category: 'layout', sortOrder: 10,
  settingsGroups: [],   // Row không hiện group nào — giữ nguyên behaviour cũ

  // Row có custom palette item (giống cũ) — label localized [PaletteI18n v20260619]
  renderPaletteItem: function() {
    var B = (window as any).MegaFormBuilder;
    var lbl = B && B.getLocalizedControlLabel ? B.getLocalizedControlLabel('Row', 'Row / Columns') : 'Row / Columns';
    return (
      '<div class="mf-palette-item mf-palette-row-item" data-type="Row" title="' + String(lbl).replace(/"/g, '&quot;') + '">' +
        '<span class="mf-pi-icon" style="background:#6366f1"><i class="fas fa-columns"></i></span>' +
        '<span class="mf-pi-label">' + lbl + '</span>' +
      '</div>'
    );
  },
} as FieldPlugin);

// [FlexGrid P2 v20260601-B17] Drop a FlexGrid onto canvas → creates a
// 12-col CSS Grid container with 0 items. Admin uses the in-cell "+ Add"
// button to populate fields. Coexists with Row — legacy forms untouched.
FieldPlugins.register({
  type: 'FlexGrid', label: 'Flex Grid (12-col)',
  icon: 'fa-th', color: '#7c3aed', category: 'layout', sortOrder: 15,
  settingsGroups: [],
  renderPaletteItem: function() {
    var B = (window as any).MegaFormBuilder;
    var lbl = B && B.getLocalizedControlLabel ? B.getLocalizedControlLabel('FlexGrid', 'Flex Grid (12-col)') : 'Flex Grid (12-col)';
    return (
      '<div class="mf-palette-item mf-palette-flexgrid-item" data-type="FlexGrid" title="' + String(lbl).replace(/"/g, '&quot;') + '">' +
        '<span class="mf-pi-icon" style="background:#7c3aed"><i class="fas fa-th"></i></span>' +
        '<span class="mf-pi-label">' + lbl + '</span>' +
      '</div>'
    );
  },
} as FieldPlugin);

FieldPlugins.register({
  type: 'Html', label: 'HTML Block',
  icon: 'fa-code', color: '#0f766e', category: 'layout', sortOrder: 20,
  settingsGroups: ['html', 'condition'],

  onSelect: function(field: any, _container: HTMLElement) {
    var el = document.getElementById('mf-prop-html-content') as HTMLTextAreaElement | null;
    if (el) el.value = field.htmlContent || field.label || '';
  },
} as FieldPlugin);

FieldPlugins.register({
  type: 'Section', label: 'Section Break',
  icon: 'fa-minus', color: '#475569', category: 'layout', sortOrder: 30,
  settingsGroups: ['html', 'pagebreak', 'condition'],

  onSelect: function(field: any, _container: HTMLElement) {
    var el = document.getElementById('mf-prop-html-content') as HTMLTextAreaElement | null;
    if (el) el.value = field.htmlContent || field.label || '';
    var pb = document.getElementById('mf-prop-pagebreak') as HTMLInputElement | null;
    if (pb) pb.checked = !!(field.properties && field.properties.pageBreak);
  },
} as FieldPlugin);

FieldPlugins.register({
  type: 'Hidden', label: 'Hidden Field',
  icon: 'fa-eye-slash', color: '#94a3b8', category: 'layout', sortOrder: 40,
  settingsGroups: ['general'],  // chỉ key + default value
} as FieldPlugin);

// ────────────────────────────────────────────────────────────────
//  PAYMENT WIDGETS
// ────────────────────────────────────────────────────────────────

FieldPlugins.register({
  type: 'StripePayment',
  label: 'Stripe Payment',
  icon: 'fa-credit-card',
  color: '#635bff',
  category: 'plugins',
  sortOrder: 200,
  settingsGroups: ['general'],
  builderPreview: function() {
    return '<div style="background:linear-gradient(135deg,#635bff,#0ea5e9);border-radius:10px;padding:14px 16px;color:#fff;font-size:13px;">' +
           '<div style="font-weight:700;font-size:14px;margin-bottom:4px;">💳 Stripe Payment</div>' +
           '<div style="opacity:.85;font-size:11px;">Secure card · Apple Pay · Link · Wallet</div>' +
           '<div style="margin-top:10px;background:rgba(255,255,255,.15);border-radius:6px;height:34px;display:flex;align-items:center;padding:0 10px;font-size:11px;opacity:.7;">Card number &nbsp; · · · · &nbsp; Exp &nbsp; CVV</div>' +
           '<div style="margin-top:8px;background:#fff;color:#635bff;border-radius:6px;height:32px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;">Pay now</div>' +
           '</div>';
  },
  onSelect: function(field: any, container: HTMLElement) {
    var wp = field.widgetProps || {};
    // Render settings UI into container
    container.innerHTML =
      '<div class="mf-widget-settings-group">' +
        '<h6><i class="fas fa-credit-card" style="color:#635bff"></i> Stripe Settings</h6>' +
        '<div class="form-group"><label class="small fw-bold">Publishable Key</label>' +
          '<input type="text" id="mf-stripe-pubkey" class="form-control form-control-sm" placeholder="pk_live_... or pk_test_..." value="' + _esc(wp.publishableKey || '') + '">' +
          '<small class="text-muted">Never use your secret key here</small></div>' +
        '<div class="form-group"><label class="small fw-bold">Currency</label>' +
          '<select id="mf-stripe-currency" class="form-control form-control-sm">' +
            _selOpts(['USD','EUR','GBP','AUD','CAD','SGD','VND','JPY'], wp.currency || 'USD') +
          '</select></div>' +
        '<div class="form-group"><label class="small fw-bold">Amount (smallest unit, e.g. cents)</label>' +
          '<input type="number" id="mf-stripe-amount" class="form-control form-control-sm" placeholder="1000 = $10.00" value="' + _esc(wp.amount || '') + '">' +
          '<small class="text-muted">Or use Amount Field Key below to read from another field</small></div>' +
        '<div class="form-group"><label class="small fw-bold">Amount Field Key</label>' +
          '<input type="text" id="mf-stripe-amount-field" class="form-control form-control-sm" placeholder="e.g. price_field" value="' + _esc(wp.amountFieldKey || '') + '">' +
        '</div>' +
        '<div class="form-group"><label class="small fw-bold">Button Text</label>' +
          '<input type="text" id="mf-stripe-btn" class="form-control form-control-sm" value="' + _esc(wp.buttonText || 'Pay now') + '"></div>' +
        '<div class="form-group"><label class="small fw-bold">Label</label>' +
          '<input type="text" id="mf-stripe-label" class="form-control form-control-sm" value="' + _esc(wp.label || 'Secure payment') + '"></div>' +
        '<div class="form-group"><label class="small fw-bold">Create Payment Intent URL</label>' +
          '<input type="text" id="mf-stripe-create-url" class="form-control form-control-sm" value="' + _esc(wp.createPaymentUrl || '/api/megaform/payments/stripe/create-intent') + '"></div>' +
        '<div class="form-group"><label class="small fw-bold">Confirm Payment URL</label>' +
          '<input type="text" id="mf-stripe-confirm-url" class="form-control form-control-sm" value="' + _esc(wp.confirmPaymentUrl || '/api/megaform/payments/stripe/confirm') + '"></div>' +
        '<div class="form-check mb-2">' +
          '<input type="checkbox" class="form-check-input" id="mf-stripe-require-paid" ' + (wp.requirePaidBeforeSubmit !== false ? 'checked' : '') + '>' +
          '<label class="form-check-label small" for="mf-stripe-require-paid">Require payment before form submit</label>' +
        '</div>' +
      '</div>';

    // Bind change events
    var inputs = ['mf-stripe-pubkey','mf-stripe-currency','mf-stripe-amount','mf-stripe-amount-field',
                  'mf-stripe-btn','mf-stripe-label','mf-stripe-create-url','mf-stripe-confirm-url'];
    var B = (window as any).MegaFormBuilder;
    var save = function() {
      if (!B || !B.state) return;
      var f = B.state.schema.fields[B.state.selectedFieldIndex];
      if (!f) return;
      if (!f.widgetProps) f.widgetProps = {};
      f.widgetProps.publishableKey    = (document.getElementById('mf-stripe-pubkey') as HTMLInputElement)?.value || '';
      f.widgetProps.currency          = (document.getElementById('mf-stripe-currency') as HTMLSelectElement)?.value || 'USD';
      f.widgetProps.amount            = parseInt((document.getElementById('mf-stripe-amount') as HTMLInputElement)?.value) || null;
      f.widgetProps.amountFieldKey    = (document.getElementById('mf-stripe-amount-field') as HTMLInputElement)?.value || '';
      f.widgetProps.buttonText        = (document.getElementById('mf-stripe-btn') as HTMLInputElement)?.value || 'Pay now';
      f.widgetProps.label             = (document.getElementById('mf-stripe-label') as HTMLInputElement)?.value || 'Secure payment';
      f.widgetProps.createPaymentUrl  = (document.getElementById('mf-stripe-create-url') as HTMLInputElement)?.value || '';
      f.widgetProps.confirmPaymentUrl = (document.getElementById('mf-stripe-confirm-url') as HTMLInputElement)?.value || '';
      f.widgetProps.requirePaidBeforeSubmit = !!(document.getElementById('mf-stripe-require-paid') as HTMLInputElement)?.checked;
      if (B.state) B.state.isDirty = true;
    };
    inputs.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', save);
    });
    var chk = document.getElementById('mf-stripe-require-paid');
    if (chk) chk.addEventListener('change', save);
  }
} as FieldPlugin);

FieldPlugins.register({
  type: 'PayPalPayment',
  label: 'PayPal Payment',
  icon: 'fa-paypal',
  color: '#003087',
  category: 'plugins',
  sortOrder: 210,
  settingsGroups: ['general'],
  builderPreview: function() {
    return '<div style="background:linear-gradient(135deg,#003087,#009cde);border-radius:10px;padding:14px 16px;color:#fff;font-size:13px;">' +
           '<div style="font-weight:700;font-size:14px;margin-bottom:4px;">🅿️ PayPal Payment</div>' +
           '<div style="opacity:.85;font-size:11px;">Pay with PayPal · Debit or Credit Card</div>' +
           '<div style="margin-top:10px;background:#ffc439;border-radius:6px;height:36px;display:flex;align-items:center;justify-content:center;">' +
             '<span style="font-weight:800;color:#003087;font-size:13px;letter-spacing:-.5px;">PayPal</span>' +
           '</div>' +
           '<div style="margin-top:6px;background:rgba(255,255,255,.2);border-radius:6px;height:32px;display:flex;align-items:center;justify-content:center;font-size:11px;">Debit or Credit Card</div>' +
           '</div>';
  },
  onSelect: function(field: any, container: HTMLElement) {
    var wp = field.widgetProps || {};
    container.innerHTML =
      '<div class="mf-widget-settings-group">' +
        '<h6><i class="fa-brands fa-paypal" style="color:#003087"></i> PayPal Settings</h6>' +
        '<div class="form-group"><label class="small fw-bold">Client ID</label>' +
          '<input type="text" id="mf-paypal-clientid" class="form-control form-control-sm" placeholder="PayPal Client ID (optional — falls back to dashboard setting)" value="' + _esc(wp.clientId || '') + '">' +
          '<small class="text-muted">Client ID only — never the secret</small></div>' +
        '<div class="form-group"><label class="small fw-bold">Amount</label>' +
          '<input type="number" min="0" step="0.01" id="mf-paypal-amount" class="form-control form-control-sm" value="' + _esc(wp.amount || '0.00') + '">' +
          '<small class="text-muted">Amount to charge for this PayPal button</small></div>' +
        '<div class="form-group"><label class="small fw-bold">Currency</label>' +
          '<select id="mf-paypal-currency" class="form-control form-control-sm">' +
            _selOpts(['USD','EUR','GBP','AUD','CAD','SGD','JPY'], wp.currency || 'USD') +
          '</select></div>' +
        '<div class="form-group"><label class="small fw-bold">Intent</label>' +
          '<select id="mf-paypal-intent" class="form-control form-control-sm">' +
            _selOpts(['CAPTURE','AUTHORIZE'], wp.intent || 'CAPTURE') +
          '</select></div>' +
        '<div class="form-group"><label class="small fw-bold">Label</label>' +
          '<input type="text" id="mf-paypal-label" class="form-control form-control-sm" value="' + _esc(wp.label || 'Pay with PayPal') + '"></div>' +
        '<div class="form-group"><label class="small fw-bold">Description (optional)</label>' +
          '<input type="text" id="mf-paypal-description" class="form-control form-control-sm" value="' + _esc(wp.description || '') + '"></div>' +
        '<div class="form-group"><label class="small fw-bold">Panel Style</label>' +
          '<select id="mf-paypal-style" class="form-control form-control-sm">' +
            _selOpts(['branded','minimal','dark'], wp.panelStyle || 'branded') +
          '</select></div>' +
        '<div class="form-group"><label class="small fw-bold">Create Order URL</label>' +
          '<input type="text" id="mf-paypal-create-url" class="form-control form-control-sm" value="' + _esc(wp.createOrderUrl || '/api/megaform/payments/paypal/create-order') + '"></div>' +
        '<div class="form-group"><label class="small fw-bold">Capture Order URL</label>' +
          '<input type="text" id="mf-paypal-capture-url" class="form-control form-control-sm" value="' + _esc(wp.captureOrderUrl || '/api/megaform/payments/paypal/capture-order') + '"></div>' +
        '<div class="form-check mb-2">' +
          '<input type="checkbox" class="form-check-input" id="mf-paypal-require-paid" ' + (wp.requirePaidBeforeSubmit !== false ? 'checked' : '') + '>' +
          '<label class="form-check-label small" for="mf-paypal-require-paid">Require payment before form submit</label>' +
        '</div>' +
      '</div>';

    var B = (window as any).MegaFormBuilder;
    var save = function() {
      if (!B || !B.state) return;
      var f = B.state.schema.fields[B.state.selectedFieldIndex];
      if (!f) return;
      if (!f.widgetProps) f.widgetProps = {};
      f.widgetProps.clientId            = (document.getElementById('mf-paypal-clientid') as HTMLInputElement)?.value || '';
      f.widgetProps.amount              = (document.getElementById('mf-paypal-amount') as HTMLInputElement)?.value || '0.00';
      f.widgetProps.currency            = (document.getElementById('mf-paypal-currency') as HTMLSelectElement)?.value || 'USD';
      f.widgetProps.intent              = (document.getElementById('mf-paypal-intent') as HTMLSelectElement)?.value || 'CAPTURE';
      f.widgetProps.label               = (document.getElementById('mf-paypal-label') as HTMLInputElement)?.value || 'Pay with PayPal';
      f.widgetProps.description         = (document.getElementById('mf-paypal-description') as HTMLInputElement)?.value || '';
      f.widgetProps.panelStyle          = (document.getElementById('mf-paypal-style') as HTMLSelectElement)?.value || 'branded';
      f.widgetProps.createOrderUrl      = (document.getElementById('mf-paypal-create-url') as HTMLInputElement)?.value || '';
      f.widgetProps.captureOrderUrl     = (document.getElementById('mf-paypal-capture-url') as HTMLInputElement)?.value || '';
      f.widgetProps.requirePaidBeforeSubmit = !!(document.getElementById('mf-paypal-require-paid') as HTMLInputElement)?.checked;
      if (B.state) B.state.isDirty = true;
    };
    ['mf-paypal-clientid','mf-paypal-amount','mf-paypal-currency','mf-paypal-intent','mf-paypal-label',
     'mf-paypal-description','mf-paypal-style','mf-paypal-create-url','mf-paypal-capture-url'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', save);
    });
    var chk = document.getElementById('mf-paypal-require-paid');
    if (chk) chk.addEventListener('change', save);
  }
} as FieldPlugin);

// ────────────────────────────────────────────────────────────────
//  HELPERS dùng trong payment plugins
// ────────────────────────────────────────────────────────────────
function _esc(v: any): string {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _selOpts(opts: string[], selected: string): string {
  return opts.map(function(o) {
    return '<option value="' + o + '"' + (o === selected ? ' selected' : '') + '>' + o + '</option>';
  }).join('');
}

// ────────────────────────────────────────────────────────────────
//  HELPER: UniqueId preview
// ────────────────────────────────────────────────────────────────
function updateUidPreview(wp: any) {
  var pad    = parseInt(wp.padding)    || 5;
  var start  = parseInt(wp.startValue) || 1;
  var suffix = wp.suffixType || 'none';
  var num    = start.toString();
  while (num.length < pad) num = '0' + num;
  var prev = wp.prefix || '';
  var d = new Date();
  if (suffix === 'year')      prev += d.getFullYear() + '-';
  else if (suffix === 'yearmonth') prev += d.getFullYear() + ('0' + (d.getMonth()+1)).slice(-2) + '-';
  else if (suffix === 'date') prev += d.getFullYear() + ('0' + (d.getMonth()+1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-';
  prev += num;
  if (suffix === 'random') prev += '-A7K2';
  var el = document.getElementById('mf-prop-uid-preview');
  if (el) el.textContent = prev;
}

// ────────────────────────────────────────────────────────────────
//  LOG
// ────────────────────────────────────────────────────────────────
var all = FieldPlugins.getAll();
console.log('[MFFieldPlugins] ' + all.length + ' plugins registered: ' +
  all.map(function(p) { return p.type; }).join(', '));

export {};
