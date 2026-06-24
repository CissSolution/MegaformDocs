import { MegaFormBuilder } from './core';

export const FIELD_SETTINGS_BADGE = 'Field settings v20260403-03';

export function getActiveField(currentField: any) {
  var B = MegaFormBuilder as any;
  if (currentField) return currentField;
  if (!B || !B.state || !B.state.schema || !Array.isArray(B.state.schema.fields)) return null;

  var idx = typeof B.state.selectedFieldIndex === 'number' ? B.state.selectedFieldIndex : -1;
  if (idx >= 0) return B.state.schema.fields[idx] || null;

  var rowRef = B.state._rowFieldRef || null;
  if (rowRef && typeof rowRef.rowIndex === 'number' && typeof rowRef.colIndex === 'number' && typeof rowRef.fieldIndex === 'number') {
    var row = B.state.schema.fields[rowRef.rowIndex];
    if (row && row.type === 'Row' && Array.isArray(row.columns)) {
      var col = row.columns[rowRef.colIndex];
      if (col && Array.isArray(col.fields)) return col.fields[rowRef.fieldIndex] || null;
    }
  }

  // [FlexGrid P2 v20260601-B17] Resolve nested FlexGrid items the same way.
  var fgRef = B.state._flexGridRef || null;
  if (fgRef && typeof fgRef.gridIndex === 'number' && typeof fgRef.itemIndex === 'number') {
    var grid = B.state.schema.fields[fgRef.gridIndex];
    if (grid && grid.type === 'FlexGrid' && Array.isArray(grid.items)) {
      var it = grid.items[fgRef.itemIndex];
      if (it && it.field) return it.field;
    }
  }

  return null;
}

export function hasActiveFieldSelection(currentField?: any) {
  return !!getActiveField(currentField || null);
}

function resolveSelectedWidgetBadge(field: any): string {
  try {
    var B = MegaFormBuilder as any;
    if (!field || !B || typeof MegaFormWidgets === 'undefined' || !MegaFormWidgets.getPlugin) return '';
    var plugin = MegaFormWidgets.getPlugin(field.type);
    if (!plugin) return '';
    var badge = '';
    if (plugin.badge) return String(plugin.badge);
    if (plugin.meta && plugin.meta.badge) return String(plugin.meta.badge);
    badge = B.extractVersionBadge ? B.extractVersionBadge(plugin.meta && plugin.meta.label ? plugin.meta.label : '') : '';
    if (badge) return badge;
    var props = Array.isArray(plugin.properties) ? plugin.properties : [];
    for (var i = 0; i < props.length; i++) {
      var candidate = B.extractVersionBadge ? B.extractVersionBadge(props[i] && props[i].label ? props[i].label : '') : '';
      if (candidate) return candidate;
    }
  } catch (_err) { }
  return '';
}

export function ensureFieldSettingsBadge(containerId?: string, currentField?: any) {
  var container = document.getElementById(containerId || 'mf-field-props');
  if (!container) return;
  var wrap = container.querySelector('.mf-field-settings-badge') as HTMLElement | null;
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'mf-field-settings-badge';
    wrap.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:10px 2px 0 2px;';
    container.appendChild(wrap);
  }
  wrap.innerHTML = '';
  function addBadge(text: string, muted?: boolean) {
    if (!text) return;
    var badge = document.createElement('span');
    badge.textContent = text;
    badge.style.cssText = 'display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:' + (muted ? '#eef2ff' : '#f1f5f9') + ';color:#64748b;font-size:11px;font-weight:700;letter-spacing:.02em;';
    wrap!.appendChild(badge);
  }
  addBadge(FIELD_SETTINGS_BADGE, false);
  var widgetBadge = resolveSelectedWidgetBadge(currentField || getActiveField(null));
  if (widgetBadge) addBadge(widgetBadge, true);
}


function parseOptionalNumber(value: any) {
  if (value === null || value === undefined) return null;
  var s = String(value).trim();
  if (!s) return null;
  var n = Number(s);
  return isFinite(n) ? n : null;
}

function parseOptionalInt(value: any) {
  if (value === null || value === undefined) return null;
  var s = String(value).trim();
  if (!s) return null;
  var n = parseInt(s, 10);
  return isFinite(n as any) ? n : null;
}

export function flushActiveFieldSettingsFromDom(currentField?: any) {
  var B = MegaFormBuilder as any;
  var field = getActiveField(currentField);
  if (!field || !B || !B.el) return;

  var val = function(id: string) {
    var el = B.el(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    return el ? el.value : '';
  };
  var checked = function(id: string) {
    var el = B.el(id) as HTMLInputElement | null;
    return !!(el && el.checked);
  };

  field.key = val('mf-prop-key') || field.key;
  field.label = val('mf-prop-label');
  field.placeholder = val('mf-prop-placeholder');
  field.helpText = val('mf-prop-helptext');
  field.defaultValue = val('mf-prop-default');
  field.cssClass = val('mf-prop-css');
  field.width = val('mf-prop-width') || field.width || '100%';
  field.required = checked('mf-prop-required');
  field.readOnly = checked('mf-prop-readonly');
  field.prefillParam = val('mf-prop-prefill');

  var optionCols = val('mf-prop-option-columns');
  if (field.type === 'Radio' || field.type === 'Checkbox') {
    var parsedCols = parseOptionalInt(optionCols);
    if (parsedCols && parsedCols > 0) field.optionColumns = parsedCols;
    else delete field.optionColumns;
  }

  var validation = field.validation || {};
  validation.minLength = parseOptionalInt(val('mf-prop-minlength'));
  validation.maxLength = parseOptionalInt(val('mf-prop-maxlength'));
  validation.min = parseOptionalNumber(val('mf-prop-min'));
  validation.max = parseOptionalNumber(val('mf-prop-max'));
  validation.pattern = (val('mf-prop-pattern') || '').trim() || null;
  validation.customMessage = (val('mf-prop-custom-msg') || '').trim() || null;

  var hasValidation = Object.keys(validation).some(function (k) { return validation[k] !== null && validation[k] !== undefined && validation[k] !== ''; });
  if (hasValidation) field.validation = validation;
  else delete field.validation;

  B.state.isDirty = true;
}
